"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { moneyPlain } from "@/lib/demo";
import { type GeregeQr, type PendingRedemption, CustomerApiError, OFFLINE, customerApi } from "@/lib/customer-api";
import { QrCode } from "@/components/QrCode";
import { Panel } from "@/components/app/AppUi";
import { PrimaryButton, btnGhost } from "@/components/ui";

/**
 * Нэг Gerege QR — бүх Gerege POS-той дэлгүүрт нэг QR.
 * - Сервер нэг удаагийн токен өгнө (2 мин); харагдаж байх үед 60 сек тутам шинэчилнэ, нуугдвал зогсоно.
 * - Анх уншуулахад тухайн дэлгүүрийн гишүүн автоматаар болно (нэг удаагийн зөвшөөрлөөр).
 * - Касс оноо зарцуулах хүсэлт илгээвэл энд асууна — хэрэглэгч зөвшөөрөхгүй бол зарцуулахгүй.
 */

const REFRESH_MS = 60_000;
const EASE = [0.2, 0.8, 0.2, 1] as const;

/** Харагдаж байгаа үед QR авч, 60 сек тутам шинэчилнэ */
export function useGeregeQr(session: string, active: boolean, onExpired: () => void) {
  const [qr, setQr] = useState<GeregeQr | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const busy = useRef(false);

  const refresh = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    try {
      setQr(await customerApi.qr(session));
      setError(null);
    } catch (e) {
      if (e instanceof CustomerApiError && e.status === 401) onExpired();
      setError(e instanceof CustomerApiError ? (e.status === OFFLINE ? "Сүлжээгүй — QR шинэчлэх боломжгүй." : e.message) : "QR авч чадсангүй.");
    } finally {
      busy.current = false;
    }
  }, [session, onExpired]);

  useEffect(() => {
    if (!active) return;
    const first = setTimeout(() => void refresh(), 0);
    const t = setInterval(() => document.visibilityState === "visible" && void refresh(), REFRESH_MS);
    const tick = setInterval(() => setNow(Date.now()), 1000);
    const vis = () => document.visibilityState === "visible" && void refresh();
    document.addEventListener("visibilitychange", vis);
    return () => {
      clearTimeout(first);
      clearInterval(t);
      clearInterval(tick);
      document.removeEventListener("visibilitychange", vis);
    };
  }, [active, refresh]);

  const left = qr ? Math.max(0, Math.round((new Date(qr.expiresAt).getTime() - now) / 1000)) : 0;
  return { qr: qr && left > 0 ? qr : null, left, ttl: qr?.ttlSeconds ?? 120, error, refresh };
}

/** QR дэлгэц нээлттэй үед касс илгээсэн зарцуулах хүсэлтийг 2 сек тутам асууна */
export function usePendingRedemption(session: string, active: boolean) {
  const [pending, setPending] = useState<PendingRedemption | null>(null);
  const dismissed = useRef(new Set<string>());
  useEffect(() => {
    if (!active) return;
    let stop = false;
    const tick = async () => {
      if (stop || document.visibilityState !== "visible") return;
      try {
        const r = (await customerApi.pendingRedemptions(session)).redemptions.find((x) => !dismissed.current.has(x.id)) ?? null;
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

/** Тойрог тоолуур — QR-ын үлдсэн хугацаа */
function Countdown({ left, ttl }: { left: number; ttl: number }) {
  const r = 9;
  const c = 2 * Math.PI * r;
  return (
    <span className="relative grid size-6 place-items-center" aria-label={`${left} секунд`}>
      <svg viewBox="0 0 24 24" className="absolute inset-0 -rotate-90">
        <circle cx="12" cy="12" r={r} fill="none" stroke="currentColor" strokeOpacity=".15" strokeWidth="2.5" />
        <circle cx="12" cy="12" r={r} fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - left / ttl)} style={{ transition: "stroke-dashoffset 1s linear" }} />
      </svg>
      <span className="tnum text-[8.5px] font-bold">{left}</span>
    </span>
  );
}

/** Нүүр хуудасны нэг Gerege QR карт */
export function GeregeQrCard({
  qr,
  left,
  ttl,
  error,
  consent,
  onConsent,
  onExpand,
  size = 168,
}: {
  qr: GeregeQr | null;
  left: number;
  ttl: number;
  error: string | null;
  consent: boolean;
  onConsent: () => void;
  onExpand?: () => void;
  size?: number;
}) {
  if (!consent) {
    return (
      <div className="rounded-[22px] bg-ink p-5 text-paper">
        <p className="text-[17px] font-bold tracking-[-0.02em]">Нэг QR — бүх дэлгүүрт</p>
        <p className="mt-1.5 text-[13px] leading-relaxed opacity-80">
          Gerege POS-той дэлгүүрийн касс дээр энэ QR-ыг уншуулахад тухайн дэлгүүрийн гишүүн <b>автоматаар</b> болж, оноо цуглуулна. Дэлгүүрт таны нууцалсан утас
          (99****66) л харагдана. Оноо зарцуулахад апп дээрээ зөвшөөрнө.
        </p>
        <div className="mt-4">
          <PrimaryButton onClick={onConsent} arrow={false}>
            Зөвшөөрөөд QR авах
          </PrimaryButton>
        </div>
      </div>
    );
  }
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: EASE }}
      className="flex items-center gap-4 rounded-[22px] bg-ink p-4 text-paper"
    >
      <button type="button" onClick={onExpand} aria-label="Gerege QR томоор" className="relative shrink-0 rounded-2xl bg-white p-2">
        <AnimatePresence mode="wait" initial={false}>
          <motion.span key={qr?.token ?? "none"} initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }} className="block">
            {qr ? (
              <QrCode value={qr.token} size={size} label="Gerege QR" />
            ) : (
              <span className="grid place-items-center text-[11px] font-semibold text-ink-2" style={{ width: size, height: size }}>
                {error ? "QR алга" : "Ачаалж байна…"}
              </span>
            )}
          </motion.span>
        </AnimatePresence>
      </button>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-semibold uppercase tracking-[0.08em] opacity-60">Gerege QR</p>
        <p className="mt-1 text-[15px] font-bold leading-snug tracking-[-0.01em]">Касс дээр уншуулна</p>
        <p className="mt-1 text-[12px] leading-snug opacity-70">Бүх Gerege дэлгүүрт оноо цуглуулна, анх удаа бол автоматаар элснэ.</p>
        {error ? (
          <p role="status" className="mt-2 text-[11.5px] font-semibold text-[color:var(--accent)]">
            {error}
          </p>
        ) : (
          qr && (
            <p className="mt-2 flex items-center gap-1.5 text-[11.5px] opacity-80">
              <Countdown left={left} ttl={ttl} />
              Нэг удаагийн · автоматаар шинэчлэгдэнэ
            </p>
          )
        )}
      </div>
    </motion.div>
  );
}

/** Касс оноо зарцуулах хүсэлт илгээхэд — хэрэглэгч энд шийднэ */
export function RedemptionPrompt({ session, pending, onDone }: { session: string; pending: PendingRedemption; onDone: (id: string, approved: boolean) => void }) {
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
      await customerApi.decideRedemption(session, pending.id, action);
      onDone(pending.id, action === "approve");
    } catch (e) {
      setError(e instanceof CustomerApiError ? e.message : "Алдаа гарлаа.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <Panel title="Оноо зарцуулах уу?" onClose={() => void decide("decline")}>
      <div className="rounded-[18px] bg-stage p-4 text-center">
        <p className="text-[13px] font-semibold text-ink-2">{pending.merchantName}</p>
        <p className="tnum mt-1 text-[34px] font-extrabold leading-none tracking-[-0.04em] text-ink">{moneyPlain(pending.points)}</p>
        <p className="text-[12px] font-semibold text-mute">оноо</p>
        <p className="tnum mt-3 text-[14px] font-bold text-ok">−{moneyPlain(pending.value)}₮ хөнгөлөлт</p>
        <p className="tnum mt-0.5 text-[11.5px] text-mute">Сагс {moneyPlain(pending.cartTotal)}₮ · {left} сек</p>
      </div>
      <p className="mt-3 text-[12.5px] leading-relaxed text-mute">Касс дээр та өөрөө байгаа бол зөвшөөрнө үү. Танихгүй хүсэлт бол татгалзана — оноо хасагдахгүй.</p>
      {error && (
        <p role="alert" className="mt-2 rounded-xl bg-danger-soft px-3.5 py-2.5 text-[13px] font-semibold text-danger">
          {error}
        </p>
      )}
      <div className="mt-4 grid gap-2">
        <PrimaryButton onClick={() => void decide("approve")} disabled={busy !== null || left === 0} arrow={false}>
          {busy === "approve" ? "Зөвшөөрч байна…" : "Зөвшөөрөх"}
        </PrimaryButton>
        <button type="button" className={`${btnGhost} w-full justify-center`} disabled={busy !== null} onClick={() => void decide("decline")}>
          Татгалзах
        </button>
      </div>
    </Panel>
  );
}
