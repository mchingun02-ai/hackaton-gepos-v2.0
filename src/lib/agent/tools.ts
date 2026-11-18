/**
 * AI ажилтны хэрэгслүүд (tools) — нэг бүртгэл, гурван хэрэглэгч:
 *   1. Харилцагчтай ярьдаг AI (FB, вэб чат, дуудлага) — scope "customer"
 *   2. Захирлын тушаалыг гүйцэтгэдэг AI — scope "director"
 *   3. MCP сервер (/api/mcp) — гаднын AI клиент (Qwen-Agent, Cursor г.м)
 *
 * Бүх бичих үйлдэл Store Plus-ын core.ts-ээр (аудит логтой) серверийн SQLite дээр хийгдэнэ,
 * нээлттэй ПОС, портал, мерчантын апп руу шууд (SSE) түгнэ.
 *
 * ТУСГААРЛАЛТ (§3.7): хэрэгсэл бүр зөвхөн `ctx` (серверийн TenantContext)-ээр өгөгдөлд хүрнэ. Параметрт
 * merchant / tenant / РД талбар ХЭЗЭЭ Ч байхгүй (тест T6). Бараа, үлдэгдэл, борлуулалт — `ctx.pos` адаптераар.
 */
import { cancelOrder, createOrder, refundSale, setOrderStatus, toggleCampaign, upsertCampaign, type Actor } from "@/lib/sp/core";
import { CANCEL_LABEL, customerStats, METHOD_LABEL, money, orderState, startOfDay } from "@/lib/sp/logic";
import { spNow, withSp } from "@/lib/sp/server";
import type { CancelReason, ItemCampaign, Product, SpState } from "@/lib/sp/types";
import { pageOf, sendText } from "@/lib/fb/server";
import type { Capabilities, Capability } from "@/lib/pos/adapter";
import { norm, unitLabel, type CProduct, type CSale, type CStock } from "@/lib/pos/canonical";
import type { TenantContext } from "@/lib/tenant/context";
import { HttpError } from "@/lib/tenant/http";
import { addMessage, createTicket, listContacts, listTickets, openTicket, setConvStatus, updateContact, updateTicket, TICKET_KIND, type TicketKind } from "./crm";
import { addDoc, search } from "./kb";
import { getSettings } from "./settings";
import { INVENTORY_TOOLS } from "@/lib/inventory/tools";

export type Scope = "customer" | "director";
export type Risk = "read" | "write" | "confirm";

/** Хэрэгслийн контекст = түрээслэгчийн контекст + хэн, ямар суваг, аль яриа */
export type ToolCtx = TenantContext & {
  actor: Actor;
  scope: Scope | "mcp";
  convId?: string | null;
  contactId?: string | null;
  /** Туслахын хэрэгслийн дэд олонлог (§10, assistants/registry.ts) — байвал зөвхөн эдгээрийг ажиллуулна */
  allow?: ReadonlySet<string> | null;
};

export type ToolResult = { ok: boolean; summary: string; data?: unknown };

export type Tool = {
  name: string;
  /** UI-д харагдах монгол нэр */
  title: string;
  description: string;
  parameters: { type: "object"; properties: Record<string, unknown>; required?: string[] };
  scopes: Scope[];
  risk: Risk;
  /** ПОС-ын шаардлагатай боломж (адаптерт байхгүй бол хэрэгсэл харагдахгүй) */
  needs?: Capability[];
  run: (ctx: ToolCtx, args: Record<string, unknown>) => Promise<ToolResult> | ToolResult;
};

class ToolError extends Error {}
/** Хэрэгслийн аргументад tenant таних талбар орж ирвэл үл тооно (D4) */
const TENANT_ARG = /^(merchant|tenant|reg_?no)/i;
const str = (v: unknown, max = 500) => (typeof v === "string" ? v.trim().slice(0, max) : v == null ? "" : String(v).slice(0, max));
const num = (v: unknown) => (typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v.replace(/[^\d.-]/g, "")) : NaN);
const low = norm;

/** Барааг id эсвэл нэрээр олно. Олон таарвал алдаа + сонголтууд. */
function findProduct(s: SpState, ref: unknown): Product {
  const q = low(str(ref, 120));
  if (!q) throw new ToolError("Барааны нэр өгөөгүй");
  const byId = s.products.find((p) => p.id === q || p.barcode === q);
  if (byId) return byId;
  const exact = s.products.filter((p) => low(p.name) === q);
  if (exact.length === 1) return exact[0];
  const words = q.split(/\s+/).filter((w) => w.length > 1);
  const hits = s.products.filter((p) => {
    const n = low(p.name);
    return n.includes(q) || (words.length > 0 && words.every((w) => n.includes(w)));
  });
  if (hits.length === 1) return hits[0];
  if (!hits.length) throw new ToolError(`«${str(ref)}» нэртэй бараа олдсонгүй`);
  throw new ToolError(`«${str(ref)}» гэдэгт олон бараа таарч байна: ${hits.slice(0, 6).map((p) => p.name).join(", ")}. Аль нь вэ?`);
}

/** Каноник бараа + үлдэгдэл → AI-д харагдах мөр */
const productView = (p: CProduct, st?: CStock) => {
  const stock = st?.qty ?? 0;
  return {
    id: p.id,
    name: p.name,
    price: p.price,
    price_text: money(p.price),
    stock,
    unit: unitLabel(p),
    category: p.category ?? "",
    active: p.active,
    delivery: p.active && !!p.delivery && !p.deliveryStopped && stock > 0,
    low_stock: stock <= (st?.minQty ?? 0),
  };
};
const stockMap = async (ctx: ToolCtx, ids?: string[]) => new Map((await ctx.pos.stock(ids)).map((x) => [x.productId, x]));

/** Барааг id, баркод эсвэл нэрээр олно (адаптераас). Олон таарвал алдаа + сонголтууд. */
function findC(list: CProduct[], ref: unknown): CProduct {
  const q = low(str(ref, 120));
  if (!q) throw new ToolError("Барааны нэр өгөөгүй");
  const byId = list.find((p) => p.id === q || p.barcodes.includes(q));
  if (byId) return byId;
  const exact = list.filter((p) => low(p.name) === q);
  if (exact.length === 1) return exact[0];
  const words = q.split(/\s+/).filter((w) => w.length > 1);
  const hits = list.filter((p) => {
    const n = low(p.name);
    return n.includes(q) || (words.length > 0 && words.every((w) => n.includes(w)));
  });
  if (hits.length === 1) return hits[0];
  if (!hits.length) throw new ToolError(`«${str(ref)}» нэртэй бараа олдсонгүй`);
  throw new ToolError(`«${str(ref)}» гэдэгт олон бараа таарч байна: ${hits.slice(0, 6).map((p) => p.name).join(", ")}. Аль нь вэ?`);
}

/** Борлуулалтын нийт дүн (logic.salesTotals-тэй ижил дүрэм: буцаалтыг хасна) */
function totals(list: CSale[]) {
  const ok = list.filter((x) => x.status !== "refunded");
  const total = ok.reduce((a, x) => a + x.total, 0);
  return { list, ok, count: ok.length, total, avg: ok.length ? total / ok.length : 0, refunds: list.length - ok.length };
}

function period(v: unknown): { from: Date; to: Date; label: string; prev: { from: Date; to: Date } } {
  const now = new Date();
  const p = str(v) || "today";
  const day = 86_400_000;
  let from: Date, to: Date, label: string;
  if (/^\d{4}-\d{2}-\d{2}\.\.\d{4}-\d{2}-\d{2}$/.test(p)) {
    const [a, b] = p.split("..");
    from = startOfDay(new Date(a));
    to = new Date(startOfDay(new Date(b)).getTime() + day - 1);
    label = `${a} – ${b}`;
  } else if (p === "yesterday") {
    from = new Date(startOfDay(now).getTime() - day);
    to = new Date(startOfDay(now).getTime() - 1);
    label = "Өчигдөр";
  } else if (p === "week") {
    from = new Date(startOfDay(now).getTime() - 6 * day);
    to = now;
    label = "Сүүлийн 7 хоног";
  } else if (p === "month") {
    from = new Date(startOfDay(now).getTime() - 29 * day);
    to = now;
    label = "Сүүлийн 30 хоног";
  } else {
    from = startOfDay(now);
    to = now;
    label = "Өнөөдөр";
  }
  const len = to.getTime() - from.getTime();
  return { from, to, label, prev: { from: new Date(from.getTime() - len - 1), to: new Date(from.getTime() - 1) } };
}

/** Ярианы захиалгын тооцоо (батлахаас өмнө) — convId → түлхүүр */
const gq = globalThis as unknown as { __aiQuotes?: Map<string, { key: string; at: number; orderNo?: number }> };
const quotes = () => (gq.__aiQuotes ??= new Map());

const pct = (a: number, b: number) => (b ? Math.round(((a - b) / b) * 100) : null);

/* ═════════════════════════ хэрэгслүүд ═════════════════════════ */

export const TOOLS: Tool[] = [
  /* ───────── мэдлэг, мэдээлэл (хоёулаа) ───────── */
  {
    name: "search_knowledge",
    title: "Мэдлэгийн сангаас хайв",
    description: "Дэлгүүрийн мэдлэгийн сангаас (журам, FAQ, буцаалт, баталгаа, гэрээ, үйлчилгээний нөхцөл) холбогдох хэсгийг хайна. Бодлого, журам, нөхцөлийн талаарх асуултад заавал эхлээд үүнийг ашигла.",
    parameters: { type: "object", properties: { query: { type: "string", description: "Хайх асуулт, түлхүүр үг" } }, required: ["query"] },
    scopes: ["customer", "director"],
    risk: "read",
    async run(ctx, a) {
      const hits = await search(ctx, str(a.query, 1000), 5, 0.25);
      return { ok: true, summary: hits.length ? `${hits.length} хэсэг олдлоо` : "Мэдлэгийн санд холбогдох мэдээлэл алга", data: hits.map((h) => ({ source: h.doc, text: h.text, score: Number(h.score.toFixed(3)) })) };
    },
  },
  {
    name: "get_store_info",
    title: "Дэлгүүрийн мэдээлэл",
    description: "Дэлгүүрийн нэр, ажлын цаг, хүргэлтийн дүүргүүд, хүргэлтийн төлбөр, төлбөрийн хэлбэр, идэвхтэй урамшууллыг буцаана.",
    parameters: { type: "object", properties: {} },
    scopes: ["customer", "director"],
    risk: "read",
    async run(ctx) {
      const info = await ctx.pos.storeInfo();
      const st = getSettings(ctx);
      return {
        ok: true,
        summary: st.businessName || info.name,
        data: {
          name: st.businessName || info.name,
          description: st.businessAbout || info.description,
          hours: st.hours,
          delivery: info.deliveryEnabled && info.delivery ? { districts: info.delivery.districts, fee: money(info.delivery.fee) } : "Хүргэлт хийхгүй",
          payment: ["Бэлэн", "Карт", "QPay QR"],
          promotions: (info.promotions ?? []).map((c) =>
            c.type === "point" ? `${c.name} (оноо цуглуулах)` : `${c.name}: ${c.type === "percent" ? `${c.value}% хямдрал` : c.type === "amount" ? `${money(c.value ?? 0)} хямдрал` : "бэлэг"}`,
          ),
        },
      };
    },
  },
  {
    name: "list_products",
    title: "Бараа хайв",
    description: "Барааны жагсаалт, үнэ, үлдэгдэл, хүргэлтээр авах боломжийг буцаана. Үнэ, үлдэгдлийн асуултад ЗААВАЛ үүнийг ашигла — үнийг хэзээ ч таамаглахгүй.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Барааны нэр эсвэл төрөл (хоосон бол бүгд)" },
        only_available: { type: "boolean", description: "Зөвхөн үлдэгдэлтэй, идэвхтэй бараа" },
      },
    },
    scopes: ["customer", "director"],
    risk: "read",
    async run(ctx, a) {
      const q = str(a.query, 100);
      const stock = await stockMap(ctx);
      const qty = (p: CProduct) => stock.get(p.id)?.qty ?? 0;
      let list = (await ctx.pos.listProducts(q ? { search: q } : {})).filter((p) => ctx.scope !== "customer" || p.active);
      if (a.only_available) list = list.filter((p) => p.active && qty(p) > 0);
      const view = list.slice(0, 40).map((p) => {
        const v = productView(p, stock.get(p.id));
        return ctx.scope === "customer" ? { name: v.name, price: v.price_text, in_stock: qty(p) > 0, delivery: v.delivery, unit: v.unit } : v;
      });
      return { ok: true, summary: `${list.length} бараа`, data: view };
    },
  },

  /* ───────── харилцагчийн суваг ───────── */
  {
    name: "save_contact_info",
    title: "Харилцагчийн карт шинэчлэв",
    description: "Харилцагчийн хэлсэн нэр, утас, хаяг, сонирхол, тэмдэглэлийг харилцагчийн картад хадгална. Харилцагч өөрийн мэдээллээ хэлмэгц дуудна.",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string" },
        phone: { type: "string", description: "8 оронтой утас" },
        address: { type: "string" },
        email: { type: "string" },
        interests: { type: "array", items: { type: "string" }, description: "Сонирхсон бараа, үйлчилгээ" },
        note: { type: "string", description: "Харилцагчийн тухай товч тэмдэглэл" },
      },
    },
    scopes: ["customer"],
    risk: "write",
    run(ctx, a) {
      if (!ctx.contactId) throw new ToolError("Энэ ярианд харилцагчийн карт алга");
      const phone = str(a.phone, 30).replace(/\D/g, "");
      if (phone && phone.length !== 8) throw new ToolError("Утасны дугаар 8 оронтой байх ёстой — харилцагчаас дахин асуу");
      const c = updateContact(ctx, ctx.contactId, {
        name: str(a.name, 80) || undefined,
        phone: phone || undefined,
        address: str(a.address, 300) || undefined,
        email: str(a.email, 120) || undefined,
        interests: Array.isArray(a.interests) ? a.interests.map((x) => str(x, 60)) : undefined,
        summary: str(a.note, 500) || undefined,
      });
      return { ok: true, summary: `Карт: ${[c?.name, c?.phone].filter(Boolean).join(", ") || "шинэчлэв"}` };
    },
  },
  {
    name: "create_delivery_order",
    title: "Хүргэлтийн захиалга",
    description:
      "Хүргэлтийн захиалга. ХОЁР АЛХАМТАЙ: (1) confirmed=false-оор дуудаж тооцоо авна — бараа бүрийн үнэ, үлдэгдэл, хүргэлтийн төлбөр, нийт дүн, боломжгүй бараа буцна. Тооцоог харилцагчид хэлж «батлах уу?» гэж асуу. (2) Харилцагч «тийм/батлая» гэсний дараа ЯГ ижил мэдээллээр confirmed=true-оор дуудаж ПОС-д бүртгэнэ. Нэр, 8 оронтой утас, дүүрэг, хаяг шаардлагатай. Төлбөрийг хүргэлтээр авна.",
    parameters: {
      type: "object",
      properties: {
        items: { type: "array", items: { type: "object", properties: { product: { type: "string" }, qty: { type: "number" } }, required: ["product", "qty"] } },
        name: { type: "string" },
        phone: { type: "string" },
        district: { type: "string", description: "Хүргэлтийн дүүрэг" },
        address: { type: "string" },
        note: { type: "string" },
        confirmed: { type: "boolean", description: "false = зөвхөн тооцоо; true = харилцагч баталсан, бүртгэнэ" },
      },
      required: ["items", "name", "phone", "district", "address", "confirmed"],
    },
    scopes: ["customer", "director"],
    risk: "write",
    needs: ["orders"],
    run(ctx, a) {
      const items = Array.isArray(a.items) ? (a.items as Record<string, unknown>[]) : [];
      return withSp(ctx, (get) => {
        const s = get();
        const district = s.delivery.districts.find((d) => low(d).startsWith(low(str(a.district, 40)).slice(0, 4)));
        if (!district) throw new ToolError(`«${str(a.district)}» дүүрэгт хүргэлт хийхгүй. Хүргэх дүүрэг: ${s.delivery.districts.join(", ")}`);
        const phone = str(a.phone, 20).replace(/\D/g, "");
        if (phone.length !== 8) throw new ToolError("Утасны дугаар 8 оронтой байх ёстой — харилцагчаас асуу");
        // бараа бүрийг шалгана — боломжгүйг тусад нь буцаана (зохиож хэлэхгүйн тулд)
        const ok: { productId: string; qty: number; name: string; price: number }[] = [];
        const bad: string[] = [];
        for (const it of items) {
          const qty = Math.max(1, Math.round(num(it.qty) || 1));
          let p: Product;
          try {
            p = findProduct(s, it.product);
          } catch (e) {
            bad.push(e instanceof Error ? e.message : String(it.product));
            continue;
          }
          if (!p.active || !p.delivery || p.deliveryStopped) bad.push(`${p.name}: хүргэлтээр зарагдахгүй`);
          else if (p.stock < qty) bad.push(`${p.name}: ${p.stock} ширхэг л үлдсэн`);
          else ok.push({ productId: p.id, qty, name: p.name, price: p.price });
        }
        if (!ok.length) throw new ToolError(`Захиалах боломжтой бараа алга. ${bad.join("; ")}`);
        const subtotal = ok.reduce((x, l) => x + l.qty * l.price, 0);
        const quote = {
          lines: ok.map((l) => `${l.name} × ${l.qty} = ${money(l.qty * l.price)}`),
          unavailable: bad,
          delivery_fee: money(s.delivery.fee),
          total: money(subtotal + s.delivery.fee),
          deliver_to: `${district}, ${str(a.address, 300)}`,
          name: str(a.name, 80),
          phone,
          pay: "Хүргэлтээр (бэлэн, карт, QPay QR)",
        };
        const key = JSON.stringify([ok.map((l) => [l.productId, l.qty]).sort(), phone, district, low(str(a.address, 300))]);
        const conv = `${ctx.tenantId}:${ctx.convId ?? "direct"}`;
        const q = quotes();
        const prev = q.get(conv);
        // Давхардлаас хамгаална: ижил захиалгыг дахин баталбал өмнөхийг буцаана
        if (prev?.key === key && prev.orderNo) {
          return { ok: true, summary: `Захиалга #${prev.orderNo} аль хэдийн бүртгэгдсэн`, data: { order_no: prev.orderNo, already_created: true, ...quote } };
        }
        // Харилцагчийн ярианд: батлахаас өмнө заавал тооцоо харуулсан байх ёстой
        const mustQuote = ctx.scope === "customer" && (!prev || prev.key !== key || Date.now() - prev.at > 30 * 60_000);
        if (a.confirmed !== true || mustQuote) {
          q.set(conv, { key, at: Date.now() });
          return { ok: true, summary: `Тооцоо: ${quote.total} — харилцагчийн батламж хүлээж байна`, data: { step: "quote", instruction: "Энэ тооцоог харилцагчид хэлж батлуул. Баталвал confirmed=true-оор дахин дууд.", ...quote } };
        }
        const o = createOrder({ name: quote.name, phone, district, address: str(a.address, 300), note: [str(a.note, 300), "AI ажилтан бүртгэв"].filter(Boolean).join(" · "), items: ok.map((l) => ({ productId: l.productId, qty: l.qty })), payLater: true });
        q.set(conv, { key, at: Date.now(), orderNo: o.no });
        if (ctx.contactId) updateContact(ctx, ctx.contactId, { name: o.name, phone: o.phone, address: `${district}, ${o.address}`, customer_id: o.customerId, tags: ["захиалсан"] });
        return { ok: true, summary: `Захиалга #${o.no} · ${money(o.total)}`, data: { step: "created", order_no: o.no, ...quote, total: money(o.total), status: "Хүлээн авсан" } };
      });
    },
  },
  {
    name: "order_status",
    title: "Захиалгын төлөв шалгав",
    description: "Захиалгын дугаар эсвэл утасны дугаараар хүргэлтийн захиалгын төлөвийг шалгана.",
    parameters: { type: "object", properties: { order_no: { type: "number" }, phone: { type: "string" } } },
    scopes: ["customer", "director"],
    risk: "read",
    needs: ["orders"],
    run(ctx, a) {
      const s = spNow(ctx);
      const phone = str(a.phone, 20).replace(/\D/g, "");
      const no = num(a.order_no);
      const list = s.orders.filter((o) => (no && o.no === no) || (phone && o.phone === phone)).slice(0, 5);
      if (!list.length) return { ok: false, summary: "Захиалга олдсонгүй" };
      return {
        ok: true,
        summary: `${list.length} захиалга`,
        data: list.map((o) => ({
          order_no: o.no,
          date: o.createdAt.slice(0, 16).replace("T", " "),
          total: money(o.total),
          status: o.cancel ? `Цуцлагдсан (${CANCEL_LABEL[o.cancel.reason]})` : (s.delivery.statuses.find((x) => x.id === o.statusId)?.name ?? o.statusId),
          paid: o.paid,
          items: o.lines.map((l) => `${l.name} × ${l.qty}`),
        })),
      };
    },
  },
  {
    name: "create_ticket",
    title: "Хүсэлт/гомдол бүртгэв",
    description: "Харилцагчийн гомдол, хүсэлт, AI хариулж чадахгүй асуултыг тасалбар болгож хариуцах ажилтанд бүртгэнэ. Гомдол гарвал заавал дууд.",
    parameters: {
      type: "object",
      properties: {
        kind: { type: "string", enum: ["complaint", "request", "question"] },
        title: { type: "string", description: "Товч гарчиг" },
        details: { type: "string", description: "Дэлгэрэнгүй (юу болсон, хэзээ, ямар бараа, харилцагч юу хүсэж байгаа)" },
        priority: { type: "string", enum: ["low", "normal", "high"] },
      },
      required: ["kind", "title"],
    },
    scopes: ["customer", "director"],
    risk: "write",
    run(ctx, a) {
      const kind = (["complaint", "request", "question"].includes(str(a.kind)) ? str(a.kind) : "request") as TicketKind;
      const t = createTicket(ctx, {
        kind,
        title: str(a.title, 200) || TICKET_KIND[kind],
        body: str(a.details, 4000),
        priority: (["low", "normal", "high"].includes(str(a.priority)) ? str(a.priority) : undefined) as "low" | "normal" | "high" | undefined,
        contactId: ctx.contactId,
        convId: ctx.convId,
      });
      if (ctx.contactId && kind === "complaint") updateContact(ctx, ctx.contactId, { tags: ["гомдолтой"] });
      return { ok: true, summary: `${TICKET_KIND[kind]} №${t.no}`, data: { ticket_no: t.no, kind: TICKET_KIND[kind], status: "Шинэ — ажилтан шийдвэрлэнэ" } };
    },
  },
  {
    name: "handoff_to_human",
    title: "Ажилтанд шилжүүлэв",
    description: "Харилцагч хүнтэй ярих хүсэлт гаргасан, эсвэл асуудал AI-ийн эрхээс хэтэрсэн (буцаалт, мөнгө, маргаан) үед яриаг ажилтанд шилжүүлнэ.",
    parameters: { type: "object", properties: { reason: { type: "string" } }, required: ["reason"] },
    scopes: ["customer"],
    risk: "write",
    run(ctx, a) {
      if (ctx.convId) setConvStatus(ctx, ctx.convId, "human");
      const t = createTicket(ctx, { kind: "request", title: `Ажилтантай холбох: ${str(a.reason, 140)}`, body: str(a.reason, 1000), priority: "high", contactId: ctx.contactId, convId: ctx.convId });
      return { ok: true, summary: `Ажилтанд шилжүүлэв (№${t.no})`, data: { ticket_no: t.no } };
    },
  },

  /* ───────── захирлын тушаал ───────── */
  {
    name: "sales_report",
    title: "Борлуулалтын тайлан",
    description: "Борлуулалтын тайлан: нийт дүн, гүйлгээний тоо, дундаж чек, суваг, төлбөрийн хэлбэр, шилдэг бараа, өмнөх үетэй харьцуулалт.",
    parameters: { type: "object", properties: { period: { type: "string", description: "today | yesterday | week | month | YYYY-MM-DD..YYYY-MM-DD" } } },
    scopes: ["director"],
    risk: "read",
    async run(ctx, a) {
      const p = period(a.period);
      const cur = totals(await ctx.pos.sales({ from: p.from, to: p.to }));
      const prev = totals(await ctx.pos.sales(p.prev));
      const byMethod: Record<string, number> = {};
      const byChannel: Record<string, number> = {};
      const byProduct = new Map<string, { qty: number; total: number }>();
      for (const x of cur.ok) {
        const m = x.method === "other" ? "Бусад" : METHOD_LABEL[x.method];
        byMethod[m] = (byMethod[m] ?? 0) + x.total;
        const ch = x.channel === "delivery" ? "Хүргэлт" : x.channel === "online" ? "Онлайн" : "Касс";
        byChannel[ch] = (byChannel[ch] ?? 0) + x.total;
        for (const l of x.lines) {
          const r = byProduct.get(l.name) ?? { qty: 0, total: 0 };
          r.qty += l.qty;
          r.total += l.qty * l.unitPrice;
          byProduct.set(l.name, r);
        }
      }
      const top = [...byProduct.entries()].sort((x, y) => y[1].total - x[1].total).slice(0, 5);
      return {
        ok: true,
        summary: `${p.label}: ${money(cur.total)} · ${cur.count} гүйлгээ`,
        data: {
          period: p.label,
          total: money(cur.total),
          transactions: cur.count,
          average_check: money(cur.avg),
          refunds: cur.refunds,
          vs_previous: { total_change_pct: pct(cur.total, prev.total), previous_total: money(prev.total), previous_transactions: prev.count },
          by_payment: Object.fromEntries(Object.entries(byMethod).map(([k, v]) => [k, money(v)])),
          by_channel: Object.fromEntries(Object.entries(byChannel).map(([k, v]) => [k, money(v)])),
          top_products: top.map(([n, r]) => ({ name: n, qty: r.qty, total: money(r.total) })),
        },
      };
    },
  },
  {
    name: "low_stock",
    title: "Дуусаж буй бараа",
    description: "Доод үлдэгдлийн босгоос доош орсон, дууссан барааны жагсаалт.",
    parameters: { type: "object", properties: {} },
    scopes: ["director"],
    risk: "read",
    async run(ctx) {
      const stock = await stockMap(ctx);
      const l = (await ctx.pos.listProducts()).filter((p) => {
        const st = stock.get(p.id);
        return p.active && (st?.qty ?? 0) <= (st?.minQty ?? 0);
      });
      return { ok: true, summary: `${l.length} бараа дуусаж байна`, data: l.map((p) => ({ name: p.name, stock: stock.get(p.id)?.qty ?? 0, min: stock.get(p.id)?.minQty ?? 0, unit: unitLabel(p) })) };
    },
  },
  {
    name: "update_product",
    title: "Бараа засав",
    description: "Барааны үнэ, үлдэгдэл, доод үлдэгдэл, идэвхтэй эсэх, хүргэлт зогсоох/сэргээхийг өөрчилнө. Зөвхөн өөрчлөх талбараа өг.",
    parameters: {
      type: "object",
      properties: {
        product: { type: "string", description: "Барааны нэр" },
        price: { type: "number" },
        price_change: { type: "number", description: "Үнийг нэмэх (+) / хасах (−) дүн" },
        stock: { type: "number" },
        stock_add: { type: "number", description: "Үлдэгдэлд нэмэх тоо (орлого)" },
        min_stock: { type: "number" },
        active: { type: "boolean" },
        delivery_stopped: { type: "boolean" },
      },
      required: ["product"],
    },
    scopes: ["director"],
    risk: "write",
    async run(ctx, a) {
      const p = findC(await ctx.pos.listProducts(), a.product);
      const st = (await ctx.pos.stock([p.id]))[0];
      const stock0 = st?.qty ?? 0;
      let price = p.price;
      let stock = stock0;
      let minQty: number | undefined;
      let active = p.active;
      let deliveryStopped = !!p.deliveryStopped;
      const ch: string[] = [];
      if (Number.isFinite(num(a.price))) price = Math.round(num(a.price));
      if (Number.isFinite(num(a.price_change))) price = Math.round(p.price + num(a.price_change));
      if (price !== p.price) {
        if (price <= 0) throw new ToolError("Үнэ 0-ээс их байх ёстой");
        ch.push(`үнэ ${money(p.price)} → ${money(price)}`);
      }
      if (Number.isFinite(num(a.stock))) stock = Math.max(0, Math.round(num(a.stock)));
      if (Number.isFinite(num(a.stock_add))) stock = Math.max(0, stock0 + Math.round(num(a.stock_add)));
      if (stock !== stock0) ch.push(`үлдэгдэл ${stock0} → ${stock}`);
      if (Number.isFinite(num(a.min_stock))) {
        minQty = Math.max(0, Math.round(num(a.min_stock)));
        ch.push(`доод үлдэгдэл ${minQty}`);
      }
      if (typeof a.active === "boolean" && a.active !== p.active) {
        active = a.active;
        ch.push(a.active ? "идэвхжүүлэв" : "идэвхгүй болгов");
      }
      if (typeof a.delivery_stopped === "boolean" && a.delivery_stopped !== !!p.deliveryStopped) {
        deliveryStopped = a.delivery_stopped;
        ch.push(a.delivery_stopped ? "хүргэлт зогсоов" : "хүргэлт сэргээв");
      }
      if (!ch.length) return { ok: true, summary: `${p.name}: өөрчлөлт алга`, data: productView(p, st) };
      // Нэг дуудлага — GePOS-д нэг rev, ижил аудит («Үнэ засав», «Нөөц засав» …)
      const next = await ctx.pos.upsertProduct(ctx.actor, { id: p.id, name: p.name, price, active, deliveryStopped, ...(stock !== stock0 ? { stock } : {}), ...(minQty !== undefined ? { minQty } : {}) });
      return { ok: true, summary: `${p.name}: ${ch.join(", ")}`, data: productView(next, (await ctx.pos.stock([p.id]))[0]) };
    },
  },
  {
    name: "add_product",
    title: "Шинэ бараа нэмэв",
    description: "Шинэ бараа бүртгэнэ.",
    parameters: {
      type: "object",
      properties: { name: { type: "string" }, price: { type: "number" }, stock: { type: "number" }, category: { type: "string" }, unit: { type: "string" }, delivery: { type: "boolean" } },
      required: ["name", "price"],
    },
    scopes: ["director"],
    risk: "write",
    async run(ctx, a) {
      const name = str(a.name, 120);
      if (!name) throw new ToolError("Барааны нэр хоосон");
      if ((await ctx.pos.listProducts()).some((p) => low(p.name) === low(name))) throw new ToolError(`«${name}» бараа аль хэдийн байна — update_product ашигла`);
      const price = Math.round(num(a.price));
      if (!(price > 0)) throw new ToolError("Үнэ буруу");
      const p = await ctx.pos.upsertProduct(ctx.actor, {
        name,
        price,
        category: str(a.category, 60),
        stock: Math.max(0, Math.round(num(a.stock) || 0)),
        minQty: 5,
        delivery: a.delivery !== false,
        unitLabel: str(a.unit, 10) || "ш",
        active: true,
      });
      return { ok: true, summary: `${name} · ${money(price)} нэмэв`, data: productView(p, (await ctx.pos.stock([p.id]))[0]) };
    },
  },
  {
    name: "list_customers",
    title: "Харилцагчдын жагсаалт",
    description:
      "Харилцагчдыг сегментээр гаргана: top (их худалдан авалттай), inactive (30+ хоног ирээгүй), complained (гомдол гаргасан), ai_contacts (AI-тай ярьсан бүх хүн), all.",
    parameters: { type: "object", properties: { segment: { type: "string", enum: ["top", "inactive", "complained", "ai_contacts", "all"] }, limit: { type: "number" } } },
    scopes: ["director"],
    risk: "read",
    async run(ctx, a) {
      const seg = str(a.segment) || "top";
      const limit = Math.min(100, Math.max(1, num(a.limit) || 20));
      if (seg === "complained" || seg === "ai_contacts") {
        let cs = listContacts(ctx, "", 500);
        if (seg === "complained") {
          const ids = new Set(listTickets(ctx).filter((t) => t.kind === "complaint").map((t) => t.contact_id));
          cs = cs.filter((c) => ids.has(c.id) || c.tags.includes("гомдолтой"));
        }
        return {
          ok: true,
          summary: `${cs.length} харилцагч`,
          data: cs.slice(0, limit).map((c) => ({ contact_id: c.id, name: c.name, phone: c.phone, channels: Object.keys(c.channels), summary: c.summary, tags: c.tags, interests: c.interests, sentiment: c.sentiment })),
        };
      }
      if (ctx.pos.kind !== "gepos") {
        // гуравдагч ПОС: борлуулалтын түүхгүй — харилцагчийн жагсаалт л
        const cs = await ctx.pos.customers({ limit });
        return { ok: true, summary: `${cs.length} харилцагч`, data: cs.map((c) => ({ name: c.name, phone: c.phone, points: c.points, marketing_ok: c.optIn })) };
      }
      const s = spNow(ctx);
      const st = customerStats(s);
      const cut = Date.now() - 30 * 86_400_000;
      let list = s.customers.filter((c) => !c.erased).map((c) => ({ c, ...(st.get(c.id) ?? { count: 0, spend: 0, last: undefined }) }));
      if (seg === "inactive") list = list.filter((x) => !x.last || new Date(x.last).getTime() < cut);
      list.sort((x, y) => y.spend - x.spend);
      return {
        ok: true,
        summary: `${list.length} харилцагч`,
        data: list.slice(0, limit).map((x) => ({ name: x.c.name, phone: x.c.phone, purchases: x.count, spend: money(x.spend), last: x.last?.slice(0, 10) ?? "—", points: x.c.points, marketing_ok: x.c.optIn })),
      };
    },
  },
  {
    name: "create_discount",
    title: "Урамшуулал үүсгэв",
    description: "Бараанд хувийн эсвэл мөнгөн дүнгийн хямдралтай урамшуулал үүсгэж ПОС-д шууд идэвхжүүлнэ.",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string" },
        products: { type: "array", items: { type: "string" }, description: "Барааны нэрс" },
        percent: { type: "number" },
        amount: { type: "number", description: "Нэг ширхэгт хасах дүн" },
        min_qty: { type: "number", description: "Хэдийг авахад (анхдагч 1)" },
        days: { type: "number", description: "Хэдэн хоног үргэлжлэх (анхдагч 7)" },
      },
      required: ["products"],
    },
    scopes: ["director"],
    risk: "write",
    needs: ["campaigns"],
    run(ctx, a) {
      return withSp(ctx, (get) => {
        const s = get();
        const prods = (Array.isArray(a.products) ? a.products : [a.products]).map((x) => findProduct(s, x));
        const percent = num(a.percent);
        const amount = num(a.amount);
        if (!(percent > 0 && percent <= 90) && !(amount > 0)) throw new ToolError("Хямдралын хувь (1–90) эсвэл дүн өг");
        const days = Math.min(90, Math.max(1, num(a.days) || 7));
        const start = new Date().toISOString().slice(0, 10);
        const end = new Date(Date.now() + (days - 1) * 86_400_000).toISOString().slice(0, 10);
        const c: ItemCampaign = {
          id: `cmp${Date.now().toString(36)}`,
          type: "item",
          name: str(a.name, 80) || `${prods.map((p) => p.name).join(", ")} — ${percent > 0 ? `${percent}%` : money(amount)} хямдрал`,
          productIds: prods.map((p) => p.id),
          qty: Math.max(1, Math.round(num(a.min_qty) || 1)),
          reward: percent > 0 ? { kind: "percent", value: Math.round(percent) } : { kind: "amount", value: Math.round(amount) },
          start,
          end,
          days: [],
          from: "00:00",
          to: "23:59",
          active: true,
          uses: 0,
          createdAt: new Date().toISOString(),
        };
        upsertCampaign(ctx.actor, c);
        return { ok: true, summary: `${c.name} · ${start} – ${end}`, data: { name: c.name, products: prods.map((p) => p.name), start, end } };
      });
    },
  },
  {
    name: "toggle_campaign",
    title: "Урамшуулал асаав/зогсоов",
    description: "Урамшууллыг нэрээр нь идэвхжүүлэх эсвэл зогсооно.",
    parameters: { type: "object", properties: { name: { type: "string" }, active: { type: "boolean" } }, required: ["name", "active"] },
    scopes: ["director"],
    risk: "write",
    needs: ["campaigns"],
    run(ctx, a) {
      return withSp(ctx, (get) => {
        const q = low(str(a.name, 80));
        const c = get().campaigns.find((x) => low(x.name).includes(q));
        if (!c) throw new ToolError(`«${str(a.name)}» урамшуулал олдсонгүй. Байгаа: ${get().campaigns.map((x) => x.name).join(", ")}`);
        toggleCampaign(ctx.actor, c.id, a.active === true);
        return { ok: true, summary: `${c.name}: ${a.active ? "идэвхжүүлэв" : "зогсоов"}` };
      });
    },
  },
  {
    name: "list_orders",
    title: "Захиалгууд",
    description: "Хүргэлтийн захиалгуудыг төлвөөр гаргана: active | done | cancelled | all.",
    parameters: { type: "object", properties: { state: { type: "string", enum: ["active", "done", "cancelled", "all"] }, limit: { type: "number" } } },
    scopes: ["director"],
    risk: "read",
    needs: ["orders"],
    run(ctx, a) {
      const s = spNow(ctx);
      const want = str(a.state) || "active";
      const list = s.orders.filter((o) => want === "all" || orderState(s, o) === want).slice(0, Math.min(50, num(a.limit) || 20));
      return {
        ok: true,
        summary: `${list.length} захиалга`,
        data: list.map((o) => ({ order_no: o.no, name: o.name, phone: o.phone, total: money(o.total), paid: o.paid, status: s.delivery.statuses.find((x) => x.id === o.statusId)?.name, district: o.district, at: o.createdAt.slice(0, 16).replace("T", " ") })),
      };
    },
  },
  {
    name: "set_order_status",
    title: "Захиалгын төлөв солив",
    description: "Хүргэлтийн захиалгын төлвийг солино (жишээ нь «Хүргэлтэнд гарсан»).",
    parameters: { type: "object", properties: { order_no: { type: "number" }, status: { type: "string" } }, required: ["order_no", "status"] },
    scopes: ["director"],
    risk: "write",
    needs: ["orders"],
    run(ctx, a) {
      return withSp(ctx, (get) => {
        const s = get();
        const o = s.orders.find((x) => x.no === num(a.order_no));
        if (!o) throw new ToolError("Захиалга олдсонгүй");
        const q = low(str(a.status, 60));
        const st = s.delivery.statuses.find((x) => x.id === q || low(x.name).includes(q));
        if (!st) throw new ToolError(`Төлөв олдсонгүй. Боломжтой: ${s.delivery.statuses.map((x) => x.name).join(", ")}`);
        if (st.final) throw new ToolError("«Хүргэгдсэн» төлвийг зөвхөн хүргэгч ачаа буулгах кодоор хийнэ");
        setOrderStatus(ctx.actor, o.id, st.id);
        return { ok: true, summary: `#${o.no}: ${st.name}` };
      });
    },
  },
  {
    name: "cancel_order",
    title: "Захиалга цуцлав",
    description: "Хүргэлтийн захиалгыг цуцална (төлсөн бол буцаалт хийгдэнэ). Захирлын батламж шаардана.",
    parameters: { type: "object", properties: { order_no: { type: "number" }, reason: { type: "string", enum: ["merchant", "out-of-stock", "customer"] } }, required: ["order_no", "reason"] },
    scopes: ["director"],
    risk: "confirm",
    needs: ["orders"],
    run(ctx, a) {
      return withSp(ctx, (get) => {
        const o = get().orders.find((x) => x.no === num(a.order_no));
        if (!o) throw new ToolError("Захиалга олдсонгүй");
        const reason = (["merchant", "out-of-stock", "customer"].includes(str(a.reason)) ? str(a.reason) : "merchant") as CancelReason;
        cancelOrder(ctx.actor, o.id, reason);
        return { ok: true, summary: `#${o.no} цуцлагдав (${CANCEL_LABEL[reason]})` };
      });
    },
  },
  {
    name: "refund_sale",
    title: "Борлуулалт буцаав",
    description: "Кассын гүйлгээг дугаараар нь буцаана (и-Баримт буцаагдана, оноо хасагдана). Захирлын батламж шаардана.",
    parameters: { type: "object", properties: { sale_no: { type: "number" }, reason: { type: "string" } }, required: ["sale_no", "reason"] },
    scopes: ["director"],
    risk: "confirm",
    needs: ["refunds"],
    run(ctx, a) {
      return withSp(ctx, (get) => {
        const sale = get().sales.find((x) => x.no === num(a.sale_no));
        if (!sale) throw new ToolError("Гүйлгээ олдсонгүй");
        if (sale.refund) throw new ToolError("Аль хэдийн буцаагдсан");
        refundSale(ctx.actor, sale.id, str(a.reason, 200) || "Захирлын шийдвэр");
        return { ok: true, summary: `Гүйлгээ #${sale.no} (${money(sale.total)}) буцаагдав` };
      });
    },
  },
  {
    name: "list_tickets",
    title: "Хүсэлт, гомдол",
    description: "Харилцагчдын хүсэлт, гомдлын жагсаалт. status: open (шинэ) | in_progress | resolved (шийдсэн) | all. Гомдолтой харилцагчдыг олох, ерөнхий дүн гаргахад all ашигла.",
    parameters: { type: "object", properties: { status: { type: "string", enum: ["open", "in_progress", "resolved", "all"] } } },
    scopes: ["director"],
    risk: "read",
    run(ctx, a) {
      const st = str(a.status);
      const list = listTickets(ctx, st === "all" ? "" : st || "");
      return {
        ok: true,
        summary: `${list.length} тасалбар`,
        data: list.slice(0, 40).map((t) => ({ no: t.no, kind: TICKET_KIND[t.kind], title: t.title, details: t.body, status: t.status, priority: t.priority, customer: [t.contact_name, t.contact_phone].filter(Boolean).join(" ") || null, contact_id: t.contact_id, created: new Date(t.created_at).toISOString().slice(0, 16).replace("T", " ") })),
      };
    },
  },
  {
    name: "update_ticket",
    title: "Тасалбар шинэчлэв",
    description: "Хүсэлт/гомдлын төлөв, шийдвэр, хариуцагчийг шинэчилнэ.",
    parameters: {
      type: "object",
      properties: { ticket_no: { type: "number" }, status: { type: "string", enum: ["open", "in_progress", "resolved"] }, resolution: { type: "string" }, assignee: { type: "string" } },
      required: ["ticket_no"],
    },
    scopes: ["director"],
    risk: "write",
    run(ctx, a) {
      const t = updateTicket(ctx, num(a.ticket_no), {
        status: (["open", "in_progress", "resolved"].includes(str(a.status)) ? str(a.status) : undefined) as "open" | "in_progress" | "resolved" | undefined,
        resolution: str(a.resolution, 1000) || undefined,
        assignee: str(a.assignee, 80) || undefined,
      });
      if (!t) throw new ToolError("Тасалбар олдсонгүй");
      return { ok: true, summary: `№${t.no}: ${t.status}` };
    },
  },
  {
    name: "message_customers",
    title: "Харилцагчдад мессеж илгээв",
    description:
      "AI-тай харилцсан харилцагчдад (contact_id-аар, эсвэл segment=complained|ai_contacts) өөрсдийн сувгаар (Facebook Messenger, вэб чат) мессеж илгээнэ. Купон, мэдэгдэл, уучлал гуйх зэрэгт. Захирлын батламж шаардана.",
    parameters: {
      type: "object",
      properties: {
        text: { type: "string", description: "Илгээх мессеж (харилцагч бүрт ижил)" },
        contact_ids: { type: "array", items: { type: "string" } },
        segment: { type: "string", enum: ["complained", "ai_contacts"] },
      },
      required: ["text"],
    },
    scopes: ["director"],
    risk: "confirm",
    async run(ctx, a) {
      const text = str(a.text, 1000);
      if (!text) throw new ToolError("Мессеж хоосон");
      let targets = listContacts(ctx, "", 500);
      if (Array.isArray(a.contact_ids) && a.contact_ids.length) {
        const ids = new Set(a.contact_ids.map((x) => str(x)));
        targets = targets.filter((c) => ids.has(c.id));
      } else if (str(a.segment) === "complained") {
        const ids = new Set(listTickets(ctx).filter((t) => t.kind === "complaint").map((t) => t.contact_id));
        targets = targets.filter((c) => ids.has(c.id) || c.tags.includes("гомдолтой"));
      } else if (str(a.segment) !== "ai_contacts") throw new ToolError("contact_ids эсвэл segment өг");
      const page = pageOf(ctx.tenantId);
      const sent: string[] = [];
      const failed: string[] = [];
      /** Messenger-ийн 24 цаг өнгөрсөн — AI гарал үүсэлтэй илгээлт HUMAN_AGENT ашиглахгүй (§9.3) */
      const skipped: string[] = [];
      for (const c of targets.slice(0, 200)) {
        const label = c.name || c.phone || c.id;
        const conv = ctx.db.one<{ id: string; channel: string; ext_id: string }>(
          `SELECT id, channel, ext_id FROM conversations WHERE merchant = :tenant AND contact_id = ? AND channel IN ('fb','web') ORDER BY CASE channel WHEN 'fb' THEN 0 ELSE 1 END, last_at DESC LIMIT 1`,
          c.id,
        );
        if (!conv) {
          failed.push(`${label} (чат суваг алга)`);
          continue;
        }
        try {
          if (conv.channel === "fb") {
            if (!page) throw new Error("Facebook Page холбогдоогүй");
            await sendText(page, conv.ext_id, text, "AI ажилтан", "ai");
          }
          addMessage(ctx, conv.id, "assistant", text, { broadcast: true, by: ctx.actor.name });
          sent.push(label);
        } catch (e) {
          if (e instanceof HttpError && e.code === "window") skipped.push(label);
          else failed.push(`${label} (${e instanceof Error ? e.message : "алдаа"})`);
        }
      }
      const parts = [`${sent.length} харилцагчид илгээв`];
      if (skipped.length) parts.push(`${skipped.length} хүнд 24 цаг өнгөрсөн тул илгээгээгүй (ажилтан гараар бичнэ)`);
      if (failed.length) parts.push(`${failed.length} амжилтгүй`);
      return { ok: sent.length > 0, summary: parts.join(", "), data: { sent, skipped_24h: skipped, failed } };
    },
  },
  {
    name: "add_knowledge",
    title: "Мэдлэгийн санд нэмэв",
    description: "Захирлын хэлсэн шинэ журам, мэдээлэл, FAQ-г мэдлэгийн санд нэмнэ — AI цаашид харилцагчдад үүгээр хариулна.",
    parameters: { type: "object", properties: { title: { type: "string" }, text: { type: "string" } }, required: ["title", "text"] },
    scopes: ["director"],
    risk: "write",
    async run(ctx, a) {
      const r = await addDoc(ctx, str(a.title, 160) || "Захирлын тэмдэглэл", str(a.text, 20000), "note", "Захирлын тушаал");
      return { ok: true, summary: `«${str(a.title, 60)}» нэмэгдэв (${r.chunks} хэсэг)` };
    },
  },
  {
    name: "ai_insights",
    title: "Харилцагчийн ярианы дүн шинжилгээ",
    description: "AI-ийн сувгуудаар ирсэн яриа, гомдол, хүсэлт, харилцагчийн сонирхлын статистик (хугацаагаар). Бизнесийн шийдвэр, сайжруулах санал гаргахад ашигла.",
    parameters: { type: "object", properties: { days: { type: "number" } } },
    scopes: ["director"],
    risk: "read",
    run(ctx, a) {
      const days = Math.min(90, Math.max(1, num(a.days) || 7));
      const since = Date.now() - days * 86_400_000;
      const conv = ctx.db.all<{ channel: string; n: number }>(`SELECT channel, COUNT(*) n FROM conversations WHERE merchant = :tenant AND last_at >= ? AND channel NOT IN ('director','mcp') GROUP BY channel`, since);
      const tk = ctx.db.all<{ kind: string; status: string; n: number }>(`SELECT kind, status, COUNT(*) n FROM tickets WHERE merchant = :tenant AND created_at >= ? GROUP BY kind, status`, since);
      const recent = ctx.db
        .all<{ id: string; title: string; kind: string }>(`SELECT id, title, kind FROM tickets WHERE merchant = :tenant AND created_at >= ? ORDER BY created_at DESC LIMIT 30`, since)
        .map((t) => openTicket(ctx, t));
      const cs = listContacts(ctx, "", 500).filter((c) => c.last_at >= since);
      const interests = new Map<string, number>();
      cs.forEach((c) => c.interests.forEach((i) => interests.set(i, (interests.get(i) ?? 0) + 1)));
      const senti = new Map<string, number>();
      cs.forEach((c) => c.sentiment && senti.set(c.sentiment, (senti.get(c.sentiment) ?? 0) + 1));
      const ai = ctx.db.all<{ tool: string; n: number }>(`SELECT tool, COUNT(*) n FROM actions WHERE merchant = :tenant AND at >= ? AND actor LIKE 'AI%' AND status = 'done' GROUP BY tool`, since);
      return {
        ok: true,
        summary: `${days} хоногийн дүн`,
        data: {
          conversations_by_channel: Object.fromEntries(conv.map((r) => [r.channel, r.n])),
          tickets: tk.map((r) => ({ kind: TICKET_KIND[r.kind as TicketKind] ?? r.kind, status: r.status, count: r.n })),
          recent_ticket_titles: recent.map((r) => `${TICKET_KIND[r.kind as TicketKind] ?? r.kind}: ${r.title}`),
          contacts_active: cs.length,
          top_interests: [...interests.entries()].sort((x, y) => y[1] - x[1]).slice(0, 10),
          sentiment: Object.fromEntries(senti),
          ai_actions: Object.fromEntries(ai.map((r) => [r.tool, r.n])),
        },
      };
    },
  },
  ...INVENTORY_TOOLS,
];

export const toolByName = (n: string) => TOOLS.find((t) => t.name === n);
const capable = (t: Tool, caps: Capabilities) => (t.needs ?? []).every((n) => caps[n]);
/** Тухайн суваг (scope) ба ПОС-ын боломжид тохирох хэрэгслүүд */
export const toolsFor = (scope: Scope | "mcp", caps: Capabilities) => TOOLS.filter((t) => (scope === "mcp" || t.scopes.includes(scope)) && capable(t, caps));
export const toolDefs = (list: Tool[]) => list.map((t) => ({ type: "function" as const, function: { name: t.name, description: t.description, parameters: t.parameters } }));

/** Хэрэгслийг ажиллуулна — алдааг AI ойлгох текст болгоно (дахин асуух, засах боломжтой). */
export async function runTool(ctx: ToolCtx, name: string, args: Record<string, unknown>): Promise<ToolResult> {
  const t = toolByName(name);
  if (!t) return { ok: false, summary: `Үл мэдэгдэх хэрэгсэл: ${name}` };
  if (ctx.scope !== "mcp" && !t.scopes.includes(ctx.scope)) return { ok: false, summary: "Энэ үйлдлийг хийх эрхгүй" };
  // туслахын дэд олонлог (§10): загвар өөр туслахын хэрэгслийг дуудуулахыг оролдвол татгалзана
  if (ctx.allow && !ctx.allow.has(name)) return { ok: false, summary: "Энэ туслахад уг үйлдлийг хийх эрхгүй" };
  if (!capable(t, ctx.pos.capabilities)) return { ok: false, summary: "Энэ ПОС уг үйлдлийг дэмжихгүй" };
  // tenant таних аргументыг хаяна — tenant зөвхөн ctx-ээс (prompt injection-оос хамгаална)
  const clean = Object.fromEntries(Object.entries(args && typeof args === "object" ? args : {}).filter(([k]) => !TENANT_ARG.test(k)));
  try {
    return await t.run(ctx, clean);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, summary: msg };
  }
}

export { ToolError };
