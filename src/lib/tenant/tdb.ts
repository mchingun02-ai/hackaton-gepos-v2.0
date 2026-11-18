/**
 * Түрээслэгчийн өгөгдөлд хандах боодол (docs/ARCHITECTURE.md §3.4).
 *   ctx.db.all(`SELECT * FROM tickets WHERE merchant = :tenant AND status = ?`, "open")
 * SQL-д `:tenant` байхгүй бол ажиллуулахгүй (throw). Утгыг боодол өөрөө холбоно — дуудагч tenant дамжуулахгүй.
 * INSERT ч `:tenant` агуулна (`VALUES (?, :tenant, …)`); JOIN-д хүснэгт бүрт `x.merchant = :tenant`.
 */
import type { StatementSync } from "node:sqlite";
import { db, type Arg, type Row } from "@/lib/agent/db";
import type { TenantId } from "./context";

export type RunResult = { changes: number | bigint; lastInsertRowid: number | bigint };
export type TenantDb = {
  one<T = Row>(sql: string, ...a: Arg[]): T | undefined;
  all<T = Row>(sql: string, ...a: Arg[]): T[];
  run(sql: string, ...a: Arg[]): RunResult;
};

export class TenantSqlError extends Error {}

const HAS_TENANT = /:tenant\b/;
const HAS_PARTNER = /:partner\b/;

/** Бэлтгэсэн query-г кэшлэнэ (нэг SQL текст → нэг statement) */
const gs = globalThis as unknown as { __tdbStmts?: Map<string, StatementSync> };
function prep(sql: string, re = HAS_TENANT): StatementSync {
  if (!re.test(sql)) throw new TenantSqlError(re === HAS_TENANT ? "tenant-гүй query: SQL-д `:tenant` заавал байна" : "partner-гүй query: SQL-д `:partner` заавал байна");
  const m = (gs.__tdbStmts ??= new Map());
  let st = m.get(sql);
  if (!st) {
    st = db().prepare(sql);
    if (m.size > 500) m.clear();
    m.set(sql, st);
  }
  return st;
}

/** node:sqlite нэртэй (объект) + байрлалтай параметрийг хольж дамжуулна (@types/node v20-д overload алга) */
type Exec = (...a: unknown[]) => unknown;
function bound(re: RegExp, bind: Record<string, string>): TenantDb {
  return Object.freeze({
    one: <T = Row>(sql: string, ...a: Arg[]) => {
      const st = prep(sql, re);
      return (st.get as Exec).call(st, bind, ...a) as T | undefined;
    },
    all: <T = Row>(sql: string, ...a: Arg[]) => {
      const st = prep(sql, re);
      return (st.all as Exec).call(st, bind, ...a) as T[];
    },
    run: (sql: string, ...a: Arg[]) => {
      const st = prep(sql, re);
      return (st.run as Exec).call(st, bind, ...a) as RunResult;
    },
  });
}

export function tdb(tenantId: TenantId): TenantDb {
  if (typeof tenantId !== "string" || !tenantId) throw new TenantSqlError("tenantId хоосон");
  return bound(HAS_TENANT, { tenant: tenantId });
}

/**
 * Түншийн боодол (§4A) — SQL-д `:partner` заавал. Зөвхөн src/lib/partner/** болон tenant/partner.ts-д.
 * Tenant-ын өгөгдлийн хүснэгт рүү зөвхөн `merchant IN (SELECT id FROM tenants WHERE partner_id = :partner)` хэлбэрээр, тоон нийлбэр л.
 */
export function pdbFor(partnerId: string): TenantDb {
  if (typeof partnerId !== "string" || !partnerId) throw new TenantSqlError("partnerId хоосон");
  return bound(HAS_PARTNER, { partner: partnerId });
}
