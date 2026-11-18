import { handle, listComments, pageOr409, syncCommentsIfDue } from "@/lib/fb/server";
import { requireTenant } from "@/lib/tenant/auth";

/** Page-ийн пост → comment (session-ий tenant-ын Page л). permission.needsPermission — эрх дутуу бол UI мэдэгдэл */
export const GET = handle(async (req: Request) => {
  const ctx = requireTenant(req, "dashboard");
  const p = pageOr409(ctx.tenantId);
  await syncCommentsIfDue(p);
  return Response.json(await listComments(p));
});
