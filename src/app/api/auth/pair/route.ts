import { api, ipOf, rate } from "@/lib/agent/api";
import { createPairing, redeemPairing, requireRole, requireTenant, sameOrigin, sessionCookie } from "@/lib/tenant/auth";
import { fail } from "@/lib/tenant/http";

/** POST { code, device? } — PWA төхөөрөмжийг 8 тэмдэгтийн нэг удаагийн кодоор холбоно (role=device, 30 хоног) */
export const POST = api(async (req: Request) => {
  if (!sameOrigin(req)) fail(403, "Хүсэлтийн эх сурвалж буруу");
  rate(`pair:${ipOf(req)}`, 10);
  const b = (await req.json().catch(() => ({}))) as { code?: string; device?: string };
  const r = redeemPairing(String(b.code ?? ""), String(b.device ?? ""));
  return Response.json({ ok: true, role: "device" }, { headers: { "Set-Cookie": sessionCookie(req, r.session) } });
});

/** PUT — самбараас шинэ код үүсгэнэ (owner/manager), 10 минут хүчинтэй */
export const PUT = api(async (req: Request) => {
  const ctx = requireTenant(req, "dashboard");
  requireRole(ctx, ["owner", "manager"]);
  return Response.json(createPairing(ctx));
});
