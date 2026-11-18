import { handle, markRead, merchantOf, pageOr409 } from "@/lib/fb/server";

export const POST = handle(async (req: Request, ctx: RouteContext<"/api/fb/threads/[psid]/read">) => {
  const { psid } = await ctx.params;
  await markRead(pageOr409(merchantOf(req)), psid);
  return Response.json({ ok: true });
});
