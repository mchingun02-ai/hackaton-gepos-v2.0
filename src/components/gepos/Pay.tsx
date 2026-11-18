"use client";

/*
 * Төлбөр хүлээн авах (BR09; 7.3 №6). Биет борлуулалт ба хүргэлтийн
 * «дараа төлөх» захиалга хоёулаа энэ дэлгэцээр явна.
 * BR09-7 онлайн шаардлага, BR09-8 идемпотент түлхүүр (checkout бүрт нэг).
 */

import { useEffect, useEffectEvent, useState } from "react";
import { collectOrderPayment, completeSale, SpError, uid, useSp } from "@/lib/sp/store";
import { money, priceCart } from "@/lib/sp/logic";
import type { PayMethod, Sale } from "@/lib/sp/types";
import { Amount, Btn, Notice, NavBar, NumPad, Segmented, Sheet, Spinner, CodeBoxes, Stack, cx, toast, useKeypad } from "@/components/sp/ui";
import { Icon, type IconName } from "@/components/sp/icons";
import { QrCode } from "@/components/QrCode";
import { OfflineBanner, Screen, usePos, type PayJob } from "./ctx";
import { Done } from "./Done";

type Step = "choose" | "qr" | "card" | "cash" | "declined" | "done";
export type Eb = { kind: "person" | "org"; orgReg?: string; orgName?: string };

const ORG_NAMES = ["Хангай Трейд ХХК", "Од Билдинг ХХК", "Сэлэнгэ Агро ХХК", "Ирээдүй Технологи ХХК", "Тал Логистик ХХК"];

export function Pay({ job }: { job: PayJob }) {
  const s = useSp();
  const pos = usePos();
  const [idem] = useState(() => uid("pay-")); // BR09-8: энэ checkout-ын нэг түлхүүр
  const [step, setStep] = useState<Step>("choose");
  const [dir, setDir] = useState<1 | -1>(1);
  const [eb, setEb] = useState<Eb>({ kind: "person" });
  const [sale, setSale] = useState<Sale | null>(null);
  const [busy, setBusy] = useState(false);

  const order = job.kind === "order" ? s.orders.find((o) => o.id === job.orderId) : undefined;
  const customer = s.customers.find((c) => c.id === (order ? order.customerId : pos.draft.customerId)) ?? null;
  const priced = job.kind === "sale" && pos.draft.mode === "cart" ? priceCart(s, pos.draft.cart, customer, pos.draft.redeem ? 1e12 : 0) : null;
  const total = sale ? sale.total : order ? order.total : priced ? priced.total : pos.draft.amount;
  const discount = priced ? priced.discount + priced.redeem : 0;

  const to = (st: Step, d: 1 | -1 = 1) => {
    setDir(d);
    setStep(st);
  };

  const approve = (method: PayMethod, cashGiven?: number) => {
    if (busy) return;
    setBusy(true);
    try {
      let done: Sale | undefined;
      if (order) {
        done = collectOrderPayment(pos.actor, order.id, method, idem, eb);
        if (!done) throw new SpError("Захиалга аль хэдийн төлөгдсөн байна.");
      } else {
        const d = pos.draft;
        done = completeSale({
          who: pos.actor,
          mode: d.mode,
          cart: d.mode === "cart" ? d.cart : undefined,
          amount: d.mode === "amount" ? d.amount : undefined,
          split: d.mode === "amount" && d.split ? d.split : undefined,
          customerId: d.customerId ?? undefined,
          redeem: d.mode === "cart" && d.redeem ? 1e12 : 0,
          method,
          cashGiven,
          ebarimt: eb,
          idemKey: idem,
        });
      }
      setSale(done);
      to("done");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Алдаа гарлаа", "danger");
      to("choose", -1);
    } finally {
      setBusy(false);
    }
  };

  const cancel = () => pos.back();

  return (
    <div className="relative h-full">
      <Stack k={step} dir={dir}>
        {step === "choose" && <Choose total={total} discount={discount} who={customer?.name} eb={eb} setEb={setEb} onPick={(m) => to(m)} onCancel={cancel} isOrder={!!order} orderNo={order?.no} />}
        {step === "qr" && <QrStep total={total} idem={idem} onApprove={() => approve("qr")} onOther={() => to("choose", -1)} onCancel={cancel} />}
        {step === "card" && <CardStep total={total} onApprove={() => approve("card")} onDecline={() => to("declined")} onOther={() => to("choose", -1)} onCancel={cancel} />}
        {step === "cash" && <CashStep total={total} onApprove={(g) => approve("cash", g)} onBack={() => to("choose", -1)} />}
        {step === "declined" && <Declined total={total} onRetry={() => to("card", -1)} onOther={() => to("choose", -1)} onCancel={cancel} />}
        {step === "done" && sale && <Done sale={sale} orderId={order?.id} />}
      </Stack>
    </div>
  );
}

/* ───────── сонголт ───────── */

function Choose({
  total,
  discount,
  who,
  eb,
  setEb,
  onPick,
  onCancel,
  isOrder,
  orderNo,
}: {
  total: number;
  discount: number;
  who?: string;
  eb: Eb;
  setEb: (e: Eb) => void;
  onPick: (m: "qr" | "card" | "cash") => void;
  onCancel: () => void;
  isOrder: boolean;
  orderNo?: number;
}) {
  const s = useSp();
  const [orgOpen, setOrgOpen] = useState(false);
  const methods: {
    id: "qr" | "card" | "cash";
    icon: IconName;
    title: string;
    sub: string;
  }[] = [
    { id: "qr", icon: "qr", title: "QR", sub: "Банкны аппаар уншуулна" },
    {
      id: "card",
      icon: "nfc",
      title: "Карт",
      sub: "Ойртуулах, чип, соронзон тууз",
    },
    {
      id: "cash",
      icon: "cash",
      title: "Бэлэн мөнгө",
      sub: "Хариулт тооцоолно",
    },
  ];
  return (
    <Screen
      nav={
        <NavBar
          title={isOrder ? `Захиалга #${orderNo}` : "Төлбөр"}
          leading={
            <button type="button" onClick={onCancel} className="sp-tap h-11 rounded-full px-2 text-[17px] text-accent">
              Цуцлах
            </button>
          }
        />
      }
    >
      {!s.online && <OfflineBanner />}
      <div className="px-4 pb-6">
        <div className="py-6 text-center">
          <div className="text-[14px] text-mute">Төлөх дүн</div>
          <div className="mt-1">
            <Amount value={total} size={50} />
          </div>
          {(who || discount > 0) && (
            <div className="mt-2 flex items-center justify-center gap-1.5 text-[13px] text-mute">
              <Icon name="person" size={14} />
              {[who, discount > 0 ? `хямдрал ${money(discount)}` : null].filter(Boolean).join(" · ")}
            </div>
          )}
        </div>

        {s.ebarimt ? (
          <>
            <div className="px-1 pb-1.5 text-[13px] font-medium text-mute">И-баримт</div>
            <Segmented
              size="lg"
              options={[
                { id: "person", label: "Хувь хүн" },
                {
                  id: "org",
                  label: eb.kind === "org" && eb.orgName ? eb.orgName : "Байгууллага",
                },
              ]}
              value={eb.kind}
              onChange={(k) => (k === "org" ? setOrgOpen(true) : setEb({ kind: "person" }))}
            />
          </>
        ) : (
          <Notice tone="gray" icon="receipt">
            Ebarimt холбогдоогүй — И-баримт үүсэхгүй.
          </Notice>
        )}

        <div className="px-1 pb-1.5 pt-5 text-[13px] font-medium text-mute">Төлбөрийн хэрэгсэл</div>
        <div className="space-y-2">
          {methods.map((m) => (
            <button
              key={m.id}
              type="button"
              disabled={!s.online}
              onClick={() => onPick(m.id)}
              className="sp-tap flex min-h-[76px] w-full items-center gap-4 rounded-[18px] bg-paper px-4 text-left disabled:opacity-40"
            >
              <span className="grid size-12 shrink-0 place-items-center rounded-[14px] bg-accent-soft text-accent">
                <Icon name={m.icon} size={26} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[19px] font-semibold text-ink">{m.title}</span>
                <span className="text-[13px] text-mute">{m.sub}</span>
              </span>
              <Icon name="chevron" size={18} stroke={2.2} className="text-mute" />
            </button>
          ))}
        </div>
        <p className="mt-4 px-2 text-center text-[12px] leading-snug text-mute">Худалдан авагчаас нэмэлт шимтгэл авахгүй.</p>
      </div>
      <OrgSheet
        open={orgOpen}
        onClose={() => setOrgOpen(false)}
        onPick={(reg, name) => {
          setEb({ kind: "org", orgReg: reg, orgName: name });
          setOrgOpen(false);
        }}
      />
    </Screen>
  );
}

function OrgSheet({ open, onClose, onPick }: { open: boolean; onClose: () => void; onPick: (reg: string, name: string) => void }) {
  const s = useSp();
  const [reg, setReg] = useState("");
  const name = reg.length === 7 ? (reg === s.merchant.regNo ? s.merchant.name : ORG_NAMES[reg.split("").reduce((a, c) => a + Number(c), 0) % ORG_NAMES.length]) : null;
  const key = (k: string) => {
    if (k === "back") return setReg((r) => r.slice(0, -1));
    if (k === "enter" && name) return onPick(reg, name);
    if (/^\d$/.test(k)) setReg((r) => (r.length < 7 ? r + k : r));
  };
  useKeypad(key, open);
  return (
    <Sheet open={open} onClose={onClose} title="Байгууллагын РД">
      <div className="space-y-4 px-4 pb-5 pt-3">
        <CodeBoxes length={7} value={reg} />
        <div className="flex h-12 items-center justify-center text-center">
          {name ? (
            <span className="inline-flex items-center gap-2 text-[16px] font-semibold text-ink">
              <Icon name="building" size={18} className="text-accent" /> {name}
            </span>
          ) : (
            <span className="text-[13px] text-mute">7 оронтой регистрийн дугаар оруулна уу</span>
          )}
        </div>
        <NumPad onKey={key} />
        <Btn size="xl" block disabled={!name} onClick={() => name && onPick(reg, name)}>
          Баталгаажуулах
        </Btn>
      </div>
    </Sheet>
  );
}

/* ───────── QR ───────── */

function useAuto(ms: number, run: () => void, on = true) {
  const fire = useEffectEvent(run);
  useEffect(() => {
    if (!on) return;
    const t = setTimeout(() => fire(), ms);
    return () => clearTimeout(t);
  }, [ms, on]);
}

function WaitNav({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <NavBar
      title={title}
      leading={
        <button type="button" onClick={onBack} className="sp-tap h-11 rounded-full px-2 text-[17px] text-accent">
          Буцах
        </button>
      }
    />
  );
}

function QrStep({ total, idem, onApprove, onOther, onCancel }: { total: number; idem: string; onApprove: () => void; onOther: () => void; onCancel: () => void }) {
  const s = useSp();
  const [left, setLeft] = useState(300);
  useEffect(() => {
    const t = setInterval(() => setLeft((x) => Math.max(0, x - 1)), 1000);
    return () => clearInterval(t);
  }, []);
  useAuto(4200, onApprove, s.online); // туршилт: банк 4 сек-д зөвшөөрнө
  return (
    <Screen
      nav={<WaitNav title="QR төлбөр" onBack={onOther} />}
      bottom={
        <div className="grid gap-1">
          <Btn variant="gray" size="lg" block onClick={onOther}>
            Өөр хэрэгслээр төлөх
          </Btn>
          <Btn variant="plain" size="md" block className="!text-danger" onClick={onCancel}>
            Төлбөр цуцлах
          </Btn>
        </div>
      }
    >
      {!s.online && <OfflineBanner />}
      <div className="flex flex-col items-center px-4 pb-4 pt-4 text-center">
        <Amount value={total} size={40} />
        <div className="mt-1 text-[13px] text-mute">{s.delivery.page.name}</div>
        <div className="mt-4 rounded-[22px] bg-white p-3 shadow-[0_1px_0_rgb(0_0_0/0.05)]">
          <QrCode value={`gepos://pay?m=${s.merchant.regNo}&a=${total}&k=${idem}`} size={208} label="Төлбөрийн QR" />
        </div>
        <h2 className="mt-4 text-[19px] font-semibold leading-snug text-ink">Банкны аппаар уншуулна уу</h2>
        <div className="mt-2 flex items-center gap-2 text-[13px] text-mute">
          {s.online && <Spinner size={14} />} Банкнаас хариу хүлээж байна · <span className="tnum">{`${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}`}</span>
        </div>
        <button
          type="button"
          onClick={onApprove}
          disabled={!s.online}
          className="mt-2 h-10 px-3 text-[13px] font-medium text-accent underline-offset-2 hover:underline disabled:opacity-40"
        >
          Төлсөн (туршилт)
        </button>
      </div>
    </Screen>
  );
}

/* ───────── карт ───────── */

function CardStep({ total, onApprove, onDecline, onOther, onCancel }: { total: number; onApprove: () => void; onDecline: () => void; onOther: () => void; onCancel: () => void }) {
  const s = useSp();
  const [hold, setHold] = useState(false);
  useAuto(3200, onApprove, s.online && !hold);
  return (
    <Screen
      nav={<WaitNav title="Картаар төлөх" onBack={onOther} />}
      bottom={
        <div className="grid gap-1">
          <Btn variant="gray" size="lg" block onClick={onOther}>
            Өөр хэрэгслээр төлөх
          </Btn>
          <Btn variant="plain" size="md" block className="!text-danger" onClick={onCancel}>
            Төлбөр цуцлах
          </Btn>
        </div>
      }
    >
      {!s.online && <OfflineBanner />}
      <div className="flex flex-col items-center px-4 pt-4 text-center">
        <Amount value={total} size={40} />
        <div className="mt-1 text-[13px] text-mute">{s.delivery.page.name}</div>
        <div className="relative my-8 grid size-[170px] place-items-center">
          <span className="sp-pulse absolute inset-0 rounded-full bg-accent-soft" />
          <span className="sp-pulse absolute inset-0 rounded-full bg-accent-soft [animation-delay:0.9s]" />
          <span className="relative grid size-[120px] place-items-center rounded-full bg-paper text-accent shadow-[inset_0_0_0_2px_var(--accent)]">
            <Icon name="nfc" size={52} stroke={2} />
          </span>
        </div>
        <h2 className="text-[20px] font-semibold text-ink">Картаа энд ойртуулна уу</h2>
        <p className="mt-1.5 max-w-[280px] text-[14px] leading-snug text-mute">Утас, ухаалаг цагаар ч болно. Эсвэл чипээр хийж, туузаар шударна.</p>
        <div className="mt-3 flex items-center gap-2 text-[13px] text-mute">{s.online && <Spinner size={14} />} Карт хүлээж байна…</div>
        <button
          type="button"
          onClick={() => {
            setHold(true);
            onDecline();
          }}
          className="mt-1 h-10 px-3 text-[13px] font-medium text-mute underline-offset-2 hover:underline"
        >
          Татгалзсан (туршилт)
        </button>
      </div>
    </Screen>
  );
}

function Declined({ total, onRetry, onOther, onCancel }: { total: number; onRetry: () => void; onOther: () => void; onCancel: () => void }) {
  return (
    <Screen
      bottom={
        <div className="grid gap-2">
          <Btn size="xl" block onClick={onRetry}>
            Өөр карт ойртуулах
          </Btn>
          <Btn variant="gray" size="lg" block onClick={onOther}>
            Өөр хэрэгслээр төлөх
          </Btn>
          <Btn variant="plain" size="md" block className="!text-danger" onClick={onCancel}>
            Төлбөр цуцлах
          </Btn>
        </div>
      }
    >
      <div className="flex flex-col items-center px-6 pt-14 text-center">
        <span className="grid size-[84px] place-items-center rounded-full bg-danger text-white">
          <Icon name="close" size={40} stroke={2.6} />
        </span>
        <h1 className="mt-5 text-[22px] font-bold text-ink">Төлбөр татгалзсан</h1>
        <div className="mt-1">
          <Amount value={total} size={34} />
        </div>
        <p className="mt-3 text-[16px] text-ink">Картын үлдэгдэл хүрэлцэхгүй байна.</p>
        <p className="mt-1 text-[14px] text-mute">Өөр карт ойртуулах, эсвэл QR, бэлнээр төлүүлнэ үү.</p>
        <div className="mt-6 w-full text-left">
          <Notice tone="gray" icon="info">
            Мөнгө хасагдаагүй. Сагс, хямдрал, харилцагчийн мэдээлэл хадгалагдсан.
          </Notice>
        </div>
      </div>
    </Screen>
  );
}

/* ───────── бэлэн ───────── */

function CashStep({ total, onApprove, onBack }: { total: number; onApprove: (given: number) => void; onBack: () => void }) {
  const s = useSp();
  const [given, setGiven] = useState(0);
  const [typed, setTyped] = useState(false);
  const notes = [1000, 5000, 10000, 20000];
  const quick = Array.from(new Set([total, ...notes.map((n) => Math.ceil(total / n) * n)].filter((v) => v >= total)))
    .sort((a, b) => a - b)
    .slice(0, 4);
  const change = given - total;
  const key = (k: string) => {
    if (k === "enter") return given >= total && onApprove(given);
    setGiven((g) => {
      let v = typed ? String(g || "") : "";
      if (k === "back") v = v.slice(0, -1);
      else v = (v + k).replace(/^0+/, "").slice(0, 9);
      return Number(v || 0);
    });
    setTyped(true);
  };
  useKeypad(key);
  return (
    <Screen
      nav={<NavBar title="Бэлэн мөнгө" onBack={onBack} />}
      bottom={
        <Btn size="xl" block disabled={given < total || !s.online} onClick={() => onApprove(given)}>
          {given < total ? "Авсан дүнгээ оруулна уу" : change > 0 ? `Бэлэн авлаа · хариулт ${money(change)}` : "Бэлэн авлаа"}
        </Btn>
      }
    >
      {!s.online && <OfflineBanner />}
      <div className="px-4 pb-4 pt-3">
        <div className="flex items-end justify-between rounded-[18px] bg-paper px-4 py-3">
          <div>
            <div className="text-[13px] text-mute">Төлөх</div>
            <div className="text-[20px] font-bold text-ink tnum">{money(total)}</div>
          </div>
          <div className="text-right">
            <div className="text-[13px] text-mute">Авсан</div>
            <div className={cx("text-[20px] font-bold tnum", given ? "text-ink" : "text-mute")}>{money(given)}</div>
          </div>
        </div>
        <div className="py-3 text-center">
          <div className="text-[14px] text-mute">Хариулт</div>
          <Amount value={Math.max(0, change)} size={48} className={change > 0 ? "!text-ok" : "!text-mute"} />
        </div>
        <div className="grid grid-cols-2 gap-2">
          {quick.map((q) => (
            <button
              key={q}
              type="button"
              onClick={() => {
                setGiven(q);
                setTyped(false);
              }}
              className={cx("sp-tap h-12 rounded-[14px] text-[16px] font-semibold tnum", given === q ? "bg-ink text-paper" : "bg-paper text-ink")}
            >
              {q === total ? `Яг ${money(q)}` : money(q)}
            </button>
          ))}
        </div>
        <NumPad
          onKey={key}
          className="mt-3"
          left={{
            label: <span className="text-[22px] font-semibold text-ink">00</span>,
            key: "00",
          }}
        />
      </div>
    </Screen>
  );
}
