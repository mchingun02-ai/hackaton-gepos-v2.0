import { access } from "@/lib/tenant/access";
import { requireRole } from "@/lib/tenant/auth";
import { parseRetention, retentionFor } from "@/lib/tenant/retention";
import { readJson, v1, v1Tenant } from "@/lib/v1/http";

/** PUT /api/v1/privacy/retention — мерчант хадгалах хугацааг БОГИНОСГОНО (түншийн бодлогоос урт болгохгүй) */
export const PUT = v1(async (req: Request) => {
  const ctx = v1Tenant(req, "dashboard");
  requireRole(ctx, ["owner", "manager"]);
  const r = parseRetention(await readJson(req, 2000));
  ctx.db.run(`UPDATE tenants SET retention = ? WHERE id = :tenant`, JSON.stringify(r));
  access(ctx, "retention.set", "tenant", 1);
  const { source: _s, ...eff } = retentionFor(ctx.tenantId);
  void _s;
  return Response.json({ retention: eff });
});
