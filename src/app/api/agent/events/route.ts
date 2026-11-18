import { sse } from "@/lib/agent/db";
import { api } from "@/lib/agent/api";
import { requireTenant } from "@/lib/tenant/auth";

/** AI ажилтны шууд мэдэгдэл (шинэ мессеж, үйлдэл, тасалбар, кредит) — SSE, session cookie-оор */
export const GET = api(async (req: Request) => {
  const ctx = requireTenant(req, "dashboard");
  return sse(ctx.tenantId, req, (ev) => (ev.type === "ai" ? JSON.stringify(ev.data ?? {}) : ev.type === "sp" ? JSON.stringify({ kind: "sp", rev: ev.rev }) : null), "{}");
});
