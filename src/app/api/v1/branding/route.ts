import { brandOf } from "@/lib/v1/brand";
import { v1, v1Tenant } from "@/lib/v1/http";

/** GET /api/v1/branding — түншийн брэнд (нэр, лого, өнгө) — embed самбар, widget */
export const GET = v1(async (req: Request) => Response.json(brandOf(v1Tenant(req, []))));
