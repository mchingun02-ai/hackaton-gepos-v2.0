#!/usr/bin/env node
/**
 * Демо мерчантын ЗОХИОМОЛ (seed) өгөгдлийн огноог шилжүүлнэ: хамгийн сүүлийн борлуулалтын өдөр = өнөөдөр
 * болох хэмжээгээр бүх цаг (ISO), огноог (урамшууллын start/end) хэдэн хоногоор урагшлуулна.
 * Seed өгөгдөл үүссэн өдрөөс хойш «өнөөдрийн борлуулалт 0₮» болж харагдахаас сэргийлнэ.
 *   node scripts/demo-refresh-dates.mjs [merchant=6543210]          (SP_DATA_DIR-ийг харна; анхдагч ./data)
 * Ажиллаж буй сервер дараагийн хүсэлтээр шинэ төлвийг уншина (rev нэмэгдэнэ).
 */
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const merchant = process.argv[2] || "6543210";
const file = path.join(process.env.SP_DATA_DIR || path.join(process.cwd(), "data"), "gerege-ai.db");
const db = new DatabaseSync(file);
const row = db.prepare("SELECT rev, json FROM sp_state WHERE merchant = ?").get(merchant);
if (!row) throw new Error(`sp_state алга: ${merchant}`);
const s = JSON.parse(row.json);
const DAY = 86_400_000;
const ub = (d) => new Date(new Date(d).getTime() + 8 * 3600_000).toISOString().slice(0, 10); // Улаанбаатарын өдөр
const last = s.sales.reduce((m, x) => (x.at > m ? x.at : m), "");
const days = Math.round((Date.parse(ub(Date.now())) - Date.parse(ub(last))) / DAY);
if (days <= 0) {
  console.log(`Шилжүүлэх шаардлагагүй (сүүлийн борлуулалт ${ub(last)}).`);
  process.exit(0);
}
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
let n = 0;
const walk = (v, key) => {
  if (typeof v === "string") {
    if (ISO.test(v)) return n++, new Date(Date.parse(v) + days * DAY).toISOString();
    if (DATE.test(v) && (key === "start" || key === "end")) return n++, new Date(Date.parse(v) + days * DAY).toISOString().slice(0, 10);
    return v;
  }
  if (Array.isArray(v)) return v.map((x) => walk(x, key));
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x, k)]));
  return v;
};
const next = walk(s);
db.prepare("UPDATE sp_state SET rev = ?, json = ?, updated_at = ? WHERE merchant = ?").run(row.rev + 1, JSON.stringify(next), Date.now(), merchant);
console.log(`${days} хоногоор шилжүүлэв · ${n} огноо · сүүлийн борлуулалт ${ub(last)} → ${ub(Date.parse(last) + days * DAY)} · rev ${row.rev + 1}`);
