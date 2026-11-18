/**
 * Таних нэг цэг (docs/ARCHITECTURE.md §3.2–3.3). `TenantId`-ийг үүсгэх ГАНЦ газар.
 *
 *   requireTenant(req, scope)  — session cookie (gp_s) · Bearer gai_ (API key) · Bearer gvs_ / ?token= (зочин) → TenantContext
 *   systemContext(id, job)     — шөнийн ажил, дотоод дуудлага
 *   webhookContext / invoiceContext — Meta (page_id → мерчант), QPay (нэхэмжлэх → мерчант)
 *   widgetContext / issueVisitor — нийтийн чат, дуудлагын холбоос (gwt_ → gvs_)
 *   (түнш — tenant/partner.ts requirePartner; tenant-ын өгөгдөлгүй контекст)
 *
 * Tenant-ийг body/query/header-ийн «merchant» утгаас ХЭЗЭЭ Ч авахгүй — зөвхөн серверийн хүснэгтээс.
 */
import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { mutate } from "@/lib/sp/core";
import { normalize } from "@/lib/sp/core";
import { spNow, withSp, writeSp } from "@/lib/sp/server";
import type { SpState } from "@/lib/sp/types";
import { posFor } from "@/lib/pos/adapter";
import { rid } from "@/lib/agent/db";
import { ALL_SCOPES, type Principal, type Role, type Scope, type TenantContext, type TenantId } from "./context";
import { cookieOf, fail, HttpError, isHttps } from "./http";
import { rawOne, rawRun } from "./raw";
import { tdb } from "./tdb";
import { verifyEmbed, type EmbedPayload } from "./embed";
import type { PartnerContext } from "./context";
import { signVisitor, signWidget, VISITOR_TTL_MS, verifyVisitor, verifyWidget, type Channel } from "./tokens";

export const SESSION_COOKIE = "gp_s";
const HOUR = 3_600_000;
export const SESSION_TTL_MS = 12 * HOUR;
export const DEVICE_TTL_MS = 30 * 24 * HOUR;
const REGNO_RE = /^[\p{L}\p{N}-]{4,20}$/u;

const sha = (s: string) => createHash("sha256").update(s).digest("hex");
/** Тогтмол хугацаат харьцуулалт (урт ялгаатай ч) */
export function safeEq(a: string, b: string) {
  const x = createHash("sha256").update(String(a)).digest();
  const y = createHash("sha256").update(String(b)).digest();
  return timingSafeEqual(x, y) && String(a) === String(b);
}

/** Үүрэг → эрх. owner бүгд; manager тооллого батлах, бараа, тайлан; staff тоолох; device зөвхөн PIN нэвтрэх. */
const ROLE_SCOPES: Record<Role, readonly Scope[]> = {
  owner: ALL_SCOPES,
  manager: ["dashboard", "pos:state", "agent:director", "kb", "billing", "inventory:count", "inventory:approve", "connector:read", "usage:read"],
  staff: ["pos:state", "inventory:count"],
  device: [],
};
/** API түлхүүрт олгож болох эрх */
export const KEY_SCOPES: readonly Scope[] = ["mcp", "connector:read", "connector:write", "usage:read", "inventory:count"];

/* ───────── контекст ───────── */

type TenantRow = { id: string; public_id: string; name: string; pos_kind: string; status: "active" | "pending_terms" | "suspended"; widget_kid: string; partner_id: string | null };
const tenantRow = (id: string) => rawOne<TenantRow>(`SELECT * FROM tenants WHERE id = ?`, id);

function makeContext(row: TenantRow, principal: Principal, scopes: readonly Scope[]): TenantContext {
  const tenantId = row.id as TenantId;
  return Object.freeze({
    tenantId,
    principal: Object.freeze(principal),
    scopes: new Set(principal.kind === "system" ? scopes : gate(row, scopes)) as ReadonlySet<Scope>,
    requestId: randomUUID(),
    db: tdb(tenantId),
    pos: posFor(tenantId, row.pos_kind),
  });
}

/** Түдгэлзүүлээгүй tenant (active | pending_terms) */
function activeTenant(id: string) {
  const r = tenantRow(id);
  return r && r.status !== "suspended" ? r : null;
}
/** pending_terms — нөхцөл зөвшөөрөөгүй: зөвхөн onboarding/billing (§3.3 дүрэм 7) */
const PENDING_SCOPES: readonly Scope[] = ["billing"];
const gate = (r: TenantRow, scopes: readonly Scope[]) => (r.status === "pending_terms" ? scopes.filter((s) => PENDING_SCOPES.includes(s)) : scopes);

/** Шөнийн ажил, дотоод үйлдэл — бүх эрхтэй, нэг tenant-д л */
export function systemContext(tenantId: TenantId, job: string): TenantContext {
  const r = tenantRow(tenantId) ?? fail(404, "Дэлгүүр олдсонгүй");
  return makeContext(r, { kind: "system", job }, ALL_SCOPES);
}

/** Webhook — tenant-ийг серверийн хүснэгтээс олсон түлхүүрээр (fb_pages.merchant) баталгаажуулна */
export function webhookContext(source: "fb" | "qpay", tenantKey: string): TenantContext | null {
  const r = activeTenant(tenantKey);
  return r ? makeContext(r, { kind: "webhook", source }, ["agent:customer", "billing"]) : null;
}

/** QPay callback: нэхэмжлэхийн id → мерчант (tenant-гүй хууль ёсны хайлт) */
export function invoiceContext(inv: string): TenantContext | null {
  const row = rawOne<{ merchant: string }>(`SELECT merchant FROM invoices WHERE id = ?`, inv);
  return row ? webhookContext("qpay", row.merchant) : null;
}

/** Мерчант (tenant) мөр байхгүй бол үүсгэнэ */
export function ensureTenant(regNo: string, name: string, posKind: "gepos" | "connector" = "gepos"): TenantId {
  rawRun(
    `INSERT OR IGNORE INTO tenants (id, public_id, name, pos_kind, status, created_at, widget_kid) VALUES (?, ?, ?, ?, 'active', ?, ?)`,
    regNo,
    rid(12),
    name.slice(0, 120) || regNo,
    posKind,
    Date.now(),
    rid(8),
  );
  return regNo as TenantId;
}

/* ───────── session ───────── */

type SessionRow = { hash: string; merchant: string; staff_id: string | null; name: string | null; role: Role; device: string | null; expires_at: number; last_seen: number | null };

export function createSession(tenantId: TenantId, who: { staffId: string; name: string; role: Role; device?: string | null; via?: string }, ttlMs = SESSION_TTL_MS) {
  const token = randomBytes(32).toString("base64url");
  const now = Date.now();
  rawRun(
    `INSERT INTO sessions (hash, merchant, staff_id, name, role, device, created_at, expires_at, last_seen, via) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    sha(token),
    tenantId,
    who.staffId,
    who.name,
    who.role,
    who.device ?? null,
    now,
    now + ttlMs,
    now,
    who.via ?? "login",
  );
  // хугацаа дууссан мөрүүдийг үе үе цэвэрлэнэ
  if (Math.random() < 0.05) rawRun(`DELETE FROM sessions WHERE expires_at < ?`, now);
  return { token, maxAge: Math.floor(ttlMs / 1000) };
}

export function sessionCookie(req: Request, s: { token: string; maxAge: number }) {
  return `${SESSION_COOKIE}=${s.token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${s.maxAge}${isHttps(req) ? "; Secure" : ""}`;
}
export const clearSessionCookie = (req: Request) => `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${isHttps(req) ? "; Secure" : ""}`;

function sessionOf(req: Request): SessionRow | null {
  const tok = cookieOf(req, SESSION_COOKIE);
  if (!tok || tok.length > 100) return null;
  const now = Date.now();
  const r = rawOne<SessionRow>(`SELECT * FROM sessions WHERE hash = ? AND expires_at > ?`, sha(tok), now);
  if (r && now - (r.last_seen ?? 0) > 60_000) rawRun(`UPDATE sessions SET last_seen = ? WHERE hash = ?`, now, r.hash);
  return r ?? null;
}

export function endSession(req: Request) {
  const tok = cookieOf(req, SESSION_COOKIE);
  if (tok) rawRun(`DELETE FROM sessions WHERE hash = ?`, sha(tok));
}

/** CSRF: cookie-оор танигдсан бичих хүсэлтэд Origin нь өөрийн host байх ёстой */
export function sameOrigin(req: Request) {
  const origin = req.headers.get("origin");
  if (!origin) return req.headers.get("sec-fetch-site") === "same-origin";
  let host: string;
  try {
    host = new URL(origin).host;
  } catch {
    return false;
  }
  const allowed = new Set<string>();
  for (const h of [req.headers.get("x-forwarded-host"), req.headers.get("host")]) if (h) allowed.add(h.split(",")[0].trim());
  try {
    allowed.add(new URL(req.url).host);
  } catch {
    /* харьцангуй */
  }
  if (process.env.SP_PUBLIC_URL)
    try {
      allowed.add(new URL(process.env.SP_PUBLIC_URL).host);
    } catch {
      /* буруу тохиргоо */
    }
  return allowed.has(host);
}
const unsafe = (req: Request) => !["GET", "HEAD", "OPTIONS"].includes(req.method.toUpperCase());

/* ───────── таних ───────── */

function bearer(req: Request) {
  const h = req.headers.get("authorization") || "";
  return h.startsWith("Bearer ") ? h.slice(7).trim() : "";
}

function apiKeyContext(key: string): TenantContext {
  const r = rawOne<{ merchant: string; label: string; prefix: string; scopes: string; revoked_at: number | null }>(`SELECT merchant, label, prefix, scopes, revoked_at FROM api_keys WHERE hash = ?`, sha(key));
  if (!r || r.revoked_at) fail(401, "API түлхүүр хүчингүй");
  const t = activeTenant(r!.merchant) ?? fail(401, "API түлхүүр хүчингүй");
  rawRun(`UPDATE api_keys SET last_used = ? WHERE hash = ?`, Date.now(), sha(key));
  let scopes: Scope[] = [];
  try {
    scopes = (JSON.parse(r!.scopes) as string[]).filter((s): s is Scope => (KEY_SCOPES as string[]).includes(s));
  } catch {
    scopes = [];
  }
  return makeContext(t, { kind: "api_key", prefix: r!.prefix, label: r!.label }, scopes);
}

function visitorContext(token: string): TenantContext {
  const p = verifyVisitor(token) ?? fail(401, "Токен хүчингүй эсвэл хугацаа дууссан");
  const t = rawOne<TenantRow>(`SELECT * FROM tenants WHERE public_id = ? AND status != 'suspended'`, p.t) ?? fail(401, "Токен хүчингүй");
  return makeContext(t, { kind: "visitor", sid: p.sid, channel: p.ch }, ["agent:customer"]);
}

/** Хүсэлтийн контекст; нэвтрээгүй бол null. Буруу Bearer/токен → 401 (cookie руу шилжихгүй). */
export function currentTenant(req: Request): TenantContext | null {
  const b = bearer(req);
  if (b.startsWith("gai_")) return apiKeyContext(b);
  if (b.startsWith("gvs_")) return visitorContext(b);
  if (b) fail(401, "Танигдахгүй түлхүүр");
  // EventSource, <audio> толгой илгээж чадахгүй — зөвхөн GET-д ?token=
  if (req.method.toUpperCase() === "GET") {
    const q = new URL(req.url).searchParams.get("token");
    if (q) return visitorContext(q);
  }
  const s = sessionOf(req);
  if (!s) return null;
  if (unsafe(req) && !sameOrigin(req)) fail(403, "Хүсэлтийн эх сурвалж буруу (CSRF)");
  const t = activeTenant(s.merchant);
  if (!t) return null;
  return makeContext(t, { kind: "session", sessionId: s.hash, staffId: s.staff_id ?? "", name: s.name ?? "", role: s.role }, ROLE_SCOPES[s.role] ?? []);
}

/**
 * Route handler бүрийн эхний мөр. `need` массив бол БҮГД шаардлагатай.
 * Нэвтрээгүй → 401, эрх хүрэлцэхгүй → 403.
 */
export function requireTenant(req: Request, need: Scope | Scope[]): TenantContext {
  const ctx = currentTenant(req) ?? fail(401, "Нэвтрээгүй байна");
  if (tenantRow(ctx.tenantId)?.status === "suspended") fail(403, "Дэлгүүрийн эрх түдгэлзсэн байна");
  const needs = Array.isArray(need) ? need : [need];
  if (!needs.every((s) => ctx.scopes.has(s))) fail(403, "Энэ үйлдлийг хийх эрх алга");
  return ctx;
}

/** Session-ий үүрэг шалгах (ж: API түлхүүр зөвхөн owner) */
export function requireRole(ctx: TenantContext, roles: Role[]) {
  if (ctx.principal.kind !== "session" || !roles.includes(ctx.principal.role)) fail(403, "Зөвхөн эзэмшигч энэ үйлдлийг хийнэ");
}

/* ───────── нэвтрэлт (регистр + PIN) ───────── */

export type LoginInput = { regNo?: unknown; pin?: unknown; bootstrap?: unknown; puk?: unknown; newPin?: unknown };

/**
 * Мерчант РД + PIN-ийг серверийн sp_state-тэй харьцуулна. 3 буруу → PUK (code "puk").
 * Сервер дээр мөр байхгүй үед л AUTH_ALLOW_BOOTSTRAP=yes бол клиентийн төлвийг (bootstrap) хүлээн авна (TOFU).
 */
export function passwordLogin(inp: LoginInput): { tenantId: TenantId; name: string } {
  const regNo = String(inp.regNo ?? "").trim().toUpperCase();
  const pin = String(inp.pin ?? "");
  if (!REGNO_RE.test(regNo)) fail(400, "Регистрийн дугаар буруу");
  const row = rawOne<{ merchant: string; name: string | null }>(`SELECT merchant, json_extract(json, '$.merchant.name') AS name FROM sp_state WHERE merchant = ?`, regNo);
  if (!row) {
    const b = inp.bootstrap as SpState | undefined;
    const ok = process.env.AUTH_ALLOW_BOOTSTRAP === "yes" && b && typeof b === "object" && b.merchant && String(b.merchant.regNo).toUpperCase() === regNo && /^\d{4,6}$/.test(pin) && safeEq(String(b.merchant.pin), pin);
    if (!ok) fail(401, "Регистр эсвэл PIN буруу байна");
    let state: SpState;
    try {
      state = normalize(b!);
    } catch {
      return fail(400, "Төлөв буруу");
    }
    const id = ensureTenant(regNo, String(state.merchant.name || regNo));
    writeSp({ tenantId: id, db: tdb(id) }, 0, state);
    return { tenantId: id, name: String(state.merchant.name || regNo) };
  }
  const id = ensureTenant(regNo, String(row.name || regNo));
  const sys = systemContext(id, "login");
  const m = spNow(sys).merchant;
  const setTries = (pinTries: number, newPin?: string) => withSp(sys, () => mutate((s) => ({ ...s, merchant: { ...s.merchant, pinTries, ...(newPin ? { pin: newPin } : {}) } })));
  if (m.locked) fail(423, "Эрх түгжигдсэн байна. Gerege-д хандана уу.", "locked");
  if (inp.puk !== undefined || inp.newPin !== undefined) {
    const newPin = String(inp.newPin ?? "");
    if (!/^\d{4}$/.test(newPin)) fail(400, "Шинэ PIN 4 оронтой тоо байна");
    if (!safeEq(String(inp.puk ?? ""), String(m.puk))) fail(401, "PUK код буруу байна", "puk");
    setTries(0, newPin);
    return { tenantId: id, name: m.name };
  }
  if (m.pinTries >= 3) fail(423, "PIN 3 удаа буруу орсон. PUK кодоор шинэ PIN тохируулна уу.", "puk");
  if (safeEq(pin, String(m.pin))) {
    if (m.pinTries) setTries(0);
    return { tenantId: id, name: m.name };
  }
  const tries = m.pinTries + 1;
  setTries(tries);
  if (tries >= 3) fail(423, "PIN 3 удаа буруу орсон. PUK кодоор шинэ PIN тохируулна уу.", "puk");
  return fail(401, `Регистр эсвэл PIN буруу байна (${3 - tries} оролдлого үлдсэн)`);
}

/** Ажилтны PIN (session-ий tenant дотор). Role.manage → manager, бусад → staff. */
export function staffPinLogin(ctx: TenantContext, pin: string): { staffId: string; name: string; role: Role } {
  const s = spNow(ctx);
  const st = s.staff.find((x) => x.active && safeEq(x.pin, pin));
  if (!st) fail(401, "PIN код буруу байна");
  const role = s.roles.find((r) => r.id === st!.roleId);
  return { staffId: st!.id, name: `${st!.last.slice(0, 1)}.${st!.first}`, role: role?.manage ? "manager" : "staff" };
}

/* ───────── pairing (PWA төхөөрөмж холбох) ───────── */

const PAIR_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export function createPairing(ctx: TenantContext) {
  const b = randomBytes(8);
  const code = Array.from(b, (x) => PAIR_ALPHABET[x % PAIR_ALPHABET.length]).join("");
  const expiresAt = Date.now() + 10 * 60_000;
  ctx.db.run(`INSERT INTO pairings (code, merchant, created_by, expires_at) VALUES (?, :tenant, ?, ?)`, code, ctx.principal.kind === "session" ? ctx.principal.name : "", expiresAt);
  return { code, expiresAt };
}

/** Нэг удаагийн код → төхөөрөмжийн session (role=device, 30 хоног) */
export function redeemPairing(code: string, device: string) {
  const c = String(code).trim().toUpperCase();
  if (!/^[A-Z0-9]{8}$/.test(c)) fail(400, "Код буруу");
  const r = rawOne<{ merchant: string }>(`SELECT merchant FROM pairings WHERE code = ? AND used_at IS NULL AND expires_at > ?`, c, Date.now());
  if (!r) fail(401, "Код буруу эсвэл хугацаа дууссан");
  if (!rawRun(`UPDATE pairings SET used_at = ? WHERE code = ? AND used_at IS NULL`, Date.now(), c).changes) fail(401, "Код аль хэдийн ашиглагдсан");
  const t = activeTenant(r!.merchant) ?? fail(401, "Дэлгүүр идэвхгүй");
  const id = t.id as TenantId;
  return { tenantId: id, session: createSession(id, { staffId: "device", name: "Төхөөрөмж", role: "device", device: device.slice(0, 80) || "PWA", via: "pair" }, DEVICE_TTL_MS) };
}

/* ───────── widget / зочин ───────── */

/** Мерчантын одоогийн widget токен (QR, холбоос) */
export function widgetToken(ctx: TenantContext) {
  const t = ctx.db.one<{ public_id: string; widget_kid: string }>(`SELECT public_id, widget_kid FROM tenants WHERE id = :tenant`) ?? fail(404, "Дэлгүүр олдсонгүй");
  return signWidget({ t: t.public_id, kid: t.widget_kid, ch: ["web", "voice"] });
}
/** Токен эргүүлэх — хуучин QR, холбоос хүчингүй болно */
export function rotateWidget(ctx: TenantContext) {
  ctx.db.run(`UPDATE tenants SET widget_kid = ? WHERE id = :tenant`, rid(8));
  return widgetToken(ctx);
}

function widgetTenant(token: string, channel?: Channel) {
  const p = verifyWidget(token) ?? fail(401, "Холбоос хүчингүй");
  if (channel && !p.ch.includes(channel)) fail(403, "Энэ суваг нээлттэй биш");
  const t = rawOne<TenantRow>(`SELECT * FROM tenants WHERE public_id = ? AND status = 'active'`, p.t);
  if (!t || !safeEq(t.widget_kid, p.kid)) fail(401, "Холбоос хүчингүй (шинэчлэгдсэн байж магадгүй)");
  return t!;
}

/** Нийтийн мэдээлэл (дэлгүүрийн нэр, мэндчилгээ) — widget токеноор; эрхгүй контекст */
export function widgetContext(token: string): TenantContext {
  return makeContext(widgetTenant(token), { kind: "system", job: "widget" }, []);
}

/** POST /api/v1/widget/session — widget токеноор зочны токен олгоно (sid-ийг сервер үүсгэнэ) */
export function issueVisitor(widget: string, channel: Channel) {
  const t = widgetTenant(widget, channel);
  const sid = `v${randomBytes(18).toString("base64url")}`;
  const exp = Date.now() + VISITOR_TTL_MS;
  return { token: signVisitor({ t: t.public_id, sid, ch: channel, exp }), sid, exp, channel };
}

export { HttpError };

/** Нийтийн чат/дуудлага: зочны токен (gvs_) заавал, суваг таарах ёстой */
export function requireVisitor(req: Request, channel: Channel): TenantContext & { principal: Extract<Principal, { kind: "visitor" }> } {
  const ctx = requireTenant(req, "agent:customer");
  if (ctx.principal.kind !== "visitor" || ctx.principal.channel !== channel) fail(403, "Энэ сувгийн токен биш");
  return ctx as TenantContext & { principal: Extract<Principal, { kind: "visitor" }> };
}

/** Хуучин `?m=<РД>` холбоос → 410 (РД URL-д гарахгүй болсон) */
export function legacyMerchantParam(req: Request, body?: { m?: unknown } | null) {
  const hasAuth = !!req.headers.get("authorization") || !!new URL(req.url).searchParams.get("token") || !!new URL(req.url).searchParams.get("w");
  if (!hasAuth && (new URL(req.url).searchParams.has("m") || (body && body.m !== undefined)))
    fail(410, "Энэ холбоос хуучирсан. Дэлгүүрээс шинэ QR код, холбоос авна уу.", "gone");
}

/* ───────── түнш: embed/SSO солилцоо (§3.2, §4A.4) ───────── */

/**
 * get_ токен → session (via='partner:<id>'). Гарын үсэг, хугацаа (≤5 мин), jti НЭГ удаа, tenants.partner_id = p шалгана.
 * Буруу/давтан/хугацаа дууссан → 401; түдгэлзсэн tenant → 403.
 */
export function embedExchange(token: string): { tenantId: TenantId; session: { token: string; maxAge: number }; payload: EmbedPayload } {
  const p = verifyEmbed(token) ?? fail(401, "Токен хүчингүй эсвэл хугацаа дууссан");
  const t = rawOne<TenantRow>(`SELECT * FROM tenants WHERE id = ? AND partner_id = ?`, p.t, p.p) ?? fail(401, "Токен хүчингүй");
  const used = rawRun(`UPDATE embed_jti SET used_at = ? WHERE jti = ? AND partner_id = ? AND merchant = ? AND used_at IS NULL AND expires_at > ?`, Date.now(), p.jti, p.p, p.t, Date.now());
  if (!Number(used.changes)) fail(401, "Токен аль хэдийн ашиглагдсан эсвэл хүчингүй");
  if (t!.status === "suspended") fail(403, "Дэлгүүрийн эрх түдгэлзсэн байна");
  const id = t!.id as TenantId;
  const session = createSession(id, { staffId: `ext:${String(p.u.id).slice(0, 40)}`, name: String(p.u.name || "Хэрэглэгч").slice(0, 60), role: p.u.role, via: `partner:${p.p}` });
  return { tenantId: id, session, payload: p };
}

/** Embed session-ий cookie: https-д iframe дотор ажиллахаар SameSite=None; Secure; Partitioned (CHIPS) */
export function embedSessionCookie(req: Request, s: { token: string; maxAge: number }) {
  return isHttps(req)
    ? `${SESSION_COOKIE}=${s.token}; Path=/; HttpOnly; SameSite=None; Secure; Partitioned; Max-Age=${s.maxAge}`
    : sessionCookie(req, s);
}

/**
 * Түншийн хүсэлтээр хийх СИСТЕМИЙН ажил (бүрэн устгалт, мерчант зөвшөөрсөн экспорт) — tenant тухайн түншийнх эсэхийг
 * серверийн хүснэгтээс шалгаад systemContext өгнө. Өөр түншийнх/байхгүй → null (route 404). Зөвхөн partner/erase-д.
 */
export function partnerJobContext(pctx: PartnerContext, tenantId: string, job: "erase" | "export"): TenantContext | null {
  const r = rawOne<TenantRow>(`SELECT * FROM tenants WHERE id = ? AND partner_id = ?`, String(tenantId), pctx.partnerId);
  return r ? makeContext(r, { kind: "system", job: `partner:${job}` }, []) : null;
}
