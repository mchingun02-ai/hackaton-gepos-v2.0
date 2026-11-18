/**
 * Embed/SSO токен олгох (§4A.4): 5 минут, нэг удаагийн `get_…` + бэлэн `url` (/connect?e=…).
 * Нууц хөтөч рүү гарахгүй — түншийн сервер partner key-ээр авна. frame-ancestors жагсаалт токенд гарын үсэгтэй.
 */
import { randomBytes } from "node:crypto";
import type { PartnerContext } from "@/lib/tenant/context";
import { EMBED_TTL_MS, isOrigin, signEmbed, type EmbedRole, type EmbedView } from "@/lib/tenant/embed";
import { v1fail } from "@/lib/v1/http";
import { audit, ownTenant } from "./tenants";

const VIEWS: EmbedView[] = ["onboarding", "dashboard", "billing", "count"];
const ROLES: EmbedRole[] = ["owner", "manager", "staff"];

export function mintEmbed(p: PartnerContext, tenantId: string, b: { user?: { id?: unknown; name?: unknown; role?: unknown }; view?: unknown }, origin: string) {
  const t = ownTenant(p, tenantId);
  if (t.status === "suspended") v1fail(403, "Tenant түдгэлзсэн");
  const u = b.user ?? {};
  const role = ROLES.includes(u.role as EmbedRole) ? (u.role as EmbedRole) : v1fail(400, "user.role: owner | manager | staff");
  const uid = String(u.id ?? "").slice(0, 40);
  if (!uid) v1fail(400, "user.id шаардлагатай");
  const view = (VIEWS.includes(b.view as EmbedView) ? b.view : t.status === "pending_terms" ? "onboarding" : "dashboard") as EmbedView;
  const fo = p.pdb.one<{ frame_origins: string }>(`SELECT frame_origins FROM partners WHERE id = :partner`)?.frame_origins ?? "[]";
  let fa: string[] = [];
  try {
    fa = (JSON.parse(fo) as unknown[]).filter(isOrigin);
  } catch {
    fa = [];
  }
  const jti = randomBytes(16).toString("base64url");
  const exp = Date.now() + EMBED_TTL_MS;
  p.pdb.run(`INSERT INTO embed_jti (jti, partner_id, merchant, expires_at) SELECT ?, :partner, id, ? FROM tenants WHERE id = ? AND partner_id = :partner`, jti, exp, tenantId);
  const token = signEmbed({ p: p.partnerId, t: tenantId, u: { id: uid, name: String(u.name ?? "").slice(0, 60), role }, v: view, jti, exp, fa });
  audit(p, "embed.mint", tenantId, view);
  const base = (process.env.SP_PUBLIC_URL || origin).replace(/\/$/, "");
  return { token, url: `${base}/connect?e=${encodeURIComponent(token)}`, expiresAt: new Date(exp).toISOString(), view };
}
