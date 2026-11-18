import { usageMetrics } from "@/lib/agent/billing";
import { v1, v1Tenant } from "@/lib/v1/http";

/** GET /api/v1/usage?days=30 — §7 хэрэглээний хэмжүүр */
export const GET = v1(async (req: Request) => {
  const ctx = v1Tenant(req, "usage:read");
  return Response.json(usageMetrics(ctx, Number(new URL(req.url).searchParams.get("days") || 30)));
});
