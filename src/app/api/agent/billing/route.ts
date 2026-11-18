import { api, bad } from "@/lib/agent/api";
import { COST, createInvoice, invoices, PLANS, qpaySandbox, sandboxConfirmAllowed, usageSummary, wallet } from "@/lib/agent/billing";
import { requireTenant } from "@/lib/tenant/auth";

/** Кредит, багцууд, нэхэмжлэх, хэрэглээ */
export const GET = api(async (req: Request) => {
  const ctx = requireTenant(req, "billing");
  return Response.json({ wallet: wallet(ctx), plans: PLANS, cost: COST, invoices: invoices(ctx), usage: usageSummary(ctx), sandbox: qpaySandbox(), sandboxConfirm: sandboxConfirmAllowed() });
});

/** { plan } — QPay нэхэмжлэх үүсгэнэ (урьдчилсан төлбөр) */
export const POST = api(async (req: Request) => {
  const ctx = requireTenant(req, "billing");
  const b = (await req.json().catch(() => ({}))) as { plan?: string };
  if (!PLANS.some((p) => p.id === b.plan)) bad("Багц сонгоно уу");
  return Response.json(await createInvoice(ctx, String(b.plan), new URL(req.url).origin));
});
