import { api, bad } from "@/lib/agent/api";
import { updateTicket } from "@/lib/agent/crm";
import { requireTenant } from "@/lib/tenant/auth";

/** { status, resolution, assignee, priority } */
export const PATCH = api(async (req: Request, rc: RouteContext<"/api/agent/tickets/[id]">) => {
  const ctx = requireTenant(req, "dashboard");
  const { id } = await rc.params;
  const b = (await req.json().catch(() => ({}))) as Record<string, string>;
  const t = updateTicket(ctx, id, {
    status: ["open", "in_progress", "resolved"].includes(b.status) ? (b.status as "open") : undefined,
    resolution: b.resolution?.slice(0, 2000),
    assignee: b.assignee?.slice(0, 80),
    priority: ["low", "normal", "high"].includes(b.priority) ? (b.priority as "normal") : undefined,
  });
  return Response.json(t ?? bad("Тасалбар олдсонгүй", 404));
});
