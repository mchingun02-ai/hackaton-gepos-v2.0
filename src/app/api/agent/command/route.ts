import { directorTurn } from "@/lib/agent/agent";
import { api, bad } from "@/lib/agent/api";
import { conversationFor, listActions, messagesOf } from "@/lib/agent/crm";
import { principalName } from "@/lib/tenant/context";
import { requireTenant } from "@/lib/tenant/auth";

export const maxDuration = 120;

/** Захирлын тушаалын түүх + батламж хүлээж буй үйлдлүүд */
export const GET = api(async (req: Request) => {
  const ctx = requireTenant(req, "agent:director");
  const conv = conversationFor(ctx, "director", "owner", null, "Захирлын тушаал");
  return Response.json({ messages: messagesOf(ctx, conv.id, 120), pending: listActions(ctx, 50, conv.id).filter((a) => a.status === "pending") });
});

/** { text, who, assistant? } — захирал энгийн үгээр тушаал өгнө; assistant — гараар сонгосон туслах (§10) */
export const POST = api(async (req: Request) => {
  const ctx = requireTenant(req, "agent:director");
  const b = (await req.json().catch(() => ({}))) as { text?: string; who?: string; assistant?: string };
  const text = String(b.text ?? "").trim();
  if (!text) bad("Тушаал хоосон байна");
  if (text.length > 4000) bad("Тушаал хэт урт");
  return Response.json(await directorTurn(ctx, text, String(b.who || principalName(ctx.principal) || "Захирал").slice(0, 60), b.assistant));
});
