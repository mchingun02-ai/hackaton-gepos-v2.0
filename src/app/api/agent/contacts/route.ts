import { api } from "@/lib/agent/api";
import { listContacts } from "@/lib/agent/crm";
import { requireTenant } from "@/lib/tenant/auth";

/** AI-ийн цуглуулсан харилцагчийн картууд (?q=) */
export const GET = api(async (req: Request) => {
  const ctx = requireTenant(req, "dashboard");
  const q = new URL(req.url).searchParams.get("q") ?? "";
  const counts = new Map(ctx.db.all<{ contact_id: string; n: number }>(`SELECT contact_id, COUNT(*) n FROM conversations WHERE merchant = :tenant GROUP BY contact_id`).map((r) => [r.contact_id, r.n]));
  const tickets = new Map(ctx.db.all<{ contact_id: string; n: number }>(`SELECT contact_id, COUNT(*) n FROM tickets WHERE merchant = :tenant AND status != 'resolved' GROUP BY contact_id`).map((r) => [r.contact_id, r.n]));
  return Response.json({ contacts: listContacts(ctx, q).map((c) => ({ ...c, conversations: counts.get(c.id) ?? 0, openTickets: tickets.get(c.id) ?? 0 })) });
});
