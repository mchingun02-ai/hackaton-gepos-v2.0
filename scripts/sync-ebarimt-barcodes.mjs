#!/usr/bin/env node
/*
 * и-Баримтын Бараа бүртгэлийн нэгдсэн сан (ББНС)-г серверт хуулж хадгална.
 *
 * Эх: GET https://api.ebarimt.mn/api/info/check/barcode/all?page=&size=200[&date=YYYY-MM-DD]
 *   мөр бүр = [баркод, нэр, огноо, БҮНА 7 оронтой код, stockQR тэмдэглэгээ[]]
 * Сервис нэг баркодоор хайх боломж өгдөггүй тул бүтнээр нь хуулж, өдөр бүр
 * `--since` (date параметр)-ээр зөвхөн өөрчлөлтийг нэмж татна.
 *
 *   node scripts/sync-ebarimt-barcodes.mjs            # бүтнээр
 *   node scripts/sync-ebarimt-barcodes.mjs --since 2026-11-01
 */
import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import path from "node:path";

const BASE = "https://api.ebarimt.mn/api/info/check/barcode/all";
const SIZE = 200; // сервисийн дээд хязгаар
const PAR = 6;
const sinceIdx = process.argv.indexOf("--since");
const since = sinceIdx > 0 ? process.argv[sinceIdx + 1] : null;

const dir = path.join(process.cwd(), "data");
mkdirSync(dir, { recursive: true });
const db = new DatabaseSync(path.join(dir, "ebarimt-barcodes.db"));
db.exec(`
  PRAGMA journal_mode=WAL;
  CREATE TABLE IF NOT EXISTS barcode (
    code TEXT PRIMARY KEY, name TEXT NOT NULL, buna TEXT, date TEXT, excise INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT);
`);
const put = db.prepare(
  "INSERT INTO barcode(code,name,buna,date,excise) VALUES(?,?,?,?,?) ON CONFLICT(code) DO UPDATE SET name=excluded.name,buna=excluded.buna,date=excluded.date,excise=excluded.excise",
);

async function page(p, tries = 4) {
  const url = `${BASE}?page=${p}&size=${SIZE}${since ? `&date=${since}` : ""}`;
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(60_000) });
      const j = await r.json();
      if (!Array.isArray(j.content)) throw new Error(j.msg ?? "content алга");
      return j;
    } catch (e) {
      if (i === tries - 1) throw e;
      await new Promise((res) => setTimeout(res, 1500 * (i + 1)));
    }
  }
}

function save(rows) {
  db.exec("BEGIN");
  for (const r of rows) {
    const [code, name, date, buna, qr] = r;
    if (!code || !name) continue;
    put.run(String(code).trim(), String(name).trim(), buna ? String(buna) : null, date ?? null, Array.isArray(qr) && qr.length ? 1 : 0);
  }
  db.exec("COMMIT");
}

const first = await page(0);
const total = first.totalPages;
save(first.content);
console.log(`Нийт ${first.totalElements} бичлэг, ${total} хуудас`);
let next = 1;
let done = 1;
async function worker() {
  while (next < total) {
    const p = next++;
    const j = await page(p);
    save(j.content);
    if (++done % 50 === 0) console.log(`${done}/${total}`);
  }
}
await Promise.all(Array.from({ length: PAR }, worker));
const n = db.prepare("SELECT COUNT(*) n FROM barcode").get().n;
db.prepare("INSERT INTO meta(k,v) VALUES('synced_at',?) ON CONFLICT(k) DO UPDATE SET v=excluded.v").run(new Date().toISOString());
console.log(`Дууслаа: санд ${n} баркод`);
