import { deleteWebhook } from "@/lib/v1/connector";
import { v1, v1Tenant } from "@/lib/v1/http";

/** DELETE /api/v1/webhooks/{id} */
export const DELETE = v1(async (req: Request, rc: RouteContext<"/api/v1/webhooks/[id]">) => Response.json(deleteWebhook(v1Tenant(req, "connector:write"), (await rc.params).id)));
