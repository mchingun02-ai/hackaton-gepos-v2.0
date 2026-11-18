"use client";

/* Гүйлгээний түүх → дэлгэрэнгүй → буцаалт (BR09-6, 7.3 №10, US17). */

import { useState } from "react";
import { refundSale, useSp } from "@/lib/sp/store";
import { hhmm, isToday, maskPhone, METHOD_LABEL, money, num, staffName } from "@/lib/sp/logic";
import { Badge, Btn, Empty, Group, NavBar, Notice, Row, Segmented, Sheet, cx, toast } from "@/components/sp/ui";
import { Icon } from "@/components/sp/icons";
import { Line, OfflineBanner, Screen, card, usePos } from "./ctx";
import { useGuard } from "./Approval";
import { ebarimtText } from "./Done";
import { printReceipt, ReceiptPaper } from "./Receipt";

export function History() {
  const s = useSp();
  const pos = usePos();
  const [who, setWho] = useState<"me" | "all">("me");
  const list = s.sales.filter((x) => isToday(x.at) && (who === "all" || x.staffId === pos.staff.id)).sort((a, b) => b.at.localeCompare(a.at));
  return (
    <Screen nav={<NavBar title="Гүйлгээний түүх" onBack={pos.back} />}>
      {pos.role.manage && (
        <div className="px-4 pt-3">
          <Segmented
            options={[
              { id: "me", label: "Миний" },
              { id: "all", label: "Бүх касс" },
            ]}
            value={who}
            onChange={(v) => setWho(v as "me" | "all")}
          />
        </div>
      )}
      {list.length === 0 ? (
        <Empty icon="receipt" title="Өнөөдөр гүйлгээ алга" body="Борлуулалт хийхэд энд жагсана." />
      ) : (
        <Group header={`Өнөөдөр · ${list.length}`}>
          {list.map((x) => (
            <Row
              key={x.id}
              title={
                <span className="flex items-center gap-2">
                  <span className="font-semibold tnum">№{x.no}</span>
                  {x.refund && <Badge tone="danger">Буцаасан</Badge>}
                  {x.channel === "delivery" && <Badge>Хүргэлт</Badge>}
                </span>
              }
              sub={`${hhmm(x.at)} · ${METHOD_LABEL[x.method]}${x.lines.length ? ` · ${x.lines.length} бараа` : ""}`}
              value={<span className={cx("font-semibold text-ink", x.refund && "text-mute line-through")}>{money(x.total)}</span>}
              chevron
              onClick={() => pos.go({ s: "sale", id: x.id })}
            />
          ))}
        </Group>
      )}
      <div className="h-6" />
    </Screen>
  );
}

export function SaleDetail({ id }: { id: string }) {
  const s = useSp();
  const pos = usePos();
  const [paper, setPaper] = useState(false);
  const sale = s.sales.find((x) => x.id === id);
  if (!sale) return <Screen nav={<NavBar title="Гүйлгээ" onBack={pos.back} />}><Empty icon="receipt" title="Гүйлгээ олдсонгүй" /></Screen>;
  const cu = s.customers.find((c) => c.id === sale.customerId);
  const eb = ebarimtText(sale);
  const order = sale.orderId ? s.orders.find((o) => o.id === sale.orderId) : undefined;
  return (
    <Screen
      nav={<NavBar title={`Гүйлгээ №${sale.no}`} onBack={pos.back} />}
      bottom={
        !sale.refund && !order ? (
          <Btn variant="dangerTinted" size="lg" block icon="undo" onClick={() => pos.go({ s: "refund", id: sale.id })}>
            Буцаалт хийх
          </Btn>
        ) : undefined
      }
    >
      <div className="space-y-3 px-4 pb-6 pt-4">
        {sale.refund && (
          <Notice tone="danger" icon="undo">
            Буцаасан · {hhmm(sale.refund.at)} · {sale.refund.by} · {sale.refund.reason}
          </Notice>
        )}
        {order && <Notice tone="gray" icon="truck">Хүргэлтийн захиалга #{order.no} — цуцлахдаа захиалгаас нь хийнэ.</Notice>}
        <div className={`${card} px-4 py-3`}>
          {sale.lines.map((l, i) => (
            <Line key={i} label={`${l.name} × ${l.qty}`} value={l.free ? "Үнэгүй" : money(l.qty * l.price)} tone={l.free ? "ok" : undefined} />
          ))}
          {sale.applied.map((a) => (
            <Line key={a.campaignId} label={a.name} value={`−${money(a.amount)}`} tone="ok" />
          ))}
          {sale.pointsSpent > 0 && <Line label="Оноогоор" value={`−${money(sale.pointsSpent)}`} tone="ok" />}
          <div className="my-1.5 border-t border-[var(--sp-sep)]" />
          <Line label="Төлсөн" value={money(sale.total)} strong />
        </div>
        <div className="overflow-hidden rounded-[var(--sp-r-group)] bg-paper [&>*+*]:border-t [&>*+*]:border-[var(--sp-sep)]">
          <Row icon={sale.method === "qr" ? "qr" : sale.method === "card" ? "card" : "cash"} title={METHOD_LABEL[sale.method]} value={`${hhmm(sale.at)} · ${staffName(s.staff.find((x) => x.id === sale.staffId))}`} />
          <Row icon="receipt" iconTone={eb.tone === "ok" ? "ok" : "warn"} title={eb.title} sub={eb.sub} />
          {cu && <Row icon="person" title={cu.name ?? maskPhone(cu.phone)} sub={`${maskPhone(cu.phone)} · +${num(sale.pointsEarned)} оноо`} />}
          <Row icon="print" title="Баримт харах, хэвлэх" chevron onClick={() => setPaper(true)} />
        </div>
      </div>
      <Sheet open={paper} onClose={() => setPaper(false)} title="Баримт" trailing={<button type="button" onClick={printReceipt} className="sp-tap h-11 px-2 text-[17px] font-semibold text-accent">Хэвлэх</button>}>
        <div className="px-4 pb-6 pt-2">
          <ReceiptPaper sale={sale} />
        </div>
      </Sheet>
    </Screen>
  );
}

const REASONS = ["Харилцагч татгалзсан", "Бараа гэмтэлтэй", "Буруу бүртгэсэн", "Бусад"];

export function Refund({ id }: { id: string }) {
  const s = useSp();
  const pos = usePos();
  const guard = useGuard();
  const [reason, setReason] = useState(REASONS[0]);
  const sale = s.sales.find((x) => x.id === id);
  if (!sale) return null;
  const cu = s.customers.find((c) => c.id === sale.customerId);
  const qty = sale.lines.filter((l) => l.productId).reduce((a, l) => a + l.qty, 0);

  const run = () =>
    guard(
      { title: `${money(sale.total)} буцаах уу?`, message: "Буцаалтыг дахин сэргээх боломжгүй.", ok: "Буцаах", action: "Буцаалт" },
      (actor) => {
        try {
          refundSale(actor, sale.id, reason);
          toast(`Буцаалт хийгдлээ · ${money(sale.total)}`, "ok");
          pos.back();
        } catch (e) {
          toast((e as Error).message, "danger");
        }
      },
    );

  return (
    <Screen
      nav={<NavBar title="Буцаалт" onBack={pos.back} />}
      bottom={
        <Btn variant="danger" size="xl" block disabled={!s.online || !!sale.refund} onClick={run}>
          Буцаалт хийх · {money(sale.total)}
        </Btn>
      }
    >
      {!s.online && <OfflineBanner what="Буцаалт хийх боломжгүй" />}
      <div className="px-4 pt-4">
        <div className={`${card} flex items-center justify-between px-4 py-3`}>
          <div>
            <div className="text-[17px] font-semibold text-ink">Гүйлгээ №{sale.no}</div>
            <div className="text-[13px] text-mute">
              Өнөөдөр {hhmm(sale.at)} · {METHOD_LABEL[sale.method]}
              {cu?.name ? ` · ${cu.name}` : ""}
            </div>
          </div>
          <div className="text-[20px] font-bold text-ink tnum">{money(sale.total)}</div>
        </div>
      </div>
      <Group header="Буцаах шалтгаан">
        {REASONS.map((r) => (
          <Row key={r} title={r} onClick={() => setReason(r)} trailing={reason === r ? <Icon name="check" size={20} stroke={2.4} className="text-accent" /> : <span className="size-5" />} />
        ))}
      </Group>
      <Group header="Буцаавал">
        {sale.ebarimt.status !== "off" && <Row icon="receipt" title="И-баримт буцаагдана (reverse)" />}
        {sale.pointsEarned > 0 && <Row icon="star" title={`Олгосон ${num(sale.pointsEarned)} оноо хасагдана`} />}
        {sale.pointsSpent > 0 && <Row icon="wallet" title={`Зарцуулсан ${num(sale.pointsSpent)} оноо сэргэнэ`} />}
        {qty > 0 && <Row icon="box" title={`${qty} ширхэг бараа нөөцөд буцна`} />}
        {sale.method === "cash" && <Row icon="cash" title={`${money(sale.total)} бэлнээр буцааж өгнө`} />}
        {sale.method === "card" && <Row icon="card" title="Карт руу буцаалт явна" />}
      </Group>
      {sale.method === "qr" && (
        <div className="px-4 pt-4">
          <Notice tone="warn">QR-аар төлсөн гүйлгээ тул мөнгийг мерчант өөрөө харилцагчид буцааж шилжүүлнэ.</Notice>
        </div>
      )}
      {!pos.role.manage && <p className="px-8 pt-3 text-center text-[12.5px] text-mute">Менежер эсвэл админы PIN шаардлагатай.</p>}
      <div className="h-6" />
    </Screen>
  );
}
