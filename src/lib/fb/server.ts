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

/** Page-д хэрэгтэй эрхүүд: Page-ийн жагсаалт, мессеж, webhook захиалах, нэр/зураг унших */
export const SCOPES = ["pages_show_list", "pages_messaging", "pages_manage_metadata", "pages_read_engagement"];
/** standby — Page-д өөр апп (chatbot, AI туслах) мессеж хүлээн авагч байхад манайд энэ төрлөөр ирнэ */
export const FIELDS = "messages,message_echoes,messaging_postbacks,messaging_referrals,message_reads,message_deliveries,standby";

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
  `);
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
  if (!demo) {
    // Page-ийг манай App-д захиална — эс бөгөөс webhook мессеж ирэхгүй
    await graph("POST", `/${p.id}/subscribed_apps?subscribed_fields=${FIELDS}`, p.token);
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
      `UPDATE fb_threads SET last_at = MAX(last_at, ?), last_text = ?, last_user_at = MAX(COALESCE(last_user_at, 0), ?), unread = unread + ?, status = 'open' WHERE page_id = ? AND psid = ?`,
      at,
      text,
      at,
      countUnread ? 1 : 0,
      pageId,
      psid,
    );
  else run(`UPDATE fb_threads SET last_at = MAX(last_at, ?), last_text = ? WHERE page_id = ? AND psid = ?`, at, text, pageId, psid);
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
type ConvMsg = { id: string; message?: string; from?: { id: string; name?: string }; created_time: string; attachments?: { data?: { mime_type?: string; name?: string; image_data?: { url?: string }; file_url?: string }[] } };
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
    `/${pageId}/conversations?platform=messenger&limit=25&fields=participants,messages.limit(25){id,message,from,created_time,attachments{mime_type,name,image_data{url},file_url}}`,
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
