import { staffReply } from "@/lib/agent/agent";
import { api, bad } from "@/lib/agent/api";
import { getContact, getConversation, listActions, messagesOf, setConvStatus } from "@/lib/agent/crm";
import { principalName } from "@/lib/tenant/context";
import { requireTenant } from "@/lib/tenant/auth";

type Ctx = RouteContext<"/api/agent/conversations/[id]">;

export const GET = api(async (req: Request, rc: Ctx) => {
  const ctx = requireTenant(req, "dashboard");
  const { id } = await rc.params;
  const conv = getConversation(ctx, id) ?? bad("Яриа олдсонгүй", 404);
  return Response.json({ conversation: conv, contact: conv.contact_id ? getContact(ctx, conv.contact_id) : null, messages: messagesOf(ctx, id), actions: listActions(ctx, 50, id) });
});

/** Ажилтан гараар хариулах { text, staff } */
export const POST = api(async (req: Request, rc: Ctx) => {
  const ctx = requireTenant(req, "dashboard");
  const { id } = await rc.params;
  const b = (await req.json().catch(() => ({}))) as { text?: string; staff?: string };
  const text = String(b.text ?? "").trim();
  if (!text) bad("Хариу хоосон");
  return Response.json(await staffReply(ctx, id, text.slice(0, 2000), String(b.staff || principalName(ctx.principal) || "Ажилтан").slice(0, 60)));
});

/** { status: "ai" | "human" | "closed" } — AI-д буцааж өгөх, ажилтан авах, хаах */
export const PATCH = api(async (req: Request, rc: Ctx) => {
  const ctx = requireTenant(req, "dashboard");
  const { id } = await rc.params;
  if (!getConversation(ctx, id)) bad("Яриа олдсонгүй", 404);
  const b = (await req.json().catch(() => ({}))) as { status?: string };
  const st = b.status === "human" || b.status === "closed" ? b.status : "ai";
  setConvStatus(ctx, id, st);
  return Response.json({ ok: true, status: st });
});
