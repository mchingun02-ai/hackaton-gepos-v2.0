/**
 * T11 — туслахууд (docs/ARCHITECTURE.md §10) + KB автомат баяжуулалт (§8) + PII цэвэрлэгээ.
 * `next start` (түр SP_DATA_DIR) + mock Qwen. Жинхэнэ AI gateway руу явахгүй.
 *   NEXT_DIST_DIR=.next-kb npx next build && NEXT_DIST_DIR=.next-kb node --test tests/assistants-kb.test.mjs
 */
import assert from "node:assert/strict";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { after, before, describe, test } from "node:test";
import { Client, startServer } from "./helpers/server.mjs";
import { src } from "./helpers/ts.mjs";

const A = { regNo: "8820101", pin: "4321", store: "Альфа туслах дэлгүүр" };
const B = { regNo: "8820202", pin: "8765", store: "Бета туслах дэлгүүр" };
let srv;
let key = "";
const a = { c: null };
const b = { c: null };

async function login(t, x) {
  const core = await src("lib/sp/core");
  const s = core.freshState();
  s.merchant = { ...s.merchant, regNo: t.regNo, pin: t.pin, name: `${t.store} ХХК`, pinTries: 0 };
  x.c = new Client(srv.base);
  assert.equal((await x.c.post("/api/auth/login", { regNo: t.regNo, pin: t.pin, bootstrap: s })).status, 200);
  const inv = await x.c.post("/api/agent/billing", { plan: "start" });
  assert.equal((await x.c.post(`/api/agent/billing/${inv.data.id}`, {})).data?.status, "paid");
}
const cmd = (text, assistant) => a.c.post("/api/agent/command", assistant ? { text, assistant } : { text });
async function mcp(name, args) {
  const r = await fetch(`${srv.base}/api/mcp`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${key}` }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } }) });
  return (await r.json()).result?.structuredContent;
}

before(async () => {
  srv = await startServer({ KB_AUTO: "off" });
  await login(A, a);
  await login(B, b);
  key = (await a.c.post("/api/agent/keys", { label: "t11" })).data.key;
}, { timeout: 120_000 });
after(async () => {
  await srv?.stop();
});

describe("T11 — туслахууд", () => {
  test("түлхүүр үгээр чиглүүлнэ: тооллого → inventory, хямдрал → marketing, тайлан → finance; таарахгүй → chief; LLM → finance", async () => {
    const cases = [
      ["Тооллогын зөрүү харуул", "inventory", "keyword"],
      ["Жүүсэнд хямдрал зарла", "marketing", "keyword"],
      ["Өнөөдрийн борлуулалтын тайлан", "finance", "keyword"],
      ["Сайн уу, юу хийж чадах вэ", "chief", "default"],
      ["LLMROUTE энэ сарын байдал", "finance", "llm"],
      ["Хямдралын борлуулалтын тайлан", "chief", "default"],
    ];
    for (const [text, id, via] of cases) {
      const r = await cmd(text);
      assert.equal(r.status, 200, r.text);
      assert.equal(r.data.assistant.id, id, text);
      assert.equal(r.data.assistant.via, via, text);
    }
    // гараар сонгосон
    const m = await cmd("Сайн уу", "tax");
    assert.equal(m.data.assistant.id, "tax");
    assert.equal(m.data.assistant.via, "manual");
    // чип түүхэнд хадгалагдана
    const hist = (await a.c.get("/api/agent/command")).data.messages.filter((x) => x.role === "assistant");
    assert.ok(hist.every((x) => x.meta?.assistant?.id), "хариу бүрт туслах");
  });

  test("marketing refund_sale дуудаж чадахгүй; finance-д батламж хүлээнэ", async () => {
    const r = await cmd("REFUND-TEST", "marketing");
    assert.equal(r.status, 200, r.text);
    const s = r.data.steps.find((x) => x.tool === "refund_sale");
    assert.ok(s, "загвар дуудсан");
    assert.equal(s.ok, false);
    assert.match(s.summary, /эрхгүй/);
    const f = await cmd("REFUND-TEST", "finance");
    assert.equal(f.data.steps.find((x) => x.tool === "refund_sale").status, "pending");
  });

  test("service (харилцагчийн суваг) list_customers дуудаж чадахгүй", async () => {
    const w = (await a.c.get("/api/agent/widget")).data.token;
    const v = new Client(srv.base);
    const t = (await v.post("/api/v1/widget/session", { w, channel: "web" })).data.token;
    const r = await v.post("/api/agent/public/chat", { text: "LISTCUST-TEST" }, { headers: { authorization: `Bearer ${t}` } });
    assert.equal(r.status, 200, r.text);
    const s = r.data.steps.find((x) => x.title && /харилцагч/i.test(x.title) && x.ok === false) ?? r.data.steps[0];
    assert.equal(s.ok, false);
    assert.match(s.summary, /эрхгүй/);
  });

  test("туслах солигдоход tenant өөрчлөгдөхгүй; usage.assistant бичигдэнэ", async () => {
    const r1 = await cmd("Тооллогын зөрүү", "inventory");
    const r2 = await cmd("Хямдрал", "marketing");
    assert.equal(r1.data.convId, r2.data.convId, "нэг tenant-ын нэг захирлын яриа");
    // B-д A-ийн тушаал харагдахгүй
    assert.ok(!(await b.c.get("/api/agent/command")).text.includes("Тооллогын зөрүү"));
    const db = new DatabaseSync(path.join(srv.dataDir, "gerege-ai.db"), { readOnly: true });
    const rows = db.prepare(`SELECT merchant, assistant FROM usage WHERE kind = 'command' AND credits > 0`).all();
    db.close();
    assert.ok(rows.length >= 2);
    assert.ok(rows.every((x) => x.merchant === A.regNo));
    assert.ok(rows.some((x) => x.assistant === "inventory") && rows.some((x) => x.assistant === "marketing"));
  });
});

describe("KB auto (§8)", () => {
  test("«Одоо сэргээх» → auto:catalog/store/promotions; нөөцийн тоо, өртөг байхгүй; эх сурвалжийн шошго", async () => {
    const r = await a.c.post("/api/agent/kb/auto", {});
    assert.equal(r.status, 200, r.text);
    const keys = r.data.docs.map((d) => d.key);
    assert.ok(keys.includes("auto:catalog") && keys.includes("auto:store"));
    const docs = (await a.c.get("/api/agent/kb")).data.docs;
    const cat = docs.find((d) => d.auto_key === "auto:catalog");
    assert.equal(cat.kind, "auto");
    assert.equal(cat.status, "published");
    const text = (await a.c.get(`/api/agent/kb/${cat.id}`)).data.chunks.join("\n");
    assert.match(text, /₮/);
    assert.doesNotMatch(text, /үлдэгдэл:\s*\d|өртөг|cost/i);
    // дахин сэргээхэд өөрчлөлтгүй
    const again = await a.c.post("/api/agent/kb/auto", {});
    assert.equal(again.data.docs.find((d) => d.key === "auto:catalog").result, "unchanged");
  });

  test("үнэ өөрчлөөд сэргээхэд KB шинэ үнийг өгнө (хэрэгсэлтэй ижил)", async () => {
    const list = await mcp("list_products", { query: "" });
    const p = list.data[0];
    const name = p.name;
    const upd = await mcp("update_product", { product: name, price: 12345 });
    assert.equal(upd.ok, true, JSON.stringify(upd));
    const r = await a.c.post("/api/agent/kb/auto", {});
    assert.equal(r.data.docs.find((d) => d.key === "auto:catalog").result, "updated");
    const hits = (await a.c.get(`/api/agent/kb?q=${encodeURIComponent(name)}`)).data.hits;
    const h = hits.find((x) => x.text.includes(name));
    assert.ok(h, "каталогоос олдоно");
    assert.match(h.text, new RegExp(`${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} — 12,345₮`));
    assert.match(h.label, /^Автомат · бараа, үнэ · \d{2}\/\d{2} \d{2}:\d{2}$/);
  });

  test("FAQ олборлолт: PII-тэй санал хаягдана, pending нь хайлтад гарахгүй, нийтэлбэл гарна, татгалзсан дахин санал болгогдохгүй", async () => {
    const t = await mcp("create_ticket", { kind: "question", title: "Буцаалтын хугацаа", body: "Болд 99887766 асуусан" });
    assert.ok(t?.data?.ticket_no, JSON.stringify(t));
    const u = await mcp("update_ticket", { ticket_no: t.data.ticket_no, status: "resolved", resolution: "14 хоногийн дотор баримттай бол буцаана" });
    assert.equal(u.ok, true, JSON.stringify(u));
    const r = await a.c.post("/api/agent/kb/auto", { faq: true });
    assert.equal(r.status, 200, r.text);
    assert.equal(r.data.faq.proposed, 1, JSON.stringify(r.data.faq));
    const pending = (await a.c.get("/api/agent/kb")).data.docs.filter((d) => d.status === "pending");
    assert.equal(pending.length, 1);
    assert.match(pending[0].title, /буцаах хугацаа/);
    assert.ok(!(await a.c.get("/api/agent/kb")).text.includes("99112233"), "PII-тэй FAQ хаягдсан");
    const q = encodeURIComponent("Бараа буцаах хугацаа");
    assert.ok(!(await a.c.get(`/api/agent/kb?q=${q}`)).data.hits.some((h) => h.doc.includes("буцаах хугацаа хэд")), "pending хайлтад гарахгүй");
    // засаад нийтлэх
    const pub = await a.c.patch(`/api/agent/kb/${pending[0].id}`, { action: "publish", title: "Бараа буцаах хугацаа хэд вэ?", text: "# Бараа буцаах хугацаа хэд вэ?\nБаримттай бол 14 хоногийн дотор буцаана. Савлагаа гэмтээгүй байх." });
    assert.equal(pub.status, 200, pub.text);
    assert.equal(pub.data.doc.status, "published");
    assert.ok((await a.c.get(`/api/agent/kb?q=${q}`)).data.hits.some((h) => h.text.includes("Савлагаа")));
    // B-ийн session-оор A-ийн баримтыг батлах → 404
    assert.equal((await b.c.patch(`/api/agent/kb/${pending[0].id}`, { action: "reject" })).status, 404);
    // татгалзах → дахин олборлоход санал болгогдохгүй
    assert.equal((await a.c.patch(`/api/agent/kb/${pending[0].id}`, { action: "reject" })).data.doc.status, "rejected");
    const again = await a.c.post("/api/agent/kb/auto", { faq: true });
    assert.equal(again.data.faq.proposed, 0);
  });

  test("дотоод тойм (auto:insights) харилцагчийн хайлтад гарахгүй", async () => {
    const docs = (await a.c.get("/api/agent/kb")).data.docs;
    const ins = docs.find((d) => d.auto_key === "auto:insights");
    assert.equal(ins.audience, "internal");
    const w = (await a.c.get("/api/agent/widget")).data.token;
    const v = new Client(srv.base);
    const t = (await v.post("/api/v1/widget/session", { w, channel: "web" })).data.token;
    const r = await v.post("/api/agent/public/chat", { text: "ХАЙ:Харилцагчийн тойм дотоод" }, { headers: { authorization: `Bearer ${t}` } });
    assert.equal(r.status, 200, r.text);
    assert.ok(!r.text.includes("Харилцагчийн тойм"), "харилцагчид дотоод баримт харагдахгүй");
  });
});

describe("PII цэвэрлэгээ (kb-auto/pii.ts)", () => {
  let pii;
  before(async () => (pii = await src("lib/kb-auto/pii")));
  test("утас, имэйл, РД, карт, нэр → […]", () => {
    const s = pii.stripPii("Болд 9911-2233, bold@mail.mn, РД УБ99112233, карт 5000 1234 5678 9012. Захиалга ирээгүй.", ["Б.Болд"]);
    for (const leak of ["9911", "bold@", "УБ99112233", "5678", "Болд"]) assert.ok(!s.includes(leak), `${leak} үлдсэн: ${s}`);
    assert.match(s, /Захиалга ирээгүй/);
    assert.equal(pii.hasPii("Хүргэлт 45 минут, 5000₮"), false);
    assert.equal(pii.hasPii("Утас 88112233"), true);
    assert.equal(pii.hasPii("Сараа ирсэн", ["Сараа"]), true);
  });
});
