/**
 * Connector API (/api/v1) — docs/ARCHITECTURE.md §4.3–4.4, §7, §16 (T5, T8, connector: idempotent sales, adjustments → ack).
 * Хар хайрцаг: `next start` (түр SP_DATA_DIR, mock Qwen/QPay). Тестийн процесс ижил SQLite файлыг уншиж шалгана.
 *   NEXT_DIST_DIR=.next-con npm run build && NEXT_DIST_DIR=.next-con node --test tests/connector.test.mjs
 */
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import http from "node:http";
import { after, before, describe, test } from "node:test";
import { Client, startServer } from "./helpers/server.mjs";
import { src } from "./helpers/ts.mjs";

const A = { regNo: "8800301", pin: "4321", store: "Гамма дэлгүүр" };
let srv, a, sync, dbm, rawDb;
const DAY = 86_400_000;

const v1 = async (key, method, p, body, headers = {}) => {
  const r = await fetch(`${srv.base}/api/v1${p}`, { method, headers: { ...(key ? { authorization: `Bearer ${key}` } : {}), ...(body !== undefined ? { "content-type": "application/json" } : {}), ...headers }, body: body !== undefined ? JSON.stringify(body) : undefined });
  const text = await r.text();
  let data = null;
  try {
    data = JSON.parse(text);
  } catch {
    /* текст */
  }
  return { status: r.status, data, text, headers: r.headers };
};

before(async () => {
  srv = await startServer({ ALLOW_PRIVATE_CONNECTOR: "yes", JOBS: "off" });
  process.env.SP_DATA_DIR = srv.dataDir;
  process.env.AUTH_SECRET = srv.secret;
  process.env.ALLOW_PRIVATE_CONNECTOR = "yes";
  dbm = await src("lib/agent/db");
  rawDb = dbm.db();
  // GePOS tenant (session)
  const core = await src("lib/sp/core");
  const s = core.freshState();
  s.merchant = { ...s.merchant, regNo: A.regNo, pin: A.pin, name: A.store, pinTries: 0 };
  a = new Client(srv.base);
  const r = await a.post("/api/auth/login", { regNo: A.regNo, pin: A.pin, bootstrap: s });
  assert.equal(r.status, 200, r.text);
  // Sync горимтой түнш → connector tenant + connectorKey
  const { ensurePartner } = await import("../scripts/seed-partner.mjs");
  const p = await ensurePartner({ slug: "sync-demo", name: "Sync-demo" });
  rawDb.prepare(`UPDATE partners SET mode = 'sync' WHERE id = ?`).run(p.partnerId);
  const t = await v1(p.key, "POST", "/partner/tenants", { extMerchantId: "sx-1", name: "Синк дэлгүүр (demo)" });
  assert.equal(t.status, 201, t.text);
  assert.equal(t.data.posKind, "connector");
  assert.match(t.data.connectorKey, /^gai_/);
  sync = { partnerKey: p.key, tenantId: t.data.tenantId, key: t.data.connectorKey };
  rawDb.prepare(`UPDATE tenants SET status = 'active', terms_at = ? WHERE id = ?`).run(Date.now(), sync.tenantId);
  const ro = await v1(p.key, "POST", `/partner/tenants/${sync.tenantId}/keys`, { label: "ro", scopes: ["connector:read"] });
  assert.equal(ro.status, 201, ro.text);
  sync.ro = ro.data.key;
  sync.roPrefix = ro.data.prefix;
});
after(async () => {
  await srv?.stop();
});

describe("OpenAPI", () => {
  test("openapi.json — 3.1, §4.4-ийн бүх зам (inventory, partner орно)", async () => {
    const r = await v1(null, "GET", "/openapi.json");
    assert.equal(r.status, 200);
    assert.equal(r.data.openapi, "3.1.0");
    for (const p of [
      "/me", "/products", "/products/{id}", "/stock", "/sales", "/customers", "/stock-adjustments", "/stock-adjustments/{id}/ack", "/webhooks",
      "/inventory/sessions", "/inventory/sessions/{id}", "/inventory/sessions/{id}/photos", "/inventory/sessions/{id}/counts", "/inventory/sessions/{id}/counts/{cid}",
      "/inventory/sessions/{id}/variance", "/inventory/sessions/{id}/approve", "/inventory/sessions/{id}/reject", "/inventory/products/{id}/profile",
      "/inventory/drafts", "/inventory/drafts/{id}/confirm", "/inventory/photos/{id}", "/inventory/reorder", "/inventory/gaps",
      "/widget/tokens", "/widget/session", "/agent/chat", "/agent/voice", "/agent/events", "/agent/command", "/usage", "/assistants", "/assistants/{id}",
      "/partner/me", "/partner/tenants", "/partner/tenants/{id}", "/partner/tenants/{id}/suspend", "/partner/tenants/{id}/resume", "/partner/tenants/{id}/keys",
      "/partner/tenants/{id}/keys/{prefix}", "/partner/tenants/{id}/embed-token", "/partner/usage", "/partner/webhook", "/partner/branding", "/partner/connector",
      "/partner/connector/test", "/partner/retention", "/partner/tenants/{id}/data", "/partner/tenants/{id}/export", "/partner/access-log",
    ])
      assert.ok(r.data.paths[p], `openapi: ${p} алга`);
    assert.ok(r.data.components.securitySchemes.partnerKey);
  });
});

describe("Нэвтрэлт ба scope (T5)", () => {
  test("түлхүүргүй → 401, алдааны хэлбэр {error:{code,message}}", async () => {
    const r = await v1(null, "GET", "/products");
    assert.equal(r.status, 401);
    assert.equal(r.data.error.code, "unauthorized");
    assert.equal(typeof r.data.error.message, "string");
  });
  test("connector:read түлхүүрээр PUT → 403; хүчингүй болгосон → 401", async () => {
    const w = await v1(sync.ro, "PUT", "/products", { items: [{ extId: "x", name: "x", price: 1 }] });
    assert.equal(w.status, 403);
    assert.equal(w.data.error.code, "forbidden");
    assert.equal((await v1(sync.ro, "GET", "/me")).status, 200);
    const del = await v1(sync.partnerKey, "DELETE", `/partner/tenants/${sync.tenantId}/keys/${sync.roPrefix}`);
    assert.equal(del.status, 200, del.text);
    assert.equal((await v1(sync.ro, "GET", "/products")).status, 401);
  });
  test("MCP түлхүүр (scope mcp) connector endpoint-д → 403", async () => {
    const k = await a.post("/api/agent/keys", { label: "mcp" });
    assert.match(k.data.key, /^gai_/);
    assert.equal((await v1(k.data.key, "GET", "/products")).status, 403);
  });
  test("GET /me — tenant, pos_kind, scopes, capabilities", async () => {
    const r = await v1(sync.key, "GET", "/me");
    assert.equal(r.status, 200);
    assert.equal(r.data.tenant.posKind, "connector");
    assert.deepEqual(r.data.scopes.sort(), ["connector:read", "connector:write"]);
    assert.equal(r.data.capabilities.pushStock, "webhook");
  });
  test("GePOS tenant-д түлхэх endpoint → 409 not_sync_mode", async () => {
    const k = await a.post("/api/agent/keys", { label: "w", scopes: ["connector:write", "connector:read"] });
    const r = await v1(k.data.key, "PUT", "/products", { items: [{ extId: "g1", name: "g", price: 1 }] });
    assert.equal(r.status, 409);
    assert.equal(r.data.error.code, "not_sync_mode");
    const g = await v1(k.data.key, "GET", "/products?limit=3");
    assert.equal(g.status, 200, g.text);
    assert.ok(g.data.items.length > 0, "gepos бараа адаптераар");
  });
});

describe("Sync: бараа, үлдэгдэл, борлуулалт", () => {
  test("PUT /products — extId-аар upsert, давтахад шинээр үүсэхгүй", async () => {
    const items = Array.from({ length: 5 }, (_, i) => ({ extId: `SKU-${i + 1}`, name: `Синтетик бараа ${i + 1}`, price: 1000 + i, barcodes: [`99900000000${i}`], category: "Туршилт" }));
    const r1 = await v1(sync.key, "PUT", "/products", { items });
    assert.equal(r1.status, 200, r1.text);
    assert.equal(r1.data.created, 5);
    const r2 = await v1(sync.key, "PUT", "/products", { items: items.map((x) => ({ ...x, price: x.price + 1 })) });
    assert.equal(r2.data.created, 0);
    assert.equal(r2.data.upserted, 5);
    assert.equal(rawDb.prepare(`SELECT COUNT(*) n FROM c_products WHERE merchant = ?`).get(sync.tenantId).n, 5);
  });
  test("cursor хуудаслалт — бүх мөр нэг л удаа", async () => {
    const seen = [];
    let cur = "";
    for (let i = 0; i < 5; i++) {
      const r = await v1(sync.key, "GET", `/products?limit=2${cur ? `&cursor=${cur}` : ""}`);
      assert.equal(r.status, 200);
      assert.ok(r.data.items.length <= 2);
      seen.push(...r.data.items.map((p) => p.id));
      if (!r.data.next) break;
      cur = r.data.next;
    }
    assert.equal(seen.length, 5);
    assert.equal(new Set(seen).size, 5);
    assert.equal((await v1(sync.key, "GET", "/products?cursor=%%%")).status, 400);
  });
  test("barcode, search шүүлт; GET /products/{id}; 404 хэлбэр", async () => {
    const r = await v1(sync.key, "GET", "/products?barcode=999000000002");
    assert.equal(r.data.items.length, 1);
    assert.equal(r.data.items[0].extId, "SKU-3");
    const one = await v1(sync.key, "GET", `/products/${r.data.items[0].id}`);
    assert.equal(one.data.name, "Синтетик бараа 3");
    const nf = await v1(sync.key, "GET", "/products/nope");
    assert.equal(nf.status, 404);
    assert.equal(nf.data.error.code, "not_found");
  });
  test("PUT /stock → GET /stock", async () => {
    const r = await v1(sync.key, "PUT", "/stock", { items: [{ extId: "SKU-1", qty: 12, minQty: 3 }, { extId: "SKU-2", qty: 4 }] });
    assert.equal(r.status, 200, r.text);
    const g = await v1(sync.key, "GET", "/stock");
    assert.equal(g.data.items.length, 2);
    assert.equal(g.data.items.find((s) => s.qty === 12).minQty, 3);
    assert.equal((await v1(sync.key, "PUT", "/stock", { items: [{ extId: "NOPE", qty: 1 }] })).status, 404);
  });
  test("POST /sales — ижил extId 2 удаа → 1 мөр (idempotent)", async () => {
    const sale = { extId: "R-1001", at: new Date().toISOString(), lines: [{ name: "Синтетик бараа 1", qty: 2, unitPrice: 1001 }], method: "cash" };
    const r1 = await v1(sync.key, "POST", "/sales", { items: [sale] });
    assert.deepEqual(r1.data, { inserted: 1, duplicates: 0 });
    const r2 = await v1(sync.key, "POST", "/sales", { items: [sale, { ...sale, extId: "R-1002" }] });
    assert.deepEqual(r2.data, { inserted: 1, duplicates: 1 });
    assert.equal(rawDb.prepare(`SELECT COUNT(*) n FROM c_sales WHERE merchant = ? AND ext_id = 'R-1001'`).get(sync.tenantId).n, 1);
    const g = await v1(sync.key, "GET", "/sales");
    assert.equal(g.data.items.length, 2);
    assert.equal(g.data.items[0].total, 2002);
  });
  test("Idempotency-Key — давтахад анхны хариу (Idempotent-Replayed)", async () => {
    const h = { "idempotency-key": "test-key-1" };
    const body = { items: [{ extId: "R-2001", at: new Date().toISOString(), lines: [{ name: "x", qty: 1, unitPrice: 5 }] }] };
    const r1 = await v1(sync.key, "POST", "/sales", body, h);
    const r2 = await v1(sync.key, "POST", "/sales", body, h);
    assert.deepEqual(r1.data, { inserted: 1, duplicates: 0 });
    assert.deepEqual(r2.data, r1.data);
    assert.equal(r2.headers.get("idempotent-replayed"), "true");
    assert.equal((await v1(sync.key, "POST", "/sales", body, { "idempotency-key": "bad key!" })).status, 400);
  });
  test("хэт олон мөр (>500) → 413", async () => {
    const items = Array.from({ length: 501 }, (_, i) => ({ extId: `B${i}`, name: "b", price: 1 }));
    assert.equal((await v1(sync.key, "PUT", "/products", { items })).status, 413);
  });
});

describe("Тооллогын засвар → ack, webhook", () => {
  let hook, received = [], fail = 1;
  before(async () => {
    hook = http.createServer(async (req, res) => {
      let b = "";
      for await (const c of req) b += c;
      received.push({ headers: req.headers, body: b });
      res.writeHead(fail-- > 0 ? 500 : 200);
      res.end();
    });
    await new Promise((r) => hook.listen(0, "127.0.0.1", r));
  });
  after(() => new Promise((r) => hook.close(r)));

  test("SSRF: http://, хувийн IP, metadata хаяг татгалзана", async () => {
    const net = await src("lib/net");
    for (const u of ["http://example.com/x", "https://10.0.0.1/x", "https://169.254.169.254/latest", "https://192.168.1.5/", "https://[::1]/", "https://user:pw@example.com/"])
      await assert.rejects(net.assertPublicUrl(u), net.UrlBlocked, u);
    assert.equal(net.isPrivateIp("172.20.1.1"), true);
    assert.equal(net.isPrivateIp("8.8.8.8"), false);
    const r = await v1(sync.key, "POST", "/webhooks", { url: "ftp://example.com/x" });
    assert.equal(r.status, 400);
  });

  let whSecret;
  test("POST /webhooks → secret нэг удаа, DB-д шифрлэгдсэн", async () => {
    const r = await v1(sync.key, "POST", "/webhooks", { url: `http://127.0.0.1:${hook.address().port}/hook`, events: ["stock.adjusted"] });
    assert.equal(r.status, 201, r.text);
    whSecret = r.data.secret;
    assert.match(whSecret, /^whsec_/);
    const row = rawDb.prepare(`SELECT secret FROM webhooks WHERE merchant = ?`).get(sync.tenantId);
    assert.ok(row.secret.startsWith("e1.") && !row.secret.includes(whSecret));
    const l = await v1(sync.key, "GET", "/webhooks");
    assert.equal(l.data.items.length, 1);
    assert.ok(!JSON.stringify(l.data).includes("whsec_"));
  });

  let adjId;
  test("батлагдсан засвар → pending → ack → applied (давтахад ижил)", async () => {
    const { connectorAdapter } = await src("lib/pos/connector");
    const pid = rawDb.prepare(`SELECT id FROM c_products WHERE merchant = ? AND ext_id = 'SKU-1'`).get(sync.tenantId).id;
    const r = await connectorAdapter(sync.tenantId).adjustStock({ name: "Тест" }, [{ productId: pid, delta: -2, reason: "count", ref: "inv1", by: "Тест" }]);
    assert.equal(r.pending.length, 1);
    const g = await v1(sync.key, "GET", "/stock-adjustments?status=pending");
    assert.equal(g.data.items.length, 1);
    adjId = g.data.items[0].id;
    assert.equal(g.data.items[0].extId, "SKU-1");
    assert.equal(g.data.items[0].delta, -2);
    const k1 = await v1(sync.key, "POST", `/stock-adjustments/${adjId}/ack`);
    assert.equal(k1.data.status, "applied");
    const k2 = await v1(sync.key, "POST", `/stock-adjustments/${adjId}/ack`);
    assert.deepEqual(k2.data, k1.data);
    assert.equal((await v1(sync.key, "GET", "/stock-adjustments")).data.items.length, 0);
    assert.equal((await v1(sync.key, "GET", "/stock-adjustments?status=applied")).data.items.length, 1);
    assert.equal((await v1(sync.key, "POST", `/stock-adjustments/nope/ack`)).status, 404);
  });

  test("outbox → webhook: HMAC гарын үсэг, алдаа → 1 мин дараа дахин", async () => {
    const { deliverDue, RETRY_MS } = await src("lib/tenant/outbox");
    const now = Date.now();
    const r1 = await deliverDue(now);
    assert.equal(r1.failed, 1, JSON.stringify(r1));
    const row = rawDb.prepare(`SELECT tries, next_at, done_at FROM outbox WHERE merchant = ? ORDER BY id DESC LIMIT 1`).get(sync.tenantId);
    assert.equal(row.tries, 1);
    assert.equal(row.done_at, null);
    assert.ok(row.next_at >= now + RETRY_MS[0] - 5000);
    const r2 = await deliverDue(row.next_at + 1);
    assert.equal(r2.sent, 1, JSON.stringify(r2));
    const last = received.at(-1);
    assert.equal(last.headers["x-gerege-event"], "stock.adjusted");
    assert.equal(last.headers["x-gerege-signature"], `sha256=${createHmac("sha256", whSecret).update(last.body).digest("hex")}`);
    const body = JSON.parse(last.body);
    assert.equal(body.event, "stock.adjusted");
    assert.equal(body.data.delta, -2);
    assert.equal(received[0].headers["x-gerege-delivery"], last.headers["x-gerege-delivery"]);
  });

  test("DELETE /webhooks/{id}", async () => {
    const l = await v1(sync.key, "GET", "/webhooks");
    assert.equal((await v1(sync.key, "DELETE", `/webhooks/${l.data.items[0].id}`)).status, 200);
    assert.equal((await v1(sync.key, "DELETE", `/webhooks/${l.data.items[0].id}`)).status, 404);
  });
});

describe("Хэрэглээ (§7) /api/v1/usage", () => {
  test("кредит 0 → daysLeft null, status empty", async () => {
    const r = await a.get("/api/v1/usage");
    assert.equal(r.status, 200, r.text);
    assert.equal(r.data.wallet.credits, 0);
    assert.equal(r.data.runway.daysLeft, null);
    assert.equal(r.data.runway.status, "empty");
    assert.equal(r.data.daily.length, 30);
  });
  test("тоонууд SELECT SUM-тай таарна; суваг, үйлдэл, хандлага, тасархай шугам", async () => {
    // QPay sandbox (mock) → 1,000 кредит
    const inv = await a.post("/api/agent/billing", { plan: "start" });
    assert.equal(inv.status, 200, inv.text);
    assert.equal((await a.post(`/api/agent/billing/${inv.data.id}`, {})).data.status, "paid");
    const now = Date.now();
    const ins = rawDb.prepare(`INSERT INTO usage (merchant, kind, credits, ref, at, channel, feature) VALUES (?, ?, ?, ?, ?, ?, ?)`);
    const rows = [
      ["chat", 1, "cv1", 0.1, "web", "reply"], ["chat", 1, "cv1", 0.2, "web", "reply"], ["chat", 1, "cv2", 1.5, "fb", "reply"],
      ["voice", 5, "cv3", 2.5, "voice", "voice_minute"], ["command", 2, "cd1", 3.5, "director", "command"], ["inv_photo", 3, null, 4.5, "inventory", "shelf_photo"],
      ["chat", 1, "cv4", 9.5, "web", "reply"], ["chat", 1, "cv5", 10.5, "web", "reply"], ["command", 2, "cd2", 12.5, "director", "command"],
    ];
    let spent = 0;
    for (const [kind, c, ref, d, ch, f] of rows) {
      ins.run(A.regNo, kind, c, ref, now - d * DAY, ch, f);
      spent += c;
    }
    rawDb.prepare(`UPDATE wallet SET credits = credits - ? WHERE merchant = ?`).run(spent, A.regNo);
    const r = await a.get("/api/v1/usage?days=30");
    assert.equal(r.status, 200, r.text);
    const u = r.data;
    const sum7 = rawDb.prepare(`SELECT SUM(credits) s FROM usage WHERE merchant = ? AND credits > 0 AND at >= ?`).get(A.regNo, now - 7 * DAY).s;
    const prev7 = rawDb.prepare(`SELECT SUM(credits) s FROM usage WHERE merchant = ? AND credits > 0 AND at >= ? AND at < ?`).get(A.regNo, now - 14 * DAY, now - 7 * DAY).s;
    assert.equal(u.burn.perDay7, Math.round((sum7 / 7) * 100) / 100);
    assert.equal(u.burn.trend, Math.round(((sum7 / 7) / (prev7 / 7) - 1) * 100) / 100);
    assert.equal(u.wallet.credits, 1000 - spent);
    // мөчлөг = сүүлийн багцын төлбөрөөс хойш (энд мөрүүд төлбөрөөс ӨМНӨХ огноотой тул мөчлөгт 0)
    const paidAt = rawDb.prepare(`SELECT MAX(paid_at) t FROM invoices WHERE merchant = ? AND status = 'paid'`).get(A.regNo).t;
    const cycSpent = rawDb.prepare(`SELECT COALESCE(SUM(credits),0) s FROM usage WHERE merchant = ? AND credits > 0 AND at >= ?`).get(A.regNo, paidAt).s;
    assert.equal(u.cycle.spent, cycSpent);
    assert.equal(u.cycle.granted, u.wallet.credits + cycSpent);
    assert.equal(u.cycle.pctLeft, Math.round((u.wallet.credits / u.cycle.granted) * 10000) / 100);
    const dailyTotal = u.daily.reduce((s, d) => s + d.web + d.fb + d.voice + d.director + d.mcp + d.inventory, 0);
    assert.equal(dailyTotal, spent);
    assert.equal(u.byChannel.reduce((s, c) => s + c.credits, 0), spent);
    assert.equal(u.byChannel.find((c) => c.channel === "web").events, 4);
    assert.equal(u.byFeature.find((f) => f.feature === "voice_minute").unitCost, 5);
    assert.equal(u.value.conversations, 5);
    assert.ok(u.runway.daysLeft > 0 && u.runway.emptyOn);
    assert.ok(u.runway.dailyAllowance > 0);
    assert.ok(["ok", "expiring_unused"].includes(u.runway.status));
    assert.ok(u.value.tugrikPerConversation > 0);
  });
  test("reserve() суваг/үйлдлийг principal-аас бөглөнө", async () => {
    const billing = await src("lib/agent/billing");
    const auth = await src("lib/tenant/auth");
    const ctx = auth.systemContext(A.regNo, "test");
    const r = billing.reserve({ ...ctx, principal: { kind: "visitor", sid: "vtest00001", channel: "voice" } }, "voice", 5, "cvx");
    const row = rawDb.prepare(`SELECT channel, feature FROM usage WHERE id = ?`).get(r.id);
    assert.deepEqual({ ...row }, { channel: "voice", feature: "voice_minute" });
    billing.refund(ctx, r);
    const r2 = billing.reserve({ ...ctx, principal: { kind: "webhook", source: "fb" } }, "chat", 1);
    assert.equal(rawDb.prepare(`SELECT channel FROM usage WHERE id = ?`).get(r2.id).channel, "fb");
    billing.refund(ctx, r2);
  });
  test("statusOf: low <20%, critical <5%, 0-д хуваахгүй", async () => {
    const { statusOf } = await src("lib/agent/billing");
    assert.equal(statusOf(100, 50, 30, 30), "ok");
    assert.equal(statusOf(100, 19, null, null), "low");
    assert.equal(statusOf(100, 50, 4, 30), "low");
    assert.equal(statusOf(10, 4, null, null), "critical");
    assert.equal(statusOf(10, 50, 0.5, null), "critical");
    assert.equal(statusOf(0, 0, null, null), "empty");
    assert.equal(statusOf(900, 90, 100, 20), "expiring_unused");
  });
  test("API түлхүүрт usage:read scope-гүй → 403 (T8: зөвхөн эрхтэй)", async () => {
    assert.equal((await v1(sync.key, "GET", "/usage")).status, 403);
  });
});
