"use client";

import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { type Member, members, tierRule } from "@/lib/demo";
import { type ShopItem, partnerOf, shopItems } from "@/lib/app-data";

/**
 * Хэрэглэгчийн аппын төлөв: хэтэвч, оноо, сагс, захиалга.
 *
 * Оноо ба мөнгө тусдаа: оноо нь урамшууллаар хуримтлагдана, хэрэглэгч
 * хүссэн үедээ хэтэвч рүү мөнгө болгон шилжүүлнэ (1 оноо = 1₮). Хэтэвчний
 * мөнгөөр хамтрагч бүх дэлгүүрт төлнө.
 *
 * Туршилтын хувилбарт энэ төхөөрөмжийн localStorage-д хадгална. Бодит
 * системд хэтэвч серверт (санхүүгийн бүртгэлтэй) байх ёстой.
 */

export type WalletTxn = {
  id: string;
  at: number;
  kind: "оноо→мөнгө" | "цэнэглэлт" | "худалдан авалт" | "оноо";
  title: string;
  /** ₮ — хэтэвчний мөнгөнд нөлөөлсөн дүн (+/−) */
  money: number;
  /** оноонд нөлөөлсөн (+/−) */
  points: number;
};

export type OrderLine = { itemId: string; qty: number };
export type PayMethod = "хэтэвч" | "qpay";
export type Order = {
  id: string;
  at: number;
  partnerId: string;
  lines: OrderLine[];
  subtotal: number;
  off: number;
  deliveryFee: number;
  pointsUsed: number;
  paid: number;
  method: PayMethod;
  address: string;
  earned: number;
};

export const ORDER_STEPS = ["Хүлээн авсан", "Бэлтгэж байна", "Хүргэлтэнд", "Хүргэгдсэн"] as const;
/** Туршилтад алхам бүр 25 секунд — бодит хүргэлтийн явцыг харуулахад */
const STEP_MS = 25_000;
export const orderStep = (order: Order, now: number) =>
  Math.min(ORDER_STEPS.length - 1, Math.floor((now - order.at) / STEP_MS));

type Saved = {
  memberId: string | null;
  balance: number;
  points: Record<string, number>;
  txns: WalletTxn[];
  cart: OrderLine[];
  orders: Order[];
  address: string;
};

const KEY = "gp-app-v1";
const empty: Saved = { memberId: null, balance: 0, points: {}, txns: [], cart: [], orders: [], address: "" };

const load = (): Saved => {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...empty, ...JSON.parse(raw) } : empty;
  } catch {
    return empty;
  }
};

type Ctx = {
  ready: boolean;
  member: Member | null;
  balance: number;
  points: number;
  txns: WalletTxn[];
  cart: OrderLine[];
  cartItems: { item: ShopItem; qty: number }[];
  cartPartnerId: string | null;
  orders: Order[];
  address: string;
  now: number;
  login: (member: Member) => void;
  logout: () => void;
  convertPoints: (amount: number) => void;
  topUp: (amount: number) => void;
  setQty: (item: ShopItem, qty: number) => void;
  clearCart: () => void;
  setAddress: (address: string) => void;
  checkout: (opts: { method: PayMethod; usePoints: number; address: string }) => Order | string;
};

const AppStore = createContext<Ctx | null>(null);
export const useApp = () => {
  const ctx = useContext(AppStore);
  if (!ctx) throw new Error("useApp outside AppStoreProvider");
  return ctx;
};

const uid = () => Math.random().toString(36).slice(2, 10).toUpperCase();
export const itemById = (id: string) => shopItems.find((item) => item.id === id)!;

/* «1+1» бол хоёр дахь нь үнэгүй, «2 дахь нь 50%» бол хос бүрийн хоёр дахь нь хагас */
export const lineTotal = (item: ShopItem, qty: number) => {
  if (item.deal === "1+1") return item.price * Math.ceil(qty / 2);
  if (item.deal === "2 дахь нь 50%") return item.price * qty - Math.floor(qty / 2) * Math.round(item.price / 2);
  return item.price * qty;
};

const noSubscribe = () => () => {};

export function AppStoreProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<Saved>(empty);
  const [ready, setReady] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  /* Сервер дээр localStorage байхгүй — hydration-ы дараах эхний render-д ачаална
     (render үеийн нөхцөлт state шинэчлэл, effect-ээр давхар render хийхгүй). */
  const hydrated = useSyncExternalStore(
    noSubscribe,
    () => true,
    () => false,
  );
  if (hydrated && !ready) {
    setReady(true);
    setState(load());
  }

  useEffect(() => {
    if (!ready) return;
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch {}
  }, [state, ready]);

  // Захиалгын явцыг шинэчлэх цаг
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 5_000);
    return () => clearInterval(timer);
  }, []);

  const member = members.find((m) => m.id === state.memberId) ?? null;
  // Анх нэвтрэхэд кассын бүртгэлийн оноо; дараа нь энэ хэтэвчинд хөтлөгдөнө
  const points = member ? (state.points[member.id] ?? member.points) : 0;

  const update = useCallback((fn: (s: Saved) => Saved) => setState((s) => fn(s)), []);

  const addTxn = (s: Saved, txn: Omit<WalletTxn, "id" | "at">): WalletTxn[] => [{ id: uid(), at: Date.now(), ...txn }, ...s.txns].slice(0, 100);

  const ctx = useMemo<Ctx>(() => {
    const cartItems = state.cart.map((line) => ({ item: itemById(line.itemId), qty: line.qty }));
    return {
      ready,
      member,
      balance: state.balance,
      points,
      txns: state.txns,
      cart: state.cart,
      cartItems,
      cartPartnerId: cartItems[0]?.item.partnerId ?? null,
      orders: state.orders,
      address: state.address,
      now,
      login: (m) => update((s) => (s.memberId === m.id ? s : { ...empty, memberId: m.id })),
      logout: () => update(() => empty),
      convertPoints: (amount) =>
        update((s) => {
          if (!member) return s;
          const have = s.points[member.id] ?? member.points;
          const take = Math.max(0, Math.min(Math.floor(amount), have));
          if (!take) return s;
          return {
            ...s,
            points: { ...s.points, [member.id]: have - take },
            balance: s.balance + take,
            txns: addTxn(s, { kind: "оноо→мөнгө", title: "Оноог мөнгө болгосон", money: take, points: -take }),
          };
        }),
      topUp: (amount) =>
        update((s) => ({
          ...s,
          balance: s.balance + amount,
          txns: addTxn(s, { kind: "цэнэглэлт", title: "QPay-ээр цэнэглэсэн", money: amount, points: 0 }),
        })),
      setQty: (item, qty) =>
        update((s) => {
          // Нэг захиалга = нэг дэлгүүр (нэг хүргэлт). Өөр дэлгүүрийнх нэмбэл сагсыг шинэчилнэ.
          const sameShop = s.cart.length === 0 || itemById(s.cart[0].itemId).partnerId === item.partnerId;
          const base = sameShop ? s.cart : [];
          const rest = base.filter((line) => line.itemId !== item.id);
          return { ...s, cart: qty > 0 ? [...rest, { itemId: item.id, qty }] : rest };
        }),
      clearCart: () => update((s) => ({ ...s, cart: [] })),
      setAddress: (address) => update((s) => ({ ...s, address })),
      checkout: ({ method, usePoints, address }) => {
        if (!member || cartItems.length === 0) return "Сагс хоосон байна.";
        const partner = partnerOf(cartItems[0].item.partnerId);
        if (!partner.delivery) return "Энэ дэлгүүр хүргэлт хийдэггүй.";
        if (!address.trim()) return "Хүргэлтийн хаягаа оруулна уу.";

        const subtotal = cartItems.reduce((sum, { item, qty }) => sum + lineTotal(item, qty), 0);
        const off = Math.round(subtotal * tierRule[member.tier].off);
        const deliveryFee = subtotal - off >= partner.delivery.freeFrom ? 0 : partner.delivery.fee;
        const due = subtotal - off + deliveryFee;
        const pointsUsed = Math.max(0, Math.min(usePoints, points, due));
        const paid = due - pointsUsed;
        if (method === "хэтэвч" && paid > state.balance) return "Хэтэвчний үлдэгдэл хүрэлцэхгүй байна.";
        // Оноо = барааны төлбөрөөс (хүргэлтгүй) гишүүний зэрэглэлийн % + дэлгүүрийн нэмэлт %
        const earned = Math.floor(Math.max(0, paid - deliveryFee) * (tierRule[member.tier].earn + partner.pointRate / 100));

        const order: Order = {
          id: uid(),
          at: Date.now(),
          partnerId: partner.id,
          lines: state.cart,
          subtotal,
          off,
          deliveryFee,
          pointsUsed,
          paid,
          method,
          address,
          earned,
        };
        update((s) => {
          let txns = s.txns;
          const add = (t: Omit<WalletTxn, "id" | "at">) => (txns = [{ id: uid(), at: Date.now(), ...t }, ...txns]);
          add({ kind: "худалдан авалт", title: `${partner.name} · захиалга`, money: method === "хэтэвч" ? -paid : 0, points: -pointsUsed });
          if (earned) add({ kind: "оноо", title: `${partner.name} · урамшууллын оноо`, money: 0, points: earned });
          const have = s.points[member.id] ?? member.points;
          return {
            ...s,
            cart: [],
            address,
            balance: method === "хэтэвч" ? s.balance - paid : s.balance,
            points: { ...s.points, [member.id]: have - pointsUsed + earned },
            orders: [order, ...s.orders],
            txns: txns.slice(0, 100),
          };
        });
        return order;
      },
    };
  }, [state, ready, member, points, now, update]);

  return <AppStore.Provider value={ctx}>{children}</AppStore.Provider>;
}
