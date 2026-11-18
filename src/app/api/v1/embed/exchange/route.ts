import { access } from "@/lib/tenant/access";
import { embedExchange, embedSessionCookie, systemContext } from "@/lib/tenant/auth";
import { FA_COOKIE, signFa } from "@/lib/tenant/embed";
import { ipOf, isHttps, rate } from "@/lib/tenant/http";
import { readJson, v1 } from "@/lib/v1/http";
import { brandOf } from "@/lib/v1/brand";

/**
 * POST /api/v1/embed/exchange { token: "get_…" } → session cookie (via='partner:<id>') + gp_fa (frame-ancestors)
 * /connect хуудас дуудна. Токен 5 мин, НЭГ удаа.
 */
export const POST = v1(async (req: Request) => {
  rate(`embed:${ipOf(req)}`, 30);
  const b = await readJson<{ token?: string }>(req, 4000);
  const { tenantId, session, payload } = embedExchange(String(b.token ?? ""));
  const sys = systemContext(tenantId, "embed");
  access({ ...sys, principal: { kind: "system", job: "embed" } }, "session.embed", payload.v, 1, { kind: "partner_user", id: `ext:${payload.u.id}` });
  const t = sys.db.one<{ name: string; status: string; pos_kind: string }>(`SELECT name, status, pos_kind FROM tenants WHERE id = :tenant`)!;
  const h = new Headers({ "Content-Type": "application/json" });
  h.append("Set-Cookie", embedSessionCookie(req, session));
  const sec = isHttps(req);
  h.append("Set-Cookie", `${FA_COOKIE}=${signFa(payload.fa)}; Path=/; HttpOnly; Max-Age=${session.maxAge}; ${sec ? "SameSite=None; Secure; Partitioned" : "SameSite=Lax"}`);
  return new Response(
    JSON.stringify({ tenant: { name: t.name, status: t.status, posKind: t.pos_kind }, user: { name: payload.u.name, role: payload.u.role }, view: payload.v, brand: brandOf(sys) }),
    { status: 200, headers: h },
  );
});
