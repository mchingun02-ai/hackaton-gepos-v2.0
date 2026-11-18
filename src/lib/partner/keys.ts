/**
 * Түншийн гаргах tenant-ын connector түлхүүр (§4A.3): зөвхөн connector:read|write, inventory:count.
 * mcp, agent:* зэрэг өгөгдлийн хавтгайн scope-ыг түнш гаргаж ЧАДАХГҮЙ (400). Утга нэг л удаа харагдана; DB-д sha256.
 */
import { createHash, randomBytes } from "node:crypto";
import type { PartnerContext } from "@/lib/tenant/context";
import { v1fail } from "@/lib/v1/http";

export const PARTNER_KEY_SCOPES = ["connector:read", "connector:write", "inventory:count"] as const;
const sha = (s: string) => createHash("sha256").update(s).digest("hex");

export function issueTenantKey(p: PartnerContext, tenantId: string, label: unknown, scopes: unknown) {
  const sc = Array.isArray(scopes) ? scopes.map(String) : [];
  if (!sc.length || sc.some((s) => !(PARTNER_KEY_SCOPES as readonly string[]).includes(s))) v1fail(400, `scopes зөвхөн ${PARTNER_KEY_SCOPES.join(", ")}`);
  const key = `gai_${randomBytes(24).toString("base64url")}`;
  const r = p.pdb.run(
    `INSERT INTO api_keys (hash, merchant, label, prefix, created_at, scopes, issued_by, partner_id)
     SELECT ?, t.id, ?, ?, ?, ?, 'partner:' || :partner, :partner FROM tenants t WHERE t.id = ? AND t.partner_id = :partner AND t.status != 'suspended'`,
    sha(key),
    String(label ?? "connector").slice(0, 60) || "connector",
    key.slice(0, 10),
    Date.now(),
    JSON.stringify([...new Set(sc)]),
    tenantId,
  );
  if (!Number(r.changes)) v1fail(404, "Tenant олдсонгүй");
  return { key, prefix: key.slice(0, 10), scopes: [...new Set(sc)] };
}

export function revokeTenantKey(p: PartnerContext, tenantId: string, prefix: string) {
  const r = p.pdb.run(`UPDATE api_keys SET revoked_at = ? WHERE merchant = ? AND prefix = ? AND partner_id = :partner AND revoked_at IS NULL`, Date.now(), tenantId, prefix);
  if (!Number(r.changes)) v1fail(404, "Түлхүүр олдсонгүй");
  return { revoked: true };
}
