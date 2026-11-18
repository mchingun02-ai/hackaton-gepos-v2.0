import { api } from "@/lib/agent/api";
import { readImages } from "@/lib/inventory/http";
import { shelfPhoto } from "@/lib/inventory/vision";
import { requireTenant } from "@/lib/tenant/auth";

/**
 * multipart: image (JPEG/PNG/WebP ≤ 4 МБ), place? («Тавиур 2», «Агуулах»), phash? (dHash 16 hex), force? ("1")
 * → тавиурын илрүүлэлт (3 кредит; алдаа гарвал буцаана). Өмнөх зурагтай бараг ижил бол кредит зарцуулахгүйгээр { similar } буцаана.
 */
export const POST = api(async (req: Request, rc: RouteContext<"/api/v1/inventory/sessions/[id]/photos">) => {
  const ctx = requireTenant(req, "inventory:count");
  const { id } = await rc.params;
  const { images, fields } = await readImages(req, 1);
  return Response.json(await shelfPhoto(ctx, id, images[0], { place: fields.place, phash: fields.phash, force: fields.force }));
});
