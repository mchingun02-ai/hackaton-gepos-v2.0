import { customerTurn } from "@/lib/agent/agent";
import { api, bad, ipOf, rate } from "@/lib/agent/api";
import { findConversation, messagesOf } from "@/lib/agent/crm";
import { legacyMerchantParam, requireVisitor } from "@/lib/tenant/auth";

export const maxDuration = 120;

/** Харилцагчийн вэб чатын түүх — зөвхөн өөрийн яриа (Authorization: Bearer gvs_… эсвэл ?token=) */
export const GET = api(async (req: Request) => {
  legacyMerchantParam(req);
  const ctx = requireVisitor(req, "web");
  const conv = findConversation(ctx, "web", ctx.principal.sid);
  if (!conv) return Response.json({ conv: null, messages: [] });
  return Response.json({
    conv: conv.id,
    status: conv.status,
    messages: messagesOf(ctx, conv.id)
      .filter((x) => x.role !== "system")
      .map((x) => ({ id: x.id, role: x.role, text: x.text, at: x.at })),
  });
});

/** { text, name } — харилцагч бичнэ, AI хариулна */
export const POST = api(async (req: Request) => {
  const b = (await req.json().catch(() => ({}))) as { m?: string; text?: string; name?: string };
  legacyMerchantParam(req, b);
  const ctx = requireVisitor(req, "web");
  rate(`chat:${ipOf(req)}`, 30);
  rate(`chat:${ctx.principal.sid}`, 12);
  const text = String(b.text ?? "").trim();
  if (!text) bad("Мессеж хоосон");
  const r = await customerTurn(ctx, { channel: "web", extId: ctx.principal.sid, text: text.slice(0, 2000), name: b.name?.slice(0, 60) || null });
  return Response.json({ reply: r.reply, status: r.status, conv: r.convId, steps: r.steps.map((x) => ({ title: x.title, summary: x.summary, ok: x.ok })) });
});
