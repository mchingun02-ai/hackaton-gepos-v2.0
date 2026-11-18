"use client";

import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useStore } from "@/lib/store";
import { HQ_CHANGE } from "@/lib/pos-api";

/**
 * Gerege төв системтэй холболт (Boxsi сайтын admin → «Төхөөрөмжийн төв»).
 *
 * 1. Админ төвөөс 6 оронтой холбох код үүсгэнэ.
 * 2. Энд «Тохиргоо → Төв систем»-д кодыг оруулна → нууц түлхүүр авна.
 * 3. 30 секунд тутам heartbeat: өнөөдрийн борлуулалт, гүйлгээ, е-баримтын
 *    дараалал, кассчин, смен. Хариуд нь төвийн тушаал (түгжих, мессеж).
 *
 * Сүлжээ тасарвал касс ажилласаар байна — зөвхөн «офлайн» гэж тэмдэглэнэ.
 * Түгжээ нь сүүлд мэдэгдсэн төлөвөөрөө хадгалагдана (дахин ачаалахад ч).
 */

export const APP_VERSION = "gerege-pos 0.1.0";
const KEY = "gp-hq-v1";
const BEAT_MS = 30_000;

type Saved = {
  server: string;
  deviceKey: string;
  device: { serial: string; model: string; posNo: string | null; merchant: string | null; branch: string | null } | null;
  locked: boolean;
  reason: string | null;
  message: string | null;
};

type Hq = Saved & {
  paired: boolean;
  status: "unpaired" | "online" | "offline";
  lastSync: number | null;
  lastError: string | null;
  pair: (server: string, code: string) => Promise<string | null>;
  unpair: () => void;
  syncNow: () => void;
  dismissMessage: () => void;
};

const empty: Saved = { server: "", deviceKey: "", device: null, locked: false, reason: null, message: null };
const parse = (raw: string | null): Saved => {
  try {
    return raw ? { ...empty, ...JSON.parse(raw) } : empty;
  } catch {
    return empty;
  }
};
const rawSaved = () => {
  try {
    return localStorage.getItem(KEY) ?? "";
  } catch {
    return "";
  }
};
const read = (): Saved => parse(rawSaved());

/* localStorage-ийн өөрчлөлтийг React-д мэдэгдэх (өөр tab-аас ч) */
const LOCAL_CHANGE = "gp-hq-local";
const subscribe = (notify: () => void) => {
  window.addEventListener(LOCAL_CHANGE, notify);
  window.addEventListener("storage", notify);
  return () => {
    window.removeEventListener(LOCAL_CHANGE, notify);
    window.removeEventListener("storage", notify);
  };
};

export const defaultServer = () =>
  typeof window === "undefined" ? "" : `${window.location.protocol}//${window.location.hostname}:3000`;

const HqContext = createContext<Hq | null>(null);
export const useHq = () => {
  const ctx = useContext(HqContext);
  if (!ctx) throw new Error("useHq outside HqProvider");
  return ctx;
};

export function HqProvider({ children }: { children: ReactNode }) {
  const store = useStore();
  const raw = useSyncExternalStore(subscribe, rawSaved, () => "");
  const saved = useMemo(() => parse(raw), [raw]);
  const [net, setNet] = useState<"online" | "offline">("offline");
  const status: Hq["status"] = saved.deviceKey ? net : "unpaired";
  const [lastSync, setLastSync] = useState<number | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);
  const [seenMessage, setSeenMessage] = useState<string | null>(null);

  const save = useCallback((next: Saved) => {
    const before = read();
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch {}
    window.dispatchEvent(new Event(LOCAL_CHANGE));
    // Холбогдох, салгагдах үед кассын өгөгдлийг серверээс / туршилтын горимоор дахин ачаална
    if (before.deviceKey !== next.deviceKey || before.server !== next.server) window.dispatchEvent(new Event(HQ_CHANGE));
  }, []);

  // Heartbeat-д хамгийн сүүлийн үзүүлэлтийг өгөх — interval дахин үүсэхгүйн тулд ref
  const stats = useRef({ todaySales: 0, todayTxns: 0, ebarimtQueue: 0, cashier: null as string | null, shiftOpen: false });
  useEffect(() => {
    stats.current = {
      todaySales: store.txns.reduce((sum, t) => sum + t.amount, 0),
      todayTxns: store.txns.length,
      // Е-баримт холбогдоогүй — бүх гүйлгээ татварт илгээгдээгүй
      ebarimtQueue: store.txns.length,
      cashier: store.person?.name ?? null,
      shiftOpen: Boolean(store.shift),
    };
  });

  const beat = useCallback(async () => {
    const current = read();
    if (!current.deviceKey) return;
    try {
      const battery = await (navigator as Navigator & { getBattery?: () => Promise<{ level: number }> }).getBattery?.().catch(() => null);
      const res = await fetch(`${current.server}/api/pos/heartbeat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${current.deviceKey}` },
        body: JSON.stringify({
          appVersion: APP_VERSION,
          ...stats.current,
          battery: battery ? Math.round(battery.level * 100) : null,
          lastError: stats.current.ebarimtQueue > 0 ? "Е-баримт (PosAPI) холбогдоогүй" : null,
        }),
        signal: AbortSignal.timeout(10_000),
      });
      if (res.status === 401) {
        // Төвөөс шинэ код үүсгэсэн эсвэл төхөөрөмжийг устгасан
        save({ ...empty, server: current.server });
        setLastError("Төвөөс салгагдсан. Шинэ холбох кодоор дахин холбоно уу.");
        return;
      }
      const reply = (await res.json()) as { locked?: boolean; reason?: string | null; message?: string | null; device?: Saved["device"] };
      save({ ...current, locked: Boolean(reply.locked), reason: reply.reason ?? null, message: reply.message ?? null, device: reply.device ?? current.device });
      setNet("online");
      setLastSync(Date.now());
      setLastError(null);
    } catch {
      setNet("offline");
      setLastError("Төв системтэй холбогдож чадсангүй — касс ажилласаар байна.");
    }
  }, [save]);

  useEffect(() => {
    if (!saved.deviceKey) return;
    const first = setTimeout(beat, 0);
    const timer = setInterval(beat, BEAT_MS);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [saved.deviceKey, beat]);

  // Гүйлгээ дуусах бүрт шууд мэдээлнэ — төвд борлуулалт хоцрохгүй
  const txnCount = store.txns.length;
  useEffect(() => {
    if (!saved.deviceKey || !txnCount) return;
    const timer = setTimeout(beat, 0);
    return () => clearTimeout(timer);
  }, [txnCount, saved.deviceKey, beat]);

  const pair: Hq["pair"] = async (server, code) => {
    const base = server.trim().replace(/\/+$/, "");
    try {
      const res = await fetch(`${base}/api/pos/pair`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, appVersion: APP_VERSION }),
        signal: AbortSignal.timeout(10_000),
      });
      const data = (await res.json()) as { deviceKey?: string; device?: Saved["device"]; error?: string };
      if (!res.ok || !data.deviceKey) return data.error ?? `Алдаа ${res.status}`;
      save({ ...empty, server: base, deviceKey: data.deviceKey, device: data.device ?? null });
      return null;
    } catch {
      return `${base} хаягтай холбогдож чадсангүй. Хаяг зөв, сервер асаалттай эсэхийг шалгана уу.`;
    }
  };

  const value: Hq = {
    ...saved,
    paired: Boolean(saved.deviceKey),
    status,
    lastSync,
    lastError,
    pair,
    unpair: () => save({ ...empty, server: saved.server }),
    syncNow: beat,
    message: saved.message && saved.message !== seenMessage ? saved.message : null,
    dismissMessage: () => setSeenMessage(saved.message),
  };

  return <HqContext.Provider value={value}>{children}</HqContext.Provider>;
}
