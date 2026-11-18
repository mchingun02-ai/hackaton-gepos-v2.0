import { decideAction } from "@/lib/agent/agent";
import { api } from "@/lib/agent/api";
import { requireTenant } from "@/lib/tenant/auth";

/** { approve: boolean, who } — эрсдэлтэй үйлдлийг батлах/татгалзах */
export const POST = api(async (req: Request, rc: RouteContext<"/api/agent/actions/[id]">) => {
  const ctx = requireTenant(req, "agent:director");
  const { id } = await rc.params;
  const b = (await req.json().catch(() => ({}))) as { approve?: boolean; who?: string };
  return Response.json(await decideAction(ctx, id, b.approve === true, String(b.who ?? "Захирал").slice(0, 60)));
});
