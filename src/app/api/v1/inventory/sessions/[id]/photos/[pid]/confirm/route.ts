import { api } from "@/lib/agent/api";
import { readJson } from "@/lib/inventory/http";
import { confirmPhoto } from "@/lib/inventory/sessions";
import { requireTenant } from "@/lib/tenant/auth";

/**
 * { place?, items: [{ productId, f, d, r?, l?, confidence? }] } — зургийн тоог батлах.
 * Тухайн байршлын өмнөх зургийн тоог СОЛИНО (нэмэхгүй); дахин илгээвэл ижил үр дүн.
 */
export const POST = api(async (req: Request, rc: RouteContext<"/api/v1/inventory/sessions/[id]/photos/[pid]/confirm">) => {
  const ctx = requireTenant(req, "inventory:count");
  const { id, pid } = await rc.params;
  const b = await readJson<{ place?: unknown; items?: unknown }>(req);
  return Response.json(await confirmPhoto(ctx, id, pid, b));
});
