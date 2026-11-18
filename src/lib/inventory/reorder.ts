/**
 * Захиалах санал (docs/ARCHITECTURE.md §5.7) — AI-гүй, цэвэр тооцоо.
 *   v = сүүлийн 14 хоногийн өдрийн дундаж борлуулалт
 *   reorder_point = v × lead_days(3) + minQty
 *   qty ≤ reorder_point бол suggest = ceil(v × 14 − qty) → pack_size-ийн үржвэрт
 *   days_cover = qty / v
 */
import type { TenantContext } from "@/lib/tenant/context";
import { profilesFor } from "./sessions";

export const WINDOW_DAYS = 14;
export const DEFAULT_LEAD = 3;

export type ReorderInput = { qty: number; minQty: number; sold: number; days?: number; leadDays?: number | null; packSize?: number | null };
export type ReorderOut = { velocity: number; reorderPoint: number; suggest: number; daysCover: number | null };

export function suggestReorder(x: ReorderInput): ReorderOut {
  const days = x.days ?? WINDOW_DAYS;
  const v = Math.max(0, x.sold) / days;
  const lead = x.leadDays && x.leadDays > 0 ? x.leadDays : DEFAULT_LEAD;
  const qty = Math.max(0, x.qty);
  const rp = v * lead + Math.max(0, x.minQty);
  let suggest = 0;
  if (qty <= rp) {
    // борлуулалтгүй ч доод хэмжээнээс бага бол доод хэмжээ хүртэл
    suggest = v > 0 ? Math.ceil(v * days - qty) : Math.ceil(Math.max(0, x.minQty - qty));
    suggest = Math.max(0, suggest);
    const pack = x.packSize && x.packSize > 1 ? x.packSize : 1;
    if (suggest > 0) suggest = Math.ceil(suggest / pack) * pack;
  }
  return { velocity: Math.round(v * 100) / 100, reorderPoint: Math.round(rp * 10) / 10, suggest, daysCover: v > 0 ? Math.round((qty / v) * 10) / 10 : null };
}

export async function reorderList(ctx: TenantContext, limit = 50) {
  const to = new Date();
  const from = new Date(to.getTime() - WINDOW_DAYS * 86_400_000);
  const [products, stock] = await Promise.all([ctx.pos.listProducts(), ctx.pos.stock()]);
  let salesOk = true;
  const sold = new Map<string, number>();
  try {
    for (const s of await ctx.pos.sales({ from, to }))
      if (s.status !== "refunded") for (const l of s.lines) if (l.productId) sold.set(l.productId, (sold.get(l.productId) ?? 0) + l.qty);
  } catch {
    // live горимд түүхий борлуулалт байхгүй — нэгтгэлээр (нэрээр) тааруулна
    salesOk = false;
    try {
      const byName = new Map((await ctx.pos.salesSummary({ from, to }, "product")).map((x) => [x.key, x.qty]));
      for (const p of products) if (byName.has(p.name)) sold.set(p.id, byName.get(p.name)!);
    } catch {
      /* борлуулалтын мэдээлэлгүй */
    }
  }
  const st = new Map(stock.map((x) => [x.productId, x]));
  const profs = profilesFor(
    ctx,
    products.map((p) => p.id),
  );
  const items = products
    .filter((p) => p.active)
    .map((p) => {
      const s = st.get(p.id);
      const pr = profs.get(p.id);
      const r = suggestReorder({ qty: s?.qty ?? 0, minQty: s?.minQty ?? 0, sold: sold.get(p.id) ?? 0, leadDays: pr?.leadDays, packSize: pr?.packSize });
      return { productId: p.id, name: p.name, qty: s?.qty ?? 0, minQty: s?.minQty ?? 0, sold14: sold.get(p.id) ?? 0, packSize: pr?.packSize ?? null, cost: p.cost ?? null, ...r };
    })
    .filter((x) => x.suggest > 0)
    .sort((a, b) => (a.daysCover ?? (a.qty <= a.minQty ? -1 : 9e9)) - (b.daysCover ?? (b.qty <= b.minQty ? -1 : 9e9)) || b.velocity - a.velocity)
    .slice(0, Math.min(200, Math.max(1, limit)));
  const value = items.reduce((a, x) => a + x.suggest * (x.cost ?? 0), 0);
  return { windowDays: WINDOW_DAYS, salesSource: salesOk ? "sales" : "summary", items, estimatedCost: Math.round(value) };
}
