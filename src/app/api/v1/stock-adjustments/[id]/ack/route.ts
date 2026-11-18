import { ackAdjustment } from "@/lib/v1/connector";
import { idempotent, v1, v1Tenant } from "@/lib/v1/http";

/** POST /api/v1/stock-adjustments/{id}/ack — ПОС засварыг хүлээн авснаа мэдэгдэнэ (давтахад ижил хариу) */
export const POST = v1(async (req: Request, rc: RouteContext<"/api/v1/stock-adjustments/[id]/ack">) => {
  const ctx = v1Tenant(req, "connector:write");
  const id = (await rc.params).id;
  return idempotent(ctx, req, async () => Response.json(ackAdjustment(ctx, id)));
});
