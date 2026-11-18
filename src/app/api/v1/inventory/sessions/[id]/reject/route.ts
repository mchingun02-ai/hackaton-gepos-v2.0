import { api } from "@/lib/agent/api";
import { readJson } from "@/lib/inventory/http";
import { rejectSession } from "@/lib/inventory/sessions";
import { requireRole, requireTenant } from "@/lib/tenant/auth";

/** { reason?, productIds? } — буцааж дахин тоолуулна (анхдагч: бүх «Дахин тоолох» мөр) */
export const POST = api(async (req: Request, rc: RouteContext<"/api/v1/inventory/sessions/[id]/reject">) => {
  const ctx = requireTenant(req, "inventory:approve");
  requireRole(ctx, ["owner", "manager"]);
  const { id } = await rc.params;
  const b = await readJson<{ reason?: unknown; productIds?: unknown }>(req);
  return Response.json(rejectSession(ctx, id, b));
});
