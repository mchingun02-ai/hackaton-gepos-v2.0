/** API route-уудын нийтлэг туслахууд: алдааг JSON болгох, хязгаарлалт, API түлхүүр. Таних — tenant/auth.ts. */
import { createHash, randomBytes } from "node:crypto";
import { SpError } from "@/lib/sp/core";
import { KEY_SCOPES } from "@/lib/tenant/auth";
import type { Scope, TenantContext } from "@/lib/tenant/context";
import { errorResponse, HttpError } from "@/lib/tenant/http";
import { TenantSqlError } from "@/lib/tenant/tdb";
import { PayError } from "./billing";
import { AiError } from "./qwen";
import { ToolError } from "./tools";

export { ipOf, rate } from "@/lib/tenant/http";

export function api<A extends unknown[]>(fn: (...a: A) => Promise<Response>) {
  return async (...a: A): Promise<Response> => {
    try {
      return await fn(...a);
    } catch (e) {
      if (e instanceof HttpError) return errorResponse(e);
      if (e instanceof PayError || e instanceof AiError) return Response.json({ error: e.message }, { status: e.status });
      if (e instanceof SpError || e instanceof ToolError) return Response.json({ error: e.message }, { status: 400 });
      if (e instanceof TenantSqlError) console.error("[agent] tenant-гүй SQL", e.message);
      else console.error("[agent]", e);
      return Response.json({ error: "Серверийн алдаа" }, { status: 500 });
    }
  };
}

export const bad = (msg: string, status = 400): never => {
  throw new HttpError(status, msg);
};

/* ───────── API / MCP түлхүүр ───────── */

const sha = (s: string) => createHash("sha256").update(s).digest("hex");
export function createKey(ctx: TenantContext, label: string, scopes: Scope[] = ["mcp"]) {
  const sc = [...new Set(scopes.filter((s) => KEY_SCOPES.includes(s)))];
  if (!sc.length) bad("Эрх (scope) буруу");
  const key = `gai_${randomBytes(24).toString("base64url")}`;
  ctx.db.run(
    `INSERT INTO api_keys (hash, merchant, label, prefix, created_at, scopes) VALUES (?, :tenant, ?, ?, ?, ?)`,
    sha(key),
    label.slice(0, 60) || "MCP",
    key.slice(0, 10),
    Date.now(),
    JSON.stringify(sc),
  );
  return key;
}
export const listKeys = (ctx: TenantContext) =>
  ctx.db.all(`SELECT prefix, label, scopes, created_at, last_used FROM api_keys WHERE merchant = :tenant AND revoked_at IS NULL ORDER BY created_at DESC`);
/** Хүчингүй болгоно (мөр үлдэнэ — аудит) */
export const revokeKey = (ctx: TenantContext, prefix: string) =>
  Number(ctx.db.run(`UPDATE api_keys SET revoked_at = ? WHERE merchant = :tenant AND prefix = ? AND revoked_at IS NULL`, Date.now(), prefix).changes) > 0;
