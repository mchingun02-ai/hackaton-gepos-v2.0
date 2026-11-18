import { connectPage, dropPending, fail, handle, isDemo, merchantOf, readPending } from "@/lib/fb/server";

/** Сонгох Page-үүд (токенгүй) */
export const GET = handle(async (req: Request) => {
  const k = new URL(req.url).searchParams.get("k") || "";
  const pages = readPending(k, merchantOf(req));
  return Response.json({ pages: pages.map((p) => ({ id: p.id, name: p.name, pic: p.pic, category: p.category, canMessage: p.canMessage })), demo: isDemo() });
});

/** Сонгосон Page-ийг холбоно: токеныг шифрлэж хадгалаад webhook-д захиална */
export const POST = handle(async (req: Request) => {
  const merchant = merchantOf(req);
  const b = (await req.json().catch(() => ({}))) as { k?: string; pageId?: string; by?: string };
  const pages = readPending(String(b.k || ""), merchant);
  const p = pages.find((x) => x.id === b.pageId) ?? fail(404, "Page олдсонгүй");
  if (!p.canMessage) fail(403, "Энэ Page-д мессеж бичих эрх танд алга. Page-ийн админ холбоно уу.");
  await connectPage(merchant, p, String(b.by || "").slice(0, 80) || "Мерчант", isDemo() || p.token === "demo");
  dropPending(String(b.k));
  return Response.json({ ok: true });
});
