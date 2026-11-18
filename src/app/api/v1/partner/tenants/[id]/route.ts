import { partnerReq } from "@/lib/partner/http";
import { ownTenant } from "@/lib/partner/tenants";
import { v1 } from "@/lib/v1/http";

/** GET /api/v1/partner/tenants/{id} — төлөв, багц, үлдэгдэл, сүүлд идэвхтэй (агуулгагүй) */
export const GET = v1(async (req: Request, rc: RouteContext<"/api/v1/partner/tenants/[id]">) => Response.json(ownTenant(partnerReq(req), (await rc.params).id)));
