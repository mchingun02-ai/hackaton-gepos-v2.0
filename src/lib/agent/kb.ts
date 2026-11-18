/**
 * Мэдлэгийн сан — мерчантын баримт бичиг (журам, FAQ, үнийн жагсаалт, гэрээ…)
 * хэсэглэж SQLite-д хадгална.
 *   - Qwen text-embedding боломжтой бол вектор (cosine) хайлт.
 *   - Embedding-ийн эрхгүй (gateway) эсвэл AI_EMBED_MODEL=none бол BM25 түлхүүр үгийн хайлт
 *     (монгол үгийн нөхцөлийг таслахын тулд үгийн эхний 5 үсгээр харьцуулна).
 */
import { createHash } from "node:crypto";
import { extractText, getDocumentProxy } from "unpdf";
import { logError } from "@/lib/log";
import type { TenantContext } from "@/lib/tenant/context";
import { emit, id, json } from "./db";
import { AiError, embed, qcfg } from "./qwen";
import { isSealedText, openT, ref, sealT } from "./sealed";

/* embedding ашиглах боломж — 401/403 авбал сервер ажиллах хугацаанд дахин оролдохгүй */
const ge = globalThis as unknown as { __kbEmbedOff?: boolean };
const embedOn = () => qcfg().embed !== "none" && !ge.__kbEmbedOff;
async function tryEmbed(ctx: TenantContext, texts: string[]): Promise<Float32Array[] | null> {
  if (!embedOn()) return null;
  try {
    return await embed(ctx, texts);
  } catch (e) {
    if (e instanceof AiError && /\b(40[0134])\b|эрхгүй|not.*(found|exist|allowed)|permission/i.test(e.message)) {
      ge.__kbEmbedOff = true;
      logError("kb.embed_off", e);
      return null;
    }
    throw e;
  }
}

/* ───────── BM25 ───────── */
const STOP = new Set(["ба", "болон", "нь", "юу", "вэ", "бэ", "уу", "үү", "юм", "энэ", "тэр", "гэж", "байна", "байгаа", "бол", "ч", "л", "аа", "ээ", "хэд", "хэдэн", "яаж"]);
export function terms(s: string) {
  return s
    .toLocaleLowerCase("mn")
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w.length > 1 && !STOP.has(w))
    .map((w) => (/^\d+$/.test(w) ? w : w.slice(0, 5)));
}
function bm25(query: string, docs: string[]) {
  const q = [...new Set(terms(query))];
  const toks = docs.map(terms);
  const N = docs.length;
  const avg = toks.reduce((a, t) => a + t.length, 0) / Math.max(1, N);
  const df = new Map<string, number>();
  for (const t of toks) for (const w of new Set(t)) df.set(w, (df.get(w) ?? 0) + 1);
  const k1 = 1.4,
    b = 0.75;
  return toks.map((t) => {
    const tf = new Map<string, number>();
    t.forEach((w) => tf.set(w, (tf.get(w) ?? 0) + 1));
    let s = 0;
    for (const w of q) {
      const f = tf.get(w);
      if (!f) continue;
      const idf = Math.log(1 + (N - (df.get(w) ?? 0) + 0.5) / ((df.get(w) ?? 0) + 0.5));
      s += idf * ((f * (k1 + 1)) / (f + k1 * (1 - b + (b * t.length) / avg)));
    }
    return s;
  });
}

export type KbStatus = "published" | "pending" | "rejected" | "archived";
export type KbAudience = "customer" | "internal";
/** §8 — баримтын гарал (автомат баримтад) */
export type Provenance = { source: string; label?: string; ids?: string[]; window?: string; generated_at: number; model?: string | null; question?: string };
export type KbDoc = {
  id: string;
  title: string;
  kind: string;
  source: string | null;
  chars: number;
  chunks: number;
  created_at: number;
  status: KbStatus;
  audience: KbAudience;
  auto_key: string | null;
  refreshed_at: number | null;
  valid_until: number | null;
  provenance: Provenance | null;
};

const MAX_CHARS = 200_000;

/**
 * Гарчиг (#) бүрээр хэсэглэнэ, урт хэсгийг догол мөрөөр ~500 тэмдэгт болгоно.
 * Хэсэг бүрийн эхэнд гарчгийг нь давтана — «Буцаалт» гэх мэт сэдэв хайлтад тусна.
 */
export function chunk(text: string, size = 500): string[] {
  const clean = text.replace(/\r/g, "").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
  if (!clean) return [];
  const sections: { head: string; body: string }[] = [];
  let head = "";
  let body: string[] = [];
  for (const line of clean.split("\n")) {
    if (/^#{1,4}\s/.test(line)) {
      if (body.join("\n").trim()) sections.push({ head, body: body.join("\n").trim() });
      head = line.replace(/^#+\s*/, "").trim();
      body = [];
    } else body.push(line);
  }
  if (body.join("\n").trim()) sections.push({ head, body: body.join("\n").trim() });
  const out: string[] = [];
  for (const sec of sections) {
    const prefix = sec.head ? `${sec.head}\n` : "";
    let cur = "";
    for (const para of sec.body.split(/\n(?=\s*[-*•]|\s*\d+[.)]|\n)/)) {
      const p = para.trim();
      if (!p) continue;
      if ((cur + "\n" + p).length > size && cur) {
        out.push(prefix + cur);
        cur = "";
      }
      if (p.length > size) {
        for (let i = 0; i < p.length; i += size - 80) out.push(prefix + p.slice(i, i + size));
      } else cur = cur ? `${cur}\n${p}` : p;
    }
    if (cur) out.push(prefix + cur);
  }
  return out;
}

export async function fileToText(f: File): Promise<string> {
  const name = f.name.toLowerCase();
  const buf = new Uint8Array(await f.arrayBuffer());
  if (f.type === "application/pdf" || name.endsWith(".pdf")) {
    const pdf = await getDocumentProxy(buf);
    const { text } = await extractText(pdf, { mergePages: true });
    return String(text);
  }
  if (/\.(txt|md|csv|tsv|json)$/.test(name) || f.type.startsWith("text/")) return new TextDecoder().decode(buf);
  throw new Error("PDF, TXT, MD, CSV файл оруулна уу");
}

/* ───────── бичих (шифрлэгдсэн: kb_docs.{title,source,provenance}, kb_chunks.text — §4B.3) ───────── */

type DocOpts = {
  kind: "file" | "note" | "sample" | "auto";
  source?: string | null;
  status?: KbStatus;
  audience?: KbAudience;
  autoKey?: string | null;
  provenance?: Provenance | null;
  validUntil?: number | null;
  /** байгаа баримтыг (ижил id) шинэчлэх */
  replaceId?: string;
};

export const contentHash = (title: string, text: string) => createHash("sha256").update(`${title}\n${text}`).digest("hex").slice(0, 32);

async function writeDoc(ctx: TenantContext, title: string, text: string, o: DocOpts) {
  const t = text.slice(0, MAX_CHARS);
  const ttl = title.slice(0, 160);
  const parts = chunk(t);
  if (!parts.length) throw new Error("Баримтаас текст олдсонгүй (скан PDF бол текст хэлбэрээр оруулна уу)");
  // embedding (сүлжээ) — DB бичилтээс ӨМНӨ; доорх бичилтүүд await-гүй тул завсарт өөр бичилт орохгүй
  const vecs = await tryEmbed(ctx, parts.map((p) => `${ttl}\n${p}`));
  const docId = o.replaceId ?? id("kd");
  const now = Date.now();
  const hash = contentHash(ttl, t);
  const prov = o.provenance ? JSON.stringify(o.provenance) : null;
  if (o.replaceId) {
    ctx.db.run(`DELETE FROM kb_chunks WHERE doc_id = ? AND merchant = :tenant`, docId);
    ctx.db.run(
      `UPDATE kb_docs SET title = ?, source = ?, chars = ?, chunks = ?, status = ?, audience = ?, content_hash = ?, provenance = ?, refreshed_at = ?, valid_until = ? WHERE id = ? AND merchant = :tenant`,
      sealT(ctx, ttl, ref("kb_docs", "title", docId)),
      sealT(ctx, o.source ?? null, ref("kb_docs", "source", docId)),
      t.length,
      parts.length,
      o.status ?? "published",
      o.audience ?? "customer",
      hash,
      sealT(ctx, prov, ref("kb_docs", "provenance", docId)),
      now,
      o.validUntil ?? null,
      docId,
    );
  } else
    ctx.db.run(
      `INSERT INTO kb_docs (id, merchant, title, kind, source, chars, chunks, created_at, status, audience, auto_key, content_hash, provenance, refreshed_at, valid_until)
       VALUES (?, :tenant, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      docId,
      sealT(ctx, ttl, ref("kb_docs", "title", docId)),
      o.kind,
      sealT(ctx, o.source ?? null, ref("kb_docs", "source", docId)),
      t.length,
      parts.length,
      now,
      o.status ?? "published",
      o.audience ?? "customer",
      o.autoKey ?? null,
      hash,
      sealT(ctx, prov, ref("kb_docs", "provenance", docId)),
      o.kind === "auto" ? now : null,
      o.validUntil ?? null,
    );
  const ins = `INSERT INTO kb_chunks (id, doc_id, merchant, idx, text, emb) VALUES (?, ?, :tenant, ?, ?, ?)`;
  parts.forEach((p, i) => {
    const cid = id("kc");
    ctx.db.run(ins, cid, docId, i, sealT(ctx, p, ref("kb_chunks", "text", cid)), vecs ? new Uint8Array(vecs[i].buffer) : new Uint8Array(0));
  });
  emit(ctx.tenantId, { type: "ai", data: { kind: "kb" } });
  return { id: docId, chunks: parts.length, chars: t.length };
}

export async function addDoc(ctx: TenantContext, title: string, text: string, kind: "file" | "note" | "sample", source?: string) {
  return writeDoc(ctx, title, text, { kind, source });
}

/**
 * Автомат баримт (§8) — `auto_key`-ээр давтагдашгүй. Агуулга (content_hash) өөрчлөгдөөгүй бол зөвхөн refreshed_at
 * (embedding дахин тооцохгүй). Татгалзсан (`rejected`) түлхүүрийг дахин санал болгохгүй.
 */
export async function putAutoDoc(
  ctx: TenantContext,
  o: { key: string; title: string; text: string; status: KbStatus; audience?: KbAudience; provenance: Provenance; validUntil?: number | null },
): Promise<{ id: string | null; changed: boolean; skipped?: "rejected" }> {
  const cur = ctx.db.one<{ id: string; content_hash: string | null; status: KbStatus }>(`SELECT id, content_hash, status FROM kb_docs WHERE merchant = :tenant AND auto_key = ?`, o.key);
  if (cur?.status === "rejected") return { id: cur.id, changed: false, skipped: "rejected" };
  // батлуулах баримт (FAQ) аль хэдийн байгаа — эзний шийдвэр/засварыг дарж бичихгүй
  if (cur && o.status === "pending") return { id: cur.id, changed: false };
  const hash = contentHash(o.title.slice(0, 160), o.text.slice(0, MAX_CHARS));
  const status = o.status;
  if (cur && cur.content_hash === hash) {
    ctx.db.run(`UPDATE kb_docs SET refreshed_at = ?, valid_until = ?, status = ? WHERE id = ? AND merchant = :tenant`, Date.now(), o.validUntil ?? null, status, cur.id);
    emit(ctx.tenantId, { type: "ai", data: { kind: "kb" } });
    return { id: cur.id, changed: false };
  }
  const r = await writeDoc(ctx, o.title, o.text, {
    kind: "auto",
    source: o.provenance.label ?? o.provenance.source,
    status,
    audience: o.audience ?? "customer",
    autoKey: o.key,
    provenance: o.provenance,
    validUntil: o.validUntil ?? null,
    replaceId: cur?.id,
  });
  return { id: r.id, changed: true };
}

/** Автомат баримтыг архивлах (ж: урамшуулал дууссан) */
export function archiveAuto(ctx: TenantContext, key: string) {
  const r = ctx.db.run(`UPDATE kb_docs SET status = CASE WHEN status = 'published' THEN 'archived' ELSE status END, refreshed_at = ? WHERE merchant = :tenant AND auto_key = ?`, Date.now(), key);
  if (Number(r.changes)) emit(ctx.tenantId, { type: "ai", data: { kind: "kb" } });
}

/* ───────── унших ───────── */

type DocRow = Omit<KbDoc, "provenance"> & { provenance: string | null };
const docView = (ctx: TenantContext, r: DocRow): KbDoc => ({
  ...r,
  title: openT(ctx, r.title, ref("kb_docs", "title", r.id)),
  source: openT(ctx, r.source, ref("kb_docs", "source", r.id), true),
  provenance: json<Provenance | null>(openT(ctx, r.provenance, ref("kb_docs", "provenance", r.id), true), null),
});
const DOC_COLS = `id, title, kind, source, chars, chunks, created_at, status, audience, auto_key, refreshed_at, valid_until, provenance`;

export function listDocs(ctx: TenantContext) {
  ensureKbSealed(ctx);
  return ctx.db.all<DocRow>(`SELECT ${DOC_COLS} FROM kb_docs WHERE merchant = :tenant AND status != 'rejected' ORDER BY created_at DESC`).map((r) => docView(ctx, r));
}

export function getDoc(ctx: TenantContext, docId: string) {
  const r = ctx.db.one<DocRow>(`SELECT ${DOC_COLS} FROM kb_docs WHERE id = ? AND merchant = :tenant`, docId);
  return r ? docView(ctx, r) : null;
}

/** Устгасан бол true; өөр tenant-ын эсвэл байхгүй баримт → false (route 404) */
export function deleteDoc(ctx: TenantContext, docId: string) {
  const r = ctx.db.run(`DELETE FROM kb_docs WHERE id = ? AND merchant = :tenant`, docId);
  if (!Number(r.changes)) return false;
  ctx.db.run(`DELETE FROM kb_chunks WHERE doc_id = ? AND merchant = :tenant`, docId);
  emit(ctx.tenantId, { type: "ai", data: { kind: "kb" } });
  return true;
}

/** Баримтын хэсгүүд; баримт олдохгүй бол null */
export function docText(ctx: TenantContext, docId: string) {
  if (!ctx.db.one(`SELECT 1 FROM kb_docs WHERE id = ? AND merchant = :tenant`, docId)) return null;
  return ctx.db
    .all<{ id: string; text: string }>(`SELECT id, text FROM kb_chunks WHERE doc_id = ? AND merchant = :tenant ORDER BY idx`, docId)
    .map((r) => openT(ctx, r.text, ref("kb_chunks", "text", r.id)));
}

/**
 * Батлах дараалал (§8): pending → publish (засаад ч болно) / reject.
 * Татгалзсан мөр (auto_key-тэй) үлдэнэ — дахин санал болгогдохгүй; хэсгүүд нь устна.
 */
export async function reviewDoc(ctx: TenantContext, docId: string, action: "publish" | "reject", edit?: { title?: string; text?: string }) {
  const d = getDoc(ctx, docId);
  if (!d) return null;
  if (action === "reject") {
    ctx.db.run(`UPDATE kb_docs SET status = 'rejected' WHERE id = ? AND merchant = :tenant`, docId);
    ctx.db.run(`DELETE FROM kb_chunks WHERE doc_id = ? AND merchant = :tenant`, docId);
    emit(ctx.tenantId, { type: "ai", data: { kind: "kb" } });
    return getDoc(ctx, docId);
  }
  const title = edit?.title?.trim();
  const text = edit?.text?.trim();
  if (title || text) {
    const cur = docText(ctx, docId)?.join("\n") ?? "";
    await writeDoc(ctx, title || d.title, text || cur, {
      kind: d.kind as DocOpts["kind"],
      source: d.source,
      status: "published",
      audience: d.audience,
      autoKey: d.auto_key,
      provenance: d.provenance ? { ...d.provenance, label: d.provenance.label ? `${d.provenance.label} · эзэн засав` : "Эзэн засав" } : null,
      validUntil: d.valid_until,
      replaceId: docId,
    });
  } else ctx.db.run(`UPDATE kb_docs SET status = 'published', refreshed_at = ? WHERE id = ? AND merchant = :tenant`, Date.now(), docId);
  emit(ctx.tenantId, { type: "ai", data: { kind: "kb" } });
  return getDoc(ctx, docId);
}

const toVec = (b: Uint8Array) => new Float32Array(b.buffer, b.byteOffset, b.byteLength / 4);
function cos(a: Float32Array, b: Float32Array) {
  let d = 0,
    na = 0,
    nb = 0;
  for (let i = 0; i < a.length; i++) {
    d += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return d / (Math.sqrt(na * nb) || 1);
}

/** label — автомат баримтын эх сурвалжийн шошго «Автомат · бараа, үнэ · 11/18 09:00» */
export type Hit = { doc: string; text: string; score: number; label?: string };

const DAY = 86_400_000;
/**
 * Шинэхэн оноо (§8): auto ≤24ц 1.0 · ≤7 хоног 0.9 · хуучин 0.75 · valid_until өнгөрсөн 0;
 * гараар оруулсан (file|note) × 1.1 — эзний бичсэн журам автоматаас давуу.
 */
export function freshness(d: { kind: string; refreshed_at: number | null; created_at: number; valid_until: number | null }, now = Date.now()) {
  if (d.valid_until && d.valid_until < now) return 0;
  if (d.kind === "auto") {
    const age = now - (d.refreshed_at ?? d.created_at);
    return age <= DAY ? 1 : age <= 7 * DAY ? 0.9 : 0.75;
  }
  return d.kind === "file" || d.kind === "note" ? 1.1 : 1;
}

const fmtStamp = (t: number) => new Date(t).toLocaleString("en-GB", { timeZone: "Asia/Ulaanbaatar", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).replace(/^(\d{2})\/(\d{2}),?\s*/, "$2/$1 ");

export function provenanceLabel(d: { kind: string; refreshed_at: number | null; created_at: number }, p: Provenance | null) {
  if (d.kind !== "auto") return undefined;
  return `Автомат · ${p?.label ?? "дэлгүүрийн өгөгдөл"} · ${fmtStamp(d.refreshed_at ?? d.created_at)}`;
}

/** Хайлтын audience: харилцагчийн суваг → зөвхөн customer; захирал/MCP (ToolCtx.scope) → дотоод баримт ч */
function audienceOf(ctx: TenantContext): KbAudience[] {
  const scope = (ctx as TenantContext & { scope?: string }).scope;
  return scope === "director" || scope === "mcp" ? ["customer", "internal"] : ["customer"];
}

export async function search(ctx: TenantContext, query: string, k = 5, min = 0.3, opts: { audience?: KbAudience[] } = {}): Promise<Hit[]> {
  ensureKbSealed(ctx);
  const aud = opts.audience ?? audienceOf(ctx);
  const rows = ctx.db
    .all<{ cid: string; text: string; emb: Uint8Array; did: string; title: string; kind: string; refreshed_at: number | null; created_at: number; valid_until: number | null; provenance: string | null; audience: string }>(
      `SELECT c.id cid, c.text, c.emb, d.id did, d.title, d.kind, d.refreshed_at, d.created_at, d.valid_until, d.provenance, d.audience
       FROM kb_chunks c JOIN kb_docs d ON d.id = c.doc_id AND d.merchant = :tenant WHERE c.merchant = :tenant AND d.status = 'published'`,
    )
    .filter((r) => aud.includes(r.audience as KbAudience))
    .map((r) => {
      const title = openT(ctx, r.title, ref("kb_docs", "title", r.did));
      const label = provenanceLabel(r, r.kind === "auto" ? json<Provenance | null>(openT(ctx, r.provenance, ref("kb_docs", "provenance", r.did), true), null) : null);
      return { ...r, title, text: openT(ctx, r.text, ref("kb_chunks", "text", r.cid)), f: freshness(r), label };
    })
    .filter((r) => r.f > 0);
  if (!rows.length || !query.trim()) return [];
  const hit = (r: (typeof rows)[number], score: number): Hit => ({ doc: r.label ? `${r.title} [${r.label}]` : r.title, text: r.text, score: score * r.f, label: r.label });
  // BM25 тайлсан текст дээр санах ойд (шифрлэлттэй ч ажиллана); embedding нь вектороороо
  const lex = bm25(query, rows.map((r) => `${r.title} ${r.text}`));
  const vec = rows.every((r) => r.emb.byteLength > 0) ? await tryEmbed(ctx, [query.slice(0, 2000)]) : null;
  if (!vec)
    // түлхүүр үгийн хайлт: оноог 0..1 болгож (s/(s+3)) вектортой ижил босгоор шүүнэ
    return rows
      .map((r, i) => (lex[i] > 0 ? hit(r, lex[i] / (lex[i] + 3)) : null))
      .filter((h): h is Hit => !!h && h.score >= min)
      .sort((a, b) => b.score - a.score)
      .slice(0, k);
  // Хосолсон оноо: вектор (утга) + BM25 (үг). Монгол хэлэнд embedding-ийн cosine бага гардаг тул
  // 0.10–0.50 мужийг 0..1 болгож, BM25-тай дундажлана.
  const q = vec[0];
  return rows
    .map((r, i) => {
      const c = Math.min(1, Math.max(0, (cos(q, toVec(r.emb)) - 0.1) / 0.4));
      const l = lex[i] / (lex[i] + 3);
      return hit(r, 0.6 * c + 0.4 * l);
    })
    .filter((h) => h.score >= min)
    .sort((a, b) => b.score - a.score)
    .slice(0, k);
}

export const kbCount = (ctx: TenantContext) => Number(ctx.db.one<{ n: number }>(`SELECT COUNT(*) n FROM kb_docs WHERE merchant = :tenant AND status = 'published'`)?.n ?? 0);
export const pendingCount = (ctx: TenantContext) => Number(ctx.db.one<{ n: number }>(`SELECT COUNT(*) n FROM kb_docs WHERE merchant = :tenant AND status = 'pending'`)?.n ?? 0);

/* ───────── хуучин (шифрлээгүй) мөрийг шифрлэх — tenant бүрт процесс тутамд нэг удаа ───────── */

const gk = globalThis as unknown as { __kbSealed?: Set<string> };
export function ensureKbSealed(ctx: TenantContext) {
  const done = (gk.__kbSealed ??= new Set());
  if (done.has(ctx.tenantId)) return;
  migrateKb(ctx);
  done.add(ctx.tenantId);
}

/** Буцаах: шифрлэсэн мөрийн тоо */
export function migrateKb(ctx: TenantContext) {
  let n = 0;
  for (const d of ctx.db.all<{ id: string; title: string; source: string | null; provenance: string | null }>(
    `SELECT id, title, source, provenance FROM kb_docs WHERE merchant = :tenant AND (title NOT LIKE 'e1.%' OR (source IS NOT NULL AND source NOT LIKE 'e1.%') OR (provenance IS NOT NULL AND provenance NOT LIKE 'e1.%'))`,
  )) {
    ctx.db.run(
      `UPDATE kb_docs SET title = ?, source = ?, provenance = ? WHERE id = ? AND merchant = :tenant`,
      isSealedText(d.title) ? d.title : sealT(ctx, d.title, ref("kb_docs", "title", d.id)),
      d.source == null || isSealedText(d.source) ? d.source : sealT(ctx, d.source, ref("kb_docs", "source", d.id)),
      d.provenance == null || isSealedText(d.provenance) ? d.provenance : sealT(ctx, d.provenance, ref("kb_docs", "provenance", d.id)),
      d.id,
    );
    n++;
  }
  for (const c of ctx.db.all<{ id: string; text: string }>(`SELECT id, text FROM kb_chunks WHERE merchant = :tenant AND text NOT LIKE 'e1.%'`)) {
    ctx.db.run(`UPDATE kb_chunks SET text = ? WHERE id = ? AND merchant = :tenant`, sealT(ctx, c.text, ref("kb_chunks", "text", c.id)), c.id);
    n++;
  }
  return n;
}
