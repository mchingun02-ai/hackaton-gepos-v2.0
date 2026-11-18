/**
 * Бүрэн устгалт (крипто-устгалт) ба экспорт (docs/ARCHITECTURE.md §4B.4).
 *   eraseTenant(id) — ① tenant_keys (DEK) устгана ② `merchant` баганатай БҮХ хүснэгтийн мөр (жагсаалтыг схемээс автоматаар —
 *                     шинэ хүснэгт мартагдахгүй) ③ data/tenants/<id>/ ④ tenants мөр. Санхүүгийн мөр (invoices, usage) нэргүйжүүлж үлдэнэ.
 *                     Хариу: хүснэгт тус бүрийн тоо (агуулгагүй гэрчилгээ).
 *   buildExport(ctx) — тайлсан JSON (ref конвенц: table|column|id) → нэг удаагийн 15 минутын холбоос (санах ойд, дискэнд бичихгүй).
 */
import { createHash, randomBytes } from "node:crypto";
import { rmSync } from "node:fs";
import path from "node:path";
import type { TenantContext } from "./context";
import { decS, isSealed, shredTenant } from "./crypto";
import { rawAll, rawDb, rawRun } from "./raw";

/** Нэргүйжүүлж үлдээх (санхүү), устгахгүй алгасах хүснэгт */
const ANONYMIZE: Record<string, string> = {
  invoices: `qr_text = NULL, qr_image = NULL, short_url = NULL, urls = NULL`,
  usage: `ref = NULL`,
};

/** `merchant` баганатай бүх хүснэгт (sqlite_master + PRAGMA) */
export function tenantTables(): string[] {
  const names = rawAll<{ name: string }>(`SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'`).map((r) => r.name);
  return names.filter((t) => /^[a-z_][a-z0-9_]*$/i.test(t) && (rawDb().prepare(`PRAGMA table_info(${t})`).all() as { name: string }[]).some((c) => c.name === "merchant"));
}

export function eraseTenant(tenantId: string) {
  const counts: Record<string, number> = {};
  const anon = `erased:${createHash("sha256").update(tenantId).digest("hex").slice(0, 12)}`;
  const d = rawDb();
  counts.tenant_keys = shredTenant(tenantId) ? 1 : 0;
  d.exec("BEGIN IMMEDIATE");
  try {
    for (const t of tenantTables()) {
      if (t === "tenant_keys") continue;
      if (t === "access_log") {
        // аудитын мөр үлдэнэ (түнш харна), tenant id-гүй болно
        counts[t] = Number(rawRun(`UPDATE access_log SET merchant = NULL, resource = 'erased' WHERE merchant = ?`, tenantId).changes) || 0;
        continue;
      }
      if (ANONYMIZE[t]) counts[t] = Number(rawRun(`UPDATE ${t} SET merchant = ?, ${ANONYMIZE[t]} WHERE merchant = ?`, anon, tenantId).changes) || 0;
      else counts[t] = Number(rawRun(`DELETE FROM ${t} WHERE merchant = ?`, tenantId).changes) || 0;
    }
    counts.tenants = Number(rawRun(`DELETE FROM tenants WHERE id = ?`, tenantId).changes) || 0;
    d.exec("COMMIT");
  } catch (e) {
    d.exec("ROLLBACK");
    throw e;
  }
  const dir = path.join(process.env.SP_DATA_DIR || path.join(process.cwd(), "data"), "tenants", tenantId);
  if (/^[\p{L}\p{N}-]{4,40}$/u.test(tenantId)) rmSync(dir, { recursive: true, force: true });
  counts.files_dir = 1;
  // WAL-д үлдсэн хуучин хуудсыг үндсэн файл руу шилжүүлж цэвэрлэнэ
  try {
    d.exec("PRAGMA wal_checkpoint(TRUNCATE)");
  } catch {
    /* завгүй */
  }
  return Object.fromEntries(Object.entries(counts).filter(([, v]) => v));
}

/* ───────── экспорт ───────── */

const SKIP_TABLES = new Set(["sessions", "api_keys", "pairings", "embed_jti", "idempotency", "tenant_keys", "outbox", "partner_audit", "c_barcodes"]);
const SKIP_COLS = new Set(["emb", "secret", "wrapped_dek", "qr_image", "hash"]);

export function buildExport(ctx: Pick<TenantContext, "tenantId">) {
  const out: Record<string, unknown[]> = {};
  for (const t of tenantTables()) {
    if (SKIP_TABLES.has(t)) continue;
    const rows = rawAll<Record<string, unknown>>(`SELECT * FROM ${t} WHERE merchant = ? LIMIT 50000`, ctx.tenantId);
    if (!rows.length) continue;
    out[t] = rows.map((r) => {
      const o: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(r)) {
        if (SKIP_COLS.has(k) || k === "merchant" || v instanceof Uint8Array) continue;
        if (isSealed(v)) {
          try {
            o[k] = decS(ctx, v, `${t}|${k}|${String(r.id ?? "")}`);
          } catch {
            o[k] = "[шифрлэгдсэн — тайлах боломжгүй]";
          }
        } else o[k] = v;
      }
      return o;
    });
  }
  return { format: "gerege-export/v1", tenantId: ctx.tenantId, createdAt: new Date().toISOString(), tables: out };
}

const g = globalThis as unknown as { __exports?: Map<string, { body: string; exp: number; tenant: string }> };
const store = () => (g.__exports ??= new Map());

/** Экспорт үүсгээд нэг удаагийн токен (15 мин) буцаана */
export function createExport(ctx: Pick<TenantContext, "tenantId">) {
  const now = Date.now();
  for (const [k, v] of store()) if (v.exp < now) store().delete(k);
  const token = `gex_${randomBytes(24).toString("base64url")}`;
  const data = buildExport(ctx);
  const rows = Object.values(data.tables).reduce((a, r) => a + r.length, 0);
  store().set(token, { body: JSON.stringify(data), exp: now + 15 * 60_000, tenant: ctx.tenantId });
  return { token, expiresAt: new Date(now + 15 * 60_000).toISOString(), rows, tables: Object.keys(data.tables).length };
}
/** Нэг л удаа татагдана */
export function takeExport(token: string) {
  const e = store().get(token);
  if (!e) return null;
  store().delete(token);
  return e.exp > Date.now() ? e : null;
}
