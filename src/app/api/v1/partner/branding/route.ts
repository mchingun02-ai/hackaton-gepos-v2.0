import { partnerReq } from "@/lib/partner/http";
import { setBranding } from "@/lib/partner/settings";
import { readJson, v1 } from "@/lib/v1/http";

/** PUT /api/v1/partner/branding {name, logoUrl, color, frameOrigins} — white-label */
export const PUT = v1(async (req: Request) => {
  const p = partnerReq(req);
  return Response.json(setBranding(p, await readJson(req, 10_000)));
});
