import { api } from "@/lib/agent/api";
import { requireRole, requireTenant, rotateWidget, widgetToken } from "@/lib/tenant/auth";

/** Мерчантын нийтийн чат/дуудлагын холбоосны widget токен (QR) */
export const GET = api(async (req: Request) => Response.json({ token: widgetToken(requireTenant(req, "dashboard")) }));

/** Токен эргүүлэх — хуучин QR, холбоос хүчингүй (owner/manager) */
export const POST = api(async (req: Request) => {
  const ctx = requireTenant(req, "agent:director");
  requireRole(ctx, ["owner", "manager"]);
  return Response.json({ token: rotateWidget(ctx) });
});
