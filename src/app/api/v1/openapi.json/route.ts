import { openapi } from "@/lib/v1/openapi";

/** GET /api/v1/openapi.json — OpenAPI 3.1 (эх: src/lib/v1/openapi.ts) */
export function GET(req: Request) {
  return Response.json(openapi(new URL(req.url).origin), { headers: { "Cache-Control": "public, max-age=300", "Access-Control-Allow-Origin": "*" } });
}
