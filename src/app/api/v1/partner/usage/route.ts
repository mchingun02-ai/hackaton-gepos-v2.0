import { partnerUsage } from "@/lib/partner/aggregates";
import { partnerReq } from "@/lib/partner/http";
import { v1 } from "@/lib/v1/http";

/** GET /api/v1/partner/usage?days=30 — tenant бүрийн тоон нийлбэр (агуулгагүй) */
export const GET = v1(async (req: Request) => Response.json(partnerUsage(partnerReq(req), Number(new URL(req.url).searchParams.get("days") || 30))));
