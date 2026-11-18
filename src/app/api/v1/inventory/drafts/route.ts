import { api } from "@/lib/agent/api";
import { createDraft } from "@/lib/inventory/drafts";
import { readImages } from "@/lib/inventory/http";
import { requireTenant } from "@/lib/tenant/auth";

/** multipart: image (1–2 зураг: урд тал, баркодтой тал) → барааны ноорог (2 кредит; алдаа гарвал буцаана) */
export const POST = api(async (req: Request) => {
  const ctx = requireTenant(req, "inventory:count");
  const { images } = await readImages(req, 2);
  return Response.json(await createDraft(ctx, images), { status: 201 });
});
