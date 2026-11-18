/**
 * Түншийн таних цэг (§4A). `PartnerId`-г үүсгэх ГАНЦ газар.
 * PartnerContext-д `db`/`pos` байхгүй — tenant-ын өгөгдлийн функц дуудах код зам үүсэхгүй.
 * Partner API (`/api/v1/partner/**`) — 2-р шат.
 */
import { createHash, randomUUID } from "node:crypto";
import type { PartnerContext, PartnerId, PartnerScope } from "./context";
import { fail } from "./http";
import { rawOne, rawRun } from "./raw";
import { pdbFor } from "./tdb";

const sha = (s: string) => createHash("sha256").update(s).digest("hex");

/** Authorization: Bearer gpk_… → PartnerContext. Tenant-ын key (gai_)/session → 403. */
export function requirePartner(req: Request): PartnerContext {
  const h = req.headers.get("authorization") || "";
  const b = h.startsWith("Bearer ") ? h.slice(7).trim() : "";
  // tenant-ын итгэмжлэл (API key, зочны токен, session) → 403 (T14)
  if (b.startsWith("gai_") || b.startsWith("gvs_") || (!b && /(?:^|;\s*)gp_s=/.test(req.headers.get("cookie") || ""))) fail(403, "Зөвхөн түншийн түлхүүрээр");
  if (!b.startsWith("gpk_")) fail(401, "Түншийн түлхүүр шаардлагатай");
  const k = rawOne<{ partner_id: string; prefix: string }>(
    `SELECT k.partner_id, k.prefix FROM partner_keys k JOIN partners p ON p.id = k.partner_id WHERE k.hash = ? AND k.revoked_at IS NULL AND p.status = 'active'`,
    sha(b),
  );
  if (!k) fail(401, "Түншийн түлхүүр хүчингүй");
  rawRun(`UPDATE partner_keys SET last_used = ? WHERE hash = ?`, Date.now(), sha(b));
  const partnerId = k!.partner_id as PartnerId;
  return Object.freeze({
    partnerId,
    principal: Object.freeze({ kind: "partner" as const, prefix: k!.prefix }),
    scopes: new Set<PartnerScope>(["partner:manage"]) as ReadonlySet<PartnerScope>,
    requestId: randomUUID(),
    pdb: pdbFor(partnerId),
  });
}
