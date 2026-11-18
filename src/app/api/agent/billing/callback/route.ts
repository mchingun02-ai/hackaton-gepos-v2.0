import { api } from "@/lib/agent/api";
import { checkInvoice } from "@/lib/agent/billing";
import { invoiceContext } from "@/lib/tenant/auth";

/** QPay callback — callback-д итгэхгүй, payment/check-ээр дахин баталгаажуулна. Tenant = нэхэмжлэхийн мөрөөс. */
async function cb(req: Request) {
  const inv = new URL(req.url).searchParams.get("inv") || "";
  const ctx = /^inv[a-z0-9]{6,40}$/.test(inv) ? invoiceContext(inv) : null;
  if (ctx) await checkInvoice(ctx, inv).catch((e) => console.warn("[qpay] callback", e instanceof Error ? e.message : e));
  return Response.json({ ok: true });
}
export const GET = api(cb);
export const POST = api(cb);
