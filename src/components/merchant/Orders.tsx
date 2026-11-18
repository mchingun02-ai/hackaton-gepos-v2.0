"use client";

/* Хүргэлт — зөвхөн мэдээлэл: жагсаалт, дэлгэрэнгүй (7.2 №2–3, BR04). Төлбөр, хүлээлгэн өгөх, цуцлалт — касс (GePOS) дээр. */

import { useState } from "react";
import { CANCEL_LABEL, fmtPhone, hhmm, dateShort, isToday, METHOD_LABEL, money, orderState, sortedOrders } from "@/lib/sp/logic";
import { useSp } from "@/lib/sp/store";
import { Badge, cx, Empty, Group, NavBar, Notice, Row, SearchField, Segmented } from "@/components/sp/ui";
import { Icon } from "@/components/sp/icons";
import { isNewOrder, Locked, PayBadge, Screen, StatusBadge, useM } from "./core";

type F = "active" | "done" | "cancelled";

export function OrderList() {
  const s = useSp();
  const m = useM();
  const [f, setF] = useState<F>("active");
  const [q, setQ] = useState("");
  const lockedState = m.can("delivery") === "locked";

  const all = sortedOrders(s);
  const count = (x: F) => all.filter((o) => orderState(s, o) === x).length;
  const qq = q.trim().toLowerCase();
  const list = all.filter((o) => orderState(s, o) === f && (!qq || `${o.no} ${o.name} ${o.phone}`.toLowerCase().includes(qq.replace(/[#\s]/g, ""))));

  if (lockedState)
    return (
      <Screen nav={<NavBar large title="Хүргэлт" />}>
        <Locked module="delivery" />
      </Screen>
    );

  return (
    <Screen nav={<NavBar large title="Хүргэлт" />}>
      <div className="space-y-2.5 px-4 pt-3">
        <SearchField value={q} onChange={setQ} placeholder="Дугаар, нэр, утсаар хайх" />
        <Segmented
          value={f}
          onChange={setF}
          options={[
            { id: "active", label: `Идэвхтэй · ${count("active")}` },
            { id: "done", label: "Хүргэгдсэн" },
            { id: "cancelled", label: "Цуцлагдсан" },
          ]}
        />
      </div>
      {list.length === 0 ? (
        <Empty
          icon="truck"
          title={qq ? "Олдсонгүй" : f === "active" ? "Идэвхтэй захиалга алга" : f === "done" ? "Хүргэгдсэн захиалга алга" : "Цуцлагдсан захиалга алга"}
          body={qq ? "Өөр дугаар, нэрээр хайж үзнэ үү." : f === "active" ? "Захиалгын хуудсаар шинэ захиалга ирэхэд энд мэдэгдэл гарна." : undefined}
        />
      ) : (
        <Group className="mt-3">
          {list.map((o) => (
            <button key={o.id} type="button" onClick={() => m.push({ k: "order", id: o.id })} className="sp-row flex w-full items-center gap-3 px-4 py-3 text-left">
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span className="text-[17px] font-semibold text-ink tnum">#{o.no}</span>
                  {isNewOrder(s, o) && <Badge tone="accent">Шинэ</Badge>}
                  <span className={cx("ml-auto shrink-0 text-[16px] font-semibold tnum", o.cancel ? "text-mute line-through" : "text-ink")}>{money(o.total)}</span>
                </span>
                <span className="mt-0.5 block truncate text-[14px] text-mute">
                  {o.name} · {isToday(o.createdAt) ? hhmm(o.createdAt) : `${dateShort(o.createdAt)} ${hhmm(o.createdAt)}`}
                </span>
                <span className="mt-1.5 flex flex-wrap gap-1.5">
                  <StatusBadge s={s} o={o} />
                  <PayBadge o={o} />
                </span>
              </span>
              <Icon name="chevron" size={17} stroke={2.2} className="text-[var(--line)]" />
            </button>
          ))}
        </Group>
      )}
      {f === "active" && list.length > 0 && <p className="px-8 pt-2 text-[13px] text-mute">Шинэ захиалга ирэхэд мэдэгдэл гарна. Төлбөр, хүлээлгэн өгөх, цуцлалтыг касс (GePOS) дээр хийнэ.</p>}
    </Screen>
  );
}

export function OrderDetail({ id }: { id: string }) {
  const s = useSp();
  const m = useM();
  const o = s.orders.find((x) => x.id === id);

  if (!o)
    return (
      <Screen nav={<NavBar onBack={m.pop} backLabel="Хүргэлт" title="Захиалга" />}>
        <Empty icon="truck" title="Захиалга олдсонгүй" />
      </Screen>
    );

  const st = orderState(s, o);
  const items = o.lines.reduce((a, l) => a + l.qty, 0);

  return (
    <Screen nav={<NavBar onBack={m.pop} backLabel="Хүргэлт" title={`#${o.no}`} />}>
      {st === "done" && (
        <div className="px-4 pt-3">
          <Notice tone="ok">Хүлээн авах кодоор баталгаажиж хүргэгдсэн.</Notice>
        </div>
      )}
      {o.cancel && (
        <div className="px-4 pt-3">
          <Notice tone="danger" icon="close">
            {CANCEL_LABEL[o.cancel.reason]} · {o.cancel.by} · {dateShort(o.cancel.at)} {hhmm(o.cancel.at)}
            {o.cancel.refunded && <span className="block font-normal">Төлбөр буцаагдаж, И-баримт хүчингүй болсон.</span>}
          </Notice>
        </div>
      )}

      <Group className="mt-3">
        <Row title="Төлөв" trailing={<StatusBadge s={s} o={o} />} />
        <Row title="Төлбөр" sub={o.paid && o.payMethod ? `${METHOD_LABEL[o.payMethod]}-аар төлсөн` : o.cancel ? (o.paid ? undefined : "Төлөгдөөгүй") : o.payLater ? "Хүргэлтээр төлнө" : undefined} trailing={<PayBadge o={o} />} />
      </Group>

      <Group className="mt-3" header="Хүлээн авагч">
        <Row
          title={<b className="font-semibold">{o.name}</b>}
          sub={fmtPhone(o.phone)}
          trailing={
            <a href={`tel:${o.phone}`} aria-label="Залгах" className="sp-tap grid size-11 place-items-center rounded-full bg-ok-soft text-ok">
              <Icon name="phone" size={20} />
            </a>
          }
        />
        <Row icon="pin" title={<span className="text-[15px]">{o.district}, {o.address}</span>} sub={o.note ? `«${o.note}»` : undefined} />
      </Group>

      <Group className="mt-3" header={`Бараа · ${items}`}>
        <div className="space-y-2 px-4 py-3">
          {o.lines.map((l, i) => (
            <div key={i} className="flex justify-between gap-3 text-[15px]">
              <span className="text-ink">
                {l.name} <span className="text-mute">× {l.qty}</span>
              </span>
              <span className="shrink-0 text-ink tnum">{money(l.qty * l.price)}</span>
            </div>
          ))}
          <div className="flex justify-between text-[15px] text-mute">
            <span>Хүргэлт</span>
            <span className="tnum">{o.fee ? money(o.fee) : "Үнэгүй"}</span>
          </div>
          <div className="flex justify-between border-t border-[var(--sp-sep)] pt-2.5 text-[17px] font-semibold text-ink">
            <span>Нийт</span>
            <span className="tnum">{money(o.total)}</span>
          </div>
        </div>
      </Group>

      <Group className="mt-3" header="Түүх">
        {o.history.map((h, i) => (
          <Row
            key={i}
            icon={s.delivery.statuses.find((x) => x.id === h.statusId)?.final ? "check" : i === 0 ? "box" : "truck"}
            title={s.delivery.statuses.find((x) => x.id === h.statusId)?.name ?? h.statusId}
            sub={h.by}
            value={`${isToday(h.at) ? "" : dateShort(h.at) + " "}${hhmm(h.at)}`}
          />
        ))}
      </Group>

      <p className="flex items-start gap-2 px-8 pt-4 text-[13px] leading-snug text-mute">
        <Icon name="info" size={15} className="mt-px" />
        Төлбөр авах, хүлээлгэн өгөх, цуцлалтыг касс (GePOS) дээр хийнэ.
      </p>
    </Screen>
  );
}
