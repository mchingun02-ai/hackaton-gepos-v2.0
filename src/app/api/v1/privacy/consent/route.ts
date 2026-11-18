import { access } from "@/lib/tenant/access";
import { requireRole } from "@/lib/tenant/auth";
import { readJson, v1, v1Tenant } from "@/lib/v1/http";

/** PUT /api/v1/privacy/consent { exportToPartner: boolean } — түншид экспорт хийхийг зөвшөөрөх (бүртгэгдэнэ) */
export const PUT = v1(async (req: Request) => {
  const ctx = v1Tenant(req, "dashboard");
  requireRole(ctx, ["owner"]);
  const b = await readJson<{ exportToPartner?: boolean }>(req, 1000);
  ctx.db.run(`UPDATE tenants SET export_consent_at = ? WHERE id = :tenant`, b.exportToPartner ? Date.now() : null);
  access(ctx, b.exportToPartner ? "consent.export.grant" : "consent.export.revoke", "tenant", 1);
  return Response.json({ exportToPartner: !!b.exportToPartner });
});
