import { partnerReq } from "@/lib/partner/http";
import { testWebhook } from "@/lib/partner/settings";
import { v1 } from "@/lib/v1/http";

/** POST /api/v1/partner/webhook/test */
export const POST = v1(async (req: Request) => Response.json(await testWebhook(partnerReq(req))));
