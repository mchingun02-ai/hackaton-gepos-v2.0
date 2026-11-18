import { disconnect } from "@/lib/fb/server";
import { partnerReq } from "@/lib/partner/http";
import { audit, ownTenant } from "@/lib/partner/tenants";
import { partnerAccess } from "@/lib/tenant/access";
import { eraseTenant } from "@/lib/tenant/erase";
import { v1 } from "@/lib/v1/http";

/** DELETE /api/v1/partner/tenants/{id}/data — бүрэн устгалт (DEK + мөр + файл); хариу: тоонуудын гэрчилгээ, агуулгагүй */
export const DELETE = v1(async (req: Request, rc: RouteContext<"/api/v1/partner/tenants/[id]/data">) => {
  const p = partnerReq(req);
  const id = (await rc.params).id;
  ownTenant(p, id);
  // Facebook Page холболт, Messenger-ийн түүх (тусдаа storeplus-fb.db)-ийг ч устгана
  await disconnect(id);
  const deleted = eraseTenant(id);
  const total = Object.values(deleted).reduce((a, x) => a + x, 0);
  audit(p, "tenant.erase", null, String(total));
  partnerAccess(p.partnerId, "delete", "partner", total, p.requestId, p.principal.prefix);
  return Response.json({ tenantId: id, erasedAt: new Date().toISOString(), deleted });
});
