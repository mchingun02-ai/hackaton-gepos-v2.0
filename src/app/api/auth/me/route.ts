import { api } from "@/lib/agent/api";
import { currentTenant } from "@/lib/tenant/auth";

/** Одоогийн нэвтрэлт. Нэвтрээгүй бол 200 { authenticated: false } (хөтчийн консолд алдаа гаргахгүй). */
export const GET = api(async (req: Request) => {
  const ctx = currentTenant(req);
  if (!ctx || ctx.principal.kind !== "session") return Response.json({ authenticated: false });
  const t = ctx.db.one<{ name: string; public_id: string; pos_kind: string; status: string }>(`SELECT name, public_id, pos_kind, status FROM tenants WHERE id = :tenant`);
  const p = ctx.principal;
  return Response.json({
    authenticated: true,
    tenant: { id: ctx.tenantId, name: t?.name ?? "", posKind: t?.pos_kind ?? "gepos", status: t?.status ?? "active" },
    user: { name: p.name, role: p.role, staffId: p.staffId },
    scopes: [...ctx.scopes],
    capabilities: ctx.pos.capabilities,
  });
});
