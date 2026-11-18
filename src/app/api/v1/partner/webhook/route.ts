import { partnerReq } from "@/lib/partner/http";
import { setWebhook } from "@/lib/partner/settings";
import { readJson, v1 } from "@/lib/v1/http";

/** PUT /api/v1/partner/webhook {url, events} → {secret} (нэг удаа) */
export const PUT = v1(async (req: Request) => {
  const p = partnerReq(req);
  return Response.json(setWebhook(p, await readJson(req, 4000)));
});
