import { createWebhook, listWebhooks } from "@/lib/v1/connector";
import { idempotent, readJson, v1, v1Tenant } from "@/lib/v1/http";

/** GET /api/v1/webhooks */
export const GET = v1(async (req: Request) => Response.json(listWebhooks(v1Tenant(req, "connector:write"))));

/** POST /api/v1/webhooks {url, events} — secret нэг удаа */
export const POST = v1(async (req: Request) => {
  const ctx = v1Tenant(req, "connector:write");
  return idempotent(ctx, req, async () => Response.json(createWebhook(ctx, await readJson(req)), { status: 201 }));
});
