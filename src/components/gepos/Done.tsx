"use client";

/* Төлбөр амжилттай — дүн, хэрэгсэл, Ebarimt төлөв, оноо, баримт сонголт. */

import { useEffect, useState } from "react";
import { mutate, uid, useSp } from "@/lib/sp/store";
import { fmtPhone, hhmm, METHOD_LABEL, money, num, smsParts, SMS_PRICE } from "@/lib/sp/logic";
import type { Sale } from "@/lib/sp/types";
import { Amount, Btn, NumPad, Sheet, cx, toast, useKeypad } from "@/components/sp/ui";
import { Icon, type IconName } from "@/components/sp/icons";
import { QrCode } from "@/components/QrCode";
import { Screen, usePos } from "./ctx";
import { printReceipt, ReceiptPaper } from "./Receipt";

export function ebarimtText(sale: Sale) {
  const st = sale.ebarimt.status;
  if (st === "off") return { title: "Ebarimt холбогдоогүй", sub: "И-баримт үүсээгүй", tone: "warn" as const };
  if (st === "reversed") return { title: "И-баримт буцаагдсан", sub: "Reverse явсан", tone: "warn" as const };
  const who = sale.ebarimt.kind === "org" ? sale.ebarimt.orgName ?? `РД ${sale.ebarimt.orgReg}` : "Хувь хүн";
  if (st === "other") return { title: "И-баримт «Бусад» төрлөөр", sub: `Сугалаа ${sale.ebarimt.lottery ?? "—"} · ${who}`, tone: "ok" as const };
  return { title: "И-баримт үүслээ", sub: `Сугалаа ${sale.ebarimt.lottery ?? "—"} · ${who}`, tone: "ok" as const };
}

const AUTO = 12;

export function Done({ sale, orderId }: { sale: Sale; orderId?: string }) {
  const s = useSp();
  const pos = usePos();
  const cu = s.customers.find((c) => c.id === sale.customerId);
  const change = sale.cashGiven ? sale.cashGiven - sale.total : 0;
  const [sheet, setSheet] = useState<null | "print" | "qr" | "sms">(null);
  const [left, setLeft] = useState(AUTO);
  // Хариулттай бол автоматаар хаахгүй — кассчин мөнгөө өгөх ёстой
  const auto = !orderId && change <= 0 && sheet === null && left > 0;
  const eb = ebarimtText(sale);

  const next = () => {
    if (orderId) return pos.replace({ s: "handover", id: orderId });
    pos.clearSale();
    pos.reset({ s: "sell" });
  };
  useEffect(() => {
    if (!auto) return;
    const t = setTimeout(() => (left <= 1 ? next() : setLeft(left - 1)), 1000);
    return () => clearTimeout(t);
  });
  const stop = () => setLeft(0);

  const opt: { id: "print" | "qr" | "sms"; icon: IconName; label: string }[] = [
    { id: "print", icon: "print", label: "Хэвлэх" },
    { id: "qr", icon: "qr", label: "QR-аар" },
    { id: "sms", icon: "sms", label: "SMS-ээр" },
  ];

  return (
    <Screen
      bottom={
        <Btn size="xl" block onClick={next}>
          {orderId ? "Ачаа хүлээлгэн өгөх" : auto ? `Шинэ борлуулалт · ${left}` : "Шинэ борлуулалт"}
        </Btn>
      }
    >
      <div className="flex flex-col items-center px-4 pt-8 text-center">
        <span className="ok-badge">
          <svg viewBox="0 0 32 32" className="size-10" aria-hidden="true">
            <path d="M8 16.5 13.5 22 24 11" className="ok-check" fill="none" stroke="var(--accent-ink)" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
        <div className="ok-rise ok-d1 mt-5 text-[19px] font-semibold text-ink">Төлбөр амжилттай</div>
        <div className="ok-rise ok-d2 mt-1">
          <Amount value={sale.total} size={44} />
        </div>
        <div className="ok-rise ok-d2 mt-1 text-[14px] text-mute">
          {METHOD_LABEL[sale.method]} · №{sale.no} · {hhmm(sale.at)}
        </div>
      </div>

      {change > 0 && (
        <div className="ok-rise ok-d3 mx-4 mt-4 rounded-[18px] bg-ok-soft px-4 py-3 text-center">
          <div className="text-[14px] font-medium text-ok">Хариулт өгөх</div>
          <Amount value={change} size={40} className="!text-ok" />
          <div className="text-[13px] text-ok">Авсан {money(sale.cashGiven ?? 0)}</div>
        </div>
      )}

      <div className="ok-rise ok-d3 mx-4 mt-4 overflow-hidden rounded-[var(--sp-r-group)] bg-paper [&>*+*]:border-t [&>*+*]:border-[var(--sp-sep)]">
        <InfoRow icon="receipt" tone={eb.tone} title={eb.title} sub={eb.sub} />
        {cu && (
          <InfoRow
            icon="star"
            tone="accent"
            title={sale.pointsEarned ? `+${num(sale.pointsEarned)} оноо · ${cu.name ?? fmtPhone(cu.phone)}` : `${cu.name ?? fmtPhone(cu.phone)} · ${num(cu.points)} оноо`}
            sub={[sale.pointsSpent ? `${num(sale.pointsSpent)} оноо зарцуулсан` : null, cu.passSerial ? "Wallet pass ар талд шинэчлэгдэнэ" : `Үлдэгдэл ${num(cu.points)} оноо`].filter(Boolean).join(" · ")}
          />
        )}
      </div>

      <div className="px-4 pb-6">
        <div className="px-1 pb-1.5 pt-4 text-[13px] font-medium text-mute">Баримт өгөх</div>
        <div className="grid grid-cols-3 gap-2">
          {opt.map((o) => (
            <button
              key={o.id}
              type="button"
              onClick={() => {
                stop();
                setSheet(o.id);
                if (o.id === "print") printReceipt();
              }}
              className="sp-tap flex h-[72px] flex-col items-center justify-center gap-1 rounded-[16px] bg-paper text-[14px] font-semibold text-ink"
            >
              <Icon name={o.icon} size={22} className="text-accent" />
              {o.label}
            </button>
          ))}
        </div>
      </div>

      <Sheet open={sheet === "print"} onClose={() => setSheet(null)} title="Баримт" trailing={<button type="button" onClick={printReceipt} className="sp-tap h-11 px-2 text-[17px] font-semibold text-accent">Хэвлэх</button>}>
        <div className="px-4 pb-6 pt-2">
          <ReceiptPaper sale={sale} />
        </div>
      </Sheet>
      <Sheet open={sheet === "qr"} onClose={() => setSheet(null)} title="QR баримт">
        <div className="flex flex-col items-center px-6 pb-8 pt-4 text-center">
          <QrCode value={`https://ebarimt.mn/?ddtd=${sale.ebarimt.ddtd}`} size={220} label="И-баримтын QR" />
          <p className="mt-4 text-[15px] text-ink">Худалдан авагч утасныхаа камераар уншуулна.</p>
          <p className="mt-1 text-[13px] text-mute">Сугалаа {sale.ebarimt.lottery ?? "—"}</p>
        </div>
      </Sheet>
      <SmsSheet open={sheet === "sms"} onClose={() => setSheet(null)} sale={sale} phone={cu?.phone ?? ""} />
    </Screen>
  );
}

function InfoRow({ icon, tone, title, sub }: { icon: IconName; tone: "ok" | "warn" | "accent"; title: string; sub?: string }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3 text-left">
      <span className={cx("grid size-9 shrink-0 place-items-center rounded-[10px]", tone === "ok" ? "bg-ok-soft text-ok" : tone === "warn" ? "bg-warn-soft text-warn" : "bg-accent-soft text-accent")}>
        <Icon name={icon} size={19} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[15.5px] font-medium text-ink">{title}</span>
        {sub && <span className="block text-[13px] leading-snug text-mute">{sub}</span>}
      </span>
    </div>
  );
}

function SmsSheet({ open, onClose, sale, phone }: { open: boolean; onClose: () => void; sale: Sale; phone: string }) {
  const s = useSp();
  const [num8, setNum8] = useState(phone);
  const key = (k: string) => {
    if (k === "back") return setNum8((p) => p.slice(0, -1));
    if (/^\d$/.test(k)) setNum8((p) => (p.length < 8 ? p + k : p));
  };
  useKeypad(key, open);
  const send = () => {
    const text = `${s.delivery.page.name}: ${money(sale.total)} баримт №${sale.no}. ebarimt.mn/?d=${sale.ebarimt.ddtd.slice(0, 10)}`;
    mutate((st) => ({ ...st, smsLog: [{ id: uid("sm"), at: new Date().toISOString(), kind: "delivery" as const, phone: num8, text, cost: smsParts(text).parts * SMS_PRICE }, ...st.smsLog] }));
    toast(`Баримт ${fmtPhone(num8)} руу илгээгдлээ`, "ok");
    onClose();
  };
  return (
    <Sheet open={open} onClose={onClose} title="SMS баримт">
      <div className="space-y-4 px-4 pb-5 pt-3">
        <div className="text-center text-[32px] font-bold tracking-[0.02em] text-ink tnum">{fmtPhone(num8.padEnd(8, "_")).replace(/_/g, "·")}</div>
        <NumPad onKey={key} />
        <Btn size="xl" block disabled={num8.length !== 8} onClick={send}>
          Илгээх
        </Btn>
      </div>
    </Sheet>
  );
}
