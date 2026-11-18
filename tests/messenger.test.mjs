/**
 * T10 — Facebook Messenger (docs/ARCHITECTURE.md §9, §16): гарын үсэгтэй хуурамч webhook + mock Graph.
 * Жинхэнэ Meta руу ХЭЗЭЭ Ч хандахгүй (FB_GRAPH_URL → mock). Page-ууд нь зохиомол (бодит харилцагчгүй).
 *   NEXT_DIST_DIR=.next-kb npx next build && NEXT_DIST_DIR=.next-kb node --test tests/messenger.test.mjs
 */
import assert from "node:assert/strict";
import { createCipheriv, createHash, createHmac, randomBytes } from "node:crypto";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { after, before, describe, test } from "node:test";
import { Client, startServer } from "./helpers/server.mjs";
import { src } from "./helpers/ts.mjs";

const APP_ID = "1000000000001";
const APP_SECRET = "test-fb-app-secret-0123456789";
const TOKEN_KEY = "test-fb-token-key-0123456789";
const A = { regNo: "8810101", pin: "4321", page: "900000000000001", store: "Альфа FB дэлгүүр" };
const B = { regNo: "8810202", pin: "8765", page: "900000000000002", store: "Бета FB дэлгүүр" };
const TESTER = "7000000000000001";
const STRANGER = "7000000000000002";
const B_USER = "7000000000000003";

let srv;
let fb;
const a = { c: null };
const b = { c: null };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, ms = 8000, what = "нөхцөл") {
  const t0 = Date.now();
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() - t0 > ms) throw new Error(`хүлээлт дууслаа: ${what}`);
    await sleep(100);
  }
}

/** fb/server.ts seal()-тэй ижил (FB_TOKEN_KEY → sha256) */
function sealToken(plain) {
  const key = createHash("sha256").update(TOKEN_KEY).digest();
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return `v1.${iv.toString("base64url")}.${c.getAuthTag().toString("base64url")}.${enc.toString("base64url")}`;
}

async function hook(entries, { sign = true } = {}) {
  const body = JSON.stringify({ object: "page", entry: entries });
  const headers = { "content-type": "application/json" };
  if (sign) headers["x-hub-signature-256"] = `sha256=${createHmac("sha256", APP_SECRET).update(body).digest("hex")}`;
  const r = await fetch(`${srv.base}/api/fb/webhook`, { method: "POST", headers, body });
  return r.status;
}
let midSeq = 0;
const msg = (page, psid, text, extra = {}) => ({ id: page, messaging: [{ sender: { id: psid }, recipient: { id: page }, timestamp: Date.now(), message: { mid: `mid.${++midSeq}.${randomBytes(3).toString("hex")}`, text, ...extra } }] });
const sends = () => srv.mock.state.graph;
const sentTo = (psid) => sends().filter((x) => x.recipient?.id === psid);

async function seedTenant(t, x) {
  const core = await src("lib/sp/core");
  const s = core.freshState();
  s.merchant = { ...s.merchant, regNo: t.regNo, pin: t.pin, name: `${t.store} ХХК`, pinTries: 0 };
  x.c = new Client(srv.base);
  const r = await x.c.post("/api/auth/login", { regNo: t.regNo, pin: t.pin, bootstrap: s });
  assert.equal(r.status, 200, r.text);
  const inv = await x.c.post("/api/agent/billing", { plan: "start" });
  assert.equal((await x.c.post(`/api/agent/billing/${inv.data.id}`, {})).data?.status, "paid");
  // fb DB-г серверт үүсгүүлнэ
  assert.equal((await x.c.get("/api/fb/status")).status, 200);
}

before(async () => {
  srv = await startServer({
    FB_APP_ID: APP_ID,
    FB_APP_SECRET: APP_SECRET,
    FB_TOKEN_KEY: TOKEN_KEY,
    FB_VERIFY_TOKEN: "verify-test",
    FB_GRAPH_URL: "${MOCK}/graph",
    FB_DEBOUNCE_MS: "400",
    FB_ALLOW_ALL: "",
  });
  await seedTenant(A, a);
  await seedTenant(B, b);
  fb = new DatabaseSync(path.join(srv.dataDir, "storeplus-fb.db"));
  const ins = fb.prepare(`INSERT INTO fb_pages (page_id, merchant, name, token, demo, subscribed, connected_by, connected_at) VALUES (?, ?, ?, ?, 0, 1, 'test', ?)`);
  ins.run(A.page, A.regNo, "Альфа тест Page", sealToken("page-token-a"), Date.now() - 3600_000);
  ins.run(B.page, B.regNo, "Бета тест Page", sealToken("page-token-b"), Date.now() - 3600_000);
  const put = await a.c.put("/api/agent/settings", { fbMode: "testers", fbTesters: [{ psid: TESTER, name: "Тестер" }] });
  assert.equal(put.status, 200, put.text);
  assert.equal((await b.c.put("/api/agent/settings", { fbMode: "testers", fbTesters: [{ psid: B_USER, name: "Б тестер" }] })).status, 200);
}, { timeout: 120_000 });

after(async () => {
  fb?.close();
  await srv?.stop();
});

describe("T10 — Messenger webhook", () => {
  test("гарын үсэггүй / буруу гарын үсэгтэй → 403", async () => {
    assert.equal(await hook([msg(A.page, TESTER, "сайн уу")], { sign: false }), 403);
    const body = JSON.stringify({ object: "page", entry: [msg(A.page, TESTER, "x")] });
    const r = await fetch(`${srv.base}/api/fb/webhook`, { method: "POST", headers: { "content-type": "application/json", "x-hub-signature-256": "sha256=00" }, body });
    assert.equal(r.status, 403);
  });

  test("холбогдоогүй page_id → чимээгүй хаяна (200, хадгалахгүй, илгээхгүй)", async () => {
    const n = sends().length;
    assert.equal(await hook([msg("999999999999999", TESTER, "сайн уу")]), 200);
    await sleep(800);
    assert.equal(sends().length, n);
    assert.equal(fb.prepare(`SELECT COUNT(*) n FROM fb_threads WHERE page_id = '999999999999999'`).get().n, 0);
  });

  test("tester биш psid → AI хариулахгүй (зөвхөн порталд)", async () => {
    assert.equal(await hook([msg(A.page, STRANGER, "Сайн байна уу?")]), 200);
    await sleep(1200);
    assert.equal(sentTo(STRANGER).length, 0);
    assert.ok(fb.prepare(`SELECT 1 FROM fb_messages WHERE psid = ?`).get(STRANGER), "мессеж порталд хадгалагдсан");
  });

  test("tester → AI хариу: RESPONSE, HUMAN_AGENT-гүй, анхны хариунд «AI туслах»; дараалсан 2 мессеж нэг ээлж", async () => {
    assert.equal(await hook([msg(A.page, TESTER, "Сайн байна уу")]), 200);
    assert.equal(await hook([msg(A.page, TESTER, "Ажлын цаг хэд вэ?")]), 200);
    const out = await until(() => sentTo(TESTER).length >= 1 && sentTo(TESTER), 10_000, "AI хариу");
    await sleep(1200);
    assert.equal(sentTo(TESTER).length, 1, "4 сек нэгтгэл — нэг л хариу");
    const m = out[0];
    assert.equal(m.messaging_type, "RESPONSE");
    assert.equal(m.tag, undefined);
    assert.match(m.message.text, /AI туслах/);
    // хоёр дахь хариунд танилцуулга давтахгүй
    assert.equal(await hook([msg(A.page, TESTER, "Баярлалаа")]), 200);
    const two = await until(() => sentTo(TESTER).length >= 2 && sentTo(TESTER), 10_000, "2-р хариу");
    assert.doesNotMatch(two[1].message.text, /AI туслах/);
  });

  test("B-ийн Page-ийн үйл явдал зөвхөн B-д (A-д нөлөөлөхгүй)", async () => {
    const before = (await a.c.get("/api/agent/conversations")).data.conversations.length;
    assert.equal(await hook([msg(B.page, B_USER, "Сайн уу, Б")]), 200);
    await until(() => sentTo(B_USER).length >= 1, 10_000, "B хариу");
    assert.equal((await a.c.get("/api/agent/conversations")).data.conversations.length, before);
    const bc = (await b.c.get("/api/agent/conversations")).data.conversations;
    assert.ok(bc.some((c) => c.channel === "fb" && c.ext_id === B_USER));
    assert.ok(!(await a.c.get("/api/agent/conversations")).text.includes(B_USER));
  });

  test("origin ai: 25 цагийн дараа илгээхгүй — message_customers «24 цаг өнгөрсөн» гэж тайлагнана; ажилтан HUMAN_AGENT-ээр илгээнэ", async () => {
    fb.prepare(`UPDATE fb_threads SET last_user_at = ? WHERE page_id = ? AND psid = ?`).run(Date.now() - 25 * 3600_000, A.page, TESTER);
    const key = (await a.c.post("/api/agent/keys", { label: "t10" })).data.key;
    const n = sentTo(TESTER).length;
    const r = await fetch(`${srv.base}/api/mcp`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "message_customers", arguments: { segment: "ai_contacts", text: "Шинэ урамшуулал!" } } }),
    });
    const j = await r.json();
    const out = j.result.structuredContent;
    assert.match(out.summary, /24 цаг өнгөрсөн/);
    assert.equal(out.data.skipped_24h.length, 1);
    assert.equal(sentTo(TESTER).length, n, "AI HUMAN_AGENT-аар илгээгээгүй");
    // ажилтан (origin human) — 24ц–7 хоногт HUMAN_AGENT tag-тай
    const h = await a.c.post(`/api/fb/threads/${TESTER}/send`, { text: "Сайн байна уу, ажилтан байна", staff: "Бат" });
    assert.equal(h.status, 200, h.text);
    const last = sentTo(TESTER).at(-1);
    assert.equal(last.messaging_type, "MESSAGE_TAG");
    assert.equal(last.tag, "HUMAN_AGENT");
    // ажилтан бичсэн — яриа ажилтанд
    const conv = (await a.c.get("/api/agent/conversations")).data.conversations.find((c) => c.ext_id === TESTER);
    assert.equal(conv.status, "human");
  });

  test("Meta Inbox-оос (өөр app_id) хариулсан echo → яриа ажилтанд, AI дахин хариулахгүй", async () => {
    const P = "7000000000000010";
    await a.c.put("/api/agent/settings", { fbTesters: [{ psid: TESTER, name: "Тестер" }, { psid: P, name: "Тестер 2" }] });
    assert.equal(await hook([msg(A.page, P, "Сайн уу")]), 200);
    await until(() => sentTo(P).length >= 1, 10_000, "AI хариу");
    // Page-ийн админ Meta Inbox-оос бичсэн (app_id = Page Inbox)
    const echo = { id: A.page, messaging: [{ sender: { id: A.page }, recipient: { id: P }, timestamp: Date.now(), message: { mid: `mid.echo.${randomBytes(4).toString("hex")}`, text: "Админ хариулж байна", is_echo: true, app_id: 263902037430900 } }] };
    assert.equal(await hook([echo]), 200);
    await until(async () => (await a.c.get("/api/agent/conversations")).data.conversations.find((c) => c.ext_id === P)?.status === "human", 5000, "human");
    const n = sentTo(P).length;
    assert.equal(await hook([msg(A.page, P, "Дахиад асуулт")]), 200);
    await sleep(1500);
    assert.equal(sentTo(P).length, n, "AI хариулаагүй");
  });

  test("AI 2 удаа дараалан «мэдээлэл алга» → ажилтанд шилжиж «Ажилтан удахгүй хариулна»", async () => {
    const P = "7000000000000011";
    const st = (await a.c.get("/api/agent/settings")).data.settings;
    await a.c.put("/api/agent/settings", { fbTesters: [...st.fbTesters, { psid: P, name: "Тестер 3" }] });
    assert.equal(await hook([msg(A.page, P, "NOINFO нэг")]), 200);
    await until(() => sentTo(P).length >= 1, 10_000, "1-р");
    assert.equal(await hook([msg(A.page, P, "NOINFO хоёр")]), 200);
    const out = await until(() => sentTo(P).length >= 2 && sentTo(P), 10_000, "2-р");
    assert.match(out[1].message.text, /Ажилтан удахгүй хариулна/);
    const conv = (await a.c.get("/api/agent/conversations")).data.conversations.find((c) => c.ext_id === P);
    assert.equal(conv.status, "human");
  });

  test("m.me/<page>?ref=judge-<код> → «Туршигчаар нэмэх үү?» хүсэлт; буруу код → үгүй", async () => {
    const ref = (await a.c.get("/api/agent/settings")).data.fb.judgeRef;
    assert.match(ref, /^judge-[a-f0-9]{10}$/);
    const J = "7000000000000020";
    const ev = (psid, r) => ({ id: A.page, messaging: [{ sender: { id: psid }, recipient: { id: A.page }, timestamp: Date.now(), referral: { ref: r, source: "SHORTLINK", type: "OPEN_THREAD" } }] });
    assert.equal(await hook([ev("7000000000000021", "judge-0000000000")]), 200);
    assert.equal(await hook([ev(J, ref)]), 200);
    const reqs = await until(async () => {
      const r = (await a.c.get("/api/agent/settings")).data.settings.fbTesterRequests;
      return r.some((x) => x.psid === J) && r;
    }, 5000, "хүсэлт");
    assert.ok(!reqs.some((x) => x.psid === "7000000000000021"));
    assert.equal(sentTo(J).length, 0, "туршигч болохоос өмнө AI хариулахгүй");
    // B-ийн код A-д хүчингүй
    const bref = (await b.c.get("/api/agent/settings")).data.fb.judgeRef;
    assert.notEqual(bref, ref);
  });

  test("«Бүх харилцагч» горимыг сервер татгалзана (FB_ALLOW_ALL)", async () => {
    const r = await a.c.put("/api/agent/settings", { fbMode: "all" });
    assert.equal(r.status, 403);
    assert.equal((await a.c.get("/api/agent/settings")).data.settings.fbMode, "testers");
  });
});
