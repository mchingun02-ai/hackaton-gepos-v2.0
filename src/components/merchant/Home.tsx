"use client";

/* Нүүр — өдрийн дүн, шинэ захиалга, нөөц, хурдан үйлдэл, мэдэгдэл (7.2 №1, BR08) */

import { ago, hhmm, lowStock, money, orderState, salesTotals, startOfDay } from "@/lib/sp/logic";
import { useSp } from "@/lib/sp/store";
import { Amount, Group, IconBtn, Row } from "@/components/sp/ui";
import { Icon } from "@/components/sp/icons";
import { BigTitle, Screen, useM } from "./core";

export function Home() {
  const s = useSp();
  const m = useM();
  const now = new Date();
  const today = salesTotals(s, startOfDay(now), now);
  const pos = salesTotals(s, startOfDay(now), now, "pos").total;
  const del = salesTotals(s, startOfDay(now), now, "delivery").total;
  const yNow = new Date(now.getTime() - 86400000);
  const yest = salesTotals(s, startOfDay(yNow), yNow).total;
  const diff = yest ? Math.round(((today.total - yest) / yest) * 100) : 0;

  const active = s.orders.filter((o) => orderState(s, o) === "active");
  const fresh = active.filter((o) => o.statusId === s.delivery.statuses[0]?.id);
  const unpaid = active.filter((o) => !o.paid).length;
  const low = lowStock(s).sort((a, b) => a.stock - b.stock);
  const unread = s.notices.filter((n) => !n.read).length;
  const del_ = m.can("delivery");

  return (
    <Screen
      nav={<div className="h-2 shrink-0" />}
    >
      <div className="flex items-end justify-between pr-4">
        <BigTitle sub={s.merchant.name}>Өнөөдөр</BigTitle>
        <div className="relative mb-2.5">
          <IconBtn name="bell" label="Мэдэгдэл" onClick={() => m.push({ k: "notices" })} />
          {unread > 0 && <span className="absolute -right-0.5 -top-0.5 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-danger px-1 text-[11px] font-bold text-white">{unread}</span>}
        </div>
      </div>

      {m.can("sales") !== "hidden" || m.can("reports") !== "hidden" ? (
        <section className="mx-4 mt-2 rounded-[var(--sp-r-group)] bg-paper p-4">
          <div className="flex items-center justify-between text-[14px] text-mute">
            <span>Борлуулалт</span>
            <span className="tnum">{hhmm(now.toISOString())}</span>
          </div>
          <div className="mt-2">
            <Amount value={today.total} size={38} />
          </div>
          {yest > 0 && (
            <div className={`mt-2 flex items-center gap-1 text-[14px] font-semibold ${diff >= 0 ? "text-ok" : "text-danger"}`}>
              <span aria-hidden="true">{diff >= 0 ? "↑" : "↓"}</span>
              Өчигдрийн энэ цагаас {Math.abs(diff)}% {diff >= 0 ? "их" : "бага"}
            </div>
          )}
          <div className="mt-3 flex gap-5 text-[14px] text-mute">
            <span>
              Дэлгүүрт <b className="font-semibold text-ink tnum">{money(pos)}</b>
            </span>
            <span>
              Хүргэлт <b className="font-semibold text-ink tnum">{money(del)}</b>
            </span>
          </div>
          <div className="mt-1 text-[13px] text-mute">{today.count} гүйлгээ</div>
        </section>
      ) : null}

      {del_ !== "hidden" && (
        <Group className="mt-3">
          {del_ === "ok" ? (
            <Row
              icon="truck"
              iconTone="accent"
              title={<b className="font-semibold">{fresh.length ? `${fresh.length} шинэ захиалга` : "Шинэ захиалга алга"}</b>}
              sub={`${active.length} идэвхтэй${unpaid ? ` · ${unpaid} нь төлөгдөөгүй` : ""}`}
              chevron
              onClick={() => m.goTab("delivery")}
            />
          ) : (
            <Row icon="lock" title="Хүргэлт" sub="Plus багцад нээгдэнэ" chevron onClick={() => m.goTab("delivery")} />
          )}
        </Group>
      )}

      {low.length > 0 && m.can("products") !== "hidden" && (
        <Group
          className="mt-3"
          header={
            <span className="flex items-center gap-1.5 normal-case text-warn">
              <Icon name="warn" size={15} stroke={2.2} /> Нөөц дуусч байна
            </span>
          }
        >
          {low.slice(0, 4).map((p) => (
            <Row key={p.id} title={p.name} value={<span className={p.stock === 0 ? "font-semibold text-danger" : p.stock <= 3 ? "font-semibold text-warn" : ""}>{p.stock} үлдсэн</span>} />
          ))}
        </Group>
      )}

      <div className="mx-4 mt-5 grid grid-cols-3 gap-2.5">
        {(
          [
            { icon: "megaphone", label: "SMS илгээх", go: () => m.goTab("more", { k: "marketing" }), mod: "marketing" },
            { icon: "plus", label: "Харилцагч нэмэх", go: () => m.openAddCustomer(), mod: "crm" },
            { icon: "chart", label: "Тайлан", go: () => m.goTab("more", { k: "reports" }), mod: "reports" },
          ] as const
        )
          .filter((a) => m.can(a.mod) !== "hidden")
          .map((a) => (
            <button key={a.label} type="button" onClick={a.go} className="sp-tap flex min-h-[92px] flex-col justify-between rounded-[16px] bg-paper p-3.5 text-left">
              <Icon name={a.icon} size={22} className="text-accent" />
              <span className="text-[14px] font-semibold leading-tight text-ink">{a.label}</span>
            </button>
          ))}
      </div>

      <Group className="mt-2" header="Мэдэгдэл">
        {s.notices.length === 0 ? (
          <Row icon="bell" title="Мэдэгдэл алга" sub="Шинэ захиалга ирэхэд энд харагдана" />
        ) : (
          <>
            {s.notices.slice(0, 3).map((n) => (
              <Row
                key={n.id}
                icon={n.kind === "order" ? "truck" : n.kind === "stock" ? "warn" : "info"}
                iconTone={n.read ? "gray" : n.kind === "stock" ? "warn" : "accent"}
                title={<span className={n.read ? "" : "font-semibold"}>{n.title}</span>}
                sub={`${n.body} · ${ago(n.at)}`}
              />
            ))}
            <Row title={<span className="text-accent">Бүх мэдэгдэл{unread ? ` · ${unread} шинэ` : ""}</span>} chevron onClick={() => m.push({ k: "notices" })} />
          </>
        )}
      </Group>
    </Screen>
  );
}
