import { api } from "@/lib/agent/api";
import { deleteDraft, getDraft } from "@/lib/inventory/drafts";
import { requireTenant } from "@/lib/tenant/auth";

export const GET = api(async (req: Request, rc: RouteContext<"/api/v1/inventory/drafts/[id]">) => {
  const ctx = requireTenant(req, "inventory:count");
  return Response.json(await getDraft(ctx, (await rc.params).id));
});

export const DELETE = api(async (req: Request, rc: RouteContext<"/api/v1/inventory/drafts/[id]">) => {
  const ctx = requireTenant(req, "inventory:count");
  return Response.json(deleteDraft(ctx, (await rc.params).id));
});
