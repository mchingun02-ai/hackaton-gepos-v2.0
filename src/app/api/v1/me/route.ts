import { v1, v1Tenant } from "@/lib/v1/http";

/** GET /api/v1/me — tenant нэр, pos_kind, scopes, capabilities (дурын scope) */
export const GET = v1(async (req: Request) => {
  const ctx = v1Tenant(req, []);
  const t = ctx.db.one<{ name: string; pos_kind: string; status: string; public_id: string }>(`SELECT name, pos_kind, status, public_id FROM tenants WHERE id = :tenant`);
  return Response.json({
    tenant: { id: ctx.tenantId, name: t?.name ?? "", posKind: t?.pos_kind ?? "gepos", status: t?.status ?? "active" },
    principal: ctx.principal.kind,
    scopes: [...ctx.scopes],
    capabilities: ctx.pos.capabilities,
  });
});
