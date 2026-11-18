"use client";

/*
 * AI ажилтан — нэвтрэх (/ai). Байгууллагын регистр + 4 оронтой PIN.
 * PIN-ийг сервер шалгана (POST /api/auth/login) → HttpOnly cookie. 3 удаа буруу бол PUK-ээр шинэ PIN.
 */
import { useState } from "react";
import { Icon } from "@/components/sp/icons";
import { Btn, cx, NumPad, PinDots, useKeypad } from "@/components/sp/ui";
import { getSp } from "@/lib/sp/store";

export type Me = { authenticated: true; tenant: { id: string; name: string; posKind: string; status: string }; user: { name: string; role: string; staffId: string }; scopes: string[] };

type Step = "reg" | "pin" | "puk";

/**
 * `regNo` өгвөл (портал дотор) регистр бөглөгдөж шууд PIN алхам нээгдэнэ.
 * `embedded` үед бүтэн дэлгэцийн арын дэвсгэр, лого зурахгүй — зөвхөн карт.
 */
export function Login({ onDone, regNo: preset, embedded }: { onDone: () => void; regNo?: string; embedded?: boolean }) {
  const [step, setStep] = useState<Step>(preset && preset.trim().length >= 4 ? "pin" : "reg");
  const [regNo, setRegNo] = useState(preset?.trim() ?? "");
  const [pin, setPin] = useState("");
  const [puk, setPuk] = useState("");
  const [newPin, setNewPin] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const reg = regNo.trim().toUpperCase();

  async function send(body: Record<string, unknown>) {
    setBusy(true);
    setErr(null);
    try {
      // Энэ хөтөч дээр бүртгэсэн дэлгүүр серверт анх удаа бол төлвийг хамт илгээнэ (сервер зөвшөөрвөл)
      const local = getSp();
      const boot = local.merchant.regNo.toUpperCase() === reg && body.pin && local.merchant.pin === body.pin ? { bootstrap: local } : {};
      const r = await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ regNo: reg, ...body, ...boot }) });
      const j = (await r.json().catch(() => ({}))) as { error?: string; code?: string };
      if (r.ok) return onDone();
      if (j.code === "puk") {
        setStep("puk");
        setPin("");
      } else setPin("");
      setErr(j.error || "Нэвтэрч чадсангүй. Дахин оролдоно уу.");
    } catch {
      setErr("Сервертэй холбогдож чадсангүй. Интернэтээ шалгана уу.");
      setPin("");
    } finally {
      setBusy(false);
    }
  }

  const key = (k: string) => {
    if (busy || step !== "pin") return;
    if (k === "back") return setPin((p) => p.slice(0, -1));
    if (!/^\d$/.test(k) || pin.length >= 4) return;
    const next = pin + k;
    setPin(next);
    setErr(null);
    if (next.length === 4) void send({ pin: next });
  };
  useKeypad(key, step === "pin");

  const card = (
    <div className={cx("rounded-[24px] bg-paper p-6", embedded ? "shadow-[0_0_0_0.5px_var(--sp-sep),0_1px_2px_rgb(0_0_0/0.03)]" : "shadow-[0_0_0_0.5px_var(--sp-sep),0_12px_40px_-20px_rgba(18,26,46,0.25)]")}>
      {step === "reg" && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (reg.length >= 4) {
              setErr(null);
              setStep("pin");
            }
          }}
        >
          <h1 className="text-[22px] font-bold text-ink">Нэвтрэх</h1>
          <p className="mt-1 text-[14px] text-mute">Дэлгүүрийнхээ регистрийн дугаарыг оруулна уу.</p>
          <label className="mt-6 block">
            <span className="text-[13px] font-medium text-mute">Регистрийн дугаар</span>
            <input
              autoFocus
              inputMode="text"
              autoComplete="username"
              value={regNo}
              onChange={(e) => setRegNo(e.target.value.replace(/\s/g, "").slice(0, 20))}
              placeholder="Жишээ: 6543210"
              className="sp-field mt-1.5 h-14 w-full text-[20px] font-semibold tracking-wide"
            />
          </label>
          <Btn type="submit" size="xl" block className="mt-5" disabled={reg.length < 4}>
            Үргэлжлүүлэх
          </Btn>
        </form>
      )}

      {step === "pin" && (
        <div>
          <button type="button" onClick={() => (setStep("reg"), setPin(""), setErr(null))} className="sp-tap -ml-1 flex items-center gap-1 text-[14px] font-medium text-accent">
            <Icon name="back" size={18} /> {reg}
          </button>
          <h1 className="mt-3 text-[22px] font-bold text-ink">{embedded ? "AI ажилтанд нэвтрэх" : "PIN код"}</h1>
          <p className="mt-1 text-[14px] text-mute">{embedded ? "Дэлгүүрийн 4 оронтой PIN кодоо оруулна уу. Серверийн нэвтрэлт AI ажилтан болон Store Plus-ын синкийг нээнэ." : "4 оронтой нууц кодоо оруулна уу."}</p>
          <div className="my-7">
            <PinDots length={4} filled={pin.length} error={!!err} />
          </div>
          <NumPad onKey={key} className={cx(busy && "pointer-events-none opacity-50")} />
        </div>
      )}

      {step === "puk" && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void send({ puk: puk.trim(), newPin });
          }}
        >
          <h1 className="text-[22px] font-bold text-ink">PIN сэргээх</h1>
          <p className="mt-1 text-[14px] text-mute">PIN 3 удаа буруу орсон. PUK кодоо оруулаад шинэ PIN тохируулна уу.</p>
          <label className="mt-5 block">
            <span className="text-[13px] font-medium text-mute">PUK код</span>
            <input inputMode="numeric" autoComplete="one-time-code" value={puk} onChange={(e) => setPuk(e.target.value.replace(/\D/g, "").slice(0, 8))} className="sp-field mt-1.5 h-12 w-full text-[18px] tracking-widest" />
          </label>
          <label className="mt-3 block">
            <span className="text-[13px] font-medium text-mute">Шинэ PIN (4 орон)</span>
            <input inputMode="numeric" type="password" autoComplete="new-password" value={newPin} onChange={(e) => setNewPin(e.target.value.replace(/\D/g, "").slice(0, 4))} className="sp-field mt-1.5 h-12 w-full text-[18px] tracking-widest" />
          </label>
          <Btn type="submit" size="xl" block className="mt-5" loading={busy} disabled={!puk || newPin.length !== 4}>
            PIN шинэчлээд нэвтрэх
          </Btn>
        </form>
      )}

      {err && (
        <div role="alert" className="mt-4 flex items-start gap-2 rounded-[12px] bg-danger-soft px-3 py-2.5 text-[14px] text-danger">
          <Icon name="warn" size={18} className="mt-0.5 shrink-0" />
          <span>{err}</span>
        </div>
      )}
    </div>
  );
  const note = <p className="mt-5 text-center text-[12.5px] text-mute">Нэвтрэх эрх нь зөвхөн тухайн дэлгүүрийн өгөгдөлд хүрнэ.</p>;
  if (embedded)
    return (
      <div className="w-full max-w-[400px]">
        {card}
        {note}
      </div>
    );

  return (
    <div className="grid min-h-dvh place-items-center bg-stage px-4 py-10">
      <div className="w-full max-w-[400px]">
        <div className="mb-8 flex items-center justify-center gap-3">
          <div className="grid size-12 place-items-center rounded-[14px] bg-accent text-white">
            <Icon name="sparkle" size={26} />
          </div>
          <div>
            <div className="text-[20px] font-bold leading-tight text-ink">AI ажилтан</div>
            <div className="text-[13px] text-mute">GePOS · Gerege</div>
          </div>
        </div>
        {card}
        {note}
      </div>
    </div>
  );
}
