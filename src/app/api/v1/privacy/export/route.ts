import { access } from "@/lib/tenant/access";
import { requireRole } from "@/lib/tenant/auth";
import { createExport } from "@/lib/tenant/erase";
import { rate } from "@/lib/tenant/http";
import { v1, v1Tenant } from "@/lib/v1/http";

/** POST /api/v1/privacy/export — мерчантын эзэн өөрөө: тайлсан JSON-ийн нэг удаагийн 15 минутын холбоос */
export const POST = v1(async (req: Request) => {
  const ctx = v1Tenant(req, "dashboard");
  requireRole(ctx, ["owner"]);
  rate(`export:${ctx.tenantId}`, 3);
  const e = createExport(ctx);
  access(ctx, "export", "owner", e.rows);
  return Response.json({ url: `/api/v1/exports/${e.token}`, expiresAt: e.expiresAt, rows: e.rows, tables: e.tables });
});
