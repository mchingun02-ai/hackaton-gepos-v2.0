import { api } from "@/lib/agent/api";
import { confirmDraft, type ConfirmInput } from "@/lib/inventory/drafts";
import { readJson } from "@/lib/inventory/http";
import { requireTenant } from "@/lib/tenant/auth";

/** { name, price, barcode?, category?, unit?, packSize?, sessionId? } → ПОС-д бараа (нөөц 0) */
export const POST = api(async (req: Request, rc: RouteContext<"/api/v1/inventory/drafts/[id]/confirm">) => {
  const ctx = requireTenant(req, "inventory:count");
  const b = await readJson<ConfirmInput>(req);
  return Response.json(await confirmDraft(ctx, (await rc.params).id, b), { status: 201 });
});
