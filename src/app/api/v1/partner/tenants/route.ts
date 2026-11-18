import { partnerReq } from "@/lib/partner/http";
import { createTenant, listTenants } from "@/lib/partner/tenants";
import { paged, pageOf, readJson, v1 } from "@/lib/v1/http";

/** GET /api/v1/partner/tenants?status=&cursor=&limit= */
export const GET = v1(async (req: Request) => {
  const p = partnerReq(req);
  const pg = pageOf(req);
  const st = new URL(req.url).searchParams.get("status");
  return Response.json(paged(listTenants(p, { status: st && ["pending_terms", "active", "suspended"].includes(st) ? st : null, after: pg.after, limit: pg.limit }), pg.limit, (t) => t.tenantId));
});

/** POST /api/v1/partner/tenants {extMerchantId, name, regNo?} — extMerchantId-аар idempotent */
export const POST = v1(async (req: Request) => {
  const p = partnerReq(req);
  const r = createTenant(p, await readJson(req, 10_000));
  return Response.json({ tenantId: r.tenant.tenantId, status: r.tenant.status, posKind: r.tenant.posKind, created: r.created, ...(r.connectorKey ? { connectorKey: r.connectorKey } : {}) }, { status: r.created ? 201 : 200 });
});
