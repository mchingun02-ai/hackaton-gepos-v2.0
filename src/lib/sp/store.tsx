"use client";

/*
 * Store Plus — нэг төлөв, олон апп (хөтчийн тал).
 *
 * Пос (/), мерчантын апп (/merchant), Merchant portal (/portal), захиалгын
 * хуудас (/shop), AI ажилтан (/ai) бүгд энэ store-г ашиглана.
 *
 * Хадгалалт:
 *   1. localStorage — шууд, офлайн ч ажиллана.
 *   2. BroadcastChannel — нээлттэй цонхнууд хооронд шууд.
 *   3. Сервер (/api/sp/state, SQLite) — нэвтэрсэн (session cookie) үед өөрчлөлт бүр сервер рүү явна;
 *      AI ажилтан, MCP серверээс хийсэн өөрчлөлт /api/sp/events (SSE)-ээр бүх цонхонд ирнэ.
 *
 * Бүх үйлдэл (core.ts) аудит лог бичнэ (BR08-8).
 */

import { useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { freshState, normalize, setSpBackend } from "./core";
import { SP_VERSION } from "./seed";
import type { SpState } from "./types";

export { STAFF_REG, repair, expire, freshState, normalize, SpError, type Actor, actorOf, staffLogin, staffByPin, merchantLogin, resetPinWithPuk, registerMerchant, updateMerchant, setPlan, upsertStaff, addRole, setTaxProfile, upsertCategory, upsertProduct, setDeliveryStopped, findCustomer, findByPass, addCustomer, updateCustomer, eraseCustomer, adjustPoints, type SaleInput, completeSale, refundSale, type OrderInput, createOrder, collectOrderPayment, setOrderStatus, handover, resendCode, cancelOrder, updateDelivery, upsertCampaign, toggleCampaign, updatePass, issuePass, sendSmsCampaign, setOnline, setEbarimt, readNotices, resetDemo, mutate, uid, isExciseBuna } from "./core";

const KEY = "gepos-storeplus";
const REV = "gepos-storeplus-rev";
const CH = "gepos-storeplus";

let state: SpState | null = null;
let rev = 0;
const subs = new Set<() => void>();
let channel: BroadcastChannel | null = null;
const notify = () => subs.forEach((f) => f());

function readLocal(): SpState {
  try {
    const raw = localStorage.getItem(KEY);
    rev = Number(localStorage.getItem(REV) || 0) || 0;
    if (raw) {
      const s = JSON.parse(raw) as SpState;
      if (s.v === SP_VERSION) return normalize(s);
    }
  } catch {
    /* хуучин эсвэл эвдэрсэн өгөгдөл — шинээр үүсгэнэ */
  }
  rev = 0;
  const s = freshState();
  writeLocal(s, false);
  return s;
}

function writeLocal(s: SpState, broadcast = true) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
    localStorage.setItem(REV, String(rev));
  } catch {
    /* хадгалах зай дүүрсэн — санах ойд үргэлжилнэ */
  }
  if (broadcast) channel?.postMessage("changed");
}

/* ───────── серверийн синк ───────── */

/*
 * Мерчантыг серверийн session cookie (gp_s, HttpOnly) таньна — толгой, ?m= илгээхгүй.
 * Нэвтрээгүй (эсвэл өөр мерчантаар нэвтэрсэн) үед синк хийхгүй: ПОС, портал localStorage дээр
 * хэвээр ажиллана, төлөв «холбогдоогүй» (signedout).
 */
let pushing: Promise<void> = Promise.resolve();
let dirty = false;
let syncStarted = false;
let authed = false;
let es: EventSource | null = null;
export type SyncStatus = "local" | "syncing" | "synced" | "offline" | "signedout";
let syncStatus: SyncStatus = "local";
const syncSubs = new Set<() => void>();
const setSync = (s: SyncStatus) => {
  syncStatus = s;
  syncSubs.forEach((f) => f());
};

function adopt(s: SpState, r: number) {
  state = normalize(s);
  rev = r;
  writeLocal(state);
  notify();
}

function signedOut() {
  authed = false;
  es?.close();
  es = null;
  setSync("signedout");
}

/** Өөрчлөлтийг сервер рүү дараалан илгээнэ (сүүлийн төлвийг л). */
function push() {
  dirty = true;
  if (!authed) return;
  pushing = pushing.then(async () => {
    if (!dirty || !state || !authed) return;
    dirty = false;
    const s = state;
    setSync("syncing");
    try {
      const r = await fetch(`/api/sp/state`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ base: rev, state: s }),
      });
      const j = (await r.json().catch(() => ({}))) as { rev: number; state?: SpState };
      if (r.ok) {
        rev = j.rev;
        writeLocal(state ?? s, false);
        setSync("synced");
      } else if (r.status === 409 && j.state) {
        // Сервер дээр (AI эсвэл өөр төхөөрөмж) шинэ өөрчлөлт байна — серверийнхийг авна
        adopt(j.state, j.rev);
        setSync("synced");
      } else if (r.status === 401) signedOut();
      else setSync("offline");
    } catch {
      setSync("offline");
    }
  });
}

async function pull() {
  if (!state || !authed) return;
  try {
    const r = await fetch(`/api/sp/state`, { cache: "no-store" });
    if (r.status === 401) return signedOut();
    if (r.status === 404) return push(); // сервер дээр анх удаа
    if (!r.ok) return setSync("offline");
    const j = (await r.json()) as { rev: number; state: SpState };
    if (j.rev > rev || j.state.merchant.regNo !== state.merchant.regNo) adopt(j.state, j.rev);
    else if (j.rev < rev) {
      // серверийн өгөгдөл шинэчлэгдсэн (жишээ нь DB устгасан) — манайхыг суурь болгоно
      rev = j.rev;
      push();
    }
    setSync("synced");
  } catch {
    setSync("offline");
  }
}

async function startSync() {
  if (syncStarted || typeof window === "undefined" || !state) return;
  syncStarted = true;
  try {
    const me = (await fetch("/api/auth/me", { cache: "no-store" }).then((r) => r.json())) as { authenticated?: boolean; tenant?: { id: string }; scopes?: string[] };
    if (!me.authenticated || !me.scopes?.includes("pos:state")) return signedOut();
    // Өөр мерчантаар нэвтэрсэн бол серверийн (нэвтэрсэн мерчантын) төлвийг авна; push хийхгүй
    if (me.tenant && state && me.tenant.id !== state.merchant.regNo.toUpperCase()) {
      const r = await fetch(`/api/sp/state`, { cache: "no-store" });
      if (!r.ok) return setSync("offline");
      const j = (await r.json()) as { rev: number; state: SpState };
      adopt(j.state, j.rev);
    }
  } catch {
    return setSync("offline");
  }
  authed = true;
  void pull();
  es?.close();
  es = new EventSource(`/api/sp/events`);
  es.onmessage = (e) => {
    const r = Number(e.data);
    if (r > rev && !dirty) void pull();
  };
  es.onerror = () => {
    // 401 үед EventSource бүр мөсөн хаагдана (CLOSED) — дахин нэвтрэхийг хүлээнэ
    if (es?.readyState === EventSource.CLOSED) signedOut();
    else setSync("offline");
  };
  es.onopen = () => void pull();
}

/** Нэвтэрсний дараа синкийг дахин эхлүүлнэ (нэвтрэх дэлгэц дуудна) */
export function resyncSp(): Promise<void> {
  es?.close();
  es = null;
  syncStarted = false;
  authed = false;
  ensure();
  return startSync();
}
/** Гарсны дараа синкийг зогсооно — локал төлөв хэвээр */
export function stopSp() {
  signedOut();
  syncStarted = false;
}

/* ───────── хөтчийн backend ───────── */

function ensure(): SpState {
  if (!state) {
    state = readLocal();
    if (typeof window !== "undefined" && !channel && "BroadcastChannel" in window) {
      channel = new BroadcastChannel(CH);
      channel.onmessage = () => {
        state = readLocal();
        notify();
      };
      window.addEventListener("storage", (e) => {
        if (e.key === KEY) {
          state = readLocal();
          notify();
        }
      });
    }
    void startSync();
  }
  return state;
}

if (typeof window !== "undefined") {
  setSpBackend({
    get: ensure,
    set(next) {
      state = next;
      writeLocal(next);
      notify();
      push();
    },
  });
}

let ssr: SpState | null = null;
const serverSnapshot = () => (ssr ??= freshState());

export function getSp(): SpState {
  return ensure();
}

const subscribe = (f: () => void) => {
  subs.add(f);
  return () => subs.delete(f);
};

/** Төлөвийг уншина. SpGate-ийн дотор ашиглана (SSR үед seed буцаана). */
export function useSp(): SpState {
  return useSyncExternalStore(subscribe, ensure, serverSnapshot);
}

/** Серверийн синкийн төлөв (UI-д жижиг тэмдэг) */
export function useSyncStatus(): SyncStatus {
  return useSyncExternalStore(
    (f) => {
      syncSubs.add(f);
      return () => syncSubs.delete(f);
    },
    () => syncStatus,
    () => "local" as SyncStatus,
  );
}

/**
 * localStorage нь сервер дээр байхгүй тул Store Plus-ийн дэлгэцүүдийг
 * зөвхөн хөтөч дээр зурна — hydration зөрөхгүй.
 */
export function SpGate({ children, fallback = null }: { children: ReactNode; fallback?: ReactNode }) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    ensure();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage (гадаад систем) бэлэн болсны дараа л зурна
    setReady(true);
  }, []);
  return ready ? <>{children}</> : <>{fallback}</>;
}
