/**
 * GePOS (Store Plus) адаптер — `sp_state` blob дээр core.ts-ийн үйлдлүүдээр (аудит, rev, SSE автоматаар).
 * Хөрвүүлэлт: barcode → barcodes[0], unit «ш» → "pcs" (unitLabel-д эх нэр), bunaCode → taxCode.
 */
import { SpError, uid, upsertProduct, type Actor } from "@/lib/sp/core";
import { spNow, withSp, type SpCtx } from "@/lib/sp/server";
import type { Product, SpState } from "@/lib/sp/types";
import type { TenantId } from "@/lib/tenant/context";
import { tdb } from "@/lib/tenant/tdb";
import { summarize, type PosAdapter, type ProductUpsert, type StoreInfo } from "./adapter";
import { matches, norm, toUnit, unitLabel, type CCustomer, type CProduct, type CSale, type CStock, type CStockAdjustment } from "./canonical";

const nowIso = () => new Date().toISOString();

function toC(s: SpState, p: Product, at = nowIso()): CProduct {
  return {
    id: p.id,
    barcodes: p.barcode ? [p.barcode] : [],
    name: p.name,
    category: s.categories.find((c) => c.id === p.categoryId)?.name ?? "",
    unit: toUnit(p.unit),
    unitLabel: p.unit,
    price: p.price,
    cost: p.cost,
    active: p.active,
    imageUrl: p.image || undefined,
    taxCode: p.bunaCode,
    delivery: p.delivery,
    deliveryStopped: p.deliveryStopped,
    updatedAt: at,
  };
}
const toStock = (p: Product, at = nowIso()): CStock => ({ productId: p.id, location: "main", qty: p.stock, minQty: p.minStock, updatedAt: at });

export function geposAdapter(tenantId: TenantId): PosAdapter {
  const sp: SpCtx = { tenantId, db: tdb(tenantId) };
  const self: PosAdapter = {
    kind: "gepos",
    capabilities: { orders: true, campaigns: true, refunds: true, loyalty: true, ebarimt: true, pushStock: "direct" },

    async listProducts(q = {}) {
      const s = spNow(sp);
      let list = s.products.map((p) => toC(s, p));
      if (q.search) list = list.filter((p) => matches(p, q.search!));
      if (q.barcode) list = list.filter((p) => p.barcodes.includes(q.barcode!));
      if (q.category) list = list.filter((p) => norm(p.category ?? "") === norm(q.category!));
      return q.limit ? list.slice(0, q.limit) : list;
    },

    async getProduct(id) {
      const s = spNow(sp);
      const p = s.products.find((x) => x.id === id);
      return p ? toC(s, p) : null;
    },

    async upsertProduct(actor: Actor, u: ProductUpsert) {
      return withSp(sp, (get) => {
        const s = get();
        const prev = u.id ? s.products.find((x) => x.id === u.id) : undefined;
        const cq = u.category !== undefined ? norm(u.category) : "";
        const cat = (cq && s.categories.find((c) => norm(c.name).includes(cq))) || (prev ? undefined : s.categories[0]);
        if (!prev && !cat) throw new SpError("Барааны ангилал алга");
        const next: Product = prev
          ? { ...prev }
          : { id: u.id || `p${Date.now().toString(36)}`, name: u.name, categoryId: cat!.id, price: 0, stock: 0, minStock: 5, delivery: true, deliveryStopped: false, points: 0, image: "", barcode: "", unit: "ш", active: true, addedBy: u.addedBy ?? "portal" };
        next.name = u.name;
        if (cat) next.categoryId = cat.id;
        if (u.price !== undefined) next.price = Math.round(u.price);
        if (u.cost !== undefined) next.cost = u.cost;
        if (u.active !== undefined) next.active = u.active;
        if (u.delivery !== undefined) next.delivery = u.delivery;
        if (u.deliveryStopped !== undefined) next.deliveryStopped = u.deliveryStopped;
        if (u.barcodes) next.barcode = u.barcodes[0] ?? "";
        if (u.unitLabel || u.unit) next.unit = u.unitLabel || unitLabel({ unit: u.unit! });
        if (u.taxCode !== undefined) next.bunaCode = u.taxCode;
        if (u.imageUrl !== undefined) next.image = u.imageUrl;
        if (u.stock !== undefined) next.stock = Math.max(0, u.stock);
        if (u.minQty !== undefined) next.minStock = Math.max(0, u.minQty);
        upsertProduct(actor, next);
        return toC(get(), next);
      });
    },

    async stock(ids) {
      const s = spNow(sp);
      const at = nowIso();
      return s.products.filter((p) => !ids || ids.includes(p.id)).map((p) => toStock(p, at));
    },

    async adjustStock(actor: Actor, adj) {
      // Нэг withSp дотор бүх delta — нэг rev, нэг SSE; core.upsertProduct «Нөөц засав» аудит бичнэ
      return withSp(sp, (get) => {
        const applied: CStockAdjustment[] = [];
        for (const a of adj) {
          const p = get().products.find((x) => x.id === a.productId);
          if (!p) throw new SpError(`Бараа олдсонгүй: ${a.productId}`);
          upsertProduct(actor, { ...p, stock: Math.max(0, p.stock + a.delta) });
          applied.push({ ...a, id: uid("adj"), at: nowIso() });
        }
        return { applied, pending: [] };
      });
    },

    async sales(range) {
      const s = spNow(sp);
      return s.sales
        .filter((x) => {
          const t = new Date(x.at);
          return t >= range.from && t <= range.to;
        })
        .map(
          (x): CSale => ({
            id: x.id,
            extId: String(x.no),
            at: x.at,
            channel: x.channel,
            lines: x.lines.map((l) => ({ productId: l.productId, name: l.name, qty: l.qty, unitPrice: l.price })),
            total: x.total,
            method: x.method,
            customerId: x.customerId,
            status: x.refund ? "refunded" : "completed",
          }),
        );
    },

    async salesSummary(range, groupBy) {
      return summarize(await self.sales(range), groupBy);
    },

    async customers(q = {}) {
      const s = spNow(sp);
      const qq = norm(q.search ?? "");
      const list = s.customers
        .filter((c) => !c.erased && (!qq || norm(`${c.name ?? ""} ${c.phone}`).includes(qq)))
        .map((c): CCustomer => ({ id: c.id, phone: c.phone, name: c.name, optIn: c.optIn, points: c.points }));
      return q.limit ? list.slice(0, q.limit) : list;
    },

    async storeInfo(): Promise<StoreInfo> {
      const s = spNow(sp);
      const today = new Date().toISOString().slice(0, 10);
      return {
        name: s.delivery.page.name,
        description: s.delivery.page.desc,
        color: s.delivery.page.color,
        deliveryEnabled: s.delivery.enabled,
        delivery: s.delivery.enabled ? { districts: s.delivery.districts, fee: s.delivery.fee } : undefined,
        promotions: s.campaigns
          .filter((c) => c.active && c.start <= today && c.end >= today)
          .map((c) =>
            c.type === "point"
              ? { name: c.name, type: "point" as const }
              : c.reward.kind === "percent" || c.reward.kind === "amount"
                ? { name: c.name, type: c.reward.kind, value: c.reward.value }
                : { name: c.name, type: "gift" as const },
          ),
      };
    },
  };
  return self;
}
