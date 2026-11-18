import { api, bad, createKey, listKeys, revokeKey } from "@/lib/agent/api";
import { requireRole, requireTenant } from "@/lib/tenant/auth";
import type { Scope } from "@/lib/tenant/context";

/** MCP / API түлхүүр — зөвхөн эзэмшигч (owner) */
function owner(req: Request) {
  const ctx = requireTenant(req, "dashboard");
  requireRole(ctx, ["owner"]);
  return ctx;
}
export const GET = api(async (req: Request) => Response.json({ keys: listKeys(owner(req)) }));
/** { label, scopes? } — анхдагч ["mcp"] */
export const POST = api(async (req: Request) => {
  const ctx = owner(req);
  const b = (await req.json().catch(() => ({}))) as { label?: string; scopes?: unknown };
  const scopes = Array.isArray(b.scopes) ? (b.scopes.map(String) as Scope[]) : undefined;
  return Response.json({ key: createKey(ctx, String(b.label ?? "MCP"), scopes) });
});
export const DELETE = api(async (req: Request) => {
  const ctx = owner(req);
  return Response.json({ ok: revokeKey(ctx, new URL(req.url).searchParams.get("prefix") ?? "") || bad("Түлхүүр олдсонгүй", 404) });
});
