import { api } from "@/lib/agent/api";
import { readPhoto } from "@/lib/inventory/photos";
import { requireTenant } from "@/lib/tenant/auth";

/** Зураг (tenant-ын хавтаснаас тайлж) — өөр tenant-ын id → 404 */
export const GET = api(async (req: Request, rc: RouteContext<"/api/v1/inventory/photos/[id]">) => {
  const ctx = requireTenant(req, "inventory:count");
  const { buf, mime } = readPhoto(ctx, (await rc.params).id);
  return new Response(new Uint8Array(buf), { headers: { "Content-Type": mime, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
});
