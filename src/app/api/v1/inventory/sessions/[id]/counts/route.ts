import { api } from "@/lib/agent/api";
import { readJson } from "@/lib/inventory/http";
import { addCount, type CountInput } from "@/lib/inventory/sessions";
import { requireTenant } from "@/lib/tenant/auth";

/**
 * { clientId (uuid — давхардлаас), productId | barcode, method, inputs, source?, photoId?, confidence?, place?, mode? ("add" | "replace"), profile?, confirmLarge? }
 * Ижил clientId (эсвэл Idempotency-Key) дахин ирвэл шинээр бичихгүй, өмнөх үр дүнг буцаана.
 */
export const POST = api(async (req: Request, rc: RouteContext<"/api/v1/inventory/sessions/[id]/counts">) => {
  const ctx = requireTenant(req, "inventory:count");
  const { id } = await rc.params;
  const b = await readJson<CountInput>(req);
  const r = await addCount(ctx, id, b, req.headers.get("idempotency-key"));
  // conflict — тухайн байршилд аль хэдийн тоологдсон: бичихгүй, «Нэмэх / Солих» асууна (mode)
  return Response.json(r, { status: r.duplicate || ("conflict" in r && r.conflict) ? 200 : 201 });
});
