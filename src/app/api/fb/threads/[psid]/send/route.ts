import { findConversation, setConvStatus } from "@/lib/agent/crm";
import { handle, pageOr409, sendText } from "@/lib/fb/server";
import { requireTenant } from "@/lib/tenant/auth";

/** { text, staff } — харилцагч руу Messenger-ээр хариу илгээнэ (ажилтан — origin "human", §9.3) */
export const POST = handle(async (req: Request, rc: RouteContext<"/api/fb/threads/[psid]/send">) => {
  const { psid } = await rc.params;
  const ctx = requireTenant(req, "dashboard");
  const p = pageOr409(ctx.tenantId);
  const b = (await req.json().catch(() => ({}))) as { text?: string; staff?: string };
  const out = await sendText(p, psid, String(b.text || ""), (String(b.staff || "") || (ctx.principal.kind === "session" ? ctx.principal.name : "") || "Мерчант").slice(0, 80), "human");
  // Ажилтан гараар хариулсан — AI энэ яриаг орхино («AI-д буцаах» хүртэл) §9.2
  const conv = findConversation(ctx, "fb", psid);
  if (conv?.status === "ai") setConvStatus(ctx, conv.id, "human");
  return Response.json(out);
});
