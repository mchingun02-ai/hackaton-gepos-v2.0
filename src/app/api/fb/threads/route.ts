import { syncIfDue, counts, handle, listThreads, merchantOf, pageOr409 } from "@/lib/fb/server";

export const GET = handle(async (req: Request) => {
  const p = pageOr409(merchantOf(req));
  await syncIfDue(p);
  const q = new URL(req.url).searchParams;
  return Response.json({ threads: listThreads(String(p.page_id), q.get("state") || "open", q.get("q") || ""), counts: counts(String(p.page_id)) });
});
