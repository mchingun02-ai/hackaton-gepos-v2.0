/**
 * Тооллогын AI хэрэгслүүд (docs/ARCHITECTURE.md §5.7, §10 `inventory` туслах) — захиралд (director).
 * Tenant зөвхөн ctx-ээс; параметрт merchant/tenant талбар байхгүй (T6). `approve_count` — risk "confirm".
 */
import type { Tool } from "@/lib/agent/tools";
import type { TenantContext } from "@/lib/tenant/context";
import { reorderList } from "./reorder";
import { approveSession, createSession, inventoryStatus, varianceReport } from "./sessions";
import { LEVEL_LABEL } from "./reconcile";

const STATUS: Record<string, string> = { counting: "тоолж байна", review: "батлал хүлээж байна", approved: "ПОС хүлээн авахыг хүлээж байна", applied: "батлагдсан", cancelled: "цуцалсан" };

/** Дугаараар (эсвэл анхдагчаар хамгийн сүүлийн тохирох) тооллого */
function pick(ctx: TenantContext, no: unknown, prefer: string[]) {
  const n = Number(no);
  if (Number.isInteger(n) && n > 0) {
    const r = ctx.db.one<{ id: string }>(`SELECT id FROM inv_sessions WHERE merchant = :tenant AND no = ?`, n);
    if (!r) throw new Error(`№${n} тооллого олдсонгүй`);
    return r.id;
  }
  for (const st of prefer) {
    const r = ctx.db.one<{ id: string }>(`SELECT id FROM inv_sessions WHERE merchant = :tenant AND status = ? ORDER BY created_at DESC LIMIT 1`, st);
    if (r) return r.id;
  }
  throw new Error("Тооллого алга");
}

export const INVENTORY_TOOLS: Tool[] = [
  {
    name: "inventory_status",
    title: "Тооллогын төлөв",
    description: "Идэвхтэй тооллого (явц, батлал хүлээж буй эсэх) ба хамгийн сүүлд батлагдсан тооллогыг буцаана.",
    parameters: { type: "object", properties: {} },
    scopes: ["director"],
    risk: "read",
    run(ctx) {
      const s = inventoryStatus(ctx);
      const view = (x: (typeof s.active)[number]) => ({ no: x.no, name: x.name, status: STATUS[x.status] ?? x.status, counted: `${x.done}/${x.total}`, critical: x.critical });
      return {
        ok: true,
        summary: s.active.length ? `${s.active.length} идэвхтэй тооллого` : "Идэвхтэй тооллого алга",
        data: { active: s.active.map(view), last: s.last ? view(s.last) : null, pwa: "/count" },
      };
    },
  },
  {
    name: "start_count",
    title: "Тооллого эхлүүлэв",
    description: "Шинэ бараа тооллого эхлүүлнэ (бүх бараа эсвэл нэг ангилал). Ажилтан утсаараа /count хуудсанд тоолно.",
    parameters: { type: "object", properties: { category: { type: "string", description: "Ангиллын нэр (хоосон бол бүх бараа)" }, name: { type: "string" } } },
    scopes: ["director"],
    risk: "write",
    async run(ctx, a) {
      const cat = typeof a.category === "string" ? a.category.trim() : "";
      const r = await createSession(ctx, { scope: cat ? "category" : "all", scopeRef: cat, name: a.name });
      return { ok: true, summary: `№${r.session.no} тооллого эхэллээ (${r.progress.total} бараа)`, data: { no: r.session.no, name: r.session.name, products: r.progress.total, open: "/count" } };
    },
  },
  {
    name: "variance_report",
    title: "Тооллогын зөрүү",
    description: "Тооллогын зөрүүний тайлан: тоолсон/тоолоогүй, түвшин (Таарсан/Шалгах/Дахин тоолох), дутагдал ба илүүдэл ₮, хамгийн том 10 зөрүү.",
    parameters: { type: "object", properties: { session_no: { type: "number", description: "Тооллогын дугаар (хоосон бол батлал хүлээж буй/сүүлийнх)" } } },
    scopes: ["director"],
    risk: "read",
    run(ctx, a) {
      const r = varianceReport(ctx, pick(ctx, a.session_no, ["review", "counting", "applied", "approved"]), true);
      return {
        ok: true,
        summary: `№${r.session.no}: ${r.counted}/${r.total} тоолсон, дутагдал ${r.shortage.toLocaleString("en-US")}₮, илүүдэл ${r.surplus.toLocaleString("en-US")}₮`,
        data: {
          no: r.session.no,
          status: STATUS[r.session.status] ?? r.session.status,
          counted: r.counted,
          uncounted: r.uncounted,
          levels: { [LEVEL_LABEL.ok]: r.levels.ok, [LEVEL_LABEL.warn]: r.levels.warn, [LEVEL_LABEL.critical]: r.levels.critical },
          shortage: r.shortage,
          surplus: r.surplus,
          net: r.net,
          top: r.top.map((l) => ({ name: l.name, system: l.system, counted: l.counted, variance: l.variance, value: l.value, level: l.level ? LEVEL_LABEL[l.level] : null })),
        },
      };
    },
  },
  {
    name: "reorder_suggestions",
    title: "Захиалах санал",
    description: "Сүүлийн 14 хоногийн борлуулалт, үлдэгдэл, нийлүүлэх хугацаагаар захиалах барааны санал (тоо, хэдэн хоног хүрэх).",
    parameters: { type: "object", properties: { limit: { type: "number" } } },
    scopes: ["director"],
    risk: "read",
    async run(ctx, a) {
      const r = await reorderList(ctx, Math.min(30, Math.max(1, Number(a.limit) || 15)));
      return {
        ok: true,
        summary: r.items.length ? `${r.items.length} бараа захиалах шаардлагатай` : "Одоогоор захиалах бараа алга",
        data: { items: r.items.map((x) => ({ name: x.name, stock: x.qty, per_day: x.velocity, days_left: x.daysCover, order: x.suggest })), estimated_cost: r.estimatedCost },
      };
    },
  },
  {
    name: "approve_count",
    title: "Тооллого батлав",
    description: "Батлал хүлээж буй тооллогыг батлаж, ПОС-ын үлдэгдлийг зөрүүгээр (delta) засна. Эргэлт буцалтгүй — захирлаас заавал батлуул.",
    parameters: {
      type: "object",
      properties: { session_no: { type: "number" }, override_reason: { type: "string", description: "«Дахин тоолох» мөр байхад батлах шалтгаан" } },
      required: ["session_no"],
    },
    scopes: ["director"],
    risk: "confirm",
    async run(ctx, a) {
      const r = await approveSession(ctx, pick(ctx, a.session_no, ["review"]), { override_reason: a.override_reason });
      return { ok: true, summary: r.summary, data: { adjusted: r.adjusted, pending: r.pending, value: r.value } };
    },
  },
];
