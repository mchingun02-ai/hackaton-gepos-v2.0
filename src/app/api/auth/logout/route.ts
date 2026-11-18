import { api } from "@/lib/agent/api";
import { clearSessionCookie, endSession, sameOrigin } from "@/lib/tenant/auth";
import { fail } from "@/lib/tenant/http";

/** POST — session-ийг устгаж cookie-г цэвэрлэнэ */
export const POST = api(async (req: Request) => {
  if (!sameOrigin(req)) fail(403, "Хүсэлтийн эх сурвалж буруу");
  endSession(req);
  return Response.json({ ok: true }, { headers: { "Set-Cookie": clearSessionCookie(req) } });
});
