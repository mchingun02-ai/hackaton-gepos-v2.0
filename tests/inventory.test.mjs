/**
 * Тооллого (docs/ARCHITECTURE.md §5, §15 алхам 9–12, §16):
 *  · нэгж — тоолох аргууд, босго, delta засвар, EAN шалгах цифр, тааруулалт, vision JSON шалгалт, захиалах санал
 *  · интеграц (next start + mock Qwen) — эхлэх → зураг → 3 аргаар тоолох → илгээх → батлах → үлдэгдэл яг delta-аар
 *    (дундуур борлуулалт орсон ч), давхар батлах 409, tenant B → 404, буруу зураг 400, кредит 0 → 402, ноорог → ПОС
 *
 *   NEXT_DIST_DIR=.next-inv npx next build && NEXT_DIST_DIR=.next-inv node --test tests/inventory.test.mjs
 *   (нэгж хэсэг л: INV_UNIT_ONLY=1 node --test tests/inventory.test.mjs)
 */
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { after, before, describe, test } from "node:test";
import { src, ROOT } from "./helpers/ts.mjs";

// нэгж хэсэг DB-д хүрэхгүй ч, санамсаргүй хүрвэл түр хавтас руу
if (!process.env.SP_DATA_DIR) process.env.SP_DATA_DIR = (await import("node:fs")).mkdtempSync(path.join((await import("node:os")).tmpdir(), "gepos-inv-unit-"));

/* ═════════════════════════ нэгж ═════════════════════════ */

describe("methods.ts — 5 арга", async () => {
  const m = await src("lib/inventory/methods");
  test("facings q = f×d×r + l, гүн профайлаас", () => {
    assert.equal(m.computeQty("facings", { f: 6, d: 4 }).qty, 24);
    assert.equal(m.computeQty("facings", { f: 6, d: 4, r: 2, l: 3 }).qty, 51);
    assert.equal(m.computeQty("facings", { f: 5 }, { depth: 3 }).qty, 15, "профайлын гүн");
    assert.equal(m.computeQty("facings", { f: 0, d: 5 }).qty, 0, "хоосон тавиур");
    assert.throws(() => m.computeQty("facings", { f: -1, d: 2 }), /бага байж болохгүй/);
    assert.throws(() => m.computeQty("facings", { f: 2.5, d: 2 }), /бүхэл/);
  });
  test("boxes q = b × pack + l", () => {
    assert.equal(m.computeQty("boxes", { b: 3, l: 5 }, { packSize: 24 }).qty, 77);
    assert.throws(() => m.computeQty("boxes", { b: 3 }, {}), /Хайрцаг дахь тоо/);
  });
  test("weight: ширхэг round((g−tare)/unit), зөрүү их бол confidence 0.5; кг бутархай", () => {
    const a = m.computeQty("weight", { g: 1030 }, { unitWeightG: 10, tareG: 30 });
    assert.equal(a.qty, 100);
    assert.equal(a.confidence, undefined);
    const b = m.computeQty("weight", { g: 1045 }, { unitWeightG: 10, tareG: 0 }); // 104.5 → 0.5 зөрүү
    assert.equal(b.confidence, 0.5);
    assert.match(b.warning, /Нэгжийн жин/);
    assert.equal(m.computeQty("weight", { g: 2750 }, { tareG: 250 }, "kg").qty, 2.5);
    assert.throws(() => m.computeQty("weight", { g: 10 }, { unitWeightG: 5, tareG: 50 }), /савны жин/);
  });
  test("stack q = floor(h / зузаан) × s", () => {
    assert.equal(m.computeQty("stack", { h: 205, s: 3 }, { unitThicknessMm: 10 }).qty, 60);
    assert.equal(m.computeQty("stack", { h: 30 }, { unitThicknessMm: 0.1 }).qty, 300, "хөвөгч цэгийн алдаагүй");
  });
  test("manual + хэт их тоо", () => {
    assert.equal(m.computeQty("manual", { q: 12 }).qty, 12);
    assert.equal(m.needsConfirm(201, 0), true);
    assert.equal(m.needsConfirm(200, 0), false);
    assert.equal(m.needsConfirm(900, 100), false);
  });
});

describe("reconcile.ts — босго, delta", async () => {
  const r = await src("lib/inventory/reconcile");
  const L = (system, counted, unitValue = 1000, minConfidence = null) => r.classify({ system, counted, unitValue, minConfidence });
  test("ok / warn / critical", () => {
    assert.equal(L(100, 101), "ok", "|Δ| ≤ 1");
    assert.equal(L(1, 0), "critical", "system > 0, counted = 0 (|Δ|=1 ч гэсэн)");
    assert.equal(L(500, 492, 500), "ok", "1.6% ба 4,000₮");
    assert.equal(L(500, 492, 1000), "warn", "1.6% боловч 8,000₮ > 5,000");
    assert.equal(L(100, 92, 100), "warn", "8%");
    assert.equal(L(100, 85, 100), "critical", "15%");
    assert.equal(L(100, 96, 20_000), "critical", "4% боловч 80,000₮");
    assert.equal(L(10, 10, 1000, 0.5), "critical", "зургийн итгэл < 0.6");
    assert.equal(L(0, 3, 100), "critical", "системд 0 байхад 3 олдсон: 3 / max(1, 0) = 300%");
  });
  test("delta: тоолсны дараа 3 ширхэг зарагдсан ч эцсийн үлдэгдэл зөв", () => {
    const systemAtCount = 10;
    const counted = 8;
    const v = r.varianceOf(counted, systemAtCount);
    assert.equal(v, -2);
    const afterSale = systemAtCount - 3; // тоолсны дараа ПОС-д 3 зарагдсан
    assert.deepEqual(r.applyDelta(afterSale, v), { before: 7, delta: -2, after: 5 }); // = 8 − 3
    assert.equal(r.applyDelta(1, -5).after, 0, "сөрөг болохгүй");
  });
  test("тайлан: дутагдал/илүүдэл ₮, тоолоогүй, эхний 10", () => {
    const rep = r.report(
      [
        { productId: "a", name: "A", status: "counted", counted: 8, system: 10, variance: -2, level: "warn", unitValue: 1000 },
        { productId: "b", name: "B", status: "counted", counted: 11, system: 10, variance: 1, level: "ok", unitValue: 500 },
        { productId: "c", name: "C", status: "pending", counted: null, system: null, variance: null, level: null, unitValue: 100 },
      ],
      [{ method: "facings", n: 3 }, { method: "manual", n: 1 }],
    );
    assert.equal(rep.shortage, 2000);
    assert.equal(rep.surplus, 500);
    assert.equal(rep.net, -1500);
    assert.equal(rep.uncounted, 1);
    assert.equal(rep.top[0].productId, "a");
    assert.deepEqual(rep.methods.map((x) => x.pct), [75, 25]);
  });
  test("босгыг хязгаарт оруулна", () => {
    const t = r.cleanThresholds({ okPct: 5, warnPct: -1, okValue: "abc" });
    assert.equal(t.okPct, 1);
    assert.equal(t.warnPct, 1, "warn ≥ ok");
    assert.equal(t.okValue, r.DEFAULT_THRESHOLDS.okValue);
  });
});

describe("match.ts — EAN, тааруулалт", async () => {
  const m = await src("lib/inventory/match");
  test("EAN-13 / EAN-8 шалгах цифр", () => {
    assert.equal(m.isEan13("4006381333931"), true);
    assert.equal(m.isEan13("4006381333932"), false);
    assert.equal(m.isEan8("96385074"), true);
    assert.equal(m.isEan8("96385075"), false);
    assert.equal(m.checkDigitOk("036000291452"), true, "UPC-A");
    assert.equal(m.checkDigitOk("12345"), false);
    assert.equal(m.checkDigitOk("abcdefghijklm"), false);
  });
  const P = [
    { id: "p1", name: "Кока-Кола 0.5 л", barcodes: ["4860000106075"] },
    { id: "p2", name: "Кока-Кола 1.5 л" },
    { id: "p3", name: "Ус «Ундраа» 0.5 л" },
    { id: "p4", name: "Жүүс 1 л" },
  ];
  test("алиас → id; жагсаалтад байхгүй k-г үл тооно", () => {
    const alias = new Map([["a1", "p3"]]);
    assert.equal(m.matchOne({ k: "a1", label: "юу ч" }, P, alias).productId, "p3");
    assert.notEqual(m.matchOne({ k: "zz", label: "Огт өөр зүйл" }, P, alias).via, "alias");
  });
  test("баркод яг таарах → нэрээр (оноо ≥ 0.6, зөрүү ≥ 0.15)", () => {
    assert.equal(m.matchOne({ label: "x", barcode: "4860000106075" }, P, new Map()).productId, "p1");
    const r = m.matchOne({ label: "Кока-Кола", size: "0.5 л" }, P, new Map());
    assert.equal(r.productId, "p1");
    const amb = m.matchOne({ label: "Кока-Кола" }, P, new Map());
    assert.equal(amb.productId, null, "0.5 ба 1.5 л ялгагдахгүй — ажилтан сонгоно");
    assert.ok(amb.suggestions.length >= 2);
  });
  test("resolveDetection: k / баркод / нэр / үнийн шошго → автомат; ойролцоо → 2–3 сонголт; танихгүй", () => {
    const PP = [
      { id: "p1", name: "Кока-Кола 0.5 л", barcodes: ["4860000106075"], price: 2500 },
      { id: "p2", name: "Кока-Кола 1.5 л", price: 4500 },
      { id: "p3", name: "Ус «Ундраа» 0.5 л", price: 900 },
      { id: "p4", name: "Сүү 1 л «Сүү ХК»", price: 3900 },
    ];
    const alias = new Map([["a3", "p3"]]);
    const r1 = m.resolveDetection({ k: "a3", label: "Undraa water" }, PP, alias);
    assert.deepEqual([r1.status, r1.productId, r1.via], ["matched", "p3", "alias"], "англи нэртэй ч k-аар");
    assert.equal(m.resolveDetection({ label: "x", barcode: "4860000106075" }, PP, alias).productId, "p1");
    assert.equal(m.resolveDetection({ label: "Сүү 1 л" }, PP, alias).via, "name");
    const amb = m.resolveDetection({ label: "Кока-Кола" }, PP, alias);
    assert.equal(amb.status, "ambiguous");
    assert.deepEqual(amb.candidates.map((c) => c.id).sort(), ["p1", "p2"]);
    const byPrice = m.resolveDetection({ label: "Кока-Кола", price_tag: 4500 }, PP, alias);
    assert.deepEqual([byPrice.status, byPrice.productId, byPrice.via], ["matched", "p2", "price"], "үнийн шошгоор ялгав");
    const unk = m.resolveDetection({ k: "zz9", label: "Огт өөр зүйл" }, PP, alias);
    assert.equal(unk.status, "unknown");
    // k нь сул, харин нэр өөр бараатай хүчтэй таарвал — асууна
    const clash = m.resolveDetection({ k: "a3", label: "Сүү 1 л ХК" }, PP, alias);
    assert.equal(clash.status, "ambiguous");
  });
  test("dHash, hamming, ирмэг", () => {
    const g = Array.from({ length: 72 }, (_, i) => (i * 37) % 255);
    const h = m.dhash(g);
    assert.match(h, /^[0-9a-f]{16}$/);
    assert.equal(m.hamming(h, h), 0);
    assert.equal(m.hamming("ffffffffffffffff", "fffffffffffffffe"), 1);
    assert.equal(m.hamming("ffffffffffffffff", "0000000000000000"), 64);
    assert.equal(m.touchesEdge([0.01, 0, 0.3, 0.3]), true);
    assert.equal(m.touchesEdge([0.7, 0, 0.29, 0.3]), true);
    assert.equal(m.touchesEdge([0.3, 0, 0.3, 0.3]), false);
  });
  test("≤ 200 бараа бол алиас, их бол хоосон", () => {
    assert.equal(m.aliasList(P).cands.length, 4);
    assert.deepEqual(m.aliasList([{ id: "q", name: "Кола", barcodes: ["4860000106075"], price: 2500 }]).cands[0], { k: "a1", n: "Кола", b: "4860000106075", p: 2500 });
    assert.equal(m.aliasList(Array.from({ length: 200 }, (_, i) => ({ id: `x${i}`, name: `n${i}` }))).cands.length, 200, "каталог 200 хүртэл");
    assert.equal(m.aliasList(Array.from({ length: 201 }, (_, i) => ({ id: `x${i}`, name: `n${i}` }))).cands.length, 0);
  });
});

describe("prompts.ts — vision JSON-ийг шалгах (T7b)", async () => {
  const p = await src("lib/inventory/prompts");
  test("markdown/текст бүрхүүлээс эхний {...}; k хаях; 0..200 хавчих; bbox", () => {
    const raw = 'Энд байна:\n```json\n{"items":[{"k":"a1","label":"Кола","facings":9999,"confidence":3,"bbox":[0.1,0.2,0.3,0.4]},{"k":"zz","label":"Ус","facings":"4","stacked_rows":40,"bbox":[100,200,300,400]},{"label":"","facings":2},{"k":"a1","label":"x"}],"gaps":[{"near_label":"Жүүс {шошго}"}],"quality":{"blurry":true}}\n``` баярлалаа {';
    const r = p.parseShelf(raw, new Set(["a1"]));
    assert.equal(r.items.length, 2, "нэргүй, тоогүй мөр хаягдана");
    assert.equal(r.items[0].facings, 200);
    assert.equal(r.items[0].confidence, 1);
    assert.equal(r.items[1].k, null, "жагсаалтад байхгүй k");
    assert.equal(r.items[1].stacked_rows, 10);
    assert.deepEqual(r.items[1].bbox, [0.1, 0.2, 0.3, 0.4], "0..1000 → 0..1");
    assert.equal(r.gaps[0].near_label, "Жүүс {шошго}");
    assert.equal(r.quality.blurry, true);
  });
  test("JSON биш → throw (дахин оролдоно)", () => {
    assert.throws(() => p.parseShelf("Уучлаарай, зураг харагдахгүй байна", new Set()));
    assert.throws(() => p.parseShelf('{"foo":1}', new Set()), /items/);
  });
  test("ноорог: ангилал зөвхөн жагсаалтаас, буруу баркод хаягдана", () => {
    const d = p.parseDraft('{"name":"Сүү 1 л","barcode":"4006381333932","category":"Электрон","unit":"bottle","price_tag":"3,900₮"}', ["Хүнс", "Ундаа"]);
    assert.equal(d.category, null);
    assert.equal(d.barcode, null);
    assert.equal(d.barcodeRejected, true);
    assert.equal(d.unit, "pcs");
    assert.equal(d.price_tag, 3900);
    assert.equal(p.parseDraft('{"name":"Ус","category":"ундаа","barcode":"4006381333931"}', ["Ундаа"]).category, "Ундаа");
  });
});

describe("reorder.ts / gaps.ts — цэвэр тооцоо", async () => {
  const r = await src("lib/inventory/reorder");
  const g = await src("lib/inventory/gaps");
  test("захиалах санал", () => {
    // 14 хоногт 140 → өдөрт 10; цэг = 10×3 + 5 = 35; үлдэгдэл 20 → 140 − 20 = 120 → хайрцаг 24 → 120
    assert.deepEqual(r.suggestReorder({ qty: 20, minQty: 5, sold: 140, packSize: 24 }), { velocity: 10, reorderPoint: 35, suggest: 120, daysCover: 2 });
    assert.equal(r.suggestReorder({ qty: 100, minQty: 5, sold: 140 }).suggest, 0, "хангалттай");
    assert.equal(r.suggestReorder({ qty: 2, minQty: 10, sold: 0 }).suggest, 8, "борлуулалтгүй ч доод хэмжээнээс бага");
    assert.equal(r.suggestReorder({ qty: 0, minQty: 0, sold: 0 }).suggest, 0);
  });
  test("тавиурт алга: зурагт орсон ангиллын илрээгүй, үлдэгдэлтэй бараа", () => {
    const ps = [
      { id: "a", name: "Кола", category: "Ундаа" },
      { id: "b", name: "Ус", category: "Ундаа" },
      { id: "c", name: "Жүүс", category: "Ундаа" },
      { id: "d", name: "Талх", category: "Хүнс" },
    ];
    const miss = g.missingOnShelf(ps, new Set(["a"]), new Map([["b", 5], ["c", 0], ["d", 9]]));
    assert.deepEqual(miss.map((x) => x.productId), ["b"]);
  });
});

describe("UI: зургаар бөөнөөр тоолох нь үндсэн — амьд баркод уншигч автоматаар нээгдэхгүй", () => {
  const read = (f) => readFileSync(path.join(ROOT, "src/components/count", f), "utf8");
  test("үндсэн урсгал (Нүүр, зургийн үр дүн) ZXing CameraScanner ашиглахгүй; камер = <input capture>", () => {
    for (const f of ["Home.tsx", "PhotoResult.tsx", "CountApp.tsx", "shoot.ts"]) assert.ok(!/CameraScanner|@zxing|getUserMedia/.test(read(f)), `${f} баркод уншигч дуудаж байна`);
    const ui = read("ui.tsx");
    assert.match(ui, /capture: "environment"/);
    assert.match(ui, /multiple: true/, "олон зураг сонгох");
    assert.match(read("Home.tsx"), /htmlFor="start-cam"[\s\S]*Тоолж эхлэх/);
    assert.match(read("PhotoResult.tsx"), /htmlFor="next-cam"[\s\S]*Батлах ба дараагийн тавиур/);
  });
  test("баркод уншигч зөвхөн тодорхой товшилтоор (анхдагч хаалттай)", () => {
    const c = read("Counting.tsx");
    assert.match(c, /useState\(!!scanOnOpen\)/);
    assert.match(c, /Баркодоор нэг бараа нэмэх/);
    assert.match(read("NewProduct.tsx"), /useState\(false\);[\s\S]*Баркод уншуулах/);
  });
});

/* ═════════════════════════ интеграц ═════════════════════════ */

const DIST = process.env.NEXT_DIST_DIR || ".next";
const canServe = !process.env.INV_UNIT_ONLY && existsSync(path.join(ROOT, DIST, "BUILD_ID"));

describe("API интеграц (next start + mock Qwen)", { skip: canServe ? false : `${DIST}/BUILD_ID алга — эхлээд build хийнэ үү` }, () => {
  const A = { regNo: "8840101", pin: "4321", store: "Альфа тооллого" };
  const B = { regNo: "8840202", pin: "8765", store: "Бета тооллого" };
  let srv, Client;
  const a = {};
  const b = {};
  const png = readFileSync(path.join(ROOT, "public/products/cola-500ml.png"));

  async function tenant(t, credits) {
    const core = await src("lib/sp/core");
    const s = core.freshState();
    s.merchant = { ...s.merchant, regNo: t.regNo, pin: t.pin, name: `${t.store} ХХК`, pinTries: 0 };
    const c = new Client(srv.base);
    const r = await c.post("/api/auth/login", { regNo: t.regNo, pin: t.pin, bootstrap: s });
    assert.equal(r.status, 200, r.text);
    if (credits) {
      const inv = await c.post("/api/agent/billing", { plan: "start" });
      assert.equal((await c.post(`/api/agent/billing/${inv.data.id}`, {})).data?.status, "paid");
    }
    return c;
  }
  /** Эзэмшигчээр нэвтэрч, дараа нь ажилтны PIN-ээр солигдоно */
  async function staff(t, pin) {
    const c = new Client(srv.base);
    assert.equal((await c.post("/api/auth/login", { regNo: t.regNo, pin: t.pin })).status, 200);
    const r = await c.post("/api/auth/staff", { pin });
    assert.equal(r.status, 200, r.text);
    return c;
  }
  const upload = (c, url, buf, type = "image/png", name = "shelf.png") => {
    const fd = new FormData();
    fd.append("image", new Blob([buf], { type }), name);
    return fetch(srv.base + url, { method: "POST", headers: { cookie: c.cookie, origin: srv.base, "x-forwarded-for": c.ip }, body: fd }).then(async (r) => ({ status: r.status, data: await r.json().catch(() => null) }));
  };
  const credits = async (c) => (await c.get("/api/agent/stats")).data.wallet.credits;
  const stockOf = async (c, name) => (await c.get("/api/sp/state")).data.state.products.find((p) => p.name === name).stock;

  before(async () => {
    ({ Client } = await import("./helpers/server.mjs"));
    const { startServer } = await import("./helpers/server.mjs");
    srv = await startServer();
    a.owner = await tenant(A, true);
    b.owner = await tenant(B, false); // кредитгүй
    a.staff = await staff(A, "1111"); // Сарнай — касс
    a.mgr = await staff(A, "2222"); // Тэмүүлэн — менежер
    a.key = (await a.owner.post("/api/agent/keys", { label: "inv" })).data.key;
  }, { timeout: 120_000 });
  after(async () => srv?.stop());

  const S = {};
  test("эхлэх: ажилтан тооллого үүсгэнэ, хараагүй — үлдэгдэл харагдахгүй; давхар → 409", async () => {
    const r = await a.staff.post("/api/v1/inventory/sessions", { scope: "all" });
    assert.equal(r.status, 201, r.text);
    S.id = r.data.session.id;
    S.total = r.data.lines.length;
    assert.ok(S.total >= 21, `${S.total} мөр`);
    assert.equal(r.data.progress.total, S.total);
    assert.ok(r.data.lines.every((l) => l.expected === undefined), "blind");
    const dup = await a.staff.post("/api/v1/inventory/sessions", { scope: "all" });
    assert.equal(dup.status, 409);
    const m = await a.mgr.get(`/api/v1/inventory/sessions/${S.id}`);
    assert.equal(m.data.lines.find((l) => l.name === "Кока-Кола 0.5 л").expected, 288, "менежерт харагдана");
    const cats = (await a.staff.get("/api/v1/inventory/sessions")).data.categories;
    assert.ok(cats.includes("Ундаа"));
  });

  test("зураг: илрүүлэлт, жагсаалтад байхгүй k хаягдана, 9999 → 200, 3 кредит; зураг шифрлэгдсэн", async () => {
    const c0 = await credits(a.owner);
    const r = await upload(a.staff, `/api/v1/inventory/sessions/${S.id}/photos`, png);
    assert.equal(r.status, 200, JSON.stringify(r.data));
    assert.equal(r.data.photo.status, "done");
    S.photo = r.data.photo.id;
    const d = r.data.result.detections;
    const cola = d.find((x) => x.label.startsWith("Coca"));
    assert.equal(cola.name, "Кока-Кола 0.5 л");
    assert.equal(cola.via, "alias");
    assert.equal(cola.status, "matched", "сонгохгүйгээр таарсан");
    assert.equal(cola.facings, 6);
    assert.deepEqual([cola.depth, cola.depthSource], [4, "ai"], "AI гүн ≥ 0.8 итгэлтэй → урьдчилж бөглөнө");
    const water = d.find((x) => x.label.startsWith("Ундраа"));
    assert.deepEqual([water.depth, water.depthEst, water.rows], [null, 3, 2], "итгэл 0.5 → зөвхөн санал, давхар 2");
    const milk = d.find((x) => x.label === "Сүү 1 л");
    assert.deepEqual([milk.status, milk.name], ["matched", "Сүү 1 л «Сүү ХК»"], "k-гүй ч нэр+үнээр");
    assert.equal(r.data.photo.place, "Тавиур 1", "анхны байршил автоматаар");
    const unk = d.find((x) => x.label === "Үл мэдэгдэх бараа");
    assert.equal(unk.facings, 200);
    assert.notEqual(unk.via, "alias");
    assert.notEqual(unk.status, "matched");
    assert.equal(r.data.result.gaps[0].near_label, "Жүүс");
    assert.equal(await credits(a.owner), c0 - 3);
    // файл: tenant хавтсанд, PNG гарын үсэг ил биш (шифрлэгдсэн), API-аар тайлагдана
    const dir = path.join(srv.dataDir, "tenants", A.regNo, "inv");
    const f = readdirSync(dir).find((x) => x.startsWith(S.photo));
    assert.ok(f);
    assert.ok(!readFileSync(path.join(dir, f)).includes(png.subarray(0, 8)), "шифрлэгдээгүй байна");
    const img = await fetch(`${srv.base}/api/v1/inventory/photos/${S.photo}`, { headers: { cookie: a.staff.cookie } });
    assert.equal(img.status, 200);
    assert.equal(img.headers.get("content-type"), "image/png");
    assert.ok(Buffer.from(await img.arrayBuffer()).equals(png));
  });

  test("tenant B: A-ийн тооллого, зураг, тоо, тайлан → 404", async () => {
    for (const [m, p, body] of [
      ["GET", `/api/v1/inventory/sessions/${S.id}`],
      ["GET", `/api/v1/inventory/sessions/${S.id}/variance`],
      ["GET", `/api/v1/inventory/photos/${S.photo}`],
      ["POST", `/api/v1/inventory/sessions/${S.id}/counts`, { clientId: "b-1", productId: "p1", method: "manual", inputs: { q: 1 } }],
      ["PATCH", `/api/v1/inventory/sessions/${S.id}`, { action: "cancel" }],
      ["POST", `/api/v1/inventory/sessions/${S.id}/approve`, {}],
    ]) {
      const r = await b.owner.req(m, p, { json: body });
      assert.equal(r.status, 404, `${m} ${p} → ${r.status} ${r.text}`);
    }
    const list = await b.owner.get("/api/v1/inventory/sessions");
    assert.equal(list.data.sessions.length, 0);
    assert.ok(!(await b.owner.get("/api/v1/inventory/gaps")).text.includes(S.id));
  });

  test("буруу зураг → 400, хэт том → 413; кредит хасагдахгүй", async () => {
    const c0 = await credits(a.owner);
    const bad = await upload(a.staff, `/api/v1/inventory/sessions/${S.id}/photos`, Buffer.from("<html>not an image</html>"), "image/png");
    assert.equal(bad.status, 400, JSON.stringify(bad.data));
    const big = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(4 * 1024 * 1024 + 10)]);
    const r2 = await upload(a.staff, `/api/v1/inventory/sessions/${S.id}/photos`, big, "image/jpeg", "big.jpg");
    assert.equal(r2.status, 413);
    const notMultipart = await a.staff.post(`/api/v1/inventory/sessions/${S.id}/photos`, { image: "x" });
    assert.equal(notMultipart.status, 400);
    assert.equal(await credits(a.owner), c0);
  });

  test("кредит 0 → 402 (B)", async () => {
    const s = await b.owner.post("/api/v1/inventory/sessions", { scope: "all" });
    assert.equal(s.status, 201);
    b.sid = s.data.session.id;
    const r = await upload(b.owner, `/api/v1/inventory/sessions/${b.sid}/photos`, png);
    assert.equal(r.status, 402, JSON.stringify(r.data));
    const d = await upload(b.owner, "/api/v1/inventory/drafts", png);
    assert.equal(d.status, 402);
  });

  test("vision алдаа: JSON биш 2 удаа → failed, кредит буцна; 1-д буруу 2-т зөв → амжилттай", async () => {
    const c0 = await credits(a.owner);
    srv.mock.state.vision = "Уучлаарай, би энэ зургийг харж чадахгүй байна.";
    const n0 = srv.mock.state.visionCalls;
    const f = await upload(a.staff, `/api/v1/inventory/sessions/${S.id}/photos`, png);
    assert.equal(f.status, 200);
    assert.equal(f.data.photo.status, "failed");
    assert.match(f.data.message, /Кредит буцаагдлаа/);
    assert.equal(srv.mock.state.visionCalls - n0, 2, "1 удаа дахин оролдоно");
    assert.equal(await credits(a.owner), c0, "кредит буцсан");
    srv.mock.state.vision = { status: 500 };
    assert.equal((await upload(a.staff, `/api/v1/inventory/sessions/${S.id}/photos`, png)).data.photo.status, "failed");
    assert.equal(await credits(a.owner), c0);
    let i = 0;
    srv.mock.state.vision = () => (i++ === 0 ? "bad" : '{"items":[{"label":"Ус 1.5 л","facings":3,"confidence":0.9}],"gaps":[],"quality":{"blurry":true}}');
    const ok = await upload(a.staff, `/api/v1/inventory/sessions/${S.id}/photos`, png);
    assert.equal(ok.data.photo.status, "done");
    assert.match(ok.data.result.retake, /Дахин авна уу/);
    assert.equal(ok.data.result.detections[0].name, "Ус 1.5 л", "нэрээр тааруулсан");
    assert.equal(await credits(a.owner), c0 - 3);
    srv.mock.state.vision = null;
  });

  test("3 аргаар тоолох (зураг/facings, хайрцаг, гараар) + idempotency", async () => {
    const lines = (await a.staff.get(`/api/v1/inventory/sessions/${S.id}`)).data.lines;
    const id = (n) => lines.find((l) => l.name === n).productId;
    S.cola = id("Кока-Кола 0.5 л");
    S.water = id("Ус «Ундраа» 0.5 л");
    S.bread = id("Талх «Атар»");
    // кола: зургийн 6 нүүр × гүн 8 × 6 давхар + 2 сул = 290 (систем 288 → +2)
    const c1 = await a.staff.post(`/api/v1/inventory/sessions/${S.id}/counts`, { clientId: "u-cola-1", productId: S.cola, method: "facings", inputs: { f: 6, d: 8, r: 6, l: 2 }, source: "photo", photoId: S.photo, confidence: 0.92 });
    assert.equal(c1.status, 201, c1.text);
    assert.equal(c1.data.count.qty, 290);
    assert.equal(c1.data.line.expected, undefined, "ажилтанд систем харагдахгүй");
    // ус: баркодоор, 26 хайрцаг × 24 + 10 = 634 (систем 639 → −5)
    const c2 = await a.staff.post(`/api/v1/inventory/sessions/${S.id}/counts`, { clientId: "u-water-1", barcode: lines.find((l) => l.productId === S.water).barcode, method: "boxes", inputs: { b: 26, l: 10 }, source: "barcode", profile: { packSize: 24 } });
    assert.equal(c2.status, 201, c2.text);
    assert.equal(c2.data.count.qty, 634);
    // талх: гараар 140 (систем 142 → −2)
    const body = { clientId: "u-bread-1", productId: S.bread, method: "manual", inputs: { q: 140 } };
    assert.equal((await a.staff.post(`/api/v1/inventory/sessions/${S.id}/counts`, body)).status, 201);
    // ижил clientId дахин (сүлжээ тасарсны дараах дахин илгээлт) — давхардахгүй
    const again = await a.staff.post(`/api/v1/inventory/sessions/${S.id}/counts`, body);
    assert.equal(again.status, 200);
    assert.equal(again.data.duplicate, true);
    const hdr = await a.staff.post(`/api/v1/inventory/sessions/${S.id}/counts`, { productId: S.bread, method: "manual", inputs: { q: 140 } }, { headers: { "idempotency-key": "u-bread-1" } });
    assert.equal(hdr.data.duplicate, true, "Idempotency-Key толгой");
    // профайл санагдсан (дараагийн удаа нэг товшилтоор)
    const pf = await a.staff.get(`/api/v1/inventory/products/${S.water}/profile`);
    assert.equal(pf.data.profile.packSize, 24);
    assert.equal(pf.data.profile.method, "boxes");
    // буруу оролт, хэт их тоо
    assert.equal((await a.staff.post(`/api/v1/inventory/sessions/${S.id}/counts`, { clientId: "u-x", productId: S.bread, method: "boxes", inputs: { b: 1 } })).status, 400);
    const huge = await a.staff.post(`/api/v1/inventory/sessions/${S.id}/counts`, { clientId: "u-y", productId: S.bread, method: "manual", inputs: { q: 99999 } });
    assert.equal(huge.status, 422);
    const m = await a.mgr.get(`/api/v1/inventory/sessions/${S.id}`);
    const bread = m.data.lines.find((l) => l.productId === S.bread);
    assert.equal(bread.counted, 140);
    assert.equal(bread.variance, -2);
    assert.equal(bread.level, "ok");
  });

  test("тоолсны дараа ПОС-д 3 талх зарагдав (борлуулалт тооллогын дундуур)", async () => {
    const st = (await a.owner.get("/api/sp/state")).data;
    const s = st.state;
    s.products = s.products.map((p) => (p.id === S.bread ? { ...p, stock: p.stock - 3 } : p));
    const r = await a.owner.put("/api/sp/state", { base: st.rev, state: s });
    assert.equal(r.status, 200, r.text);
    assert.equal(await stockOf(a.owner, "Талх «Атар»"), 139);
  });

  test("илгээх → касс батлах 403 → менежер батлана → үлдэгдэл яг delta-аар; давхар 409; зураг устсан", async () => {
    const sub = await a.staff.patch(`/api/v1/inventory/sessions/${S.id}`, { action: "submit" });
    assert.equal(sub.status, 200, sub.text);
    assert.equal(sub.data.uncounted, S.total - 3);
    assert.equal((await a.staff.post(`/api/v1/inventory/sessions/${S.id}/counts`, { clientId: "late", productId: S.bread, method: "manual", inputs: { q: 1 } })).status, 409);
    assert.equal((await a.staff.post(`/api/v1/inventory/sessions/${S.id}/approve`, {})).status, 403);
    const v = await a.mgr.get(`/api/v1/inventory/sessions/${S.id}/variance`);
    assert.equal(v.status, 200);
    assert.equal(v.data.counted, 3);
    assert.equal(v.data.shortage, 5 * 900 + 2 * 1300, "ус −5×900, талх −2×1300 (өртгөөр)");
    const before = { egg: await stockOf(a.owner, "Өндөг 10 ш") };
    const ap = await a.mgr.post(`/api/v1/inventory/sessions/${S.id}/approve`, {});
    assert.equal(ap.status, 200, ap.text);
    assert.equal(ap.data.status, "applied");
    assert.equal(ap.data.adjusted, 3);
    assert.equal(await stockOf(a.owner, "Кока-Кола 0.5 л"), 290);
    assert.equal(await stockOf(a.owner, "Ус «Ундраа» 0.5 л"), 634);
    assert.equal(await stockOf(a.owner, "Талх «Атар»"), 137, "140 тоолсон − тоолсны дараа зарагдсан 3");
    assert.equal(await stockOf(a.owner, "Өндөг 10 ш"), before.egg, "тоолоогүй бараа өөрчлөгдөхгүй");
    const dbl = await a.mgr.post(`/api/v1/inventory/sessions/${S.id}/approve`, {});
    assert.equal(dbl.status, 409);
    assert.equal(await stockOf(a.owner, "Кока-Кола 0.5 л"), 290, "давхар засвар үгүй");
    assert.equal((await a.mgr.get(`/api/v1/inventory/photos/${S.photo}`)).status, 404, "батлагдмагц зураг устана");
    const audit = (await a.owner.get("/api/sp/state")).data.state.audit.filter((x) => x.action === "Нөөц засав");
    assert.ok(audit.length >= 3, "GePOS аудит");
    const acts = (await a.owner.get("/api/agent/actions")).data.actions;
    assert.ok(acts.some((x) => x.tool === "inventory.approve"));
  });

  test("critical: өөрийн илгээснийг батлахгүй, шалтгаангүй 409 → дахин тоолуулах → батлах", async () => {
    const s = await a.mgr.post("/api/v1/inventory/sessions", { scope: "category", scopeRef: "Хүнс" });
    assert.equal(s.status, 201, s.text);
    const sid = s.data.session.id;
    const egg = s.data.lines.find((l) => l.name === "Өндөг 10 ш").productId;
    await a.mgr.post(`/api/v1/inventory/sessions/${sid}/counts`, { clientId: "e1", productId: egg, method: "manual", inputs: { q: 0 } });
    assert.equal((await a.mgr.patch(`/api/v1/inventory/sessions/${sid}`, { action: "submit" })).status, 200);
    const self = await a.mgr.post(`/api/v1/inventory/sessions/${sid}/approve`, {});
    assert.equal(self.status, 403, "submitter ≠ approver (5 ажилтан)");
    const own = await a.owner.post(`/api/v1/inventory/sessions/${sid}/approve`, {});
    assert.equal(own.status, 409, "critical, шалтгаангүй");
    const rej = await a.owner.post(`/api/v1/inventory/sessions/${sid}/reject`, { reason: "Өндгийг дахин тоол" });
    assert.equal(rej.data.recount, 1);
    const line = (await a.staff.get(`/api/v1/inventory/sessions/${sid}`)).data.lines.find((l) => l.productId === egg);
    assert.equal(line.status, "recount");
    await a.staff.post(`/api/v1/inventory/sessions/${sid}/counts`, { clientId: "e2", productId: egg, method: "manual", inputs: { q: 4 } });
    assert.equal((await a.staff.patch(`/api/v1/inventory/sessions/${sid}`, { action: "submit" })).status, 200);
    const ok = await a.owner.post(`/api/v1/inventory/sessions/${sid}/approve`, {});
    assert.equal(ok.status, 200, ok.text);
    assert.equal(ok.data.adjusted, 0, "дахин тоолоход таарсан");
  });

  test("байршил: ижил тавиурыг дахин авбал СОЛИНО; бараг ижил зураг → анхааруулга (кредитгүй); 60с дотор ирмэгийн давхар; баркод Нэмэх/Солих", async () => {
    const s = await a.staff.post("/api/v1/inventory/sessions", { scope: "category", scopeRef: "Ундаа", ensure: true });
    assert.equal(s.status, 201, s.text);
    const sid = s.data.session.id;
    assert.equal((await a.staff.post("/api/v1/inventory/sessions", { scope: "category", scopeRef: "Ундаа", ensure: true })).data.session.id, sid, "ensure → үргэлжлүүлнэ");
    assert.equal(s.data.nextPlace, "Тавиур 1");
    const up = (fields) => {
      const fd = new FormData();
      fd.append("image", new Blob([png], { type: "image/png" }), "s.png");
      for (const [k, v] of Object.entries(fields)) fd.append(k, v);
      return fetch(`${srv.base}/api/v1/inventory/sessions/${sid}/photos`, { method: "POST", headers: { cookie: a.staff.cookie, origin: srv.base, "x-forwarded-for": a.staff.ip }, body: fd }).then((r) => r.json());
    };
    const confirm = (photo, place, f, d) => {
      const cola = photo.result.detections.find((x) => x.label.startsWith("Coca"));
      return a.staff.post(`/api/v1/inventory/sessions/${sid}/photos/${photo.photo.id}/confirm`, { place, items: [{ productId: cola.productId, f, d, r: 1, confidence: cola.confidence }] });
    };
    const colaLine = async () => (await a.staff.get(`/api/v1/inventory/sessions/${sid}`)).data.lines.find((l) => l.name === "Кока-Кола 0.5 л");
    const p1 = await up({ phash: "ffffffffffffffff" });
    assert.equal(p1.photo.place, "Тавиур 1");
    const c1 = await confirm(p1, "Тавиур 1", 6, 4);
    assert.equal(c1.status, 200, c1.text);
    assert.equal((await colaLine()).counted, 24);
    // дахин илгээх (сүлжээ тасарсан) — ижил үр дүн
    assert.equal((await confirm(p1, "Тавиур 1", 6, 4)).status, 200);
    assert.equal((await colaLine()).counted, 24, "idempotent");
    // бараг ижил зураг → кредит зарцуулахгүй анхааруулна
    const c0 = await credits(a.owner);
    const sim = await up({ phash: "fffffffffffffffe" });
    assert.equal(sim.similar?.place, "Тавиур 1");
    assert.equal(sim.photo, null);
    assert.equal(await credits(a.owner), c0, "анхааруулгад кредит хасагдахгүй");
    // «Солих» → ижил байршилд дахин → өмнөх зургийн тоог солино (24 + 20 биш)
    const p2 = await up({ phash: "fffffffffffffffe", force: "1", place: "Тавиур 1" });
    assert.equal(p2.photo.place, "Тавиур 1");
    const c2 = await confirm(p2, "Тавиур 1", 5, 4);
    assert.equal(c2.data.replaced, 1);
    let line = await colaLine();
    assert.equal(line.counted, 20, "солигдсон, нэмэгдээгүй");
    assert.deepEqual(line.byPlace.map((x) => [x.place, x.qty]), [["Тавиур 1", 20]]);
    assert.equal(line.profile.depth, 4, "гүн санагдсан");
    // өөр байршил (Агуулах), 60с дотор, ирмэг дээр мөн кола → давхар байж магадгүй
    const p3 = await up({ phash: "0000000000000000", place: "Агуулах" });
    const cola3 = p3.result.detections.find((x) => x.label.startsWith("Coca"));
    assert.equal(cola3.dupSuspect?.place, "Тавиур 1");
    assert.deepEqual(cola3.elsewhere.map((x) => [x.place, x.qty]), [["Тавиур 1", 20]]);
    assert.equal(cola3.depth, 4, "байршлын/барааны санасан гүн");
    await confirm(p3, "Агуулах", 2, 10);
    line = await colaLine();
    assert.equal(line.counted, 40, "өөр байршил — нийлбэр");
    assert.deepEqual(line.byPlace.map((x) => [x.place, x.qty]), [["Тавиур 1", 20], ["Агуулах", 20]]);
    // баркод/гараар — ижил байршилд аль хэдийн тоологдсон → асууна
    const body = { productId: line.productId, method: "manual", inputs: { q: 5 }, place: "Агуулах", source: "barcode" };
    const ask = await a.staff.post(`/api/v1/inventory/sessions/${sid}/counts`, { ...body, clientId: "pl-1" });
    assert.equal(ask.status, 200);
    assert.deepEqual([ask.data.conflict?.place, ask.data.conflict?.qty, ask.data.count], ["Агуулах", 20, null]);
    assert.equal((await colaLine()).counted, 40, "асуухад бичигдээгүй");
    const add = await a.staff.post(`/api/v1/inventory/sessions/${sid}/counts`, { ...body, clientId: "pl-2", mode: "add" });
    assert.equal(add.status, 201, add.text);
    assert.equal((await colaLine()).counted, 45, "Нэмэх");
    const repl = await a.staff.post(`/api/v1/inventory/sessions/${sid}/counts`, { ...body, clientId: "pl-3", mode: "replace" });
    assert.equal(repl.status, 201);
    line = await colaLine();
    assert.equal(line.counted, 25, "Солих: Агуулах = 5");
    assert.deepEqual(line.byPlace.map((x) => [x.place, x.qty]), [["Тавиур 1", 20], ["Агуулах", 5]]);
    assert.ok((await a.staff.get(`/api/v1/inventory/sessions/${sid}`)).data.places.includes("Агуулах"));
    // B tenant → 404
    assert.equal((await b.owner.post(`/api/v1/inventory/sessions/${sid}/photos/${p1.photo.id}/confirm`, { items: [] })).status, 404);
    assert.equal((await a.staff.patch(`/api/v1/inventory/sessions/${sid}`, { action: "cancel" })).status, 200);
  });

  test("зургаар бараа бүртгэх → ноорог → батлах → ПОС-д (нөөц 0, mobile); давхар баркод 409", async () => {
    const s = await a.staff.post("/api/v1/inventory/sessions", { scope: "category", scopeRef: "Ундаа" });
    const sid = s.data.session.id;
    const c0 = await credits(a.owner);
    const d = await upload(a.staff, "/api/v1/inventory/drafts", png);
    assert.equal(d.status, 201, JSON.stringify(d.data));
    assert.equal(await credits(a.owner), c0 - 2);
    const f = d.data.draft.fields;
    assert.equal(f.name, "Тест жүүс 0.33 л");
    assert.equal(f.barcode, "4006381333931");
    assert.equal(f.category, "Ундаа");
    const bad = await a.staff.post(`/api/v1/inventory/drafts/${d.data.draft.id}/confirm`, { name: f.name, price: 2500, barcode: "4006381333932" });
    assert.equal(bad.status, 400, "шалгах цифр буруу");
    const ok = await a.staff.post(`/api/v1/inventory/drafts/${d.data.draft.id}/confirm`, { name: f.name, price: 2500, barcode: f.barcode, category: "Ундаа", unit: "pcs", packSize: 24, sessionId: sid, taxCode: "9999999" });
    assert.equal(ok.status, 201, ok.text);
    assert.ok(ok.data.addedToSession);
    const p = (await a.owner.get("/api/sp/state")).data.state.products.find((x) => x.id === ok.data.product.id);
    assert.equal(p.stock, 0);
    assert.equal(p.addedBy, "mobile");
    assert.equal(p.barcode, "4006381333931");
    assert.notEqual(p.bunaCode, "9999999", "БҮНА клиентээс/AI-аас биш, зөвхөн лавлахаас");
    assert.equal((await a.staff.post(`/api/v1/inventory/drafts/${d.data.draft.id}/confirm`, { name: "x", price: 1 })).status, 409);
    const lines = (await a.staff.get(`/api/v1/inventory/sessions/${sid}`)).data.lines;
    assert.ok(lines.some((l) => l.productId === p.id), "тооллогод мөр нэмэгдсэн");
    const d2 = await upload(a.staff, "/api/v1/inventory/drafts", png);
    assert.equal(d2.data.draft.fields.existing?.id, p.id, "ижил баркод — бүртгэлтэй гэж анхааруулна");
    assert.equal((await a.staff.post(`/api/v1/inventory/drafts/${d2.data.draft.id}/confirm`, { name: "Давхар", price: 1, barcode: f.barcode })).status, 409);
    assert.equal((await a.staff.del(`/api/v1/inventory/drafts/${d2.data.draft.id}`)).status, 200);
    // цоорхой: энэ тооллогод зураг алга → хоосон; захиалах санал ажиллана
    assert.equal((await a.staff.get(`/api/v1/inventory/gaps?session=${sid}`)).data.photos, 0);
    const ro = await a.staff.get("/api/v1/inventory/reorder");
    assert.equal(ro.status, 200);
    assert.ok(Array.isArray(ro.data.items));
    assert.equal((await a.staff.patch(`/api/v1/inventory/sessions/${sid}`, { action: "cancel" })).status, 200);
  });

  test("AI хэрэгсэл (MCP): inventory_status, variance_report, reorder; approve_count API түлхүүрээр биш; tenant талбаргүй", async () => {
    const call = async (name, args = {}) => {
      const r = await fetch(`${srv.base}/api/mcp`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${a.key}` }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } }) });
      return (await r.json()).result;
    };
    const list = await fetch(`${srv.base}/api/mcp`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${a.key}` }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }) }).then((r) => r.json());
    const inv = list.result.tools.filter((t) => ["inventory_status", "start_count", "variance_report", "reorder_suggestions", "approve_count"].includes(t.name));
    assert.equal(inv.length, 5);
    for (const t of inv) assert.ok(!Object.keys(t.inputSchema?.properties ?? {}).some((k) => /merchant|tenant|reg_?no/i.test(k)));
    const st = await call("inventory_status");
    assert.ok(!st.isError, JSON.stringify(st));
    const vr = await call("variance_report", { session_no: 1 });
    assert.match(JSON.stringify(vr), /дутагдал/);
    const ap = await call("approve_count", { session_no: 1 });
    assert.ok(ap.isError || /менежер|шийдвэрлэгдсэн/.test(JSON.stringify(ap)), JSON.stringify(ap));
    // B-ийн тооллогын дугаар A-д олдохгүй (A-д №4 байхгүй)
    assert.match(JSON.stringify(await call("variance_report", { session_no: 99 })), /олдсонгүй/);
  });
});
