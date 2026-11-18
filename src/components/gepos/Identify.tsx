"use client";

/*
 * Харилцагч таних (BR05, BR06, BR09-3; US10, US11; 6.2.3–6.2.4).
 * Утасны дугаар эсвэл Wallet pass-ийн QR/Barcode. Алгасаж болно.
 * Pass уншигдахгүй бол утасны дугаараар үргэлжилнэ.
 */

import { useState } from "react";
import { addCustomer, findByPass, findCustomer, useSp } from "@/lib/sp/store";
import { access, activePointCampaign, fmtPhone, maskPhone, num, priceCart, tierOf } from "@/lib/sp/logic";
import type { Customer } from "@/lib/sp/types";
import { useBarcodeScanner } from "@/lib/scanner";
import { CameraScanner } from "@/components/CameraScanner";
import { Avatar, Btn, Notice, NumPad, Row, Segmented, Sheet, Switch, cx, toast, useKeypad } from "@/components/sp/ui";
import { Icon } from "@/components/sp/icons";
import { usePos } from "./ctx";

const short = (c: Customer) => (c.name ? c.name.replace(/^(\S)\S*\.\s*/, "$1.") : maskPhone(c.phone));
const ini = (c: Customer) => (c.name ? c.name.replace(/[^A-Za-zА-Яа-яӨөҮүЁё]/g, "").slice(0, 2).toUpperCase() : "#");

/** Mode B болон бусад газар — жижиг «харилцагч» товч */
export function CustomerChip() {
  const s = useSp();
  const pos = usePos();
  const [open, setOpen] = useState(false);
  const c = s.customers.find((x) => x.id === pos.draft.customerId);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="sp-tap inline-flex h-11 items-center gap-2 rounded-full bg-paper px-4 text-[14px] font-semibold text-ink">
        <Icon name="person" size={18} className="text-accent" />
        {c ? `${short(c)} · ${num(c.points)} оноо` : "Харилцагч таних"}
      </button>
      <IdentifySheet open={open} onClose={() => setOpen(false)} />
    </>
  );
}

/** Сагсан дээрх харилцагчийн хэсэг: таних мөр эсвэл гишүүний мэдээлэл + оноо зарцуулах */
export function CustomerBlock() {
  const s = useSp();
  const pos = usePos();
  const [open, setOpen] = useState(false);
  const c = s.customers.find((x) => x.id === pos.draft.customerId) ?? null;
  return (
    <>
      <div className="overflow-hidden rounded-[var(--sp-r-group)] bg-paper [&>*+*]:border-t [&>*+*]:border-[var(--sp-sep)]">
        {c ? (
          <MemberRows c={c} onChange={() => setOpen(true)} />
        ) : (
          <Row icon="person" iconTone="accent" title={<span className="font-semibold">Харилцагч таних</span>} sub="Утас эсвэл Wallet pass · алгасаж болно" chevron onClick={() => setOpen(true)} />
        )}
      </div>
      <IdentifySheet open={open} onClose={() => setOpen(false)} />
    </>
  );
}

function MemberRows({ c, onChange }: { c: Customer; onChange?: () => void }) {
  const s = useSp();
  const pos = usePos();
  const camp = activePointCampaign(s);
  const t = tierOf(s, c.id, camp);
  const cartMode = pos.draft.mode === "cart";
  const pr = cartMode ? priceCart(s, pos.draft.cart, c, pos.draft.redeem ? 1e12 : 0) : null;
  return (
    <>
      <div className={cx("flex items-center gap-3 px-4 py-3", onChange && "sp-row cursor-pointer")} onClick={onChange} role={onChange ? "button" : undefined} aria-label={onChange ? "Харилцагч солих" : undefined}>
        <Avatar text={ini(c)} size={42} tone="accent" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[16px] font-semibold text-ink">{c.name ?? "Шинэ харилцагч"}</div>
          <div className="flex items-center gap-1.5 overflow-hidden whitespace-nowrap text-[13px] text-mute">
            <span className="tnum">{maskPhone(c.phone)}</span>
            {t && (
              <span className="inline-flex items-center gap-0.5 font-semibold text-accent">
                · <Icon name="star" size={12} stroke={2} /> {t.tier.name}
              </span>
            )}
          </div>
        </div>
        <div className="text-right">
          <div className="text-[17px] font-bold text-ink tnum">{num(c.points)}</div>
          <div className="text-[11px] text-mute">оноо</div>
        </div>
        {onChange && <Icon name="chevron" size={17} stroke={2.2} className="text-[var(--line)]" />}
      </div>
      {!camp ? (
        <div className="px-4 py-2.5 text-[13px] text-mute">Идэвхтэй онооны урамшуулал алга — оноо бодогдохгүй.</div>
      ) : (
        <>
          {pr && (
            <Row
              icon="wallet"
              iconTone={pos.draft.redeem ? "accent" : "gray"}
              title="Оноо зарцуулах"
              sub={pr.redeemMax > 0 ? `${num(pr.redeemMax)} оноо → −${num(pr.redeemMax)}₮` : "Зарцуулах оноо алга"}
              trailing={<Switch checked={pos.draft.redeem && pr.redeemMax > 0} disabled={pr.redeemMax <= 0} onChange={(v) => pos.setDraft((d) => ({ ...d, redeem: v }))} label="Оноо зарцуулах" />}
            />
          )}
          {pr && pr.pointsEarned > 0 && <Row icon="plus" iconTone="ok" title="Энэ худалдан авалтаар" value={<span className="font-semibold text-ok">+{num(pr.pointsEarned)} оноо</span>} />}
        </>
      )}
    </>
  );
}

export function IdentifySheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const s = useSp();
  const pos = usePos();
  const passOk = access("wallet", s.merchant.plan) === "ok";
  const [tab, setTab] = useState<"phone" | "pass">("phone");
  const [phone, setPhone] = useState("");
  const [miss, setMiss] = useState<string | null>(null);
  const [serial, setSerial] = useState("");
  const [passMiss, setPassMiss] = useState(false);
  const [cam, setCam] = useState(false);
  const [reg, setReg] = useState<string | null>(null);
  const c = s.customers.find((x) => x.id === pos.draft.customerId) ?? null;

  const pick = (x: Customer) => {
    pos.setDraft((d) => ({ ...d, customerId: x.id, redeem: false }));
    setMiss(null);
    setPassMiss(false);
    setPhone("");
    setSerial("");
  };
  const clear = () => pos.setDraft((d) => ({ ...d, customerId: null, redeem: false }));

  const key = (k: string) => {
    if (k === "back") {
      setMiss(null);
      return setPhone((p) => p.slice(0, -1));
    }
    if (!/^\d$/.test(k) || phone.length >= 8) return;
    const next = phone + k;
    setPhone(next);
    if (next.length === 8) {
      const found = findCustomer(next);
      if (found) pick(found);
      else setMiss(next);
    }
  };
  useKeypad(key, open && !c && tab === "phone" && !cam && reg === null);

  const byPass = (code: string) => {
    const found = findByPass(code);
    if (found) {
      pick(found);
      setCam(false);
      return true;
    }
    setPassMiss(true);
    return false;
  };
  useBarcodeScanner((code) => {
    if (open && !c && tab === "pass" && !cam && reg === null) byPass(code);
  });

  return (
    <Sheet
      open={open}
      onClose={() => {
        setReg(null);
        onClose();
      }}
      title={reg !== null && !c ? "Харилцагч бүртгэх" : "Харилцагч таних"}
      full={!c}
    >
      <div className="flex min-h-full flex-col px-4 pb-4 pt-1">
        {reg !== null && !c ? (
          <RegisterForm
            initial={reg}
            onCancel={() => setReg(null)}
            onDone={(x) => {
              pick(x);
              setReg(null);
              onClose();
            }}
          />
        ) : c ? (
          <>
            <div className="overflow-hidden rounded-[var(--sp-r-group)] bg-paper [&>*+*]:border-t [&>*+*]:border-[var(--sp-sep)]">
              <MemberRows c={c} />
            </div>
            <div className="mt-4 grid gap-2">
              <Btn size="xl" block onClick={onClose}>
                Болсон
              </Btn>
              <Btn variant="plain" size="md" block onClick={clear}>
                Өөр харилцагч
              </Btn>
            </div>
          </>
        ) : (
          <>
            {passOk && (
              <Segmented
                size="lg"
                options={[
                  { id: "phone", label: "Утасны дугаар" },
                  { id: "pass", label: "Wallet pass" },
                ]}
                value={tab}
                onChange={(v) => setTab(v as "phone" | "pass")}
              />
            )}
            <Btn variant="tinted" size="md" block icon="plus" className="mt-2" onClick={() => setReg(phone)}>
              Харилцагч бүртгэх
            </Btn>
            {tab === "phone" ? (
              <>
                <div className="py-4 text-center">
                  <div className="text-[14px] text-mute">Харилцагчийн утасны дугаар</div>
                  <div className={cx("mt-2 h-10 text-[34px] font-bold tracking-[0.02em] text-ink tnum", miss && "sp-shake")}>
                    {fmtPhone(phone.padEnd(8, "_")).replace(/_/g, "·")}
                  </div>
                  <div className="mt-1 text-[13px] text-mute">8 орон оруулмагц хайна</div>
                </div>
                {miss ? (
                  <div className="space-y-2">
                    <Notice tone="gray" icon="info">
                      {fmtPhone(miss)} бүртгэлгүй байна. Шинээр бүртгэвэл энэ худалдан авалтаас оноо цуглуулна.
                    </Notice>
                    <Btn block icon="plus" onClick={() => setReg(miss)}>
                      Шинээр бүртгэх
                    </Btn>
                  </div>
                ) : (
                  <div className="h-[96px]" />
                )}
                <NumPad onKey={key} className="mt-auto pt-3" />
              </>
            ) : (
              <div className="space-y-3 pt-4">
                <Btn size="xl" block icon="scan" onClick={() => setCam(true)}>
                  Pass-ийн QR уншуулах
                </Btn>
                <p className="px-2 text-center text-[13px] leading-snug text-mute">Сканнераар уншуулбал шууд танина. Эсвэл pass дээрх дугаарыг бичнэ үү.</p>
                <form
                  className="flex gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (serial.trim()) byPass(serial);
                  }}
                >
                  <input className="sp-field uppercase" placeholder="GP-XXXXX" value={serial} onChange={(e) => setSerial(e.target.value)} aria-label="Pass дугаар" />
                  <Btn type="submit" variant="tinted" size="md" className="!h-12">
                    Хайх
                  </Btn>
                </form>
                {passMiss && (
                  <Notice
                    tone="warn"
                    action={
                      <button type="button" className="shrink-0 font-semibold underline" onClick={() => setTab("phone")}>
                        Утсаар
                      </button>
                    }
                  >
                    Pass уншигдсангүй. Утасны дугаараар үргэлжлүүлнэ үү.
                  </Notice>
                )}
              </div>
            )}
          </>
        )}
      </div>
      {cam && <CameraScanner title="Wallet pass уншуулах" okText="Харилцагч олдлоо" missText="Pass олдсонгүй" onScan={byPass} onClose={() => setCam(false)} />}
    </Sheet>
  );
}

/** «+976 9911 2245» → «99112245» */
const normPhone = (v: string) => {
  let d = v.replace(/\D/g, "");
  if (d.length > 8 && d.startsWith("976")) d = d.slice(3);
  return d.slice(0, 8);
};

function RegisterForm({ initial, onDone, onCancel }: { initial: string; onDone: (c: Customer) => void; onCancel: () => void }) {
  const pos = usePos();
  const [phone, setPhone] = useState(initial);
  const [name, setName] = useState("");
  const [optIn, setOptIn] = useState(false);
  const p = normPhone(phone);
  const ok = p.length === 8;
  const save = () => {
    if (!ok) return;
    const exists = findCustomer(p);
    if (exists) {
      toast(`${exists.name ?? fmtPhone(p)} бүртгэлтэй байна — сагсанд холбогдлоо`, "ok");
      return onDone(exists);
    }
    try {
      const n = addCustomer(pos.actor, p, name.trim() || undefined, "pos", optIn);
      toast("Харилцагч бүртгэгдэж, сагсанд холбогдлоо", "ok");
      onDone(n);
    } catch (e) {
      toast((e as Error).message, "danger");
    }
  };
  return (
    <form
      className="flex min-h-full flex-col"
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <div className="overflow-hidden rounded-[var(--sp-r-group)] bg-paper [&>*+*]:border-t [&>*+*]:border-[var(--sp-sep)]">
        <label className="flex min-h-[56px] items-center gap-3 px-4">
          <span className="w-[96px] shrink-0 text-[15px] text-ink">
            Утас<span className="text-accent"> *</span>
          </span>
          <input
            inputMode="tel"
            autoComplete="tel"
            autoFocus
            className="h-12 min-w-0 flex-1 bg-transparent text-right text-[20px] font-semibold text-ink outline-none tnum placeholder:text-[16px] placeholder:font-normal placeholder:text-mute"
            placeholder="8 оронтой дугаар"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
        </label>
        <label className="flex min-h-[56px] items-center gap-3 px-4">
          <span className="w-[96px] shrink-0 text-[15px] text-ink">Нэр</span>
          <input className="h-12 min-w-0 flex-1 bg-transparent text-right text-[16px] text-ink outline-none placeholder:text-mute" placeholder="Заавал биш" value={name} onChange={(e) => setName(e.target.value)} />
        </label>
      </div>
      {phone && !ok && <p className="px-4 pt-1.5 text-[13px] text-mute">8 оронтой дугаар оруулна уу (+976 бичиж болно).</p>}
      <div className="mt-4 overflow-hidden rounded-[var(--sp-r-group)] bg-paper">
        <Row title="Маркетингийн мэдээлэл авах" sub="Урамшуулал, хямдралын SMS" trailing={<Switch checked={optIn} onChange={setOptIn} label="Маркетингийн зөвшөөрөл" />} />
      </div>
      <p className="px-4 pt-1.5 text-[13px] leading-snug text-mute">Харилцагч зөвшөөрсөн үед л асаана. Хүссэн үедээ STOP гэж илгээн татгалзана.</p>
      <div className="mt-auto grid gap-1 pt-5">
        <Btn type="submit" size="xl" block disabled={!ok}>
          Бүртгэх
        </Btn>
        <Btn variant="plain" size="md" block onClick={onCancel}>
          Буцах
        </Btn>
      </div>
    </form>
  );
}
