import { handle, pageOr409, replyComment } from "@/lib/fb/server";
import { rate } from "@/lib/tenant/http";
import { requireTenant } from "@/lib/tenant/auth";

/** { text } — comment-д ажилтан гараар хариулна (origin "human"; AI автоматаар хариулахгүй) */
export const POST = handle(async (req: Request, rc: RouteContext<"/api/fb/comments/[id]/reply">) => {
  const { id } = await rc.params;
  const ctx = requireTenant(req, "dashboard");
  rate(`fb-comment:${ctx.tenantId}`, 30);
  const p = pageOr409(ctx.tenantId);
  const b = (await req.json().catch(() => ({}))) as { text?: string };
  const staff = ctx.principal.kind === "session" ? ctx.principal.name || "Ажилтан" : "Ажилтан";
  return Response.json(await replyComment(p, id, String(b.text || ""), staff.slice(0, 80), "human"));
});
