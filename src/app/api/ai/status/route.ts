import { legacyGuard } from "@/lib/ai/legacy";
import { qcfg, qwenReady } from "@/lib/ai/qwen";
import { accountOf, aiDemo, disconnectAi, gcfg } from "@/lib/ai/server";
import { handle, merchantOf } from "@/lib/fb/server";

export const GET = handle(async (req: Request) => {
  legacyGuard();
  const merchant = merchantOf(req);
  const a = accountOf(merchant);
  // Жинхэнэ Google тохируулсны дараа туршилтын холболтыг цэвэрлэнэ
  if (a?.demo && !aiDemo()) {
    await disconnectAi(merchant);
    return Response.json({ demo: false, model: gcfg().model, account: null, qwen: { ready: qwenReady(), model: qcfg().model } });
  }
  return Response.json({
    demo: aiDemo(),
    model: gcfg().model,
    qwen: { ready: qwenReady(), model: qcfg().model },
    account: a ? { email: a.email, project: a.project ?? undefined, demo: !!a.demo, connectedAt: a.connected_at } : null,
  });
});

/** Салгах: Google-ээс эрхийг цуцалж, токен ба чатын түүхийг устгана */
export const DELETE = handle(async (req: Request) => {
  legacyGuard();
  await disconnectAi(merchantOf(req));
  return Response.json({ ok: true });
});
