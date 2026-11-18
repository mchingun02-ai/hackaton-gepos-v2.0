"use client";

/** Тавиурын зураг: жижигрүүлэх + dHash → илгээх (байршил, «бараг ижил» анхааруулгыг алгасах force) */
import { call } from "./api";
import { prepareShot, type Shot } from "./image";
import type { PhotoResp } from "./types";

/** queue — олноор сонгосон дараагийн зургууд (тус бүр өөрийн «Тавиур N») */
export type ShotView = { url: string; w: number; h: number; blob: Blob; phash: string | null; resp: PhotoResp; queue?: File[] };

export async function sendShelf(sid: string, shot: Pick<Shot, "blob" | "phash">, opts: { place?: string; force?: boolean } = {}) {
  const fd = new FormData();
  fd.append("image", shot.blob, "shelf.jpg");
  if (shot.phash) fd.append("phash", shot.phash);
  if (opts.place) fd.append("place", opts.place);
  if (opts.force) fd.append("force", "1");
  return call<PhotoResp>(`/api/v1/inventory/sessions/${encodeURIComponent(sid)}/photos`, { method: "POST", body: fd });
}

export async function shootShelf(sid: string, file: File, opts: { place?: string } = {}): Promise<ShotView> {
  const s = await prepareShot(file);
  const resp = await sendShelf(sid, s, opts);
  return { url: s.url, w: s.w, h: s.h, blob: s.blob, phash: s.phash, resp };
}

/** «Тоолж эхлэх»: идэвхтэй (бүх бараа) тооллогыг үргэлжлүүлнэ, байхгүй бол үүсгэнэ */
export const ensureSession = () => call<{ session: { id: string; status: string }; nextPlace: string; places: string[] }>("/api/v1/inventory/sessions", { method: "POST", json: { scope: "all", ensure: true } });
