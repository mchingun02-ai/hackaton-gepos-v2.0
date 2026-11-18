import { api } from "@/lib/agent/api";
import { varianceReport } from "@/lib/inventory/sessions";
import { requireTenant } from "@/lib/tenant/auth";

/** Зөрүүний тайлан (хараагүй тооллогод зөвхөн менежер) */
export const GET = api(async (req: Request, rc: RouteContext<"/api/v1/inventory/sessions/[id]/variance">) => {
  const ctx = requireTenant(req, "inventory:count");
  return Response.json(varianceReport(ctx, (await rc.params).id));
});
