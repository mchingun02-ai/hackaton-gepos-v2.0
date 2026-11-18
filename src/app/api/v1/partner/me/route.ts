import { partnerReq } from "@/lib/partner/http";
import { partnerMe } from "@/lib/partner/settings";
import { v1 } from "@/lib/v1/http";

/** GET /api/v1/partner/me */
export const GET = v1(async (req: Request) => Response.json(partnerMe(partnerReq(req))));
