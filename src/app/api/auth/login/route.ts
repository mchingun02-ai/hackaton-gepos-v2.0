import { api, ipOf, rate } from "@/lib/agent/api";
import { createSession, passwordLogin, sameOrigin, sessionCookie, type LoginInput } from "@/lib/tenant/auth";
import { fail } from "@/lib/tenant/http";

/**
 * POST { regNo, pin, bootstrap? } эсвэл { regNo, puk, newPin } — мерчант (эзэмшигч) нэвтрэх.
 * PIN-ийг серверийн sp_state-тэй харьцуулна; амжилттай бол HttpOnly cookie `gp_s` (12 цаг).
 */
export const POST = api(async (req: Request) => {
  if (!sameOrigin(req)) fail(403, "Хүсэлтийн эх сурвалж буруу");
  const raw = await req.text();
  if (raw.length > 15_000_000) fail(413, "Хэт том");
  let b: LoginInput;
  try {
    b = JSON.parse(raw || "{}") as LoginInput;
  } catch {
    return fail(400, "JSON буруу");
  }
  rate(`login:${String(b.regNo ?? "").slice(0, 20)}:${ipOf(req)}`, 5);
  const r = passwordLogin(b);
  const s = createSession(r.tenantId, { staffId: "owner", name: "Мерчант админ", role: "owner" });
  return Response.json({ ok: true, tenant: { id: r.tenantId, name: r.name }, user: { name: "Мерчант админ", role: "owner" } }, { headers: { "Set-Cookie": sessionCookie(req, s) } });
});
