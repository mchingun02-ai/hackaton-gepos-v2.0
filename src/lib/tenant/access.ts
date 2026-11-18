/**
 * Агуулгагүй хандалтын аудит (docs/ARCHITECTURE.md §4B.5): хэн, хэзээ, ямар төрөл, хэдэн мөр — текст БИЧИХГҮЙ.
 *   access(ctx, "connector.fetch", "products", 37)
 * action/resource нь [a-z0-9_.:-] л — дуудагч санамсаргүй агуулга дамжуулсан ч хадгалагдахгүй.
 */
import type { TenantContext } from "./context";
import { rawAll, rawOne, rawRun } from "./raw";

const tok = (s: string | null | undefined, n = 48) => (s ?? "").replace(/[^A-Za-z0-9_.:-]/g, "").slice(0, n) || null;

export function actorOf(ctx: Pick<TenantContext, "principal">): { kind: string; id: string | null } {
  const p = ctx.principal;
  if (p.kind === "session") return { kind: "session", id: tok(p.staffId) };
  if (p.kind === "api_key") return { kind: "api_key", id: tok(p.prefix) };
  if (p.kind === "visitor") return { kind: "visitor", id: null };
  if (p.kind === "webhook") return { kind: "webhook", id: p.source };
  return { kind: "system", id: tok(p.job) };
}

/** Tenant-ын хандалтын үйл явдал (partner_id-г tenants мөрөөс) */
export function access(ctx: Pick<TenantContext, "tenantId" | "principal" | "requestId">, action: string, resource?: string | null, count?: number | null, actor?: { kind: string; id?: string | null }) {
  try {
    const a = actor ?? actorOf(ctx);
    rawRun(
      `INSERT INTO access_log (merchant, partner_id, at, actor_kind, actor_id, action, resource, count, request_id)
       VALUES (?, (SELECT partner_id FROM tenants WHERE id = ?), ?, ?, ?, ?, ?, ?, ?)`,
      ctx.tenantId,
      ctx.tenantId,
      Date.now(),
      tok(a.kind, 16) ?? "system",
      tok(a.id ?? null),
      tok(action, 40) ?? "unknown",
      tok(resource ?? null),
      count == null ? null : Math.round(Number(count)) || 0,
      tok(ctx.requestId, 40),
    );
  } catch {
    /* аудит бичих алдаа ажлыг зогсоохгүй */
  }
}

/** Түншийн түвшний үйл явдал (tenant устсаны дараа ч) — merchant NULL */
export function partnerAccess(partnerId: string, action: string, resource: string | null, count: number | null, requestId: string, actorId?: string) {
  rawRun(
    `INSERT INTO access_log (merchant, partner_id, at, actor_kind, actor_id, action, resource, count, request_id) VALUES (NULL, ?, ?, 'partner', ?, ?, ?, ?, ?)`,
    partnerId,
    Date.now(),
    tok(actorId ?? null),
    tok(action, 40) ?? "unknown",
    tok(resource),
    count,
    tok(requestId, 40),
  );
}

export type AccessRow = { id: number; at: number; actor_kind: string; actor_id: string | null; action: string; resource: string | null; count: number | null };

/** Мерчант өөрийнхийг (Privacy хуудас) */
export const tenantAccessLog = (ctx: Pick<TenantContext, "db">, limit = 50) =>
  ctx.db.all<AccessRow>(`SELECT id, at, actor_kind, actor_id, action, resource, count FROM access_log WHERE merchant = :tenant ORDER BY id DESC LIMIT ?`, Math.min(200, limit));

/** Хамгийн сүүлийн хандалт (`partner/aggregates`-д ашиглахгүй — тенант өөрөө) */
export const lastAccess = (tenantId: string) => rawOne<{ at: number }>(`SELECT at FROM access_log WHERE merchant = ? ORDER BY id DESC LIMIT 1`, tenantId)?.at ?? null;
export const _accessForTest = (tenantId: string) => rawAll(`SELECT * FROM access_log WHERE merchant = ?`, tenantId);
