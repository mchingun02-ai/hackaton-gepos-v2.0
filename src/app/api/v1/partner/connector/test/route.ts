import { partnerReq } from "@/lib/partner/http";
import { testConnector } from "@/lib/partner/settings";
import { readJson, v1 } from "@/lib/v1/http";

/** POST /api/v1/partner/connector/test {extMerchantId?} — бидний гарын үсэгтэй GET /health + products?limit=1 */
export const POST = v1(async (req: Request) => {
  const p = partnerReq(req);
  const b = await readJson<{ extMerchantId?: string }>(req, 2000);
  return Response.json(await testConnector(p, typeof b.extMerchantId === "string" ? b.extMerchantId.slice(0, 64) : undefined));
});
