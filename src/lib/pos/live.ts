/**
 * LiveAdapter (docs/ARCHITECTURE.md §4B.2) — түншийн connector-оос ХҮСЭЛТИЙН АГШИНД уншина/бичнэ, юу ч хадгалахгүй
 * (c_* хоосон, дискэнд кэш/лог үгүй). Гэрээ: docs/partner-connector-openapi.yaml · жишээ: examples/partner-connector/server.mjs
 *
 * Гарын үсэг (Gerege → түнш):
 *   X-Gerege-Timestamp: <unix ms>   X-Gerege-Request-Id: <uuid>
 *   X-Gerege-Signature: v1=hex(HMAC-SHA256(secret, ts + "\n" + METHOD + "\n" + pathname?query + "\n" + hex(sha256(body))))
 * Хугацаа 4 сек, GET-д 1 дахин оролдлого; 5 дараалсан алдаа → 30 сек хаалттай (circuit breaker).
 * Кэш: зөвхөн нэг хүсэлтийн (адаптерын instance = нэг TenantContext) санах ойд.
 */
import { createHash, createHmac, randomUUID } from "node:crypto";
import type { Actor } from "@/lib/sp/core";
import { access } from "@/lib/tenant/access";
import type { TenantId } from "@/lib/tenant/context";
import { openSystem } from "@/lib/tenant/crypto";
import { tdb } from "@/lib/tenant/tdb";
import { log } from "@/lib/log";
import { allowPrivate, assertPublicUrl, UrlBlocked } from "@/lib/net";
import type { PosAdapter, ProductUpsert, StoreInfo } from "./adapter";
import type { CProduct, CSalesSummary, CStock, CStockAdjustment, Unit } from "./canonical";

export class LiveError extends Error {
  status = 502;
}
export const LIVE_DOWN = "Кассын системтэй холбогдож чадсангүй, дараа дахин асууна уу.";

const TIMEOUT_MS = 4_000;
const MAX_BYTES = 1_000_000;
const MAX_ITEMS = 200;

type Cfg = { ext: string; pid: string; url: string | null; sec: string | null; sandbox: number };

/* ───────── circuit breaker (түнш бүрт) ───────── */
const gb = globalThis as unknown as { __liveBreaker?: Map<string, { fails: number; openUntil: number }> };
const breaker = () => (gb.__liveBreaker ??= new Map());
function guard(pid: string) {
  const b = breaker().get(pid);
  if (b && b.openUntil > Date.now()) throw new LiveError(LIVE_DOWN);
}
function mark(pid: string, ok: boolean) {
  const m = breaker();
  if (ok) return void m.delete(pid);
  const b = m.get(pid) ?? { fails: 0, openUntil: 0 };
  b.fails += 1;
  if (b.fails >= 5) {
    b.openUntil = Date.now() + 30_000;
    b.fails = 0;
  }
  m.set(pid, b);
}

/** Гарын үсэг — жишээ connector ба тест ижил функцээр шалгана */
export function signConnector(secret: string, ts: string, method: string, pathAndQuery: string, body: string) {
  const bh = createHash("sha256").update(body).digest("hex");
  return `v1=${createHmac("sha256", secret).update(`${ts}\n${method.toUpperCase()}\n${pathAndQuery}\n${bh}`).digest("hex")}`;
}

/** Түншийн connector руу гарын үсэгтэй хүсэлт (partner/connector test-д ч ашиглана) */
export async function connectorFetch<T>(
  c: { pid: string; url: string; secret: string; sandbox: boolean },
  method: "GET" | "POST",
  rel: string,
  body?: unknown,
  extra: Record<string, string> = {},
): Promise<T> {
  guard(c.pid);
  const base = c.url.replace(/\/+$/, "");
  let u: URL;
  try {
    u = await assertPublicUrl(base + rel, { allowPrivate: allowPrivate(c.sandbox) });
  } catch (e) {
    throw new LiveError(e instanceof UrlBlocked ? `Connector хаяг хориотой: ${e.message}` : LIVE_DOWN);
  }
  const payload = body === undefined ? "" : JSON.stringify(body);
  const attempts = method === "GET" ? 2 : 1;
  let lastErr: unknown = null;
  for (let i = 0; i < attempts; i++) {
    const ts = String(Date.now());
    const headers: Record<string, string> = {
      "X-Gerege-Timestamp": ts,
      "X-Gerege-Request-Id": randomUUID(),
      "X-Gerege-Signature": signConnector(c.secret, ts, method, u.pathname + u.search, payload),
      Accept: "application/json",
      ...extra,
    };
    if (payload) headers["Content-Type"] = "application/json";
    try {
      const r = await fetch(u, { method, headers, body: payload || undefined, signal: AbortSignal.timeout(TIMEOUT_MS), redirect: "error" });
      if (r.status === 429) throw new LiveError("Кассын систем түр ачаалалтай байна, дараа дахин оролдоно уу.");
      const len = Number(r.headers.get("content-length") || 0);
      if (len > MAX_BYTES) throw new LiveError("Connector-ийн хариу хэт том");
      const text = await r.text();
      if (text.length > MAX_BYTES) throw new LiveError("Connector-ийн хариу хэт том");
      if (!r.ok) {
        lastErr = new LiveError(r.status === 404 ? "Connector-оос олдсонгүй" : LIVE_DOWN);
        if (r.status === 404) {
          mark(c.pid, true);
          throw lastErr;
        }
        if (r.status < 500) break;
        continue;
      }
      mark(c.pid, true);
      return (text ? JSON.parse(text) : {}) as T;
    } catch (e) {
      if (e instanceof LiveError && /олдсонгүй|ачаалал|хэт том/.test(e.message)) throw e;
      lastErr = e;
    }
  }
  mark(c.pid, false);
  throw lastErr instanceof LiveError ? lastErr : new LiveError(LIVE_DOWN);
}

/* ───────── хөрвүүлэлт (түншийн хариу итгэлгүй — хэлбэрийг шалгана) ───────── */
const str = (v: unknown, n = 200) => (typeof v === "string" ? v.slice(0, n) : v == null ? undefined : String(v).slice(0, n));
const num = (v: unknown, d = 0) => (typeof v === "number" && Number.isFinite(v) ? v : Number.isFinite(Number(v)) ? Number(v) : d);
const UNITS: Unit[] = ["pcs", "kg", "l", "pack"];
function toProduct(x: unknown): CProduct | null {
  if (!x || typeof x !== "object") return null;
  const o = x as Record<string, unknown>;
  const id = str(o.id, 80);
  const name = str(o.name, 200);
  if (!id || !name) return null;
  return {
    id,
    extId: str(o.extId, 80),
    sku: str(o.sku, 80),
    barcodes: Array.isArray(o.barcodes) ? o.barcodes.map((b) => String(b).slice(0, 32)).slice(0, 10) : [],
    name,
    brand: str(o.brand, 80),
    category: str(o.category, 80),
    unit: UNITS.includes(o.unit as Unit) ? (o.unit as Unit) : "pcs",
    unitLabel: str(o.unitLabel, 16),
    price: Math.round(num(o.price)),
    cost: o.cost == null ? undefined : Math.round(num(o.cost)),
    active: o.active !== false,
    imageUrl: typeof o.imageUrl === "string" && /^https:\/\//.test(o.imageUrl) ? o.imageUrl.slice(0, 500) : undefined,
    taxCode: str(o.taxCode, 20),
    updatedAt: str(o.updatedAt, 40) ?? new Date().toISOString(),
  };
}
const toStock = (x: unknown): CStock | null => {
  if (!x || typeof x !== "object") return null;
  const o = x as Record<string, unknown>;
  const productId = str(o.productId, 80);
  return productId ? { productId, location: str(o.location, 40) ?? "main", qty: num(o.qty), minQty: num(o.minQty), updatedAt: str(o.updatedAt, 40) ?? new Date().toISOString() } : null;
};
const items = <T>(j: unknown, f: (x: unknown) => T | null): T[] => {
  const a = j && typeof j === "object" && Array.isArray((j as { items?: unknown }).items) ? (j as { items: unknown[] }).items : [];
  return a
    .slice(0, MAX_ITEMS)
    .map(f)
    .filter((x): x is T => x !== null);
};

export function liveAdapter(tenantId: TenantId): PosAdapter {
  const db = tdb(tenantId);
  let cfg: { c: { pid: string; url: string; secret: string; sandbox: boolean }; ext: string } | null = null;
  const conf = () => {
    if (cfg) return cfg;
    const r = db.one<Cfg>(
      `SELECT t.ext_merchant_id AS ext, t.partner_id AS pid, p.connector_url AS url, p.connector_secret AS sec, p.sandbox AS sandbox
       FROM tenants t JOIN partners p ON p.id = t.partner_id WHERE t.id = :tenant`,
    );
    if (!r || !r.url || !r.sec || !r.ext) throw new LiveError("Кассын системийн холболт (connector) тохируулагдаагүй байна.");
    cfg = { c: { pid: r.pid, url: r.url, secret: openSystem(`partners|connector_secret|${r.pid}`, r.sec), sandbox: !!r.sandbox }, ext: r.ext };
    return cfg;
  };
  /** нэг хүсэлтийн санах ойн кэш (ижил GET-ийг ээлж дотор дахин дуудахгүй) */
  const memo = new Map<string, Promise<unknown>>();
  const call = async <T>(method: "GET" | "POST", path: string, kind: string, body?: unknown, extra?: Record<string, string>): Promise<T> => {
    const { c, ext } = conf();
    const rel = `/merchants/${encodeURIComponent(ext)}${path}`;
    const key = `${method} ${rel}`;
    if (method === "GET" && memo.has(key)) return memo.get(key) as Promise<T>;
    const t0 = Date.now();
    const p = connectorFetch<T>(c, method, rel, body, extra).then(
      (j) => {
        const it = (j as unknown as { items?: unknown } | null)?.items;
        const n = Array.isArray(it) ? it.length : 1;
        access({ tenantId, principal: { kind: "system", job: "live" }, requestId: randomUUID() }, method === "GET" ? "connector.fetch" : "connector.write", kind, n);
        log("connector.fetch", { tenant: tenantId, kind, count: n, ms: Date.now() - t0, status: "ok" });
        return j;
      },
      (e) => {
        log("connector.fetch", { tenant: tenantId, kind, ms: Date.now() - t0, status: "error", errorClass: e instanceof Error ? e.constructor.name : "Error" });
        memo.delete(key);
        throw e;
      },
    );
    if (method === "GET") memo.set(key, p);
    return p;
  };
  const qs = (o: Record<string, string | number | undefined>) => {
    const s = new URLSearchParams();
    for (const [k, v] of Object.entries(o)) if (v !== undefined && v !== "") s.set(k, String(v));
    const x = s.toString();
    return x ? `?${x}` : "";
  };

  const self: PosAdapter = {
    kind: "live",
    capabilities: { orders: false, campaigns: false, refunds: false, loyalty: false, ebarimt: false, pushStock: "direct" },

    async listProducts(q = {}) {
      const j = await call<unknown>("GET", `/products${qs({ search: q.search, barcode: q.barcode, category: q.category, limit: Math.min(MAX_ITEMS, q.limit ?? MAX_ITEMS) })}`, "products");
      return items(j, toProduct);
    },
    async getProduct(id) {
      try {
        return toProduct(await call<unknown>("GET", `/products/${encodeURIComponent(id)}`, "product"));
      } catch (e) {
        if (e instanceof LiveError && /олдсонгүй/.test(e.message)) return null;
        throw e;
      }
    },
    async upsertProduct(_actor: Actor, u: ProductUpsert) {
      const p = toProduct(await call<unknown>("POST", `/products`, "product", u));
      if (!p) throw new LiveError("Connector бараа үүсгэсэнгүй");
      return p;
    },
    async stock(ids) {
      return items(await call<unknown>("GET", `/stock${qs({ productIds: ids?.length ? ids.slice(0, MAX_ITEMS).join(",") : undefined })}`, "stock"), toStock);
    },
    async adjustStock(actor: Actor, adj) {
      const body = { items: adj.map((a) => ({ productId: a.productId, delta: a.delta, reason: a.reason, ref: a.ref ?? null, by: a.by || actor.name })) };
      const idem = createHash("sha256").update(JSON.stringify(body)).digest("hex").slice(0, 32);
      const j = await call<{ applied?: unknown[] }>("POST", `/stock-adjustments`, "stock_adjustments", body, { "Idempotency-Key": idem });
      const now = new Date().toISOString();
      const applied: CStockAdjustment[] = (Array.isArray(j.applied) ? j.applied : []).map((x, i) => {
        const o = (x ?? {}) as Record<string, unknown>;
        const a = adj[i];
        return { id: str(o.id, 80) ?? `live-${idem.slice(0, 8)}-${i}`, productId: str(o.productId, 80) ?? a?.productId ?? "", delta: num(o.delta, a?.delta ?? 0), reason: a?.reason ?? "count", ref: a?.ref, by: a?.by || actor.name, at: str(o.at, 40) ?? now };
      });
      return { applied, pending: [] };
    },
    async salesSummary(range, groupBy) {
      const j = await call<unknown>("GET", `/sales/summary${qs({ from: range.from.toISOString(), to: range.to.toISOString(), groupBy })}`, "sales_summary");
      return items(j, (x): CSalesSummary | null => {
        const o = (x ?? {}) as Record<string, unknown>;
        const key = str(o.key, 200);
        return key ? { key, qty: num(o.qty), total: Math.round(num(o.total)), count: Math.round(num(o.count)) } : null;
      });
    },
    async sales() {
      throw new LiveError("Live горимд түүхий борлуулалт татахгүй — нэгтгэсэн тайлан (salesSummary) ашиглана.");
    },
    async customers() {
      return []; // §4B.1 — ПОС-ын харилцагчийг уншихгүй (гэрээнд endpoint ч байхгүй)
    },
    async storeInfo(): Promise<StoreInfo> {
      const j = (await call<Record<string, unknown>>("GET", `/store`, "store")) ?? {};
      return { name: str(j.name, 120) ?? "", hours: str(j.hours, 120), deliveryEnabled: j.deliveryEnabled === true };
    },
  };
  return self;
}
