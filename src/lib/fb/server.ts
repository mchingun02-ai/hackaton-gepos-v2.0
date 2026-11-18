/**
 * Facebook Messenger чат — мерчант бүр өөрийн Page-ээ холбож, порталаас харилцагчтайгаа чатлана.
 * Зөвхөн сервер талд (route handler-ууд) ашиглана. Баримт: docs/FACEBOOK_CHAT.md
 *
 * Урсгал:
 *   1. Портал → /api/fb/connect → Facebook-ийн нэвтрэх цонх (мерчант Page-ээ зөвшөөрнө)
 *   2. Facebook → /api/fb/callback?code → урт хугацаат токен → Page-үүдийн жагсаалт (түр хадгална)
 *   3. Портал Page сонгуулна → POST /api/fb/pages → Page-ийн токеныг шифрлэж хадгалаад webhook-д захиална
 *   4. Харилцагч бичихэд Meta → /api/fb/webhook → Page id-аар мерчантыг олж хадгална
 *   5. Портал /api/fb/threads-аас уншиж, /send-ээр хариулна
 *
 * Токен браузер руу хэзээ ч гарахгүй. Тохиргоо (.env.local): FB_APP_ID, FB_APP_SECRET, FB_VERIFY_TOKEN,
 * (сонголттой) FB_TOKEN_KEY, FB_LOGIN_CONFIG_ID, SP_PUBLIC_URL, FB_GRAPH_VERSION.
 * FB_APP_ID байхгүй бол ДЕМО горим — жинхэнэ Facebook руу хандахгүй, жишээ Page, чатаар ажиллана.
 *
 * Үнэгүй илгээх дүрэм (Meta Send API): харилцагчийн сүүлийн мессежээс 24 цагийн дотор чөлөөтэй;
 * 24 цаг – 7 хоногт HUMAN_AGENT tag-тай (ажилтны гараар бичсэн); 7 хоногоос хойш илгээхгүй.
 */
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { requireTenant } from "@/lib/tenant/auth";
import { errorResponse, fail, HttpError } from "@/lib/tenant/http";

const HOUR = 3_600_000;
export const WINDOW_MS = 24 * HOUR;
export const HUMAN_AGENT_MS = 7 * 24 * HOUR;

/**
 * Page-д хэрэгтэй эрхүүд: Page-ийн жагсаалт, мессеж, webhook захиалах, нэр/зураг унших;
 * comment унших (pages_read_user_content), comment-д хариулах (pages_manage_engagement).
 */
export const SCOPES = ["pages_show_list", "pages_messaging", "pages_manage_metadata", "pages_read_engagement", "pages_read_user_content", "pages_manage_engagement"];
/** Comment-ийн эрхүүд — байхгүй бол Messenger ажиллана, Comment таб «дахин холбоно уу» гэж харуулна */
export const COMMENT_SCOPES = ["pages_read_user_content", "pages_manage_engagement"];
/** standby — Page-д өөр апп (chatbot, AI туслах) мессеж хүлээн авагч байхад манайд энэ төрлөөр ирнэ */
export const FIELDS = "messages,message_echoes,messaging_postbacks,messaging_referrals,message_reads,message_deliveries,standby";
/** feed — Page-ийн пост дээрх comment (нэмэх/засах/устгах) */
export const FEED_FIELDS = `${FIELDS},feed`;

export const cfg = () => ({
  appId: process.env.FB_APP_ID || "",
  secret: process.env.FB_APP_SECRET || "",
  verifyToken: process.env.FB_VERIFY_TOKEN || "",
  configId: process.env.FB_LOGIN_CONFIG_ID || "",
  version: process.env.FB_GRAPH_VERSION || "v23.0",
  // FB_GRAPH_URL — зөвхөн тестэд (mock Graph). Бодит орчинд тохируулахгүй.
  graph: process.env.FB_GRAPH_URL || `https://graph.facebook.com/${process.env.FB_GRAPH_VERSION || "v23.0"}`,
  publicUrl: (process.env.SP_PUBLIC_URL || "").replace(/\/$/, ""),
});
export const isDemo = () => !cfg().appId || !cfg().secret;

export { fail, HttpError };
/** Route handler-ийг ороож алдааг JSON болгоно */
export function handle<A extends unknown[]>(fn: (...a: A) => Promise<Response>) {
  return async (...a: A) => {
    try {
      return await fn(...a);
    } catch (e) {
      if (e instanceof HttpError) return errorResponse(e);
      console.error("[fb]", e);
      return Response.json({ error: "Серверийн алдаа" }, { status: 500 });
    }
  };
}

/* ───────── хадгалалт (SQLite, data/storeplus-fb.db) ───────── */

const g = globalThis as unknown as { __spFbDb?: DatabaseSync };
export function db() {
  if (g.__spFbDb) return g.__spFbDb;
  const dir = process.env.SP_DATA_DIR || path.join(process.cwd(), "data");
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const d = new DatabaseSync(path.join(dir, "storeplus-fb.db"));
  d.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS fb_pages (
      page_id TEXT PRIMARY KEY, merchant TEXT NOT NULL, name TEXT NOT NULL, pic TEXT, token TEXT NOT NULL,
      demo INTEGER NOT NULL DEFAULT 0, subscribed INTEGER NOT NULL DEFAULT 0, connected_by TEXT, connected_at INTEGER NOT NULL);
    CREATE UNIQUE INDEX IF NOT EXISTS fb_pages_merchant ON fb_pages(merchant);
    CREATE TABLE IF NOT EXISTS fb_pending (
      key TEXT PRIMARY KEY, merchant TEXT NOT NULL, pages TEXT NOT NULL, expires INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS fb_threads (
      page_id TEXT NOT NULL, psid TEXT NOT NULL, name TEXT, pic TEXT, last_at INTEGER NOT NULL, last_text TEXT NOT NULL DEFAULT '',
      last_user_at INTEGER, unread INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT 'open', PRIMARY KEY (page_id, psid));
    CREATE TABLE IF NOT EXISTS fb_messages (
      mid TEXT PRIMARY KEY, page_id TEXT NOT NULL, psid TEXT NOT NULL, dir TEXT NOT NULL, text TEXT NOT NULL DEFAULT '',
      attachments TEXT, staff TEXT, tag TEXT, status TEXT NOT NULL, error TEXT, at INTEGER NOT NULL);
    CREATE INDEX IF NOT EXISTS fb_messages_thread ON fb_messages(page_id, psid, at);
    CREATE TABLE IF NOT EXISTS fb_posts (
      post_id TEXT PRIMARY KEY, page_id TEXT NOT NULL, message TEXT NOT NULL DEFAULT '', permalink TEXT, created_at INTEGER NOT NULL);
    CREATE INDEX IF NOT EXISTS fb_posts_page ON fb_posts(page_id, created_at);
    CREATE TABLE IF NOT EXISTS fb_comments (
      comment_id TEXT PRIMARY KEY, page_id TEXT NOT NULL, post_id TEXT NOT NULL, parent_id TEXT, from_id TEXT, from_name TEXT,
      message TEXT NOT NULL DEFAULT '', created_at INTEGER NOT NULL, removed INTEGER NOT NULL DEFAULT 0, staff TEXT, origin TEXT);
    CREATE INDEX IF NOT EXISTS fb_comments_post ON fb_comments(page_id, post_id, created_at);
    CREATE TABLE IF NOT EXISTS fb_page_meta (
      page_id TEXT PRIMARY KEY, scopes TEXT, scopes_at INTEGER, feed_ok INTEGER, feed_error TEXT, feed_at INTEGER, feed_subscribed INTEGER);
  `);
  // Сүүлийн мессеж нь текстгүй (карт/товч/стикер) үед жагсаалтын «сүүлийн текст» хоосорсон хуучин мөрүүдийг засна
  d.exec(`UPDATE fb_threads SET last_text = COALESCE((SELECT CASE WHEN m.text <> '' THEN substr(m.text, 1, 140) ELSE '[Хавсралт]' END FROM fb_messages m
            WHERE m.page_id = fb_threads.page_id AND m.psid = fb_threads.psid AND (m.text <> '' OR m.attachments IS NOT NULL) ORDER BY m.at DESC LIMIT 1), '')
          WHERE last_text = ''`);
  g.__spFbDb = d;
  return d;
}
type Row = Record<string, string | number | null>;
const one = (sql: string, ...a: (string | number | null)[]) => db().prepare(sql).get(...a) as Row | undefined;
const all = (sql: string, ...a: (string | number | null)[]) => db().prepare(sql).all(...a) as Row[];
const run = (sql: string, ...a: (string | number | null)[]) => db().prepare(sql).run(...a);

/* ───────── токен шифрлэлт (AES-256-GCM) ───────── */

const key = () => createHash("sha256").update(process.env.FB_TOKEN_KEY || cfg().secret || "sp-demo-only").digest();
export function seal(plain: string) {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return `v1.${iv.toString("base64url")}.${c.getAuthTag().toString("base64url")}.${enc.toString("base64url")}`;
}
export function unseal(box: string) {
  const [v, iv, tag, enc] = box.split(".");
  if (v !== "v1") throw new Error("токен эвдэрсэн");
  const d = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64url"));
  d.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([d.update(Buffer.from(enc, "base64url")), d.final()]).toString("utf8");
}

/* ───────── мерчантыг таних ───────── */

/**
 * Хүсэлт аль мерчантынх вэ — серверийн session (cookie gp_s)-оос (tenant/auth.ts). `x-sp-merchant` толгой,
 * `?m=` параметрийг АШИГЛАХГҮЙ (РД мэдсэн хэн ч бусдын чатыг уншихаас сэргийлнэ).
 */
export function merchantOf(req: Request): string {
  return requireTenant(req, "dashboard").tenantId;
}

/** Харилцагчийн нэр (Graph profile-оос татсан) */
export const threadName = (pageId: string, psid: string) => (one(`SELECT name FROM fb_threads WHERE page_id = ? AND psid = ?`, pageId, psid)?.name as string | null) ?? null;

export function pageOf(merchant: string) {
  return one(`SELECT * FROM fb_pages WHERE merchant = ?`, merchant);
}
export const pageOr409 = (merchant: string) => pageOf(merchant) ?? fail(409, "Facebook Page холбогдоогүй байна");

/* ───────── Graph API ───────── */

type FbErr = { code?: number; error_subcode?: number; message?: string };
export class GraphError extends Error {
  constructor(public fb: FbErr) {
    super(fb.message || "Graph API алдаа");
  }
}

/** appsecret_proof-той дуудлага (App-д «Require App Secret» асаалттай ч ажиллана) */
export async function graph<T = Record<string, unknown>>(method: string, p: string, token: string, body?: unknown): Promise<T> {
  const c = cfg();
  const u = new URL(c.graph + p);
  u.searchParams.set("access_token", token);
  if (c.secret) u.searchParams.set("appsecret_proof", createHmac("sha256", c.secret).update(token).digest("hex"));
  const r = await fetch(u, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(15_000),
    cache: "no-store",
  });
  const data = (await r.json().catch(() => ({}))) as T & { error?: FbErr };
  if (!r.ok || data.error) throw new GraphError(data.error ?? { message: `Graph API ${r.status}` });
  return data;
}

/** Facebook-ийн алдааг мерчантад ойлгомжтой болгоно */
export function fbError(e: unknown) {
  if (!(e instanceof GraphError)) return e instanceof Error ? e.message : "Facebook-т холбогдож чадсангүй";
  const { code, error_subcode: sub } = e.fb;
  if (code === 10 && sub === 2018278) return "24 цагийн хугацаа дууссан тул илгээж чадсангүй.";
  if (code === 10 || code === 200) return "Facebook энэ үйлдлийг зөвшөөрсөнгүй (эрх эсвэл хугацаа).";
  if (code === 190) return "Facebook-ийн холболт хүчингүй болсон. Page-ээ дахин холбоно уу.";
  if (code === 551) return "Харилцагч одоогоор мессеж хүлээн авах боломжгүй байна.";
  if (code === 613 || code === 4) return "Facebook руу хэт олон хүсэлт явлаа. Түр хүлээгээд дахин оролдоно уу.";
  return `Facebook: ${e.message}`;
}

/** Нэвтрэх холбоосын буцах хаяг — Meta App-ын «Valid OAuth Redirect URIs»-д яг ийм байх ёстой */
export const redirectUri = (req: Request) => `${cfg().publicUrl || new URL(req.url).origin}/api/fb/callback`;

/* ───────── OAuth state (CSRF хамгаалалт) ───────── */

const stateKey = () => createHash("sha256").update(`state:${cfg().secret || "sp-demo-only"}`).digest();
export function signState(merchant: string, nonce: string) {
  const body = Buffer.from(JSON.stringify({ m: merchant, n: nonce, t: Date.now() })).toString("base64url");
  return `${body}.${createHmac("sha256", stateKey()).update(body).digest("base64url")}`;
}
export function readState(state: string, nonce: string | undefined) {
  const [body, sig] = state.split(".");
  if (!body || !sig || !nonce) return null;
  const want = Buffer.from(createHmac("sha256", stateKey()).update(body).digest("base64url"));
  const got = Buffer.from(sig);
  if (want.length !== got.length || !timingSafeEqual(want, got)) return null;
  const s = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as { m: string; n: string; t: number };
  if (s.n !== nonce || Date.now() - s.t > 15 * 60_000) return null;
  return s.m;
}

/* ───────── Page сонголт ───────── */

export type PendingPage = { id: string; name: string; pic?: string; category?: string; canMessage: boolean; token: string };

export function savePending(merchant: string, pages: PendingPage[]) {
  run(`DELETE FROM fb_pending WHERE expires < ?`, Date.now());
  const k = randomBytes(18).toString("base64url");
  run(`INSERT INTO fb_pending (key, merchant, pages, expires) VALUES (?, ?, ?, ?)`, k, merchant, seal(JSON.stringify(pages)), Date.now() + 15 * 60_000);
  return k;
}
export function readPending(k: string, merchant: string) {
  const r = one(`SELECT * FROM fb_pending WHERE key = ? AND merchant = ? AND expires > ?`, k, merchant, Date.now());
  if (!r) fail(410, "Сонголтын хугацаа дууссан. «Facebook холбох»-ыг дахин дарна уу.");
  return JSON.parse(unseal(String(r!.pages))) as PendingPage[];
}
export const dropPending = (k: string) => run(`DELETE FROM fb_pending WHERE key = ?`, k);

export async function connectPage(merchant: string, p: PendingPage, by: string, demo: boolean) {
  let subscribed = 0;
  let feed = 0;
  if (!demo) {
    // Page-ийг манай App-д захиална — эс бөгөөс webhook мессеж ирэхгүй. feed (comment) эрхгүй бол зөвхөн Messenger.
    try {
      await graph("POST", `/${p.id}/subscribed_apps?subscribed_fields=${FEED_FIELDS}`, p.token);
      feed = 1;
    } catch (e) {
      console.warn("[fb] feed subscribe", fbError(e));
      await graph("POST", `/${p.id}/subscribed_apps?subscribed_fields=${FIELDS}`, p.token);
    }
    subscribed = 1;
  }
  const prev = pageOf(merchant);
  if (prev && prev.page_id !== p.id) await disconnect(merchant);
  // Нэг Page нэг мерчантад: өөр мерчантад холбогдсон байсан бол шилжинэ (Page-ийн админ зөвшөөрсөн)
  run(`DELETE FROM fb_pages WHERE page_id = ? AND merchant <> ?`, p.id, merchant);
  run(
    `INSERT INTO fb_pages (page_id, merchant, name, pic, token, demo, subscribed, connected_by, connected_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(page_id) DO UPDATE SET merchant = excluded.merchant, name = excluded.name, pic = excluded.pic, token = excluded.token,
       demo = excluded.demo, subscribed = excluded.subscribed, connected_by = excluded.connected_by, connected_at = excluded.connected_at`,
    p.id,
    merchant,
    p.name,
    p.pic ?? null,
    seal(p.token),
    demo ? 1 : 0,
    subscribed,
    by,
    Date.now(),
  );
  // Шинэ токен — эрх, comment-ийн төлвийг дахин шалгана
  run(`DELETE FROM fb_page_meta WHERE page_id = ?`, p.id);
  run(`INSERT INTO fb_page_meta (page_id, feed_subscribed) VALUES (?, ?)`, p.id, feed);
  commentSync.delete(p.id);
  if (demo) seedDemo(p.id);
  else void syncIfDue(pageOf(merchant)!, 0);
}

export async function disconnect(merchant: string) {
  const p = pageOf(merchant);
  if (!p) return;
  if (!p.demo) {
    try {
      await graph("DELETE", `/${p.page_id}/subscribed_apps`, unseal(String(p.token)));
    } catch (e) {
      console.warn("[fb] unsubscribe", fbError(e));
    }
  }
  run(`DELETE FROM fb_pages WHERE page_id = ?`, p.page_id);
  run(`DELETE FROM fb_messages WHERE page_id = ?`, p.page_id);
  run(`DELETE FROM fb_threads WHERE page_id = ?`, p.page_id);
  run(`DELETE FROM fb_comments WHERE page_id = ?`, p.page_id);
  run(`DELETE FROM fb_posts WHERE page_id = ?`, p.page_id);
  run(`DELETE FROM fb_page_meta WHERE page_id = ?`, p.page_id);
}

/* ───────── Webhook ───────── */

export function validSignature(raw: Buffer, header: string | null) {
  const secret = cfg().secret;
  if (!secret || !header?.startsWith("sha256=")) return false;
  const want = Buffer.from(createHmac("sha256", secret).update(raw).digest("hex"));
  const got = Buffer.from(header.slice(7));
  return want.length === got.length && timingSafeEqual(want, got);
}

const ATT_LABEL: Record<string, string> = { image: "Зураг", video: "Видео", audio: "Дуу", file: "Файл", location: "Байршил", fallback: "Холбоос", template: "Карт", sticker: "Стикер" };
type Att = { type: string; url?: string; title?: string };
const preview = (text: string, atts: Att[]) => (text ? text.slice(0, 140) : atts.length ? `[${atts.map((a) => ATT_LABEL[a.type] ?? "Файл").join(", ")}]` : "");

function touch(pageId: string, psid: string, at: number, text: string, fromUser: boolean, countUnread = true) {
  if (fromUser)
    run(
      `UPDATE fb_threads SET last_at = MAX(last_at, ?), last_text = CASE WHEN ? <> '' THEN ? ELSE last_text END, last_user_at = MAX(COALESCE(last_user_at, 0), ?), unread = unread + ?, status = 'open' WHERE page_id = ? AND psid = ?`,
      at,
      text,
      text,
      at,
      countUnread ? 1 : 0,
      pageId,
      psid,
    );
  // Текстгүй (карт, товч — Conversations API агуулгыг өгдөггүй) мессеж өмнөх «сүүлийн текст»-ийг арилгахгүй
  else run(`UPDATE fb_threads SET last_at = MAX(last_at, ?), last_text = CASE WHEN ? <> '' THEN ? ELSE last_text END WHERE page_id = ? AND psid = ?`, at, text, text, pageId, psid);
}

type FbEvent = {
  sender?: { id?: string };
  recipient?: { id?: string };
  timestamp?: number;
  message?: { mid?: string; text?: string; is_echo?: boolean; app_id?: number | string; referral?: { ref?: string }; attachments?: { type: string; title?: string; payload?: { url?: string; sticker_id?: number } }[] };
  postback?: { mid?: string; title?: string; payload?: string; referral?: { ref?: string } };
  /** m.me/<page>?ref=… холбоосоор орж ирсэн (messaging_referrals) */
  referral?: { ref?: string; source?: string; type?: string };
  read?: { watermark?: number };
  delivery?: { mids?: string[] };
};

/**
 * Нэг webhook үйл явдал. Давхардсан мессежийг (mid) алгасна — Facebook дахин илгээж болно.
 * Буцаах (AI давхаргад — channels.ts fbInbound):
 *   message    — харилцагчийн шинэ текст (ref — m.me холбоосын ref байвал)
 *   echo_other — Page-ийн админ Meta Inbox / өөр аппаас хариулсан (app_id манайх биш) → яриа ажилтанд (§9.2)
 *   referral   — m.me/<page>?ref=… холбоосоор орж ирсэн (туршигч нэмэх урсгал §9.4)
 */
export type Inbound = { merchant: string; psid: string; kind: "message" | "echo_other" | "referral"; text?: string; ref?: string };
export function handleEvent(ev: FbEvent, pageId: string): Inbound | void {
  const page = one(`SELECT page_id, token, demo, merchant FROM fb_pages WHERE page_id = ?`, pageId);
  if (!page) return; // манай мерчантад холбогдоогүй Page
  const at = Number(ev.timestamp) || Date.now();
  if (ev.referral?.ref && ev.sender?.id && !ev.message && !ev.postback) {
    const psid = ev.sender.id;
    if (!one(`SELECT 1 FROM fb_threads WHERE page_id = ? AND psid = ?`, pageId, psid)) {
      run(`INSERT INTO fb_threads (page_id, psid, last_at) VALUES (?, ?, ?)`, pageId, psid, at);
      if (!page.demo) void loadProfile(pageId, psid, unseal(String(page.token)));
    }
    return page.demo ? undefined : { merchant: String(page.merchant), psid, kind: "referral", ref: String(ev.referral.ref).slice(0, 80) };
  }
  if (ev.message?.mid) {
    const m = ev.message;
    const echo = !!m.is_echo;
    const psid = echo ? ev.recipient?.id : ev.sender?.id;
    if (!psid) return;
    const isNew = !one(`SELECT 1 FROM fb_threads WHERE page_id = ? AND psid = ?`, pageId, psid);
    if (isNew) run(`INSERT INTO fb_threads (page_id, psid, last_at) VALUES (?, ?, ?)`, pageId, psid, at);
    // манай илгээсэн мессежийн echo (sendText мөрөө түрүүлж бичсэн) — давхардал
    if (one(`SELECT 1 FROM fb_messages WHERE mid = ?`, m.mid!)) return;
    const atts: Att[] = (m.attachments || []).map((a) => ({ type: a.payload?.sticker_id ? "sticker" : a.type, url: a.payload?.url, title: a.title }));
    const text = String(m.text || "");
    run(
      `INSERT INTO fb_messages (mid, page_id, psid, dir, text, attachments, status, at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      m.mid!,
      pageId,
      psid,
      echo ? "out" : "in",
      text,
      atts.length ? JSON.stringify(atts) : null,
      echo ? "sent" : "received",
      at,
    );
    touch(pageId, psid, at, preview(text, atts), !echo);
    if (isNew && !page.demo) void loadProfile(pageId, psid, unseal(String(page.token)));
    if (page.demo) return;
    // Page-ийн өөр админ Meta Inbox-оос (эсвэл өөр апп) хариулсан — манай App-ын echo биш
    if (echo) return String(m.app_id ?? "") !== cfg().appId ? { merchant: String(page.merchant), psid, kind: "echo_other" } : undefined;
    // AI ажилтан хариулах эсэхийг дуудагч (webhook) шийднэ — зөвхөн харилцагчийн шинэ текст
    if (text.trim()) return { merchant: String(page.merchant), psid, kind: "message", text, ref: m.referral?.ref ? String(m.referral.ref).slice(0, 80) : undefined };
    return;
  }
  if (ev.postback && ev.sender?.id) {
    const psid = ev.sender.id;
    if (!one(`SELECT 1 FROM fb_threads WHERE page_id = ? AND psid = ?`, pageId, psid)) run(`INSERT INTO fb_threads (page_id, psid, last_at) VALUES (?, ?, ?)`, pageId, psid, at);
    const mid = ev.postback.mid || `pb-${psid}-${at}`;
    if (one(`SELECT 1 FROM fb_messages WHERE mid = ?`, mid)) return;
    const text = String(ev.postback.title || ev.postback.payload || "");
    run(`INSERT INTO fb_messages (mid, page_id, psid, dir, text, status, at) VALUES (?, ?, ?, 'in', ?, 'received', ?)`, mid, pageId, psid, text, at);
    touch(pageId, psid, at, text, true);
    const ref = ev.postback.referral?.ref;
    if (ref && !page.demo) return { merchant: String(page.merchant), psid, kind: "referral", ref: String(ref).slice(0, 80) };
    return;
  }
  if (ev.read?.watermark && ev.sender?.id) {
    run(`UPDATE fb_messages SET status = 'read' WHERE page_id = ? AND psid = ? AND dir = 'out' AND status IN ('sent','delivered') AND at <= ?`, pageId, ev.sender.id, Number(ev.read.watermark));
    return;
  }
  for (const mid of ev.delivery?.mids ?? []) run(`UPDATE fb_messages SET status = 'delivered' WHERE mid = ? AND status = 'sent'`, mid);
}

async function loadProfile(pageId: string, psid: string, token: string) {
  try {
    const p = await graph<{ first_name?: string; last_name?: string; profile_pic?: string }>("GET", `/${encodeURIComponent(psid)}?fields=first_name,last_name,profile_pic`, token);
    run(`UPDATE fb_threads SET name = ?, pic = ? WHERE page_id = ? AND psid = ?`, [p.first_name, p.last_name].filter(Boolean).join(" ") || null, p.profile_pic ?? null, pageId, psid);
  } catch (e) {
    console.warn("[fb] profile", fbError(e));
  }
}

/* ───────── Facebook-оос татах (sync) ───────── */

/*
 * Webhook ирэхгүй байсан ч (App хөгжүүлэлтийн горим, өөр апп мессеж хүлээн авагч, tunnel унтарсан г.м.)
 * Page токеноор Conversations API-аас сүүлийн чатуудыг татна. mid-ээр давхардлыг алгасна.
 */
type ConvMsg = {
  id: string;
  message?: string;
  from?: { id: string; name?: string };
  created_time: string;
  sticker?: string;
  shares?: { data?: { link?: string; name?: string }[] };
  attachments?: { data?: { mime_type?: string; name?: string; image_data?: { url?: string }; file_url?: string }[] };
};
type Conv = { participants?: { data: { id: string; name?: string }[] }; messages?: { data: ConvMsg[] } };
const syncState = ((globalThis as unknown as { __spFbSync?: Map<string, number> }).__spFbSync ??= new Map());

export async function syncIfDue(page: Row, minGapMs = 8_000) {
  if (page.demo) return;
  const id = String(page.page_id);
  if (Date.now() - (syncState.get(id) ?? 0) < minGapMs) return;
  syncState.set(id, Date.now());
  try {
    await syncPage(page);
  } catch (e) {
    console.warn("[fb] sync", fbError(e));
  }
}

async function syncPage(page: Row) {
  const pageId = String(page.page_id);
  const since = Number(page.connected_at) || 0;
  const r = await graph<{ data?: Conv[] }>(
    "GET",
    `/${pageId}/conversations?platform=messenger&limit=25&fields=participants,messages.limit(25){id,message,from,created_time,sticker,shares{link,name},attachments{mime_type,name,image_data{url},file_url}}`,
    unseal(String(page.token)),
  );
  for (const c of r.data ?? []) {
    const user = c.participants?.data.find((p) => p.id !== pageId);
    const msgs = (c.messages?.data ?? []).slice().reverse(); // хуучнаас шинэ рүү
    if (!user || !msgs.length) continue;
    const psid = user.id;
    const created = !one(`SELECT 1 FROM fb_threads WHERE page_id = ? AND psid = ?`, pageId, psid);
    if (created)
      run(`INSERT INTO fb_threads (page_id, psid, name, last_at) VALUES (?, ?, ?, ?)`, pageId, psid, user.name ?? null, Date.parse(msgs[0].created_time) || Date.now());
    else if (user.name) run(`UPDATE fb_threads SET name = COALESCE(name, ?) WHERE page_id = ? AND psid = ?`, user.name, pageId, psid);
    for (const m of msgs) {
      if (one(`SELECT 1 FROM fb_messages WHERE mid = ?`, m.id)) continue;
      const fromUser = m.from?.id !== pageId;
      const at = Date.parse(m.created_time) || Date.now();
      const atts: Att[] = (m.attachments?.data ?? []).map((a) => ({ type: a.image_data ? "image" : a.mime_type?.startsWith("video/") ? "video" : a.mime_type?.startsWith("audio/") ? "audio" : "file", url: a.image_data?.url ?? a.file_url, title: a.name }));
      if (m.sticker) atts.push({ type: "sticker", url: m.sticker });
      for (const sh of m.shares?.data ?? []) if (sh.link) atts.push({ type: "fallback", url: sh.link, title: sh.name });
      const text = String(m.message || "");
      run(
        `INSERT INTO fb_messages (mid, page_id, psid, dir, text, attachments, status, at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        m.id,
        pageId,
        psid,
        fromUser ? "in" : "out",
        text,
        atts.length ? JSON.stringify(atts) : null,
        fromUser ? "received" : "sent",
        at,
      );
      // Холбохоос өмнөх хуучин мессежийг «уншаагүй» гэж тоолохгүй
      touch(pageId, psid, at, preview(text, atts), fromUser, at > since);
    }
    // Холбохоос өмнөх хуучин чат «Нээлттэй» жагсаалтыг дүүргэхгүй — «Шийдсэн» болно
    if (created && Date.parse(msgs[msgs.length - 1].created_time) <= since) run(`UPDATE fb_threads SET status = 'done' WHERE page_id = ? AND psid = ?`, pageId, psid);
  }
}

/* ───────── чат ───────── */

export type Window = { state: "open" | "human" | "closed"; until?: number };
export function windowOf(lastUserAt: number | null | undefined, now = Date.now()): Window {
  if (!lastUserAt) return { state: "closed" };
  const age = now - lastUserAt;
  if (age < WINDOW_MS) return { state: "open", until: lastUserAt + WINDOW_MS };
  if (age < HUMAN_AGENT_MS) return { state: "human", until: lastUserAt + HUMAN_AGENT_MS };
  return { state: "closed" };
}

export const threadView = (t: Row) => ({
  psid: String(t.psid),
  name: (t.name as string) || "Facebook хэрэглэгч",
  pic: (t.pic as string) ?? undefined,
  lastAt: Number(t.last_at),
  lastText: String(t.last_text),
  unread: Number(t.unread),
  status: t.status as "open" | "done",
  window: windowOf(t.last_user_at as number | null),
});
export const messageView = (m: Row) => ({
  mid: String(m.mid),
  dir: m.dir as "in" | "out",
  text: String(m.text),
  attachments: m.attachments ? (JSON.parse(String(m.attachments)) as Att[]) : undefined,
  staff: (m.staff as string) ?? undefined,
  tag: (m.tag as string) ?? undefined,
  status: String(m.status),
  error: (m.error as string) ?? undefined,
  at: Number(m.at),
});

export function listThreads(pageId: string, state: string, q: string) {
  const where = state === "unread" ? `AND unread > 0` : state === "done" ? `AND status = 'done'` : state === "open" ? `AND status = 'open'` : "";
  const qq = q.trim().toLowerCase();
  return all(`SELECT * FROM fb_threads WHERE page_id = ? ${where} ORDER BY last_at DESC LIMIT 500`, pageId)
    .map(threadView)
    .filter((t) => !qq || t.name.toLowerCase().includes(qq) || t.lastText.toLowerCase().includes(qq));
}
export function counts(pageId: string) {
  const r = one(`SELECT COALESCE(SUM(unread > 0), 0) AS unread, COALESCE(SUM(status = 'open'), 0) AS open FROM fb_threads WHERE page_id = ?`, pageId);
  return { unread: Number(r?.unread ?? 0), open: Number(r?.open ?? 0) };
}
export const threadOr404 = (pageId: string, psid: string) => one(`SELECT * FROM fb_threads WHERE page_id = ? AND psid = ?`, pageId, psid) ?? fail(404, "Чат олдсонгүй");
export const messagesOf = (pageId: string, psid: string) =>
  all(`SELECT * FROM (SELECT * FROM fb_messages WHERE page_id = ? AND psid = ? ORDER BY at DESC LIMIT 500) ORDER BY at`, pageId, psid).map(messageView);

export async function markRead(page: Row, psid: string) {
  const t = threadOr404(String(page.page_id), psid);
  run(`UPDATE fb_threads SET unread = 0 WHERE page_id = ? AND psid = ?`, page.page_id, psid);
  // Харилцагчид «Seen» харагдана (24 цагийн дотор)
  if (Number(t.unread) > 0 && !page.demo && windowOf(t.last_user_at as number).state === "open")
    graph("POST", "/me/messages", unseal(String(page.token)), { recipient: { id: psid }, sender_action: "mark_seen" }).catch(() => {});
}

export function setStatus(page: Row, psid: string, status: "open" | "done") {
  threadOr404(String(page.page_id), psid);
  run(`UPDATE fb_threads SET status = ? WHERE page_id = ? AND psid = ?`, status, page.page_id, psid);
  return threadView(threadOr404(String(page.page_id), psid));
}

/** AI-ийн илгээлтэд ашиглах ажилтны нэр (fb_messages.staff) */
export const AI_STAFF = "AI ажилтан";
/** Энэ харилцагчид AI өмнө нь хариулж байсан эсэх («Би AI туслах» танилцуулга анхны хариуд л) */
export const aiRepliedBefore = (pageId: string, psid: string) =>
  !!one(`SELECT 1 FROM fb_messages WHERE page_id = ? AND psid = ? AND dir = 'out' AND staff = ? AND status != 'failed' LIMIT 1`, pageId, psid, AI_STAFF);

export type Origin = "ai" | "human";
export const AI_WINDOW_MSG = "24 цаг өнгөрсөн — AI илгээхгүй, ажилтан гараар бичнэ.";

/**
 * Messenger-ээр илгээх (§9.3). `origin`:
 *   human (ажилтан): ≤24ц RESPONSE · 24ц–7 хоног MESSAGE_TAG+HUMAN_AGENT · >7 хоног 409
 *   ai (AI хариу, бөөн илгээлт): зөвхөн ≤24ц RESPONSE; бусад үед 409 — AI HUMAN_AGENT tag ХЭЗЭЭ Ч ашиглахгүй
 */
export async function sendText(page: Row, psid: string, text: string, staff: string, origin: Origin) {
  const pageId = String(page.page_id);
  const t = threadOr404(pageId, psid);
  const body = text.trim();
  if (!body) fail(400, "Хариу хоосон байна");
  if (body.length > 2000) fail(400, "Хариу 2000 тэмдэгтээс хэтэрсэн");
  const w = windowOf(t.last_user_at as number);
  if (origin === "ai" && w.state !== "open") fail(409, AI_WINDOW_MSG, "window");
  if (w.state === "closed") fail(409, "Харилцагчийн сүүлийн мессежээс 7 хоног өнгөрсөн тул Facebook хариу илгээхийг зөвшөөрөхгүй. Харилцагч дахин бичихийг хүлээнэ үү.");
  const tag = origin === "human" && w.state === "human" ? "HUMAN_AGENT" : null;
  const now = Date.now();
  let mid: string | undefined;
  let error: string | undefined;
  if (page.demo) mid = `demo-${randomBytes(8).toString("hex")}`;
  else
    try {
      const req = { recipient: { id: psid }, messaging_type: tag ? "MESSAGE_TAG" : "RESPONSE", ...(tag ? { tag } : {}), message: { text: body } };
      mid = (await graph<{ message_id: string }>("POST", "/me/messages", unseal(String(page.token)), req)).message_id;
    } catch (e) {
      error = fbError(e);
    }
  const rowId = mid || `local-${randomBytes(8).toString("hex")}`;
  // Echo webhook бидний хариунаас түрүүлж ирж болно — тэгвэл ажилтны нэр, tag-ийг нөхнө
  run(
    `INSERT INTO fb_messages (mid, page_id, psid, dir, text, staff, tag, status, error, at) VALUES (?, ?, ?, 'out', ?, ?, ?, ?, ?, ?)
     ON CONFLICT(mid) DO UPDATE SET staff = excluded.staff, tag = excluded.tag`,
    rowId,
    pageId,
    psid,
    body,
    staff,
    tag,
    error ? "failed" : "sent",
    error ?? null,
    now,
  );
  if (error) fail(502, error);
  run(`UPDATE fb_threads SET last_at = ?, last_text = ?, unread = 0 WHERE page_id = ? AND psid = ?`, now, body.slice(0, 140), pageId, psid);
  if (page.demo) demoReply(pageId, psid, rowId);
  return messageView(one(`SELECT * FROM fb_messages WHERE mid = ?`, rowId)!);
}

/* ───────── демо (FB_APP_ID тохируулаагүй үед) ───────── */

export const DEMO_PAGES: Omit<PendingPage, "token">[] = [
  { id: "demo-page-1", name: "Номин минимаркет", category: "Хүнсний дэлгүүр", canMessage: true },
  { id: "demo-page-2", name: "Номин минимаркет — Зайсан салбар", category: "Хүнсний дэлгүүр", canMessage: true },
  { id: "demo-page-3", name: "Миний хувийн блог", category: "Блог", canMessage: false },
];

function seedDemo(pageId: string) {
  run(`DELETE FROM fb_messages WHERE page_id = ?`, pageId);
  run(`DELETE FROM fb_threads WHERE page_id = ?`, pageId);
  const now = Date.now();
  const chats: [string, string, number, [("in" | "out"), string, number][]][] = [
    ["d-1", "Сарангэрэл Б.", 1, [["in", "Сайн байна уу, өнөөдөр хүргэлт хийх үү?", 6]]],
    ["d-2", "Тэмүүлэн Г.", 2, [["in", "Кока-Кола 1.5л хэдэн төгрөг вэ?", 40], ["out", "Сайн байна уу! 4,200₮ байгаа.", 35], ["in", "Баярлалаа, 3-ыг захиалъя", 30]]],
    ["d-3", "Ану Д.", 0, [["in", "Захиалга маань ирлээ, баярлалаа 🙏", 26 * 60], ["out", "Танд баярлалаа!", 26 * 60 - 5]]],
    ["d-4", "Болд Н.", 0, [["in", "Ажлын цаг хэд вэ?", 9 * 24 * 60]]],
  ];
  for (const [psid, name, unread, msgs] of chats) {
    const lastUser = Math.max(...msgs.filter((m) => m[0] === "in").map((m) => now - m[2] * 60_000));
    const last = msgs[msgs.length - 1];
    run(
      `INSERT INTO fb_threads (page_id, psid, name, last_at, last_text, last_user_at, unread, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      pageId,
      psid,
      name,
      now - last[2] * 60_000,
      last[1],
      lastUser,
      unread,
      psid === "d-3" ? "done" : "open",
    );
    msgs.forEach(([dir, text, ago], i) =>
      run(`INSERT INTO fb_messages (mid, page_id, psid, dir, text, status, at) VALUES (?, ?, ?, ?, ?, ?, ?)`, `seed-${pageId}-${psid}-${i}`, pageId, psid, dir, text, dir === "out" ? "read" : "received", now - ago * 60_000),
    );
  }
}

/** Демо: хариу илгээснээс хойш харилцагч «уншаад» хариулна */
function demoReply(pageId: string, psid: string, mid: string) {
  setTimeout(() => run(`UPDATE fb_messages SET status = 'read' WHERE mid = ?`, mid), 1500);
  setTimeout(() => {
    if (!one(`SELECT 1 FROM fb_pages WHERE page_id = ?`, pageId)) return;
    handleEvent({ sender: { id: psid }, recipient: { id: pageId }, timestamp: Date.now(), message: { mid: `demo-in-${randomBytes(6).toString("hex")}`, text: "Ойлголоо, баярлалаа!" } }, pageId);
  }, 4000);
}

/* ───────── Page-ийн comment (feed) ───────── */

/*
 * Пост дээрх comment-ийг webhook (`feed` талбар) ба Graph-аас татаж (syncCommentsIfDue) хадгална.
 * Tenant нь Page-ийн холболтоор (fb_pages.merchant) — route бүр session-ий tenant-ын Page-ийг л уншина.
 * Хариуг зөвхөн ажилтан гараар бичнэ (origin "human"); AI comment-д автоматаар хариулахгүй.
 */
export const COMMENT_PERM_MSG = "Comment унших эрх алга — Тохиргоо → Facebook-ийг дахин холбоно уу (pages_read_user_content, pages_manage_engagement)";
const COMMENT_REPLY_PERM_MSG = "Comment-д хариулах эрх алга — Тохиргоо → Facebook-ийг дахин холбоно уу (pages_manage_engagement)";

/** Graph-ийн эрхийн алдаа (#10 / #200 / #2xx) */
export const isPermissionError = (e: unknown) => e instanceof GraphError && (e.fb.code === 10 || (Number(e.fb.code) >= 200 && Number(e.fb.code) < 300));

/** «2026-11-18T02:59:55+0000» эсвэл unix секунд → ms */
function fbTime(v: unknown): number {
  if (typeof v === "number") return v < 1e12 ? v * 1000 : v;
  const t = Date.parse(String(v ?? "").replace(/([+-]\d\d)(\d\d)$/, "$1:$2"));
  return Number.isFinite(t) ? t : Date.now();
}

function metaOf(pageId: string) {
  return one(`SELECT * FROM fb_page_meta WHERE page_id = ?`, pageId);
}
function setMeta(pageId: string, patch: Record<string, string | number | null>) {
  run(`INSERT INTO fb_page_meta (page_id) VALUES (?) ON CONFLICT(page_id) DO NOTHING`, pageId);
  for (const [k, v] of Object.entries(patch)) run(`UPDATE fb_page_meta SET ${k} = ? WHERE page_id = ?`, v, pageId);
}

/**
 * Page токенд олгосон эрхүүд (debug_token, 10 мин кэш). Унших л хүсэлт.
 * Буцаах: granted — null бол тодорхойгүй (Graph хариу өгөөгүй).
 */
export async function pageScopes(page: Row) {
  const pageId = String(page.page_id);
  if (page.demo || isDemo()) return { granted: SCOPES, required: SCOPES, missing: [] as string[] };
  const m = metaOf(pageId);
  let granted: string[] | null = m?.scopes ? (JSON.parse(String(m.scopes)) as string[]) : null;
  if (!granted || Date.now() - Number(m?.scopes_at ?? 0) > 10 * 60_000) {
    try {
      const c = cfg();
      const u = new URL(`${c.graph}/debug_token`);
      u.searchParams.set("input_token", unseal(String(page.token)));
      u.searchParams.set("access_token", `${c.appId}|${c.secret}`);
      const r = (await (await fetch(u, { cache: "no-store", signal: AbortSignal.timeout(10_000) })).json()) as { data?: { scopes?: string[] } };
      if (Array.isArray(r.data?.scopes)) {
        granted = r.data.scopes;
        setMeta(pageId, { scopes: JSON.stringify(granted), scopes_at: Date.now() });
      }
    } catch (e) {
      console.warn("[fb] scopes", fbError(e));
    }
  }
  return { granted, required: SCOPES, missing: granted ? SCOPES.filter((s) => !granted!.includes(s)) : [] };
}

function upsertPost(pageId: string, postId: string, message: string | null, permalink: string | null, at: number) {
  run(
    `INSERT INTO fb_posts (post_id, page_id, message, permalink, created_at) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(post_id) DO UPDATE SET message = CASE WHEN excluded.message <> '' THEN excluded.message ELSE fb_posts.message END,
       permalink = COALESCE(excluded.permalink, fb_posts.permalink) WHERE fb_posts.page_id = excluded.page_id`,
    postId,
    pageId,
    message ?? "",
    permalink,
    at,
  );
}

type CommentIn = { id: string; postId: string; parentId?: string | null; fromId?: string | null; fromName?: string | null; message: string; at: number };
function upsertComment(pageId: string, c: CommentIn) {
  // Шууд пост руу бичсэн comment-ийн parent нь пост өөрөө — тэгвэл parent хоосон
  const parent = c.parentId && c.parentId !== c.postId ? c.parentId : null;
  run(
    `INSERT INTO fb_comments (comment_id, page_id, post_id, parent_id, from_id, from_name, message, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(comment_id) DO UPDATE SET message = excluded.message, from_name = COALESCE(excluded.from_name, fb_comments.from_name)
       WHERE fb_comments.page_id = excluded.page_id`,
    c.id,
    pageId,
    c.postId,
    parent,
    c.fromId ?? null,
    c.fromName ?? null,
    c.message,
    c.at,
  );
}

export type FeedChange = {
  item?: string;
  verb?: string;
  post_id?: string;
  comment_id?: string;
  parent_id?: string;
  message?: string;
  created_time?: number | string;
  from?: { id?: string; name?: string };
  post?: { id?: string; permalink_url?: string };
  permalink_url?: string;
};

/** Webhook `changes[]` (field = feed) — зөвхөн манай мерчантад холбогдсон Page-д хадгална */
export function handleFeedChange(field: string | undefined, v: FeedChange, pageId: string) {
  if (field !== "feed" || !v) return;
  if (!one(`SELECT 1 FROM fb_pages WHERE page_id = ?`, pageId)) return;
  const postId = String(v.post_id || v.post?.id || "");
  if (!postId) return;
  const at = fbTime(v.created_time);
  if (v.item === "comment" && v.comment_id) {
    const cid = String(v.comment_id);
    if (v.verb === "remove") {
      run(`UPDATE fb_comments SET removed = 1 WHERE comment_id = ? AND page_id = ?`, cid, pageId);
      return;
    }
    if (v.verb !== "add" && v.verb !== "edited") return;
    upsertPost(pageId, postId, null, v.post?.permalink_url ?? null, at);
    upsertComment(pageId, { id: cid, postId, parentId: v.parent_id ?? null, fromId: v.from?.id ?? null, fromName: v.from?.name ?? null, message: String(v.message ?? "").slice(0, 8000), at });
    return;
  }
  if (["post", "status", "photo", "video", "share"].includes(String(v.item))) {
    if (v.verb === "remove") {
      run(`DELETE FROM fb_comments WHERE post_id = ? AND page_id = ?`, postId, pageId);
      run(`DELETE FROM fb_posts WHERE post_id = ? AND page_id = ?`, postId, pageId);
      return;
    }
    if (v.verb === "add" || v.verb === "edited") upsertPost(pageId, postId, String(v.message ?? "").slice(0, 8000), v.permalink_url ?? v.post?.permalink_url ?? null, at);
  }
}

type FeedPost = {
  id: string;
  message?: string;
  created_time: string;
  permalink_url?: string;
  comments?: { data?: { id: string; message?: string; created_time: string; from?: { id: string; name?: string }; parent?: { id: string } }[] };
};
const commentSync = ((globalThis as unknown as { __spFbCSync?: Map<string, number> }).__spFbCSync ??= new Map());

/**
 * Сүүлийн постууд + comment-ийг Graph-аас татна (syncIfDue-тэй ижил хурдны хязгаартай).
 * Эрхийн алдаа (#10/#200) гарвал fb_page_meta.feed_ok = 0 — UI «дахин холбоно уу» гэж харуулна, 5 мин дахин оролдохгүй.
 */
export async function syncCommentsIfDue(page: Row, minGapMs = 20_000) {
  if (page.demo) return;
  const id = String(page.page_id);
  const gap = Number(metaOf(id)?.feed_ok ?? 1) === 0 ? Math.max(minGapMs, 5 * 60_000) : minGapMs;
  if (Date.now() - (commentSync.get(id) ?? 0) < gap) return;
  commentSync.set(id, Date.now());
  try {
    const r = await graph<{ data?: FeedPost[] }>(
      "GET",
      `/${id}/feed?limit=15&fields=id,message,created_time,permalink_url,comments.limit(50){id,message,created_time,from{id,name},parent{id}}`,
      unseal(String(page.token)),
    );
    for (const p of r.data ?? []) {
      upsertPost(id, p.id, p.message ?? "", p.permalink_url ?? null, fbTime(p.created_time));
      for (const c of p.comments?.data ?? [])
        upsertComment(id, { id: c.id, postId: p.id, parentId: c.parent?.id ?? null, fromId: c.from?.id ?? null, fromName: c.from?.name ?? null, message: String(c.message ?? ""), at: fbTime(c.created_time) });
    }
    setMeta(id, { feed_ok: 1, feed_error: null, feed_at: Date.now() });
  } catch (e) {
    setMeta(id, { feed_ok: isPermissionError(e) ? 0 : Number(metaOf(id)?.feed_ok ?? 1), feed_error: fbError(e), feed_at: Date.now() });
    console.warn("[fb] comments sync", fbError(e));
  }
}

export type CommentView = { id: string; parentId: string | null; from: { id: string | null; name: string }; fromPage: boolean; message: string; at: number; staff?: string; removed: boolean; replies: CommentView[] };

/** Пост тус бүрээр бүлэглэсэн comment (шинэ идэвхтэй пост эхэнд) + эрхийн төлөв */
export async function listComments(page: Row) {
  const pageId = String(page.page_id);
  const scopes = await pageScopes(page);
  const m = metaOf(pageId);
  const readOk = m?.feed_ok == null ? null : Number(m.feed_ok) === 1;
  const missingRead = scopes.granted ? !scopes.granted.includes("pages_read_user_content") : false;
  const missingReply = scopes.granted ? !scopes.granted.includes("pages_manage_engagement") : false;
  const needsPermission = readOk === false || missingRead;
  const posts = all(`SELECT * FROM fb_posts WHERE page_id = ? ORDER BY created_at DESC LIMIT 30`, pageId).map((p) => {
    const rows = all(`SELECT * FROM fb_comments WHERE page_id = ? AND post_id = ? ORDER BY created_at LIMIT 500`, pageId, p.post_id);
    const view = (c: Row): CommentView => ({
      id: String(c.comment_id),
      parentId: (c.parent_id as string) ?? null,
      from: { id: (c.from_id as string) ?? null, name: (c.from_name as string) || (c.from_id === pageId ? String(page.name) : "Facebook хэрэглэгч") },
      fromPage: c.from_id === pageId,
      message: c.removed ? "" : String(c.message),
      at: Number(c.created_at),
      staff: (c.staff as string) ?? undefined,
      removed: !!c.removed,
      replies: [],
    });
    const top: CommentView[] = [];
    const byId = new Map<string, CommentView>();
    for (const r of rows) byId.set(String(r.comment_id), view(r));
    for (const c of byId.values()) {
      const parent = c.parentId ? byId.get(c.parentId) : undefined;
      if (parent) parent.replies.push(c);
      else top.push(c);
    }
    const last = rows.length ? Number(rows[rows.length - 1].created_at) : Number(p.created_at);
    return { id: String(p.post_id), message: String(p.message), permalink: (p.permalink as string) ?? null, at: Number(p.created_at), lastAt: Math.max(last, Number(p.created_at)), comments: top, count: rows.length };
  });
  posts.sort((a, b) => b.lastAt - a.lastAt);
  return {
    posts,
    permission: {
      read: readOk === null ? (missingRead ? false : null) : readOk && !missingRead,
      reply: scopes.granted ? !missingReply : null,
      needsPermission,
      message: needsPermission ? COMMENT_PERM_MSG : missingReply ? COMMENT_REPLY_PERM_MSG : null,
      granted: scopes.granted,
      missing: scopes.missing,
      error: (m?.feed_error as string) ?? null,
      checkedAt: (m?.feed_at as number) ?? null,
    },
    feedSubscribed: m?.feed_subscribed == null ? null : Number(m.feed_subscribed) === 1,
  };
}

/**
 * Comment-д ажилтан гараар хариулна (`POST /{comment-id}/comments`). Зөвхөн тухайн tenant-ын Page-ийн comment.
 * Хариулт-д хариулахад Facebook нэг түвшин л зөвшөөрдөг тул эх comment руу бичнэ.
 */
export async function replyComment(page: Row, commentId: string, text: string, staff: string, origin: Origin) {
  if (origin !== "human") fail(403, "Comment-д AI автоматаар хариулахгүй — зөвхөн ажилтан");
  const pageId = String(page.page_id);
  const c = one(`SELECT * FROM fb_comments WHERE comment_id = ? AND page_id = ?`, commentId, pageId) ?? fail(404, "Comment олдсонгүй");
  if (c.removed) fail(409, "Энэ comment устгагдсан байна");
  const body = text.trim();
  if (!body) fail(400, "Хариу хоосон байна");
  if (body.length > 2000) fail(400, "Хариу 2000 тэмдэгтээс хэтэрсэн");
  const target = String(c.parent_id || c.comment_id);
  let id: string;
  if (page.demo) id = `demo-c-${randomBytes(8).toString("hex")}`;
  else
    try {
      id = (await graph<{ id: string }>("POST", `/${encodeURIComponent(target)}/comments`, unseal(String(page.token)), { message: body })).id;
    } catch (e) {
      if (isPermissionError(e)) fail(403, COMMENT_REPLY_PERM_MSG, "needs_permission");
      return fail(502, fbError(e));
    }
  upsertComment(pageId, { id, postId: String(c.post_id), parentId: target, fromId: pageId, fromName: String(page.name), message: body, at: Date.now() });
  run(`UPDATE fb_comments SET staff = ?, origin = ? WHERE comment_id = ? AND page_id = ?`, staff, origin, id, pageId);
  console.info("[fb] comment reply", { page: pageId, comment: commentId, staff });
  return { id, parentId: target, message: body, staff };
}
