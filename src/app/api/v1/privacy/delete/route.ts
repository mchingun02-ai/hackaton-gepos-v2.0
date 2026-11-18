import { disconnect } from "@/lib/fb/server";
import { partnerAccess } from "@/lib/tenant/access";
import { clearSessionCookie, requireRole } from "@/lib/tenant/auth";
import { eraseTenant } from "@/lib/tenant/erase";
import { readJson, v1, v1fail, v1Tenant } from "@/lib/v1/http";

/** POST /api/v1/privacy/delete { confirm: "<дэлгүүрийн нэр>" } — мерчантын эзэн бүх өгөгдлөө бүрмөсөн устгана (крипто-устгалт) */
export const POST = v1(async (req: Request) => {
  const ctx = v1Tenant(req, "dashboard");
  requireRole(ctx, ["owner"]);
  const b = await readJson<{ confirm?: string }>(req, 1000);
  const t = ctx.db.one<{ name: string; partner_id: string | null }>(`SELECT name, partner_id FROM tenants WHERE id = :tenant`)!;
  if (String(b.confirm ?? "").trim() !== t.name) v1fail(400, "Баталгаажуулахын тулд дэлгүүрийн нэрийг яг бичнэ үү");
  // Facebook Page холболт, Messenger-ийн түүх (тусдаа storeplus-fb.db)-ийг ч устгана
  await disconnect(ctx.tenantId);
  const counts = eraseTenant(ctx.tenantId);
  const total = Object.values(counts).reduce((a, x) => a + x, 0);
  if (t.partner_id) partnerAccess(t.partner_id, "delete", "owner", total, ctx.requestId);
  return new Response(JSON.stringify({ deleted: counts }), { headers: { "Content-Type": "application/json", "Set-Cookie": clearSessionCookie(req) } });
});
