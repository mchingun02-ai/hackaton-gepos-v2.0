import { cfg, COMMENT_SCOPES, counts, disconnect, handle, isDemo, merchantOf, pageOf, pageScopes } from "@/lib/fb/server";

export const GET = handle(async (req: Request) => {
  const merchant = merchantOf(req);
  // Жинхэнэ App тохируулсны дараа туршилтын жишээ Page-ийг цэвэрлэнэ
  if (!isDemo() && pageOf(merchant)?.demo) await disconnect(merchant);
  const p = pageOf(merchant);
  // Олгосон эрх vs шаардлагатай (Тохиргоо → Facebook карт). granted null — Facebook-аас тодорхойлж чадсангүй.
  const scopes = p ? await pageScopes(p) : null;
  return Response.json({
    demo: isDemo(),
    configured: { appId: !!cfg().appId, secret: !!cfg().secret, verifyToken: !!cfg().verifyToken },
    page: p ? { id: p.page_id, name: p.name, pic: p.pic ?? undefined, demo: !!p.demo, subscribed: !!p.subscribed, connectedBy: p.connected_by, connectedAt: p.connected_at } : null,
    counts: p ? counts(String(p.page_id)) : { unread: 0, open: 0 },
    scopes: scopes ? { ...scopes, comments: COMMENT_SCOPES, commentsMissing: scopes.granted ? COMMENT_SCOPES.filter((s) => !scopes.granted!.includes(s)) : null } : null,
  });
});

/** Холболт салгах: webhook-оос гаргаж, токен ба чатын түүхийг устгана */
export const DELETE = handle(async (req: Request) => {
  await disconnect(merchantOf(req));
  return Response.json({ ok: true });
});
