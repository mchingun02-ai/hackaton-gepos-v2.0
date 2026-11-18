/**
 * ПОС адаптер (docs/ARCHITECTURE.md §4.2). `ctx.pos` — tenants.pos_kind-аар сонгогдоно:
 *   gepos     — Store Plus core (sp_state, SSE-ээр ПОС, портал руу шууд)
 *   connector — гуравдагч ПОС: c_* хүснэгт (sync горим; /api/v1 REST + webhook — 2-р шат)
 *   live      — түншийн connector-оос хүсэлтийн агшинд (§4B.2, pos/live.ts) — юу ч хадгалахгүй
 * Бүх арга async (live горимд сүлжээний дуудлага). GePOS дотроо синхрон withSp-ээ хэвээр ашиглана —
 * async адаптерын дуудлагыг withSp-ээс ГАДНА хийж, дотор нь зөвхөн синхрон өөрчлөлт.
 */
import type { Actor } from "@/lib/sp/core";
import type { TenantId } from "@/lib/tenant/context";
import type { CCustomer, CProduct, CSale, CSalesSummary, CStock, CStockAdjustment } from "./canonical";
import { connectorAdapter } from "./connector";
import { geposAdapter } from "./gepos";
import { liveAdapter } from "./live";

export type { Actor };

export type Capabilities = { orders: boolean; campaigns: boolean; refunds: boolean; loyalty: boolean; ebarimt: boolean; pushStock: "direct" | "webhook" };
/** `needs`-д шалгах боломжууд (boolean) */
export type Capability = Exclude<keyof Capabilities, "pushStock">;

/** Бараа нэмэх/засах: id байвал засна, үгүй бол шинээр. stock/minQty — үнэмлэхүй утга (захирлын гар засвар). */
export type ProductUpsert = Partial<CProduct> & { name: string; stock?: number; minQty?: number; /** шинэ бараа хаанаас нэмэгдсэн (GePOS) */ addedBy?: "pos" | "mobile" | "portal" };

export type StoreInfo = {
  name: string;
  description?: string;
  hours?: string;
  color?: string;
  deliveryEnabled: boolean;
  delivery?: { districts: string[]; fee: number };
  /** өнөөдөр идэвхтэй урамшуулал */
  promotions?: { name: string; type: "point" | "percent" | "amount" | "gift"; value?: number }[];
};

export type PosKind = "gepos" | "connector" | "live";

export interface PosAdapter {
  kind: PosKind;
  capabilities: Capabilities;
  listProducts(q?: { search?: string; barcode?: string; category?: string; limit?: number }): Promise<CProduct[]>;
  getProduct(id: string): Promise<CProduct | null>;
  upsertProduct(actor: Actor, p: ProductUpsert): Promise<CProduct>;
  stock(productIds?: string[]): Promise<CStock[]>;
  adjustStock(actor: Actor, adj: Omit<CStockAdjustment, "id" | "at">[]): Promise<{ applied: CStockAdjustment[]; pending: CStockAdjustment[] }>;
  /** Нэгтгэсэн борлуулалт (түүхий баримт татахгүй) — key: "YYYY-MM-DD" (day) эсвэл барааны нэр (product) */
  salesSummary(range: { from: Date; to: Date }, groupBy: "day" | "product"): Promise<CSalesSummary[]>;
  /** Түүхий борлуулалт — gepos/connector-т; live-д байхгүй (capability) */
  sales(range: { from: Date; to: Date }): Promise<CSale[]>;
  customers(q?: { search?: string; limit?: number }): Promise<CCustomer[]>;
  storeInfo(): Promise<StoreInfo>;
}

/** CSale[] → нэгтгэл (gepos, connector-т дундын) — буцаалтыг тооцохгүй */
export function summarize(list: CSale[], groupBy: "day" | "product"): CSalesSummary[] {
  const m = new Map<string, CSalesSummary>();
  for (const x of list) {
    if (x.status === "refunded") continue;
    if (groupBy === "day") {
      const key = new Date(x.at).toLocaleDateString("sv-SE", { timeZone: "Asia/Ulaanbaatar" });
      const r = m.get(key) ?? { key, qty: 0, total: 0, count: 0 };
      r.qty += x.lines.reduce((a, l) => a + l.qty, 0);
      r.total += x.total;
      r.count += 1;
      m.set(key, r);
    } else
      for (const l of x.lines) {
        const r = m.get(l.name) ?? { key: l.name, qty: 0, total: 0, count: 0 };
        r.qty += l.qty;
        r.total += l.qty * l.unitPrice;
        r.count += 1;
        m.set(l.name, r);
      }
  }
  return [...m.values()];
}

export function posFor(tenantId: TenantId, kind: string): PosAdapter {
  if (kind === "connector") return connectorAdapter(tenantId);
  if (kind === "live") return liveAdapter(tenantId);
  return geposAdapter(tenantId);
}
