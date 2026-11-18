/**
 * Түншийн нийлбэр хэрэглээ (§4A.3 GET /partner/usage, §7) — tenant хоорондын ГАНЦ query модуль.
 * Зөвхөн тоон баганууд: wallet.{credits,plan,expires_at}, usage.{credits,channel,at}, invoices.{amount,status}, tenants.{status}.
 * Текст багана (usage.ref, messages, kb, contacts…) SELECT ХИЙХГҮЙ (тест T13 энэ файлын SELECT-ийг шалгана).
 */
import type { PartnerContext } from "@/lib/tenant/context";

const DAY = 86_400_000;
type T = { id: string; ext_merchant_id: string; status: string; plan: string | null; credits: number | null; expires_at: number | null };

export function partnerUsage(p: PartnerContext, days = 30, now = Date.now()) {
  const since = now - Math.max(1, Math.min(90, days)) * DAY;
  const tenants = p.pdb.all<T>(
    `SELECT t.id, t.ext_merchant_id, t.status, w.plan, w.credits, w.expires_at FROM tenants t LEFT JOIN wallet w ON w.merchant = t.id WHERE t.partner_id = :partner ORDER BY t.id`,
  );
  const spend = p.pdb.all<{ merchant: string; channel: string | null; credits: number; last_at: number }>(
    `SELECT u.merchant, u.channel, SUM(u.credits) AS credits, MAX(u.at) AS last_at FROM usage u
     WHERE u.merchant IN (SELECT id FROM tenants WHERE partner_id = :partner) AND u.credits > 0 AND u.at >= ? GROUP BY u.merchant, u.channel`,
    since,
  );
  const paid = p.pdb.all<{ merchant: string; amount: number }>(
    `SELECT i.merchant, SUM(i.amount) AS amount FROM invoices i WHERE i.merchant IN (SELECT id FROM tenants WHERE partner_id = :partner) AND i.status = 'paid' AND i.paid_at >= ? GROUP BY i.merchant`,
    since,
  );
  const rows = tenants.map((t) => {
    const s = spend.filter((x) => x.merchant === t.id);
    const byChannel: Record<string, number> = {};
    for (const x of s) byChannel[x.channel ?? "other"] = (byChannel[x.channel ?? "other"] ?? 0) + x.credits;
    const last = s.reduce((a, x) => Math.max(a, x.last_at), 0);
    const expired = !!t.expires_at && t.expires_at < now;
    return {
      tenantId: t.id,
      extMerchantId: t.ext_merchant_id,
      status: t.status,
      plan: t.plan,
      credits: expired ? 0 : (t.credits ?? 0),
      expiresAt: t.expires_at ? new Date(t.expires_at).toISOString() : null,
      spent: s.reduce((a, x) => a + x.credits, 0),
      paidTugrik: paid.find((x) => x.merchant === t.id)?.amount ?? 0,
      byChannel,
      lastActiveAt: last ? new Date(last).toISOString() : null,
    };
  });
  const totals = {
    tenants: rows.length,
    active: rows.filter((r) => r.lastActiveAt).length,
    inactive: rows.filter((r) => !r.lastActiveAt).length,
    credits: rows.reduce((a, r) => a + r.credits, 0),
    spent: rows.reduce((a, r) => a + r.spent, 0),
    paidTugrik: rows.reduce((a, r) => a + r.paidTugrik, 0),
  };
  return { days, tenants: rows, totals };
}
