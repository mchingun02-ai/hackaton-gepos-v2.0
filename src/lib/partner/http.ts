/** /api/v1/partner/** — зөвхөн gpk_ түлхүүр (tenant key/session → 403), 600 хүсэлт/мин түлхүүр бүрт. */
import type { PartnerContext } from "@/lib/tenant/context";
import { rate } from "@/lib/tenant/http";
import { requirePartner } from "@/lib/tenant/partner";

export function partnerReq(req: Request): PartnerContext {
  const p = requirePartner(req);
  rate(`pk:${p.principal.prefix}`, 600);
  return p;
}
