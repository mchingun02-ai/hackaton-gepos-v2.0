// Бодит Qwen (qwen3.6-plus) дээр тавиурын тооллогын нарийвчлал — 3 тавиур + 1 ноорог (4 дуудлага)
import { readFileSync, writeFileSync } from "node:fs";
const ROOT = process.argv[2];
const { src } = await import(`${ROOT}/tests/helpers/ts.mjs`);
const P = await src("lib/inventory/prompts");
const M = await src("lib/inventory/match");
const core = await src("lib/sp/core");
const products = core.freshState().products.map((p) => ({ id: p.id, name: p.name, barcodes: p.barcode ? [p.barcode] : [], category: p.categoryId }));
const { cands, alias } = M.aliasList(products);
const MAP = { "cola-500ml": "Кока-Кола 0.5 л", "water-500ml": "Ус «Ундраа» 0.5 л", "juice-1l": "Жүүс 1 л", "milk-1l": "Сүү 1 л «Сүү ХК»", chocolate: "Шоколад «Алтан тариа»", cookies: "Жигнэмэг", "oil-1l": "Ургамлын тос 1 л", "flour-2kg": "Гурил 2 кг", "tea-100g": "Цай 100 г", coffee: "Кофе 3-in-1, 20 ш", bread: "Талх «Атар»", "eggs-10": "Өндөг 10 ш", "yogurt-500g": "Тараг 500 г" };
const truth = JSON.parse(readFileSync("/tmp/aiemp/vision/truth.json", "utf8"));
const url = process.env.AI_BASE_URL.replace(/\/$/, "") + "/chat/completions";
const model = process.env.AI_VISION_MODEL || "qwen3.6-plus";
async function ask(system, img, text) {
  const t0 = Date.now();
  const body = { model, temperature: 0, enable_thinking: false, max_tokens: 1500, response_format: { type: "json_object" }, messages: [{ role: "system", content: system }, { role: "user", content: [{ type: "image_url", image_url: { url: `data:image/jpeg;base64,${img.toString("base64")}` } }, { type: "text", text }] }] };
  const r = await fetch(url, { method: "POST", headers: { Authorization: `Bearer ${process.env.DASHSCOPE_API_KEY}`, "Content-Type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(120_000) });
  const j = await r.json();
  return { status: r.status, ms: Date.now() - t0, content: j.choices?.[0]?.message?.content ?? null, usage: j.usage, error: j.error?.message };
}
const out = { model, at: new Date().toISOString(), shelves: {} };
for (const k of ["A", "B", "C"]) {
  const img = readFileSync(`/tmp/aiemp/vision/shelf${k}.jpg`);
  const r = await ask(P.SHELF_SYSTEM, img, P.shelfUser(cands));
  const rec = { status: r.status, ms: r.ms, usage: r.usage, error: r.error, raw: r.content };
  try {
    const parsed = P.parseShelf(r.content ?? "", new Set(alias.keys()));
    const det = parsed.items.map((it) => ({ ...it, match: M.matchOne(it, products, alias) }));
    const got = {};
    for (const d of det) if (d.match.productId) got[d.match.productId] = (got[d.match.productId] ?? 0) + d.facings;
    rec.rows = Object.entries(truth[k]).map(([img, n]) => {
      const p = products.find((x) => x.name === MAP[img]);
      const g = got[p.id] ?? 0;
      return { product: p.name, truth: n, ai: g, abs: Math.abs(g - n) };
    });
    const truthIds = new Set(Object.keys(truth[k]).map((i) => products.find((x) => x.name === MAP[i]).id));
    rec.falsePositives = det.filter((d) => d.match.productId && !truthIds.has(d.match.productId)).map((d) => ({ label: d.label, as: products.find((x) => x.id === d.match.productId)?.name, facings: d.facings }));
    rec.unmatched = det.filter((d) => !d.match.productId).map((d) => ({ label: d.label, facings: d.facings }));
    rec.gaps = parsed.gaps;
    rec.quality = parsed.quality;
    rec.bboxes = det.filter((d) => d.bbox).length + "/" + det.length;
  } catch (e) {
    rec.parseError = String(e);
  }
  out.shelves[k] = rec;
  console.log(k, r.status, r.ms + "ms", JSON.stringify(rec.rows ?? rec.parseError ?? r.error));
}
// Prompt B — нэг барааны зураг
const milk = readFileSync(`${ROOT}/public/products/milk-1l.png`);
const cats = ["Хүнс", "Ундаа", "Чихэр", "Ахуй", "Эрүүл мэнд"];
const body = { model, temperature: 0, enable_thinking: false, max_tokens: 800, response_format: { type: "json_object" }, messages: [{ role: "system", content: P.DRAFT_SYSTEM }, { role: "user", content: [{ type: "image_url", image_url: { url: `data:image/png;base64,${milk.toString("base64")}` } }, { type: "text", text: P.draftUser(cats) }] }] };
const t0 = Date.now();
const r = await fetch(url, { method: "POST", headers: { Authorization: `Bearer ${process.env.DASHSCOPE_API_KEY}`, "Content-Type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(120_000) });
const j = await r.json();
const raw = j.choices?.[0]?.message?.content;
let draft = null;
try { draft = P.parseDraft(raw, cats); } catch (e) { draft = { error: String(e) }; }
out.draft = { status: r.status, ms: Date.now() - t0, raw, parsed: draft, usage: j.usage };
console.log("draft", r.status, JSON.stringify(draft));
writeFileSync("/tmp/aiemp/vision/result.json", JSON.stringify(out, null, 1));
