/**
 * Embed/SSO токен (§3.2, §4A.4) ба iframe-ийн frame-ancestors cookie — цэвэр функц (зөвхөн node:crypto),
 * proxy.ts-ээс ч импортлогдоно (DB хандалтгүй).
 *   get_<b64url(payload)>.<HMAC>   payload {p, t, u:{id,name,role}, v, jti, exp, fa}
 *   gp_fa = <b64url(origins)>.<HMAC>   — /connect, /ai-ийн CSP frame-ancestors (proxy.ts уншина)
 */
import { createHmac, timingSafeEqual } from "node:crypto";

export type EmbedView = "onboarding" | "dashboard" | "billing" | "count";
export type EmbedRole = "owner" | "manager" | "staff";
export type EmbedPayload = { p: string; t: string; u: { id: string; name: string; role: EmbedRole }; v: EmbedView; jti: string; exp: number; fa: string[] };

export const EMBED_TTL_MS = 5 * 60_000;
export const FA_COOKIE = "gp_fa";

const secret = () => {
  const s = process.env.AUTH_SECRET || "";
  if (s.length < 32) throw new Error("AUTH_SECRET тохируулаагүй (32+ тэмдэгт)");
  return s;
};
const mac = (label: string, body: string, key: string) => createHmac("sha256", key).update(`${label}.${body}`).digest("base64url");
const eq = (a: string, b: string) => {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

export function signEmbed(p: EmbedPayload, key = secret()) {
  const body = Buffer.from(JSON.stringify(p), "utf8").toString("base64url");
  return `get_${body}.${mac("get", body, key)}`;
}

/** Гарын үсэг + хэлбэр + хугацаа. jti-ийн нэг удаагийн шалгалтыг DB-тэй (auth.ts embedExchange) хийнэ. */
export function verifyEmbed(token: string, now = Date.now(), key?: string): EmbedPayload | null {
  if (typeof token !== "string" || !token.startsWith("get_") || token.length > 1500) return null;
  const rest = token.slice(4);
  const dot = rest.indexOf(".");
  if (dot <= 0) return null;
  const body = rest.slice(0, dot);
  let k: string;
  try {
    k = key ?? secret();
  } catch {
    return null;
  }
  if (!eq(rest.slice(dot + 1), mac("get", body, k))) return null;
  try {
    const p = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as EmbedPayload;
    if (!p || typeof p.p !== "string" || typeof p.t !== "string" || typeof p.jti !== "string" || typeof p.exp !== "number") return null;
    if (!p.u || !["owner", "manager", "staff"].includes(p.u.role)) return null;
    if (p.exp <= now) return null;
    p.fa = Array.isArray(p.fa) ? p.fa.filter(isOrigin) : [];
    return p;
  } catch {
    return null;
  }
}

/** https://host[:port] (dev-д http://localhost) — CSP-д шууд орох тул хатуу шалгана */
export const isOrigin = (s: unknown): s is string => typeof s === "string" && /^https:\/\/[a-z0-9.-]+(:\d{1,5})?$/i.test(s) || (typeof s === "string" && /^http:\/\/(localhost|127\.0\.0\.1)(:\d{1,5})?$/.test(s));

export function signFa(origins: string[], key = secret()) {
  const body = Buffer.from(JSON.stringify(origins.filter(isOrigin).slice(0, 10)), "utf8").toString("base64url");
  return `${body}.${mac("fa", body, key)}`;
}
export function verifyFa(v: string | null | undefined, key?: string): string[] {
  if (!v || v.length > 2000) return [];
  const dot = v.indexOf(".");
  if (dot <= 0) return [];
  let k: string;
  try {
    k = key ?? secret();
  } catch {
    return [];
  }
  const body = v.slice(0, dot);
  if (!eq(v.slice(dot + 1), mac("fa", body, k))) return [];
  try {
    const a = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    return Array.isArray(a) ? a.filter(isOrigin) : [];
  } catch {
    return [];
  }
}
