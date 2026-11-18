/**
 * /api/v1-ийн нийтлэг дүрэм (docs/ARCHITECTURE.md §4.4):
 *   алдаа `{ "error": { "code", "message" } }` · `Idempotency-Key` (бичих хүсэлтэд) · `?cursor=&limit=` (≤200)
 *   · JSON ≤ 1 МБ · key/session бүрт 600 хүсэлт/мин · цаг ISO-8601 UTC · мөнгө ₮ бүхэл.
 */
import { PayError } from "@/lib/agent/billing";
import { logError } from "@/lib/log";
import { LiveError } from "@/lib/pos/live";
import { requireTenant } from "@/lib/tenant/auth";
import type { Scope, TenantContext } from "@/lib/tenant/context";
import { HttpError, rate } from "@/lib/tenant/http";
import { ensureJobs } from "@/lib/tenant/jobs";

const CODE: Record<number, string> = {
  400: "bad_request",
  401: "unauthorized",
  402: "payment_required",
  403: "forbidden",
  404: "not_found",
  409: "conflict",
  410: "gone",
  413: "payload_too_large",
  422: "unprocessable",
  423: "locked",
  429: "rate_limited",
  501: "not_implemented",
  502: "upstream_unavailable",
  503: "unavailable",
};

export class V1Error extends HttpError {}
export const v1fail = (status: number, message: string, code?: string): never => {
  throw new V1Error(status, message, code);
};

export const errJson = (status: number, message: string, code?: string) => Response.json({ error: { code: code || CODE[status] || "error", message } }, { status });

/** Route handler-ийг боож алдааг нэг хэлбэрт оруулна */
export function v1<A extends unknown[]>(fn: (...a: A) => Promise<Response>) {
  return async (...a: A): Promise<Response> => {
    ensureJobs();
    try {
      return await fn(...a);
    } catch (e) {
      if (e instanceof HttpError) return errJson(e.status, e.message, e.code);
      if (e instanceof LiveError) return errJson(502, e.message);
      if (e instanceof PayError) return errJson(e.status, e.message);
      logError("v1", e);
      return errJson(500, "Серверийн алдаа", "internal");
    }
  };
}

/** Tenant + scope + хязгаар (600/мин нэг principal-д) */
export function v1Tenant(req: Request, need: Scope | Scope[]): TenantContext {
  const ctx = requireTenant(req, need);
  const p = ctx.principal;
  rate(`v1:${ctx.tenantId}:${p.kind === "api_key" ? p.prefix : p.kind === "session" ? p.sessionId.slice(0, 16) : p.kind}`, 600);
  return ctx;
}

/** JSON body (≤ max байт) */
export async function readJson<T = Record<string, unknown>>(req: Request, max = 1_000_000): Promise<T> {
  const len = Number(req.headers.get("content-length") || 0);
  if (len > max) v1fail(413, "Хүсэлт хэт том");
  const t = await req.text();
  if (t.length > max) v1fail(413, "Хүсэлт хэт том");
  if (!t) return {} as T;
  try {
    return JSON.parse(t) as T;
  } catch {
    return v1fail(400, "JSON буруу");
  }
}

/** ?limit (1..200, анхдагч 50) ба ?cursor (base64url JSON) */
export function pageOf(req: Request, def = 50) {
  const u = new URL(req.url);
  const n = Number(u.searchParams.get("limit") || def);
  const limit = Math.max(1, Math.min(200, Number.isFinite(n) ? Math.floor(n) : def));
  const c = u.searchParams.get("cursor");
  let after: string | null = null;
  if (c) {
    try {
      const j = JSON.parse(Buffer.from(c, "base64url").toString("utf8")) as { a?: unknown };
      after = typeof j.a === "string" ? j.a : null;
    } catch {
      v1fail(400, "cursor буруу");
    }
  }
  return { limit, after };
}
export const cursorOf = (after: string) => Buffer.from(JSON.stringify({ a: after }), "utf8").toString("base64url");

/** limit+1 мөр уншсан жагсаалтаас хуудас үүсгэнэ */
export function paged<T>(rows: T[], limit: number, key: (r: T) => string) {
  const more = rows.length > limit;
  const items = more ? rows.slice(0, limit) : rows;
  return { items, next: more && items.length ? cursorOf(key(items[items.length - 1])) : null };
}

/**
 * Idempotency-Key: ижил түлхүүрээр давтсан бичих хүсэлтэд анхны хариуг буцаана (24 цаг).
 * Түлхүүр tenant + арга + замаар хүрээлэгдэнэ.
 */
export async function idempotent(ctx: TenantContext, req: Request, fn: () => Promise<Response>): Promise<Response> {
  const raw = req.headers.get("idempotency-key");
  if (!raw) return fn();
  if (!/^[A-Za-z0-9_.:-]{1,100}$/.test(raw)) v1fail(400, "Idempotency-Key буруу (1–100 тэмдэгт, [A-Za-z0-9_.:-])");
  const key = `${req.method} ${new URL(req.url).pathname} ${raw}`.slice(0, 300);
  const now = Date.now();
  const hit = ctx.db.one<{ status: number | null; body: string | null; at: number }>(`SELECT status, body, at FROM idempotency WHERE merchant = :tenant AND key = ?`, key);
  if (hit && now - hit.at < 86_400_000) {
    if (hit.status == null) v1fail(409, "Ижил Idempotency-Key-тэй хүсэлт боловсруулагдаж байна");
    return new Response(hit.body ?? "", { status: hit.status!, headers: { "Content-Type": "application/json", "Idempotent-Replayed": "true" } });
  }
  if (hit) ctx.db.run(`DELETE FROM idempotency WHERE merchant = :tenant AND key = ?`, key);
  if (!Number(ctx.db.run(`INSERT OR IGNORE INTO idempotency (merchant, key, status, body, at) VALUES (:tenant, ?, NULL, NULL, ?)`, key, now).changes)) v1fail(409, "Ижил Idempotency-Key-тэй хүсэлт боловсруулагдаж байна");
  let res: Response;
  try {
    res = await fn();
  } catch (e) {
    ctx.db.run(`DELETE FROM idempotency WHERE merchant = :tenant AND key = ?`, key);
    throw e;
  }
  if (res.status >= 500) {
    ctx.db.run(`DELETE FROM idempotency WHERE merchant = :tenant AND key = ?`, key);
    return res;
  }
  const body = await res.text();
  ctx.db.run(`UPDATE idempotency SET status = ?, body = ? WHERE merchant = :tenant AND key = ?`, res.status, body.slice(0, 200_000), key);
  if (Math.random() < 0.02) ctx.db.run(`DELETE FROM idempotency WHERE merchant = :tenant AND at < ?`, now - 86_400_000);
  return new Response(body, { status: res.status, headers: res.headers });
}
