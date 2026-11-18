import { api } from "@/lib/agent/api";
import { readImages } from "@/lib/inventory/http";
import { shelfPhoto } from "@/lib/inventory/vision";
import { requireTenant } from "@/lib/tenant/auth";

/** multipart: image (JPEG/PNG/WebP ≤ 4 МБ) — тавиурын зураг → илрүүлэлт (3 кредит; алдаа гарвал буцаана) */
export const POST = api(async (req: Request, rc: RouteContext<"/api/v1/inventory/sessions/[id]/photos">) => {
  const ctx = requireTenant(req, "inventory:count");
  const { id } = await rc.params;
  const { images } = await readImages(req, 1);
  return Response.json(await shelfPhoto(ctx, id, images[0]));
});
