/**
 * Гарын үсэгтэй токенууд (HMAC-SHA256, AUTH_SECRET):
 *   gwt_<payload>.<sig> — widget токен (вэб чат, дуудлагын нийтийн холбоос, QR). payload {t, kid, ch}
 *   gvs_<payload>.<sig> — зочны (visitor) токен, нэг ярианд. payload {t, sid, ch, exp}
 * `t` = tenants.public_id (РД биш) — URL, QR-д мерчантын РД гарахгүй.
 * Цэвэр функц (зөвхөн node:crypto) — нэгж тестээр шууд шалгана.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

export type Channel = "web" | "voice";
export type WidgetPayload = { t: string; kid: string; ch: Channel[] };
export type VisitorPayload = { t: string; sid: string; ch: Channel; exp: number };

const MIN_SECRET = 32;

/** AUTH_SECRET (32+ тэмдэгт). Байхгүй бол токен үүсгэх/шалгах боломжгүй. */
export function authSecret(): string {
  const s = process.env.AUTH_SECRET || "";
  if (s.length < MIN_SECRET) throw new Error("AUTH_SECRET тохируулаагүй (32+ тэмдэгт) — .env.local");
  return s;
}

const b64 = (s: string) => Buffer.from(s, "utf8").toString("base64url");
const sig = (prefix: string, body: string, secret: string) => createHmac("sha256", secret).update(`${prefix}.${body}`).digest("base64url");

function sign(prefix: "gwt" | "gvs", payload: object, secret = authSecret()) {
  const body = b64(JSON.stringify(payload));
  return `${prefix}_${body}.${sig(prefix, body, secret)}`;
}

/** Гарын үсгийг шалгаад payload буцаана; буруу бол null */
function verify<T>(prefix: "gwt" | "gvs", token: string, secret = authSecret()): T | null {
  if (typeof token !== "string" || !token.startsWith(`${prefix}_`) || token.length > 600) return null;
  const rest = token.slice(prefix.length + 1);
  const dot = rest.indexOf(".");
  if (dot <= 0) return null;
  const body = rest.slice(0, dot);
  const got = Buffer.from(rest.slice(dot + 1));
  const want = Buffer.from(sig(prefix, body, secret));
  if (got.length !== want.length || !timingSafeEqual(got, want)) return null;
  try {
    const p = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    return p && typeof p === "object" ? (p as T) : null;
  } catch {
    return null;
  }
}

const isCh = (c: unknown): c is Channel => c === "web" || c === "voice";

export const signWidget = (p: WidgetPayload, secret?: string) => sign("gwt", { t: p.t, kid: p.kid, ch: p.ch }, secret);
export function verifyWidget(token: string, secret?: string): WidgetPayload | null {
  const p = verify<WidgetPayload>("gwt", token, secret);
  if (!p || typeof p.t !== "string" || typeof p.kid !== "string" || !Array.isArray(p.ch) || !p.ch.every(isCh)) return null;
  return p;
}

export const VISITOR_TTL_MS = 30 * 86_400_000;
export const signVisitor = (p: VisitorPayload, secret?: string) => sign("gvs", { t: p.t, sid: p.sid, ch: p.ch, exp: p.exp }, secret);
export function verifyVisitor(token: string, now = Date.now(), secret?: string): VisitorPayload | null {
  const p = verify<VisitorPayload>("gvs", token, secret);
  if (!p || typeof p.t !== "string" || typeof p.sid !== "string" || !isCh(p.ch) || typeof p.exp !== "number") return null;
  if (!/^[A-Za-z0-9_-]{8,64}$/.test(p.sid)) return null;
  if (p.exp <= now) return null;
  return p;
}
