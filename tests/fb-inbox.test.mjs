/**
 * Харилцаа → Messenger + Page comment (docs/ARCHITECTURE.md §3, §9): mock Graph, гарын үсэгтэй хуурамч webhook.
 * Жинхэнэ Meta руу ХЭЗЭЭ Ч хандахгүй (FB_GRAPH_URL → mock). Page-ууд зохиомол.
 *   NEXT_DIST_DIR=.next-fb npx next build && NEXT_DIST_DIR=.next-fb node --test tests/fb-inbox.test.mjs
 */
import assert from "node:assert/strict";
import { createCipheriv, createHash, createHmac, randomBytes } from "node:crypto";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { after, before, describe, test } from "node:test";
import { Client, startServer } from "./helpers/server.mjs";
import { src } from "./helpers/ts.mjs";

const APP_SECRET = "test-fb-inbox-secret-0123456789";
const TOKEN_KEY = "test-fb-inbox-token-key-0123456789";
const A = { regNo: "8820101", pin: "4321", page: "910000000000001", store: "Альфа inbox", token: "page-token-a" };
const B = { regNo: "8820202", pin: "8765", page: "910000000000002", store: "Бета inbox", token: "page-token-b" };
const A_USER = "7100000000000001";
const B_USER = "7100000000000002";
const ALL_SCOPES = ["pages_show_list", "pages_messaging", "pages_manage_metadata", "pages_read_engagement", "pages_read_user_content", "pages_manage_engagement"];
const BASIC_SCOPES = ALL_SCOPES.slice(0, 4);

let srv;
let fb;
const a = { c: null };
const b = { c: null };

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
  return (await fetch(`${srv.base}/api/fb/webhook`, { method: "POST", headers, body })).status;
}
let seq = 0;
const msg = (page, psid, text, extra = {}) => ({ id: page, messaging: [{ sender: { id: psid }, recipient: { id: page }, timestamp: Date.now(), message: { mid: `mid.in.${++seq}`, text, ...extra } }] });
const echo = (page, psid, message) => ({ id: page, messaging: [{ sender: { id: page }, recipient: { id: psid }, timestamp: Date.now(), message: { mid: `mid.echo.${++seq}`, is_echo: true, app_id: 1, ...message } }] });
const feed = (page, value) => ({ id: page, time: Math.floor(Date.now() / 1000), changes: [{ field: "feed", value }] });
const comment = (page, post, id, text, verb = "add", extra = {}) =>
  feed(page, { item: "comment", verb, post_id: post, comment_id: id, parent_id: post, message: text, created_time: Math.floor(Date.now() / 1000), from: { id: "7100000000000099", name: "Comment бичигч" }, ...extra });

async function seedTenant(t, x) {
  const core = await src("lib/sp/core");
  const s = core.freshState();
  s.merchant = { ...s.merchant, regNo: t.regNo, pin: t.pin, name: `${t.store} ХХК`, pinTries: 0 };
  x.c = new Client(srv.base);
  const r = await x.c.post("/api/auth/login", { regNo: t.regNo, pin: t.pin, bootstrap: s });
  assert.equal(r.status, 200, r.text);
  assert.equal((await x.c.get("/api/fb/status")).status, 200);
}

before(async () => {
  srv = await startServer({
    FB_APP_ID: "1000000000002",
    FB_APP_SECRET: APP_SECRET,
    FB_TOKEN_KEY: TOKEN_KEY,
    FB_VERIFY_TOKEN: "verify-test",
    FB_GRAPH_URL: "${MOCK}/graph",
    FB_ALLOW_ALL: "",
  });
  // A — бүх эрхтэй (Graph feed амжилттай); B — comment эрхгүй (#10)
  srv.mock.state.scopes = { [A.token]: ALL_SCOPES, [B.token]: BASIC_SCOPES };
  srv.mock.state.feed = (pageId, token) =>
    token === A.token && pageId === A.page
      ? {
          data: [
            {
              id: `${A.page}_500`,
              message: "Шинэ ПОС ирлээ",
              created_time: "2026-11-17T03:00:00+0000",
              permalink_url: "https://facebook.com/a/posts/500",
              comments: { data: [{ id: "500_1", message: "Үнэ хэд вэ?", created_time: "2026-11-17T04:00:00+0000", from: { id: "7100000000000050", name: "Graph хэрэглэгч" } }] },
            },
          ],
        }
      : { error: { code: 10, message: "(#10) This endpoint requires the 'pages_read_user_content' permission" } };
  srv.mock.state.replyError = (target) => (target.startsWith("denied") ? { code: 200, message: "(#200) requires pages_manage_engagement" } : null);
  await seedTenant(A, a);
  await seedTenant(B, b);
  fb = new DatabaseSync(path.join(srv.dataDir, "storeplus-fb.db"));
  const ins = fb.prepare(`INSERT INTO fb_pages (page_id, merchant, name, token, demo, subscribed, connected_by, connected_at) VALUES (?, ?, ?, ?, 0, 1, 'test', ?)`);
  ins.run(A.page, A.regNo, "Альфа Page", sealToken(A.token), Date.now() - 3600_000);
  ins.run(B.page, B.regNo, "Бета Page", sealToken(B.token), Date.now() - 3600_000);
  assert.equal(await hook([msg(A.page, A_USER, "Сайн байна уу, А")]), 200);
  assert.equal(await hook([msg(B.page, B_USER, "Сайн байна уу, Б")]), 200);
}, { timeout: 120_000 });

after(async () => {
  fb?.close();
  await srv?.stop();
});

describe("Messenger — Inbox", () => {
  test("session-гүй → 401", async () => {
    const anon = new Client(srv.base);
    assert.equal((await anon.get("/api/fb/threads?state=all")).status, 401);
    assert.equal((await anon.get("/api/fb/comments")).status, 401);
    assert.equal((await anon.post("/api/fb/comments/500_1/reply", { text: "x" })).status, 401);
  });

  test("threads: session-ий tenant-ын Page-ийн чат л (нэр, сүүлийн текст, unread, 24ц цонх)", async () => {
    const r = await a.c.get("/api/fb/threads?state=all");
    assert.equal(r.status, 200, r.text);
    const t = r.data.threads.find((x) => x.psid === A_USER);
    assert.ok(t, "A-ийн чат");
    assert.equal(t.lastText, "Сайн байна уу, А");
    assert.equal(t.unread, 1);
    assert.equal(t.window.state, "open");
    assert.ok(!r.text.includes(B_USER), "B-ийн чат A-д харагдахгүй");
    const one = await a.c.get(`/api/fb/threads/${A_USER}`);
    assert.equal(one.status, 200);
    assert.equal(one.data.messages.at(-1).dir, "in");
  });

  test("cross-tenant: B-ийн psid → 404 (унших, уншсан болгох, илгээх); Graph руу илгээхгүй", async () => {
    const n = srv.mock.state.graph.length;
    assert.equal((await a.c.get(`/api/fb/threads/${B_USER}`)).status, 404);
    assert.equal((await a.c.post(`/api/fb/threads/${B_USER}/read`, {})).status, 404);
    assert.equal((await a.c.post(`/api/fb/threads/${B_USER}/send`, { text: "хулгай" })).status, 404);
    assert.equal(srv.mock.state.graph.length, n);
  });

  test("текстгүй echo (карт/товч) сүүлийн текстийг арилгахгүй", async () => {
    assert.equal(await hook([echo(A.page, A_USER, {})]), 200);
    const t = (await a.c.get("/api/fb/threads?state=all")).data.threads.find((x) => x.psid === A_USER);
    assert.equal(t.lastText, "Сайн байна уу, А");
  });

  test("ажилтны хариу: origin human → RESPONSE, ажилтны нэр session-оос", async () => {
    const r = await a.c.post(`/api/fb/threads/${A_USER}/send`, { text: "Сайн байна уу, ажилтан" });
    assert.equal(r.status, 200, r.text);
    const sent = srv.mock.state.graph.at(-1);
    assert.equal(sent.recipient.id, A_USER);
    assert.equal(sent.messaging_type, "RESPONSE");
    assert.equal(r.data.staff, "Мерчант админ");
  });
});

describe("Page comment", () => {
  test("гарын үсэггүй feed webhook → 403, хадгалахгүй", async () => {
    assert.equal(await hook([comment(A.page, `${A.page}_600`, "600_1", "unsigned")], { sign: false }), 403);
    assert.equal(fb.prepare(`SELECT COUNT(*) n FROM fb_comments WHERE comment_id = '600_1'`).get().n, 0);
  });

  test("гарын үсэгтэй feed: add/edited/remove хадгалагдана; холбогдоогүй Page-ийнх хаягдана", async () => {
    const post = `${A.page}_600`;
    assert.equal(await hook([comment(A.page, post, "600_1", "Хүргэлт байгаа юу?")]), 200);
    assert.equal(await hook([comment(A.page, post, "600_2", "Хариулт-д хариу", "add", { parent_id: "600_1" })]), 200);
    assert.equal(await hook([comment(A.page, post, "600_1", "Хүргэлт байгаа юу? (зассан)", "edited")]), 200);
    assert.equal(await hook([comment(A.page, post, "600_3", "spam")]), 200);
    assert.equal(await hook([comment(A.page, post, "600_3", "", "remove")]), 200);
    assert.equal(await hook([comment("999999999999999", "999999999999999_1", "x_1", "өөр Page")]), 200);
    assert.equal(fb.prepare(`SELECT COUNT(*) n FROM fb_comments WHERE comment_id = 'x_1'`).get().n, 0);

    const r = await a.c.get("/api/fb/comments");
    assert.equal(r.status, 200, r.text);
    assert.equal(r.data.permission.needsPermission, false);
    const p = r.data.posts.find((x) => x.id === post);
    assert.ok(p, "webhook-ийн пост");
    const c1 = p.comments.find((c) => c.id === "600_1");
    assert.equal(c1.message, "Хүргэлт байгаа юу? (зассан)");
    assert.equal(c1.replies[0].id, "600_2");
    assert.equal(p.comments.find((c) => c.id === "600_3").removed, true);
    // Graph sync-ээр татсан пост + comment (mock /feed)
    const g = r.data.posts.find((x) => x.id === `${A.page}_500`);
    assert.equal(g?.comments[0]?.message, "Үнэ хэд вэ?");
    assert.equal(g.permalink, "https://facebook.com/a/posts/500");
  });

  test("B-д A-ийн comment харагдахгүй; эрхгүй (#10) → needsPermission + мэдэгдэл", async () => {
    assert.equal(await hook([comment(B.page, `${B.page}_700`, "700_1", "Б-ийн comment")]), 200);
    const r = await b.c.get("/api/fb/comments");
    assert.equal(r.status, 200, r.text);
    assert.ok(!r.text.includes("600_1") && !r.text.includes("Үнэ хэд вэ?"), "A-ийн comment B-д алга");
    assert.equal(r.data.permission.needsPermission, true);
    assert.match(r.data.permission.message, /Comment унших эрх алга/);
    assert.match(r.data.permission.message, /pages_read_user_content, pages_manage_engagement/);
    assert.deepEqual(r.data.permission.missing.sort(), ["pages_manage_engagement", "pages_read_user_content"]);
    const st = (await b.c.get("/api/fb/status")).data;
    assert.deepEqual(st.scopes.commentsMissing.sort(), ["pages_manage_engagement", "pages_read_user_content"]);
    assert.deepEqual((await a.c.get("/api/fb/status")).data.scopes.commentsMissing, []);
  });

  test("reply: mock Graph POST /{comment}/comments, origin human, ажилтны нэр; хариулт-д хариулахад эх comment руу", async () => {
    const n = srv.mock.state.commentReplies.length;
    const r = await a.c.post("/api/fb/comments/600_1/reply", { text: "Тийм, хүргэлт үнэгүй" });
    assert.equal(r.status, 200, r.text);
    const call = srv.mock.state.commentReplies.at(-1);
    assert.equal(srv.mock.state.commentReplies.length, n + 1);
    assert.equal(call.target, "600_1");
    assert.equal(call.token, A.token);
    assert.equal(call.body.message, "Тийм, хүргэлт үнэгүй");
    const row = fb.prepare(`SELECT * FROM fb_comments WHERE comment_id = ?`).get(r.data.id);
    assert.equal(row.origin, "human");
    assert.equal(row.staff, "Мерчант админ");
    assert.equal(row.from_id, A.page);
    assert.equal(row.parent_id, "600_1");
    // 600_2 нь 600_1-ийн хариулт → Facebook нэг түвшин л зөвшөөрдөг тул 600_1 руу
    assert.equal((await a.c.post("/api/fb/comments/600_2/reply", { text: "Нэмэлт" })).status, 200);
    assert.equal(srv.mock.state.commentReplies.at(-1).target, "600_1");
    // устгагдсан comment-д хариулахгүй
    assert.equal((await a.c.post("/api/fb/comments/600_3/reply", { text: "x" })).status, 409);
    assert.equal((await a.c.post("/api/fb/comments/600_1/reply", { text: "   " })).status, 400);
  });

  test("reply: өөр tenant-ын comment → 404, Graph дуудахгүй", async () => {
    const n = srv.mock.state.commentReplies.length;
    assert.equal((await a.c.post("/api/fb/comments/700_1/reply", { text: "хулгай" })).status, 404);
    assert.equal((await b.c.post("/api/fb/comments/600_1/reply", { text: "хулгай" })).status, 404);
    assert.equal(srv.mock.state.commentReplies.length, n);
  });

  test("reply: Graph #200 (эрхгүй) → 403 needs_permission", async () => {
    assert.equal(await hook([comment(B.page, `${B.page}_700`, "denied_1", "эрхгүй")]), 200);
    const r = await b.c.post("/api/fb/comments/denied_1/reply", { text: "оролдлого" });
    assert.equal(r.status, 403, r.text);
    assert.equal(r.data.code, "needs_permission");
    assert.match(r.data.error, /pages_manage_engagement/);
    assert.equal(fb.prepare(`SELECT COUNT(*) n FROM fb_comments WHERE page_id = ? AND from_id = ?`).get(B.page, B.page).n, 0);
  });
});
