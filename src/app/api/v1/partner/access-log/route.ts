import { partnerReq } from "@/lib/partner/http";
import { accessLog } from "@/lib/partner/settings";
import { pageOf, v1, v1fail } from "@/lib/v1/http";

/** GET /api/v1/partner/access-log?tenant=&since=&limit= — хэн, хэзээ, төрөл, тоо (агуулгагүй) */
export const GET = v1(async (req: Request) => {
  const p = partnerReq(req);
  const u = new URL(req.url).searchParams;
  const since = u.get("since") ? Date.parse(u.get("since")!) : 0;
  if (!Number.isFinite(since)) v1fail(400, "since: ISO-8601");
  return Response.json({ items: accessLog(p, { tenant: u.get("tenant"), since, limit: pageOf(req, 100).limit }) });
});
