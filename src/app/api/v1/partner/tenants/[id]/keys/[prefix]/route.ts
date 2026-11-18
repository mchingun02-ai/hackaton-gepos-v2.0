import { partnerReq } from "@/lib/partner/http";
import { revokeTenantKey } from "@/lib/partner/keys";
import { audit, ownTenant } from "@/lib/partner/tenants";
import { v1 } from "@/lib/v1/http";

/** DELETE /api/v1/partner/tenants/{id}/keys/{prefix} */
export const DELETE = v1(async (req: Request, rc: RouteContext<"/api/v1/partner/tenants/[id]/keys/[prefix]">) => {
  const p = partnerReq(req);
  const { id, prefix } = await rc.params;
  ownTenant(p, id);
  const r = revokeTenantKey(p, id, prefix);
  audit(p, "key.revoke", id, prefix);
  return Response.json(r);
});
