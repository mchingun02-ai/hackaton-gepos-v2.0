"use client";

/*
 * Хэрэглээний аналитик (docs/ARCHITECTURE.md §7) — гар SVG, график сан нэмэхгүй.
 *   1. Үлдэгдлийн хагас дугуй хэмжигч (ногоон → шар <20% → улаан <5%)
 *   2. 3 тоо: өдрийн дундаж зарцуулалт (хандлага), хүрэх хоног + дуусах огноо, нэг ярианы өртөг (₮)
 *   3. 30 хоногийн давхарласан багана сувгаар + өдөрт зарцуулж болох дунджийн тасархай шугам
 *   4. Сувгаар / үйлдлээр хэвтээ зурвас (хувь + кредит + удаа)
 * Өгөгдөл: GET /api/v1/usage?days=30. low/critical → SSE `wallet_level` мэдэгдэл.
 */
import { useState } from "react";
import { Icon } from "@/components/sp/icons";
import { cx, toast } from "@/components/sp/ui";
import { useAiEvents, useLive } from "./client";

export type UsageMetrics = {
  wallet: { credits: number; plan: string | null; expiresAt: string | null };
  cycle: { startedAt: string | null; granted: number; spent: number; pctLeft: number };
  burn: { perDay7: number; perDay30: number; trend: number | null };
  runway: { daysLeft: number | null; emptyOn: string | null; expiresInDays: number | null; status: "ok" | "low" | "critical" | "expiring_unused" | "empty"; dailyAllowance: number | null };
  daily: ({ day: string } & Record<Ch, number>)[];
  byChannel: { channel: string; credits: number; pct: number; events: number }[];
  byFeature: { feature: string; credits: number; pct: number; events: number; unitCost: number }[];
  byAssistant: { assistant: string; credits: number }[];
  tokens: { model: string; in: number; out: number; calls: number }[];
  value: { conversations: number; aiResolvedPct: number | null; creditsPerConversation: number | null; tugrikPerConversation: number | null };
  creditValue: { tugrik: number; chat: number; command: number; voiceMinute: number };
};

type Ch = "web" | "fb" | "voice" | "director" | "mcp" | "inventory";
const CH: { id: Ch; label: string; color: string }[] = [
  { id: "web", label: "Вэб чат", color: "#0046E2" },
  { id: "fb", label: "Messenger", color: "#4F7EF5" },
  { id: "voice", label: "Дуудлага", color: "#85A9FF" },
  { id: "director", label: "Захирал", color: "#002F96" },
  { id: "inventory", label: "Тооллого", color: "#1FAE7A" },
  { id: "mcp", label: "MCP / API", color: "#8791A8" },
];
const chOf = (id: string) => CH.find((c) => c.id === id) ?? { id, label: id === "system" ? "Систем" : id, color: "#B8BFCC" };
const FEATURE: Record<string, string> = {
  reply: "Чат хариулт",
  command: "Захирлын тушаал",
  voice_minute: "Дуудлагын минут",
  shelf_photo: "Тавиурын зураг",
  product_draft: "Барааны зураг",
  kb_auto: "Мэдлэгийн сан (авто)",
};
const GREEN = "#1FAE7A";
const AMBER = "#F5A524";
const RED = "#E5484D";
export const levelColor = (pct: number) => (pct < 5 ? RED : pct < 20 ? AMBER : GREEN);
const fmt = (n: number) => Math.round(n).toLocaleString("en-US");
const fmt1 = (n: number) => (Math.round(n * 10) / 10).toLocaleString("en-US");
const mmdd = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`;

/* ───────── 1. хагас дугуй хэмжигч ───────── */

export function Gauge({ pct, credits, size = 240, sub, compact }: { pct: number; credits: number; size?: number; sub?: string; compact?: boolean }) {
  const p = Math.max(0, Math.min(100, pct));
  const sw = compact ? 10 : 18;
  const r = 100 - sw / 2;
  const len = Math.PI * r;
  const arc = `M ${100 - r} 100 A ${r} ${r} 0 0 1 ${100 + r} 100`;
  const color = levelColor(p);
  return (
    <svg viewBox="0 0 200 112" width={size} height={size * 0.56} role="img" aria-label={`Үлдэгдэл ${fmt(credits)} кредит, ${Math.round(p)}%`}>
      <path d={arc} fill="none" stroke="var(--sp-fill, #EEF0F4)" strokeWidth={sw} strokeLinecap="round" />
      <path d={arc} fill="none" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeDasharray={`${(len * p) / 100} ${len}`} style={{ transition: "stroke-dasharray .6s ease" }} />
      {!compact && (
        <>
          <text x="100" y="78" textAnchor="middle" className="fill-[var(--ink,#111)]" style={{ fontSize: 28, fontWeight: 700, letterSpacing: "-0.02em" }}>
            {fmt(credits)}
          </text>
          <text x="100" y="98" textAnchor="middle" style={{ fontSize: 11, fill: "#8791A8" }}>
            {sub ?? `кредит · ${Math.round(p)}% үлдсэн`}
          </text>
        </>
      )}
    </svg>
  );
}

/* ───────── 3. давхарласан багана ───────── */

function Stacked({ daily, allowance }: { daily: UsageMetrics["daily"]; allowance: number | null }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 720;
  const H = 200;
  const pad = { l: 34, r: 8, t: 10, b: 24 };
  const tot = daily.map((d) => CH.reduce((a, c) => a + d[c.id], 0));
  const max = Math.max(1, ...tot, allowance ?? 0) * 1.12;
  const step = (W - pad.l - pad.r) / daily.length;
  const bw = Math.max(3, step * 0.66);
  const y = (v: number) => pad.t + (H - pad.t - pad.b) * (1 - v / max);
  const ticks = [0, max / 2, max].map((v) => Math.round(v));
  const h = hover !== null ? daily[hover] : null;
  return (
    <div>
      <div className="mb-1 flex min-h-[22px] flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px] text-mute">
        {h ? (
          <>
            <span className="font-semibold text-ink">{mmdd(h.day)}</span>
            {CH.filter((c) => h[c.id]).map((c) => (
              <span key={c.id} className="tnum">
                <span className="mr-1 inline-block size-2 rounded-full" style={{ background: c.color }} />
                {c.label} {fmt(h[c.id])}
              </span>
            ))}
            <span className="tnum">· нийт {fmt(tot[hover!])}</span>
          </>
        ) : (
          CH.map((c) => (
            <span key={c.id}>
              <span className="mr-1 inline-block size-2 rounded-full" style={{ background: c.color }} />
              {c.label}
            </span>
          ))
        )}
        {allowance !== null && (
          <span className="ml-auto">
            <span className="mr-1 inline-block w-4 border-t-2 border-dashed border-[#E5484D] align-middle" />
            Өдөрт ≈ {fmt1(allowance)} кредит
          </span>
        )}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="30 хоногийн кредитийн зарцуулалт сувгаар" onMouseLeave={() => setHover(null)}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} stroke="#8791A8" strokeOpacity={0.18} />
            <text x={pad.l - 6} y={y(t) + 3.5} textAnchor="end" style={{ fontSize: 10, fill: "#8791A8" }}>
              {fmt(t)}
            </text>
          </g>
        ))}
        {daily.map((d, i) => {
          let acc = 0;
          const x = pad.l + i * step + (step - bw) / 2;
          return (
            <g key={d.day} onMouseEnter={() => setHover(i)}>
              <rect x={pad.l + i * step} y={pad.t} width={step} height={H - pad.t - pad.b} fill={hover === i ? "rgba(0,70,226,0.06)" : "transparent"} />
              {CH.map((c) => {
                const v = d[c.id];
                if (!v) return null;
                const y0 = y(acc + v);
                const hh = y(acc) - y0;
                acc += v;
                return <rect key={c.id} x={x} y={y0} width={bw} height={Math.max(0.5, hh)} fill={c.color} rx={1.5} />;
              })}
              <title>{`${mmdd(d.day)}: ${fmt(tot[i])} кредит`}</title>
              {(i % 5 === 0 || i === daily.length - 1) && (
                <text x={x + bw / 2} y={H - 8} textAnchor="middle" style={{ fontSize: 10, fill: "#8791A8" }}>
                  {mmdd(d.day)}
                </text>
              )}
            </g>
          );
        })}
        {allowance !== null && allowance > 0 && <line x1={pad.l} x2={W - pad.r} y1={y(allowance)} y2={y(allowance)} stroke={RED} strokeWidth={1.5} strokeDasharray="5 4" />}
      </svg>
    </div>
  );
}

/* ───────── 4. хэвтээ зурвас ───────── */

function HBars({ rows }: { rows: { key: string; label: string; color: string; credits: number; pct: number; events: number; extra?: string }[] }) {
  if (!rows.length) return <div className="py-3 text-[13.5px] text-mute">Энэ хугацаанд зарцуулалт алга</div>;
  const max = Math.max(...rows.map((r) => r.credits), 1);
  return (
    <div className="space-y-2.5">
      {rows.map((r) => (
        <div key={r.key}>
          <div className="flex items-baseline justify-between gap-2 text-[13.5px]">
            <span className="truncate font-medium">{r.label}</span>
            <span className="shrink-0 text-[12.5px] text-mute tnum">
              {fmt1(r.pct)}% · {fmt(r.credits)} кр · {fmt(r.events)} удаа{r.extra ? ` · ${r.extra}` : ""}
            </span>
          </div>
          <svg viewBox="0 0 100 6" preserveAspectRatio="none" className="mt-1 h-2 w-full" aria-hidden>
            <rect x="0" y="0" width="100" height="6" rx="3" fill="var(--sp-fill, #EEF0F4)" />
            <rect x="0" y="0" width={Math.max(1.5, (r.credits / max) * 100)} height="6" rx="3" fill={r.color} />
          </svg>
        </div>
      ))}
    </div>
  );
}

function Kpi({ label, value, sub, tone }: { label: string; value: string; sub?: React.ReactNode; tone?: "ok" | "warn" | "danger" }) {
  return (
    <div className="rounded-[16px] bg-[var(--sp-fill)] p-4">
      <div className="text-[12.5px] text-mute">{label}</div>
      <div className={cx("mt-1 text-[24px] font-bold leading-tight tracking-[-0.02em] tnum", tone === "danger" ? "text-danger" : tone === "warn" ? "text-warn" : "text-ink")}>{value}</div>
      {sub && <div className="mt-0.5 text-[12.5px] text-mute">{sub}</div>}
    </div>
  );
}

const STATUS: Record<UsageMetrics["runway"]["status"], { text: string; tone: "ok" | "warn" | "danger" | "gray" }> = {
  ok: { text: "Хэвийн", tone: "ok" },
  low: { text: "Кредит багасаж байна", tone: "warn" },
  critical: { text: "Кредит дуусах дөхлөө", tone: "danger" },
  empty: { text: "Кредит дууссан — AI зогссон", tone: "danger" },
  expiring_unused: { text: "Жижиг багц хангалттай байж магадгүй", tone: "gray" },
};

/** low/critical SSE мэдэгдлийг нэг удаа toast болгоно */
export function useLevelNotice() {
  useAiEvents((e) => {
    const ev = e as { kind?: string; status?: string };
    if (ev.kind !== "wallet_level") return;
    if (ev.status === "critical") toast("AI кредит дуусах дөхлөө — багц цэнэглэнэ үү", "danger");
    else if (ev.status === "low") toast("AI кредит 20%-иас доош орлоо", "ink");
    else if (ev.status === "empty") toast("AI кредит дууссан — AI зогсож, яриа ажилтанд шилжинэ", "danger");
  });
}

export function Usage({ days = 30 }: { days?: number }) {
  const { data, error } = useLive<UsageMetrics>(`/api/v1/usage?days=${days}`, ["wallet", "wallet_level"]);
  useLevelNotice();
  if (error) return <div className="rounded-[20px] bg-paper p-5 text-[13.5px] text-mute shadow-[0_0_0_0.5px_var(--sp-sep)]">Хэрэглээний мэдээлэл ачаалж чадсангүй: {error}</div>;
  if (!data) return <div className="h-[420px] animate-pulse rounded-[20px] bg-paper shadow-[0_0_0_0.5px_var(--sp-sep)]" />;
  const { runway, burn, value } = data;
  const st = STATUS[runway.status];
  const trend = burn.trend;
  const totalCh = data.byChannel.reduce((a, c) => a + c.credits, 0);
  return (
    <section className="rounded-[20px] bg-paper p-5 shadow-[0_0_0_0.5px_var(--sp-sep)]" aria-label="Хэрэглээний аналитик">
      <div className="flex flex-wrap items-center gap-2">
        <div className="text-[17px] font-bold">Хэрэглээ</div>
        <span
          className={cx(
            "rounded-full px-2.5 py-0.5 text-[12px] font-semibold",
            st.tone === "ok" ? "bg-ok-soft text-ok" : st.tone === "warn" ? "bg-warn-soft text-warn" : st.tone === "danger" ? "bg-danger-soft text-danger" : "bg-[var(--sp-fill)] text-mute",
          )}
        >
          {st.text}
        </span>
        <span className="ml-auto text-[12.5px] text-mute">Сүүлийн {days} хоног · Улаанбаатарын цагаар</span>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
        <div className="flex flex-col items-center justify-center rounded-[16px] bg-[var(--sp-fill)] p-4">
          <Gauge pct={data.cycle.pctLeft} credits={data.wallet.credits} />
          <div className="mt-1 text-center text-[13px] text-mute">
            {runway.daysLeft !== null ? (
              <>
                ≈ {fmt(runway.daysLeft)} хоног хүрнэ · {runway.emptyOn ? `${mmdd(runway.emptyOn)}-нд дуусна` : ""}
              </>
            ) : data.wallet.credits > 0 ? (
              "Зарцуулалт алга — хүрэх хоногийг тооцоолох боломжгүй"
            ) : (
              "Багц аваагүй"
            )}
          </div>
          <div className="mt-0.5 text-[12px] text-mute tnum">
            Энэ мөчлөгт {fmt(data.cycle.granted)} кредитээс {fmt(data.cycle.spent)} зарцуулсан
          </div>
        </div>
        <div className="grid content-start gap-3 sm:grid-cols-3">
          <Kpi
            label="Өдрийн дундаж зарцуулалт"
            value={`${fmt1(burn.perDay7)} кр`}
            sub={
              trend === null ? (
                "Өмнөх 7 хоногтой харьцуулах өгөгдөл алга"
              ) : (
                <span className={trend > 0 ? "text-warn" : "text-ok"}>
                  {trend > 0 ? "↑" : trend < 0 ? "↓" : "→"} {fmt1(Math.abs(trend) * 100)}% өмнөх 7 хоногоос
                </span>
              )
            }
          />
          <Kpi
            label="Хүрэх хоног"
            value={runway.daysLeft !== null ? `${fmt1(runway.daysLeft)} хоног` : "—"}
            tone={runway.status === "critical" || runway.status === "empty" ? "danger" : runway.status === "low" ? "warn" : "ok"}
            sub={runway.emptyOn ? `Дуусах огноо ${runway.emptyOn}` : runway.expiresInDays !== null ? `Багц ${fmt(runway.expiresInDays)} хоногийн дараа дуусна` : "Тооцоолох боломжгүй"}
          />
          <Kpi
            label="Нэг ярианы өртөг"
            value={value.tugrikPerConversation !== null ? `${fmt(value.tugrikPerConversation)}₮` : "—"}
            sub={value.conversations ? `${fmt(value.conversations)} яриа · ${fmt1(value.creditsPerConversation ?? 0)} кр/яриа${value.aiResolvedPct !== null ? ` · AI ${fmt(value.aiResolvedPct)}% шийдсэн` : ""}` : "Яриа алга"}
          />
          <div className="sm:col-span-3">
            <Stacked daily={data.daily} allowance={runway.dailyAllowance} />
          </div>
        </div>
      </div>

      <div className="mt-5 grid gap-6 md:grid-cols-2">
        <div>
          <div className="mb-2 text-[14px] font-semibold">Сувгаар</div>
          <HBars rows={data.byChannel.map((c) => ({ key: c.channel, label: chOf(c.channel).label, color: chOf(c.channel).color, credits: c.credits, pct: c.pct, events: c.events }))} />
        </div>
        <div>
          <div className="mb-2 text-[14px] font-semibold">Үйлдлээр</div>
          <HBars rows={data.byFeature.map((f) => ({ key: f.feature, label: FEATURE[f.feature] ?? f.feature, color: "#0046E2", credits: f.credits, pct: f.pct, events: f.events, extra: `${fmt1(f.unitCost)} кр/удаа` }))} />
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-[var(--sp-sep)] pt-3 text-[12.5px] text-mute">
        <span className="inline-flex items-center gap-1">
          <Icon name="info" size={14} /> 1 кредит ≈ {fmt1(data.creditValue.tugrik)}₮
        </span>
        <span>Чат хариулт = {data.creditValue.chat} кр</span>
        <span>Тушаал = {data.creditValue.command} кр</span>
        <span>Дуудлагын 1 мин = {data.creditValue.voiceMinute} кр</span>
        {totalCh > 0 && <span className="ml-auto tnum">Нийт {fmt(totalCh)} кредит</span>}
      </div>

      {data.tokens.length > 0 && (
        <details className="mt-3 text-[12.5px] text-mute">
          <summary className="cursor-pointer select-none">Техникийн дэлгэрэнгүй (Qwen токен)</summary>
          <table className="mt-2 w-full max-w-[560px] tnum">
            <tbody>
              {data.tokens.map((t) => (
                <tr key={t.model} className="border-t border-[var(--sp-sep)]">
                  <td className="py-1 pr-3">{t.model}</td>
                  <td className="py-1 pr-3">{fmt(t.calls)} дуудлага</td>
                  <td className="py-1 pr-3">{fmt(t.in)} оролт</td>
                  <td className="py-1">{fmt(t.out)} гаралт</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      )}
    </section>
  );
}

/** Хажуугийн цэсний жижиг хэмжигч (AiApp sidebar) */
export function UsageMini({ onClick }: { onClick: () => void }) {
  const { data } = useLive<UsageMetrics>(`/api/v1/usage?days=30`, ["wallet", "wallet_level"]);
  useLevelNotice();
  const credits = data?.wallet.credits ?? 0;
  const pct = data?.cycle.pctLeft ?? 0;
  return (
    <button type="button" onClick={onClick} className="sp-tap w-full rounded-[14px] bg-paper p-3 text-left shadow-[0_0_0_0.5px_var(--sp-sep)]" aria-label="Үлдэгдэл кредит — Багц, төлбөр">
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <div className="text-[12px] text-mute">Үлдэгдэл кредит</div>
          <div className={cx("text-[22px] font-bold tnum", credits > 0 ? "text-ink" : "text-danger")}>{credits.toLocaleString("en-US")}</div>
        </div>
        <Gauge pct={pct} credits={credits} size={76} compact />
      </div>
      <div className="text-[12px] text-mute">
        {!data ? "…" : credits <= 0 ? "Багц аваагүй — AI зогссон" : data.runway.daysLeft !== null ? `≈ ${fmt(data.runway.daysLeft)} хоног хүрнэ · ${Math.round(pct)}%` : `${Math.round(pct)}% үлдсэн`}
      </div>
    </button>
  );
}
