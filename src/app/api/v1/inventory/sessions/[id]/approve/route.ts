import { api } from "@/lib/agent/api";
import { readJson } from "@/lib/inventory/http";
import { approveSession } from "@/lib/inventory/sessions";
import { requireRole, requireTenant } from "@/lib/tenant/auth";

/** { override_reason? } — менежер/эзэмшигч батална → ПОС-ын үлдэгдлийг зөрүүгээр засна. Давхар батлах → 409. */
export const POST = api(async (req: Request, rc: RouteContext<"/api/v1/inventory/sessions/[id]/approve">) => {
  const ctx = requireTenant(req, "inventory:approve");
  requireRole(ctx, ["owner", "manager"]);
  const { id } = await rc.params;
  const b = await readJson<{ override_reason?: unknown }>(req);
  return Response.json(await approveSession(ctx, id, b));
});
