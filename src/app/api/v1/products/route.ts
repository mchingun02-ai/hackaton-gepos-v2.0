import { listProducts, upsertProducts } from "@/lib/v1/connector";
import { idempotent, pageOf, readJson, v1, v1Tenant } from "@/lib/v1/http";

/** GET /api/v1/products?barcode=&search=&updated_since=&cursor=&limit= */
export const GET = v1(async (req: Request) => {
  const ctx = v1Tenant(req, "connector:read");
  const u = new URL(req.url).searchParams;
  return Response.json(await listProducts(ctx, { ...pageOf(req), search: u.get("search"), barcode: u.get("barcode"), updatedSince: u.get("updated_since") }));
});

/** PUT /api/v1/products — бөөнөөр upsert (≤500, extId-аар), sync горимд */
export const PUT = v1(async (req: Request) => {
  const ctx = v1Tenant(req, "connector:write");
  return idempotent(ctx, req, async () => Response.json(upsertProducts(ctx, await readJson(req, 4_000_000))));
});
