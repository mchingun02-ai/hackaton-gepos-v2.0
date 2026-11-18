/**
 * Хадгалах зүйлийн шифрлэлт (docs/ARCHITECTURE.md §4B.3). ТОГТВОРТОЙ API — kb.ts, crm.ts, inventory/* ашиглана.
 *
 *   seal(ctx, buf: Buffer, ref?)   → Buffer  "GE1\0" | iv(12) | tag(16) | ct      — файл (тооллогын зураг г.м)
 *   seal(ctx, text: string, ref?)  → string  "e1.<iv>.<tag>.<ct>" (base64url)      — талбар
 *   open(ctx, box: Buffer, ref?)   → Buffer  (шифрлэгдсэн файл биш бол throw)
 *   open(ctx, box: string|null, ref?) → string (шифрлээгүй хуучин утгыг ӨӨРЧЛӨЛТГҮЙ буцаана — шилжилтийн үе)
 *   encS(ctx, text, ref) / decS(ctx, box, ref)  — талбар (seal/open string-ийн alias)
 *   enc(ctx, ref, plain) / dec(ctx, ref, box)   — §4B.3-ийн нэрс
 *   sealN / openN      — nullable багана
 *   isSealed(s)        — "e1." угтвартай эсэх
 *   blindIndex(ctx, v) — тэнцүү хайлтын сохор индекс HMAC(DEK, утга)
 *   shredTenant(id)    — крипто-устгалт: DEK устгана (нөөц хуулбар дахь шифр текст ч уншигдахгүй)
 *   sealSystem / openSystem — tenant-гүй нууц (түншийн connector/webhook secret)
 *
 * `ref` КОНВЕНЦ: `${table}|${column}|${row.id}` (ж: "messages|text|m123"; файл: "inv_photos|file|<id>") — AAD = `${tenant}|${ref}`,
 * шифр текстийг өөр мөр/tenant руу хуулбал тайлагдахгүй. Ижил ref-ийг seal/open хоёуланд. Экспорт (§4B.4) энэ конвенцоор тайлна.
 *
 * Tenant бүрт санамсаргүй 32 байт DEK; `tenant_keys`-д KEK-ээр ороосон (AES-256-GCM, AAD "dek|<tenant>").
 * KEK = `TENANT_KEK` эсвэл `DATA_KEK` (орчны хувьсагч, текст → sha256). Байхгүй бол `AUTH_SECRET`-ээс HKDF-ээр
 * (хөгжүүлэлтэд) — DB файл/dump дангаараа уншигдахгүй. DEK санах ойд ≤ 15 мин.
 */
import { createCipheriv, createDecipheriv, createHash, createHmac, hkdfSync, randomBytes } from "node:crypto";
import type { TenantContext } from "./context";
import { rawOne, rawRun } from "./raw";

/** seal/open-д хэрэгтэй хамгийн бага контекст (TenantContext ч болно) */
export type SealCtx = Pick<TenantContext, "tenantId">;

export class CryptoError extends Error {}

const PREFIX = "e1.";
const FILE_MAGIC = Buffer.from("GE1\0");
const KEK_ID = "env1";
const DEK_TTL_MS = 15 * 60_000;

/* ───────── KEK ───────── */

function kek(): Buffer {
  const k = process.env.TENANT_KEK || process.env.DATA_KEK;
  if (k) return createHash("sha256").update(k).digest();
  const s = process.env.AUTH_SECRET;
  if (!s) throw new CryptoError("TENANT_KEK (DATA_KEK) эсвэл AUTH_SECRET тохируулаагүй — шифрлэх түлхүүр алга");
  return Buffer.from(hkdfSync("sha256", s, "gepos-kek", "tenant-dek-wrap", 32));
}

function gcm(key: Buffer, plain: Buffer, aad: string) {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key, iv);
  c.setAAD(Buffer.from(aad));
  const ct = Buffer.concat([c.update(plain), c.final()]);
  return { iv, tag: c.getAuthTag(), ct };
}
function ungcm(key: Buffer, iv: Buffer, tag: Buffer, ct: Buffer, aad: string) {
  const d = createDecipheriv("aes-256-gcm", key, iv);
  d.setAAD(Buffer.from(aad));
  d.setAuthTag(tag);
  return Buffer.concat([d.update(ct), d.final()]);
}

/* ───────── DEK (tenant бүрт) ───────── */

const g = globalThis as unknown as { __tenantDek?: Map<string, { k: Buffer; at: number }> };
const cache = () => (g.__tenantDek ??= new Map());

function dek(tenantId: string, create = true): Buffer {
  const hit = cache().get(tenantId);
  if (hit && Date.now() - hit.at < DEK_TTL_MS) return hit.k;
  let row = rawOne<{ wrapped_dek: string; destroyed_at: number | null }>(`SELECT wrapped_dek, destroyed_at FROM tenant_keys WHERE merchant = ?`, tenantId);
  if (!row) {
    if (!create) throw new CryptoError("Түрээслэгчийн түлхүүр устгагдсан эсвэл үүсээгүй");
    const w = gcm(kek(), randomBytes(32), `dek|${tenantId}`);
    // зэрэг үүсгэлтэд нэг нь ялна — дараа нь DB-ээс дахин уншина
    rawRun(
      `INSERT OR IGNORE INTO tenant_keys (merchant, wrapped_dek, kek_id, created_at) VALUES (?, ?, ?, ?)`,
      tenantId,
      [w.iv, w.tag, w.ct].map((b) => b.toString("base64url")).join("."),
      KEK_ID,
      Date.now(),
    );
    row = rawOne(`SELECT wrapped_dek, destroyed_at FROM tenant_keys WHERE merchant = ?`, tenantId);
  }
  if (!row || row.destroyed_at) throw new CryptoError("Түрээслэгчийн түлхүүр устгагдсан");
  const [iv, tag, ct] = row.wrapped_dek.split(".").map((x) => Buffer.from(x, "base64url"));
  let k: Buffer;
  try {
    k = ungcm(kek(), iv, tag, ct, `dek|${tenantId}`);
  } catch {
    throw new CryptoError("Түрээслэгчийн түлхүүрийг тайлж чадсангүй (KEK өөрчлөгдсөн?)");
  }
  cache().set(tenantId, { k, at: Date.now() });
  return k;
}

const aad = (ctx: SealCtx, ref: string) => `${ctx.tenantId}|${ref}`;

/* ───────── нийтийн API ───────── */

export const isSealed = (s: unknown): s is string => typeof s === "string" && s.startsWith(PREFIX);

/** Талбар шифрлэх: `e1.<iv>.<tag>.<ct>` (base64url) */
export function encS(ctx: SealCtx, text: string, ref: string): string {
  const { iv, tag, ct } = gcm(dek(ctx.tenantId), Buffer.from(text, "utf8"), aad(ctx, ref));
  return `${PREFIX}${iv.toString("base64url")}.${tag.toString("base64url")}.${ct.toString("base64url")}`;
}
/** Шифрлээгүй (хуучин) утгыг тэр чигээр нь буцаана */
export function decS(ctx: SealCtx, box: string | null | undefined, ref: string): string {
  if (box == null) return "";
  if (!isSealed(box)) return box;
  const parts = box.split(".");
  if (parts.length !== 4) throw new CryptoError("Шифр текстийн хэлбэр буруу");
  const [, iv, tag, ct] = parts;
  try {
    return ungcm(dek(ctx.tenantId, false), Buffer.from(iv, "base64url"), Buffer.from(tag, "base64url"), Buffer.from(ct, "base64url"), aad(ctx, ref)).toString("utf8");
  } catch (e) {
    if (e instanceof CryptoError) throw e;
    throw new CryptoError("Тайлж чадсангүй (өөр мөр/tenant-ын шифр эсвэл гэмтсэн)");
  }
}

/** Файл: GE1\0 | iv(12) | tag(16) | ct · Текст: "e1.…" */
export function seal(ctx: SealCtx, buf: Buffer, ref?: string): Buffer;
export function seal(ctx: SealCtx, text: string, ref?: string): string;
export function seal(ctx: SealCtx, x: Buffer | string, ref?: string): Buffer | string {
  if (typeof x === "string") return encS(ctx, x, ref ?? "");
  const { iv, tag, ct } = gcm(dek(ctx.tenantId), Buffer.from(x), aad(ctx, ref ?? "file"));
  return Buffer.concat([FILE_MAGIC, iv, tag, ct]);
}

export function open(ctx: SealCtx, box: Buffer, ref?: string): Buffer;
export function open(ctx: SealCtx, box: string | null | undefined, ref?: string): string;
export function open(ctx: SealCtx, box: Buffer | string | null | undefined, ref?: string): Buffer | string {
  if (box == null || typeof box === "string") return decS(ctx, box, ref ?? "");
  if (box.length < 32 || !box.subarray(0, 4).equals(FILE_MAGIC)) throw new CryptoError("Шифрлэгдсэн файл биш");
  try {
    return ungcm(dek(ctx.tenantId, false), box.subarray(4, 16), box.subarray(16, 32), box.subarray(32), aad(ctx, ref ?? "file"));
  } catch (e) {
    if (e instanceof CryptoError) throw e;
    throw new CryptoError("Файлыг тайлж чадсангүй");
  }
}

/** Шифрлэгдсэн файл эсэх */
export const isSealedFile = (b: Uint8Array) => b.length >= 32 && Buffer.from(b.subarray(0, 4)).equals(FILE_MAGIC);

/** null-ийг хадгалах хувилбарууд (nullable багана) */
export const sealN = (ctx: SealCtx, plain: string | null | undefined, ref: string) => (plain == null ? null : encS(ctx, plain, ref));
export const openN = (ctx: SealCtx, box: string | null | undefined, ref: string) => (box == null ? null : decS(ctx, box, ref));

/** §4B.3-ийн нэрс */
export const enc = (ctx: SealCtx, ref: string, plain: string) => encS(ctx, plain, ref);
export const dec = (ctx: SealCtx, ref: string, box: string | null | undefined) => decS(ctx, box, ref);

/** Тэнцүү хайлтын сохор индекс (ж: утас, ext_id) — HMAC(DEK, "bi|"+утга) hex 32 */
export function blindIndex(ctx: SealCtx, value: string): string {
  return createHmac("sha256", dek(ctx.tenantId)).update(`bi|${value}`).digest("hex").slice(0, 32);
}

/** Крипто-устгалт: DEK-ийн мөрийг бүрмөсөн устгана. Буцаах: устгасан эсэх. */
export function shredTenant(tenantId: string): boolean {
  cache().delete(tenantId);
  return Number(rawRun(`DELETE FROM tenant_keys WHERE merchant = ?`, tenantId).changes) > 0;
}

/** Tenant-д түлхүүр үүссэн эсэх (Privacy хуудас) */
export const hasTenantKey = (tenantId: string) => !!rawOne(`SELECT 1 AS x FROM tenant_keys WHERE merchant = ? AND destroyed_at IS NULL`, tenantId);

/* ───────── tenant-гүй нууц (түншийн secret) ───────── */

const sysKey = () => Buffer.from(hkdfSync("sha256", kek(), "gerege-sys", "system-secrets-v1", 32));
export function sealSystem(ref: string, plain: string): string {
  const { iv, tag, ct } = gcm(sysKey(), Buffer.from(plain, "utf8"), `sys|${ref}`);
  return PREFIX + [iv, tag, ct].map((x) => x.toString("base64url")).join(".");
}
export function openSystem(ref: string, box: string | null | undefined): string {
  if (!box) return "";
  if (!isSealed(box)) return box;
  const [iv, tag, ct] = box.slice(PREFIX.length).split(".").map((x) => Buffer.from(x, "base64url"));
  try {
    return ungcm(sysKey(), iv, tag, ct, `sys|${ref}`).toString("utf8");
  } catch {
    throw new CryptoError("Системийн нууцыг тайлж чадсангүй");
  }
}
