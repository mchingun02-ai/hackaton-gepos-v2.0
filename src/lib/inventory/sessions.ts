/**
 * Тооллогын session-ууд (docs/ARCHITECTURE.md §5.1–5.5). Бүх query `ctx.db` (`:tenant`)-ээр, бараа/үлдэгдэл `ctx.pos`-оор.
 *
 *   counting → review (submit) → approved → applied (adjustStock амжилттай)
 *   review → counting (reject/reopen — critical мөрүүд «дахин тоолох»)   · counting|review → cancelled
 *
 * Батлахад зөвхөн delta: stock += counted − system_qty_at_count (D6). Давхар батлахаас
 * `UPDATE … WHERE status='review'`-ийн changes=1 хамгаална.
 */
import { createHash, randomBytes } from "node:crypto";
import { emit } from "@/lib/agent/db";
import { unitLabel, type CProduct } from "@/lib/pos/canonical";
import { spNow } from "@/lib/sp/server";
import type { TenantContext } from "@/lib/tenant/context";
import { decS, encS } from "@/lib/tenant/crypto";
import { fail } from "@/lib/tenant/http";
import { computeQty, isMethod, METHOD_LABEL, MethodError, needsConfirm, type Inputs, type Method, type Profile } from "./methods";
import { purgeSessionPhotos } from "./photos";
import { applyDelta, classify, cleanThresholds, report, varianceOf, type Level, type Thresholds } from "./reconcile";

type Ctx = TenantContext;

export type SessionStatus = "counting" | "review" | "approved" | "applied" | "cancelled";
export type LineStatus = "pending" | "counted" | "recount" | "recounted" | "skipped";

type SessionRow = {
  id: string;
  no: number;
  name: string;
  scope: string;
  scope_ref: string | null;
  blind: number;
  status: SessionStatus;
  created_by: string;
  created_at: number;
  submitted_by: string | null;
  submitted_at: number | null;
  decided_by: string | null;
  decided_at: number | null;
  note: string | null;
};
type LineRow = {
  session_id: string;
  product_id: string;
  name: string;
  barcode: string | null;
  unit: string | null;
  price: number | null;
  cost: number | null;
  expected_qty: number;
  system_qty_at_count: number | null;
  counted_qty: number | null;
  variance: number | null;
  level: Level | null;
  status: LineStatus;
};
type CountRow = { id: string; session_id: string; product_id: string; method: Method; inputs: string; qty: number; source: string; photo_id: string | null; confidence: number | null; place: string | null; by: string; at: number };
type ProfileRow = { product_id: string; method: Method; depth: number | null; pack_size: number | null; unit_weight_g: number | null; tare_g: number | null; unit_thickness_mm: number | null; lead_days: number | null };

/* ───────── хэн ───────── */

export type Who = { id: string; name: string; role: string };
export function whoOf(ctx: Ctx): Who {
  const p = ctx.principal;
  if (p.kind === "session") return { id: p.staffId || `s:${p.sessionId.slice(0, 8)}`, name: p.name || "Ажилтан", role: p.role };
  if (p.kind === "api_key") return { id: `key:${p.prefix}`, name: `API ${p.prefix}`, role: "api" };
  if (p.kind === "system") return { id: `sys:${p.job}`, name: p.job, role: "system" };
  return { id: p.kind, name: p.kind, role: p.kind };
}
/** Менежер, эзэмшигч (зөрүү харах, батлах) */
export const isManager = (ctx: Ctx) => ctx.principal.kind === "session" && (ctx.principal.role === "owner" || ctx.principal.role === "manager");
const packWho = (w: Who) => JSON.stringify({ id: w.id, name: w.name });
export function unpackWho(s: string | null): { id: string; name: string } | null {
  if (!s) return null;
  try {
    const j = JSON.parse(s) as { id?: string; name?: string };
    return { id: String(j.id ?? ""), name: String(j.name ?? "") };
  } catch {
    return { id: s, name: s };
  }
}

const newId = (p: string) => `${p}${randomBytes(10).toString("hex")}`;
const nameRef = (sid: string, pid: string) => `inv_lines|name|${sid}:${pid}`;

/* ───────── босго ───────── */

export function getThresholds(ctx: Ctx): Thresholds {
  const r = ctx.db.one<{ json: string }>(`SELECT json FROM inv_settings WHERE merchant = :tenant`);
  let j: unknown = null;
  try {
    j = r ? JSON.parse(r.json) : null;
  } catch {
    j = null;
  }
  return cleanThresholds(j as Partial<Thresholds> | null);
}
export function saveThresholds(ctx: Ctx, patch: Partial<Record<keyof Thresholds, unknown>>) {
  const t = cleanThresholds({ ...getThresholds(ctx), ...patch });
  ctx.db.run(`INSERT INTO inv_settings (merchant, json, updated_at) VALUES (:tenant, ?, ?) ON CONFLICT(merchant) DO UPDATE SET json = excluded.json, updated_at = excluded.updated_at`, JSON.stringify(t), Date.now());
  return t;
}

/* ───────── профайл ───────── */

export function profileOf(ctx: Ctx, productId: string): Profile & { method: Method } {
  const r = ctx.db.one<ProfileRow>(`SELECT * FROM inv_profiles WHERE merchant = :tenant AND product_id = ?`, productId);
  return r
    ? { method: isMethod(r.method) ? r.method : "facings", depth: r.depth, packSize: r.pack_size, unitWeightG: r.unit_weight_g, tareG: r.tare_g, unitThicknessMm: r.unit_thickness_mm, leadDays: r.lead_days }
    : { method: "facings" };
}
export function profilesFor(ctx: Ctx, ids: string[]) {
  const m = new Map<string, Profile & { method: Method }>();
  if (!ids.length) return m;
  const rows = ctx.db.all<ProfileRow>(`SELECT * FROM inv_profiles WHERE merchant = :tenant`);
  for (const r of rows)
    if (ids.includes(r.product_id))
      m.set(r.product_id, { method: isMethod(r.method) ? r.method : "facings", depth: r.depth, packSize: r.pack_size, unitWeightG: r.unit_weight_g, tareG: r.tare_g, unitThicknessMm: r.unit_thickness_mm, leadDays: r.lead_days });
  return m;
}

const posNum = (v: unknown, max = 1_000_000) => {
  if (v === null || v === "") return null;
  if (v === undefined) return undefined;
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n) || n < 0 || n > max) fail(400, "Профайлын утга буруу");
  return n;
};
/** Профайл хадгалах — зөвхөн өгсөн талбарууд өөрчлөгдөнө */
export function saveProfile(ctx: Ctx, productId: string, patch: Record<string, unknown>) {
  const cur = profileOf(ctx, productId);
  const method = patch.method === undefined ? cur.method : isMethod(patch.method) ? patch.method : fail(400, "Тоолох арга буруу");
  const pick = (k: string, c: number | null | undefined, max?: number) => {
    const v = posNum(patch[k], max);
    return v === undefined ? (c ?? null) : v;
  };
  const next = {
    method,
    depth: pick("depth", cur.depth, 1000),
    packSize: pick("packSize", cur.packSize, 100_000),
    unitWeightG: pick("unitWeightG", cur.unitWeightG),
    tareG: pick("tareG", cur.tareG),
    unitThicknessMm: pick("unitThicknessMm", cur.unitThicknessMm, 10_000),
    leadDays: pick("leadDays", cur.leadDays, 365),
  };
  if (next.packSize === 0) next.packSize = null;
  ctx.db.run(
    `INSERT INTO inv_profiles (merchant, product_id, method, depth, pack_size, unit_weight_g, tare_g, unit_thickness_mm, lead_days, updated_at)
     VALUES (:tenant, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(merchant, product_id) DO UPDATE SET method = excluded.method, depth = excluded.depth, pack_size = excluded.pack_size,
       unit_weight_g = excluded.unit_weight_g, tare_g = excluded.tare_g, unit_thickness_mm = excluded.unit_thickness_mm, lead_days = excluded.lead_days, updated_at = excluded.updated_at`,
    productId,
    next.method,
    next.depth,
    next.packSize,
    next.unitWeightG,
    next.tareG,
    next.unitThicknessMm,
    next.leadDays !== null ? Math.round(next.leadDays) : null,
    Date.now(),
  );
  return next;
}

/* ───────── session ───────── */

const ACTIVE = `status IN ('counting','review')`;
export function sessionRow(ctx: Ctx, id: string): SessionRow {
  return ctx.db.one<SessionRow>(`SELECT * FROM inv_sessions WHERE id = ? AND merchant = :tenant`, String(id).slice(0, 64)) ?? fail(404, "Тооллого олдсонгүй");
}

export async function createSession(ctx: Ctx, inp: { name?: unknown; scope?: unknown; scopeRef?: unknown; blind?: unknown }) {
  const scope = inp.scope === "category" ? "category" : "all";
  const scopeRef = scope === "category" ? String(inp.scopeRef ?? "").trim().slice(0, 80) : null;
  if (scope === "category" && !scopeRef) fail(400, "Ангиллаа сонгоно уу");
  const dup = ctx.db.one<{ id: string }>(`SELECT id FROM inv_sessions WHERE merchant = :tenant AND ${ACTIVE} AND scope = ? AND COALESCE(scope_ref,'') = ?`, scope, scopeRef ?? "");
  if (dup) fail(409, "Энэ хүрээнд дуусаагүй тооллого байна — түүнийг үргэлжлүүлнэ үү", "active_exists");
  const products = (await ctx.pos.listProducts(scope === "category" ? { category: scopeRef! } : {})).filter((p) => p.active);
  if (!products.length) fail(400, "Энэ хүрээнд бараа алга");
  const stock = new Map((await ctx.pos.stock(products.map((p) => p.id))).map((s) => [s.productId, s.qty]));
  const no = (ctx.db.one<{ n: number | null }>(`SELECT MAX(no) n FROM inv_sessions WHERE merchant = :tenant`)?.n ?? 0) + 1;
  const id = newId("is");
  const w = whoOf(ctx);
  const day = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Ulaanbaatar" });
  const name = String(inp.name ?? "").trim().slice(0, 80) || `Тооллого №${no}${scopeRef ? ` · ${scopeRef}` : ""} · ${day}`;
  ctx.db.run(
    `INSERT INTO inv_sessions (id, merchant, no, name, scope, scope_ref, blind, status, created_by, created_at) VALUES (?, :tenant, ?, ?, ?, ?, ?, 'counting', ?, ?)`,
    id,
    no,
    name,
    scope,
    scopeRef,
    inp.blind === false ? 0 : 1,
    packWho(w),
    Date.now(),
  );
  try {
    for (const p of products) insertLine(ctx, id, p, stock.get(p.id) ?? 0);
  } catch (e) {
    ctx.db.run(`DELETE FROM inv_lines WHERE merchant = :tenant AND session_id = ?`, id);
    ctx.db.run(`DELETE FROM inv_sessions WHERE merchant = :tenant AND id = ?`, id);
    throw e;
  }
  changed(ctx, id);
  return getSession(ctx, id);
}

function insertLine(ctx: Ctx, sid: string, p: CProduct, qty: number) {
  ctx.db.run(
    `INSERT OR IGNORE INTO inv_lines (merchant, session_id, product_id, name, barcode, unit, price, cost, expected_qty, status) VALUES (:tenant, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
    sid,
    p.id,
    encS(ctx, p.name, nameRef(sid, p.id)),
    p.barcodes[0] ?? null,
    `${p.unit}|${unitLabel(p)}`,
    Math.round(p.price),
    p.cost != null ? Math.round(p.cost) : null,
    qty,
  );
}

/** Тооллогын дундуур бүртгэсэн бараа — мөр нэмнэ (байвал юу ч хийхгүй) */
export async function addProductLine(ctx: Ctx, sid: string, p: CProduct) {
  const st = (await ctx.pos.stock([p.id]))[0];
  insertLine(ctx, sid, p, st?.qty ?? 0);
  changed(ctx, sid);
  return true;
}

const changed = (ctx: Ctx, sid: string) => emit(ctx.tenantId, { type: "ai", data: { kind: "inventory", id: sid } });

export function listSessions(ctx: Ctx, limit = 30) {
  const rows = ctx.db.all<SessionRow & { total: number; done: number; crit: number }>(
    `SELECT s.*,
       (SELECT COUNT(*) FROM inv_lines l WHERE l.merchant = :tenant AND l.session_id = s.id) total,
       (SELECT COUNT(*) FROM inv_lines l WHERE l.merchant = :tenant AND l.session_id = s.id AND l.status IN ('counted','recounted','skipped')) done,
       (SELECT COUNT(*) FROM inv_lines l WHERE l.merchant = :tenant AND l.session_id = s.id AND l.level = 'critical' AND l.status != 'recount') crit
     FROM inv_sessions s WHERE s.merchant = :tenant ORDER BY s.created_at DESC LIMIT ?`,
    Math.min(100, Math.max(1, limit)),
  );
  const mgr = isManager(ctx);
  return rows.map((r) => ({ ...sessionView(r), total: r.total, done: r.done, critical: mgr || !r.blind ? r.crit : null }));
}

function sessionView(r: SessionRow) {
  return {
    id: r.id,
    no: r.no,
    name: r.name,
    scope: r.scope,
    scopeRef: r.scope_ref,
    blind: !!r.blind,
    status: r.status,
    createdBy: unpackWho(r.created_by)?.name ?? "",
    createdAt: r.created_at,
    submittedBy: unpackWho(r.submitted_by)?.name ?? null,
    submittedAt: r.submitted_at,
    decidedBy: unpackWho(r.decided_by)?.name ?? null,
    decidedAt: r.decided_at,
    note: r.note,
  };
}

function lineRows(ctx: Ctx, sid: string) {
  return ctx.db.all<LineRow>(`SELECT * FROM inv_lines WHERE merchant = :tenant AND session_id = ?`, sid).map((l) => ({ ...l, name: decS(ctx, l.name, nameRef(sid, l.product_id)) }));
}
const unitParts = (u: string | null) => {
  const [unit, label] = String(u ?? "pcs|ш").split("|");
  return { unit: unit || "pcs", label: label || "ш" };
};
const unitValue = (l: Pick<LineRow, "cost" | "price">) => l.cost ?? l.price ?? 0;

/** Мөрийн харагдац — хараагүй (blind) тооллогод ажилтан хүлээгдэж буй үлдэгдэл, зөрүүг харахгүй */
function lineView(l: LineRow, reveal: boolean, prof?: Profile & { method: Method }) {
  const u = unitParts(l.unit);
  return {
    productId: l.product_id,
    name: l.name,
    barcode: l.barcode,
    unit: u.unit,
    unitLabel: u.label,
    status: l.status,
    counted: l.counted_qty,
    profile: prof ?? { method: "facings" as Method },
    ...(reveal ? { expected: l.expected_qty, system: l.system_qty_at_count, variance: l.variance, level: l.level, value: l.variance != null ? Math.round(l.variance * unitValue(l)) : null, price: l.price } : {}),
  };
}

export function getSession(ctx: Ctx, id: string) {
  const s = sessionRow(ctx, id);
  const reveal = !s.blind || isManager(ctx);
  const lines = lineRows(ctx, s.id).sort((a, b) => a.name.localeCompare(b.name, "mn"));
  const profs = profilesFor(
    ctx,
    lines.map((l) => l.product_id),
  );
  const counts = ctx.db.all<CountRow>(`SELECT * FROM inv_counts WHERE merchant = :tenant AND session_id = ? AND voided_at IS NULL ORDER BY at DESC`, s.id);
  const done = lines.filter((l) => l.status === "counted" || l.status === "recounted" || l.status === "skipped").length;
  return {
    session: sessionView(s),
    reveal,
    canApprove: isManager(ctx),
    progress: { total: lines.length, done, pct: lines.length ? Math.round((done / lines.length) * 100) : 0 },
    lines: lines.map((l) => lineView(l, reveal, profs.get(l.product_id))),
    counts: counts.map((c) => ({
      id: c.id,
      productId: c.product_id,
      method: c.method,
      methodLabel: METHOD_LABEL[c.method] ?? c.method,
      inputs: safeJson(c.inputs),
      qty: c.qty,
      source: c.source,
      photoId: c.photo_id,
      confidence: c.confidence,
      place: c.place,
      by: unpackWho(c.by)?.name ?? "",
      at: c.at,
    })),
  };
}
const safeJson = (s: string) => {
  try {
    return JSON.parse(s) as unknown;
  } catch {
    return {};
  }
};

/** Идэвхтэй тооллогын бараанууд (vision-ий нэр дэвшигч, тааруулалт) */
export function sessionProducts(ctx: Ctx, sid: string) {
  return lineRows(ctx, sid).map((l) => ({ id: l.product_id, name: l.name, barcodes: l.barcode ? [l.barcode] : [], status: l.status }));
}

/* ───────── тоо нэмэх ───────── */

export type CountInput = {
  clientId?: unknown;
  productId?: unknown;
  barcode?: unknown;
  method?: unknown;
  inputs?: unknown;
  source?: unknown;
  photoId?: unknown;
  confidence?: unknown;
  place?: unknown;
  profile?: unknown;
  confirmLarge?: unknown;
};

/** Мөрийн нийлбэр, зөрүү, түвшинг дахин тооцно */
function recompute(ctx: Ctx, sid: string, pid: string, th: Thresholds) {
  const l = ctx.db.one<LineRow>(`SELECT * FROM inv_lines WHERE merchant = :tenant AND session_id = ? AND product_id = ?`, sid, pid);
  if (!l) return;
  const agg = ctx.db.one<{ n: number; q: number | null; mc: number | null }>(
    `SELECT COUNT(*) n, SUM(qty) q, MIN(confidence) mc FROM inv_counts WHERE merchant = :tenant AND session_id = ? AND product_id = ? AND voided_at IS NULL`,
    sid,
    pid,
  )!;
  if (!agg.n) {
    const st: LineStatus = l.status === "recount" || l.status === "recounted" ? "recount" : "pending";
    ctx.db.run(`UPDATE inv_lines SET counted_qty = NULL, variance = NULL, level = NULL, system_qty_at_count = NULL, status = ? WHERE merchant = :tenant AND session_id = ? AND product_id = ?`, st, sid, pid);
    return;
  }
  const counted = Math.round((agg.q ?? 0) * 1000) / 1000;
  const system = l.system_qty_at_count ?? l.expected_qty;
  const variance = varianceOf(counted, system);
  const level = classify({ system, counted, unitValue: unitValue(l), minConfidence: agg.mc }, th);
  const status: LineStatus = l.status === "recount" || l.status === "recounted" ? "recounted" : "counted";
  ctx.db.run(`UPDATE inv_lines SET counted_qty = ?, variance = ?, level = ?, status = ? WHERE merchant = :tenant AND session_id = ? AND product_id = ?`, counted, variance, level, status, sid, pid);
}

export async function addCount(ctx: Ctx, sid: string, b: CountInput, idemKey?: string | null) {
  const s = sessionRow(ctx, sid);
  const key = String(b.clientId ?? idemKey ?? "").trim().slice(0, 80) || randomBytes(12).toString("hex");
  // Idempotency: клиентийн uuid → тогтмол id (tenant-аар давхцахгүй)
  const cid = `c${createHash("sha256").update(`${ctx.tenantId}|${key}`).digest("hex").slice(0, 24)}`;
  const prev = ctx.db.one<CountRow>(`SELECT * FROM inv_counts WHERE id = ? AND merchant = :tenant`, cid);
  if (prev) {
    if (prev.session_id !== s.id) fail(409, "Энэ дугаартай тоо өөр тооллогод бүртгэгдсэн");
    return { duplicate: true, count: { id: prev.id, qty: prev.qty }, line: lineFor(ctx, s, prev.product_id) };
  }
  if (s.status !== "counting") fail(409, s.status === "review" ? "Тооллого илгээгдсэн — менежер буцаавал үргэлжлүүлнэ" : "Тооллого хаагдсан байна", "not_counting");
  if (!isMethod(b.method)) fail(400, "Тоолох арга буруу");
  const method = b.method as Method;

  // мөр олох: id эсвэл баркодоор
  const pidIn = typeof b.productId === "string" ? b.productId.slice(0, 64) : "";
  const bc = typeof b.barcode === "string" ? b.barcode.replace(/\s/g, "").slice(0, 20) : "";
  let line = pidIn
    ? ctx.db.one<LineRow>(`SELECT * FROM inv_lines WHERE merchant = :tenant AND session_id = ? AND product_id = ?`, s.id, pidIn)
    : bc
      ? ctx.db.one<LineRow>(`SELECT * FROM inv_lines WHERE merchant = :tenant AND session_id = ? AND barcode = ?`, s.id, bc)
      : fail(400, "Бараагаа сонгоно уу");
  if (!line) {
    // тооллого эхэлсний дараа нэмэгдсэн бараа (ж: зургаар бүртгэсэн) — хүрээнд байвал мөр нэмнэ
    const p = pidIn ? await ctx.pos.getProduct(pidIn) : (await ctx.pos.listProducts({ barcode: bc, limit: 1 }))[0];
    if (!p || (s.scope === "category" && (p.category ?? "") !== s.scope_ref)) fail(404, bc ? "Энэ баркодтой бараа бүртгэлгүй байна" : "Бараа олдсонгүй");
    const st = (await ctx.pos.stock([p!.id]))[0];
    insertLine(ctx, s.id, p!, st?.qty ?? 0);
    line = ctx.db.one<LineRow>(`SELECT * FROM inv_lines WHERE merchant = :tenant AND session_id = ? AND product_id = ?`, s.id, p!.id)!;
  }
  const pid = line!.product_id;

  // профайл (гүн, хайрцаг дахь тоо …) — арга бүрт санана
  const pf = b.profile && typeof b.profile === "object" ? (b.profile as Record<string, unknown>) : {};
  const inputs = (b.inputs && typeof b.inputs === "object" ? b.inputs : {}) as Inputs;
  const prof = saveProfile(ctx, pid, { ...pf, method, ...(method === "facings" && inputs.d !== undefined ? { depth: inputs.d } : {}) });
  let c;
  try {
    c = computeQty(method, inputs, prof, unitParts(line!.unit).unit);
  } catch (e) {
    if (e instanceof MethodError) fail(400, e.message);
    throw e;
  }
  if (needsConfirm(c.qty, line!.expected_qty) && b.confirmLarge !== true) fail(422, `${c.qty} — хэт их тоо байна. Зөв бол дахин баталгаажуулна уу.`, "confirm_large");

  const source = b.source === "photo" || b.source === "barcode" ? b.source : "manual";
  let photoId: string | null = null;
  if (source === "photo" && typeof b.photoId === "string" && b.photoId) {
    const ph = ctx.db.one<{ id: string }>(`SELECT id FROM inv_photos WHERE id = ? AND merchant = :tenant AND session_id = ?`, b.photoId.slice(0, 64), s.id);
    if (!ph) fail(404, "Зураг олдсонгүй");
    photoId = ph!.id;
  }
  const confN = typeof b.confidence === "number" && Number.isFinite(b.confidence) ? Math.min(1, Math.max(0, b.confidence)) : null;
  const confidence = c.confidence != null ? Math.min(c.confidence, confN ?? 1) : source === "photo" ? confN : null;

  // тоолсон агшны системийн үлдэгдэл (мөрийн эхний тоогоор)
  if (line!.system_qty_at_count == null) {
    const st = (await ctx.pos.stock([pid]))[0];
    ctx.db.run(`UPDATE inv_lines SET system_qty_at_count = ? WHERE merchant = :tenant AND session_id = ? AND product_id = ? AND system_qty_at_count IS NULL`, st?.qty ?? line!.expected_qty, s.id, pid);
  }
  const w = whoOf(ctx);
  try {
    ctx.db.run(
      `INSERT INTO inv_counts (id, merchant, session_id, product_id, method, inputs, qty, source, photo_id, confidence, place, by, at) VALUES (?, :tenant, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      cid,
      s.id,
      pid,
      method,
      JSON.stringify(c.used),
      c.qty,
      source,
      photoId,
      confidence,
      typeof b.place === "string" ? b.place.slice(0, 40) : null,
      packWho(w),
      Date.now(),
    );
  } catch (e) {
    // зэрэг ирсэн ижил клиентийн id
    const again = ctx.db.one<CountRow>(`SELECT * FROM inv_counts WHERE id = ? AND merchant = :tenant`, cid);
    if (again) return { duplicate: true, count: { id: again.id, qty: again.qty }, line: lineFor(ctx, s, pid) };
    throw e;
  }
  recompute(ctx, s.id, pid, getThresholds(ctx));
  changed(ctx, s.id);
  return { duplicate: false, count: { id: cid, qty: c.qty, warning: c.warning ?? null }, line: lineFor(ctx, s, pid) };
}

function lineFor(ctx: Ctx, s: SessionRow, pid: string) {
  const l = ctx.db.one<LineRow>(`SELECT * FROM inv_lines WHERE merchant = :tenant AND session_id = ? AND product_id = ?`, s.id, pid);
  if (!l) return null;
  return lineView({ ...l, name: decS(ctx, l.name, nameRef(s.id, pid)) }, !s.blind || isManager(ctx), profileOf(ctx, pid));
}

export function voidCount(ctx: Ctx, sid: string, cid: string) {
  const s = sessionRow(ctx, sid);
  const c = ctx.db.one<CountRow>(`SELECT * FROM inv_counts WHERE id = ? AND merchant = :tenant AND session_id = ?`, String(cid).slice(0, 64), s.id) ?? fail(404, "Тоо олдсонгүй");
  if (s.status !== "counting") fail(409, "Тооллого хаагдсан байна");
  ctx.db.run(`UPDATE inv_counts SET voided_at = ? WHERE id = ? AND merchant = :tenant AND voided_at IS NULL`, Date.now(), c.id);
  recompute(ctx, s.id, c.product_id, getThresholds(ctx));
  changed(ctx, s.id);
  return { ok: true, line: lineFor(ctx, s, c.product_id) };
}

/* ───────── төлөв ───────── */

export function submitSession(ctx: Ctx, sid: string) {
  const s = sessionRow(ctx, sid);
  if (s.status !== "counting") fail(409, "Тооллого тоолж буй төлөвт биш байна");
  const st = ctx.db.one<{ done: number; open: number }>(
    `SELECT SUM(CASE WHEN status IN ('counted','recounted','skipped') THEN 1 ELSE 0 END) done, SUM(CASE WHEN status IN ('pending','recount') THEN 1 ELSE 0 END) open FROM inv_lines WHERE merchant = :tenant AND session_id = ?`,
    s.id,
  )!;
  if (!st.done) fail(400, "Нэг ч бараа тоолоогүй байна");
  const r = ctx.db.run(`UPDATE inv_sessions SET status = 'review', submitted_by = ?, submitted_at = ? WHERE id = ? AND merchant = :tenant AND status = 'counting'`, packWho(whoOf(ctx)), Date.now(), s.id);
  if (!Number(r.changes)) fail(409, "Тооллогын төлөв өөрчлөгдсөн байна");
  changed(ctx, s.id);
  return { ok: true, uncounted: st.open ?? 0 };
}

export function cancelSession(ctx: Ctx, sid: string, note?: string) {
  const s = sessionRow(ctx, sid);
  if (!isManager(ctx) && unpackWho(s.created_by)?.id !== whoOf(ctx).id) fail(403, "Тооллогыг үүсгэсэн хүн эсвэл менежер цуцална");
  const r = ctx.db.run(`UPDATE inv_sessions SET status = 'cancelled', decided_by = ?, decided_at = ?, note = ? WHERE id = ? AND merchant = :tenant AND ${ACTIVE}`, packWho(whoOf(ctx)), Date.now(), note?.slice(0, 300) ?? null, s.id);
  if (!Number(r.changes)) fail(409, "Тооллого аль хэдийн шийдвэрлэгдсэн");
  purgeSessionPhotos(ctx, s.id);
  changed(ctx, s.id);
  return { ok: true };
}

/** Менежер буцаана: заасан (эсвэл бүх critical) мөрийг «дахин тоолох» болгоно */
export function rejectSession(ctx: Ctx, sid: string, b: { reason?: unknown; productIds?: unknown; recount?: unknown }) {
  if (!isManager(ctx)) fail(403, "Зөвхөн менежер буцаана");
  const s = sessionRow(ctx, sid);
  if (s.status !== "review") fail(409, "Хянах төлөвт биш байна");
  const reason = String(b.reason ?? "").trim().slice(0, 300);
  const lines = ctx.db.all<{ product_id: string; level: Level | null; status: LineStatus }>(`SELECT product_id, level, status FROM inv_lines WHERE merchant = :tenant AND session_id = ?`, s.id);
  const ids = Array.isArray(b.productIds) ? new Set(b.productIds.map(String)) : null;
  const target = b.recount === false ? [] : lines.filter((l) => (ids ? ids.has(l.product_id) : l.level === "critical") && l.status !== "pending");
  const r = ctx.db.run(`UPDATE inv_sessions SET status = 'counting', note = ? WHERE id = ? AND merchant = :tenant AND status = 'review'`, reason || null, s.id);
  if (!Number(r.changes)) fail(409, "Тооллогын төлөв өөрчлөгдсөн байна");
  const now = Date.now();
  for (const l of target) {
    ctx.db.run(`UPDATE inv_counts SET voided_at = ? WHERE merchant = :tenant AND session_id = ? AND product_id = ? AND voided_at IS NULL`, now, s.id, l.product_id);
    ctx.db.run(
      `UPDATE inv_lines SET status = 'recount', counted_qty = NULL, variance = NULL, level = NULL, system_qty_at_count = NULL WHERE merchant = :tenant AND session_id = ? AND product_id = ?`,
      s.id,
      l.product_id,
    );
  }
  changed(ctx, s.id);
  return { ok: true, recount: target.length };
}

/** 2+ идэвхтэй ажилтантай бол өөрийн илгээснийг батлахгүй (§5.5) */
function staffCount(ctx: Ctx) {
  if (ctx.pos.kind === "gepos")
    try {
      return spNow(ctx).staff.filter((x) => x.active).length;
    } catch {
      return 2;
    }
  return 2;
}

export async function approveSession(ctx: Ctx, sid: string, b: { override_reason?: unknown } = {}) {
  if (!isManager(ctx)) fail(403, "Тооллогыг менежер эсвэл эзэмшигч батална");
  const s = sessionRow(ctx, sid);
  if (s.status !== "review") fail(409, s.status === "counting" ? "Тооллого илгээгдээгүй байна" : "Тооллого аль хэдийн шийдвэрлэгдсэн", "not_review");
  const me = whoOf(ctx);
  if (unpackWho(s.submitted_by)?.id === me.id && staffCount(ctx) >= 2) fail(403, "Өөрийн илгээсэн тооллогыг өөр менежер батална", "same_person");
  const lines = lineRows(ctx, s.id);
  const override = String(b.override_reason ?? "").trim().slice(0, 300);
  const crit = lines.filter((l) => l.level === "critical" && l.status === "counted");
  if (crit.length && !override) fail(409, `${crit.length} бараа дахин тоолох шаардлагатай (эсвэл шалтгаан бичиж батална уу)`, "critical");

  // Давхар батлахаас: changes=1 үед л засвар
  const r = ctx.db.run(`UPDATE inv_sessions SET status = 'approved', decided_by = ?, decided_at = ?, note = COALESCE(?, note) WHERE id = ? AND merchant = :tenant AND status = 'review'`, packWho(me), Date.now(), override || null, s.id);
  if (!Number(r.changes)) fail(409, "Тооллого аль хэдийн шийдвэрлэгдсэн", "not_review");

  // Тоолоогүй (pending/recount) мөрийг ЗАСАХГҮЙ
  const adj = lines.filter((l) => (l.status === "counted" || l.status === "recounted") && l.variance != null && l.variance !== 0);
  const before = new Map((adj.length ? await ctx.pos.stock(adj.map((l) => l.product_id)) : []).map((x) => [x.productId, x.qty]));
  let res: Awaited<ReturnType<typeof ctx.pos.adjustStock>> = { applied: [], pending: [] };
  try {
    if (adj.length)
      res = await ctx.pos.adjustStock(
        { id: me.id, name: me.name },
        adj.map((l) => ({ productId: l.product_id, delta: l.variance!, reason: "count" as const, ref: s.id, by: me.name })),
      );
  } catch (e) {
    ctx.db.run(`UPDATE inv_sessions SET status = 'review', decided_by = NULL, decided_at = NULL WHERE id = ? AND merchant = :tenant AND status = 'approved'`, s.id);
    changed(ctx, s.id);
    throw e instanceof Error && /Бараа олдсонгүй/.test(e.message) ? e : new Error("ПОС-д үлдэгдэл засаж чадсангүй");
  }
  const pending = new Set(res.pending.map((x) => x.productId));
  const now = Date.now();
  let value = 0;
  for (const l of adj) {
    const d = applyDelta(before.get(l.product_id) ?? l.system_qty_at_count ?? 0, l.variance!);
    const v = Math.round(l.variance! * unitValue(l));
    value += v;
    ctx.db.run(
      `INSERT INTO inv_adjustments (id, merchant, session_id, product_id, before, delta, after, value, status, approved_by, at) VALUES (?, :tenant, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      newId("ia"),
      s.id,
      l.product_id,
      d.before,
      d.delta,
      d.after,
      v,
      pending.has(l.product_id) ? "pending_ack" : "applied",
      packWho(me),
      now,
    );
  }
  const final: SessionStatus = pending.size ? "approved" : "applied";
  ctx.db.run(`UPDATE inv_sessions SET status = ? WHERE id = ? AND merchant = :tenant AND status = 'approved'`, final, s.id);
  const summary = `Тооллого №${s.no} батлав: ${adj.length} барааны үлдэгдэл засав (${value >= 0 ? "+" : ""}${value.toLocaleString("en-US")}₮)`;
  ctx.db.run(
    `INSERT INTO actions (id, merchant, conv_id, tool, args, result, status, actor, summary, at) VALUES (?, :tenant, NULL, 'inventory.approve', ?, ?, 'done', ?, ?, ?)`,
    newId("ac"),
    JSON.stringify({ session: s.id, override: !!override }),
    JSON.stringify({ adjusted: adj.length, pending: pending.size, value }),
    me.name,
    summary,
    now,
  );
  const purged = purgeSessionPhotos(ctx, s.id);
  changed(ctx, s.id);
  return { ok: true, status: final, adjusted: adj.length, pending: pending.size, value, photosDeleted: purged, summary };
}

/* ───────── тайлан ───────── */

/** `trusted` — захирлын AI хэрэгсэл (director/MCP) */
export function varianceReport(ctx: Ctx, sid: string, trusted = false) {
  const s = sessionRow(ctx, sid);
  if (s.blind && !isManager(ctx) && !trusted) fail(403, "Зөрүүг менежер харна");
  const lines = lineRows(ctx, s.id);
  const methods = ctx.db.all<{ method: string; n: number }>(`SELECT method, COUNT(*) n FROM inv_counts WHERE merchant = :tenant AND session_id = ? AND voided_at IS NULL GROUP BY method`, s.id);
  const rep = report(
    lines.map((l) => ({ productId: l.product_id, name: l.name, status: l.status, counted: l.counted_qty, system: l.system_qty_at_count, variance: l.variance, level: l.level, unitValue: unitValue(l) })),
    methods,
  );
  const adjustments = ctx.db.all<{ product_id: string; before: number; delta: number; after: number; value: number; status: string; at: number }>(
    `SELECT product_id, before, delta, after, value, status, at FROM inv_adjustments WHERE merchant = :tenant AND session_id = ?`,
    s.id,
  );
  return {
    session: sessionView(s),
    ...rep,
    methods: rep.methods.map((m) => ({ ...m, label: METHOD_LABEL[m.method as Method] ?? m.method })),
    lines: lines
      .map((l) => ({ ...lineView(l, true), value: l.variance != null ? Math.round(l.variance * unitValue(l)) : null }))
      .sort((a, b) => Math.abs(b.value ?? 0) - Math.abs(a.value ?? 0) || (a.status === "pending" ? 1 : 0) - (b.status === "pending" ? 1 : 0)),
    adjustments,
    thresholds: getThresholds(ctx),
  };
}

/** Самбар, AI: идэвхтэй тооллого + сүүлийн батлагдсан */
export function inventoryStatus(ctx: Ctx) {
  const list = listSessions(ctx, 10);
  const active = list.filter((x) => x.status === "counting" || x.status === "review");
  const last = list.find((x) => x.status === "applied" || x.status === "approved") ?? null;
  return { active, last };
}
