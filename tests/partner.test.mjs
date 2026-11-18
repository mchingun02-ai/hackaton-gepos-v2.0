/**
 * Түнш (partner) ба өгөгдлийн эзэмшил — docs/ARCHITECTURE.md §4A, §4B, §16 T12–T20.
 * «Dayansoft-demo» (P1) + өөр түнш (P2), жишээ connector (синтетик), LIVE горим. Бодит өгөгдөл байхгүй.
 *   NEXT_DIST_DIR=.next-con npm run build && NEXT_DIST_DIR=.next-con node --test tests/partner.test.mjs
 */
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { copyFileSync, existsSync, readFileSync, readdirSync } from "node:fs";
import http from "node:http";
import path from "node:path";
import { after, before, describe, test } from "node:test";
import { startConnector } from "../examples/partner-connector/server.mjs";
import { seedPartner } from "../scripts/seed-partner.mjs";
import { Client, startServer } from "./helpers/server.mjs";
import { ROOT, src } from "./helpers/ts.mjs";

const SECRET = "НУУЦ-A-7731";
const DAY = 86_400_000;
let srv, rawDb, con1, con2, P1, P2, hook;
const hookGot = [];

const call = async (key, method, p, body, extra = {}) => {
  const h = { ...extra };
  if (key) h.authorization = `Bearer ${key}`;
  if (body !== undefined) h["content-type"] = "application/json";
  const r = await fetch(`${srv.base}${p.startsWith("/api") || p.startsWith("/connect") || p === "/ai" ? p : `/api/v1${p}`}`, { method, headers: h, body: body !== undefined ? JSON.stringify(body) : undefined, redirect: "manual" });
  const text = await r.text();
  let data = null;
  try {
    data = JSON.parse(text);
  } catch {
    /* текст */
  }
  return { status: r.status, data, text, headers: r.headers };
};
const tenantOf = (P, ext) => P.tenants.find((t) => t.extMerchantId === ext).tenantId;
const count = (sql, ...a) => rawDb.prepare(sql).get(...a).n;

/** embed токен → session-тэй Client */
async function embedSession(P, ext, role = "owner", view = "onboarding") {
  const m = await call(P.key, "POST", `/partner/tenants/${tenantOf(P, ext)}/embed-token`, { user: { id: `u-${role}`, name: `Тест ${role}`, role }, view });
  assert.equal(m.status, 201, m.text);
  const c = new Client(srv.base);
  const r = await c.post("/api/v1/embed/exchange", { token: m.data.token });
  return { c, r, token: m.data.token, url: m.data.url };
}

before(async () => {
  srv = await startServer({ ALLOW_PRIVATE_CONNECTOR: "yes", JOBS: "off" });
  process.env.SP_DATA_DIR = srv.dataDir;
  process.env.AUTH_SECRET = srv.secret;
  process.env.ALLOW_PRIVATE_CONNECTOR = "yes";
  rawDb = (await src("lib/agent/db")).db();
  con1 = await startConnector({ port: 0 });
  con2 = await startConnector({ port: 0 });
  P1 = await seedPartner({ base: srv.base, connector: con1.url });
  con1.setSecret(P1.connectorSecret);
  P2 = await seedPartner({ base: srv.base, connector: con2.url, slug: "other-pos", name: "Other-POS-demo", merchants: [{ extMerchantId: "ds-1001", name: "Өөр түншийн дэлгүүр (demo)" }] });
  con2.setSecret(P2.connectorSecret);
  hook = http.createServer(async (req, res) => {
    let b = "";
    for await (const c of req) b += c;
    hookGot.push({ headers: req.headers, body: b });
    res.end("ok");
  });
  await new Promise((r) => hook.listen(0, "127.0.0.1", r));
});
after(async () => {
  await con1?.close();
  await con2?.close();
  await new Promise((r) => (hook ? hook.close(r) : r()));
  await srv?.stop();
});

describe("Түншийн удирдлага", () => {
  test("seed: Dayansoft-demo 2 синтетик мерчант, LIVE, pending_terms", async () => {
    assert.equal(P1.tenants.length, 2);
    for (const t of P1.tenants) {
      assert.match(t.tenantId, /^p[a-z0-9]{14}$/);
      assert.equal(t.posKind, "live");
      assert.equal(t.status, "pending_terms");
      assert.equal(t.connectorKey, undefined);
    }
    const me = await call(P1.key, "GET", "/partner/me");
    assert.equal(me.data.name, "Dayansoft-demo");
    assert.equal(me.data.sandbox, true);
    assert.equal(me.data.connector.mode, "live");
    assert.ok(!JSON.stringify(me.data).includes(P1.connectorSecret), "secret дахин харагдахгүй");
    const row = rawDb.prepare(`SELECT connector_secret FROM partners WHERE id = ?`).get(P1.partnerId);
    assert.ok(row.connector_secret.startsWith("e1.") && !row.connector_secret.includes(P1.connectorSecret));
  });
  test("POST /partner/tenants — extMerchantId-аар idempotent", async () => {
    const r = await call(P1.key, "POST", "/partner/tenants", { extMerchantId: "ds-1001", name: "давхар" });
    assert.equal(r.status, 200);
    assert.equal(r.data.created, false);
    assert.equal(r.data.tenantId, tenantOf(P1, "ds-1001"));
    assert.equal((await call(P1.key, "POST", "/partner/tenants", { extMerchantId: "bad id!", name: "x" })).status, 400);
  });
  test("connector test — гарын үсэгтэй /health + products?limit=1", async () => {
    const r = await call(P1.key, "POST", "/partner/connector/test", {});
    assert.equal(r.status, 200, r.text);
    assert.equal(r.data.ok, true, r.text);
    assert.equal(r.data.products.count, 1);
  });
  test("branding: өнгө, frameOrigins шалгалт; widget/embed-д хэрэглэгдэнэ", async () => {
    assert.equal((await call(P1.key, "PUT", "/partner/branding", { color: "red" })).status, 400);
    assert.equal((await call(P1.key, "PUT", "/partner/branding", { logoUrl: "http://x/y.png" })).status, 400);
    assert.equal((await call(P1.key, "PUT", "/partner/branding", { frameOrigins: ["javascript:alert(1)"] })).status, 400);
    const r = await call(P1.key, "PUT", "/partner/branding", { name: "Dayansoft", color: "#5B21B6", frameOrigins: ["https://pos.dayansoft.example", "http://localhost:3300"] });
    assert.equal(r.status, 200, r.text);
    assert.deepEqual(r.data.frameOrigins, ["https://pos.dayansoft.example", "http://localhost:3300"]);
  });
  test("webhook: tenant.activated гарын үсэгтэй (sandbox, 127.0.0.1)", async () => {
    const r = await call(P1.key, "PUT", "/partner/webhook", { url: `http://127.0.0.1:${hook.address().port}/gerege` });
    assert.equal(r.status, 200, r.text);
    P1.webhookSecret = r.data.secret;
    const t = await call(P1.key, "POST", "/partner/webhook/test", {});
    assert.equal(t.data.ok, true, t.text);
    assert.equal(hookGot.at(-1).headers["x-gerege-signature"], `sha256=${createHmac("sha256", P1.webhookSecret).update(hookGot.at(-1).body).digest("hex")}`);
  });
});

describe("T12 түнш ↔ түнш", () => {
  test("P1-ийн түлхүүрээр P2-ийн tenant: GET/suspend/keys/embed-token/data/export → 404", async () => {
    const other = tenantOf(P2, "ds-1001");
    for (const [m, p, b] of [
      ["GET", `/partner/tenants/${other}`],
      ["POST", `/partner/tenants/${other}/suspend`, {}],
      ["POST", `/partner/tenants/${other}/resume`, {}],
      ["POST", `/partner/tenants/${other}/keys`, { scopes: ["connector:read"] }],
      ["POST", `/partner/tenants/${other}/embed-token`, { user: { id: "x", role: "owner" } }],
      ["POST", `/partner/tenants/${other}/export`, {}],
      ["DELETE", `/partner/tenants/${other}/data`],
      ["GET", `/partner/access-log?tenant=${other}`],
    ]) {
      const r = await call(P1.key, m, p, b);
      assert.equal(r.status, 404, `${m} ${p}: ${r.text}`);
      assert.equal(r.data.error.code, "not_found");
    }
    assert.equal(count(`SELECT COUNT(*) n FROM tenants WHERE id = ? AND status != 'suspended'`, other), 1);
  });
  test("ижил extMerchantId хоёр түншид — тусдаа tenant", () => {
    assert.notEqual(tenantOf(P1, "ds-1001"), tenantOf(P2, "ds-1001"));
  });
  test("жагсаалт, нийлбэрт зөвхөн өөрийнх", async () => {
    const l = await call(P1.key, "GET", "/partner/tenants?limit=1");
    assert.equal(l.data.items.length, 1);
    assert.ok(l.data.next);
    const l2 = await call(P1.key, "GET", `/partner/tenants?cursor=${l.data.next}`);
    const ids = [...l.data.items, ...l2.data.items].map((t) => t.tenantId).sort();
    assert.deepEqual(ids, P1.tenants.map((t) => t.tenantId).sort());
    const u = await call(P2.key, "GET", "/partner/usage");
    assert.deepEqual(u.data.tenants.map((t) => t.tenantId), [tenantOf(P2, "ds-1001")]);
  });
});

describe("T14 tenant → түнш, T15 embed токен", () => {
  test("гүйцэтгэл: embed → нөхцөл → QPay sandbox → самбар (live бараа)", async () => {
    const { c, r, url } = await embedSession(P1, "ds-1001");
    assert.ok(url.includes("/connect?e=get_"));
    assert.equal(r.status, 200, r.text);
    assert.equal(r.data.tenant.status, "pending_terms");
    assert.equal(r.data.brand.color, "#5B21B6");
    assert.equal(r.data.brand.name, "Dayansoft");
    // pending_terms үед чат/тушаал хаалттай (зөвхөн billing)
    assert.equal((await c.post("/api/agent/command", { text: "Сайн уу" })).status, 403);
    const t = await c.post("/api/v1/onboarding/terms", { accept: true });
    assert.equal(t.status, 200, t.text);
    assert.equal(t.data.status, "active");
    const inv = await c.post("/api/agent/billing", { plan: "business" });
    assert.equal(inv.status, 200, inv.text);
    assert.equal(rawDb.prepare(`SELECT partner_id FROM invoices WHERE id = ?`).get(inv.data.id).partner_id, P1.partnerId);
    const ok = await c.post(`/api/agent/billing/${inv.data.id}`, {});
    assert.equal(ok.data.status, "paid", ok.text);
    assert.equal(ok.data.payment_id, "sandbox-manual");
    const pr = await c.get("/api/v1/products?limit=200");
    assert.equal(pr.status, 200, pr.text);
    assert.equal(pr.data.items.length, 12);
    assert.ok(pr.data.items.every((p) => p.id.startsWith("ds-1001-")));
    P1.owner = c;
    // tenant.activated webhook (outbox → түншийн webhook)
    const { deliverDue } = await src("lib/tenant/outbox");
    const d = await deliverDue(Date.now());
    assert.ok(d.sent >= 1, JSON.stringify(d));
    const ev = hookGot.map((h) => JSON.parse(h.body)).find((b) => b.event === "tenant.activated");
    assert.ok(ev, "tenant.activated");
    assert.equal(ev.extMerchantId, "ds-1001");
    // самбарын хуудас ба frame-ancestors
    const page = await call(null, "GET", `/connect?e=${encodeURIComponent((await embedSession(P1, "ds-1001")).token)}`);
    assert.equal(page.status, 200);
    assert.match(page.headers.get("content-security-policy") || "", /frame-ancestors 'self' https:\/\/pos\.dayansoft\.example http:\/\/localhost:3300/);
    const plain = await call(null, "GET", "/ai");
    assert.equal(plain.headers.get("content-security-policy"), "frame-ancestors 'self'");
  });
  test("tenant gai_ key, session, зочны токен → /partner/** 403", async () => {
    const k = await call(P1.key, "POST", `/partner/tenants/${tenantOf(P1, "ds-1001")}/keys`, { label: "c", scopes: ["connector:read"] });
    assert.equal(k.status, 201);
    P1.tenantKey = k.data.key;
    assert.equal((await call(k.data.key, "GET", "/partner/tenants")).status, 403);
    assert.equal((await P1.owner.get("/api/v1/partner/tenants")).status, 403);
    const w = (await P1.owner.get("/api/agent/widget")).data.token;
    const v = await new Client(srv.base).post("/api/v1/widget/session", { w, channel: "web" });
    assert.equal(v.status, 200, v.text);
    P1.visitor = v.data.token;
    assert.equal((await call(v.data.token, "GET", "/partner/me")).status, 403);
  });
  test("түнш mcp / agent:* scope гаргаж чадахгүй → 400", async () => {
    for (const scopes of [["mcp"], ["agent:director"], ["connector:read", "usage:read"], []])
      assert.equal((await call(P1.key, "POST", `/partner/tenants/${tenantOf(P1, "ds-1001")}/keys`, { scopes })).status, 400, JSON.stringify(scopes));
  });
  test("embed: гарын үсэг өөрчлөх, t солих, хугацаа дууссан, давтан ашиглах → 401", async () => {
    const { signEmbed } = await src("lib/tenant/embed");
    const fresh = async () => (await call(P1.key, "POST", `/partner/tenants/${tenantOf(P1, "ds-1002")}/embed-token`, { user: { id: "u1", role: "owner" } })).data.token;
    const ex = (token) => new Client(srv.base).post("/api/v1/embed/exchange", { token });
    const t1 = await fresh();
    assert.equal((await ex(t1.slice(0, -2) + (t1.endsWith("AA") ? "BB" : "AA"))).status, 401);
    const [body, sig] = t1.slice(4).split(".");
    const pl = JSON.parse(Buffer.from(body, "base64url").toString());
    const swapped = `get_${Buffer.from(JSON.stringify({ ...pl, t: tenantOf(P2, "ds-1001") })).toString("base64url")}.${sig}`;
    assert.equal((await ex(swapped)).status, 401);
    // P1-ийн нууцаар (AUTH_SECRET) гарын үсэг зурсан ч өөр түншийн tenant → jti/partner таарахгүй
    assert.equal((await ex(signEmbed({ ...pl, t: tenantOf(P2, "ds-1001") }, srv.secret))).status, 401);
    assert.equal((await ex(signEmbed({ ...pl, exp: Date.now() - 1000 }, srv.secret))).status, 401);
    assert.equal((await ex(t1)).status, 200);
    assert.equal((await ex(t1)).status, 401, "нэг удаа");
  });
  test("staff role: нөхцөл/багц → 403; түдгэлзсэн tenant → 403", async () => {
    const { c, r } = await embedSession(P1, "ds-1002", "staff");
    assert.equal(r.status, 200, r.text);
    assert.equal((await c.post("/api/v1/onboarding/terms", { accept: true })).status, 403);
    assert.equal((await c.post("/api/agent/billing", { plan: "start" })).status, 403);
    const pre = await call(P1.key, "POST", `/partner/tenants/${tenantOf(P1, "ds-1002")}/embed-token`, { user: { id: "u9", role: "owner" } });
    const s = await call(P1.key, "POST", `/partner/tenants/${tenantOf(P1, "ds-1002")}/suspend`, {});
    assert.equal(s.data.status, "suspended");
    assert.equal((await new Client(srv.base).post("/api/v1/embed/exchange", { token: pre.data.token })).status, 403);
    assert.equal((await call(P1.key, "POST", `/partner/tenants/${tenantOf(P1, "ds-1002")}/embed-token`, { user: { id: "u9", role: "owner" } })).status, 403);
    assert.equal((await c.get("/api/v1/privacy")).status, 401, "түдгэлзүүлэхэд session устна");
    assert.equal((await call(P1.key, "POST", `/partner/tenants/${tenantOf(P1, "ds-1002")}/resume`, {})).data.status, "pending_terms");
  });
});

describe("T13 түнш → tenant өгөгдөл", () => {
  test("gpk_-ээр tenant endpoint бүр 401/403", async () => {
    for (const [m, p] of [
      ["GET", "/api/agent/conversations"], ["GET", "/api/agent/kb"], ["GET", "/api/agent/contacts"], ["GET", "/api/v1/products"], ["GET", "/api/v1/me"],
      ["GET", "/api/v1/inventory/sessions"], ["GET", "/api/sp/state"], ["GET", "/api/v1/usage"], ["GET", "/api/v1/privacy"], ["POST", "/api/mcp"],
    ]) {
      const r = await call(P1.key, m, p, m === "POST" ? { jsonrpc: "2.0", id: 1, method: "tools/list" } : undefined);
      assert.ok([401, 403, 404].includes(r.status), `${m} ${p} → ${r.status}`);
      assert.notEqual(r.status, 200);
    }
  });
  test("aggregates.ts — зөвхөн тоон багана SELECT хийнэ (статик)", () => {
    const s = readFileSync(path.join(ROOT, "src/lib/partner/aggregates.ts"), "utf8");
    const sql = [...s.matchAll(/`(SELECT[\s\S]*?)`/g)].map((m) => m[1]).join("\n");
    assert.ok(sql.length > 100);
    for (const bad of [/\bref\b/, /\btext\b/, /\bsummary\b/, /\bmessages\b/, /\bcontacts\b/, /\bkb_/, /\bconversations\b/, /\bt\.name\b/, /\bqr_/, /\bpayload\b/]) assert.ok(!bad.test(sql), `aggregates SQL: ${bad}`);
  });
});

describe("T16–T18 өгөгдлийн эзэмшил", () => {
  test("T18 live: c_* хоосон; connector зөвхөн гарын үсэгтэй, тухайн ext; буруу гарын үсэг 401", async () => {
    const id = tenantOf(P1, "ds-1001");
    for (const t of ["c_products", "c_stock", "c_sales", "c_customers", "c_adjustments"]) assert.equal(count(`SELECT COUNT(*) n FROM ${t} WHERE merchant = ?`, id), 0, t);
    assert.ok(con1.state.requests.length > 0);
    assert.ok(con1.state.requests.every((r) => r.ext === null || r.ext === "ds-1001"), JSON.stringify(con1.state.requests.map((r) => r.ext)));
    const st = await P1.owner.get("/api/v1/stock");
    assert.equal(st.data.items.length, 12);
    const bad = await fetch(`${con1.url}/merchants/ds-1001/products`, { headers: { "x-gerege-timestamp": String(Date.now()), "x-gerege-request-id": "x1", "x-gerege-signature": "v1=00" } });
    assert.equal(bad.status, 401);
    assert.equal((await fetch(`${con1.url}/health`)).status, 401);
    assert.equal(count(`SELECT COUNT(*) n FROM access_log WHERE merchant = ? AND action = 'connector.fetch'`, id) > 0, true);
    // live адаптер: тооллогын засвар connector руу шууд (pending биш)
    const auth = await src("lib/tenant/auth");
    const ctx = auth.systemContext(id, "test");
    const before = con1.state.data["ds-1001"].stock["ds-1001-p001"].qty;
    const r = await ctx.pos.adjustStock({ name: "Тест" }, [{ productId: "ds-1001-p001", delta: -1, reason: "count", ref: "inv-x", by: "Тест" }]);
    assert.equal(r.applied.length, 1);
    assert.equal(con1.state.data["ds-1001"].stock["ds-1001-p001"].qty, before - 1);
    assert.equal(count(`SELECT COUNT(*) n FROM c_adjustments WHERE merchant = ?`, id), 0);
    // sync endpoint live-д 409
    assert.equal((await call(P1.tenantKey, "PUT", "/products", { items: [{ extId: "a", name: "a", price: 1 }] })).status, 403, "connector:read key");
  });
  test("T16: «НУУЦ-A-7731» (KB, чат) DB файлд ил байхгүй; AAD өөр tenant-д тайлагдахгүй", async () => {
    const c = P1.owner;
    const kb = await c.post("/api/agent/kb", { title: `Журам ${SECRET}`, text: `# Дотоод журам\nДотоод код ${SECRET}. Хүргэлт 45 минут.` });
    assert.equal(kb.status, 200, kb.text);
    const chat = await c.post("/api/agent/public/chat", { text: `Сайн байна уу ${SECRET}` }, { headers: { authorization: `Bearer ${P1.visitor}` } });
    assert.equal(chat.status, 200, chat.text);
    // тасалбар + үйлдлийн аудит (MCP → create_ticket) — tickets.{title,body}, actions.{args,result,summary}
    const key = (await c.post("/api/agent/keys", { label: "mcp" })).data.key;
    const mcp = await call(key, "POST", "/api/mcp", { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "create_ticket", arguments: { kind: "complaint", title: `Гомдол ${SECRET}`, body: `Дэлгэрэнгүй ${SECRET}` } } });
    assert.equal(mcp.status, 200, mcp.text);
    const tk = (await c.get("/api/agent/tickets")).data.tickets;
    assert.ok(tk.some((t) => t.title === `Гомдол ${SECRET}`), "тасалбар ил уншигдана (тайлагдана)");
    const ac = (await c.get("/api/agent/actions")).data.actions;
    assert.ok(ac.some((a) => JSON.stringify(a.args).includes(SECRET)), "үйлдлийн args ил уншигдана");
    const tid = tenantOf(P1, "ds-1001");
    assert.equal(count(`SELECT COUNT(*) n FROM tickets WHERE merchant = ? AND title NOT LIKE 'e1.%'`, tid), 0);
    assert.equal(count(`SELECT COUNT(*) n FROM actions WHERE merchant = ? AND (args NOT LIKE 'e1.%' OR (summary IS NOT NULL AND summary NOT LIKE 'e1.%'))`, tid), 0);
    rawDb.exec("PRAGMA wal_checkpoint(TRUNCATE)");
    const needle = Buffer.from(SECRET, "utf8");
    for (const f of readdirSync(srv.dataDir).filter((f) => f.startsWith("gerege-ai.db"))) assert.equal(readFileSync(path.join(srv.dataDir, f)).indexOf(needle), -1, `${f}-д ил текст`);
    const crypto = await src("lib/tenant/crypto");
    const box = crypto.encS({ tenantId: tenantOf(P1, "ds-1001") }, SECRET, "messages|text|m1");
    assert.equal(crypto.decS({ tenantId: tenantOf(P1, "ds-1001") }, box, "messages|text|m1"), SECRET);
    assert.throws(() => crypto.decS({ tenantId: tenantOf(P2, "ds-1001") }, box, "messages|text|m1"));
    assert.throws(() => crypto.decS({ tenantId: tenantOf(P1, "ds-1001") }, box, "messages|text|m2"));
  });
  test("T17: серверийн лог агуулгагүй", () => {
    const log = srv.log();
    for (const s of [SECRET, "Сүү 1л", "Сансар хүнсний", "Дотоод журам", P1.connectorSecret]) assert.ok(!log.includes(s), `лог: «${s}»`);
    for (const line of log.split("\n").filter((l) => l.startsWith('{"at"'))) {
      const o = JSON.parse(line);
      for (const k of Object.keys(o)) assert.ok(["at", "ev", "requestId", "tenant", "partner", "kind", "tool", "status", "ms", "count", "credits", "tokensIn", "tokensOut", "errorClass", "event", "delivery", "attempt"].includes(k), k);
    }
  });
  test("log() зөвшөөрөгдөөгүй түлхүүр, агуулгыг хаяна", async () => {
    const { logLine } = await src("lib/log");
    const o = JSON.parse(logLine("x", { tenant: "p1", text: SECRET, name: "Сүү", kind: "products <b>Сүү</b>", count: 3 }));
    assert.deepEqual(Object.keys(o).sort(), ["at", "count", "ev", "kind", "tenant"]);
    assert.ok(!JSON.stringify(o).includes("Сүү"));
  });
  test("connector унтарсан → 502, AI таамаглахгүй алдаа", async () => {
    await con1.close();
    const r = await P1.owner.get("/api/v1/products");
    assert.equal(r.status, 502);
    assert.equal(r.data.error.code, "upstream_unavailable");
    assert.match(r.data.error.message, /холбогдож чадсангүй/);
  });
});

describe("T19–T20 экспорт, хадгалах хугацаа, устгалт", () => {
  test("экспорт: зөвшөөрөлгүй → 403; owner зөвшөөрөөд → нэг удаагийн холбоос (тайлсан)", async () => {
    const id = tenantOf(P1, "ds-1001");
    const r = await call(P1.key, "POST", `/partner/tenants/${id}/export`, {});
    assert.equal(r.status, 403);
    assert.equal(r.data.error.code, "consent_required");
    assert.equal((await P1.owner.put("/api/v1/privacy/consent", { exportToPartner: true })).status, 200);
    const ok = await call(P1.key, "POST", `/partner/tenants/${id}/export`, {});
    assert.equal(ok.status, 200, ok.text);
    const u = new URL(ok.data.url);
    const d1 = await call(null, "GET", u.pathname);
    assert.equal(d1.status, 200);
    assert.equal(d1.data.format, "gerege-export/v1");
    assert.ok(d1.text.includes(SECRET), "экспорт тайлсан агуулгатай");
    assert.equal((await call(null, "GET", u.pathname)).status, 404, "нэг удаа");
  });
  test("T20: 31 хоногийн мессеж цэвэрлэгдэнэ; access-log агуулгагүй, P2 → 404", async () => {
    const id = tenantOf(P1, "ds-1001");
    rawDb.prepare(`INSERT INTO messages (id, conv_id, role, text, at, merchant) VALUES ('mold1', 'cold1', 'user', 'e1.x.y.z', ?, ?)`).run(Date.now() - 31 * DAY, id);
    rawDb.prepare(`INSERT INTO conversations (id, merchant, channel, status, last_at, created_at) VALUES ('cold1', ?, 'web', 'ai', ?, ?)`).run(id, Date.now() - 31 * DAY, Date.now() - 31 * DAY);
    const { purgeTenant } = await src("lib/tenant/retention");
    const out = purgeTenant(id, Date.now());
    assert.ok(out.messages >= 1 && out.conversations >= 1, JSON.stringify(out));
    assert.equal(count(`SELECT COUNT(*) n FROM messages WHERE id = 'mold1'`), 0);
    assert.ok(count(`SELECT COUNT(*) n FROM messages WHERE merchant = ?`, id) >= 1, "шинэ мессеж үлдэнэ");
    const log = await call(P1.key, "GET", `/partner/access-log?tenant=${id}`);
    assert.equal(log.status, 200);
    const actions = log.data.items.map((x) => x.action);
    for (const a of ["retention.purge", "session.embed", "connector.fetch", "export"]) assert.ok(actions.includes(a), a);
    assert.ok(!log.text.includes(SECRET) && !log.text.includes("Сүү"));
    for (const it of log.data.items) assert.deepEqual(Object.keys(it).sort(), ["action", "actorKind", "at", "count", "id", "resource", "tenantId"]);
    assert.equal((await call(P2.key, "GET", `/partner/access-log?tenant=${id}`)).status, 404);
    const policy = await call(P1.key, "PUT", "/partner/retention", { transcriptsDays: 14 });
    assert.equal(policy.data.retention.transcriptsDays, 14);
  });
  test("T19: DELETE …/data → бүх хүснэгт 0, түлхүүр, файл байхгүй; хуулбар тайлагдахгүй; бусад tenant хэвээр", async () => {
    const id = tenantOf(P1, "ds-1001");
    rawDb.exec("PRAGMA wal_checkpoint(TRUNCATE)");
    const backup = path.join(srv.dataDir, "backup-before-erase.db");
    copyFileSync(path.join(srv.dataDir, "gerege-ai.db"), backup);
    const sealed = rawDb.prepare(`SELECT id, text FROM kb_chunks WHERE merchant = ? LIMIT 1`).get(id);
    const r = await call(P1.key, "DELETE", `/partner/tenants/${id}/data`);
    assert.equal(r.status, 200, r.text);
    assert.ok(r.data.deleted.tenant_keys === 1 && r.data.deleted.tenants === 1, r.text);
    assert.ok(!r.text.includes(SECRET));
    const { tenantTables } = await src("lib/tenant/erase");
    for (const t of tenantTables()) assert.equal(count(`SELECT COUNT(*) n FROM ${t} WHERE merchant = ?`, id), 0, t);
    assert.equal(count(`SELECT COUNT(*) n FROM tenants WHERE id = ?`, id), 0);
    assert.equal(count(`SELECT COUNT(*) n FROM tenant_keys WHERE merchant = ?`, id), 0);
    assert.equal(existsSync(path.join(srv.dataDir, "tenants", id)), false);
    assert.ok(count(`SELECT COUNT(*) n FROM invoices WHERE merchant LIKE 'erased:%'`) >= 1, "санхүү нэргүйжүүлж үлдэнэ");
    if (sealed?.text?.startsWith("e1.")) {
      const crypto = await src("lib/tenant/crypto");
      globalThis.__tenantDek?.delete(id); // тестийн процессын санах ойн кэш (сервер shredTenant-аар цэвэрлэсэн)
      assert.throws(() => crypto.decS({ tenantId: id }, sealed.text, `kb_chunks|text|${sealed.id}`), "DEK устсан — хуулбарын шифр тайлагдахгүй");
    }
    assert.equal(count(`SELECT COUNT(*) n FROM tenants WHERE id = ?`, tenantOf(P1, "ds-1002")), 1);
    assert.equal(count(`SELECT COUNT(*) n FROM tenants WHERE id = ?`, tenantOf(P2, "ds-1001")), 1);
    assert.equal((await P1.owner.get("/api/v1/privacy")).status, 401);
    assert.equal((await call(P1.key, "GET", `/partner/tenants/${id}`)).status, 404);
    const log = await call(P1.key, "GET", "/partner/access-log");
    assert.ok(log.data.items.some((x) => x.action === "delete" && x.tenantId === null));
  });
});
