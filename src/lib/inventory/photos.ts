/**
 * Тооллогын зураг: шалгах (≤ 4 МБ, magic bytes JPEG/PNG/WebP), шифрлэж хадгалах, унших, устгах.
 * Зам: data/tenants/<tenantId>/inv/<id>.bin — замыг сервер угсарна (id = [a-z0-9]{8,40}).
 */
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { decS, open, seal } from "@/lib/tenant/crypto";
import { safeFileId, tenantDir, type TenantContext } from "@/lib/tenant/context";
import { fail } from "@/lib/tenant/http";
import type { PhotoResult } from "./vision";

export const MAX_IMAGE = 4 * 1024 * 1024;
export type ImageKind = { mime: "image/jpeg" | "image/png" | "image/webp"; w: number | null; h: number | null };

/** Magic bytes + хэмжээс. Буруу бол 400. */
export function checkImage(buf: Buffer): ImageKind {
  if (!buf.length) fail(400, "Зураг хоосон байна");
  if (buf.length > MAX_IMAGE) fail(413, "Зураг 4 МБ-аас их байна");
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { mime: "image/jpeg", ...jpegSize(buf) };
  if (buf.length > 24 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])))
    return { mime: "image/png", w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
  if (buf.length > 30 && buf.toString("latin1", 0, 4) === "RIFF" && buf.toString("latin1", 8, 12) === "WEBP") return { mime: "image/webp", ...webpSize(buf) };
  return fail(400, "Зөвхөн JPEG, PNG, WebP зураг илгээнэ үү");
}

function jpegSize(b: Buffer): { w: number | null; h: number | null } {
  let i = 2;
  while (i + 9 < b.length) {
    if (b[i] !== 0xff) {
      i++;
      continue;
    }
    const m = b[i + 1];
    if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return { h: b.readUInt16BE(i + 5), w: b.readUInt16BE(i + 7) };
    if (m === 0xd8 || (m >= 0xd0 && m <= 0xd7) || m === 0x01) {
      i += 2;
      continue;
    }
    i += 2 + b.readUInt16BE(i + 2);
  }
  return { w: null, h: null };
}
function webpSize(b: Buffer): { w: number | null; h: number | null } {
  const t = b.toString("latin1", 12, 16);
  if (t === "VP8X") return { w: 1 + b.readUIntLE(24, 3), h: 1 + b.readUIntLE(27, 3) };
  if (t === "VP8 " && b.length > 30) return { w: b.readUInt16LE(26) & 0x3fff, h: b.readUInt16LE(28) & 0x3fff };
  if (t === "VP8L" && b.length > 25) {
    const v = b.readUInt32LE(21);
    return { w: (v & 0x3fff) + 1, h: ((v >> 14) & 0x3fff) + 1 };
  }
  return { w: null, h: null };
}

export const newPhotoId = () => `ph${randomBytes(10).toString("hex")}`;
const fileRef = (id: string) => `inv_photos|file|${id}`;
export const resultRef = (id: string) => `inv_photos|result|${id}`;
const fileOf = (ctx: TenantContext, id: string) => {
  if (!safeFileId(id)) fail(404, "Зураг олдсонгүй");
  return path.join(tenantDir(ctx, "inv"), `${id}.bin`);
};

/** Шифрлэж бичнэ, хадгалсан замыг (tenant хавтасны доторх нэр) буцаана */
export function writePhoto(ctx: TenantContext, id: string, buf: Buffer) {
  writeFileSync(fileOf(ctx, id), seal(ctx, buf, fileRef(id)), { mode: 0o600 });
  return `${id}.bin`;
}

export function readPhoto(ctx: TenantContext, id: string): { buf: Buffer; mime: string } {
  const row = ctx.db.one<{ id: string; path: string }>(`SELECT id, path FROM inv_photos WHERE id = ? AND merchant = :tenant`, id);
  if (!row || !row.path) fail(404, "Зураг олдсонгүй");
  const f = fileOf(ctx, row!.id);
  if (!existsSync(f)) fail(404, "Зураг устсан байна");
  const buf = open(ctx, readFileSync(f), fileRef(row!.id));
  return { buf, mime: checkImage(buf).mime };
}

export function removePhotoFile(ctx: TenantContext, id: string) {
  try {
    rmSync(fileOf(ctx, id), { force: true });
  } catch {
    /* аль хэдийн устсан */
  }
}

/** Хадгалах хугацаа: тооллого шийдвэрлэгдмэгц зураг, илрүүлэлтийн үр дүнг устгана (§4B.4 photos=on_approve) */
export function purgeSessionPhotos(ctx: TenantContext, sessionId: string) {
  const rows = ctx.db.all<{ id: string }>(`SELECT id FROM inv_photos WHERE merchant = :tenant AND session_id = ? AND path != ''`, sessionId);
  for (const r of rows) removePhotoFile(ctx, r.id);
  ctx.db.run(`UPDATE inv_photos SET path = '', result = NULL, status = CASE WHEN status = 'done' THEN 'purged' ELSE status END WHERE merchant = :tenant AND session_id = ?`, sessionId);
  return rows.length;
}

/** Тооллогын бүх амжилттай зургийн үр дүн (цоорхой, тайланд) */
export function sessionPhotoResults(ctx: TenantContext, sid: string) {
  const rows = ctx.db.all<{ id: string; result: string | null; at: number }>(
    `SELECT id, result, at FROM inv_photos WHERE merchant = :tenant AND session_id = ? AND kind = 'shelf' AND status = 'done' AND result IS NOT NULL ORDER BY at`,
    sid,
  );
  const out: { id: string; at: number; result: PhotoResult }[] = [];
  for (const r of rows)
    try {
      out.push({ id: r.id, at: r.at, result: JSON.parse(decS(ctx, r.result, resultRef(r.id))) as PhotoResult });
    } catch {
      /* гэмтсэн мөр — алгасна */
    }
  return out;
}
