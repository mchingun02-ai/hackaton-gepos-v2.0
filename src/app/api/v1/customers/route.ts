import { listCustomers, upsertCustomers } from "@/lib/v1/connector";
import { idempotent, pageOf, readJson, v1, v1Tenant } from "@/lib/v1/http";

/** GET /api/v1/customers (sync; live-д хоосон — ПОС-ын харилцагчийг уншихгүй) */
export const GET = v1(async (req: Request) => Response.json(listCustomers(v1Tenant(req, "connector:read"), pageOf(req))));

/** PUT /api/v1/customers — зөвхөн seed/синтетик */
export const PUT = v1(async (req: Request) => {
  const ctx = v1Tenant(req, "connector:write");
  return idempotent(ctx, req, async () => Response.json(upsertCustomers(ctx, await readJson(req, 2_000_000))));
});
