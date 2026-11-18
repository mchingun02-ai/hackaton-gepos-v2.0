import { api } from "@/lib/agent/api";
import { reorderList } from "@/lib/inventory/reorder";
import { requireTenant } from "@/lib/tenant/auth";

/** Захиалах санал (14 хоногийн борлуулалт, үлдэгдэл, нийлүүлэх хугацаа) */
export const GET = api(async (req: Request) => {
  const ctx = requireTenant(req, "inventory:count");
  const limit = Number(new URL(req.url).searchParams.get("limit")) || 50;
  return Response.json(await reorderList(ctx, limit));
});
