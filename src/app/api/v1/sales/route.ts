import { listSales, pushSales } from "@/lib/v1/connector";
import { idempotent, pageOf, readJson, v1, v1fail, v1Tenant } from "@/lib/v1/http";

/** GET /api/v1/sales?from=&to=&cursor=&limit= (sync) */
export const GET = v1(async (req: Request) => {
  const ctx = v1Tenant(req, "connector:read");
  const u = new URL(req.url).searchParams;
  const from = u.get("from") ? Date.parse(u.get("from")!) : Date.now() - 30 * 86_400_000;
  const to = u.get("to") ? Date.parse(u.get("to")!) : Date.now();
  if (!Number.isFinite(from) || !Number.isFinite(to)) v1fail(400, "from/to: ISO-8601");
  return Response.json(listSales(ctx, { ...pageOf(req), from, to }));
});

/** POST /api/v1/sales — борлуулалт түлхэх (≤500, extId-аар давхардахгүй) */
export const POST = v1(async (req: Request) => {
  const ctx = v1Tenant(req, "connector:write");
  return idempotent(ctx, req, async () => Response.json(pushSales(ctx, await readJson(req, 4_000_000))));
});
