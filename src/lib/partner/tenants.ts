/**
 * Түншийн удирдлагын хавтгай (§4A.1, §4A.3): tenant үүсгэх, жагсаах, түдгэлзүүлэх. SQL бүр `:partner`-тэй (pdb) —
 * өөр түншийн tenant «олдсонгүй» (404), оршин байгааг нь ч задруулахгүй. Tenant-ын агуулгад хүрэхгүй.
 */
import { randomUUID } from "node:crypto";
import { rid } from "@/lib/agent/db";
import type { PartnerContext } from "@/lib/tenant/context";
import { enqueuePartnerEvent } from "@/lib/tenant/outbox";
import { v1fail } from "@/lib/v1/http";
import { issueTenantKey } from "./keys";

export type PartnerTenant = {
  tenantId: string;
  extMerchantId: string;
  name: string;
  status: "pending_terms" | "active" | "suspended";
  posKind: string;
  plan: string | null;
  credits: number;
  expiresAt: string | null;
  termsAcceptedAt: string | null;
  createdAt: string;
  lastActiveAt: string | null;
};
type Row = { id: string; ext_merchant_id: string; name: string; status: PartnerTenant["status"]; pos_kind: string; plan: string | null; credits: number | null; expires_at: number | null; terms_at: number | null; created_at: number; last_at: number | null };

const SELECT = `SELECT t.id, t.ext_merchant_id, t.name, t.status, t.pos_kind, t.terms_at, t.created_at, w.plan, w.credits, w.expires_at,
  (SELECT MAX(u.at) FROM usage u WHERE u.merchant = t.id AND u.credits > 0) AS last_at
  FROM tenants t LEFT JOIN wallet w ON w.merchant = t.id WHERE t.partner_id = :partner`;
const iso = (n: number | null) => (n ? new Date(n).toISOString() : null);
const view = (r: Row): PartnerTenant => ({
  tenantId: r.id,
  extMerchantId: r.ext_merchant_id,
  name: r.name,
  status: r.status,
  posKind: r.pos_kind,
  plan: r.plan,
  credits: r.expires_at && r.expires_at < Date.now() ? 0 : (r.credits ?? 0),
  expiresAt: iso(r.expires_at),
  termsAcceptedAt: iso(r.terms_at),
  createdAt: new Date(r.created_at).toISOString(),
  lastActiveAt: iso(r.last_at),
});

export const audit = (p: PartnerContext, action: string, merchant: string | null, detail?: string) =>
  p.pdb.run(`INSERT INTO partner_audit (partner_id, action, merchant, detail, at) VALUES (:partner, ?, ?, ?, ?)`, action, merchant, detail ?? null, Date.now());

/** Түншийн tenant мөр (байхгүй/өөрийнх биш → 404) */
export function ownTenant(p: PartnerContext, id: string): PartnerTenant {
  const r = typeof id === "string" && /^[A-Za-z0-9_-]{2,40}$/.test(id) ? p.pdb.one<Row>(`${SELECT} AND t.id = ?`, id) : undefined;
  if (!r) return v1fail(404, "Tenant олдсонгүй");
  return view(r);
}

export function listTenants(p: PartnerContext, q: { status?: string | null; after?: string | null; limit: number }) {
  const rows = p.pdb.all<Row>(`${SELECT} AND (? IS NULL OR t.status = ?) AND (? IS NULL OR t.id > ?) ORDER BY t.id LIMIT ?`, q.status ?? null, q.status ?? null, q.after ?? null, q.after ?? null, q.limit + 1);
  return rows.map(view);
}

/** extMerchantId-аар idempotent. Анхдагч pos_kind = live (түншийн mode=sync бол connector + connectorKey). */
export function createTenant(p: PartnerContext, b: { extMerchantId?: unknown; name?: unknown; regNo?: unknown }) {
  const ext = String(b.extMerchantId ?? "").trim();
  const name = String(b.name ?? "").trim().slice(0, 120);
  if (!/^[A-Za-z0-9_.:-]{1,64}$/.test(ext)) v1fail(400, "extMerchantId буруу (1–64, [A-Za-z0-9_.:-])");
  if (!name) v1fail(400, "name шаардлагатай");
  const regNo = b.regNo == null ? null : String(b.regNo).trim().slice(0, 20) || null;
  const existing = p.pdb.one<Row>(`${SELECT} AND t.ext_merchant_id = ?`, ext);
  if (existing) return { created: false, tenant: view(existing), connectorKey: null as string | null };
  const mode = p.pdb.one<{ mode: string }>(`SELECT mode FROM partners WHERE id = :partner`)?.mode ?? "live";
  const id = `p${rid(14)}`;
  p.pdb.run(
    `INSERT OR IGNORE INTO tenants (id, public_id, name, pos_kind, status, partner_id, ext_merchant_id, reg_no, created_at, widget_kid)
     VALUES (?, ?, ?, ?, 'pending_terms', :partner, ?, ?, ?, ?)`,
    id,
    rid(12),
    name,
    mode === "sync" ? "connector" : "live",
    ext,
    regNo,
    Date.now(),
    rid(8),
  );
  const row = p.pdb.one<Row>(`${SELECT} AND t.ext_merchant_id = ?`, ext)!;
  if (row.id !== id) return { created: false, tenant: view(row), connectorKey: null };
  audit(p, "tenant.create", id);
  const connectorKey = mode === "sync" ? issueTenantKey(p, id, "connector", ["connector:read", "connector:write"]).key : null;
  return { created: true, tenant: view(row), connectorKey };
}

export function setSuspended(p: PartnerContext, id: string, suspend: boolean) {
  ownTenant(p, id);
  if (suspend) p.pdb.run(`UPDATE tenants SET status = 'suspended' WHERE id = ? AND partner_id = :partner`, id);
  else p.pdb.run(`UPDATE tenants SET status = CASE WHEN terms_at IS NULL THEN 'pending_terms' ELSE 'active' END WHERE id = ? AND partner_id = :partner AND status = 'suspended'`, id);
  if (suspend) p.pdb.run(`DELETE FROM sessions WHERE merchant IN (SELECT id FROM tenants WHERE id = ? AND partner_id = :partner)`, id);
  audit(p, suspend ? "tenant.suspend" : "tenant.resume", id);
  if (suspend) enqueuePartnerEvent(id, "tenant.suspended", {});
  return ownTenant(p, id);
}

export const requestIdOf = () => randomUUID();
