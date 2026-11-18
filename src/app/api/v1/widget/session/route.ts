import { api, ipOf, rate } from "@/lib/agent/api";
import { issueVisitor } from "@/lib/tenant/auth";

/**
 * POST { w: "gwt_…", channel: "web" | "voice" } → { token: "gvs_…", sid, exp }
 * Widget токеноор зочны (нэг ярианы) токен олгоно. sid-ийг сервер үүсгэнэ.
 */
export const POST = api(async (req: Request) => {
  rate(`widget:${ipOf(req)}`, 10);
  const b = (await req.json().catch(() => ({}))) as { w?: string; channel?: string };
  return Response.json(issueVisitor(String(b.w ?? ""), b.channel === "voice" ? "voice" : "web"));
});
