import { listStock, setStock } from "@/lib/v1/connector";
import { idempotent, readJson, v1, v1Tenant } from "@/lib/v1/http";

/** GET /api/v1/stock?productIds=a,b */
export const GET = v1(async (req: Request) => {
  const ctx = v1Tenant(req, "connector:read");
  const ids = (new URL(req.url).searchParams.get("productIds") || "").split(",").map((s) => s.trim()).filter(Boolean).slice(0, 200);
  return Response.json(await listStock(ctx, ids));
});

/** PUT /api/v1/stock — үлдэгдлийн түвшин бөөнөөр оноох (sync) */
export const PUT = v1(async (req: Request) => {
  const ctx = v1Tenant(req, "connector:write");
  return idempotent(ctx, req, async () => Response.json(setStock(ctx, await readJson(req, 2_000_000))));
});
