import { api, ipOf, rate } from "@/lib/agent/api";
import { createSession, currentTenant, DEVICE_TTL_MS, endSession, SESSION_TTL_MS, sessionCookie, staffPinLogin } from "@/lib/tenant/auth";
import { fail } from "@/lib/tenant/http";

/** POST { pin } — нэвтэрсэн session-ий tenant дотор ажилтан PIN-ээр солигдоно (session шинэчлэгдэнэ) */
export const POST = api(async (req: Request) => {
  const ctx = currentTenant(req) ?? fail(401, "Нэвтрээгүй байна");
  if (ctx.principal.kind !== "session") fail(403, "Зөвхөн нэвтэрсэн төхөөрөмжөөс");
  rate(`staff:${ctx.tenantId}:${ipOf(req)}`, 5);
  const b = (await req.json().catch(() => ({}))) as { pin?: string };
  const who = staffPinLogin(ctx, String(b.pin ?? ""));
  const device = ctx.principal.kind === "session" && ctx.principal.role === "device";
  endSession(req);
  const s = createSession(ctx.tenantId, { ...who, device: device ? "PWA" : null, via: device ? "pair" : "login" }, device ? DEVICE_TTL_MS : SESSION_TTL_MS);
  return Response.json({ ok: true, user: who }, { headers: { "Set-Cookie": sessionCookie(req, s) } });
});
