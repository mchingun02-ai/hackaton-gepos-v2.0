import { partnerReq } from "@/lib/partner/http";
import { issueTenantKey } from "@/lib/partner/keys";
import { audit } from "@/lib/partner/tenants";
import { partnerAccess } from "@/lib/tenant/access";
import { readJson, v1 } from "@/lib/v1/http";

/** POST /api/v1/partner/tenants/{id}/keys {label, scopes} — connector:read|write, inventory:count (mcp/agent:* → 400) */
export const POST = v1(async (req: Request, rc: RouteContext<"/api/v1/partner/tenants/[id]/keys">) => {
  const p = partnerReq(req);
  const id = (await rc.params).id;
  const b = await readJson<{ label?: string; scopes?: string[] }>(req, 4000);
  const k = issueTenantKey(p, id, b.label, b.scopes);
  audit(p, "key.issue", id, k.prefix);
  partnerAccess(p.partnerId, "key.issue", k.scopes.join(","), 1, p.requestId, p.principal.prefix);
  return Response.json(k, { status: 201 });
});
