/**
 * Түншийн тохиргоо (§4A.3): me, брэнд (white-label), connector (live|sync), нэг webhook, хадгалах хугацаа, хандалтын лог.
 * Нууц (connector/webhook secret) нэг л удаа харагдана; DB-д sealSystem-ээр шифрлэгдэнэ.
 */
import { randomBytes } from "node:crypto";
import { connectorFetch, LiveError } from "@/lib/pos/live";
import type { PartnerContext } from "@/lib/tenant/context";
import { openSystem, sealSystem } from "@/lib/tenant/crypto";
import { isOrigin } from "@/lib/tenant/embed";
import { PARTNER_EVENTS, signBody } from "@/lib/tenant/outbox";
import { parseRetention } from "@/lib/tenant/retention";
import { allowPrivate, assertPublicUrl, urlShapeOk } from "@/lib/net";
import { v1fail } from "@/lib/v1/http";
import { audit, ownTenant } from "./tenants";

export type Brand = { name?: string; logoUrl?: string; color?: string };
type P = {
  id: string; slug: string; name: string; status: string; sandbox: number; brand: string; frame_origins: string; mode: string;
  connector_url: string | null; connector_secret: string | null; webhook_url: string | null; retention: string | null; created_at: number;
};
const j = <T>(s: string | null | undefined, d: T): T => {
  try {
    return s ? (JSON.parse(s) as T) : d;
  } catch {
    return d;
  }
};
const row = (p: PartnerContext) => p.pdb.one<P>(`SELECT * FROM partners WHERE id = :partner`) ?? v1fail(404, "Түнш олдсонгүй");

export function partnerMe(p: PartnerContext) {
  const r = row(p);
  const n = p.pdb.all<{ status: string; n: number }>(`SELECT status, COUNT(*) AS n FROM tenants WHERE partner_id = :partner GROUP BY status`);
  return {
    id: r.id,
    slug: r.slug,
    name: r.name,
    sandbox: !!r.sandbox,
    brand: j<Brand>(r.brand, {}),
    frameOrigins: j<string[]>(r.frame_origins, []),
    connector: { url: r.connector_url, mode: r.mode, configured: !!(r.connector_url && r.connector_secret) },
    webhook: { url: r.webhook_url },
    retention: parseRetention(j(r.retention, {})),
    tenants: Object.fromEntries(n.map((x) => [x.status, x.n])),
  };
}

const HEX = /^#[0-9a-f]{6}$/i;
/** WCAG харьцаа цагаан текстэй — < 4.5 бол анхдагч #0046E2 */
export function contrastOnWhite(hex: string) {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  const L = 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  return 1.05 / (L + 0.05);
}
export const safeColor = (c: unknown) => (typeof c === "string" && HEX.test(c) && contrastOnWhite(c) >= 4.5 ? c.toUpperCase() : "#0046E2");

export function setBranding(p: PartnerContext, b: { name?: unknown; logoUrl?: unknown; color?: unknown; frameOrigins?: unknown }) {
  const cur = j<Brand>(row(p).brand, {});
  const brand: Brand = { ...cur };
  if (b.name !== undefined) brand.name = String(b.name).slice(0, 60);
  if (b.logoUrl !== undefined) {
    if (b.logoUrl && !(typeof b.logoUrl === "string" && /^https:\/\/[^\s"'<>]{4,300}$/.test(b.logoUrl))) v1fail(400, "logoUrl зөвхөн https://");
    brand.logoUrl = (b.logoUrl as string) || undefined;
  }
  if (b.color !== undefined) {
    if (!(typeof b.color === "string" && HEX.test(b.color))) v1fail(400, "color: #RRGGBB");
    brand.color = b.color as string;
  }
  p.pdb.run(`UPDATE partners SET brand = ? WHERE id = :partner`, JSON.stringify(brand));
  if (b.frameOrigins !== undefined) {
    const fo = Array.isArray(b.frameOrigins) ? b.frameOrigins : v1fail(400, "frameOrigins: массив");
    if (fo.length > 10 || !fo.every(isOrigin)) v1fail(400, "frameOrigins: https://host[:port] (≤10)");
    p.pdb.run(`UPDATE partners SET frame_origins = ? WHERE id = :partner`, JSON.stringify(fo));
  }
  audit(p, "branding.set", null);
  return partnerMe(p);
}

export function setConnector(p: PartnerContext, b: { url?: unknown; mode?: unknown }) {
  const r = row(p);
  const url = String(b.url ?? "").trim().replace(/\/+$/, "");
  const mode = b.mode === "sync" ? "sync" : b.mode === undefined || b.mode === "live" ? "live" : v1fail(400, "mode: live | sync");
  if (!urlShapeOk(url, { allowPrivate: allowPrivate(!!r.sandbox) })) v1fail(400, "url: https:// нийтийн хаяг");
  const secret = `gcs_${randomBytes(24).toString("base64url")}`;
  p.pdb.run(`UPDATE partners SET connector_url = ?, connector_secret = ?, mode = ? WHERE id = :partner`, url, sealSystem(`partners|connector_secret|${p.partnerId}`, secret), mode);
  audit(p, "connector.set", null, mode);
  return { url, mode, secret, note: "secret нэг л удаа харагдана — X-Gerege-Signature шалгахад" };
}

/** Бидний гарын үсэгтэй GET /health + /merchants/{ext}/products?limit=1 */
export async function testConnector(p: PartnerContext, ext?: string) {
  const r = row(p);
  if (!r.connector_url || !r.connector_secret) v1fail(409, "Connector тохируулаагүй (PUT /partner/connector)");
  const c = { pid: p.partnerId, url: r.connector_url!, secret: openSystem(`partners|connector_secret|${p.partnerId}`, r.connector_secret), sandbox: !!r.sandbox };
  const out: { health: unknown; products?: { ok: boolean; count: number; ext: string } ; error?: string } = { health: null };
  try {
    out.health = await connectorFetch(c, "GET", "/health");
    const e = ext ?? p.pdb.one<{ ext_merchant_id: string }>(`SELECT ext_merchant_id FROM tenants WHERE partner_id = :partner ORDER BY created_at LIMIT 1`)?.ext_merchant_id;
    if (e) {
      const j2 = await connectorFetch<{ items?: unknown[] }>(c, "GET", `/merchants/${encodeURIComponent(e)}/products?limit=1`);
      out.products = { ok: Array.isArray(j2.items), count: Array.isArray(j2.items) ? j2.items.length : 0, ext: e };
    }
    return { ok: true, ...out };
  } catch (e) {
    return { ok: false, ...out, error: e instanceof LiveError ? e.message : "Холбогдож чадсангүй" };
  }
}

export function setWebhook(p: PartnerContext, b: { url?: unknown; events?: unknown }) {
  const r = row(p);
  const url = String(b.url ?? "").trim();
  if (!urlShapeOk(url, { allowPrivate: allowPrivate(!!r.sandbox) })) v1fail(400, "url: https:// нийтийн хаяг");
  const events = Array.isArray(b.events) ? b.events.map(String) : [...PARTNER_EVENTS];
  if (!events.every((e) => (PARTNER_EVENTS as readonly string[]).includes(e))) v1fail(400, `events: ${PARTNER_EVENTS.join(", ")}`);
  const secret = `gws_${randomBytes(24).toString("base64url")}`;
  p.pdb.run(`UPDATE partners SET webhook_url = ?, webhook_secret = ? WHERE id = :partner`, url, sealSystem(`partners|webhook_secret|${p.partnerId}`, secret));
  audit(p, "webhook.set", null, events.join(","));
  return { url, events, secret, note: "secret нэг л удаа харагдана — X-Gerege-Signature: sha256=HMAC(secret, body)" };
}

export async function testWebhook(p: PartnerContext) {
  const r = p.pdb.one<{ webhook_url: string | null; webhook_secret: string | null; sandbox: number }>(`SELECT webhook_url, webhook_secret, sandbox FROM partners WHERE id = :partner`);
  if (!r?.webhook_url || !r.webhook_secret) v1fail(409, "Webhook тохируулаагүй");
  const body = JSON.stringify({ id: `test-${Date.now()}`, event: "test", tenantId: null, at: new Date().toISOString(), data: {} });
  try {
    const u = await assertPublicUrl(r!.webhook_url!, { allowPrivate: allowPrivate(!!r!.sandbox) });
    const res = await fetch(u, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Gerege-Event": "test", "X-Gerege-Delivery": "test", "X-Gerege-Signature": signBody(openSystem(`partners|webhook_secret|${p.partnerId}`, r!.webhook_secret), body) },
      body,
      signal: AbortSignal.timeout(5_000),
      redirect: "error",
    });
    return { ok: res.ok, status: res.status };
  } catch (e) {
    return { ok: false, status: 0, error: e instanceof Error && /хориотой|https/.test(e.message) ? e.message : "Холбогдож чадсангүй" };
  }
}

export function setRetention(p: PartnerContext, b: unknown) {
  const r = parseRetention(b);
  if (!Object.keys(r).length) v1fail(400, "transcriptsDays | contactsDays | actionsDays | photos");
  p.pdb.run(`UPDATE partners SET retention = ? WHERE id = :partner`, JSON.stringify(r));
  audit(p, "retention.set", null);
  return { retention: r };
}

/** Агуулгагүй хандалтын лог — зөвхөн өөрийн tenant-ууд (өөр түншийн tenant → 404) */
export function accessLog(p: PartnerContext, q: { tenant?: string | null; since?: number; limit: number }) {
  if (q.tenant) ownTenant(p, q.tenant);
  return p.pdb.all<{ id: number; tenantId: string | null; at: number; actorKind: string; action: string; resource: string | null; count: number | null }>(
    `SELECT id, merchant AS tenantId, at, actor_kind AS actorKind, action, resource, count FROM access_log
     WHERE partner_id = :partner AND (? IS NULL OR merchant = ?) AND at >= ? ORDER BY id DESC LIMIT ?`,
    q.tenant ?? null,
    q.tenant ?? null,
    q.since ?? 0,
    q.limit,
  ).map((r) => ({ ...r, at: new Date(r.at).toISOString() }));
}

/** Tenant-ын брэнд (embed, widget) — tenant/session талаас */
export function brandOfPartnerRow(brand: string | null | undefined, name?: string | null) {
  const b = j<Brand>(brand, {});
  return { name: b.name || name || null, logoUrl: b.logoUrl ?? null, color: safeColor(b.color) };
}
