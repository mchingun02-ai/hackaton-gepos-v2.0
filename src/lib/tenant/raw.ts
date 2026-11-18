/**
 * Түрээслэгчгүй (raw) өгөгдлийн хандалт — ЗӨВХӨН src/lib/tenant/** дотор.
 * Хууль ёсны tenant-гүй хайлт: api_keys.hash, sessions.hash, invoices.id (QPay callback), tenants.public_id,
 * pairings.code. Бусад бүх код `ctx.db` (tdb.ts)-ээр — `:tenant`-гүй SQL ажиллахгүй.
 */
export { all as rawAll, db as rawDb, one as rawOne, run as rawRun } from "@/lib/agent/db";
