import { partnerReq } from "@/lib/partner/http";
import { setSuspended } from "@/lib/partner/tenants";
import { v1 } from "@/lib/v1/http";

/** POST /api/v1/partner/tenants/{id}/resume */
export const POST = v1(async (req: Request, rc: RouteContext<"/api/v1/partner/tenants/[id]/resume">) => Response.json(setSuspended(partnerReq(req), (await rc.params).id, false)));
