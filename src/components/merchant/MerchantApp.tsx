"use client";

/*
 * Мерчантын гар утасны апп (BRD 7.2). Порталыг бүхэлд нь давтахгүй —
 * хөдөлгөөнт үйлдлүүд л: нүүр, хүргэлт, харилцагч, маркетинг, бусад.
 */

import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { access, money, orderState } from "@/lib/sp/logic";
import { SpGate, useSp } from "@/lib/sp/store";
import type { Module, Order } from "@/lib/sp/types";
import { DeviceFrame, Stack, TabBar, tap, Toaster } from "@/components/sp/ui";
import { Icon } from "@/components/sp/icons";
import { MCtx, sessionInfo, type Ctx, type Route, type Session, type SmsDraft, type Tab } from "./core";
import { Login } from "./Login";
import { Home } from "./Home";
import { OrderDetail, OrderList } from "./Orders";
import { AddCustomerSheet, CustomerDetail, CustomerList } from "./Crm";
import { Marketing } from "./Marketing";
import { Account, More, Plans, Reports, StaffList } from "./More";
import { CampaignDetail, CampaignEditor, CampaignList } from "./Campaigns";
import { Notices, Products, WalletPassScreen } from "./Catalog";

const KEY = "gp-merchant-session";
const TABS: { id: Tab; label: string; icon: string; mod: Module | null }[] = [
  { id: "home", label: "Нүүр", icon: "home", mod: "dashboard" },
  { id: "delivery", label: "Хүргэлт", icon: "truck", mod: "delivery" },
  { id: "campaigns", label: "Урамшуулал", icon: "gift", mod: "campaigns" },
  { id: "crm", label: "Харилцагч", icon: "people", mod: "crm" },
  { id: "more", label: "Бусад", icon: "dots", mod: null },
];

export default function MerchantApp() {
  return (
    <SpGate fallback={<div className="h-[100dvh] bg-stage" />}>
      <DeviceFrame w={390} h={844}>
        <Shell />
      </DeviceFrame>
    </SpGate>
  );
}

function readSession(): Session | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    return null;
  }
}

function Shell() {
  const s = useSp();
  const [session, setSession] = useState<Session | null>(() => readSession());
  const login = useCallback((x: Session) => {
    try {
      sessionStorage.setItem(KEY, JSON.stringify(x));
    } catch {
      /* хувийн цонх */
    }
    setSession(x);
  }, []);
  const logout = useCallback(() => {
    try {
      sessionStorage.removeItem(KEY);
    } catch {
      /* */
    }
    setSession(null);
  }, []);

  // Push шилжилтийн үеэр хөтөч фокусыг харуулах гэж хүрээг хажуу тийш гүйлгэхээс сэргийлнэ
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = root.current?.closest(".sp-device");
    if (!el) return;
    const fix = () => (el.scrollLeft || el.scrollTop) && el.scrollTo(0, 0);
    el.addEventListener("scroll", fix);
    return () => el.removeEventListener("scroll", fix);
  }, []);

  // Ажилтан идэвхгүй болсон бол гаргана
  const valid = session && (session.kind === "owner" || s.staff.some((x) => x.id === session.staffId && x.active));

  return (
    <div ref={root} className="flex h-full flex-col overflow-clip bg-stage">
      <div className="h-9 shrink-0" aria-hidden="true" />
      {session && valid ? (
        <App session={session} logout={logout} />
      ) : (
        <div className="relative min-h-0 flex-1">
          <Login onLogin={login} />
        </div>
      )}
      {session ? (
        /* Мэдэгдэл дээд талд — доод товч, sheet-ийг халхлахгүй */
        <div className="pointer-events-none absolute inset-x-0 top-10 z-[70] h-16 [transform:translateZ(0)]">
          <Toaster bottom={0} />
        </div>
      ) : (
        <Toaster bottom={32} />
      )}
    </div>
  );
}

function App({ session, logout }: { session: Session; logout: () => void }) {
  const s = useSp();
  const info = sessionInfo(s, session);
  const can = (mod: Module) => access(mod, s.merchant.plan, info.role);
  const tabs = TABS.filter((t) => !t.mod || can(t.mod) !== "hidden");
  const [tab, setTab] = useState<Tab>(tabs[0].id);
  const [stacks, setStacks] = useState<Record<Tab, Route[]>>({ home: [], delivery: [], campaigns: [], crm: [], more: [] });
  const [dir, setDir] = useState<1 | -1>(1);
  const [draft, setDraft] = useState<SmsDraft>({ minSpend: 50000, minOrders: 2, text: "" });
  const [addOpen, setAddOpen] = useState(false);

  const [banner, setBanner] = useState<Order | null>(null);
  const cur = tabs.some((t) => t.id === tab) ? tab : tabs[0].id;
  const stack = stacks[cur];
  const top = stack[stack.length - 1];

  const push = (r: Route) => {
    setBanner(null);
    setDir(1);
    setStacks((x) => ({ ...x, [cur]: [...x[cur], r] }));
  };
  const pop = () => {
    setDir(-1);
    setStacks((x) => ({ ...x, [cur]: x[cur].slice(0, -1) }));
  };
  const goTab = (t: Tab, r?: Route) => {
    setBanner(null);
    setDir(1);
    setTab(t);
    setStacks((x) => ({ ...x, [t]: r ? [r] : [] }));
  };

  const ctx: Ctx = {
    session,
    ...info,
    can,
    push,
    pop,
    goTab,
    logout,
    draft,
    setDraft,
    openAddCustomer: () => setAddOpen(true),
  };

  // BR09-10: шинэ захиалга ирэхэд push мэдэгдэл
  const prevLen = useRef(s.orders.length);
  useEffect(() => {
    const n = s.orders.length;
    if (n > prevLen.current && access("delivery", s.merchant.plan, info.role) === "ok") {
      const o = s.orders[0];
      setBanner(o);
      tap(30);
      const t = setTimeout(() => setBanner(null), 6000);
      prevLen.current = n;
      return () => clearTimeout(t);
    }
    prevLen.current = n;
  }, [s.orders, s.merchant.plan, info.role]);

  const fresh = s.orders.filter((o) => orderState(s, o) === "active" && o.statusId === s.delivery.statuses[0]?.id).length;

  const screen = (() => {
    if (!top) {
      if (cur === "home") return <Home />;
      if (cur === "delivery") return <OrderList />;
      if (cur === "crm") return <CustomerList />;
      if (cur === "campaigns") return <CampaignList />;
      return <More />;
    }
    switch (top.k) {
      case "order":
        return <OrderDetail id={top.id!} />;
      case "customer":
        return <CustomerDetail id={top.id!} />;
      case "marketing":
        return <Marketing />;
      case "campaign":
        return <CampaignDetail id={top.id!} />;
      case "campEdit":
        return <CampaignEditor id={top.id!} />;
      case "products":
        return <Products />;
      case "wallet":
        return <WalletPassScreen />;
      case "notices":
        return <Notices />;
      case "reports":
        return <Reports />;
      case "account":
        return <Account />;
      case "plans":
        return <Plans />;
      case "staff":
        return <StaffList />;
      default:
        return <More />;
    }
  })();

  return (
    <MCtx.Provider value={ctx}>
      <div className="relative min-h-0 flex-1 overflow-clip">
        <Stack k={`${cur}/${stack.map((r) => r.k + (r.id ?? "")).join("/")}`} dir={dir}>
          {screen}
        </Stack>
      </div>
      <TabBar
        value={cur}
        onChange={(t) => {
          if (t === cur) goTab(t);
          else {
            setDir(1);
            setTab(t);
          }
        }}
        items={tabs.map((t) => ({
          id: t.id,
          label: t.label,
          icon: t.icon,
          badge: t.id === "delivery" && can("delivery") === "ok" ? fresh : undefined,
          locked: !!t.mod && can(t.mod) === "locked",
        }))}
      />

      <AnimatePresence>
        {banner && (
          <motion.button
            type="button"
            initial={{ y: -90, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -90, opacity: 0 }}
            transition={{ type: "spring", stiffness: 420, damping: 36 }}
            onClick={() => {
              goTab("delivery", { k: "order", id: banner.id });
              setBanner(null);
            }}
            className="sp-material-paper absolute inset-x-2 top-2 z-[65] flex items-center gap-3 rounded-[20px] p-3 text-left shadow-[0_16px_40px_-14px_rgb(0_0_0/0.45)]"
            role="status"
          >
            <span className="grid size-10 shrink-0 place-items-center rounded-[11px] bg-accent text-white">
              <Icon name="truck" size={22} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex justify-between text-[15px] font-semibold text-ink">
                Шинэ захиалга #{banner.no}
                <span className="text-[12px] font-normal text-mute">дөнгөж сая</span>
              </span>
              <span className="block truncate text-[14px] text-ink-2">
                {banner.name} · {money(banner.total)}
                {banner.payLater ? " · Дараа төлөх" : " · Төлөгдсөн"}
              </span>
            </span>
          </motion.button>
        )}
      </AnimatePresence>

      <AddCustomerSheet
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onCreated={(id) => {
          setAddOpen(false);
          goTab("crm", { k: "customer", id });
        }}
      />
    </MCtx.Provider>
  );
}
