import { api } from "@/lib/agent/api";
import { ensureKbRunner, refreshNow } from "@/lib/kb-auto/jobs";
import { requireTenant } from "@/lib/tenant/auth";

export const maxDuration = 120;

/**
 * «Одоо сэргээх» (§8): { faq?: boolean } — загвар баримтууд (каталог, дэлгүүр, урамшуулал, дотоод тойм) шууд;
 * faq=true бол шийдэгдсэн тасалбар/ярианаас FAQ санал (qwen-flash, баримт тутам 1 кредит) → батлах дараалал.
 */
export const POST = api(async (req: Request) => {
  const ctx = requireTenant(req, "kb");
  ensureKbRunner();
  const b = (await req.json().catch(() => ({}))) as { faq?: boolean };
  return Response.json(await refreshNow(ctx, { faq: b.faq === true }));
});
