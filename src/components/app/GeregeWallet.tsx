"use client";

import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { moneyPlain } from "@/lib/demo";
import { type Membership, type PendingWalletPayment, type WalletEntry, type WalletState, type WalletTopup, CustomerApiError, OFFLINE, customerApi } from "@/lib/customer-api";
import { Panel } from "@/components/app/AppUi";
import { PrimaryButton, btnGhost } from "@/components/ui";
import { CountUp } from "@/components/app/LoyaltyPromos";

/**
 * Gerege хэтэвч (₮) — Apple Wallet / Apple Cash маягаар:
 * - мөнгөн хэтэвчний карт (үлдэгдэл) + «Цэнэглэх», «Төлөх» (Gerege QR);
 * - «Миний картууд» — нэг мөр, дарахад гишүүний картууд давхарласан жагсаалтаар;
 * - гүйлгээ (цэнэглэлт, төлбөр, буцаалт) — серверийн ledger.
 * Касс хэтэвчээр төлөх хүсэлт илгээвэл энд асууна — хэрэглэгч зөвшөөрөхгүй бол мөнгө хасагдахгүй.
 */

const EASE = [0.2, 0.8, 0.2, 1] as const;
const pad = (n: number) => String(n).padStart(2, "0");
const when = (iso: string) => {
  const d = new Date(iso);
  return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

export function useWallet(session: string, active: boolean, onExpired: () => void) {
  const [state, setState] = useState<WalletState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    try {
      setState(await customerApi.wallet(session));
      setError(null);
    } catch (e) {
      if (e instanceof CustomerApiError && e.status === 401) onExpired();
      setError(e instanceof CustomerApiError ? (e.status === OFFLINE ? "Сүлжээгүй байна." : e.message) : "Хэтэвч ачаалж чадсангүй.");
    }
  }, [session, onExpired]);
  useEffect(() => {
    if (!active) return;
    const t = setTimeout(() => void load(), 0);
    const vis = () => document.visibilityState === "visible" && void load();
    document.addEventListener("visibilitychange", vis);
    return () => {
      clearTimeout(t);
      document.removeEventListener("visibilitychange", vis);
    };
  }, [active, load]);
  return { state, error, load };
}

/* ───────── Мөнгөн хэтэвчний карт ───────── */

export function GeregePayCard({ balance, holder, loading, onTopup, onPay }: { balance: number; holder: string; loading?: boolean; onTopup: () => void; onPay: () => void }) {
  return (
    <div>
      <div
        className="relative aspect-[1.586/1] w-full overflow-hidden rounded-[18px] text-white shadow-[0_1px_2px_rgb(0_0_0/0.2),0_22px_40px_-22px_rgb(0_0_0/0.7)]"
        style={{ background: "radial-gradient(120% 95% at 100% 0%, rgb(255 106 0 / 0.42), transparent 58%), linear-gradient(160deg, #2a2a31 0%, #111114 55%, #08080a 100%)" }}
      >
        <span aria-hidden="true" className="pointer-events-none absolute inset-0 rounded-[18px] ring-1 ring-inset ring-white/12" />
        <span aria-hidden="true" className="pointer-events-none absolute inset-0" style={{ background: "linear-gradient(160deg, rgb(255 255 255 / 0.14) 0%, transparent 30%)" }} />
        <div className="relative flex h-full flex-col px-5 pb-5 pt-4">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-2">
              <span className="grid size-8 place-items-center rounded-[9px] bg-[#ff6a00] text-[15px] font-extrabold">G</span>
              <span className="text-[15px] font-semibold tracking-[-0.01em]">Gerege</span>
            </span>
            <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/60">Хэтэвч</span>
          </div>
          <div className="mt-auto">
            <p className="text-[10.5px] font-semibold uppercase tracking-[0.1em] text-white/55">Үлдэгдэл</p>
            <p className="tnum mt-0.5 text-[36px] font-semibold leading-none tracking-[-0.035em]">
              {loading ? <span className="text-white/40">—</span> : <CountUp value={balance} />}
              <span className="ml-1 text-[20px] font-medium text-white/55">₮</span>
            </p>
            <p className="mt-2.5 truncate text-[12.5px] font-medium text-white/65">{holder}</p>
          </div>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2.5">
        <button type="button" onClick={onTopup} className="press flex h-[50px] items-center justify-center gap-2 rounded-[14px] bg-accent text-[15px] font-semibold text-[color:var(--accent-ink)]">
          <svg viewBox="0 0 20 20" className="size-[18px]" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden="true">
            <path d="M10 4.5v11M4.5 10h11" />
          </svg>
          Цэнэглэх
        </button>
        <button type="button" onClick={onPay} className="press flex h-[50px] items-center justify-center gap-2 rounded-[14px] bg-paper text-[15px] font-semibold text-ink ring-1 ring-inset ring-hair">
          <svg viewBox="0 0 24 24" className="size-[18px]" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h2v2h-2zM18 14h2M14 18h2v2M18 18h2v2" />
          </svg>
          Төлөх
        </button>
      </div>
    </div>
  );
}

/* ───────── «Миний картууд» — нэг мөр ───────── */

export function CardsRow({ memberships, logoOf, onOpen }: { memberships: Membership[]; logoOf: (m: Membership) => string | null; onOpen: () => void }) {
  const peek = memberships.slice(0, 3);
  const points = memberships.reduce((s, m) => s + m.points, 0);
  return (
    <button type="button" onClick={onOpen} className="press flex w-full items-center gap-4 rounded-[18px] bg-paper p-3.5 text-left ring-1 ring-inset ring-hair">
      {/* Жижиг давхарласан картууд */}
      <span className="relative h-[52px] w-[72px] shrink-0" aria-hidden="true">
        {peek.length === 0 && <span className="absolute inset-x-0 top-1.5 h-[44px] rounded-[8px] border border-dashed border-hair" />}
        {peek.map((m, i) => {
          const logo = logoOf(m);
          return (
            <span
              key={m.id}
              className="absolute left-0 h-[44px] w-[70px] overflow-hidden rounded-[8px] shadow-[0_1px_2px_rgb(0_0_0/0.25)] ring-1 ring-inset ring-white/15"
              style={{ top: i * 6 - (peek.length - 1) * 2, zIndex: i, background: m.card?.bgColor ?? "#4002FF" }}
            >
              <span className="absolute left-1.5 top-1.5 grid size-[14px] place-items-center overflow-hidden rounded-[3px] bg-white">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {logo && <img src={logo} alt="" className="size-full object-contain" />}
              </span>
            </span>
          );
        })}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[16px] font-semibold tracking-[-0.01em] text-ink">Миний картууд</span>
        <span className="tnum block text-[13px] text-mute">
          {memberships.length ? `${memberships.length} карт · ${moneyPlain(points)} оноо` : "Карт хараахан алга"}
        </span>
      </span>
      <svg viewBox="0 0 20 20" className="size-4 shrink-0 text-mute" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="m7.5 4.5 5.5 5.5-5.5 5.5" />
      </svg>
    </button>
  );
}

/* ───────── Гүйлгээ ───────── */

const ENTRY: Record<WalletEntry["kind"], { title: (e: WalletEntry) => string; tone: string; icon: ReactNode }> = {
  topup: {
    title: () => "Цэнэглэлт",
    tone: "bg-ok-soft text-ok",
    icon: <path d="M10 4.5v11M4.5 10h11" />,
  },
  pay: {
    title: (e) => e.merchantName ?? "Төлбөр",
    tone: "bg-stage text-ink",
    icon: <path d="M4.5 7h11l-.9 9a1.5 1.5 0 0 1-1.5 1.3H6.9A1.5 1.5 0 0 1 5.4 16zM7.5 7V6a2.5 2.5 0 0 1 5 0v1" />,
  },
  refund: {
    title: (e) => `Буцаалт${e.merchantName ? ` · ${e.merchantName}` : ""}`,
    tone: "bg-accent-soft text-accent",
    icon: <path d="M7 6 4 9l3 3M4.5 9H12a4 4 0 0 1 0 8h-2" />,
  },
  adjust: {
    title: () => "Залруулга",
    tone: "bg-stage text-mute",
    icon: <path d="M4.5 10h11" />,
  },
};

export function WalletActivity({ ledger }: { ledger: WalletEntry[] }) {
  if (!ledger.length) {
    return <p className="rounded-[18px] bg-paper px-4 py-4 text-[13px] text-mute ring-1 ring-inset ring-hair">Гүйлгээ алга. Хэтэвчээ цэнэглээд Gerege QR-аар касс дээр төлнө.</p>;
  }
  return (
    <ul className="divide-y divide-hair overflow-hidden rounded-[18px] bg-paper ring-1 ring-inset ring-hair">
      {ledger.map((e, i) => {
        const k = ENTRY[e.kind] ?? ENTRY.adjust;
        return (
          <motion.li key={e.id} className="flex items-center gap-3 px-4 py-3" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 8) * 0.03, duration: 0.3, ease: EASE }}>
            <span className={`grid size-9 shrink-0 place-items-center rounded-full ${k.tone}`}>
              <svg viewBox="0 0 20 20" className="size-[16px]" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                {k.icon}
              </svg>
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[14.5px] font-semibold text-ink">{k.title(e)}</span>
              <span className="tnum block truncate text-[12px] text-mute">
                {when(e.at)}
                {e.ref && ` · ${e.ref}`}
              </span>
            </span>
            <span className="tnum shrink-0 text-right">
              <span className={`block text-[15px] font-semibold ${e.amount > 0 ? "text-ok" : "text-ink"}`}>
                {e.amount > 0 ? "+" : "−"}
                {moneyPlain(Math.abs(e.amount))}₮
              </span>
              <span className="block text-[11px] text-mute">{moneyPlain(e.balanceAfter)}₮</span>
            </span>
          </motion.li>
        );
      })}
    </ul>
  );
}

/* ───────── Цэнэглэх ───────── */

export function TopupSheet({ session, wallet, onClose, onDone }: { session: string; wallet: WalletState; onClose: () => void; onDone: () => void }) {
  const cfg = wallet.topup;
  const room = Math.max(0, wallet.wallet.max - wallet.wallet.balance);
  const [amount, setAmount] = useState(cfg.presets[1] ?? cfg.min);
  const [custom, setCustom] = useState("");
  const [invoice, setInvoice] = useState<WalletTopup | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [paid, setPaid] = useState<number | null>(null);
  const value = custom ? Number(custom) : amount;
  const valid = Number.isInteger(value) && value >= cfg.min && value <= Math.min(cfg.max, room);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof CustomerApiError ? e.message : "Алдаа гарлаа.");
    } finally {
      setBusy(false);
    }
  };
  const create = () => run(async () => setInvoice((await customerApi.topup(session, value)).topup));
  const devPay = () =>
    run(async () => {
      const r = (await customerApi.topupAction(session, invoice!.id, "dev_pay")).topup;
      setPaid(r.amount);
      onDone();
      setTimeout(onClose, 1400);
    });
  const cancel = () =>
    run(async () => {
      if (invoice) await customerApi.topupAction(session, invoice.id, "cancel");
      setInvoice(null);
    });

  return (
    <Panel title="Хэтэвч цэнэглэх" onClose={onClose}>
      <AnimatePresence mode="wait" initial={false}>
        {paid !== null ? (
          <motion.div key="paid" initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.3, ease: EASE }} className="grid place-items-center py-10 text-center">
            <motion.span initial={{ scale: 0.6 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 420, damping: 22 }} className="grid size-16 place-items-center rounded-full bg-ok text-white">
              <svg viewBox="0 0 24 24" className="size-8" fill="none" stroke="currentColor" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="m5 12.5 4.5 4.5L19 7.5" />
              </svg>
            </motion.span>
            <p className="tnum mt-4 text-[26px] font-semibold tracking-[-0.03em] text-ink">+{moneyPlain(paid)}₮</p>
            <p className="text-[13px] text-mute">Хэтэвч цэнэглэгдлээ</p>
          </motion.div>
        ) : invoice ? (
          <motion.div key="invoice" initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }} transition={{ duration: 0.25, ease: EASE }}>
            <div className="rounded-[18px] bg-paper p-5 text-center ring-1 ring-inset ring-hair">
              <p className="text-[12px] font-semibold uppercase tracking-[0.08em] text-mute">QPay нэхэмжлэл</p>
              <p className="tnum mt-1 text-[34px] font-semibold tracking-[-0.035em] text-ink">{moneyPlain(invoice.amount)}₮</p>
              <p className="tnum text-[12px] text-mute">{when(invoice.expiresAt)} хүртэл хүчинтэй</p>
            </div>
            {invoice.provider === "dev" && (
              <p className="mt-3 rounded-xl bg-warn-soft px-3.5 py-2.5 text-[12.5px] font-semibold leading-relaxed text-warn">
                Туршилтын орчин — QPay холбогдоогүй, бодит мөнгө авахгүй. «Төлсөн» дарахад хэтэвч шууд цэнэглэгдэнэ.
              </p>
            )}
            {error && (
              <p role="alert" className="mt-3 rounded-xl bg-danger-soft px-3.5 py-2.5 text-[13px] font-semibold text-danger">
                {error}
              </p>
            )}
            <div className="mt-4 grid gap-2">
              {invoice.provider === "dev" && (
                <PrimaryButton onClick={() => void devPay()} disabled={busy} arrow={false}>
                  {busy ? "Шалгаж байна…" : "Төлсөн (туршилт)"}
                </PrimaryButton>
              )}
              <button type="button" className={`${btnGhost} w-full justify-center`} disabled={busy} onClick={() => void cancel()}>
                Цуцлах
              </button>
            </div>
          </motion.div>
        ) : (
          <motion.div key="amount" initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 16 }} transition={{ duration: 0.25, ease: EASE }}>
            <div className="rounded-[18px] bg-paper px-5 py-6 text-center ring-1 ring-inset ring-hair">
              <p className="text-[12px] font-semibold uppercase tracking-[0.08em] text-mute">Цэнэглэх дүн</p>
              <p className="tnum mt-1 text-[40px] font-semibold leading-none tracking-[-0.04em] text-ink">
                {moneyPlain(value || 0)}
                <span className="ml-1 text-[22px] font-medium text-mute">₮</span>
              </p>
              <p className="tnum mt-2 text-[12px] text-mute">Үлдэгдэл {moneyPlain(wallet.wallet.balance)}₮ → {moneyPlain(wallet.wallet.balance + (valid ? value : 0))}₮</p>
            </div>
            <div className="mt-3 grid grid-cols-4 gap-2">
              {cfg.presets.map((v) => (
                <button
                  key={v}
                  type="button"
                  disabled={v > room}
                  onClick={() => {
                    setAmount(v);
                    setCustom("");
                  }}
                  aria-pressed={!custom && amount === v}
                  className={`press tnum h-11 rounded-xl text-[13.5px] font-semibold ring-1 ring-inset disabled:opacity-40 ${!custom && amount === v ? "bg-ink text-paper ring-ink" : "bg-paper text-ink ring-hair"}`}
                >
                  {v >= 1000 ? `${v / 1000}к` : v}
                </button>
              ))}
            </div>
            <input
              value={custom}
              onChange={(e) => setCustom(e.target.value.replace(/\D/g, "").slice(0, 7))}
              inputMode="numeric"
              placeholder="Өөр дүн"
              aria-label="Өөр дүн"
              className="tnum mt-2 h-12 w-full rounded-xl bg-paper px-4 text-[15px] text-ink ring-1 ring-inset ring-hair placeholder:text-mute focus:outline-none focus:ring-accent"
            />
            <p className="tnum mt-2 text-[12px] text-mute">
              {moneyPlain(cfg.min)}₮ – {moneyPlain(Math.min(cfg.max, room))}₮ · хэтэвчний дээд үлдэгдэл {moneyPlain(wallet.wallet.max)}₮
            </p>
            {!cfg.available && <p className="mt-3 rounded-xl bg-warn-soft px-3.5 py-2.5 text-[12.5px] font-semibold text-warn">Цэнэглэлт одоогоор боломжгүй — QPay холбогдоогүй байна.</p>}
            {error && (
              <p role="alert" className="mt-3 rounded-xl bg-danger-soft px-3.5 py-2.5 text-[13px] font-semibold text-danger">
                {error}
              </p>
            )}
            <div className="mt-4">
              <PrimaryButton onClick={() => void create()} disabled={busy || !valid || !cfg.available} arrow={false}>
                {busy ? "Нэхэмжлэл үүсгэж байна…" : "QPay-ээр цэнэглэх"}
              </PrimaryButton>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </Panel>
  );
}

/* ───────── Касс хэтэвчээр төлөх хүсэлт ───────── */

/** QR дэлгэц нээлттэй үед касс илгээсэн хэтэвчний төлбөрийн хүсэлтийг 2 сек тутам асууна */
export function usePendingWalletPayment(session: string, active: boolean) {
  const [pending, setPending] = useState<PendingWalletPayment | null>(null);
  const dismissed = useRef(new Set<string>());
  useEffect(() => {
    if (!active) return;
    let stop = false;
    const tick = async () => {
      if (stop || document.visibilityState !== "visible") return;
      try {
        const r = (await customerApi.pendingWalletPayments(session)).payments.find((x) => !dismissed.current.has(x.id)) ?? null;
        if (!stop) setPending((cur) => (cur?.id === r?.id ? cur : r));
      } catch {
        /* сүлжээ — дараагийн удаа */
      }
    };
    void tick();
    const t = setInterval(() => void tick(), 2000);
    return () => {
      stop = true;
      clearInterval(t);
    };
  }, [session, active]);
  const done = useCallback((id: string) => {
    dismissed.current.add(id);
    setPending(null);
  }, []);
  return { pending, done };
}

export function WalletPayPrompt({ session, pending, balance, onDone }: { session: string; pending: PendingWalletPayment; balance: number | null; onDone: (id: string, approved: boolean) => void }) {
  const [busy, setBusy] = useState<"approve" | "decline" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const left = Math.max(0, Math.round((new Date(pending.expiresAt).getTime() - now) / 1000));
  const decide = async (action: "approve" | "decline") => {
    setBusy(action);
    setError(null);
    try {
      await customerApi.decideWalletPayment(session, pending.id, action);
      onDone(pending.id, action === "approve");
    } catch (e) {
      setError(e instanceof CustomerApiError ? e.message : "Алдаа гарлаа.");
    } finally {
      setBusy(null);
    }
  };
  return (
    <Panel title="Хэтэвчээр төлөх үү?" onClose={() => void decide("decline")}>
      <div className="rounded-[18px] bg-stage p-5 text-center">
        <p className="text-[13px] font-semibold text-ink-2">{pending.merchantName}</p>
        <p className="tnum mt-1 text-[38px] font-semibold leading-none tracking-[-0.04em] text-ink">{moneyPlain(pending.amount)}₮</p>
        {balance !== null && (
          <p className="tnum mt-3 text-[12.5px] text-mute">
            Үлдэгдэл {moneyPlain(balance)}₮ → <span className="font-semibold text-ink">{moneyPlain(Math.max(0, balance - pending.amount))}₮</span>
          </p>
        )}
        <p className="tnum mt-0.5 text-[11.5px] text-mute">{left} сек</p>
      </div>
      <p className="mt-3 text-[12.5px] leading-relaxed text-mute">Касс дээр та өөрөө байгаа бол зөвшөөрнө үү. Танихгүй хүсэлт бол татгалзана — мөнгө хасагдахгүй.</p>
      {error && (
        <p role="alert" className="mt-2 rounded-xl bg-danger-soft px-3.5 py-2.5 text-[13px] font-semibold text-danger">
          {error}
        </p>
      )}
      <div className="mt-4 grid gap-2">
        <PrimaryButton onClick={() => void decide("approve")} disabled={busy !== null || left === 0} arrow={false}>
          {busy === "approve" ? "Төлж байна…" : `${moneyPlain(pending.amount)}₮ төлөх`}
        </PrimaryButton>
        <button type="button" className={`${btnGhost} w-full justify-center`} disabled={busy !== null} onClick={() => void decide("decline")}>
          Татгалзах
        </button>
      </div>
    </Panel>
  );
}
