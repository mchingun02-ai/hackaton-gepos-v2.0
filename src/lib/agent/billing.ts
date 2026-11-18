/**
 * Урьдчилсан төлбөр — мерчант эхлээд QPay-ээр багц худалдаж авна, дараа нь AI ажиллана.
 * Кредит: AI-ийн чат хариулт 1, захирлын тушаал 2, дуудлагын 1 минут 5.
 * Кредит дуусвал AI харилцагчид хариулахаа зогсоож, яриаг ажилтанд шилжүүлнэ.
 *
 * QPay v2 (sandbox): QPAY_URL, QPAY_USERNAME, QPAY_PASSWORD, QPAY_INVOICE_CODE.
 * Анхдагч нь QPay-ийн нийтэд зарласан sandbox (TEST_MERCHANT).
 */
import type { TenantContext } from "@/lib/tenant/context";
import { enqueuePartnerEvent } from "@/lib/tenant/outbox";
import { emit, id } from "./db";

type Cx = TenantContext;

export const COST = { chat: 1, command: 2, voiceMinute: 5 } as const;

export type PlanDef = { id: string; name: string; price: number; credits: number; days: number; note: string; popular?: boolean };
export const PLANS: PlanDef[] = [
  { id: "start", name: "Эхлэл", price: 49_000, credits: 1_000, days: 30, note: "Жижиг кофе шоп, дэлгүүр · ~1,000 чат хариулт эсвэл 200 мин дуудлага" },
  { id: "business", name: "Бизнес", price: 129_000, credits: 3_000, days: 30, note: "Өдөрт 100 орчим харилцагч · FB + дуудлага + захирлын тушаал", popular: true },
  { id: "pro", name: "Про", price: 299_000, credits: 8_000, days: 30, note: "Олон салбартай · бүх суваг, хамгийн хямд нэгж үнэ" },
  { id: "topup", name: "Нэмэлт цэнэглэлт", price: 10_000, credits: 200, days: 0, note: "Багцын хугацаанд нэмж авах кредит" },
];
export const planOf = (pid: string) => PLANS.find((p) => p.id === pid);

export class PayError extends Error {
  status: number;
  constructor(message: string, status = 402) {
    super(message);
    this.status = status;
  }
}

export type Wallet = { credits: number; plan: string | null; expires_at: number | null };
export function wallet(ctx: Cx): Wallet {
  const w = ctx.db.one<Wallet>(`SELECT credits, plan, expires_at FROM wallet WHERE merchant = :tenant`);
  if (!w) return { credits: 0, plan: null, expires_at: null };
  if (w.expires_at && w.expires_at < Date.now() && w.credits > 0) {
    ctx.db.run(`UPDATE wallet SET credits = 0 WHERE merchant = :tenant`);
    return { ...w, credits: 0 };
  }
  return w;
}
export const canSpend = (ctx: Cx, credits: number) => wallet(ctx).credits >= credits;

/**
 * Урьдчилж нөөцлөх (§6): кредитийг ЭХЛЭЭД хасна — зэрэг хүсэлтүүд ижил кредитийг давхар зарцуулахгүй.
 * Ажил амжилттай бол settle(), алдаа гарвал refund(). Хүрэхгүй бол PayError (402).
 */
export type Reservation = { id: number; credits: number; kind: string; done: boolean };
/** Хэрэглээний хэмжээс (§7): суваг, үйлдэл, туслах. Өгөөгүй бол kind + principal-аас гаргана. */
export type UsageDims = { channel?: UsageChannel; feature?: string; assistant?: string };
export const CHANNELS = ["web", "fb", "voice", "director", "mcp", "inventory", "system"] as const;
export type UsageChannel = (typeof CHANNELS)[number];
const FEATURE_OF: Record<string, string> = { chat: "reply", voice: "voice_minute", command: "command", inv_photo: "shelf_photo", inv_draft: "product_draft", kb_auto: "kb_auto" };
export function dimsOf(ctx: Cx, kind: string, d: UsageDims = {}): Required<Omit<UsageDims, "assistant">> & { assistant: string | null } {
  const p = ctx.principal;
  const channel: UsageChannel =
    d.channel ??
    (kind.startsWith("inv_") ? "inventory" : kind === "voice" ? "voice" : kind === "command" ? "director" : p.kind === "visitor" ? p.channel : p.kind === "webhook" ? (p.source === "fb" ? "fb" : "system") : p.kind === "api_key" ? "mcp" : p.kind === "session" ? "director" : "system");
  return { channel, feature: (d.feature ?? FEATURE_OF[kind] ?? kind).slice(0, 32), assistant: d.assistant?.slice(0, 32) ?? null };
}
export function reserve(ctx: Cx, kind: string, credits: number, ref?: string, dims?: UsageDims): Reservation {
  wallet(ctx); // хугацаа дууссан кредитийг тэглэнэ
  const r = ctx.db.run(`UPDATE wallet SET credits = credits - ? WHERE merchant = :tenant AND credits >= ?`, credits, credits);
  if (!Number(r.changes)) throw new PayError("AI ажилтны кредит дууссан байна. Багц цэнэглэнэ үү.");
  const d = dimsOf(ctx, kind, dims);
  const u = ctx.db.run(
    `INSERT INTO usage (merchant, kind, credits, ref, at, channel, feature, assistant) VALUES (:tenant, ?, ?, ?, ?, ?, ?, ?)`,
    kind,
    credits,
    ref ?? null,
    Date.now(),
    d.channel,
    d.feature,
    d.assistant,
  );
  emit(ctx.tenantId, { type: "ai", data: { kind: "wallet" } });
  notifyLevel(ctx);
  return { id: Number(u.lastInsertRowid), credits, kind, done: false };
}
/** Нөөцийг эцэслэнэ (ref-ийг яриатай холбож болно) */
export function settle(ctx: Cx, r: Reservation, ref?: string) {
  if (r.done) return;
  r.done = true;
  if (ref) ctx.db.run(`UPDATE usage SET ref = ? WHERE id = ? AND merchant = :tenant`, ref, r.id);
}
/** Алдаа гарсан — нөөцөлсөн кредитийг буцаана, хэрэглээний мөрийг устгана */
export function refund(ctx: Cx, r: Reservation) {
  if (r.done) return;
  r.done = true;
  ctx.db.run(`UPDATE wallet SET credits = credits + ? WHERE merchant = :tenant`, r.credits);
  ctx.db.run(`DELETE FROM usage WHERE id = ? AND merchant = :tenant`, r.id);
  emit(ctx.tenantId, { type: "ai", data: { kind: "wallet" } });
}

/* ───────── QPay ───────── */

const qp = () => ({
  url: (process.env.QPAY_URL || "https://merchant-sandbox.qpay.mn").replace(/\/$/, ""),
  user: process.env.QPAY_USERNAME || "TEST_MERCHANT",
  pass: process.env.QPAY_PASSWORD || "123456",
  code: process.env.QPAY_INVOICE_CODE || "TEST_INVOICE",
  publicUrl: process.env.SP_PUBLIC_URL || "",
});
export const qpaySandbox = () => qp().url.includes("sandbox");

const gt = globalThis as unknown as { __qpayTok?: { token: string; exp: number } };
async function token() {
  if (gt.__qpayTok && gt.__qpayTok.exp > Date.now() + 60_000) return gt.__qpayTok.token;
  const c = qp();
  const r = await fetch(`${c.url}/v2/auth/token`, {
    method: "POST",
    headers: { Authorization: `Basic ${Buffer.from(`${c.user}:${c.pass}`).toString("base64")}` },
    signal: AbortSignal.timeout(20_000),
  });
  if (!r.ok) throw new PayError(`QPay нэвтрэлт амжилтгүй (${r.status})`, 502);
  const j = (await r.json()) as { access_token: string; expires_in: number };
  gt.__qpayTok = { token: j.access_token, exp: j.expires_in > 1e12 ? j.expires_in : j.expires_in > 1e9 ? j.expires_in * 1000 : Date.now() + 50 * 60_000 };
  return j.access_token;
}

async function qpost<T>(path: string, body: unknown): Promise<T> {
  const r = await fetch(`${qp().url}${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${await token()}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20_000),
  });
  const t = await r.text();
  if (!r.ok) throw new PayError(`QPay ${r.status}: ${t.slice(0, 200)}`, 502);
  return JSON.parse(t) as T;
}

export type Invoice = {
  id: string;
  payment_id?: string | null;
  plan: string;
  amount: number;
  credits: number;
  qr_text: string | null;
  qr_image: string | null;
  short_url: string | null;
  urls: string | null;
  status: "pending" | "paid" | "cancelled";
  created_at: number;
  paid_at: number | null;
};

export async function createInvoice(ctx: Cx, planId: string, origin: string) {
  // Хакатон: QPay зөвхөн sandbox. Production QPay (бодит данс) руу санамсаргүй QR үүсгэхгүй.
  if (!qpaySandbox() && process.env.QPAY_ALLOW_PRODUCTION !== "yes") throw new PayError("QPay зөвхөн sandbox орчинд ажиллана (QPAY_URL)", 503);
  const p = planOf(planId);
  if (!p) throw new PayError("Багц олдсонгүй", 400);
  const inv = id("inv");
  const cb = `${qp().publicUrl || origin}/api/agent/billing/callback?inv=${inv}`;
  const r = await qpost<{ invoice_id: string; qr_text: string; qr_image: string; qPay_shortUrl: string; urls: { name: string; logo: string; link: string }[] }>("/v2/invoice", {
    invoice_code: qp().code,
    sender_invoice_no: inv,
    invoice_receiver_code: ctx.tenantId.slice(0, 40) || "terminal",
    invoice_description: `Gerege AI ажилтан — ${p.name} багц (${p.credits} кредит)`,
    amount: p.price,
    callback_url: cb,
  });
  ctx.db.run(
    `INSERT INTO invoices (id, merchant, plan, amount, credits, qpay_id, qr_text, qr_image, short_url, urls, status, created_at, partner_id)
     VALUES (?, :tenant, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, (SELECT partner_id FROM tenants WHERE id = :tenant))`,
    inv,
    p.id,
    p.price,
    p.credits,
    r.invoice_id,
    r.qr_text,
    r.qr_image,
    r.qPay_shortUrl,
    JSON.stringify((r.urls ?? []).map((u) => ({ name: u.name, logo: u.logo, link: u.link }))),
    Date.now(),
  );
  return invoiceView(ctx, inv)!;
}

export const invoiceView = (ctx: Cx, inv: string) =>
  ctx.db.one<Invoice>(`SELECT id, plan, amount, credits, qr_text, qr_image, short_url, urls, status, payment_id, created_at, paid_at FROM invoices WHERE id = ? AND merchant = :tenant`, inv);
export const invoices = (ctx: Cx) =>
  ctx.db.all<Invoice>(`SELECT id, plan, amount, credits, NULL qr_text, NULL qr_image, short_url, NULL urls, status, payment_id, created_at, paid_at FROM invoices WHERE merchant = :tenant ORDER BY created_at DESC LIMIT 30`);

/** QPay-ээс төлөгдсөн эсэхийг шалгаж, төлөгдсөн бол кредитийг нэг удаа нэмнэ. */
export async function checkInvoice(ctx: Cx, inv: string) {
  const row = ctx.db.one<{ qpay_id: string; status: string; plan: string; credits: number; amount: number }>(`SELECT qpay_id, status, plan, credits, amount FROM invoices WHERE id = ? AND merchant = :tenant`, inv);
  if (!row) throw new PayError("Нэхэмжлэх олдсонгүй", 404);
  if (row.status !== "pending") return invoiceView(ctx, inv)!;
  const r = await qpost<{ count: number; paid_amount?: number; rows: { payment_id: string; payment_status: string; payment_amount: string | number }[] }>("/v2/payment/check", {
    object_type: "INVOICE",
    object_id: row.qpay_id,
    offset: { page_number: 1, page_limit: 100 },
  });
  let paid = r.rows?.find((x) => x.payment_status === "PAID");
  if (!paid) {
    // Нэхэмжлэхийн төлөвийг ч шалгана (зарим орчинд payment/check хоосон буцдаг)
    const iv = await fetch(`${qp().url}/v2/invoice/${row.qpay_id}`, { headers: { Authorization: `Bearer ${await token()}` }, signal: AbortSignal.timeout(20_000) })
      .then((x) => (x.ok ? (x.json() as Promise<{ invoice_status?: string; payments?: { payment_id: string; payment_status: string; payment_amount: string | number }[] }>) : null))
      .catch(() => null);
    if (iv?.invoice_status === "PAID") paid = iv.payments?.find((x) => x.payment_status === "PAID") ?? { payment_id: `inv-${row.qpay_id}`, payment_status: "PAID", payment_amount: row.amount };
  }
  if (paid && Number(paid.payment_amount) >= row.amount) {
    const ok = ctx.db.run(`UPDATE invoices SET status = 'paid', paid_at = ?, payment_id = ? WHERE id = ? AND merchant = :tenant AND status = 'pending'`, Date.now(), paid.payment_id, inv);
    if (Number(ok.changes)) credit(ctx, row.plan, row.credits, inv);
  }
  return invoiceView(ctx, inv)!;
}

/**
 * QPay SANDBOX-д төлбөр хийх хэтэвч байхгүй тул хакатоны үзүүлэнд нэхэмжлэхийг гараар баталгаажуулна.
 * Зөвхөн sandbox орчинд, QPAY_SANDBOX_CONFIRM != "no" үед. payment_id = "sandbox-manual" — тайлан, аудитад ялгарна.
 */
export const sandboxConfirmAllowed = () => qpaySandbox() && process.env.QPAY_SANDBOX_CONFIRM !== "no";
export function sandboxConfirm(ctx: Cx, inv: string) {
  if (!sandboxConfirmAllowed()) throw new PayError("Зөвхөн QPay sandbox орчинд", 403);
  const row = ctx.db.one<{ status: string; plan: string; credits: number }>(`SELECT status, plan, credits FROM invoices WHERE id = ? AND merchant = :tenant`, inv);
  if (!row) throw new PayError("Нэхэмжлэх олдсонгүй", 404);
  if (row.status !== "pending") return invoiceView(ctx, inv)!;
  const ok = ctx.db.run(`UPDATE invoices SET status = 'paid', paid_at = ?, payment_id = 'sandbox-manual' WHERE id = ? AND merchant = :tenant AND status = 'pending'`, Date.now(), inv);
  if (Number(ok.changes)) credit(ctx, row.plan, row.credits, inv);
  return invoiceView(ctx, inv)!;
}

function credit(ctx: Cx, planId: string, credits: number, inv: string) {
  const p = planOf(planId)!;
  const w = wallet(ctx);
  const base = Math.max(Date.now(), w.expires_at ?? 0);
  const expires = p.days ? base + p.days * 86_400_000 : (w.expires_at ?? Date.now() + 30 * 86_400_000);
  ctx.db.run(
    `INSERT INTO wallet (merchant, credits, plan, expires_at) VALUES (:tenant, ?, ?, ?)
     ON CONFLICT(merchant) DO UPDATE SET credits = credits + excluded.credits, plan = CASE WHEN ? THEN excluded.plan ELSE plan END, expires_at = excluded.expires_at`,
    credits,
    p.days ? p.id : w.plan,
    expires,
    p.days ? 1 : 0,
  );
  ctx.db.run(`INSERT INTO usage (merchant, kind, credits, ref, at, channel, feature) VALUES (:tenant, 'topup', ?, ?, ?, 'system', ?)`, -credits, inv, Date.now(), p.days ? "plan" : "topup");
  emit(ctx.tenantId, { type: "ai", data: { kind: "wallet" } });
  levels().delete(ctx.tenantId);
}

export function usageSummary(ctx: Cx, days = 30) {
  const since = Date.now() - days * 86_400_000;
  const byKind = ctx.db.all<{ kind: string; credits: number; n: number; tin: number; tout: number }>(
    `SELECT kind, SUM(credits) credits, COUNT(*) n, SUM(COALESCE(tokens_in,0)) tin, SUM(COALESCE(tokens_out,0)) tout FROM usage WHERE merchant = :tenant AND at >= ? GROUP BY kind`,
    since,
  );
  return { byKind };
}

/* ───────── хэрэглээний аналитик (§7) ───────── */

const DAY = 86_400_000;
const UB = 8 * 3_600_000; // Asia/Ulaanbaatar (UTC+8, зуны цаггүй)
export const ubDay = (ms: number) => new Date(ms + UB).toISOString().slice(0, 10);
const r2 = (n: number) => Math.round(n * 100) / 100;
/** ₮/кредит — одоогийн багцаар (байхгүй бол «Бизнес») */
const tugrikPerCredit = (plan: string | null) => {
  const p = planOf(plan ?? "") ?? planOf("business")!;
  return p.price / p.credits;
};

export type UsageStatus = "ok" | "low" | "critical" | "expiring_unused" | "empty";
export type DailyRow = { day: string } & Record<Exclude<UsageChannel, "system">, number>;
export type UsageMetrics = {
  wallet: { credits: number; plan: string | null; expiresAt: string | null };
  cycle: { startedAt: string | null; granted: number; spent: number; pctLeft: number };
  burn: { perDay7: number; perDay30: number; trend: number | null };
  runway: { daysLeft: number | null; emptyOn: string | null; expiresInDays: number | null; status: UsageStatus; dailyAllowance: number | null };
  daily: DailyRow[];
  byChannel: { channel: string; credits: number; pct: number; events: number }[];
  byFeature: { feature: string; credits: number; pct: number; events: number; unitCost: number }[];
  byAssistant: { assistant: string; credits: number }[];
  tokens: { model: string; in: number; out: number; calls: number }[];
  value: { conversations: number; aiResolvedPct: number | null; creditsPerConversation: number | null; tugrikPerConversation: number | null };
  creditValue: { tugrik: number; chat: number; command: number; voiceMinute: number };
};

type URow = { at: number; credits: number; kind: string; channel: string | null; feature: string | null; assistant: string | null; ref: string | null };
const legacyChannel = (r: URow): UsageChannel => (r.channel && (CHANNELS as readonly string[]).includes(r.channel) ? (r.channel as UsageChannel) : r.kind === "voice" ? "voice" : r.kind === "command" ? "director" : r.kind.startsWith("inv_") ? "inventory" : r.kind === "chat" ? "web" : "system");

/** Статус: low (<20% эсвэл <5 өдөр), critical (<5% эсвэл <1 өдөр), expiring_unused, empty (0) */
export function statusOf(credits: number, pctLeft: number, daysLeft: number | null, expiresInDays: number | null): UsageStatus {
  if (credits <= 0) return "empty";
  if (pctLeft < 5 || (daysLeft !== null && daysLeft < 1)) return "critical";
  if (pctLeft < 20 || (daysLeft !== null && daysLeft < 5)) return "low";
  if (daysLeft !== null && expiresInDays !== null && expiresInDays > 0 && daysLeft > expiresInDays * 1.5) return "expiring_unused";
  return "ok";
}

function cycleOf(ctx: Cx, credits: number, now: number) {
  const start = ctx.db.one<{ at: number | null }>(`SELECT MAX(paid_at) AS at FROM invoices WHERE merchant = :tenant AND status = 'paid' AND plan != 'topup'`)?.at ?? null;
  const spent = start ? (ctx.db.one<{ s: number | null }>(`SELECT SUM(credits) AS s FROM usage WHERE merchant = :tenant AND credits > 0 AND at >= ? AND at <= ?`, start, now)?.s ?? 0) : 0;
  const granted = start ? credits + spent : Math.max(credits, -(ctx.db.one<{ s: number | null }>(`SELECT SUM(credits) AS s FROM usage WHERE merchant = :tenant AND kind = 'topup'`)?.s ?? 0));
  return { start, spent, granted, pctLeft: granted > 0 ? r2((credits / granted) * 100) : 0 };
}

export function usageMetrics(ctx: Cx, days = 30, now = Date.now()): UsageMetrics {
  const D = Math.max(7, Math.min(90, Math.floor(days) || 30));
  const w = wallet(ctx);
  const cyc = cycleOf(ctx, w.credits, now);
  const since = now - Math.max(D, 14) * DAY;
  const rows = ctx.db.all<URow>(`SELECT at, credits, kind, channel, feature, assistant, ref FROM usage WHERE merchant = :tenant AND credits > 0 AND at >= ? AND at <= ?`, since, now);
  const sum = (from: number, to: number) => rows.reduce((a, r) => (r.at >= from && r.at < to ? a + r.credits : a), 0);
  const raw7 = sum(now - 7 * DAY, now + 1) / 7;
  const perDay7 = r2(raw7);
  const prev7 = sum(now - 14 * DAY, now - 7 * DAY) / 7;
  const perDay30 = r2(sum(now - 30 * DAY, now + 1) / 30);
  const trend = prev7 > 0 ? r2(raw7 / prev7 - 1) : null;
  const daysLeft = raw7 > 0 ? r2(w.credits / raw7) : null;
  const expiresInDays = w.expires_at ? r2(Math.max(0, (w.expires_at - now) / DAY)) : null;
  const status = statusOf(w.credits, cyc.pctLeft, daysLeft, expiresInDays);

  const inRange = rows.filter((r) => r.at >= now - D * DAY);
  const total = inRange.reduce((a, r) => a + r.credits, 0);
  const daily: DailyRow[] = [];
  const idx = new Map<string, DailyRow>();
  for (let i = D - 1; i >= 0; i--) {
    const day = ubDay(now - i * DAY);
    const row: DailyRow = { day, web: 0, fb: 0, voice: 0, director: 0, mcp: 0, inventory: 0 };
    daily.push(row);
    idx.set(day, row);
  }
  const ch = new Map<string, { credits: number; events: number }>();
  const fe = new Map<string, { credits: number; events: number }>();
  const as = new Map<string, number>();
  const convs = new Set<string>();
  let convCredits = 0;
  for (const r of inRange) {
    const c = legacyChannel(r);
    const d = idx.get(ubDay(r.at));
    if (d && c !== "system") d[c] += r.credits;
    const a = ch.get(c) ?? { credits: 0, events: 0 };
    a.credits += r.credits;
    a.events += 1;
    ch.set(c, a);
    const f = r.feature ?? FEATURE_OF[r.kind] ?? r.kind;
    const b = fe.get(f) ?? { credits: 0, events: 0 };
    b.credits += r.credits;
    b.events += 1;
    fe.set(f, b);
    if (r.assistant) as.set(r.assistant, (as.get(r.assistant) ?? 0) + r.credits);
    if ((r.kind === "chat" || r.kind === "voice") && r.ref) {
      convs.add(r.ref);
      convCredits += r.credits;
    }
  }
  const pct = (x: number) => (total > 0 ? r2((x / total) * 100) : 0);
  const conv = ctx.db.all<{ status: string; n: number }>(`SELECT status, COUNT(*) AS n FROM conversations WHERE merchant = :tenant AND channel != 'director' AND last_at >= ? GROUP BY status`, now - D * DAY);
  const convTotal = conv.reduce((a, r) => a + r.n, 0);
  const aiResolved = conv.filter((r) => r.status !== "human").reduce((a, r) => a + r.n, 0);
  const cpc = convs.size ? r2(convCredits / convs.size) : null;
  const tpc = tugrikPerCredit(w.plan);
  return {
    wallet: { credits: w.credits, plan: w.plan, expiresAt: w.expires_at ? new Date(w.expires_at).toISOString() : null },
    cycle: { startedAt: cyc.start ? new Date(cyc.start).toISOString() : null, granted: cyc.granted, spent: cyc.spent, pctLeft: cyc.pctLeft },
    burn: { perDay7, perDay30, trend },
    runway: {
      daysLeft,
      emptyOn: daysLeft !== null ? ubDay(now + daysLeft * DAY) : null,
      expiresInDays,
      status,
      dailyAllowance: expiresInDays && expiresInDays > 0 ? r2(w.credits / expiresInDays) : null,
    },
    daily,
    byChannel: [...ch].map(([channel, v]) => ({ channel, credits: v.credits, pct: pct(v.credits), events: v.events })).sort((a, b) => b.credits - a.credits),
    byFeature: [...fe].map(([feature, v]) => ({ feature, credits: v.credits, pct: pct(v.credits), events: v.events, unitCost: v.events ? r2(v.credits / v.events) : 0 })).sort((a, b) => b.credits - a.credits),
    byAssistant: [...as].map(([assistant, credits]) => ({ assistant, credits })).sort((a, b) => b.credits - a.credits),
    tokens: ctx.db.all<{ model: string; in: number; out: number; calls: number }>(
      `SELECT model, SUM(COALESCE(tokens_in,0)) AS "in", SUM(COALESCE(tokens_out,0)) AS "out", COUNT(*) AS calls FROM usage WHERE merchant = :tenant AND credits = 0 AND model IS NOT NULL AND at >= ? GROUP BY model ORDER BY calls DESC`,
      now - D * DAY,
    ),
    value: { conversations: convs.size, aiResolvedPct: convTotal ? r2((aiResolved / convTotal) * 100) : null, creditsPerConversation: cpc, tugrikPerConversation: cpc !== null ? Math.round(cpc * tpc) : null },
    creditValue: { tugrik: r2(tpc), chat: COST.chat, command: COST.command, voiceMinute: COST.voiceMinute },
  };
}

/* ───────── low / critical мэдэгдэл (SSE + түншийн webhook) ───────── */

const gl = globalThis as unknown as { __walletLevel?: Map<string, UsageStatus> };
const levels = () => (gl.__walletLevel ??= new Map());

/** Зарцуулалтын дараа статус low/critical/empty болж ӨӨРЧЛӨГДВӨЛ нэг удаа мэдэгдэнэ */
export function notifyLevel(ctx: Cx, now = Date.now()) {
  try {
    const w = wallet(ctx);
    const cyc = cycleOf(ctx, w.credits, now);
    const s7 = ctx.db.one<{ s: number | null }>(`SELECT SUM(credits) AS s FROM usage WHERE merchant = :tenant AND credits > 0 AND at >= ?`, now - 7 * DAY)?.s ?? 0;
    const daysLeft = s7 > 0 ? w.credits / (s7 / 7) : null;
    const st = statusOf(w.credits, cyc.pctLeft, daysLeft, null);
    const prev = levels().get(ctx.tenantId) ?? "ok";
    levels().set(ctx.tenantId, st);
    if (st === prev || !(st === "low" || st === "critical" || st === "empty")) return;
    emit(ctx.tenantId, { type: "ai", data: { kind: "wallet_level", status: st, credits: w.credits, pctLeft: cyc.pctLeft } });
    if (st === "empty" || st === "critical" || st === "low") enqueuePartnerEvent(ctx.tenantId, st === "empty" ? "wallet.empty" : "wallet.low", { credits: w.credits, pctLeft: cyc.pctLeft });
  } catch {
    /* мэдэгдэл алдаа ажлыг зогсоохгүй */
  }
}
