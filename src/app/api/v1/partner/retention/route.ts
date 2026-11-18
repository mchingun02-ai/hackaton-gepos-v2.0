import { partnerReq } from "@/lib/partner/http";
import { setRetention } from "@/lib/partner/settings";
import { readJson, v1 } from "@/lib/v1/http";

/** PUT /api/v1/partner/retention {transcriptsDays, contactsDays, actionsDays, photos} */
export const PUT = v1(async (req: Request) => {
  const p = partnerReq(req);
  return Response.json(setRetention(p, await readJson(req, 2000)));
});
