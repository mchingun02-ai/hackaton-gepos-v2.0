import { api } from "@/lib/agent/api";
import { sse } from "@/lib/agent/db";
import { findConversation } from "@/lib/agent/crm";
import { legacyMerchantParam, requireVisitor } from "@/lib/tenant/auth";

/** Харилцагчийн чатад ажилтан/AI-ийн шинэ мессеж ирэхэд мэдэгдэнэ — ЗӨВХӨН өөрийн яриа (?token=gvs_…) */
export const GET = api(async (req: Request) => {
  legacyMerchantParam(req);
  const ctx = requireVisitor(req, "web");
  const sid = ctx.principal.sid;
  let convId = findConversation(ctx, "web", sid)?.id;
  return sse(ctx.tenantId, req, (ev) => {
    const d = ev.data as { kind?: string; conv?: string } | undefined;
    if (ev.type !== "ai" || d?.kind !== "message") return null;
    // яриа шинээр үүссэн бол sid-ээр нь дахин хайна
    convId ??= findConversation(ctx, "web", sid)?.id;
    return convId && d.conv === convId ? "1" : null;
  });
});
