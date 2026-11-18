"use client";

/*
 * Merchant portal (BRD 7.1) — macOS/iPadOS маягийн sidebar + toolbar.
 * Багцад ороогүй цэс түгжээтэй харагдана, эрхэд ороогүй цэс нуугдана (7.4).
 */

import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Wordmark } from "@/components/icons";
import { Icon, type IconName } from "@/components/sp/icons";
import { Btn, cx, Switch, toast, Toaster, useConfirm, useTheme } from "@/components/sp/ui";
import { access, lowStock, orderState, PLAN_LABEL } from "@/lib/sp/logic";
import { actorOf, resetDemo, setEbarimt, setOnline, SpGate, useSp } from "@/lib/sp/store";
import type { Module } from "@/lib/sp/types";
import { Ctx, Dialog, Locked, MenuCtx, SECTION_MODULE, type PortalCtx, type Section } from "./kit";
import Login from "./Login";
import Dashboard from "./Dashboard";
import Sales from "./Sales";
import { Categories, Products } from "./Products";
import { DeliverySettingsPage, Orders } from "./Delivery";
import Campaigns from "./Campaigns";
import Wallet from "./Wallet";
import Crm from "./Crm";
import Marketing from "./Marketing";
import Chat, { useChatUnread } from "./Chat";
import Assistant from "./Assistant";

const LEGACY_AI = process.env.NEXT_PUBLIC_AI_LEGACY_ASSISTANT === "on";
import Reports from "./Reports";
import Account from "./Account";

export type Session = { kind: "owner" } | { kind: "staff"; id: string };
const SKEY = "sp-portal-session";

export default function PortalApp() {
  return (
    <SpGate fallback={<div className="min-h-[100dvh] bg-stage" />}>
      <Portal />
      <Toaster bottom={24} />
    </SpGate>
  );
}

function readSession(): Session | null {
  try {
    const raw = sessionStorage.getItem(SKEY);
    return raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    return null;
  }
}

function Portal() {
  const [session, setSession] = useState<Session | null>(() => readSession());
  const login = (s: Session | null) => {
    try {
      if (s) sessionStorage.setItem(SKEY, JSON.stringify(s));
      else sessionStorage.removeItem(SKEY);
    } catch {
      /* хувийн цонх */
    }
    setSession(s);
    if (s) window.location.hash = "dashboard";
  };
  if (!session) return <Login onLogin={login} />;
  return <Shell session={session} onLogout={() => login(null)} />;
}

/* ───────── hash чиглүүлэлт: #section/sub ───────── */

function useRoute(): [Section, string | undefined, (s: Section, sub?: string) => void] {
  const parse = () => {
    const [sec, sub] = window.location.hash.replace(/^#/, "").split("/");
    return [(sec || "dashboard") as Section, sub || undefined] as const;
  };
  const [r, setR] = useState(parse);
  useEffect(() => {
    const h = () => setR(parse());
    window.addEventListener("hashchange", h);
    return () => window.removeEventListener("hashchange", h);
  }, []);
  const go = useCallback((s: Section, sub?: string) => {
    window.location.hash = sub ? `${s}/${sub}` : s;
  }, []);
  return [r[0], r[1], go];
}

type NavItem = { id: Section; label: string; icon: IconName; children?: { id: Section; label: string }[]; badge?: number };

function Shell({ session, onLogout }: { session: Session; onLogout: () => void }) {
  const s = useSp();
  const [section, sub, go] = useRoute();
  const [menu, setMenu] = useState(false);
  const [demo, setDemo] = useState(false);
  const { theme, toggle } = useTheme();
  const { confirm, node } = useConfirm();

  const staff = session.kind === "staff" ? (s.staff.find((x) => x.id === session.id) ?? null) : null;
  const role = staff ? (s.roles.find((r) => r.id === staff.roleId) ?? null) : null;
  const can = useCallback((m: Module) => access(m, s.merchant.plan, role), [s.merchant.plan, role]);

  // Ажилтан идэвхгүй болсон бол гаргана
  useEffect(() => {
    if (session.kind === "staff" && (!staff || !staff.active)) onLogout();
  }, [session, staff, onLogout]);

  const actor = useMemo(() => (staff ? actorOf(staff) : { id: "owner", name: s.merchant.name }), [staff, s.merchant.name]);
  const firstAllowed = (["dashboard", "sales", "products", "orders", "campaigns", "crm", "marketing", "chat", "ai", "reports", "account"] as Section[]).find((x) => can(SECTION_MODULE[x]) !== "hidden" && (x !== "ai" || LEGACY_AI)) ?? "dashboard";
  // Хуучин Gemini туслах — хакатоны үзүүлэнд нуусан (§12); NEXT_PUBLIC_AI_LEGACY_ASSISTANT=on үед л
  const valid = (Object.keys(SECTION_MODULE) as Section[]).includes(section) && (section !== "ai" || LEGACY_AI);
  const current: Section = valid && can(SECTION_MODULE[section]) !== "hidden" ? section : firstAllowed;

  useEffect(() => {
    if (current !== section) go(current);
    setMenu(false);
  }, [current, section, go, sub]);

  const ctx: PortalCtx = { s, role, staff, actor, canManage: !role || role.manage, go, sub, can };

  const chatUnread = useChatUnread(can("chat") === "ok");
  const newOrders = s.orders.filter((o) => orderState(s, o) === "active" && o.statusId === "received").length;
  const nav: NavItem[] = [
    { id: "dashboard", label: "Dashboard", icon: "home" },
    { id: "sales", label: "Касс / Борлуулалт", icon: "receipt" },
    { id: "products", label: "Бараа", icon: "box", children: [{ id: "products", label: "Барааны жагсаалт" }, { id: "categories", label: "Барааны төрөл" }], badge: lowStock(s).length || undefined },
    { id: "orders", label: "Хүргэлт", icon: "truck", children: [{ id: "orders", label: "Захиалга" }, { id: "delivery", label: "Тохиргоо" }], badge: newOrders || undefined },
    { id: "campaigns", label: "Урамшуулал", icon: "tag" },
    { id: "wallet", label: "Wallet pass", icon: "wallet" },
    { id: "crm", label: "Харилцагч", icon: "people" },
    { id: "marketing", label: "Маркетинг", icon: "megaphone" },
    { id: "chat", label: "Facebook чат", icon: "chat", badge: chatUnread || undefined },
    { id: "ai", label: "AI туслах", icon: "sparkle" },
    { id: "reports", label: "Тайлан", icon: "chart" },
  ].filter((n) => n.id !== "ai" || LEGACY_AI) as NavItem[];

  const LOCK_COPY: Partial<Record<Module, { title: string; body: string; icon: IconName }>> = {
    delivery: { title: "Хүргэлт", icon: "truck", body: "Өөрийн захиалгын веб хуудас, хүргэлтийн бүс, төлөв, SMS мэдэгдэл, ачаа буулгах код." },
    campaigns: { title: "Урамшуулал", icon: "tag", body: "Оноо цуглуулах түвшинтэй хөтөлбөр, «2 авбал 1 үнэгүй» мэтийн барааны урамшуулал." },
    wallet: { title: "Wallet pass", icon: "wallet", body: "Харилцагчийн утасны Apple Wallet, Google Wallet-д оноо, түвшин бүхий урамшууллын карт." },
  };

  const mod = SECTION_MODULE[current];
  let body: ReactNode;
  if (can(mod) === "locked" && LOCK_COPY[mod]) body = <Locked module={mod} {...LOCK_COPY[mod]!} />;
  else
    body = {
      dashboard: <Dashboard />,
      sales: <Sales />,
      products: <Products />,
      categories: <Categories />,
      orders: <Orders />,
      delivery: <DeliverySettingsPage />,
      campaigns: <Campaigns />,
      wallet: <Wallet />,
      crm: <Crm />,
      marketing: <Marketing />,
      chat: <Chat />,
      ai: <Assistant />,
      reports: <Reports />,
      account: <Account />,
    }[current];

  const sidebar = (
    <nav className="flex h-full flex-col" aria-label="Үндсэн цэс">
      <div className="px-5 pb-3 pt-5">
        <Wordmark size={16} />
      </div>
      <div className="mx-3 mb-2 rounded-[14px] bg-[var(--sp-fill)] px-3 py-2.5">
        <div className="truncate text-[14px] font-semibold text-ink">{s.merchant.name}</div>
        <div className="mt-0.5 truncate text-[12px] text-mute">
          {s.merchant.kind === "org" ? "Байгууллага" : "Хувь хүн"} · {PLAN_LABEL[s.merchant.plan]}
        </div>
      </div>
      <div className="sp-scroll min-h-0 flex-1 px-3 pb-3">
        <Link href="/ai" className="sp-tap mb-2 flex items-center gap-3 rounded-[12px] bg-accent px-3 py-2.5 text-white">
          <Icon name="sparkle" size={20} />
          <span className="min-w-0 flex-1">
            <span className="block text-[14px] font-semibold">AI ажилтан</span>
            <span className="block truncate text-[11.5px] opacity-85">Тушаал өгөх, харилцагчид хариулах</span>
          </span>
        </Link>
        {nav.map((it) => {
          const st = can(SECTION_MODULE[it.id]);
          if (st === "hidden") return null;
          const kids = it.children ?? [];
          const active = current === it.id || kids.some((k) => k.id === current);
          return (
            <div key={it.id}>
              <button
                type="button"
                onClick={() => go(it.id)}
                aria-current={active && !kids.length ? "page" : undefined}
                className={cx(
                  "sp-tap flex h-10 w-full items-center gap-3 rounded-[10px] px-2.5 text-left text-[14.5px] font-medium",
                  active && !kids.length ? "bg-accent-soft text-accent" : active ? "text-ink" : "text-ink-2 hover:bg-[var(--sp-fill)]",
                )}
              >
                <Icon name={it.icon} size={19} className={active ? "text-accent" : "text-mute"} />
                <span className="min-w-0 flex-1 truncate">{it.label}</span>
                {st === "locked" ? (
                  <span className="flex items-center gap-1 text-[11px] font-semibold text-mute" title="Багц дээшлүүлэхэд нээгдэнэ">
                    <Icon name="lock" size={12} stroke={2.2} />
                    {PLAN_LABEL[SECTION_MODULE[it.id] === "wallet" ? "premium" : "plus"]}
                  </span>
                ) : it.badge ? (
                  <span className="grid h-5 min-w-5 place-items-center rounded-full bg-accent px-1.5 text-[11px] font-bold text-white tnum">{it.badge}</span>
                ) : null}
              </button>
              {kids.length > 0 && st === "ok" && active && (
                <div className="mb-1 ml-[30px] mt-0.5">
                  {kids.map((k) => (
                    <button
                      key={k.id}
                      type="button"
                      onClick={() => go(k.id)}
                      aria-current={current === k.id ? "page" : undefined}
                      className={cx("sp-tap flex h-9 w-full items-center rounded-[9px] px-2.5 text-left text-[14px]", current === k.id ? "bg-accent-soft font-semibold text-accent" : "text-ink-2 hover:bg-[var(--sp-fill)]")}
                    >
                      {k.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div className="flex flex-wrap items-center gap-1 border-t border-[var(--sp-sep)] px-3 py-3">
        {can("account") !== "hidden" ? (
          <button
            type="button"
            onClick={() => go("account")}
            aria-label="Миний бүртгэл"
            title="Миний бүртгэл"
            className={cx("sp-tap mb-1 flex w-full min-w-0 items-center gap-2.5 rounded-[10px] px-2 py-1.5 text-left", current === "account" ? "bg-accent-soft" : "hover:bg-[var(--sp-fill)]")}
          >
            <span className={cx("grid size-8 shrink-0 place-items-center rounded-full", current === "account" ? "bg-accent text-white" : "bg-[var(--sp-fill)] text-ink")}>
              <Icon name="person" size={17} />
            </span>
            <span className="min-w-0">
              <span className="block truncate text-[13px] font-semibold text-ink">{staff ? `${staff.last.slice(0, 1)}.${staff.first}` : "Миний бүртгэл"}</span>
              <span className="block truncate text-[11px] text-mute">{staff ? role?.name : s.merchant.regNo}</span>
            </span>
          </button>
        ) : (
          <span className="mb-1 w-full min-w-0 truncate px-2 text-[13px] font-semibold text-ink">
            {staff && `${staff.last.slice(0, 1)}.${staff.first}`}
            <span className="block text-[11px] font-normal text-mute">{role?.name}</span>
          </span>
        )}
        <button type="button" onClick={() => setDemo(true)} className="sp-tap mr-auto flex h-8 items-center gap-1.5 rounded-full px-2 text-[12px] font-medium text-mute hover:bg-[var(--sp-fill)] hover:text-ink">
          <Icon name="gear" size={15} /> Туршилт
        </button>
        <FootBtn icon={theme === "dark" ? "sun" : "moon"} label="Сэдэв солих" onClick={toggle} />
        <FootBtn
          icon="logout"
          label="Гарах"
          onClick={() => confirm({ title: "Порталаас гарах уу?", ok: "Гарах", run: onLogout })}
        />
      </div>
    </nav>
  );

  return (
    <Ctx.Provider value={ctx}>
      <MenuCtx.Provider value={() => setMenu(true)}>
        <div className="flex h-[100dvh] bg-stage">
          <aside className="sp-material hidden w-[264px] shrink-0 border-r border-[var(--sp-sep)] lg:block">{sidebar}</aside>
          <AnimatePresence>
            {menu && (
              <div className="fixed inset-0 z-40 lg:hidden">
                <motion.button type="button" aria-label="Цэс хаах" className="absolute inset-0 bg-black/30" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setMenu(false)} />
                <motion.aside
                  className="sp-material-paper absolute inset-y-0 left-0 w-[288px] max-w-[85vw] shadow-[20px_0_60px_-20px_rgb(0_0_0/0.4)]"
                  initial={{ x: "-100%" }}
                  animate={{ x: 0 }}
                  exit={{ x: "-100%" }}
                  transition={{ type: "spring", stiffness: 480, damping: 44 }}
                >
                  {sidebar}
                </motion.aside>
              </div>
            )}
          </AnimatePresence>
          <main className="sp-scroll min-w-0 flex-1 overflow-y-auto" key={current + (sub ?? "")}>
            {body}
          </main>
        </div>
        {node}
        <DemoDialog open={demo} onClose={() => setDemo(false)} />
      </MenuCtx.Provider>
    </Ctx.Provider>
  );
}

function FootBtn({ icon, label, onClick }: { icon: IconName; label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} aria-label={label} title={label} className="sp-tap grid size-8 shrink-0 place-items-center rounded-full text-mute hover:bg-[var(--sp-fill)] hover:text-ink">
      <Icon name={icon} size={18} />
    </button>
  );
}

function DemoDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const s = useSp();
  const { confirm, node } = useConfirm();
  return (
    <Dialog open={open} onClose={onClose} title="Туршилт" width={420}>
      <p className="mb-4 text-[14px] leading-snug text-mute">Зөвхөн туршилтын горимд. Бүх нээлттэй цонх (пос, апп, захиалгын хуудас) нэг өгөгдлийг хуваалцана.</p>
      <div className="overflow-hidden rounded-[14px] bg-paper [&>*+*]:border-t [&>*+*]:border-[var(--sp-sep)]">
        <div className="flex min-h-[52px] items-center justify-between gap-3 px-4">
          <span className="text-[15px] text-ink">Сүлжээ холбогдсон</span>
          <Switch label="Сүлжээ" checked={s.online} onChange={setOnline} />
        </div>
        <div className="flex min-h-[52px] items-center justify-between gap-3 px-4">
          <span className="text-[15px] text-ink">Ebarimt холбогдсон</span>
          <Switch label="Ebarimt" checked={s.ebarimt} onChange={(v) => setEbarimt({ id: "owner", name: s.merchant.name }, v)} />
        </div>
        <a href="/shop" target="_blank" rel="noreferrer" className="sp-row flex min-h-[52px] items-center justify-between px-4 text-[15px] text-accent">
          Захиалгын хуудас нээх <Icon name="link" size={18} />
        </a>
      </div>
      <Btn
        className="mt-4"
        block
        size="md"
        variant="dangerTinted"
        icon="undo"
        onClick={() =>
          confirm({
            title: "Демо өгөгдлийг эхлүүлэх үү?",
            message: "Бүх өөрчлөлт устаж, анхны жишээ өгөгдөл сэргэнэ.",
            ok: "Эхлүүлэх",
            destructive: true,
            run: () => {
              resetDemo();
              toast("Демо өгөгдөл шинэчлэгдлээ", "ok");
              onClose();
            },
          })
        }
      >
        Демо өгөгдлийг эхлүүлэх
      </Btn>
      {node}
    </Dialog>
  );
}
