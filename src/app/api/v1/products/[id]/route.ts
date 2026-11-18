import { getProduct } from "@/lib/v1/connector";
import { v1, v1Tenant } from "@/lib/v1/http";

/** GET /api/v1/products/{id} */
export const GET = v1(async (req: Request, rc: RouteContext<"/api/v1/products/[id]">) => {
  const ctx = v1Tenant(req, "connector:read");
  return Response.json(await getProduct(ctx, (await rc.params).id));
});
