/**
 * Connector API — sync горим (pos_kind='connector', §4.3–4.4): гуравдагч ПОС tenant-ын өөрийн түлхүүрээр түлхэнэ.
 * Live горимд (түншийн анхдагч) түлхэх endpoint-ууд 409 — өгөгдөл Gerege-д хадгалагдахгүй (§4B.1).
 * Бүх query `:tenant`-тэй (ctx.db).
 */
import { randomBytes } from "node:crypto";
import { rid } from "@/lib/agent/db";
import type { CProduct } from "@/lib/pos/canonical";
import type { TenantContext } from "@/lib/tenant/context";
import { encS } from "@/lib/tenant/crypto";
import { urlShapeOk } from "@/lib/net";
import { paged, v1fail } from "./http";

type Cx = TenantContext;
const MAX_BATCH = 500;
const iso = (ms: number) => new Date(ms).toISOString();
const S = (v: unknown, n: number) => (v == null || v === "" ? null : String(v).slice(0, n));
const N = (v: unknown, name: string) => {
  const x = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(x)) v1fail(400, `${name}: тоо байх ёстой`);
  return x;
};
const EXT = /^[A-Za-z0-9_.:\/-]{1,80}$/;

export function requireSync(ctx: Cx) {
  if (ctx.pos.kind !== "connector") v1fail(409, ctx.pos.kind === "live" ? "Live горим: өгөгдөл таны connector-оос шууд уншигдана, түлхэх шаардлагагүй (sync-ийг PUT /partner/connector-оор асаана)" : "Энэ tenant sync горимд биш", "not_sync_mode");
}
const batch = <T>(b: unknown): T[] => {
  const items = Array.isArray(b) ? b : b && typeof b === "object" && Array.isArray((b as { items?: unknown }).items) ? (b as { items: unknown[] }).items : v1fail(400, "items массив шаардлагатай");
  if (!items.length) v1fail(400, "items хоосон");
  if (items.length > MAX_BATCH) v1fail(413, `Нэг удаад ≤ ${MAX_BATCH}`);
  return items as T[];
};

/* ───────── бараа ───────── */

type PRow = { id: string; ext_id: string | null; sku: string | null; barcodes: string; name: string; brand: string | null; category: string | null; unit: string; price: number; cost: number | null; active: number; image_url: string | null; tax_code: string | null; updated_at: number };
const toC = (r: PRow): CProduct => ({
  id: r.id,
  extId: r.ext_id ?? undefined,
  sku: r.sku ?? undefined,
  barcodes: (() => {
    try {
      return JSON.parse(r.barcodes) as string[];
    } catch {
      return [];
    }
  })(),
  name: r.name,
  brand: r.brand ?? undefined,
  category: r.category ?? undefined,
  unit: (["pcs", "kg", "l", "pack"].includes(r.unit) ? r.unit : "pcs") as CProduct["unit"],
  price: r.price,
  cost: r.cost ?? undefined,
  active: !!r.active,
  imageUrl: r.image_url ?? undefined,
  taxCode: r.tax_code ?? undefined,
  updatedAt: iso(r.updated_at),
});

export function upsertProducts(ctx: Cx, body: unknown) {
  requireSync(ctx);
  const items = batch<Record<string, unknown>>(body);
  const out: { extId: string; id: string; created: boolean }[] = [];
  const now = Date.now();
  for (const [i, x] of items.entries()) {
    const ext = S(x.extId ?? x.ext_id, 80);
    if (!ext || !EXT.test(ext)) v1fail(400, `items[${i}].extId шаардлагатай`);
    const name = S(x.name, 200) ?? v1fail(400, `items[${i}].name шаардлагатай`);
    const price = Math.round(N(x.price, `items[${i}].price`));
    const barcodes = Array.isArray(x.barcodes) ? x.barcodes.map((b) => String(b).slice(0, 32)).filter(Boolean).slice(0, 10) : [];
    const prev = ctx.db.one<{ id: string }>(`SELECT id FROM c_products WHERE merchant = :tenant AND ext_id = ?`, ext!);
    const id = prev?.id ?? `cp${now.toString(36)}${rid(6)}`;
    ctx.db.run(
      `INSERT INTO c_products (merchant, id, ext_id, sku, barcodes, name, brand, category, unit, price, cost, active, image_url, tax_code, updated_at)
       VALUES (:tenant, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(merchant, id) DO UPDATE SET sku = excluded.sku, barcodes = excluded.barcodes, name = excluded.name, brand = excluded.brand,
         category = excluded.category, unit = excluded.unit, price = excluded.price, cost = excluded.cost, active = excluded.active,
         image_url = excluded.image_url, tax_code = excluded.tax_code, updated_at = excluded.updated_at`,
      id,
      ext!,
      S(x.sku, 80),
      JSON.stringify(barcodes),
      name!,
      S(x.brand, 80),
      S(x.category, 80),
      ["pcs", "kg", "l", "pack"].includes(String(x.unit)) ? String(x.unit) : "pcs",
      price,
      x.cost == null ? null : Math.round(N(x.cost, `items[${i}].cost`)),
      x.active === false ? 0 : 1,
      typeof x.imageUrl === "string" && /^https:\/\//.test(x.imageUrl) ? x.imageUrl.slice(0, 500) : null,
      S(x.taxCode, 20),
      now,
    );
    ctx.db.run(`DELETE FROM c_barcodes WHERE merchant = :tenant AND product_id = ?`, id);
    for (const b of barcodes) ctx.db.run(`INSERT OR REPLACE INTO c_barcodes (merchant, barcode, product_id) VALUES (:tenant, ?, ?)`, b, id);
    out.push({ extId: ext!, id, created: !prev });
  }
  return { upserted: out.length, created: out.filter((x) => x.created).length, items: out };
}

export async function listProducts(ctx: Cx, q: { search?: string | null; barcode?: string | null; updatedSince?: string | null; limit: number; after: string | null }) {
  if (ctx.pos.kind !== "connector") {
    // gepos / live — адаптераар (live: түншийн connector-оос, хадгалахгүй)
    const items = await ctx.pos.listProducts({ search: q.search ?? undefined, barcode: q.barcode ?? undefined, limit: q.limit });
    return { items: items.slice(0, q.limit), next: null as string | null };
  }
  const since = q.updatedSince ? Date.parse(q.updatedSince) : 0;
  if (q.updatedSince && !Number.isFinite(since)) v1fail(400, "updated_since: ISO-8601");
  const like = q.search ? `%${q.search.toLocaleLowerCase("mn").slice(0, 60)}%` : null;
  const rows = ctx.db.all<PRow>(
    `SELECT p.* FROM c_products p WHERE p.merchant = :tenant AND (? IS NULL OR p.id > ?) AND p.updated_at >= ?
       AND (? IS NULL OR lower(p.name) LIKE ? OR lower(COALESCE(p.category,'')) LIKE ?)
       AND (? IS NULL OR EXISTS (SELECT 1 FROM c_barcodes b WHERE b.merchant = :tenant AND b.product_id = p.id AND b.barcode = ?))
     ORDER BY p.id LIMIT ?`,
    q.after,
    q.after,
    since || 0,
    like,
    like,
    like,
    q.barcode ?? null,
    q.barcode ?? null,
    q.limit + 1,
  );
  return paged(rows.map(toC), q.limit, (p) => p.id);
}

export async function getProduct(ctx: Cx, id: string) {
  const p = await ctx.pos.getProduct(id);
  if (!p) v1fail(404, "Бараа олдсонгүй");
  return p;
}

/* ───────── үлдэгдэл ───────── */

const productIdOf = (ctx: Cx, x: Record<string, unknown>, i: number) => {
  if (x.productId) {
    const r = ctx.db.one<{ id: string }>(`SELECT id FROM c_products WHERE merchant = :tenant AND id = ?`, String(x.productId));
    if (r) return r.id;
  }
  const ext = S(x.extId, 80);
  const r = ext ? ctx.db.one<{ id: string }>(`SELECT id FROM c_products WHERE merchant = :tenant AND ext_id = ?`, ext) : undefined;
  return r?.id ?? v1fail(404, `items[${i}]: бараа олдсонгүй (productId эсвэл extId)`);
};

export function setStock(ctx: Cx, body: unknown) {
  requireSync(ctx);
  const items = batch<Record<string, unknown>>(body);
  const now = Date.now();
  for (const [i, x] of items.entries()) {
    const pid = productIdOf(ctx, x, i);
    const qty = N(x.qty, `items[${i}].qty`);
    const loc = S(x.location, 40) ?? "main";
    ctx.db.run(
      `INSERT INTO c_stock (merchant, product_id, location, qty, min_qty, updated_at) VALUES (:tenant, ?, ?, ?, ?, ?)
       ON CONFLICT(merchant, product_id, location) DO UPDATE SET qty = excluded.qty, min_qty = COALESCE(?, c_stock.min_qty), updated_at = excluded.updated_at`,
      pid,
      loc,
      qty,
      x.minQty == null ? 0 : N(x.minQty, `items[${i}].minQty`),
      now,
      x.minQty == null ? null : N(x.minQty, `items[${i}].minQty`),
    );
  }
  return { updated: items.length };
}

export async function listStock(ctx: Cx, ids?: string[]) {
  return { items: await ctx.pos.stock(ids?.length ? ids : undefined) };
}

/* ───────── борлуулалт (ext_id-аар давхардахгүй) ───────── */

export function pushSales(ctx: Cx, body: unknown) {
  requireSync(ctx);
  const items = batch<Record<string, unknown>>(body);
  let inserted = 0;
  let duplicates = 0;
  for (const [i, x] of items.entries()) {
    const ext = S(x.extId, 80);
    if (!ext || !EXT.test(ext)) v1fail(400, `items[${i}].extId шаардлагатай`);
    const at = Date.parse(String(x.at ?? ""));
    if (!Number.isFinite(at)) v1fail(400, `items[${i}].at: ISO-8601`);
    const lines = Array.isArray(x.lines) ? x.lines.slice(0, 200) : v1fail(400, `items[${i}].lines массив`);
    const clean = lines.map((l: unknown, k: number) => {
      const o = (l ?? {}) as Record<string, unknown>;
      return { productId: S(o.productId, 80) ?? undefined, name: S(o.name, 200) ?? v1fail(400, `items[${i}].lines[${k}].name`), qty: N(o.qty, "qty"), unitPrice: Math.round(N(o.unitPrice, "unitPrice")) };
    });
    const total = x.total == null ? clean.reduce((a, l) => a + l.qty * l.unitPrice, 0) : Math.round(N(x.total, `items[${i}].total`));
    const r = ctx.db.run(
      `INSERT OR IGNORE INTO c_sales (merchant, id, ext_id, at, channel, lines, total, method, customer_id, status) VALUES (:tenant, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      `cs${Date.now().toString(36)}${rid(6)}`,
      ext!,
      at,
      ["pos", "delivery", "online"].includes(String(x.channel)) ? String(x.channel) : "pos",
      JSON.stringify(clean),
      total,
      ["cash", "card", "qr"].includes(String(x.method)) ? String(x.method) : "other",
      S(x.customerId, 80),
      x.status === "refunded" ? "refunded" : "completed",
    );
    if (Number(r.changes)) inserted++;
    else duplicates++;
  }
  return { inserted, duplicates };
}

export function listSales(ctx: Cx, q: { from: number; to: number; limit: number; after: string | null }) {
  if (ctx.pos.kind !== "connector") v1fail(409, "Түүхий борлуулалт зөвхөн sync горимд (live-д нэгтгэсэн тайлан AI-аар)", "not_sync_mode");
  const rows = ctx.db.all<{ id: string; ext_id: string; at: number; channel: string; lines: string; total: number; method: string; customer_id: string | null; status: string }>(
    `SELECT id, ext_id, at, channel, lines, total, method, customer_id, status FROM c_sales WHERE merchant = :tenant AND at >= ? AND at <= ? AND (? IS NULL OR id > ?) ORDER BY id LIMIT ?`,
    q.from,
    q.to,
    q.after,
    q.after,
    q.limit + 1,
  );
  return paged(
    rows.map((r) => ({ id: r.id, extId: r.ext_id, at: iso(r.at), channel: r.channel, lines: JSON.parse(r.lines), total: r.total, method: r.method, customerId: r.customer_id ?? undefined, status: r.status })),
    q.limit,
    (r) => r.id,
  );
}

/* ───────── харилцагч (зөвхөн seed/синтетик) ───────── */

export function upsertCustomers(ctx: Cx, body: unknown) {
  requireSync(ctx);
  const items = batch<Record<string, unknown>>(body);
  for (const [i, x] of items.entries()) {
    const ext = S(x.extId, 80);
    if (!ext || !EXT.test(ext)) v1fail(400, `items[${i}].extId шаардлагатай`);
    const prev = ctx.db.one<{ id: string }>(`SELECT id FROM c_customers WHERE merchant = :tenant AND ext_id = ?`, ext!);
    const id = prev?.id ?? `cc${Date.now().toString(36)}${rid(6)}`;
    ctx.db.run(
      `INSERT INTO c_customers (merchant, id, ext_id, phone, name, opt_in, points) VALUES (:tenant, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(merchant, id) DO UPDATE SET phone = excluded.phone, name = excluded.name, opt_in = excluded.opt_in, points = excluded.points`,
      id,
      ext!,
      S(x.phone, 20),
      S(x.name, 120),
      x.optIn === true ? 1 : 0,
      x.points == null ? null : Math.round(N(x.points, "points")),
    );
  }
  return { upserted: items.length };
}

export function listCustomers(ctx: Cx, q: { limit: number; after: string | null }) {
  if (ctx.pos.kind !== "connector") return { items: [], next: null };
  const rows = ctx.db.all<{ id: string; ext_id: string | null; phone: string | null; name: string | null; opt_in: number; points: number | null }>(
    `SELECT id, ext_id, phone, name, opt_in, points FROM c_customers WHERE merchant = :tenant AND (? IS NULL OR id > ?) ORDER BY id LIMIT ?`,
    q.after,
    q.after,
    q.limit + 1,
  );
  return paged(rows.map((c) => ({ id: c.id, extId: c.ext_id ?? undefined, phone: c.phone ?? undefined, name: c.name ?? undefined, optIn: !!c.opt_in, points: c.points ?? undefined })), q.limit, (c) => c.id);
}

/* ───────── тооллогын засвар (pull + ack) ───────── */

export function listAdjustments(ctx: Cx, q: { status: string; limit: number; after: string | null }) {
  const st = ["pending", "applied", "all"].includes(q.status) ? q.status : "pending";
  const rows = ctx.db.all<{ id: string; product_id: string; ext_id: string | null; delta: number; reason: string; ref: string | null; by: string | null; status: string; at: number; acked_at: number | null }>(
    `SELECT a.id, a.product_id, p.ext_id, a.delta, a.reason, a.ref, a.by, a.status, a.at, a.acked_at FROM c_adjustments a
     LEFT JOIN c_products p ON p.merchant = :tenant AND p.id = a.product_id
     WHERE a.merchant = :tenant AND (? = 'all' OR a.status = ?) AND (? IS NULL OR a.id > ?) ORDER BY a.id LIMIT ?`,
    st,
    st,
    q.after,
    q.after,
    q.limit + 1,
  );
  return paged(
    rows.map((r) => ({ id: r.id, productId: r.product_id, extId: r.ext_id ?? undefined, delta: r.delta, reason: r.reason, ref: r.ref ?? undefined, by: r.by ?? undefined, status: r.status, at: iso(r.at), ackedAt: r.acked_at ? iso(r.acked_at) : null })),
    q.limit,
    (r) => r.id,
  );
}

export function ackAdjustment(ctx: Cx, id: string) {
  const r = ctx.db.one<{ status: string; acked_at: number | null }>(`SELECT status, acked_at FROM c_adjustments WHERE merchant = :tenant AND id = ?`, id);
  if (!r) v1fail(404, "Засвар олдсонгүй");
  if (r!.status !== "applied") ctx.db.run(`UPDATE c_adjustments SET status = 'applied', acked_at = ? WHERE merchant = :tenant AND id = ? AND status = 'pending'`, Date.now(), id);
  const x = ctx.db.one<{ status: string; acked_at: number }>(`SELECT status, acked_at FROM c_adjustments WHERE merchant = :tenant AND id = ?`, id)!;
  return { id, status: x.status, ackedAt: iso(x.acked_at) };
}

/* ───────── webhook ───────── */

export const WEBHOOK_EVENTS = ["stock.adjusted", "product.created", "*"] as const;

export function listWebhooks(ctx: Cx) {
  return {
    items: ctx.db
      .all<{ id: string; url: string; events: string; active: number }>(`SELECT id, url, events, active FROM webhooks WHERE merchant = :tenant ORDER BY id`)
      .map((w) => ({ id: w.id, url: w.url, events: JSON.parse(w.events) as string[], active: !!w.active })),
  };
}

export function createWebhook(ctx: Cx, b: { url?: unknown; events?: unknown }) {
  const url = String(b.url ?? "").trim();
  if (!urlShapeOk(url, { allowPrivate: process.env.ALLOW_PRIVATE_CONNECTOR === "yes" })) v1fail(400, "url: https:// нийтийн хаяг (хувийн IP хориотой)");
  const events = Array.isArray(b.events) && b.events.length ? b.events.map(String) : ["stock.adjusted"];
  if (!events.every((e) => (WEBHOOK_EVENTS as readonly string[]).includes(e))) v1fail(400, `events: ${WEBHOOK_EVENTS.join(", ")}`);
  if ((ctx.db.one<{ n: number }>(`SELECT COUNT(*) AS n FROM webhooks WHERE merchant = :tenant`)?.n ?? 0) >= 5) v1fail(409, "Хамгийн ихдээ 5 webhook");
  const id = `wh${rid(10)}`;
  const secret = `whsec_${randomBytes(24).toString("base64url")}`;
  ctx.db.run(`INSERT INTO webhooks (merchant, id, url, secret, events, active) VALUES (:tenant, ?, ?, ?, ?, 1)`, id, url, encS(ctx, secret, `webhooks|secret|${id}`), JSON.stringify(events));
  return { id, url, events, secret, note: "secret нэг л удаа харагдана" };
}

export function deleteWebhook(ctx: Cx, id: string) {
  if (!Number(ctx.db.run(`DELETE FROM webhooks WHERE merchant = :tenant AND id = ?`, id).changes)) v1fail(404, "Webhook олдсонгүй");
  return { deleted: true };
}
