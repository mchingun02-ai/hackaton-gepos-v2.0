/**
 * Арын ажлын tenant-гүй хайлт (docs/ARCHITECTURE.md §8 «Триггер») — ЗӨВХӨН tenant id-уудыг буцаана.
 * Ажил бүрийг дараа нь `systemContext(tenantId, job)`-оор нэг tenant-ын ctx-тэй гүйцэтгэнэ — давталт бүрт ганц tenant.
 * Агуулга (баримт, мессеж) энд уншихгүй.
 */
import type { TenantId } from "./context";
import { rawAll, rawRun } from "./raw";

/** Хугацаа нь болсон KB-auto ажлууд (kb_jobs) — авахдаа устгана (давхар ажиллахгүй) */
export function takeDueKbJobs(now = Date.now(), limit = 20): { tenantId: TenantId; key: string; reason: string | null }[] {
  const rows = rawAll<{ merchant: string; auto_key: string; reason: string | null }>(`SELECT merchant, auto_key, reason FROM kb_jobs WHERE due_at <= ? ORDER BY due_at LIMIT ?`, now, limit);
  for (const r of rows) rawRun(`DELETE FROM kb_jobs WHERE merchant = ? AND auto_key = ? AND due_at <= ?`, r.merchant, r.auto_key, now);
  return rows.map((r) => ({ tenantId: r.merchant as TenantId, key: r.auto_key, reason: r.reason }));
}

/**
 * ПОС-ын төлөв (sp_state) автомат баримтаас хойш өөрчлөгдсөн tenant-ууд — зөвхөн «Одоо сэргээх»-ээр автомат баримт
 * үүсгэсэн (opt-in) мерчантууд. updatedAt + debounce-оор ажил товлоно.
 */
export function staleAutoTenants(): { tenantId: TenantId; updatedAt: number }[] {
  return rawAll<{ merchant: string; updated_at: number }>(
    `SELECT s.merchant, s.updated_at FROM sp_state s JOIN kb_docs d ON d.merchant = s.merchant AND d.auto_key = 'auto:catalog'
     WHERE s.updated_at > COALESCE(d.refreshed_at, 0)`,
  ).map((r) => ({ tenantId: r.merchant as TenantId, updatedAt: Number(r.updated_at) }));
}

/** Автомат баримттай (opt-in) бүх tenant — шөнийн сэргээлт */
export function autoKbTenants(): TenantId[] {
  return rawAll<{ merchant: string }>(`SELECT DISTINCT merchant FROM kb_docs WHERE kind = 'auto' AND auto_key IN ('auto:catalog','auto:store','auto:promotions')`).map((r) => r.merchant as TenantId);
}
