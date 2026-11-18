import { api, bad } from "@/lib/agent/api";
import { deleteDoc, docText, reviewDoc } from "@/lib/agent/kb";
import { requireTenant } from "@/lib/tenant/auth";

type Ctx = RouteContext<"/api/agent/kb/[id]">;
/** Өөр tenant-ын эсвэл байхгүй баримт → 404 (оршин байгааг ч задруулахгүй) */
export const GET = api(async (req: Request, rc: Ctx) => {
  const ctx = requireTenant(req, "kb");
  return Response.json({ chunks: docText(ctx, (await rc.params).id) ?? bad("Баримт олдсонгүй", 404) });
});
export const DELETE = api(async (req: Request, rc: Ctx) => {
  const ctx = requireTenant(req, "kb");
  return Response.json({ ok: deleteDoc(ctx, (await rc.params).id) || bad("Баримт олдсонгүй", 404) });
});
/** Батлах дараалал (§8): { action: "publish" | "reject", title?, text? } — засаад нийтэлж болно */
export const PATCH = api(async (req: Request, rc: Ctx) => {
  const ctx = requireTenant(req, "kb");
  const b = (await req.json().catch(() => ({}))) as { action?: string; title?: string; text?: string };
  if (b.action !== "publish" && b.action !== "reject") bad("action: publish | reject");
  const edit = { title: typeof b.title === "string" ? b.title.slice(0, 160) : undefined, text: typeof b.text === "string" ? b.text.slice(0, 20_000) : undefined };
  const d = await reviewDoc(ctx, (await rc.params).id, b.action as "publish" | "reject", edit);
  return Response.json({ doc: d ?? bad("Баримт олдсонгүй", 404) });
});
