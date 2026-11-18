import { api } from "@/lib/agent/api";
import { listTickets } from "@/lib/agent/crm";
import { requireTenant } from "@/lib/tenant/auth";

export const GET = api(async (req: Request) => {
  const ctx = requireTenant(req, "dashboard");
  return Response.json({ tickets: listTickets(ctx, new URL(req.url).searchParams.get("status") ?? "") });
});
