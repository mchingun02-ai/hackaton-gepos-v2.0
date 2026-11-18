import { partnerReq } from "@/lib/partner/http";
import { audit, ownTenant } from "@/lib/partner/tenants";
import { access } from "@/lib/tenant/access";
import { partnerJobContext } from "@/lib/tenant/auth";
import { createExport } from "@/lib/tenant/erase";
import { v1, v1fail } from "@/lib/v1/http";

/**
 * POST /api/v1/partner/tenants/{id}/export — зөвхөн мерчант «Түншид экспортыг зөвшөөрөх»-ийг асаасан (бүртгэгдсэн) үед.
 * Үгүй бол 403 consent_required — архивыг мерчантын эзэн embed доторх «Өгөгдөл ба нууцлал»-аас өөрөө татна.
 */
export const POST = v1(async (req: Request, rc: RouteContext<"/api/v1/partner/tenants/[id]/export">) => {
  const p = partnerReq(req);
  const id = (await rc.params).id;
  ownTenant(p, id);
  const ctx = partnerJobContext(p, id, "export") ?? v1fail(404, "Tenant олдсонгүй");
  if (!ctx.db.one<{ c: number | null }>(`SELECT export_consent_at AS c FROM tenants WHERE id = :tenant`)?.c)
    v1fail(403, "Мерчант түншид экспорт хийхийг зөвшөөрөөгүй байна (Өгөгдөл ба нууцлал → зөвшөөрөл)", "consent_required");
  const e = createExport(ctx);
  access(ctx, "export", "partner", e.rows, { kind: "partner", id: p.principal.prefix });
  audit(p, "tenant.export", id);
  const base = (process.env.SP_PUBLIC_URL || new URL(req.url).origin).replace(/\/$/, "");
  return Response.json({ url: `${base}/api/v1/exports/${e.token}`, expiresAt: e.expiresAt, rows: e.rows });
});
