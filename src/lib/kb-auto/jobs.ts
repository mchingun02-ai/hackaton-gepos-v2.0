/**
 * KB auto-ийн ажиллуулагч (docs/ARCHITECTURE.md §8 «Триггер»):
 *   - «Одоо сэргээх» (Мэдлэгийн сан таб) → refreshNow(ctx) — загвар баримтууд + (сонголтоор) FAQ олборлолт
 *   - ПОС-ын төлөв өөрчлөгдөхөд: sp_state.updated_at > auto:catalog.refreshed_at → kb_jobs (due = updated_at + 2 мин; upsert = debounce)
 *   - шөнө 03:00 (Улаанбаатар): автомат баримттай tenant бүрт загвар баримтуудыг дахин
 * Процесс доторх setInterval(60с) — ганц инстанс (§13). Давталт бүр зөвхөн нэг tenant-ын systemContext-тэй.
 * Автомат сэргээлт зөвхөн «Одоо сэргээх»-ээр нэг удаа үүсгэсэн (opt-in) мерчантад ажиллана.
 */
import { archiveAuto, putAutoDoc } from "@/lib/agent/kb";
import { logError } from "@/lib/log";
import { systemContext } from "@/lib/tenant/auth";
import type { TenantContext } from "@/lib/tenant/context";
import { autoKbTenants, staleAutoTenants, takeDueKbJobs } from "@/lib/tenant/kbjobs";
import { insightsDoc, mineFaq, type FaqResult } from "./faq";
import { catalogDoc, promotionsDoc, storeDoc, type AutoDoc } from "./templates";

export const DEBOUNCE_MS = 2 * 60_000;
export const TEMPLATES_JOB = "auto:templates";

export type DocOutcome = { key: string; title: string; result: "created" | "updated" | "unchanged" | "archived" | "skipped" };

async function put(ctx: TenantContext, d: AutoDoc | null, key: string): Promise<DocOutcome> {
  if (!d) return { key, title: key, result: "skipped" };
  if (d.empty) {
    archiveAuto(ctx, d.key);
    return { key: d.key, title: d.title, result: "archived" };
  }
  const existed = !!ctx.db.one(`SELECT 1 FROM kb_docs WHERE merchant = :tenant AND auto_key = ?`, d.key);
  const r = await putAutoDoc(ctx, {
    key: d.key,
    title: d.title,
    text: d.text,
    status: "published",
    audience: "customer",
    validUntil: d.validUntil ?? null,
    provenance: { source: d.source, label: d.label, ids: d.ids?.slice(0, 200), generated_at: Date.now(), model: null },
  });
  return { key: d.key, title: d.title, result: r.skipped ? "skipped" : !existed ? "created" : r.changed ? "updated" : "unchanged" };
}

/** Загвар (LLM-гүй) баримтууд: каталог, дэлгүүр, урамшуулал */
export async function refreshTemplates(ctx: TenantContext): Promise<DocOutcome[]> {
  const out: DocOutcome[] = [];
  out.push(await put(ctx, await catalogDoc(ctx), "auto:catalog"));
  out.push(await put(ctx, await storeDoc(ctx), "auto:store"));
  out.push(await put(ctx, await promotionsDoc(ctx), "auto:promotions"));
  return out;
}

/** «Одоо сэргээх» */
export async function refreshNow(ctx: TenantContext, o: { faq?: boolean; insights?: boolean } = {}): Promise<{ docs: DocOutcome[]; faq?: FaqResult }> {
  const docs = await refreshTemplates(ctx);
  if (o.insights !== false) {
    const r = await insightsDoc(ctx);
    docs.push({ key: "auto:insights", title: "Харилцагчийн тойм (дотоод)", result: r.changed ? "updated" : "unchanged" });
  }
  // захиалсан ажлыг цуцална (дөнгөж сэргээсэн)
  ctx.db.run(`DELETE FROM kb_jobs WHERE merchant = :tenant AND auto_key = ?`, TEMPLATES_JOB);
  return { docs, faq: o.faq ? await mineFaq(ctx) : undefined };
}

/** Ажил товлох (upsert = debounce) */
export function enqueue(ctx: TenantContext, dueAt: number, reason: string, key = TEMPLATES_JOB) {
  ctx.db.run(
    `INSERT INTO kb_jobs (merchant, auto_key, due_at, reason) VALUES (:tenant, ?, ?, ?) ON CONFLICT(merchant, auto_key) DO UPDATE SET due_at = excluded.due_at, reason = excluded.reason`,
    key,
    dueAt,
    reason,
  );
}

/* ───────── ажиллуулагч ───────── */

const g = globalThis as unknown as { __kbRunner?: { timer: ReturnType<typeof setInterval>; busy: boolean; nightly: string } };

const ubDate = (t = Date.now()) => new Date(t).toLocaleDateString("sv-SE", { timeZone: "Asia/Ulaanbaatar" });
const ubHour = (t = Date.now()) => Number(new Date(t).toLocaleString("en-US", { timeZone: "Asia/Ulaanbaatar", hour: "2-digit", hour12: false })) % 24;

/** Нэг давталт (тестэд шууд дуудна) */
export async function tick(now = Date.now()) {
  // 1) ПОС өөрчлөгдсөн tenant → debounce-тэй ажил
  for (const t of staleAutoTenants()) {
    try {
      enqueue(systemContext(t.tenantId, "kb-trigger"), t.updatedAt + DEBOUNCE_MS, "sp");
    } catch (e) {
      logError("kb_auto.enqueue", e, { tenant: t.tenantId });
    }
  }
  // 2) шөнийн сэргээлт
  const r = g.__kbRunner;
  if (r && ubHour(now) === 3 && r.nightly !== ubDate(now)) {
    r.nightly = ubDate(now);
    for (const id of autoKbTenants()) enqueue(systemContext(id, "kb-nightly"), now, "nightly");
  }
  // 3) хугацаа болсон ажлууд — tenant бүр тусдаа ctx
  for (const j of takeDueKbJobs(now)) {
    try {
      const ctx = systemContext(j.tenantId, "kb-auto");
      if (j.key === TEMPLATES_JOB) await refreshTemplates(ctx);
    } catch (e) {
      logError("kb_auto.job", e, { tenant: j.tenantId, kind: j.key });
    }
  }
}

/** Ажиллуулагчийг нэг л удаа асаана (route-уудаас дуудна; KB_AUTO=off бол асахгүй) */
export function ensureKbRunner() {
  if (g.__kbRunner || process.env.KB_AUTO === "off" || process.env.NEXT_PHASE === "phase-production-build") return;
  const state = { busy: false, nightly: ubDate(), timer: null as unknown as ReturnType<typeof setInterval> };
  state.timer = setInterval(() => {
    if (state.busy) return;
    state.busy = true;
    void tick()
      .catch((e) => logError("kb_auto.tick", e))
      .finally(() => (state.busy = false));
  }, Number(process.env.KB_AUTO_TICK_MS) || 60_000);
  state.timer.unref?.();
  g.__kbRunner = state;
}
