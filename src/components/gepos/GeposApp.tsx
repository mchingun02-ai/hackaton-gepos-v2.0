"use client";

/*
 * GePOS — SUNMI 6.75" (360×800) кассын апп. BRD 7.3, BR09.
 * Урт дараалалд зөн совингоор: том товч, нэг дараагийн алхам, бага унших.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { actorOf, SpGate, useSp } from "@/lib/sp/store";
import type { Role, Staff } from "@/lib/sp/types";
import { DeviceFrame, Stack, Toaster, toast } from "@/components/sp/ui";
import { EMPTY_DRAFT, PosCtx, posAccess, type Pos, type Route, type SaleDraft } from "./ctx";
import { ProductForm, Products } from "./Products";
import { ApprovalProvider } from "./Approval";
import { Login, NoAccess } from "./Login";
import { Home } from "./Home";
import { Sell } from "./Sell";
import { Cart } from "./Cart";
import { Split } from "./Split";
import { Pay } from "./Pay";
import { History, Refund, SaleDetail } from "./History";
import { OrderDetail, Orders } from "./Deliveries";
import { Handover, StopDelivery } from "./Handover";

const SESSION = "gepos-session";

export default function GeposApp() {
  return (
    <SpGate>
      <DeviceFrame w={360} h={800} caption="GePOS · SUNMI 6.75″ · 360×800">
        <Root />
        <Toaster bottom={92} />
      </DeviceFrame>
    </SpGate>
  );
}

function Root() {
  const s = useSp();
  const [staffId, setStaffId] = useState<string | null>(() => {
    try {
      return sessionStorage.getItem(SESSION);
    } catch {
      return null;
    }
  });
  const staff = s.staff.find((x) => x.id === staffId && x.active) ?? null;
  const role = staff ? s.roles.find((r) => r.id === staff.roleId) : undefined;

  const login = (st: Staff) => {
    try {
      sessionStorage.setItem(SESSION, st.id);
    } catch {
      /* хувийн цонх */
    }
    setStaffId(st.id);
  };
  const logout = () => {
    try {
      sessionStorage.removeItem(SESSION);
    } catch {
      /* хувийн цонх */
    }
    setStaffId(null);
  };

  if (!staff || !role)
    return (
      <div className="relative h-full">
        <Stack k="login" dir={-1}>
          <Login onLogin={login} />
        </Stack>
      </div>
    );
  if (posAccess("sales", s.merchant.plan, role) === "hidden" && posAccess("delivery", s.merchant.plan, role) === "hidden") return <NoAccess staff={staff} onLogout={logout} />;
  return <Session key={staff.id} staff={staff} role={role} logout={logout} />;
}

function Session({ staff, role, logout }: { staff: Staff; role: Role; logout: () => void }) {
  const s = useSp();
  const [stack, setStack] = useState<Route[]>([{ s: "home" }]);
  const [dir, setDir] = useState<1 | -1>(1);
  const [draft, setDraftState] = useState<SaleDraft>(EMPTY_DRAFT);
  const [fresh, setFresh] = useState<Set<string>>(new Set());

  const go = useCallback((r: Route) => {
    setDir(1);
    setStack((st) => [...st, r]);
  }, []);
  const back = useCallback(() => {
    setDir(-1);
    setStack((st) => (st.length > 1 ? st.slice(0, -1) : st));
  }, []);
  const replace = useCallback((r: Route) => {
    setDir(1);
    setStack((st) => [...st.slice(0, -1), r]);
  }, []);
  const reset = useCallback((r?: Route) => {
    setDir(r ? 1 : -1);
    setStack(r ? [{ s: "home" }, r] : [{ s: "home" }]);
  }, []);

  // BR09-10: шинэ захиалга ирэхэд мэдэгдэл (BroadcastChannel-аар бусад цонхноос)
  const canDeliver = posAccess("delivery", s.merchant.plan, role) === "ok";
  const seen = useRef<Set<string> | null>(null);
  useEffect(() => {
    const ids = new Set(s.orders.map((o) => o.id));
    if (!seen.current) {
      seen.current = ids;
      return;
    }
    const added = s.orders.filter((o) => !seen.current!.has(o.id));
    seen.current = ids;
    if (!added.length || !canDeliver) return;
    const o = added[0];
    try {
      navigator.vibrate?.([30, 60, 30]);
    } catch {
      /* дэмжихгүй */
    }
    toast(`Шинэ захиалга #${o.no} · ${o.name}`, "ok", { label: "Харах", run: () => go({ s: "order", id: o.id }) });
    setFresh((f) => new Set([...f, ...added.map((x) => x.id)]));
    setTimeout(() => setFresh((f) => new Set([...f].filter((id) => !added.some((x) => x.id === id)))), 12000);
  }, [s.orders, canDeliver, go]);

  const pos: Pos = useMemo(
    () => ({
      staff,
      role,
      actor: actorOf(staff),
      logout,
      go,
      back,
      replace,
      reset,
      draft,
      setDraft: (fn) => setDraftState(fn),
      addItem: (pid, n = 1) =>
        setDraftState((d) => {
          const has = d.cart.find((c) => c.productId === pid);
          return { ...d, cart: has ? d.cart.map((c) => (c.productId === pid ? { ...c, qty: c.qty + n } : c)) : [...d.cart, { productId: pid, qty: n }] };
        }),
      setQty: (pid, qty) =>
        setDraftState((d) => {
          if (qty <= 0) return { ...d, cart: d.cart.filter((c) => c.productId !== pid) };
          const has = d.cart.some((c) => c.productId === pid);
          return { ...d, cart: has ? d.cart.map((c) => (c.productId === pid ? { ...c, qty } : c)) : [...d.cart, { productId: pid, qty }] };
        }),
      clearSale: () => setDraftState((d) => ({ ...EMPTY_DRAFT, mode: d.mode })),
      fresh,
    }),
    [staff, role, logout, go, back, replace, reset, draft, fresh],
  );

  const top = stack[stack.length - 1];
  const key = `${stack.length}:${top.s}:${"id" in top ? top.id ?? "" : ""}`;

  return (
    <PosCtx.Provider value={pos}>
      <ApprovalProvider>
        <div className="relative h-full">
          <Stack k={key} dir={dir}>
            <Screen r={top} />
          </Stack>
        </div>
      </ApprovalProvider>
    </PosCtx.Provider>
  );
}

function Screen({ r }: { r: Route }) {
  switch (r.s) {
    case "home":
      return <Home />;
    case "sell":
      return <Sell />;
    case "cart":
      return <Cart />;
    case "split":
      return <Split />;
    case "pay":
      return <Pay job={r.job} />;
    case "history":
      return <History />;
    case "sale":
      return <SaleDetail id={r.id} />;
    case "refund":
      return <Refund id={r.id} />;
    case "orders":
      return <Orders />;
    case "order":
      return <OrderDetail id={r.id} />;
    case "handover":
      return <Handover id={r.id} />;
    case "stop":
      return <StopDelivery />;
    case "products":
      return <Products />;
    case "product":
      return <ProductForm id={r.id} barcode={r.barcode} />;
  }
}
