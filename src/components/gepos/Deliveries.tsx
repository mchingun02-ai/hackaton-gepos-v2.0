"use client";

/* Хүргэлт (BR09-1.2, US16, US17): жагсаалт, дэлгэрэнгүй, цуцлах. */

import { useState } from "react";
import { cancelOrder, setOrderStatus, useSp } from "@/lib/sp/store";
import { ago, CANCEL_LABEL, fmtPhone, hhmm, maskPhone, METHOD_LABEL, money, orderState, sortedOrders } from "@/lib/sp/logic";
import type { CancelReason, Order, SpState } from "@/lib/sp/types";
import { Badge, Btn, Empty, Group, IconBtn, NavBar, Notice, Row, SearchField, Sheet, cx, toast } from "@/components/sp/ui";
import { Icon } from "@/components/sp/icons";
import { Line, OfflineBanner, Screen, card, usePos } from "./ctx";
import { useGuard } from "./Approval";

const statusName = (s: SpState, id: string) => s.delivery.statuses.find((x) => x.id === id)?.name ?? id;

export function StatusBadge({ s, o }: { s: SpState; o: Order }) {
  const st = orderState(s, o);
  if (st === "cancelled") return <Badge tone="danger" icon="close">Цуцлагдсан</Badge>;
  if (st === "done") return <Badge tone="ok" icon="check">{statusName(s, o.statusId)}</Badge>;
  return <Badge tone="accent" icon={o.statusId === s.delivery.statuses[0]?.id ? "box" : "truck"}>{statusName(s, o.statusId)}</Badge>;
}

export function PayBadge({ o }: { o: Order }) {
  if (o.cancel) return o.cancel.refunded ? <Badge>Буцаасан</Badge> : null;
  if (o.paid) return <Badge tone="ok">Төлсөн</Badge>;
  return <Badge tone="warn" icon="clock">{o.payLater ? "Дараа төлөх" : "Төлөөгүй"}</Badge>;
}

const isNew = (s: SpState, o: Order) => orderState(s, o) === "active" && o.statusId === s.delivery.statuses[0]?.id && Date.now() - new Date(o.createdAt).getTime() < 15 * 60000;

export function Orders() {
  const s = useSp();
  const pos = usePos();
  const [q, setQ] = useState("");
  const [menu, setMenu] = useState(false);
  const term = q.trim().toLowerCase();
  const list = sortedOrders(s).filter((o) => !term || String(o.no).includes(term) || o.phone.includes(term) || o.name.toLowerCase().includes(term));
  const groups = (["active", "done", "cancelled"] as const).map((k) => ({ k, items: list.filter((o) => orderState(s, o) === k) }));
  const label = { active: "Идэвхтэй", done: "Дууссан", cancelled: "Цуцлагдсан" };

  return (
    <Screen nav={<NavBar title="Хүргэлт" onBack={pos.back} trailing={<IconBtn name="dots" label="Цэс" tone="plain" onClick={() => setMenu(true)} />} />}>
      <div className="px-4 pt-3">
        <SearchField value={q} onChange={setQ} placeholder="Дугаар, нэр эсвэл утас" />
      </div>
      {!s.delivery.enabled && (
        <div className="px-4 pt-3">
          <Notice tone="gray">Захиалгын хуудас хаалттай байна. Порталын Хүргэлт хэсгээс нээнэ.</Notice>
        </div>
      )}
      {list.length === 0 && <Empty icon="truck" title={term ? "Олдсонгүй" : "Захиалга алга"} body={term ? "Хайлтаа шалгана уу." : "Захиалгын хуудсаар шинэ захиалга ирэхэд энд мэдэгдэнэ."} />}
      {groups.map(
        (g) =>
          g.items.length > 0 && (
            <Group key={g.k} header={`${label[g.k]} · ${g.items.length}`}>
              {g.items.map((o) => (
                <button
                  key={o.id}
                  type="button"
                  onClick={() => pos.go({ s: "order", id: o.id })}
                  className={cx("sp-row flex w-full items-center gap-2 px-4 py-3 text-left", pos.fresh.has(o.id) && "sp-flash")}
                >
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className={cx("text-[17px] font-bold tnum", g.k === "active" ? "text-ink" : "text-mute")}>#{o.no}</span>
                      {isNew(s, o) && <Badge tone="danger">Шинэ</Badge>}
                      <span className={cx("ml-auto text-[16px] font-semibold tnum", g.k === "active" ? "text-ink" : "text-mute")}>{money(o.total)}</span>
                    </span>
                    <span className="mt-0.5 block truncate text-[14px] text-ink-2">
                      {o.name} · {o.district} · <span className="text-mute">{ago(o.createdAt)}</span>
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
          ),
      )}
      <div className="h-6" />
      <Sheet open={menu} onClose={() => setMenu(false)} title="Хүргэлт">
        <div className="pb-6">
          <Group>
            <Row
              icon="stop"
              iconTone="danger"
              title="Хүргэлт зогсоох"
              sub="Дууссан барааг хүргэлтээс хасах"
              chevron
              onClick={() => {
                setMenu(false);
                pos.go({ s: "stop" });
              }}
            />
          </Group>
        </div>
      </Sheet>
    </Screen>
  );
}

export function OrderDetail({ id }: { id: string }) {
  const s = useSp();
  const pos = usePos();
  const guard = useGuard();
  const [statusOpen, setStatusOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [reason, setReason] = useState<CancelReason>("customer");
  const o = s.orders.find((x) => x.id === id);
  if (!o)
    return (
      <Screen nav={<NavBar title="Захиалга" onBack={pos.back} />}>
        <Empty icon="truck" title="Захиалга олдсонгүй" />
      </Screen>
    );
  const st = orderState(s, o);
  const active = st === "active";
  const steps = s.delivery.statuses.filter((x) => !x.final);

  const doCancel = () =>
    guard(
      {
        title: `#${o.no} цуцлах уу?`,
        message: o.paid ? `${money(o.total)} буцаагдаж, И-баримт reverse явна.` : "Захиалга цуцлагдаж, бараа нөөцөд буцна.",
        ok: "Цуцлах",
        action: "Хүргэлт цуцлах",
      },
      (actor) => {
        try {
          cancelOrder(actor, o.id, reason);
          setCancelOpen(false);
          toast(`#${o.no} цуцлагдлаа${o.paid ? " · буцаалт хийгдлээ" : ""}`, "ok");
        } catch (e) {
          toast((e as Error).message, "danger");
        }
      },
    );

  return (
    <Screen
      nav={<NavBar title={`Захиалга #${o.no}`} onBack={pos.back} />}
      bottom={
        active ? (
          <div className="grid gap-2">
            {!o.paid && (
              <Btn size="xl" block disabled={!s.online} onClick={() => pos.go({ s: "pay", job: { kind: "order", orderId: o.id } })}>
                Төлбөр хүлээн авах · {money(o.total)}
              </Btn>
            )}
            <Btn
              variant={o.paid ? "filled" : "gray"}
              size={o.paid ? "xl" : "lg"}
              block
              icon="key"
              onClick={() => (o.paid ? pos.go({ s: "handover", id: o.id }) : toast("Эхлээд төлбөрөө хүлээн авна уу", "danger"))}
            >
              Ачаа хүлээлгэн өгөх
            </Btn>
          </div>
        ) : undefined
      }
    >
      {!s.online && active && <OfflineBanner what="Төлбөр авах боломжгүй" />}
      <div className="flex flex-wrap gap-1.5 px-4 pt-3">
        <StatusBadge s={s} o={o} />
        <PayBadge o={o} />
      </div>
      {o.cancel && (
        <div className="px-4 pt-3">
          <Notice tone="danger" icon="close">
            {CANCEL_LABEL[o.cancel.reason]} · {o.cancel.by} · {hhmm(o.cancel.at)}
            {o.cancel.refunded ? " · буцаалт хийгдсэн" : ""}
          </Notice>
        </div>
      )}
      <div className="px-4 pt-3">
        <div className={`${card} overflow-hidden [&>*+*]:border-t [&>*+*]:border-[var(--sp-sep)]`}>
          <div className="flex items-center gap-3 px-4 py-3">
            <div className="min-w-0 flex-1">
              <div className="text-[17px] font-semibold text-ink">{o.name}</div>
              <div className="text-[14px] text-mute tnum">{active ? fmtPhone(o.phone) : maskPhone(o.phone)}</div>
            </div>
            {active && (
              <a href={`tel:${o.phone}`} aria-label="Залгах" className="sp-tap grid size-12 place-items-center rounded-full bg-ok-soft text-ok">
                <Icon name="phone" size={22} />
              </a>
            )}
          </div>
          <div className="flex gap-3 px-4 py-3">
            <Icon name="pin" size={20} className="mt-0.5 text-mute" />
            <div className="text-[15px] leading-snug text-ink">
              {o.address}
              {o.note && <div className="mt-1 text-[13px] text-mute">«{o.note}»</div>}
            </div>
          </div>
        </div>
      </div>

      <div className="px-4 pt-3">
        <div className="px-1 pb-1.5 text-[13px] font-medium text-mute">Бараа</div>
        <div className={`${card} px-4 py-3`}>
          {o.lines.map((l, i) => (
            <Line key={i} label={`${l.name} × ${l.qty}`} value={money(l.qty * l.price)} />
          ))}
          {o.fee > 0 && <Line label="Хүргэлт" value={money(o.fee)} tone="mute" />}
          <div className="my-1.5 border-t border-[var(--sp-sep)]" />
          <Line label="Нийт" value={money(o.total)} strong />
          {o.paid && o.payMethod && <div className="text-right text-[12px] text-mute">{METHOD_LABEL[o.payMethod]}-ээр төлсөн</div>}
        </div>
      </div>

      {active && (
        <Group>
          <Row icon="truck" title="Төлөв солих" sub={statusName(s, o.statusId)} chevron onClick={() => setStatusOpen(true)} />
        </Group>
      )}

      <Group header="Түүх">
        {o.history.map((h, i) => (
          <Row key={i} title={statusName(s, h.statusId)} sub={`${hhmm(h.at)} · ${h.by}`} />
        ))}
      </Group>

      {active && (
        <Group>
          <Row icon="close" iconTone="danger" title="Захиалга цуцлах" destructive onClick={() => setCancelOpen(true)} />
        </Group>
      )}
      <div className="h-6" />

      <Sheet open={statusOpen} onClose={() => setStatusOpen(false)} title="Төлөв">
        <div className="pb-6">
          <Group footer="«Хүргэгдсэн» төлөвт зөвхөн ачаа хүлээлгэн өгөх кодоор шилжинэ.">
            {steps.map((x) => (
              <Row
                key={x.id}
                title={x.name}
                trailing={o.statusId === x.id ? <Icon name="check" size={20} stroke={2.4} className="text-accent" /> : null}
                onClick={() => {
                  if (x.id !== o.statusId) {
                    try {
                      setOrderStatus(pos.actor, o.id, x.id);
                      toast(`#${o.no} · ${x.name}${x.sms && s.delivery.sms ? " · SMS илгээгдлээ" : ""}`, "ok");
                    } catch (e) {
                      toast((e as Error).message, "danger");
                    }
                  }
                  setStatusOpen(false);
                }}
              />
            ))}
          </Group>
        </div>
      </Sheet>

      <Sheet
        open={cancelOpen}
        onClose={() => setCancelOpen(false)}
        title="Захиалга цуцлах"
        footer={
          <Btn variant="danger" size="xl" block disabled={!s.online && o.paid} onClick={doCancel}>
            Цуцлах{o.paid ? ` · ${money(o.total)} буцаах` : ""}
          </Btn>
        }
      >
        <div className="pb-2">
          <Group header="Шалтгаан">
            {(Object.keys(CANCEL_LABEL) as CancelReason[]).map((r) => (
              <Row key={r} title={CANCEL_LABEL[r]} onClick={() => setReason(r)} trailing={reason === r ? <Icon name="check" size={20} stroke={2.4} className="text-accent" /> : <span className="size-5" />} />
            ))}
          </Group>
          <div className="space-y-2 px-4 pt-4">
            {o.paid ? (
              <Notice tone="gray" icon="receipt">
                Төлсөн захиалга: {money(o.total)} буцаагдаж, И-баримт reverse явна. Бараа нөөцөд буцна.
              </Notice>
            ) : (
              <Notice tone="gray" icon="box">
                Төлбөр аваагүй — бараа нөөцөд буцна.
              </Notice>
            )}
            {o.paid && o.payMethod === "qr" && <Notice tone="warn">QR-аар төлсөн тул мөнгийг мерчант өөрөө харилцагчид буцааж шилжүүлнэ.</Notice>}
            {!pos.role.manage && <p className="text-center text-[12.5px] text-mute">Менежер эсвэл админы PIN шаардлагатай.</p>}
          </div>
        </div>
      </Sheet>
    </Screen>
  );
}
