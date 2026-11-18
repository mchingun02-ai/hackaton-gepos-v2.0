import { api } from "@/lib/agent/api";
import { readJson } from "@/lib/inventory/http";
import { cancelSession, getSession, rejectSession, submitSession } from "@/lib/inventory/sessions";
import { requireTenant } from "@/lib/tenant/auth";
import { fail } from "@/lib/tenant/http";

export const GET = api(async (req: Request, rc: RouteContext<"/api/v1/inventory/sessions/[id]">) => {
  const ctx = requireTenant(req, "inventory:count");
  return Response.json(getSession(ctx, (await rc.params).id));
});

/** { action: "submit" | "cancel" | "reopen", note? } */
export const PATCH = api(async (req: Request, rc: RouteContext<"/api/v1/inventory/sessions/[id]">) => {
  const ctx = requireTenant(req, "inventory:count");
  const { id } = await rc.params;
  const b = await readJson<{ action?: string; note?: string }>(req);
  if (b.action === "submit") return Response.json(submitSession(ctx, id));
  if (b.action === "cancel") return Response.json(cancelSession(ctx, id, typeof b.note === "string" ? b.note : undefined));
  if (b.action === "reopen") return Response.json(rejectSession(ctx, id, { reason: b.note, recount: false }));
  return fail(400, "action: submit | cancel | reopen");
});
