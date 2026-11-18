import { syncIfDue, handle, merchantOf, messagesOf, pageOr409, setStatus, threadOr404, threadView } from "@/lib/fb/server";

export const GET = handle(async (req: Request, ctx: RouteContext<"/api/fb/threads/[psid]">) => {
  const { psid } = await ctx.params;
  const p = pageOr409(merchantOf(req));
  await syncIfDue(p);
  return Response.json({ thread: threadView(threadOr404(String(p.page_id), psid)), messages: messagesOf(String(p.page_id), psid) });
});

/** { status: "open" | "done" } */
export const PATCH = handle(async (req: Request, ctx: RouteContext<"/api/fb/threads/[psid]">) => {
  const { psid } = await ctx.params;
  const p = pageOr409(merchantOf(req));
  const b = (await req.json().catch(() => ({}))) as { status?: string };
  return Response.json(setStatus(p, psid, b.status === "done" ? "done" : "open"));
});
