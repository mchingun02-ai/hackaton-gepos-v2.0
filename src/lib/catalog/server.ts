/*
 * Барааны лавлах — серверт.
 *  1) и-Баримтын ББНС-ын хуулбар  data/ebarimt-barcodes.db  (scripts/sync-ebarimt-barcodes.mjs)
 *  2) GePOS-ын нийтлэг сан        data/gepos-catalog.db
 *     Мерчант санд олдоогүй баркодод нэр, ангилал оруулахад энд нэмэгдэнэ.
 *     Зөвхөн баркод, нэр, БҮНА хадгална — үнэ, мерчант хадгалахгүй.
 *  3) БҮНА-гийн нэрс              src/lib/catalog/buna.json (gs1_gs1.xlsx, 3,898 код)
 */
import { DatabaseSync } from "node:sqlite";
import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import BUNA from "./buna.json";

const DATA = path.join(process.cwd(), "data");
const names = BUNA as Record<string, string>;

let eb: DatabaseSync | null | undefined;
let gp: DatabaseSync | undefined;

function ebarimtDb() {
  if (eb === undefined) {
    const f = path.join(DATA, "ebarimt-barcodes.db");
    eb = existsSync(f) ? new DatabaseSync(f) : null;
  }
  return eb;
}

function geposDb() {
  if (!gp) {
    mkdirSync(DATA, { recursive: true });
    gp = new DatabaseSync(path.join(DATA, "gepos-catalog.db"));
    gp.exec(`PRAGMA journal_mode=WAL;
      CREATE TABLE IF NOT EXISTS item (code TEXT PRIMARY KEY, name TEXT NOT NULL, buna TEXT NOT NULL, n INTEGER NOT NULL DEFAULT 1, at TEXT NOT NULL);`);
  }
  return gp;
}

export const bunaName = (code?: string | null) => (code ? names[code] : undefined);
export const isBuna = (code: string) => /^\d{7}$/.test(code) && code in names;

export type Lookup =
  | { found: false; code: string }
  | { found: true; code: string; source: "ebarimt" | "gepos"; name: string; buna: string | null; bunaName?: string; excise: boolean };

export function lookup(code: string): Lookup {
  const db = ebarimtDb();
  const r = db?.prepare("SELECT name, buna, excise FROM barcode WHERE code = ?").get(code) as { name: string; buna: string | null; excise: number } | undefined;
  if (r) return { found: true, code, source: "ebarimt", name: r.name, buna: r.buna, bunaName: bunaName(r.buna), excise: !!r.excise };
  const g = geposDb().prepare("SELECT name, buna FROM item WHERE code = ?").get(code) as { name: string; buna: string } | undefined;
  if (g) return { found: true, code, source: "gepos", name: g.name, buna: g.buna, bunaName: bunaName(g.buna), excise: false };
  return { found: false, code };
}

export function contribute(code: string, name: string, buna: string) {
  if (ebarimtDb()?.prepare("SELECT 1 FROM barcode WHERE code = ?").get(code)) return;
  geposDb()
    .prepare("INSERT INTO item(code,name,buna,at) VALUES(?,?,?,?) ON CONFLICT(code) DO UPDATE SET n = n + 1, at = excluded.at")
    .run(code, name.slice(0, 120), buna, new Date().toISOString());
}

export function status() {
  const db = ebarimtDb();
  if (!db) return { ebarimt: 0, syncedAt: null as string | null, gepos: geposDb().prepare("SELECT COUNT(*) n FROM item").get() };
  const n = (db.prepare("SELECT COUNT(*) n FROM barcode").get() as { n: number }).n;
  const at = (db.prepare("SELECT v FROM meta WHERE k='synced_at'").get() as { v: string } | undefined)?.v ?? null;
  const g = (geposDb().prepare("SELECT COUNT(*) n FROM item").get() as { n: number }).n;
  return { ebarimt: n, syncedAt: at, gepos: g };
}

export function searchBuna(q: string, limit = 30) {
  const t = q.trim().toLowerCase();
  if (t.length < 2) return [];
  const out: { code: string; name: string }[] = [];
  for (const [code, name] of Object.entries(names)) {
    if (name.toLowerCase().includes(t)) out.push({ code, name });
    if (out.length >= limit) break;
  }
  return out;
}

/* ───────── и-Баримт: татвар төлөгчийн мэдээлэл (нийтэд нээлттэй) ───────── */

const EB = "https://api.ebarimt.mn/api/info/check";

export async function taxpayer(regNo: string) {
  const tinR = await fetch(`${EB}/getTinInfo?regNo=${encodeURIComponent(regNo)}`, { cache: "no-store", signal: AbortSignal.timeout(15_000) });
  const tinJ = (await tinR.json()) as { status: number; data?: number | string; msg?: string };
  if (tinJ.status !== 200 || !tinJ.data) return { found: false as const, regNo, msg: tinJ.msg ?? "Олдсонгүй" };
  const tin = String(tinJ.data);
  const infoR = await fetch(`${EB}/getInfo?tin=${tin}`, { cache: "no-store", signal: AbortSignal.timeout(15_000) });
  const infoJ = (await infoR.json()) as {
    status: number;
    data?: { name: string; vatPayer: boolean; cityPayer: boolean; freeProject: boolean; found: boolean; vatpayerRegisteredDate?: string; isGovernment?: boolean };
  };
  const d = infoJ.data;
  if (!d?.found) return { found: false as const, regNo, msg: "ТТД олдсон ч мэдээлэл алга" };
  return {
    found: true as const,
    regNo,
    tin,
    name: d.name,
    vatPayer: d.vatPayer,
    cityPayer: d.cityPayer,
    freeProject: d.freeProject,
    vatSince: d.vatpayerRegisteredDate ?? null,
    isGovernment: !!d.isGovernment,
    checkedAt: new Date().toISOString(),
  };
}
