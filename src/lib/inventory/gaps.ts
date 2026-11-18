/**
 * Тавиурын цоорхой / тавиурт алга бараа (docs/ARCHITECTURE.md §5.7, MVP — тавиурын зургийн ижил дуудлагаас):
 *  1. Prompt A-ийн `gaps` (үнийн шошго байгаа боловч бараа алга)
 *  2. Зурагт орсон ангиллын бараа зурагт огт илрээгүй ба системд үлдэгдэлтэй (> 0) → «агуулахаас гарга»
 */
import type { TenantContext } from "@/lib/tenant/context";
import { sessionProducts } from "./sessions";
import { sessionPhotoResults } from "./photos";

type Ctx = TenantContext;

/** Цэвэр: илэрсэн бараа, ангилал, үлдэгдлээс «тавиурт алга» жагсаалт */
export function missingOnShelf(
  products: { id: string; name: string; category: string }[],
  detected: ReadonlySet<string>,
  stock: ReadonlyMap<string, number>,
) {
  const cats = new Set(products.filter((p) => detected.has(p.id)).map((p) => p.category));
  return products.filter((p) => cats.has(p.category) && !detected.has(p.id) && (stock.get(p.id) ?? 0) > 0).map((p) => ({ productId: p.id, name: p.name, category: p.category, stock: stock.get(p.id) ?? 0 }));
}

export async function shelfGaps(ctx: Ctx, sid?: string | null) {
  const s = sid
    ? ctx.db.one<{ id: string; no: number; name: string; status: string }>(`SELECT id, no, name, status FROM inv_sessions WHERE id = ? AND merchant = :tenant`, String(sid).slice(0, 64))
    : ctx.db.one<{ id: string; no: number; name: string; status: string }>(
        `SELECT s.id, s.no, s.name, s.status FROM inv_sessions s WHERE s.merchant = :tenant AND EXISTS (SELECT 1 FROM inv_photos p WHERE p.merchant = :tenant AND p.session_id = s.id AND p.status = 'done') ORDER BY s.created_at DESC LIMIT 1`,
      );
  if (!s) return { session: null, photos: 0, gaps: [], missing: [] };
  const photos = sessionPhotoResults(ctx, s.id);
  const detected = new Set<string>();
  const gaps: { photoId: string; nearLabel: string; priceTagText: string | null; bbox: number[] | null }[] = [];
  for (const ph of photos) {
    for (const d of ph.result.detections) if (d.productId && d.facings > 0) detected.add(d.productId);
    for (const g of ph.result.gaps) gaps.push({ photoId: ph.id, nearLabel: g.near_label, priceTagText: g.price_tag_text, bbox: g.bbox });
  }
  if (!photos.length) return { session: { id: s.id, no: s.no, name: s.name }, photos: 0, gaps, missing: [] };
  const inSession = new Set(sessionProducts(ctx, s.id).map((p) => p.id));
  const all = (await ctx.pos.listProducts()).filter((p) => p.active && inSession.has(p.id));
  const stock = new Map((await ctx.pos.stock(all.map((p) => p.id))).map((x) => [x.productId, x.qty]));
  const missing = missingOnShelf(
    all.map((p) => ({ id: p.id, name: p.name, category: p.category ?? "" })),
    detected,
    stock,
  );
  return { session: { id: s.id, no: s.no, name: s.name }, photos: photos.length, gaps, missing };
}
