import { api } from "@/lib/agent/api";
import { readJson } from "@/lib/inventory/http";
import { profileOf, saveProfile } from "@/lib/inventory/sessions";
import { requireTenant } from "@/lib/tenant/auth";
import { fail } from "@/lib/tenant/http";

/** Барааны тоолох профайл: арга, гүн, хайрцаг дахь тоо, нэгж жин … */
export const GET = api(async (req: Request, rc: RouteContext<"/api/v1/inventory/products/[id]/profile">) => {
  const ctx = requireTenant(req, "inventory:count");
  const { id } = await rc.params;
  if (!(await ctx.pos.getProduct(id))) fail(404, "Бараа олдсонгүй");
  return Response.json({ productId: id, profile: profileOf(ctx, id) });
});

/** { method?, depth?, packSize?, unitWeightG?, tareG?, unitThicknessMm?, leadDays? } */
export const PUT = api(async (req: Request, rc: RouteContext<"/api/v1/inventory/products/[id]/profile">) => {
  const ctx = requireTenant(req, "inventory:count");
  const { id } = await rc.params;
  if (!(await ctx.pos.getProduct(id))) fail(404, "Бараа олдсонгүй");
  const b = await readJson(req);
  return Response.json({ productId: id, profile: saveProfile(ctx, id, b) });
});
