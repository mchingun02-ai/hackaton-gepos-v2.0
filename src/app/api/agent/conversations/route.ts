import { api } from "@/lib/agent/api";
import { listConversations } from "@/lib/agent/crm";
import { requireTenant } from "@/lib/tenant/auth";

/** Бүх сувгийн яриа (?channel=fb|web|voice) */
export const GET = api(async (req: Request) => {
  const ctx = requireTenant(req, "dashboard");
  const ch = new URL(req.url).searchParams.get("channel") || undefined;
  return Response.json({ conversations: listConversations(ctx, ch) });
});
