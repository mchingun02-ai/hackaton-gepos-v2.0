import { mintEmbed } from "@/lib/partner/embed";
import { partnerReq } from "@/lib/partner/http";
import { readJson, v1 } from "@/lib/v1/http";

/** POST /api/v1/partner/tenants/{id}/embed-token {user:{id,name,role}, view} → {token, url, expiresAt} (5 мин, нэг удаа) */
export const POST = v1(async (req: Request, rc: RouteContext<"/api/v1/partner/tenants/[id]/embed-token">) => {
  const p = partnerReq(req);
  return Response.json(mintEmbed(p, (await rc.params).id, await readJson(req, 4000), new URL(req.url).origin), { status: 201 });
});
