/**
 * AI ажилтны өгөгдлийн сан — SQLite (data/gerege-ai.db). Зөвхөн сервер талд.
 *
 *   sp_state      — Store Plus-ын төлөв (бараа, борлуулалт, харилцагч…) мерчант бүрээр, rev-тэй
 *   kb_docs/chunks— мэдлэгийн сан (Qwen text-embedding-ээр векторжуулсан)
 *   contacts      — AI-ийн ярианаас цуглуулсан харилцагчийн карт
 *   conversations — FB, вэб чат, дуудлага, захирлын тушаал
 *   messages      — ярианы мөр бүр (tool дуудлага meta-д)
 *   tickets       — хүсэлт, гомдол
 *   actions       — AI-ийн хийсэн үйлдэл бүр (аудит, баталгаажуулалт)
 *   wallet/invoices/usage — урьдчилсан төлбөр (QPay), хэрэглээ
 *   settings      — AI-ийн тохиргоо, сувгууд
 *   api_keys      — MCP / API түлхүүр (sha256, scopes, revoked_at)
 *   tenants, sessions, pairings, idempotency — түрээслэгч, нэвтрэлт (docs/ARCHITECTURE.md §3.5)
 *   c_*, webhooks, outbox — гуравдагч ПОС (§4.3) · inv_* — тооллого (§5.1) · kb_jobs — KB auto (§8)
 */
import { randomBytes } from "node:crypto";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { TenantId } from "@/lib/tenant/context";

const g = globalThis as unknown as { __geregeAiDb?: DatabaseSync; __geregeAiSchema?: number };

/** Схемийн хувилбар — өөрчлөгдвөл (HMR-ийн үед ч) migrate() дахин ажиллана. Бүх алхам idempotent. */
const SCHEMA_V = 4;

export function db() {
  if (g.__geregeAiDb && g.__geregeAiSchema === SCHEMA_V) return g.__geregeAiDb;
  let d = g.__geregeAiDb;
  if (!d) {
    const dir = process.env.SP_DATA_DIR || path.join(process.cwd(), "data");
    mkdirSync(dir, { recursive: true, mode: 0o700 });
    d = new DatabaseSync(path.join(dir, "gerege-ai.db"));
  }
  migrate(d);
  g.__geregeAiDb = d;
  g.__geregeAiSchema = SCHEMA_V;
  return d;
}

/** Багана байхгүй бол нэмнэ (хуучин DB дээр дахин ажиллуулахад алдаагүй) */
function addCol(d: DatabaseSync, table: string, col: string, def: string) {
  const cols = d.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  if (cols.some((c) => c.name === col)) return;
  try {
    d.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${def}`);
  } catch (e) {
    // зэрэг асаалтад өөр процесс түрүүлж нэмсэн байж болно
    if (!/duplicate column/i.test(e instanceof Error ? e.message : "")) throw e;
  }
}

/** Санамсаргүй [a-z0-9] мөр (tenants.public_id, widget kid) */
export function rid(n: number) {
  const a = "abcdefghijklmnopqrstuvwxyz0123456789";
  const b = randomBytes(n);
  let s = "";
  for (let i = 0; i < n; i++) s += a[b[i] % a.length];
  return s;
}

function migrate(d: DatabaseSync) {
  d.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA busy_timeout = 5000;
    CREATE TABLE IF NOT EXISTS sp_state (merchant TEXT PRIMARY KEY, rev INTEGER NOT NULL, json TEXT NOT NULL, updated_at INTEGER NOT NULL);

    CREATE TABLE IF NOT EXISTS kb_docs (id TEXT PRIMARY KEY, merchant TEXT NOT NULL, title TEXT NOT NULL, kind TEXT NOT NULL,
      source TEXT, chars INTEGER NOT NULL DEFAULT 0, chunks INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS kb_chunks (id TEXT PRIMARY KEY, doc_id TEXT NOT NULL, merchant TEXT NOT NULL, idx INTEGER NOT NULL,
      text TEXT NOT NULL, emb BLOB NOT NULL);
    CREATE INDEX IF NOT EXISTS kb_chunks_m ON kb_chunks(merchant);

    CREATE TABLE IF NOT EXISTS contacts (id TEXT PRIMARY KEY, merchant TEXT NOT NULL, name TEXT, phone TEXT, email TEXT,
      customer_id TEXT, channels TEXT NOT NULL DEFAULT '{}', summary TEXT, interests TEXT NOT NULL DEFAULT '[]',
      tags TEXT NOT NULL DEFAULT '[]', sentiment TEXT, address TEXT, last_at INTEGER NOT NULL, created_at INTEGER NOT NULL);
    CREATE INDEX IF NOT EXISTS contacts_m ON contacts(merchant, last_at);

    CREATE TABLE IF NOT EXISTS conversations (id TEXT PRIMARY KEY, merchant TEXT NOT NULL, channel TEXT NOT NULL, ext_id TEXT,
      contact_id TEXT, status TEXT NOT NULL DEFAULT 'ai', title TEXT, last_text TEXT, last_at INTEGER NOT NULL, created_at INTEGER NOT NULL);
    CREATE UNIQUE INDEX IF NOT EXISTS conv_ext ON conversations(merchant, channel, ext_id);
    CREATE INDEX IF NOT EXISTS conv_m ON conversations(merchant, last_at);

    CREATE TABLE IF NOT EXISTS messages (id TEXT PRIMARY KEY, conv_id TEXT NOT NULL, role TEXT NOT NULL, text TEXT NOT NULL DEFAULT '',
      meta TEXT, at INTEGER NOT NULL);
    CREATE INDEX IF NOT EXISTS messages_c ON messages(conv_id, at);

    CREATE TABLE IF NOT EXISTS tickets (id TEXT PRIMARY KEY, merchant TEXT NOT NULL, no INTEGER NOT NULL, kind TEXT NOT NULL,
      title TEXT NOT NULL, body TEXT, status TEXT NOT NULL DEFAULT 'open', priority TEXT NOT NULL DEFAULT 'normal',
      contact_id TEXT, conv_id TEXT, assignee TEXT, resolution TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
    CREATE INDEX IF NOT EXISTS tickets_m ON tickets(merchant, status, created_at);

    CREATE TABLE IF NOT EXISTS actions (id TEXT PRIMARY KEY, merchant TEXT NOT NULL, conv_id TEXT, tool TEXT NOT NULL, args TEXT NOT NULL,
      result TEXT, status TEXT NOT NULL, actor TEXT NOT NULL, summary TEXT, at INTEGER NOT NULL);
    CREATE INDEX IF NOT EXISTS actions_m ON actions(merchant, at);

    CREATE TABLE IF NOT EXISTS wallet (merchant TEXT PRIMARY KEY, credits INTEGER NOT NULL DEFAULT 0, plan TEXT, expires_at INTEGER);
    CREATE TABLE IF NOT EXISTS invoices (id TEXT PRIMARY KEY, merchant TEXT NOT NULL, plan TEXT NOT NULL, amount INTEGER NOT NULL,
      credits INTEGER NOT NULL, qpay_id TEXT, qr_text TEXT, qr_image TEXT, short_url TEXT, urls TEXT, status TEXT NOT NULL,
      payment_id TEXT, created_at INTEGER NOT NULL, paid_at INTEGER);
    CREATE TABLE IF NOT EXISTS usage (id INTEGER PRIMARY KEY AUTOINCREMENT, merchant TEXT NOT NULL, kind TEXT NOT NULL, credits INTEGER NOT NULL,
      model TEXT, tokens_in INTEGER, tokens_out INTEGER, ref TEXT, at INTEGER NOT NULL);
    CREATE INDEX IF NOT EXISTS usage_m ON usage(merchant, at);

    CREATE TABLE IF NOT EXISTS settings (merchant TEXT PRIMARY KEY, json TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS api_keys (hash TEXT PRIMARY KEY, merchant TEXT NOT NULL, label TEXT NOT NULL, prefix TEXT NOT NULL, created_at INTEGER NOT NULL, last_used INTEGER);

    /* ── §3.5 түрээслэгч, нэвтрэлт ── */
    CREATE TABLE IF NOT EXISTS tenants (id TEXT PRIMARY KEY, public_id TEXT NOT NULL UNIQUE, name TEXT NOT NULL,
      pos_kind TEXT NOT NULL DEFAULT 'gepos', status TEXT NOT NULL DEFAULT 'active', created_at INTEGER NOT NULL,
      widget_kid TEXT NOT NULL DEFAULT '');
    CREATE TABLE IF NOT EXISTS sessions (hash TEXT PRIMARY KEY, merchant TEXT NOT NULL, staff_id TEXT, name TEXT, role TEXT NOT NULL,
      device TEXT, created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL, last_seen INTEGER);
    CREATE INDEX IF NOT EXISTS sessions_m ON sessions(merchant, expires_at);
    CREATE TABLE IF NOT EXISTS pairings (code TEXT PRIMARY KEY, merchant TEXT NOT NULL, created_by TEXT, expires_at INTEGER NOT NULL, used_at INTEGER);
    /* ── §4A.2 түнш (гуравдагч ПОС компани, ж: Dayansoft) — олон tenant үүсгэнэ, tenant-ын өгөгдөлд ХАНДАХГҮЙ ── */
    CREATE TABLE IF NOT EXISTS partners (id TEXT PRIMARY KEY, slug TEXT NOT NULL UNIQUE, name TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'active', sandbox INTEGER NOT NULL DEFAULT 0,
      brand TEXT NOT NULL DEFAULT '{}', frame_origins TEXT NOT NULL DEFAULT '[]', webhook_url TEXT, webhook_secret TEXT,
      wallet_credits INTEGER NOT NULL DEFAULT 0, rev_share_pct REAL, created_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS partner_keys (hash TEXT PRIMARY KEY, partner_id TEXT NOT NULL, label TEXT NOT NULL, prefix TEXT NOT NULL, created_at INTEGER NOT NULL, last_used INTEGER, revoked_at INTEGER);
    CREATE TABLE IF NOT EXISTS embed_jti (jti TEXT PRIMARY KEY, partner_id TEXT NOT NULL, merchant TEXT NOT NULL, expires_at INTEGER NOT NULL, used_at INTEGER);
    CREATE TABLE IF NOT EXISTS partner_audit (id INTEGER PRIMARY KEY AUTOINCREMENT, partner_id TEXT NOT NULL, action TEXT NOT NULL, merchant TEXT, detail TEXT, at INTEGER NOT NULL);
    /* ── §4B өгөгдлийн эзэмшил: tenant-ын DEK (KEK-ээр ороосон), агуулгагүй хандалтын аудит ── */
    CREATE TABLE IF NOT EXISTS tenant_keys (merchant TEXT PRIMARY KEY, wrapped_dek TEXT NOT NULL, kek_id TEXT NOT NULL, created_at INTEGER NOT NULL, destroyed_at INTEGER);
    CREATE TABLE IF NOT EXISTS access_log (id INTEGER PRIMARY KEY AUTOINCREMENT, merchant TEXT, partner_id TEXT, at INTEGER NOT NULL, actor_kind TEXT NOT NULL,
      actor_id TEXT, action TEXT NOT NULL, resource TEXT, count INTEGER, request_id TEXT);
    CREATE INDEX IF NOT EXISTS access_log_m ON access_log(merchant, at);
    CREATE INDEX IF NOT EXISTS access_log_p ON access_log(partner_id, at);
    CREATE TABLE IF NOT EXISTS idempotency (merchant TEXT NOT NULL, key TEXT NOT NULL, status INTEGER, body TEXT, at INTEGER NOT NULL, PRIMARY KEY (merchant, key));

    /* ── §4.3 Connector (гуравдагч ПОС) ── */
    CREATE TABLE IF NOT EXISTS c_products (merchant TEXT NOT NULL, id TEXT NOT NULL, ext_id TEXT, sku TEXT, barcodes TEXT NOT NULL DEFAULT '[]', name TEXT NOT NULL,
      brand TEXT, category TEXT, unit TEXT NOT NULL DEFAULT 'pcs', price INTEGER NOT NULL, cost INTEGER, active INTEGER NOT NULL DEFAULT 1,
      image_url TEXT, tax_code TEXT, updated_at INTEGER NOT NULL, PRIMARY KEY (merchant, id));
    CREATE UNIQUE INDEX IF NOT EXISTS c_products_ext ON c_products(merchant, ext_id);
    CREATE TABLE IF NOT EXISTS c_barcodes (merchant TEXT NOT NULL, barcode TEXT NOT NULL, product_id TEXT NOT NULL, PRIMARY KEY (merchant, barcode));
    CREATE TABLE IF NOT EXISTS c_stock (merchant TEXT NOT NULL, product_id TEXT NOT NULL, location TEXT NOT NULL DEFAULT 'main', qty REAL NOT NULL, min_qty REAL NOT NULL DEFAULT 0,
      updated_at INTEGER NOT NULL, PRIMARY KEY (merchant, product_id, location));
    CREATE TABLE IF NOT EXISTS c_sales (merchant TEXT NOT NULL, id TEXT NOT NULL, ext_id TEXT NOT NULL, at INTEGER NOT NULL, channel TEXT, lines TEXT NOT NULL, total INTEGER NOT NULL,
      method TEXT, customer_id TEXT, status TEXT NOT NULL, PRIMARY KEY (merchant, id));
    CREATE UNIQUE INDEX IF NOT EXISTS c_sales_ext ON c_sales(merchant, ext_id);
    CREATE INDEX IF NOT EXISTS c_sales_at ON c_sales(merchant, at);
    CREATE TABLE IF NOT EXISTS c_customers (merchant TEXT NOT NULL, id TEXT NOT NULL, ext_id TEXT, phone TEXT, name TEXT, opt_in INTEGER NOT NULL DEFAULT 0, points INTEGER, PRIMARY KEY (merchant, id));
    CREATE TABLE IF NOT EXISTS c_adjustments (merchant TEXT NOT NULL, id TEXT NOT NULL, product_id TEXT NOT NULL, delta REAL NOT NULL, reason TEXT NOT NULL, ref TEXT, by TEXT,
      status TEXT NOT NULL DEFAULT 'pending', at INTEGER NOT NULL, acked_at INTEGER, PRIMARY KEY (merchant, id));
    CREATE TABLE IF NOT EXISTS webhooks (merchant TEXT NOT NULL, id TEXT NOT NULL, url TEXT NOT NULL, secret TEXT NOT NULL, events TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1, PRIMARY KEY (merchant, id));
    CREATE TABLE IF NOT EXISTS outbox (id INTEGER PRIMARY KEY AUTOINCREMENT, merchant TEXT NOT NULL, event TEXT NOT NULL, payload TEXT NOT NULL, tries INTEGER NOT NULL DEFAULT 0,
      next_at INTEGER NOT NULL, done_at INTEGER);
    CREATE INDEX IF NOT EXISTS outbox_due ON outbox(done_at, next_at);

    /* ── §5.1 тооллого ── */
    CREATE TABLE IF NOT EXISTS inv_profiles (merchant TEXT NOT NULL, product_id TEXT NOT NULL, method TEXT NOT NULL DEFAULT 'facings',
      depth REAL, pack_size REAL, unit_weight_g REAL, tare_g REAL, unit_thickness_mm REAL, shelf_life_days INTEGER, lead_days INTEGER,
      updated_at INTEGER NOT NULL, PRIMARY KEY (merchant, product_id));
    CREATE TABLE IF NOT EXISTS inv_sessions (id TEXT PRIMARY KEY, merchant TEXT NOT NULL, no INTEGER NOT NULL, name TEXT NOT NULL, scope TEXT NOT NULL DEFAULT 'all',
      scope_ref TEXT, blind INTEGER NOT NULL DEFAULT 1, status TEXT NOT NULL, created_by TEXT NOT NULL, created_at INTEGER NOT NULL,
      submitted_by TEXT, submitted_at INTEGER, decided_by TEXT, decided_at INTEGER, note TEXT);
    CREATE INDEX IF NOT EXISTS inv_sessions_m ON inv_sessions(merchant, status, created_at);
    CREATE TABLE IF NOT EXISTS inv_lines (merchant TEXT NOT NULL, session_id TEXT NOT NULL, product_id TEXT NOT NULL, name TEXT NOT NULL, barcode TEXT, unit TEXT,
      price INTEGER, cost INTEGER, expected_qty REAL NOT NULL, system_qty_at_count REAL, counted_qty REAL, variance REAL, level TEXT,
      status TEXT NOT NULL DEFAULT 'pending', PRIMARY KEY (merchant, session_id, product_id));
    CREATE TABLE IF NOT EXISTS inv_counts (id TEXT PRIMARY KEY, merchant TEXT NOT NULL, session_id TEXT NOT NULL, product_id TEXT NOT NULL, method TEXT NOT NULL,
      inputs TEXT NOT NULL, qty REAL NOT NULL, source TEXT NOT NULL, photo_id TEXT, confidence REAL, place TEXT, by TEXT NOT NULL, at INTEGER NOT NULL, voided_at INTEGER);
    CREATE INDEX IF NOT EXISTS inv_counts_s ON inv_counts(merchant, session_id, product_id);
    CREATE TABLE IF NOT EXISTS inv_photos (id TEXT PRIMARY KEY, merchant TEXT NOT NULL, session_id TEXT, kind TEXT NOT NULL,
      path TEXT NOT NULL, w INTEGER, h INTEGER, status TEXT NOT NULL, model TEXT, result TEXT, error TEXT, by TEXT NOT NULL, at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS inv_adjustments (id TEXT PRIMARY KEY, merchant TEXT NOT NULL, session_id TEXT NOT NULL, product_id TEXT NOT NULL, before REAL NOT NULL,
      delta REAL NOT NULL, after REAL NOT NULL, value INTEGER, status TEXT NOT NULL, approved_by TEXT NOT NULL, at INTEGER NOT NULL);
    CREATE INDEX IF NOT EXISTS inv_adj_m ON inv_adjustments(merchant, at);
    CREATE TABLE IF NOT EXISTS inv_drafts (id TEXT PRIMARY KEY, merchant TEXT NOT NULL, photo_id TEXT NOT NULL, fields TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'draft',
      product_id TEXT, by TEXT NOT NULL, at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS inv_batches (id TEXT PRIMARY KEY, merchant TEXT NOT NULL, product_id TEXT NOT NULL, expiry TEXT NOT NULL, qty REAL, photo_id TEXT, at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS inv_settings (merchant TEXT PRIMARY KEY, json TEXT NOT NULL, updated_at INTEGER NOT NULL);  -- зөрүүний босго (§5.5)

    /* ── §8 мэдлэгийн сангийн автомат баяжуулалт ── */
    CREATE TABLE IF NOT EXISTS kb_jobs (merchant TEXT NOT NULL, auto_key TEXT NOT NULL, due_at INTEGER NOT NULL, reason TEXT, PRIMARY KEY (merchant, auto_key));
  `);

  // §3.5 — хуучин хүснэгтэд шинэ баганууд
  addCol(d, "api_keys", "scopes", `TEXT NOT NULL DEFAULT '["mcp"]'`);
  addCol(d, "api_keys", "revoked_at", "INTEGER");
  addCol(d, "messages", "merchant", "TEXT");
  addCol(d, "usage", "channel", "TEXT");
  addCol(d, "usage", "feature", "TEXT");
  addCol(d, "usage", "assistant", "TEXT");
  addCol(d, "tenants", "widget_kid", "TEXT NOT NULL DEFAULT ''");
  // §3.5 / §4A — түншийн tenant, нөхцөл зөвшөөрөл
  addCol(d, "tenants", "partner_id", "TEXT");
  addCol(d, "tenants", "ext_merchant_id", "TEXT");
  addCol(d, "tenants", "reg_no", "TEXT");
  addCol(d, "tenants", "terms_at", "INTEGER");
  addCol(d, "tenants", "terms_by", "TEXT");
  addCol(d, "api_keys", "issued_by", "TEXT");
  addCol(d, "api_keys", "partner_id", "TEXT");
  addCol(d, "sessions", "via", "TEXT");
  addCol(d, "invoices", "partner_id", "TEXT");
  addCol(d, "outbox", "partner_id", "TEXT");
  // §4A.2 нэмэлт
  addCol(d, "partners", "mode", "TEXT NOT NULL DEFAULT 'live'");
  addCol(d, "partners", "connector_url", "TEXT");
  addCol(d, "partners", "connector_secret", "TEXT");
  addCol(d, "partners", "retention", "TEXT");
  addCol(d, "partners", "kms_unwrap_url", "TEXT");
  // §4B.4 — мерчантын зөвшөөрөл (түншид экспорт), мерчантын хадгалах хугацааны богиносголт
  addCol(d, "tenants", "export_consent_at", "INTEGER");
  addCol(d, "tenants", "retention", "TEXT");
  addCol(d, "outbox", "last_status", "INTEGER");
  // §8
  addCol(d, "kb_docs", "status", "TEXT NOT NULL DEFAULT 'published'");
  addCol(d, "kb_docs", "auto_key", "TEXT");
  addCol(d, "kb_docs", "content_hash", "TEXT");
  addCol(d, "kb_docs", "provenance", "TEXT");
  // тооллого: зургийн байршил (Тавиур 1, Агуулах …) ба ойролцоо зураг илрүүлэх dHash
  addCol(d, "inv_photos", "place", "TEXT");
  addCol(d, "inv_photos", "phash", "TEXT");
  addCol(d, "kb_docs", "refreshed_at", "INTEGER");
  addCol(d, "kb_docs", "valid_until", "INTEGER");
  addCol(d, "kb_docs", "audience", "TEXT NOT NULL DEFAULT 'customer'");
  d.exec(`
    CREATE INDEX IF NOT EXISTS messages_m ON messages(merchant, conv_id, at);
    CREATE INDEX IF NOT EXISTS kb_docs_m ON kb_docs(merchant, kind, created_at);
    CREATE INDEX IF NOT EXISTS invoices_m ON invoices(merchant, created_at);
    CREATE INDEX IF NOT EXISTS usage_mk ON usage(merchant, kind, at);
    CREATE UNIQUE INDEX IF NOT EXISTS kb_docs_auto ON kb_docs(merchant, auto_key) WHERE auto_key IS NOT NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS tenants_partner_ext ON tenants(partner_id, ext_merchant_id) WHERE partner_id IS NOT NULL;
    CREATE INDEX IF NOT EXISTS tenants_partner ON tenants(partner_id, status);
    CREATE INDEX IF NOT EXISTS partner_keys_p ON partner_keys(partner_id);
    CREATE INDEX IF NOT EXISTS outbox_m ON outbox(merchant, id);
  `);

  // Backfill: мессеж бүрт ярианы мерчант (яриагүй өнчин мөрийг устгана — хэнд ч харагдахгүй)
  d.exec(`UPDATE messages SET merchant = (SELECT c.merchant FROM conversations c WHERE c.id = messages.conv_id) WHERE merchant IS NULL`);
  d.exec(`DELETE FROM messages WHERE merchant IS NULL`);
  // Backfill: sp_state-тэй мерчант бүрт tenants мөр (public_id = 12 тэмдэгт санамсаргүй)
  const missing = d
    .prepare(`SELECT s.merchant, json_extract(s.json, '$.merchant.name') AS name FROM sp_state s LEFT JOIN tenants t ON t.id = s.merchant WHERE t.id IS NULL`)
    .all() as { merchant: string; name: string | null }[];
  const ins = d.prepare(`INSERT OR IGNORE INTO tenants (id, public_id, name, pos_kind, status, created_at, widget_kid) VALUES (?, ?, ?, 'gepos', 'active', ?, ?)`);
  for (const m of missing) ins.run(m.merchant, rid(12), String(m.name || m.merchant).slice(0, 120), Date.now(), rid(8));
  d.exec(`UPDATE tenants SET widget_kid = lower(hex(randomblob(4))) WHERE widget_kid = ''`);
}

export type Row = Record<string, string | number | null | Uint8Array>;
export type Arg = string | number | null | Uint8Array;
/**
 * Түрээслэгчгүй (raw) query. ЗӨВХӨН src/lib/tenant/** (raw.ts-ээр) ашиглана — бусад код `ctx.db` (tdb)-ээр.
 */
export const one = <T = Row>(sql: string, ...a: Arg[]) => db().prepare(sql).get(...a) as T | undefined;
export const all = <T = Row>(sql: string, ...a: Arg[]) => db().prepare(sql).all(...a) as T[];
export const run = (sql: string, ...a: Arg[]) => db().prepare(sql).run(...a);

export const id = (p: string) => `${p}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
export const json = <T>(s: unknown, d: T): T => {
  if (typeof s !== "string" || !s) return d;
  try {
    return JSON.parse(s) as T;
  } catch {
    return d;
  }
};

/* ───────── шууд мэдэгдэл (SSE) ───────── */

type Listener = (ev: { type: string; rev?: number; data?: unknown }) => void;
const gl = globalThis as unknown as { __geregeAiBus?: Map<string, Set<Listener>> };
const bus = () => (gl.__geregeAiBus ??= new Map());

/** Мерчантын нээлттэй дэлгэцүүдэд үйл явдал түгээнэ (sp = Store Plus төлөв, ai = AI ажилтан). */
export function emit(merchant: TenantId, ev: { type: string; rev?: number; data?: unknown }) {
  bus().get(merchant)?.forEach((f: Listener) => {
    try {
      f(ev);
    } catch {
      /* хаагдсан холболт */
    }
  });
}
export function listen(merchant: TenantId, f: Listener) {
  const m = bus();
  if (!m.has(merchant)) m.set(merchant, new Set());
  m.get(merchant)!.add(f);
  return () => m.get(merchant)?.delete(f);
}

/** SSE хариу — үйл явдал бүрийг `data:` болгож урсгана, 20 сек тутам ping */
export function sse(merchant: TenantId, req: Request, pick: (ev: { type: string; rev?: number; data?: unknown }) => string | null, first?: string) {
  const enc = new TextEncoder();
  let stop = () => {};
  const stream = new ReadableStream({
    start(c) {
      const send = (s: string) => {
        try {
          c.enqueue(enc.encode(s));
        } catch {
          stop();
        }
      };
      if (first) send(`data: ${first}\n\n`);
      const off = listen(merchant, (ev) => {
        const d = pick(ev);
        if (d !== null) send(`data: ${d}\n\n`);
      });
      const t = setInterval(() => send(`: ping\n\n`), 20_000);
      stop = () => {
        off();
        clearInterval(t);
        try {
          c.close();
        } catch {
          /* хаагдсан */
        }
      };
      req.signal.addEventListener("abort", () => stop());
    },
    cancel() {
      stop();
    },
  });
  return new Response(stream, { headers: { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive" } });
}
