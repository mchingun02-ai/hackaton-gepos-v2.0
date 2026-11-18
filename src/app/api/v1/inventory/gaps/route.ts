import { api } from "@/lib/agent/api";
import { shelfGaps } from "@/lib/inventory/gaps";
import { requireTenant } from "@/lib/tenant/auth";

/** ?session= — тавиурын цоорхой ба тавиурт алга (агуулахаас гаргах) бараа */
export const GET = api(async (req: Request) => {
  const ctx = requireTenant(req, "inventory:count");
  return Response.json(await shelfGaps(ctx, new URL(req.url).searchParams.get("session")));
});
