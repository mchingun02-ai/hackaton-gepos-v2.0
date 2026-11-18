import { api } from "@/lib/agent/api";
import { voidCount } from "@/lib/inventory/sessions";
import { requireTenant } from "@/lib/tenant/auth";

/** Тоог хүчингүй болгоно (мөр устахгүй — аудит) */
export const DELETE = api(async (req: Request, rc: RouteContext<"/api/v1/inventory/sessions/[id]/counts/[cid]">) => {
  const ctx = requireTenant(req, "inventory:count");
  const { id, cid } = await rc.params;
  return Response.json(voidCount(ctx, id, cid));
});
