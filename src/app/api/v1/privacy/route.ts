import { privacySummary } from "@/lib/v1/privacy";
import { v1, v1Tenant } from "@/lib/v1/http";

/** GET /api/v1/privacy — «Өгөгдөл ба нууцлал»: горим, хадгалагдаж буй ангилал (тоо), хугацаа, хандалтын түүх */
export const GET = v1(async (req: Request) => Response.json(privacySummary(v1Tenant(req, "dashboard"))));
