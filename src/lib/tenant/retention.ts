/**
 * Хадгалах хугацааны цэвэрлэгч (docs/ARCHITECTURE.md §4B.4) — цаг тутам (jobs.ts), tenant бүрт.
 * Бодлого: анхдагч → түншийн `partners.retention` → мерчантын `tenants.retention` (зөвхөн БОГИНОСГОНО).
 *   transcriptsDays 30 (messages, conversations) · contactsDays 180 · actionsDays 90 · photos "on_approve" | N хоног (backstop 30)
 * Устгасан тоог access_log-д `retention.purge`-ээр (агуулгагүй) бичнэ.
 */
import { randomUUID } from "node:crypto";
import { rmSync } from "node:fs";
import path from "node:path";
import { access } from "./access";
import type { TenantId } from "./context";
import { rawAll, rawOne, rawRun } from "./raw";

export type Retention = { transcriptsDays: number; contactsDays: number; actionsDays: number; photos: "on_approve" | number };
export const DEFAULT_RETENTION: Retention = { transcriptsDays: 30, contactsDays: 180, actionsDays: 90, photos: "on_approve" };
const PHOTO_BACKSTOP_DAYS = 30;
const DAY = 86_400_000;

const clampDays = (v: unknown, max: number) => (typeof v === "number" && Number.isFinite(v) ? Math.max(1, Math.min(max, Math.floor(v))) : null);

/** Оролтыг шалгаж хэвийн болгоно (буруу талбарыг хаяна) */
export function parseRetention(x: unknown): Partial<Retention> {
  const o = (x && typeof x === "object" ? x : {}) as Record<string, unknown>;
  const r: Partial<Retention> = {};
  const t = clampDays(o.transcriptsDays, 3650);
  if (t) r.transcriptsDays = t;
  const c = clampDays(o.contactsDays, 3650);
  if (c) r.contactsDays = c;
  const a = clampDays(o.actionsDays, 3650);
  if (a) r.actionsDays = a;
  if (o.photos === "on_approve") r.photos = "on_approve";
  else {
    const p = clampDays(o.photos, 365);
    if (p) r.photos = p;
  }
  return r;
}
const j = (s: string | null | undefined) => {
  try {
    return s ? JSON.parse(s) : {};
  } catch {
    return {};
  }
};

/** Tenant-ын үйлчлэх бодлого */
export function retentionFor(tenantId: string): Retention & { source: { partner: Partial<Retention>; tenant: Partial<Retention> } } {
  const r = rawOne<{ tr: string | null; pr: string | null }>(`SELECT t.retention AS tr, p.retention AS pr FROM tenants t LEFT JOIN partners p ON p.id = t.partner_id WHERE t.id = ?`, tenantId);
  const partner = parseRetention(j(r?.pr));
  const tenant = parseRetention(j(r?.tr));
  const base: Retention = { ...DEFAULT_RETENTION, ...partner };
  const min = (a: number, b?: number) => (b && b < a ? b : a);
  const photos = typeof tenant.photos === "number" ? (typeof base.photos === "number" ? Math.min(base.photos, tenant.photos) : tenant.photos) : base.photos;
  return {
    transcriptsDays: min(base.transcriptsDays, tenant.transcriptsDays),
    contactsDays: min(base.contactsDays, tenant.contactsDays),
    actionsDays: min(base.actionsDays, tenant.actionsDays),
    photos,
    source: { partner, tenant },
  };
}

const n = (r: { changes: number | bigint }) => Number(r.changes) || 0;

/** Нэг tenant-ыг цэвэрлэнэ. Буцаах: хүснэгт тус бүрийн устгасан тоо */
export function purgeTenant(tenantId: string, now = Date.now()) {
  const p = retentionFor(tenantId);
  const tCut = now - p.transcriptsDays * DAY;
  const out: Record<string, number> = {};
  out.messages = n(rawRun(`DELETE FROM messages WHERE merchant = ? AND at < ?`, tenantId, tCut));
  const oldConv = rawAll<{ id: string }>(`SELECT id FROM conversations WHERE merchant = ? AND last_at < ?`, tenantId, tCut);
  for (const c of oldConv) out.messages += n(rawRun(`DELETE FROM messages WHERE conv_id = ? AND merchant = ?`, c.id, tenantId));
  out.conversations = n(rawRun(`DELETE FROM conversations WHERE merchant = ? AND last_at < ?`, tenantId, tCut));
  out.contacts = n(rawRun(`DELETE FROM contacts WHERE merchant = ? AND last_at < ?`, tenantId, now - p.contactsDays * DAY));
  out.actions = n(rawRun(`DELETE FROM actions WHERE merchant = ? AND at < ?`, tenantId, now - p.actionsDays * DAY));
  const photoDays = typeof p.photos === "number" ? p.photos : PHOTO_BACKSTOP_DAYS;
  const photos = rawAll<{ id: string; path: string | null }>(`SELECT id, path FROM inv_photos WHERE merchant = ? AND at < ?`, tenantId, now - photoDays * DAY);
  const root = path.join(process.env.SP_DATA_DIR || path.join(process.cwd(), "data"), "tenants", tenantId);
  for (const ph of photos) {
    if (ph.path) {
      const abs = path.resolve(path.isAbsolute(ph.path) ? ph.path : path.join(root, ph.path));
      if (abs.startsWith(root + path.sep)) rmSync(abs, { force: true });
    }
  }
  out.inv_photos = photos.length ? n(rawRun(`DELETE FROM inv_photos WHERE merchant = ? AND at < ?`, tenantId, now - photoDays * DAY)) : 0;
  const total = Object.values(out).reduce((a, b) => a + b, 0);
  if (total) access({ tenantId: tenantId as TenantId, principal: { kind: "system", job: "retention" }, requestId: randomUUID() }, "retention.purge", Object.keys(out).filter((k) => out[k]).join(","), total);
  return out;
}

/** Бүх tenant (цаг тутмын ажил) */
export function runRetention(now = Date.now()) {
  let total = 0;
  for (const t of rawAll<{ id: string }>(`SELECT id FROM tenants`)) {
    try {
      total += Object.values(purgeTenant(t.id, now)).reduce((a, b) => a + b, 0);
    } catch {
      /* нэг tenant-ын алдаа бусдыг зогсоохгүй */
    }
  }
  return total;
}
