/**
 * ПОС-оос хамааралгүй каноник загвар (docs/ARCHITECTURE.md §4.1).
 * AI хэрэгсэл, тооллого зөвхөн үүнийг мэднэ — GePOS эсвэл гуравдагч ПОС адаптераар хөрвүүлнэ.
 * Мөнгө ₮ бүхэл, цаг ISO-8601.
 */

export type Unit = "pcs" | "kg" | "l" | "pack";

export type CProduct = {
  id: string;
  extId?: string;
  sku?: string;
  barcodes: string[];
  name: string;
  brand?: string;
  category?: string;
  unit: Unit;
  /** эх системийн нэгжийн нэр (ш, кг, багц…) — харуулахад; байхгүй бол unitLabel(unit) */
  unitLabel?: string;
  price: number;
  cost?: number;
  active: boolean;
  imageUrl?: string;
  /** БҮНА */
  taxCode?: string;
  /** хүргэлтээр зардаг бараа эсэх (ПОС дэмжвэл) */
  delivery?: boolean;
  /** хүргэлт түр зогссон (GePOS) */
  deliveryStopped?: boolean;
  updatedAt: string;
};

export type CStock = { productId: string; location: string; qty: number; minQty: number; updatedAt: string };
export type CSaleLine = { productId?: string; name: string; qty: number; unitPrice: number };
export type CSale = {
  id: string;
  extId?: string;
  at: string;
  channel: "pos" | "delivery" | "online";
  lines: CSaleLine[];
  total: number;
  method: "cash" | "card" | "qr" | "other";
  customerId?: string;
  status: "completed" | "refunded";
};
/** Нэгтгэсэн борлуулалт (§4B.2 `sales/summary`) — key: өдөр (YYYY-MM-DD) эсвэл бараа */
export type CSalesSummary = { key: string; qty: number; total: number; count: number };
export type CCustomer = { id: string; extId?: string; phone?: string; name?: string; optIn: boolean; points?: number };
export type CStockAdjustment = {
  id: string;
  productId: string;
  delta: number;
  reason: "count" | "damage" | "expiry" | "manual";
  /** тооллогын session id */
  ref?: string;
  by: string;
  at: string;
};

/** Эх системийн нэгж → каноник */
export function toUnit(u: string | undefined | null): Unit {
  const x = (u ?? "").trim().toLocaleLowerCase("mn");
  if (["kg", "кг", "килограм"].includes(x)) return "kg";
  if (["l", "л", "литр"].includes(x)) return "l";
  if (["pack", "багц", "хайрцаг", "уут"].includes(x)) return "pack";
  return "pcs";
}
export const unitLabel = (p: Pick<CProduct, "unit" | "unitLabel">) => p.unitLabel || { pcs: "ш", kg: "кг", l: "л", pack: "багц" }[p.unit];

/** Хайлт, харьцуулалтад нэр хэвийн болгох (жижиг үсэг, ишлэлгүй) */
export const norm = (s: string) => s.toLocaleLowerCase("mn").replace(/[«»"']/g, "").trim();

/** Нэр + ангилалд хайх үг таарах эсэх (бүтэн мөр эсвэл аль нэг үг) */
export function matches(p: Pick<CProduct, "name" | "category">, search: string) {
  const q = norm(search);
  if (!q) return true;
  const words = q.split(/\s+/).filter((w) => w.length > 1);
  const n = norm(`${p.name} ${p.category ?? ""}`);
  return n.includes(q) || words.some((w) => n.includes(w));
}
