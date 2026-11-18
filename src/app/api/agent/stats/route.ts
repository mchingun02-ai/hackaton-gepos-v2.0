import { api } from "@/lib/agent/api";
import { wallet } from "@/lib/agent/billing";
import { kbCount } from "@/lib/agent/kb";
import { aiReady } from "@/lib/agent/qwen";
import { getSettings } from "@/lib/agent/settings";
import { salesTotals, startOfDay, lowStock, money } from "@/lib/sp/logic";
import { readSp } from "@/lib/sp/server";
import { requireTenant } from "@/lib/tenant/auth";
import { openActionSummary } from "@/lib/agent/crm";

/** Самбарын тоонууд — бүгд бодит өгөгдлөөс */
export const GET = api(async (req: Request) => {
  const ctx = requireTenant(req, "dashboard");
  const since = startOfDay().getTime();
  const n = (sql: string, ...a: (string | number)[]) => Number(ctx.db.one<{ n: number }>(sql, ...a)?.n ?? 0);
  const sp = ctx.pos.kind === "gepos" ? readSp(ctx) : null;
  const sales = sp ? salesTotals(sp.state, startOfDay(), new Date()) : null;
  return Response.json({
    ai: aiReady(),
    synced: !!sp,
    wallet: wallet(ctx),
    settings: getSettings(ctx),
    today: {
      conversations: ctx.db.all<{ channel: string; n: number }>(`SELECT channel, COUNT(*) n FROM conversations WHERE merchant = :tenant AND last_at >= ? AND channel NOT IN ('director') GROUP BY channel`, since),
      aiReplies: n(`SELECT COUNT(*) n FROM messages x JOIN conversations c ON c.id = x.conv_id AND c.merchant = :tenant WHERE x.merchant = :tenant AND x.role = 'assistant' AND x.at >= ? AND c.channel != 'director'`, since),
      actions: n(`SELECT COUNT(*) n FROM actions WHERE merchant = :tenant AND at >= ? AND status = 'done'`, since),
      newContacts: n(`SELECT COUNT(*) n FROM contacts WHERE merchant = :tenant AND created_at >= ?`, since),
      sales: sales ? { total: money(sales.total), count: sales.count } : null,
    },
    openTickets: n(`SELECT COUNT(*) n FROM tickets WHERE merchant = :tenant AND status != 'resolved'`),
    complaints: n(`SELECT COUNT(*) n FROM tickets WHERE merchant = :tenant AND status != 'resolved' AND kind = 'complaint'`),
    humanQueue: n(`SELECT COUNT(*) n FROM conversations WHERE merchant = :tenant AND status = 'human'`),
    pending: n(`SELECT COUNT(*) n FROM actions WHERE merchant = :tenant AND status = 'pending'`),
    contacts: n(`SELECT COUNT(*) n FROM contacts WHERE merchant = :tenant`),
    kbDocs: kbCount(ctx),
    lowStock: sp ? lowStock(sp.state).map((p) => ({ name: p.name, stock: p.stock })) : [],
    recentActions: ctx.db
      .all<{ id: string; tool: string; summary: string | null; status: string; actor: string; at: number }>(`SELECT id, tool, summary, status, actor, at FROM actions WHERE merchant = :tenant ORDER BY at DESC LIMIT 8`)
      .map(({ id, ...r }) => ({ ...r, summary: openActionSummary(ctx, id, r.summary) })),
  });
});
