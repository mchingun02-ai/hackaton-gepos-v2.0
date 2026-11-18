/**
 * Гуравдагч ПОС-ын адаптер — c_* хүснэгтээс (гуравдагч ПОС /api/v1-ээр түлхэнэ, 2-р шат).
 * adjustStock → c_stock-ийг шууд шинэчилж, c_adjustments(status='pending') + outbox `stock.adjusted`;
 * гуравдагч ПОС webhook-оор хүлээн авах эсвэл татаж `ack` хийнэ. Захиалга, урамшуулал, буцаалт — үгүй.
 */
import type { Actor } from "@/lib/sp/core";
import type { TenantId } from "@/lib/tenant/context";
import { tdb } from "@/lib/tenant/tdb";
import { json, rid } from "@/lib/agent/db";
import { summarize, type PosAdapter, type ProductUpsert, type StoreInfo } from "./adapter";
import { matches, norm, toUnit, type CCustomer, type CProduct, type CSale, type CStock, type CStockAdjustment, type Unit } from "./canonical";

type PRow = {
  id: string; ext_id: string | null; sku: string | null; barcodes: string; name: string; brand: string | null; category: string | null;
  unit: string; price: number; cost: number | null; active: number; image_url: string | null; tax_code: string | null; updated_at: number;
};
type SRow = { product_id: string; location: string; qty: number; min_qty: number; updated_at: number };

const iso = (ms: number) => new Date(ms).toISOString();
const toC = (r: PRow): CProduct => ({
  id: r.id,
  extId: r.ext_id ?? undefined,
  sku: r.sku ?? undefined,
  barcodes: json<string[]>(r.barcodes, []),
  name: r.name,
  brand: r.brand ?? undefined,
  category: r.category ?? undefined,
  unit: (["pcs", "kg", "l", "pack"].includes(r.unit) ? r.unit : "pcs") as Unit,
  price: r.price,
  cost: r.cost ?? undefined,
  active: !!r.active,
  imageUrl: r.image_url ?? undefined,
  taxCode: r.tax_code ?? undefined,
  updatedAt: iso(r.updated_at),
});

export function connectorAdapter(tenantId: TenantId): PosAdapter {
  const db = tdb(tenantId);
  const stockRow = (id: string) => db.one<SRow>(`SELECT * FROM c_stock WHERE merchant = :tenant AND product_id = ? AND location = 'main'`, id);
  const setStock = (id: string, qty: number, minQty?: number) => {
    const cur = stockRow(id);
    db.run(
      `INSERT INTO c_stock (merchant, product_id, location, qty, min_qty, updated_at) VALUES (:tenant, ?, 'main', ?, ?, ?)
       ON CONFLICT(merchant, product_id, location) DO UPDATE SET qty = excluded.qty, min_qty = excluded.min_qty, updated_at = excluded.updated_at`,
      id,
      qty,
      minQty ?? cur?.min_qty ?? 0,
      Date.now(),
    );
  };
  const self: PosAdapter = {
    kind: "connector",
    capabilities: { orders: false, campaigns: false, refunds: false, loyalty: false, ebarimt: false, pushStock: "webhook" },

    async listProducts(q = {}) {
      let list = db.all<PRow>(`SELECT * FROM c_products WHERE merchant = :tenant ORDER BY name`).map(toC);
      if (q.search) list = list.filter((p) => matches(p, q.search!));
      if (q.barcode) list = list.filter((p) => p.barcodes.includes(q.barcode!));
      if (q.category) list = list.filter((p) => norm(p.category ?? "") === norm(q.category!));
      return q.limit ? list.slice(0, q.limit) : list;
    },

    async getProduct(id) {
      const r = db.one<PRow>(`SELECT * FROM c_products WHERE merchant = :tenant AND id = ?`, id);
      return r ? toC(r) : null;
    },

    async upsertProduct(_actor: Actor, u: ProductUpsert) {
      const prev = u.id ? await self.getProduct(u.id) : null;
      const id = u.id || `cp${Date.now().toString(36)}${rid(4)}`;
      const p: CProduct = {
        ...(prev ?? { id, barcodes: [], unit: "pcs" as Unit, price: 0, active: true, updatedAt: iso(Date.now()) }),
        ...Object.fromEntries(Object.entries(u).filter(([, v]) => v !== undefined)),
        id,
        name: u.name,
        unit: u.unit ?? (u.unitLabel ? toUnit(u.unitLabel) : (prev?.unit ?? "pcs")),
      } as CProduct;
      db.run(
        `INSERT INTO c_products (merchant, id, ext_id, sku, barcodes, name, brand, category, unit, price, cost, active, image_url, tax_code, updated_at)
         VALUES (:tenant, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(merchant, id) DO UPDATE SET ext_id = excluded.ext_id, sku = excluded.sku, barcodes = excluded.barcodes, name = excluded.name,
           brand = excluded.brand, category = excluded.category, unit = excluded.unit, price = excluded.price, cost = excluded.cost,
           active = excluded.active, image_url = excluded.image_url, tax_code = excluded.tax_code, updated_at = excluded.updated_at`,
        id, p.extId ?? null, p.sku ?? null, JSON.stringify(p.barcodes ?? []), p.name, p.brand ?? null, p.category ?? null, p.unit,
        Math.round(p.price), p.cost ?? null, p.active ? 1 : 0, p.imageUrl ?? null, p.taxCode ?? null, Date.now(),
      );
      if (u.stock !== undefined || u.minQty !== undefined) setStock(id, Math.max(0, u.stock ?? stockRow(id)?.qty ?? 0), u.minQty);
      return (await self.getProduct(id))!;
    },

    async stock(ids) {
      return db
        .all<SRow>(`SELECT * FROM c_stock WHERE merchant = :tenant AND location = 'main'`)
        .filter((r) => !ids || ids.includes(r.product_id))
        .map((r): CStock => ({ productId: r.product_id, location: r.location, qty: r.qty, minQty: r.min_qty, updatedAt: iso(r.updated_at) }));
    },

    async adjustStock(actor: Actor, adj) {
      const pending: CStockAdjustment[] = [];
      for (const a of adj) {
        if (!(await self.getProduct(a.productId))) throw new Error(`Бараа олдсонгүй: ${a.productId}`);
        setStock(a.productId, Math.max(0, (stockRow(a.productId)?.qty ?? 0) + a.delta));
        const x: CStockAdjustment = { ...a, by: a.by || actor.name, id: `adj${Date.now().toString(36)}${rid(4)}`, at: iso(Date.now()) };
        db.run(`INSERT INTO c_adjustments (merchant, id, product_id, delta, reason, ref, by, status, at) VALUES (:tenant, ?, ?, ?, ?, ?, ?, 'pending', ?)`, x.id, x.productId, x.delta, x.reason, x.ref ?? null, x.by, Date.now());
        db.run(`INSERT INTO outbox (merchant, event, payload, next_at) VALUES (:tenant, 'stock.adjusted', ?, ?)`, JSON.stringify(x), Date.now());
        pending.push(x);
      }
      return { applied: [], pending };
    },

    async sales(range) {
      return db
        .all<{ id: string; ext_id: string; at: number; channel: string | null; lines: string; total: number; method: string | null; customer_id: string | null; status: string }>(
          `SELECT * FROM c_sales WHERE merchant = :tenant AND at >= ? AND at <= ? ORDER BY at`,
          range.from.getTime(),
          range.to.getTime(),
        )
        .map(
          (r): CSale => ({
            id: r.id,
            extId: r.ext_id,
            at: iso(r.at),
            channel: (["pos", "delivery", "online"].includes(r.channel ?? "") ? r.channel : "pos") as CSale["channel"],
            lines: json(r.lines, []),
            total: r.total,
            method: (["cash", "card", "qr"].includes(r.method ?? "") ? r.method : "other") as CSale["method"],
            customerId: r.customer_id ?? undefined,
            status: r.status === "refunded" ? "refunded" : "completed",
          }),
        );
    },

    async salesSummary(range, groupBy) {
      return summarize(await self.sales(range), groupBy);
    },

    async customers(q = {}) {
      const qq = norm(q.search ?? "");
      const list = db
        .all<{ id: string; ext_id: string | null; phone: string | null; name: string | null; opt_in: number; points: number | null }>(`SELECT * FROM c_customers WHERE merchant = :tenant`)
        .filter((c) => !qq || norm(`${c.name ?? ""} ${c.phone ?? ""}`).includes(qq))
        .map((c): CCustomer => ({ id: c.id, extId: c.ext_id ?? undefined, phone: c.phone ?? undefined, name: c.name ?? undefined, optIn: !!c.opt_in, points: c.points ?? undefined }));
      return q.limit ? list.slice(0, q.limit) : list;
    },

    async storeInfo(): Promise<StoreInfo> {
      const t = db.one<{ name: string }>(`SELECT name FROM tenants WHERE id = :tenant`);
      return { name: t?.name ?? "", deliveryEnabled: false };
    },
  };
  return self;
}
