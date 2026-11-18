#!/usr/bin/env node
/**
 * Жишээ түншийн connector («Dayansoft-ийн сервер»-ийг төлөөлнө) — docs/partner-connector-openapi.yaml-ийн гэрээ.
 * СИНТЕТИК өгөгдөл л (бодит мерчант, харилцагч байхгүй). Gerege хүсэлт бүрийг гарын үсгээр шалгана.
 *   CONNECTOR_SECRET=gcs_… PORT=3200 node examples/partner-connector/server.mjs
 *   (эсвэл --secret-file <path> — scripts/seed-partner.mjs бичнэ)
 * Хамааралгүй: зөвхөн node:http, node:crypto.
 */
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { readFileSync } from "node:fs";
import http from "node:http";
import { pathToFileURL } from "node:url";

const CATALOG = [
  ["Сүү 1л (demo)", "Сүүн бүтээгдэхүүн", 3200], ["Тараг 500г (demo)", "Сүүн бүтээгдэхүүн", 2800], ["Талх цагаан (demo)", "Талх", 1900],
  ["Өндөг 10ш (demo)", "Өндөг", 5200], ["Гурил 2кг (demo)", "Хуурай хүнс", 4800], ["Будаа 1кг (demo)", "Хуурай хүнс", 3900],
  ["Ус 0.5л (demo)", "Ундаа", 900], ["Кола 1.25л (demo)", "Ундаа", 3500], ["Шоколад 90г (demo)", "Чихэр", 4200],
  ["Кофе 3в1 (demo)", "Халуун ундаа", 600], ["Цай 25ш (demo)", "Халуун ундаа", 3100], ["Саван (demo)", "Ахуйн бараа", 2500],
];
const MERCHANTS = {
  "ds-1001": { name: "Сансар хүнсний дэлгүүр (demo)", hours: "09:00–22:00", take: 12 },
  "ds-1002": { name: "Зайсан мини маркет (demo)", hours: "08:00–23:00", take: 8 },
};
/** Детерминист санамсаргүй (mulberry32) — ижил өгөгдөл үүснэ */
const rng = (seed) => () => ((seed = (seed + 0x6d2b79f5) | 0), (((seed ^ (seed >>> 15)) * (1 | seed)) >>> 0) / 4294967296);

function buildData() {
  const data = {};
  for (const [ext, m] of Object.entries(MERCHANTS)) {
    const r = rng(ext.length * 7919 + Number(ext.slice(3)));
    const products = CATALOG.slice(0, m.take).map(([name, category, price], i) => ({
      id: `${ext}-p${String(i + 1).padStart(3, "0")}`, extId: `SKU-${i + 1}`, barcodes: [`200${ext.slice(3)}${String(i + 1).padStart(5, "0")}`.slice(0, 13)],
      name, category, unit: "pcs", price, cost: Math.round(price * 0.72), active: true, updatedAt: "2026-11-01T00:00:00.000Z",
    }));
    const stock = Object.fromEntries(products.map((p) => [p.id, { qty: Math.floor(r() * 60) + 3, minQty: 5 }]));
    const sales = [];
    for (let d = 13; d >= 0; d--) for (let k = 0; k < 6 + Math.floor(r() * 6); k++) {
      const p = products[Math.floor(r() * products.length)];
      const qty = 1 + Math.floor(r() * 3);
      sales.push({ at: Date.now() - d * 86_400_000 - Math.floor(r() * 36e6), name: p.name, qty, total: qty * p.price });
    }
    data[ext] = { ...m, products, stock, sales, adjustments: [] };
  }
  return data;
}

export function verify(secret, req, body, seen, now = Date.now()) {
  const ts = String(req.headers["x-gerege-timestamp"] || "");
  const id = String(req.headers["x-gerege-request-id"] || "");
  const got = String(req.headers["x-gerege-signature"] || "");
  if (!secret || !/^\d{12,14}$/.test(ts) || Math.abs(now - Number(ts)) > 5 * 60_000 || !id || seen.has(id)) return false;
  const bh = createHash("sha256").update(body).digest("hex");
  const want = `v1=${createHmac("sha256", secret).update(`${ts}\n${req.method}\n${req.url}\n${bh}`).digest("hex")}`;
  const ok = got.length === want.length && timingSafeEqual(Buffer.from(got), Buffer.from(want));
  if (ok) seen.set(id, now);
  return ok;
}

export function startConnector({ port = 3200, host = "127.0.0.1", secret = "" } = {}) {
  const state = { secret, data: buildData(), requests: [], rejected: 0, seen: new Map(), idem: new Map() };
  const srv = http.createServer(async (req, res) => {
    let body = "";
    for await (const c of req) body += c;
    const send = (code, j) => (res.writeHead(code, { "Content-Type": "application/json" }), res.end(JSON.stringify(j)));
    for (const [k, t] of state.seen) if (Date.now() - t > 6 * 60_000) state.seen.delete(k);
    if (!verify(state.secret, req, body, state.seen)) return state.rejected++, send(401, { error: "bad signature" });
    const u = new URL(req.url, "http://x");
    const q = u.searchParams;
    if (u.pathname === "/health") return send(200, { ok: true, version: "demo-1.0" });
    const m = /^\/merchants\/([A-Za-z0-9_.:-]+)(\/.*)$/.exec(u.pathname);
    const M = m && state.data[m[1]];
    state.requests.push({ method: req.method, path: u.pathname, ext: m?.[1] ?? null, at: Date.now() });
    if (!M) return send(404, { error: "merchant not found" });
    const rest = m[2];
    const view = (p) => p;
    if (req.method === "GET" && rest === "/products") {
      const s = (q.get("search") || "").toLowerCase();
      let list = M.products.filter((p) => (!s || `${p.name} ${p.category}`.toLowerCase().includes(s)) && (!q.get("barcode") || p.barcodes.includes(q.get("barcode"))) && (!q.get("category") || p.category === q.get("category")));
      const after = q.get("cursor");
      if (after) list = list.filter((p) => p.id > after);
      const lim = Math.min(200, Number(q.get("limit") || 200));
      const page = list.slice(0, lim);
      return send(200, { items: page.map(view), next: list.length > lim ? page[page.length - 1].id : null });
    }
    const pm = /^\/products\/([^/]+)$/.exec(rest);
    if (req.method === "GET" && pm) {
      const p = M.products.find((x) => x.id === decodeURIComponent(pm[1]));
      return p ? send(200, p) : send(404, { error: "not found" });
    }
    if (req.method === "GET" && rest === "/stock") {
      const ids = (q.get("productIds") || "").split(",").filter(Boolean);
      const items = Object.entries(M.stock).filter(([id]) => !ids.length || ids.includes(id)).map(([productId, s]) => ({ productId, location: "main", qty: s.qty, minQty: s.minQty, updatedAt: new Date().toISOString() }));
      return send(200, { items });
    }
    if (req.method === "GET" && rest === "/sales/summary") {
      const from = Date.parse(q.get("from") || 0) || 0, to = Date.parse(q.get("to") || "") || Date.now();
      const by = q.get("groupBy") === "product" ? "product" : "day";
      const agg = new Map();
      for (const s of M.sales) if (s.at >= from && s.at <= to) {
        const key = by === "day" ? new Date(s.at + 8 * 3600e3).toISOString().slice(0, 10) : s.name;
        const a = agg.get(key) ?? { key, qty: 0, total: 0, count: 0 };
        a.qty += s.qty; a.total += s.total; a.count += 1; agg.set(key, a);
      }
      return send(200, { items: [...agg.values()] });
    }
    if (req.method === "GET" && rest === "/store") return send(200, { name: M.name, hours: M.hours, deliveryEnabled: false });
    if (req.method === "POST" && rest === "/stock-adjustments") {
      const key = `${m[1]}:${req.headers["idempotency-key"] || ""}`;
      if (req.headers["idempotency-key"] && state.idem.has(key)) return send(200, state.idem.get(key));
      const applied = [];
      for (const it of JSON.parse(body || "{}").items ?? []) {
        const s = M.stock[it.productId];
        if (!s || typeof it.delta !== "number") continue;
        s.qty = Math.max(0, s.qty + it.delta);
        const a = { id: `adj-${M.adjustments.length + 1}`, productId: it.productId, delta: it.delta, at: new Date().toISOString() };
        M.adjustments.push(a);
        applied.push(a);
      }
      const out = { applied };
      if (req.headers["idempotency-key"]) state.idem.set(key, out);
      return send(200, out);
    }
    if (req.method === "POST" && rest === "/products") {
      const b = JSON.parse(body || "{}");
      const p = { id: `${m[1]}-p${String(M.products.length + 1).padStart(3, "0")}`, barcodes: [], unit: "pcs", active: true, ...b, updatedAt: new Date().toISOString() };
      M.products.push(p);
      M.stock[p.id] = { qty: Number(b.stock) || 0, minQty: 0 };
      return send(201, p);
    }
    send(404, { error: "not found" });
  });
  return new Promise((ok) => srv.listen(port, host, () => ok({
    url: `http://${host}:${srv.address().port}`, state,
    setSecret: (s) => { state.secret = s; },
    close: () => new Promise((r) => srv.close(r)),
  })));
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  const i = process.argv.indexOf("--secret-file");
  const secret = process.env.CONNECTOR_SECRET || (i > 0 ? readFileSync(process.argv[i + 1], "utf8").trim() : "");
  if (!secret) console.warn("CONNECTOR_SECRET алга — бүх хүсэлт 401");
  const c = await startConnector({ port: Number(process.env.PORT || 3200), secret });
  console.log(`Жишээ connector: ${c.url} (синтетик мерчант: ${Object.keys(MERCHANTS).join(", ")})`);
}
