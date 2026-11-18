/**
 * Тавиурын зургаар тоолох (docs/ARCHITECTURE.md §5.3): Qwen (AI_VISION_MODEL, анхдагч qwen3.6-plus) зөвхөн
 * нүүрэн талын тоо (facings) ба таних; гүнийг ажилтан оруулна; үр дүн бүрийг хүн батална (D7).
 *
 * Кредит: 3 (эхлээд нөөцөлж, алдаа гарвал буцаана). JSON-ийг текстээс задална (gateway зурагтай үед
 * response_format дамжуулах нь нотлогдоогүй) → схемээр шалгаж хавчина → 1 удаа дахин оролдоно → бүтэлгүйтвэл
 * кредит буцааж «баркод/гараар үргэлжлүүлнэ үү».
 */
import { refund, reserve, settle } from "@/lib/agent/billing";
import { AiError, chat, qcfg, type ChatMsg } from "@/lib/agent/qwen";
import type { TenantContext } from "@/lib/tenant/context";
import { encS } from "@/lib/tenant/crypto";
import { fail, rate } from "@/lib/tenant/http";
import { aliasList, hamming, isHash, resolveDetection, SIMILAR_BITS, touchesEdge } from "./match";
import { checkImage, newPhotoId, removePhotoFile, resultRef, sessionPhotoResults, writePhoto } from "./photos";
import { parseShelf, SHELF_SYSTEM, shelfUser, type ShelfGap, type ShelfResult } from "./prompts";
import { depthFor, placeBreakdown, sessionPlaces, sessionProducts, sessionRow, whoOf, type PlaceQty } from "./sessions";

type Ctx = TenantContext;
export const COST_SHELF = 3;
export const COST_DRAFT = 2;


/** Qwen-ийг зурагтай дуудаж, parse амжилттай болтол 1 удаа дахин оролдоно */
export async function visionCall<T>(ctx: Ctx, kind: string, system: string, images: { mime: string; buf: Buffer }[], text: string, parse: (raw: string) => T): Promise<T> {
  const msgs: ChatMsg[] = [
    { role: "system", content: system },
    { role: "user", content: [...images.map((im) => ({ type: "image_url", image_url: { url: `data:${im.mime};base64,${im.buf.toString("base64")}` } })), { type: "text", text }] },
  ];
  let last: unknown = null;
  let json = true;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const m = await chat(ctx, msgs, { model: qcfg().vision, json, temperature: 0, maxTokens: 1500, kind });
      return parse(typeof m.content === "string" ? m.content : "");
    } catch (e) {
      last = e;
      // gateway зурагтай үед json_object-ыг татгалзвал дараагийн оролдлогод түүнгүйгээр
      if (e instanceof AiError && e.status !== 429 && e.status !== 503) json = false;
      if (e instanceof AiError && e.status === 503) break;
    }
  }
  throw last instanceof Error ? last : new Error("Vision алдаа");
}

export type Detection = {
  i: number;
  label: string;
  /** matched — автоматаар холбосон (ажилтан сонгохгүй) · ambiguous — 2–3 сонголт · unknown — шинэ бараа/алгасах */
  status: "matched" | "ambiguous" | "unknown";
  productId: string | null;
  name: string | null;
  via: "alias" | "barcode" | "name" | "price" | null;
  score: number;
  candidates: { id: string; name: string; score: number }[];
  facings: number;
  rows: number;
  confidence: number;
  bbox: [number, number, number, number] | null;
  priceTag: number | null;
  /** урьдчилж бөглөх гүн: санасан (байршил/бараа) эсвэл AI ≥ 0.8 итгэлтэй; null бол асууна */
  depth: number | null;
  depthSource: "place" | "product" | "ai" | null;
  /** AI-ийн гүний санал (итгэл < 0.8 бол зөвхөн санал — автоматаар хэрэглэхгүй) */
  depthEst: number | null;
  depthConf: number;
  /** өөр байршилд аль хэдийн тоологдсон (Тавиур 1: 12 · Агуулах: 24) */
  elsewhere: PlaceQty[];
  /** 60 сек дотор авсан өөр зурагт ирмэг дээр мөн гарсан — давхар тоологдсон байж магадгүй */
  dupSuspect: { photoId: string; place: string } | null;
};
export type PhotoResult = { place: string; detections: Detection[]; gaps: ShelfGap[]; quality: ShelfResult["quality"]; retake: string | null };

const DEPTH_AUTO = 0.8;
const DUP_WINDOW_MS = 60_000;

export type ShelfOpts = { place?: unknown; phash?: unknown; force?: unknown };

export async function shelfPhoto(ctx: Ctx, sid: string, buf: Buffer, opts: ShelfOpts = {}) {
  const s = sessionRow(ctx, sid);
  if (s.status !== "counting") fail(409, "Тооллого тоолж буй төлөвт биш байна");
  const img = checkImage(buf);
  const place = (typeof opts.place === "string" && opts.place.trim() ? opts.place.trim() : sessionPlaces(ctx, s.id).nextPlace).slice(0, 40);
  const phash = isHash(opts.phash) ? opts.phash : null;
  // Ойролцоо зураг: кредит зарцуулахаас ӨМНӨ анхааруулна («Өмнөх зурагтай бараг ижил — солих уу?»)
  if (phash && opts.force !== true && opts.force !== "1") {
    const prev = ctx.db.all<{ id: string; place: string | null; phash: string | null }>(
      `SELECT id, place, phash FROM inv_photos WHERE merchant = :tenant AND session_id = ? AND kind = 'shelf' AND status = 'done' AND phash IS NOT NULL ORDER BY at DESC`,
      s.id,
    );
    const near = prev.map((p) => ({ ...p, d: hamming(phash, p.phash!) })).filter((p) => p.d <= SIMILAR_BITS).sort((a, b) => a.d - b.d)[0];
    if (near) return { similar: { photoId: near.id, place: near.place ?? "", distance: near.d }, photo: null, message: `Өмнөх зурагтай бараг ижил (${near.place ?? ""}) — солих уу?`, result: null };
  }
  rate(`invphoto:${ctx.tenantId}`, 20);
  const res = reserve(ctx, "inv_photo", COST_SHELF);
  const id = newPhotoId();
  const w = whoOf(ctx);
  try {
    writePhoto(ctx, id, buf);
    ctx.db.run(
      `INSERT INTO inv_photos (id, merchant, session_id, kind, path, w, h, status, model, by, at, place, phash) VALUES (?, :tenant, ?, 'shelf', ?, ?, ?, 'processing', ?, ?, ?, ?, ?)`,
      id,
      s.id,
      `${id}.bin`,
      img.w,
      img.h,
      qcfg().vision,
      JSON.stringify({ id: w.id, name: w.name }),
      Date.now(),
      place,
      phash,
    );
  } catch (e) {
    refund(ctx, res);
    removePhotoFile(ctx, id);
    throw e;
  }
  const products = sessionProducts(ctx, s.id);
  const { cands, alias } = aliasList(products);
  let parsed: ShelfResult;
  try {
    parsed = await visionCall(ctx, "inv_photo", SHELF_SYSTEM, [{ mime: img.mime, buf }], shelfUser(cands), (raw) => parseShelf(raw, new Set(alias.keys())));
  } catch (e) {
    refund(ctx, res);
    const msg = e instanceof AiError && e.status === 503 ? "AI тохируулаагүй" : "Зураг уншиж чадсангүй";
    ctx.db.run(`UPDATE inv_photos SET status = 'failed', error = ? WHERE id = ? AND merchant = :tenant`, msg, id);
    return { similar: null, photo: { id, status: "failed" as const, w: img.w, h: img.h, place }, message: `${msg}. Кредит буцаагдлаа — баркод эсвэл гараар үргэлжлүүлнэ үү.`, result: null };
  }
  settle(ctx, res, id);
  // 60 сек дотор өөр байршилд авсан зургууд (ирмэг дээрх ижил бараа → давхар байж магадгүй)
  const recent = sessionPhotoResults(ctx, s.id).filter((p) => p.id !== id && Date.now() - p.at <= DUP_WINDOW_MS && p.result.place !== place);
  const bp = placeBreakdown(ctx, s.id);
  const detections: Detection[] = parsed.items.map((it, i) => {
    const m = resolveDetection(it, products, alias);
    const p = m.productId ? products.find((x) => x.id === m.productId) : undefined;
    const known = m.productId ? depthFor(ctx, m.productId, place) : { depth: null, source: null };
    // Урдаас авсан зурагт загвар «гүн 1»-ийг өндөр итгэлтэй гэж буцаадаг (хэмжсэн, docs/inventory-vision-accuracy.md) —
    // гүнийг зөвхөн ≥ 2 ба итгэл ≥ 0.8 үед урьдчилж бөглөнө; бусад үед санал л (ажилтан нэг товшилтоор сонгоно)
    const aiOk = it.depth_est != null && it.depth_est >= 2 && it.depth_conf >= DEPTH_AUTO;
    const dup =
      m.productId && touchesEdge(it.bbox)
        ? recent.map((r) => ({ r, d: r.result.detections.find((x) => x.productId === m.productId && touchesEdge(x.bbox)) })).find((x) => x.d)
        : undefined;
    return {
      i,
      label: it.label,
      status: m.status,
      productId: m.productId,
      name: p?.name ?? null,
      via: m.via,
      score: m.score,
      candidates: m.candidates,
      facings: it.facings,
      rows: it.stacked_rows,
      confidence: it.confidence,
      bbox: it.bbox,
      priceTag: it.price_tag,
      depth: known.depth ?? (aiOk ? it.depth_est : null),
      depthSource: known.depth ? known.source : aiOk ? "ai" : null,
      depthEst: it.depth_est,
      depthConf: it.depth_conf,
      elsewhere: m.productId ? (bp.get(m.productId) ?? []).filter((x) => x.place !== place) : [],
      dupSuspect: dup ? { photoId: dup.r.id, place: dup.r.result.place } : null,
    };
  });
  const q = parsed.quality;
  const retake = q.blurry ? "Зураг бүдэг байна. Дахин авна уу." : q.too_dark ? "Зураг харанхуй байна. Гэрэлтэй газар дахин авна уу." : null;
  const result: PhotoResult = { place, detections, gaps: parsed.gaps, quality: q, retake };
  ctx.db.run(`UPDATE inv_photos SET status = 'done', result = ? WHERE id = ? AND merchant = :tenant`, encS(ctx, JSON.stringify(result), resultRef(id)), id);
  return { similar: null, photo: { id, status: "done" as const, w: img.w, h: img.h, place }, message: retake, result, places: sessionPlaces(ctx, s.id).places };
}
