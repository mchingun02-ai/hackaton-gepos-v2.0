/**
 * Нэгж тест (сервергүй): HMAC токен, tdb (`:tenant`-гүй SQL → throw), withSp хамгаалалт, PosAdapter (gepos).
 * node --test tests/unit.test.mjs
 */
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, before, describe, test } from "node:test";
import { src } from "./helpers/ts.mjs";

const dir = mkdtempSync(path.join(os.tmpdir(), "gepos-unit-"));
process.env.SP_DATA_DIR = dir;
process.env.AUTH_SECRET = "unit-test-secret-0123456789-abcdefghijklmnop";
after(() => rmSync(dir, { recursive: true, force: true }));

describe("HMAC токен (tenant/tokens.ts)", () => {
  let t;
  before(async () => (t = await src("lib/tenant/tokens")));

  test("widget токен: зөв → payload, гарын үсэг өөрчилвөл/тайрвал → null", () => {
    const w = t.signWidget({ t: "pubA", kid: "k1", ch: ["web", "voice"] });
    assert.match(w, /^gwt_[\w-]+\.[\w-]+$/);
    assert.deepEqual(t.verifyWidget(w), { t: "pubA", kid: "k1", ch: ["web", "voice"] });
    const [body, sig] = w.slice(4).split(".");
    const forged = `gwt_${Buffer.from(JSON.stringify({ t: "pubB", kid: "k1", ch: ["web"] })).toString("base64url")}.${sig}`;
    assert.equal(t.verifyWidget(forged), null, "payload-ыг B болгосон");
    assert.equal(t.verifyWidget(`gwt_${body}`), null, "гарын үсэггүй");
    assert.equal(t.verifyWidget(`gwt_${body}.${sig.slice(0, -2)}AA`), null, "гарын үсэг өөрчилсөн");
    assert.equal(t.verifyWidget(t.signWidget({ t: "pubA", kid: "k1", ch: ["web"] }, "өөр-нууц-түлхүүр-0123456789-0123456789")), null, "өөр secret");
  });

  test("зочны токен: хугацаа дууссан → null, sid хэлбэр шалгана", () => {
    const now = Date.now();
    const ok = t.signVisitor({ t: "pubA", sid: "vAbCdEfGh123", ch: "web", exp: now + 60_000 });
    assert.equal(t.verifyVisitor(ok)?.sid, "vAbCdEfGh123");
    assert.equal(t.verifyVisitor(t.signVisitor({ t: "pubA", sid: "vAbCdEfGh123", ch: "web", exp: now - 1 })), null);
    assert.equal(t.verifyVisitor(t.signVisitor({ t: "pubA", sid: "../../x", ch: "web", exp: now + 60_000 })), null);
    assert.equal(t.verifyVisitor(ok.replace("gvs_", "gwt_")), null, "төрөл холих");
  });

  test("AUTH_SECRET богино бол токен үүсгэхгүй", () => {
    const keep = process.env.AUTH_SECRET;
    process.env.AUTH_SECRET = "short";
    try {
      assert.throws(() => t.signWidget({ t: "a", kid: "b", ch: ["web"] }), /AUTH_SECRET/);
    } finally {
      process.env.AUTH_SECRET = keep;
    }
  });
});

describe("tdb (tenant/tdb.ts)", () => {
  test("`:tenant`-гүй SQL ажиллахгүй; утгыг боодол холбоно", async () => {
    const { tdb, pdbFor, TenantSqlError } = await src("lib/tenant/tdb");
    const a = tdb("UNITA01");
    const b = tdb("UNITB02");
    assert.throws(() => a.all(`SELECT * FROM tickets`), TenantSqlError);
    assert.throws(() => a.run(`DELETE FROM tickets WHERE id = ?`, "x"), TenantSqlError);
    a.run(`INSERT INTO settings (merchant, json) VALUES (:tenant, ?)`, '{"agentName":"A"}');
    b.run(`INSERT INTO settings (merchant, json) VALUES (:tenant, ?)`, '{"agentName":"B"}');
    assert.equal(a.one(`SELECT json FROM settings WHERE merchant = :tenant`).json, '{"agentName":"A"}');
    assert.equal(b.all(`SELECT json FROM settings WHERE merchant = :tenant`).length, 1);
    assert.throws(() => pdbFor("p1").all(`SELECT * FROM tenants WHERE merchant = :tenant`), TenantSqlError, "түншийн боодол :partner шаардана");
  });
});

describe("withSp хамгаалалт ба GePOS адаптер", () => {
  let sp, core, tdb, gepos, ctxA;
  before(async () => {
    sp = await src("lib/sp/server");
    core = await src("lib/sp/core");
    tdb = (await src("lib/tenant/tdb")).tdb;
    gepos = (await src("lib/pos/gepos")).geposAdapter;
    ctxA = { tenantId: "UNITA01", db: tdb("UNITA01") };
  });

  test("callback Promise буцаавал throw, төлөв бичигдэхгүй", () => {
    assert.throws(() => sp.withSp(ctxA, async () => 1), /синхрон/);
    assert.equal(sp.readSp(ctxA), null);
  });

  test("withSp-ээс гадуур core дуудвал SpError (өөр tenant-ын төлөв харахгүй)", () => {
    sp.withSp(ctxA, () => null);
    assert.throws(() => core.mutate((s) => s), core.SpError);
  });

  test("адаптер async, tenant хооронд тусгаарлагдсан, нэг rev", async () => {
    const a = gepos("UNITA01");
    const b = gepos("UNITB02");
    const rev0 = sp.readSp(ctxA).rev;
    const p = await a.upsertProduct({ id: "t", name: "Тест" }, { name: "Зөвхөн А бараа", price: 1234, stock: 7, unitLabel: "кг" });
    assert.equal(p.unit, "kg");
    assert.equal(sp.readSp(ctxA).rev, rev0 + 1);
    assert.ok((await a.listProducts({ search: "зөвхөн а" })).some((x) => x.id === p.id));
    assert.ok(!(await b.listProducts()).some((x) => x.name === "Зөвхөн А бараа"));
    const r = await a.adjustStock({ id: "t", name: "Тест" }, [{ productId: p.id, delta: -2, reason: "count", by: "t" }]);
    assert.equal(r.applied.length, 1);
    assert.equal((await a.stock([p.id]))[0].qty, 5);
    const sum = await a.salesSummary({ from: new Date(0), to: new Date() }, "day");
    assert.ok(Array.isArray(sum));
  });
});
