"use client";

/* Dashboard (7.1 №4) — өнөөдрийн борлуулалт, шинэ захиалга, урамшуулал, нөөц, багц */

import { useMemo } from "react";
import { Icon } from "@/components/sp/icons";
import { Badge, Btn, cx, Empty } from "@/components/sp/ui";
import { activePointCampaign, ago, dateShort, itemCampaignLive, lowStock, money, num, orderState, PLAN_LABEL, salesTotals, startOfDay } from "@/lib/sp/logic";
import { Card, Page, Stat, usePortal } from "./kit";

const DAY = 86400000;

export default function Dashboard() {
  const { s, go, can } = usePortal();
  const now = new Date();
  const today0 = startOfDay(now);

  const d = useMemo(() => {
    const today = salesTotals(s, today0, now);
    // Өчигдрийн яг энэ цаг хүртэлх дүнтэй харьцуулна
    const y0 = new Date(today0.getTime() - DAY);
    const yesterday = salesTotals(s, y0, new Date(now.getTime() - DAY));
    const diff = yesterday.total ? Math.round(((today.total - yesterday.total) / yesterday.total) * 100) : null;
    const days = Array.from({ length: 7 }, (_, i) => {
      const from = new Date(today0.getTime() - (6 - i) * DAY);
      const to = new Date(from.getTime() + DAY - 1);
      return { from, pos: salesTotals(s, from, to, "pos").total, delivery: salesTotals(s, from, to, "delivery").total };
    });
    const max = Math.max(1, ...days.map((x) => x.pos + x.delivery));
    const newOrders = s.orders.filter((o) => orderState(s, o) === "active" && o.statusId === "received");
    const point = activePointCampaign(s, now);
    const items = s.campaigns.filter((c) => c.type === "item" && c.active);
    const live = items.filter((c) => c.type === "item" && itemCampaignLive(c, now)).length;
    const recent = [
      ...[...s.sales].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 8).map((x) => ({ at: x.at, icon: x.channel === "delivery" ? ("truck" as const) : ("receipt" as const), text: `${x.refund ? "Буцаалт" : "Борлуулалт"} №${x.no}`, value: money(x.total), refund: !!x.refund })),
      ...s.audit.slice(0, 8).map((a) => ({ at: a.at, icon: "edit" as const, text: `${a.who} · ${a.action} — ${a.target}`, value: a.to ?? "", refund: false })),
    ]
      .sort((a, b) => b.at.localeCompare(a.at))
      .slice(0, 8);
    return { today, yesterday, diff, days, max, newOrders, point, items, live, recent };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s]);

  const low = lowStock(s);
  const ok = (m: Parameters<typeof can>[0]) => can(m) === "ok";

  return (
    <Page title="Dashboard" sub={`${now.getMonth() + 1}-р сарын ${now.getDate()}, ${["Ням", "Даваа", "Мягмар", "Лхагва", "Пүрэв", "Баасан", "Бямба"][now.getDay()]} гараг`} actions={can("products") === "ok" ? <Btn size="md" icon="plus" onClick={() => go("products", "new")}>Бараа нэмэх</Btn> : undefined}>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat
          label="Өнөөдрийн борлуулалт"
          value={money(d.today.total)}
          tone="accent"
          onClick={ok("sales") ? () => go("sales") : undefined}
          sub={
            d.diff === null ? (
              `${d.today.count} гүйлгээ`
            ) : (
              <span className={cx("font-medium", d.diff >= 0 ? "text-ok" : "text-danger")}>
                {d.diff >= 0 ? "↑" : "↓"} Өчигдрийн энэ цагаас {Math.abs(d.diff)}% · {d.today.count} гүйлгээ
              </span>
            )
          }
        />
        <Stat
          label="Хүргэлтийн шинэ захиалга"
          value={can("delivery") === "locked" ? <Icon name="lock" size={24} className="text-mute" /> : d.newOrders.length}
          onClick={can("delivery") !== "hidden" ? () => go("orders") : undefined}
          sub={can("delivery") === "locked" ? "Plus багцад нээгдэнэ" : `${d.newOrders.filter((o) => !o.paid).length} нь төлбөр хүлээж буй`}
        />
        <Stat
          label="Идэвхтэй урамшуулал"
          value={can("campaigns") === "locked" ? <Icon name="lock" size={24} className="text-mute" /> : (d.point ? 1 : 0) + d.items.length}
          onClick={can("campaigns") !== "hidden" ? () => go("campaigns") : undefined}
          sub={can("campaigns") === "locked" ? "Plus багцад нээгдэнэ" : `Оноо ${d.point ? 1 : 0} · Бараа ${d.items.length} (одоо ${d.live} ажиллаж байна)`}
        />
        <Stat label="Багц" value={PLAN_LABEL[s.merchant.plan]} onClick={ok("account") ? () => go("account", "plan") : undefined} sub={s.merchant.plan === "premium" ? "Бүх модуль нээлттэй" : "Дээшлүүлж илүү цэс нээх"} />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-[1fr_380px]">
        <Card title="7 хоногийн борлуулалт" action={<Legend />}>
          <div className="flex h-[220px] items-end gap-3 pt-4" role="img" aria-label="Сүүлийн 7 хоногийн борлуулалт">
            {d.days.map((x, i) => {
              const total = x.pos + x.delivery;
              const isToday = i === 6;
              return (
                <div key={i} className="group flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-2">
                  <span className="text-[11px] font-medium text-mute opacity-0 transition-opacity group-hover:opacity-100 tnum">{num(total / 1000)}k</span>
                  <div className="flex w-full max-w-[56px] flex-col justify-end overflow-hidden rounded-[8px]" style={{ height: `${(total / d.max) * 100}%`, minHeight: 4 }} title={`${dateShort(x.from.toISOString())}: ${money(total)}`}>
                    <div className="w-full bg-accent/40" style={{ height: `${total ? (x.delivery / total) * 100 : 0}%` }} />
                    <div className={cx("w-full flex-1", isToday ? "bg-accent" : "bg-accent/80")} />
                  </div>
                  <span className={cx("text-[12px] tnum", isToday ? "font-semibold text-ink" : "text-mute")}>{isToday ? "Өнөөдөр" : dateShort(x.from.toISOString())}</span>
                </div>
              );
            })}
          </div>
        </Card>

        <div className="flex flex-col gap-4">
          <Card
            title={
              <span className="flex items-center gap-2">
                <Icon name="warn" size={17} className={low.length ? "text-warn" : "text-mute"} />
                Нөөц доод босгонд
              </span>
            }
            action={ok("products") && low.length ? <Btn size="sm" variant="plain" onClick={() => go("products", "low")}>Бүгд</Btn> : undefined}
            pad={false}
          >
            {low.length === 0 ? (
              <p className="px-5 pb-5 pt-2 text-[14px] text-mute">Бүх барааны нөөц хангалттай байна.</p>
            ) : (
              <ul className="pb-2">
                {low.slice(0, 5).map((p) => (
                  <li key={p.id}>
                    <button type="button" disabled={!ok("products")} onClick={() => go("products", p.id)} className="sp-row flex min-h-[44px] w-full items-center gap-3 px-5 text-left text-[14px]">
                      <span className="min-w-0 flex-1 truncate text-ink">{p.name}</span>
                      <Badge tone={p.stock === 0 ? "danger" : "warn"}>{p.stock === 0 ? "Дууссан" : `${p.stock} үлдсэн`}</Badge>
                      <span className="w-14 text-right text-[12px] text-mute tnum">босго {p.minStock}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <EbarimtCard />
        </div>
      </div>

      <Card title="Сүүлийн үйлдэл" className="mt-4" pad={false}>
        {d.recent.length === 0 ? (
          <Empty icon="clock" title="Үйлдэл алга" body="Борлуулалт, тохиргооны өөрчлөлт энд харагдана." />
        ) : (
          <ul className="pb-2">
            {d.recent.map((r, i) => (
              <li key={i} className="flex min-h-[48px] items-center gap-3 border-t border-[var(--sp-sep)] px-5 first:border-t-0">
                <span className="grid size-8 shrink-0 place-items-center rounded-full bg-[var(--sp-fill)] text-mute">
                  <Icon name={r.icon} size={16} />
                </span>
                <span className="min-w-0 flex-1 truncate text-[14px] text-ink">{r.text}</span>
                {r.refund && <Badge tone="danger">Буцаасан</Badge>}
                <span className="hidden text-[14px] text-ink sm:block tnum">{r.value}</span>
                <span className="w-28 shrink-0 text-right text-[12px] text-mute">{ago(r.at)}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </Page>
  );
}

const Legend = () => (
  <span className="flex items-center gap-3 text-[12px] text-mute">
    <span className="flex items-center gap-1.5">
      <span className="size-2.5 rounded-[3px] bg-accent/80" /> Дэлгүүрт
    </span>
    <span className="flex items-center gap-1.5">
      <span className="size-2.5 rounded-[3px] bg-accent/40" /> Хүргэлт
    </span>
  </span>
);

function EbarimtCard() {
  const { s, go, can } = usePortal();
  const y0 = new Date(startOfDay().getTime() - DAY);
  const y1 = new Date(startOfDay().getTime() - 1);
  const list = s.sales.filter((x) => new Date(x.at) >= y0 && new Date(x.at) <= y1);
  const bad = list.filter((x) => !x.refund && x.ebarimt.status !== "sent").length;
  return (
    <button type="button" disabled={can("reports") !== "ok"} onClick={() => go("reports", "ebarimt")} className="sp-row flex items-center gap-3 rounded-[18px] bg-paper px-5 py-4 text-left shadow-[0_0_0_0.5px_var(--sp-sep)]">
      <span className={cx("grid size-9 shrink-0 place-items-center rounded-full", !s.ebarimt ? "bg-danger-soft text-danger" : bad ? "bg-warn-soft text-warn" : "bg-ok-soft text-ok")}>
        <Icon name={!s.ebarimt || bad ? "warn" : "check"} size={18} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-semibold text-ink">Ebarimt тулгалт</span>
        <span className="block text-[13px] text-mute">
          {!s.ebarimt ? "Ebarimt холбогдоогүй — «бусад» төрлөөр баримт гарч байна" : `Өчигдөр: ${list.length} гүйлгээ, ${bad ? `${bad} зөрүүтэй` : "зөрүүгүй"}`}
        </span>
      </span>
      <Icon name="chevron" size={16} className="text-mute" />
    </button>
  );
}
