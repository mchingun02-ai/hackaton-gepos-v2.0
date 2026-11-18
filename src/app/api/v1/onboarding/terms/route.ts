import { access } from "@/lib/tenant/access";
import { requireRole } from "@/lib/tenant/auth";
import { enqueuePartnerEvent } from "@/lib/tenant/outbox";
import { readJson, v1, v1fail, v1Tenant } from "@/lib/v1/http";

/** POST /api/v1/onboarding/terms { accept: true } — үйлчилгээний нөхцөл + өгөгдөл боловсруулах зөвшөөрөл (зөвхөн owner) */
export const POST = v1(async (req: Request) => {
  const ctx = v1Tenant(req, "billing");
  requireRole(ctx, ["owner"]);
  const b = await readJson<{ accept?: boolean }>(req, 2000);
  if (b.accept !== true) v1fail(400, "accept: true шаардлагатай");
  const who = ctx.principal.kind === "session" ? ctx.principal.name : "";
  const r = ctx.db.run(`UPDATE tenants SET terms_at = ?, terms_by = ?, status = 'active' WHERE id = :tenant AND status = 'pending_terms'`, Date.now(), who.slice(0, 60));
  if (Number(r.changes)) {
    access(ctx, "terms.accept", "tenant", 1);
    enqueuePartnerEvent(ctx.tenantId, "tenant.activated", {});
  }
  const t = ctx.db.one<{ status: string; terms_at: number | null }>(`SELECT status, terms_at FROM tenants WHERE id = :tenant`)!;
  return Response.json({ status: t.status, termsAcceptedAt: t.terms_at ? new Date(t.terms_at).toISOString() : null });
});
