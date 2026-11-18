import { listAdjustments } from "@/lib/v1/connector";
import { pageOf, v1, v1Tenant } from "@/lib/v1/http";

/** GET /api/v1/stock-adjustments?status=pending|applied|all — батлагдсан тооллогын засвар */
export const GET = v1(async (req: Request) => {
  const ctx = v1Tenant(req, "connector:read");
  return Response.json(listAdjustments(ctx, { ...pageOf(req), status: new URL(req.url).searchParams.get("status") || "pending" }));
});
