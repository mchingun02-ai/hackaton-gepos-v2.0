import { sse } from "@/lib/agent/db";
import { api } from "@/lib/agent/api";
import { readSp } from "@/lib/sp/server";
import { requireTenant } from "@/lib/tenant/auth";

/** Store Plus-ын өөрчлөлтийн дугаар (rev) — SSE. Таних: session cookie (EventSource автоматаар илгээнэ). */
export const GET = api(async (req: Request) => {
  const ctx = requireTenant(req, "pos:state");
  return sse(ctx.tenantId, req, (ev) => (ev.type === "sp" ? String(ev.rev) : null), String(readSp(ctx)?.rev ?? 0));
});
