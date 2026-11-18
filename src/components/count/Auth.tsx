"use client";

/**
 * 1-р дэлгэц «Холбох»: самбарын QR (/count?pair=КОД) → төхөөрөмж холбогдоно → ажилтан PIN.
 * Үзүүлэнд: дэлгүүрийн регистр + PIN-ээр шууд нэвтэрнэ.
 */
import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/sp/icons";
import { Btn, cx, NumPad, PinDots, useKeypad } from "@/components/sp/ui";
import { ApiError, call } from "./api";
import { ErrorNote } from "./ui";

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-dvh place-items-center bg-stage px-4 py-8">
      <div className="w-full max-w-[420px]">
        <div className="mb-6 flex items-center justify-center gap-3">
          <div className="grid size-12 place-items-center rounded-[14px] bg-accent text-white">
            <Icon name="box" size={26} />
          </div>
          <div>
            <div className="text-[20px] font-bold leading-tight text-ink">Тооллого</div>
            <div className="text-[13px] text-mute">GePOS · утсаар тоолох</div>
          </div>
        </div>
        <div className="rounded-[24px] bg-paper p-5 shadow-[0_0_0_0.5px_var(--sp-sep),0_12px_40px_-20px_rgba(18,26,46,0.25)]">{children}</div>
      </div>
    </div>
  );
}

/** Нэвтрээгүй: холбох код (QR) эсвэл регистр + PIN */
export function Connect({ onDone, pairCode }: { onDone: () => void; pairCode: string | null }) {
  const [mode, setMode] = useState<"code" | "login">(pairCode ? "code" : "login");
  const [code, setCode] = useState(pairCode ?? "");
  const [reg, setReg] = useState("");
  const [pin, setPin] = useState("");
  const [step, setStep] = useState<"reg" | "pin">("reg");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const tried = useRef(false);

  async function pair(c: string) {
    setBusy(true);
    setErr(null);
    try {
      await call("/api/auth/pair", { method: "POST", json: { code: c.trim().toUpperCase(), device: navigator.userAgent.slice(0, 80) } });
      // QR-ын кодыг хаягаас арилгана (дахин ачаалахад ашиглагдсан код илгээхгүй)
      window.history.replaceState(null, "", "/count");
      onDone();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Холбож чадсангүй");
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    if (pairCode && !tried.current) {
      tried.current = true;
      void pair(pairCode);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- нэг удаа (QR-аар орж ирэхэд)
  }, [pairCode]);

  async function login(p: string) {
    setBusy(true);
    setErr(null);
    try {
      await call("/api/auth/login", { method: "POST", json: { regNo: reg.trim().toUpperCase(), pin: p } });
      onDone();
    } catch (e) {
      setPin("");
      setErr(e instanceof ApiError && e.code === "puk" ? "PIN 3 удаа буруу орсон. Самбараас (/ai) PUK кодоор сэргээнэ үү." : e instanceof Error ? e.message : "Нэвтэрч чадсангүй");
    } finally {
      setBusy(false);
    }
  }
  const key = (k: string) => {
    if (busy || mode !== "login" || step !== "pin") return;
    if (k === "back") return setPin((x) => x.slice(0, -1));
    if (!/^\d$/.test(k) || pin.length >= 4) return;
    const next = pin + k;
    setPin(next);
    setErr(null);
    if (next.length === 4) void login(next);
  };
  useKeypad(key, mode === "login" && step === "pin");

  return (
    <Shell>
      {mode === "code" ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (code.trim().length === 8) void pair(code);
          }}
        >
          <h1 className="text-[22px] font-bold text-ink">Утсаа холбох</h1>
          <p className="mt-1 text-[15px] text-mute">Самбарын «Тооллого» хэсгийн QR кодыг уншуулна уу, эсвэл доорх 8 тэмдэгтийг бичнэ үү.</p>
          <input
            aria-label="Холбох код"
            autoCapitalize="characters"
            autoComplete="one-time-code"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8))}
            placeholder="ABCD2345"
            className="sp-field mt-5 h-[60px] w-full text-center text-[26px] font-bold tracking-[0.2em]"
          />
          <Btn type="submit" size="xl" block className="mt-4" loading={busy} disabled={code.length !== 8}>
            Холбох
          </Btn>
          <button type="button" onClick={() => (setMode("login"), setErr(null))} className="sp-tap mt-3 h-[52px] w-full rounded-[16px] text-[15px] font-semibold text-accent">
            Регистр, PIN-ээр нэвтрэх
          </button>
        </form>
      ) : step === "reg" ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (reg.trim().length >= 4) {
              setStep("pin");
              setErr(null);
            }
          }}
        >
          <h1 className="text-[22px] font-bold text-ink">Нэвтрэх</h1>
          <p className="mt-1 text-[15px] text-mute">Дэлгүүрийн регистрийн дугаар.</p>
          <input
            name="regNo"
            aria-label="Регистрийн дугаар"
            autoFocus
            autoComplete="username"
            value={reg}
            onChange={(e) => setReg(e.target.value.replace(/\s/g, "").slice(0, 20))}
            placeholder="Жишээ: 6543210"
            className="sp-field mt-5 h-[60px] w-full text-[22px] font-semibold tracking-wide"
          />
          <Btn type="submit" size="xl" block className="mt-4" disabled={reg.trim().length < 4}>
            Үргэлжлүүлэх
          </Btn>
          <button type="button" onClick={() => (setMode("code"), setErr(null))} className="sp-tap mt-3 h-[52px] w-full rounded-[16px] text-[15px] font-semibold text-accent">
            QR кодоор холбох
          </button>
        </form>
      ) : (
        <div>
          <button type="button" onClick={() => (setStep("reg"), setPin(""), setErr(null))} className="sp-tap -ml-1 flex h-11 items-center gap-1 text-[15px] font-medium text-accent">
            <Icon name="back" size={18} /> {reg.toUpperCase()}
          </button>
          <h1 className="mt-1 text-[22px] font-bold text-ink">PIN код</h1>
          <p className="mt-1 text-[15px] text-mute">Дэлгүүрийн 4 оронтой PIN.</p>
          <div className="my-6">
            <PinDots length={4} filled={pin.length} error={!!err} />
          </div>
          <NumPad onKey={key} className={cx(busy && "pointer-events-none opacity-50")} />
        </div>
      )}
      {err && (
        <div className="mt-4">
          <ErrorNote>{err}</ErrorNote>
        </div>
      )}
    </Shell>
  );
}

/** Хэн тоолж байна — ажилтны PIN (ПОС-ын ажилтны жагсаалтаас) */
export function StaffPin({ onDone, canSkip, onSkip, storeName }: { onDone: () => void; canSkip?: boolean; onSkip?: () => void; storeName?: string }) {
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  async function send(p: string) {
    setBusy(true);
    setErr(null);
    try {
      await call("/api/auth/staff", { method: "POST", json: { pin: p } });
      onDone();
    } catch (e) {
      setPin("");
      setErr(e instanceof Error ? e.message : "PIN буруу");
    } finally {
      setBusy(false);
    }
  }
  const key = (k: string) => {
    if (busy) return;
    if (k === "back") return setPin((x) => x.slice(0, -1));
    if (!/^\d$/.test(k) || pin.length >= 4) return;
    const next = pin + k;
    setPin(next);
    setErr(null);
    if (next.length === 4) void send(next);
  };
  useKeypad(key, true);
  return (
    <Shell>
      <h1 className="text-[22px] font-bold text-ink">Хэн тоолж байна?</h1>
      <p className="mt-1 text-[15px] text-mute">{storeName ? `${storeName} · ` : ""}Ажилтны 4 оронтой PIN-ээ оруулна уу.</p>
      <div className="my-6">
        <PinDots length={4} filled={pin.length} error={!!err} />
      </div>
      <NumPad onKey={key} className={cx(busy && "pointer-events-none opacity-50")} />
      {err && (
        <div className="mt-4">
          <ErrorNote>{err}</ErrorNote>
        </div>
      )}
      {canSkip && onSkip && (
        <button type="button" onClick={onSkip} className="sp-tap mt-3 h-[52px] w-full rounded-[16px] text-[15px] font-semibold text-accent">
          Буцах
        </button>
      )}
    </Shell>
  );
}
