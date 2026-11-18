/**
 * Агуулгын шифрлэлт (docs/ARCHITECTURE.md §4B.3) — KB (kb_docs/kb_chunks), мессеж (messages, conversations.last_text),
 * харилцагчийн чөлөөт текст (contacts.summary/address). API-аар бичсэн нууц мөр DB файлд (WAL-ийн хамт) ил гарахгүй,
 * харин API-аар тайлагдаж уншигдана; хуучин шифрлээгүй мөрийг анх уншихад шифрлэнэ.
 *   NEXT_DIST_DIR=.next-kb npx next build && NEXT_DIST_DIR=.next-kb node --test tests/content-crypto.test.mjs
 */
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { after, before, describe, test } from "node:test";
import { Client, startServer } from "./helpers/server.mjs";
import { src } from "./helpers/ts.mjs";

const A = { regNo: "8830101", pin: "4321", store: "Альфа шифр дэлгүүр" };
const B = { regNo: "8830202", pin: "8765", store: "Бета шифр дэлгүүр" };
const SECRET_KB = "НУУЦ-KB-5521";
const SECRET_MSG = "НУУЦ-MSG-8812";
const SECRET_ADDR = "НУУЦ-ADDR-4410";
const LEGACY = "ХУУЧИН-ИЛ-7070";

let srv;
const a = { c: null, conv: "", doc: "" };
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
const dbFile = () => path.join(srv.dataDir, "gerege-ai.db");
function checkpoint() {
  const d = new DatabaseSync(dbFile());
  d.exec("PRAGMA wal_checkpoint(TRUNCATE)");
  d.close();
}
function bytesContain(s) {
  const needle = Buffer.from(s, "utf8");
  return ["", "-wal", "-shm"].some((sfx) => existsSync(dbFile() + sfx) && readFileSync(dbFile() + sfx).includes(needle));
}

before(async () => {
  srv = await startServer({ KB_AUTO: "off" });
  await login(A, a);
  // KB баримт
  const kb = await a.c.post("/api/agent/kb", { title: `Дотоод журам ${SECRET_KB}`, text: `# Нууц журам\nДотоод код ${SECRET_KB}. Хүргэлт 45 минут.` });
  assert.equal(kb.status, 200, kb.text);
  a.doc = kb.data.added[0].id;
  // вэб чат (мессеж) + харилцагчийн хаяг (save_contact_info — mock)
  const w = (await a.c.get("/api/agent/widget")).data.token;
  const v = new Client(srv.base);
  const tok = (await v.post("/api/v1/widget/session", { w, channel: "web" })).data.token;
  const auth = { headers: { authorization: `Bearer ${tok}` } };
  const r1 = await v.post("/api/agent/public/chat", { text: `Миний код ${SECRET_MSG}` }, auth);
  assert.equal(r1.status, 200, r1.text);
  a.conv = r1.data.conv;
  const r2 = await v.post("/api/agent/public/chat", { text: `SAVEADDR ${SECRET_ADDR} хороо` }, auth);
  assert.equal(r2.status, 200, r2.text);
  assert.ok(r2.data.steps.some((s) => s.ok), JSON.stringify(r2.data.steps));
}, { timeout: 120_000 });
after(async () => {
  await srv?.stop();
});

describe("Агуулгын шифрлэлт (§4B.3)", () => {
  test("нууц мөр DB файлд (WAL ч) ил гарахгүй", () => {
    checkpoint();
    // SECRET_ADDR нь actions.args (аудит)-д ч бичигддэг — actions-ийн шифрлэлт энэ модулийн хамрах хүрээнд биш тул баганаар шалгана
    for (const s of [SECRET_KB, SECRET_MSG]) assert.equal(bytesContain(s), false, `${s} DB-д ил байна`);
    const d = new DatabaseSync(dbFile(), { readOnly: true });
    const chunk = d.prepare(`SELECT text FROM kb_chunks WHERE merchant = ? LIMIT 1`).get(A.regNo);
    const msg = d.prepare(`SELECT text FROM messages WHERE merchant = ? AND role = 'user' LIMIT 1`).get(A.regNo);
    const conv = d.prepare(`SELECT last_text FROM conversations WHERE id = ?`).get(a.conv);
    const ct = d.prepare(`SELECT address FROM contacts WHERE merchant = ? AND address IS NOT NULL`).get(A.regNo);
    d.close();
    for (const v of [chunk.text, msg.text, conv.last_text, ct.address]) assert.match(v, /^e1\./);
  });

  test("API-аар тайлагдаж уншигдана (KB хайлт BM25/вектор, яриа, карт)", async () => {
    assert.ok((await a.c.get(`/api/agent/kb?q=${encodeURIComponent("Нууц журам дотоод код")}`)).text.includes(SECRET_KB));
    assert.ok((await a.c.get("/api/agent/kb")).text.includes(SECRET_KB), "гарчиг тайлагдана");
    assert.ok((await a.c.get(`/api/agent/kb/${a.doc}`)).text.includes(SECRET_KB));
    assert.ok((await a.c.get(`/api/agent/conversations/${a.conv}`)).text.includes(SECRET_MSG));
    const cs = (await a.c.get(`/api/agent/contacts`)).data.contacts;
    assert.ok(cs.some((c) => c.address?.includes(SECRET_ADDR)));
  });

  test("шифр текстийг өөр мөр рүү хуулбал тайлагдахгүй (AAD)", async () => {
    const d = new DatabaseSync(dbFile());
    const rows = d.prepare(`SELECT id, text FROM kb_chunks WHERE merchant = ? ORDER BY idx`).all(A.regNo);
    d.prepare(`INSERT INTO kb_chunks (id, doc_id, merchant, idx, text, emb) VALUES ('kcforged1', ?, ?, 99, ?, x'')`).run(a.doc, A.regNo, rows[0].text);
    d.close();
    const chunks = (await a.c.get(`/api/agent/kb/${a.doc}`)).data.chunks;
    assert.equal(chunks.length, rows.length + 1);
    assert.equal(chunks.at(-1), "", "өөр мөрийн шифр тайлагдаагүй");
  });

  test("хуучин (шифрлээгүй) мөр анх уншихад шифрлэгдэнэ", async () => {
    // B-г нэвтрүүлэхээс өмнө хуучин хэлбэрийн мөрүүдийг шууд бичнэ
    const d = new DatabaseSync(dbFile());
    const now = Date.now();
    d.prepare(`INSERT INTO kb_docs (id, merchant, title, kind, chars, chunks, created_at) VALUES ('kdlegacy1', ?, ?, 'note', 10, 1, ?)`).run(B.regNo, `Хуучин ${LEGACY}`, now);
    d.prepare(`INSERT INTO kb_chunks (id, doc_id, merchant, idx, text, emb) VALUES ('kclegacy1', 'kdlegacy1', ?, 0, ?, x'')`).run(B.regNo, `Хуучин журам ${LEGACY}`);
    d.prepare(`INSERT INTO conversations (id, merchant, channel, ext_id, status, title, last_text, last_at, created_at) VALUES ('cvlegacy1', ?, 'web', 'vlegacy', 'ai', 'Зочин', ?, ?, ?)`).run(B.regNo, `сүүлд ${LEGACY}`, now, now);
    d.prepare(`INSERT INTO messages (id, merchant, conv_id, role, text, at) VALUES ('mlegacy1', ?, 'cvlegacy1', 'user', ?, ?)`).run(B.regNo, `мессеж ${LEGACY}`, now);
    d.close();
    await login(B, b);
    assert.ok((await b.c.get("/api/agent/kb")).text.includes(LEGACY), "хуучин мөр уншигдана");
    assert.ok((await b.c.get(`/api/agent/conversations/cvlegacy1`)).text.includes(LEGACY));
    const r = new DatabaseSync(dbFile(), { readOnly: true });
    const left = [
      r.prepare(`SELECT title v FROM kb_docs WHERE id = 'kdlegacy1'`).get().v,
      r.prepare(`SELECT text v FROM kb_chunks WHERE id = 'kclegacy1'`).get().v,
      r.prepare(`SELECT last_text v FROM conversations WHERE id = 'cvlegacy1'`).get().v,
      r.prepare(`SELECT text v FROM messages WHERE id = 'mlegacy1'`).get().v,
    ];
    r.close();
    for (const v of left) assert.match(v, /^e1\./, "шифрлэгдсэн");
    // A-ийн session-оор B-ийн хуучин мөр харагдахгүй
    assert.ok(!(await a.c.get("/api/agent/kb")).text.includes(LEGACY));
  });
});
