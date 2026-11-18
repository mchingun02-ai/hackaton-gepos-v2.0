import { partnerReq } from "@/lib/partner/http";
import { setConnector } from "@/lib/partner/settings";
import { readJson, v1 } from "@/lib/v1/http";

/** PUT /api/v1/partner/connector {url, mode:"live"|"sync"} → {secret} (нэг удаа) */
export const PUT = v1(async (req: Request) => {
  const p = partnerReq(req);
  return Response.json(setConnector(p, await readJson(req, 4000)));
});
