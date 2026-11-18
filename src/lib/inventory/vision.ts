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
import { aliasList, matchOne } from "./match";
import { checkImage, newPhotoId, removePhotoFile, resultRef, writePhoto } from "./photos";
import { parseShelf, SHELF_SYSTEM, shelfUser, type ShelfGap, type ShelfResult } from "./prompts";
import { profilesFor, sessionProducts, sessionRow, whoOf } from "./sessions";

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
  productId: string | null;
  name: string | null;
  via: "alias" | "barcode" | "name" | null;
  score: number;
  suggestions: { id: string; name: string; score: number }[];
  facings: number;
  rows: number;
  confidence: number;
  bbox: [number, number, number, number] | null;
  priceTag: number | null;
  depth: number | null;
};
export type PhotoResult = { detections: Detection[]; gaps: ShelfGap[]; quality: ShelfResult["quality"]; retake: string | null };

export async function shelfPhoto(ctx: Ctx, sid: string, buf: Buffer) {
  const s = sessionRow(ctx, sid);
  if (s.status !== "counting") fail(409, "Тооллого тоолж буй төлөвт биш байна");
  rate(`invphoto:${ctx.tenantId}`, 20);
  const img = checkImage(buf);
  const res = reserve(ctx, "inv_photo", COST_SHELF);
  const id = newPhotoId();
  const w = whoOf(ctx);
  try {
    writePhoto(ctx, id, buf);
    ctx.db.run(
      `INSERT INTO inv_photos (id, merchant, session_id, kind, path, w, h, status, model, by, at) VALUES (?, :tenant, ?, 'shelf', ?, ?, ?, 'processing', ?, ?, ?)`,
      id,
      s.id,
      `${id}.bin`,
      img.w,
      img.h,
      qcfg().vision,
      JSON.stringify({ id: w.id, name: w.name }),
      Date.now(),
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
    return { photo: { id, status: "failed" as const, w: img.w, h: img.h }, message: `${msg}. Кредит буцаагдлаа — баркод эсвэл гараар үргэлжлүүлнэ үү.`, result: null };
  }
  settle(ctx, res, id);
  const profs = profilesFor(
    ctx,
    products.map((p) => p.id),
  );
  const detections: Detection[] = parsed.items.map((it, i) => {
    const m = matchOne(it, products, alias);
    const p = m.productId ? products.find((x) => x.id === m.productId) : undefined;
    return {
      i,
      label: it.label,
      productId: m.productId,
      name: p?.name ?? null,
      via: m.via,
      score: m.score,
      suggestions: m.suggestions,
      facings: it.facings,
      rows: it.stacked_rows,
      confidence: it.confidence,
      bbox: it.bbox,
      priceTag: it.price_tag,
      depth: m.productId ? (profs.get(m.productId)?.depth ?? null) : null,
    };
  });
  const q = parsed.quality;
  const retake = q.blurry ? "Зураг бүдэг байна. Дахин авна уу." : q.too_dark ? "Зураг харанхуй байна. Гэрэлтэй газар дахин авна уу." : null;
  const result: PhotoResult = { detections, gaps: parsed.gaps, quality: q, retake };
  ctx.db.run(`UPDATE inv_photos SET status = 'done', result = ? WHERE id = ? AND merchant = :tenant`, encS(ctx, JSON.stringify(result), resultRef(id)), id);
  return { photo: { id, status: "done" as const, w: img.w, h: img.h }, message: retake, result };
}
