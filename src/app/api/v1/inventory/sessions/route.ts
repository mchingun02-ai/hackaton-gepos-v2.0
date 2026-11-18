import { api } from "@/lib/agent/api";
import { readJson } from "@/lib/inventory/http";
import { createSession, listSessions } from "@/lib/inventory/sessions";
import { requireTenant } from "@/lib/tenant/auth";

/** Тооллогууд (сүүлийн 30) + ангиллууд (шинэ тооллогын хүрээ) */
export const GET = api(async (req: Request) => {
  const ctx = requireTenant(req, "inventory:count");
  const cats = [...new Set((await ctx.pos.listProducts()).filter((p) => p.active).map((p) => p.category ?? "").filter(Boolean))];
  return Response.json({ sessions: listSessions(ctx), categories: cats });
});

/** { scope: "all" | "category", scopeRef?, name?, blind? } — шинэ тооллого (мөрүүдийг ПОС-оос) */
export const POST = api(async (req: Request) => {
  const ctx = requireTenant(req, "inventory:count");
  const b = await readJson(req);
  return Response.json(await createSession(ctx, b), { status: 201 });
});
