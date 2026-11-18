"use client";

/*
 * Gerege AI ажилтан — захирлын самбар (/ai).
 * Захирал энгийн үгээр тушаал өгнө → AI ПОС, CRM, сувгууд дээр бодитоор гүйцэтгэнэ.
 * Бүх өгөгдөл /api/agent/* (SQLite) ба Store Plus-ын серверийн төлвөөс шууд ирнэ.
 */
import Link from "next/link";
import { useEffect, useState } from "react";
import { Icon, type IconName } from "@/components/sp/icons";
import { cx, Toaster, useTheme } from "@/components/sp/ui";
import { resyncSp, SpGate, stopSp, useSp, useSyncStatus } from "@/lib/sp/store";
import { Billing } from "./Billing";
import { AUTH_EVENT, useLive } from "./client";
import { Command } from "./Command";
import { Contacts } from "./Contacts";
import { Inbox } from "./Inbox";
import { Inventory } from "./Inventory";
import { Knowledge } from "./Knowledge";
import { Login, type Me } from "./Login";
import { Privacy } from "./Privacy";
import { Settings } from "./Settings";
import { Tickets } from "./Tickets";
import { UsageMini } from "./Usage";

export type Section = "command" | "inbox" | "contacts" | "tickets" | "knowledge" | "inventory" | "billing" | "privacy" | "settings";
export type Stats = {
  ai: boolean;
  synced: boolean;
  wallet: { credits: number; plan: string | null; expires_at: number | null };
  openTickets: number;
  complaints: number;
  humanQueue: number;
  pending: number;
  contacts: number;
  kbDocs: number;
  today: { conversations: { channel: string; n: number }[]; aiReplies: number; actions: number; newContacts: number; sales: { total: string; count: number } | null };
  lowStock: { name: string; stock: number }[];
  recentActions: { tool: string; summary: string; status: string; actor: string; at: number }[];
};

const NAV: { id: Section; label: string; icon: IconName; hint: string }[] = [
  { id: "command", label: "Тушаал", icon: "sparkle", hint: "AI-д ажил өгөх" },
  { id: "inbox", label: "Харилцаа", icon: "chat", hint: "Messenger, вэб чат, дуудлага" },
  { id: "tickets", label: "Хүсэлт, гомдол", icon: "bell", hint: "Шийдвэрлэх ажил" },
  { id: "contacts", label: "Харилцагчид", icon: "people", hint: "AI-ийн цуглуулсан карт" },
  { id: "knowledge", label: "Мэдлэгийн сан", icon: "file", hint: "AI юуг мэдэх вэ" },
  { id: "inventory", label: "Тооллого", icon: "box", hint: "Утсаар тоолох, батлах" },
  { id: "billing", label: "Багц, төлбөр", icon: "wallet", hint: "QPay-ээр урьдчилж" },
  { id: "privacy", label: "Өгөгдөл ба нууцлал", icon: "lock", hint: "Хадгалалт, хандалтын түүх" },
  { id: "settings", label: "Тохиргоо", icon: "gear", hint: "Сувгууд, MCP" },
];

const Loading = () => <div className="grid h-dvh place-items-center bg-stage text-mute">Ачаалж байна…</div>;

export default function AiApp() {
  return (
    <SpGate fallback={<Loading />}>
      <Gate />
    </SpGate>
  );
}

/** Нэвтрэлт: серверийн session (cookie) байхгүй бол нэвтрэх дэлгэц */
function Gate() {
  const [me, setMe] = useState<Me | null | undefined>(undefined);
  const load = async () => {
    try {
      const j = (await fetch("/api/auth/me", { cache: "no-store" }).then((r) => r.json())) as Me | { authenticated: false };
      setMe(j.authenticated ? j : null);
    } catch {
      setMe(null);
    }
  };
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- серверээс нэвтрэлт шалгах (гадаад систем)
    void load();
    const off = () => setMe(null);
    window.addEventListener(AUTH_EVENT, off);
    return () => window.removeEventListener(AUTH_EVENT, off);
  }, []);
  if (me === undefined) return <Loading />;
  if (!me)
    return (
      <Login
        onDone={() => {
          void resyncSp();
          void load();
        }}
      />
    );
  return (
    <Shell
      me={me}
      onLogout={async () => {
        await fetch("/api/auth/logout", { method: "POST" }).catch(() => null);
        stopSp();
        setMe(null);
      }}
    />
  );
}

const ROLE_LABEL: Record<string, string> = { owner: "Эзэмшигч", manager: "Менежер", staff: "Ажилтан", device: "Төхөөрөмж" };

function Shell({ me, onLogout }: { me: Me; onLogout: () => void }) {
  useTheme();
  const s = useSp();
  const sync = useSyncStatus();
  const [sec, setSec] = useState<Section>("command");
  const [menu, setMenu] = useState(false);
  const { data: st } = useLive<Stats>("/api/agent/stats");
  useEffect(() => {
    const h = () => {
      const v = location.hash.slice(1) as Section;
      if (NAV.some((n) => n.id === v)) setSec(v);
    };
    h();
    window.addEventListener("hashchange", h);
    return () => window.removeEventListener("hashchange", h);
  }, []);
  const go = (v: Section) => {
    window.history.replaceState(null, "", `#${v}`);
    setSec(v);
    setMenu(false);
  };
  const badge: Partial<Record<Section, number>> = { inbox: st?.humanQueue, tickets: st?.openTickets, command: st?.pending };
  const credits = st?.wallet.credits ?? 0;

  const nav = (
    <nav className="flex h-full flex-col gap-1 p-3" aria-label="AI ажилтны цэс">
      <div className="mb-3 flex items-center gap-3 px-2 pt-2">
        <div className="grid size-10 place-items-center rounded-[12px] bg-accent text-white">
          <Icon name="sparkle" size={22} />
        </div>
        <div className="min-w-0">
          <div className="truncate text-[15px] font-bold text-ink">AI ажилтан</div>
          <div className="truncate text-[12px] text-mute">{me.tenant.name || s.delivery.page.name}</div>
        </div>
      </div>
      {NAV.map((n) => (
        <button
          key={n.id}
          type="button"
          onClick={() => go(n.id)}
          className={cx("sp-tap flex items-center gap-3 rounded-[12px] px-3 py-2.5 text-left", sec === n.id ? "bg-accent-soft text-accent" : "text-ink hover:bg-[var(--sp-fill)]")}
        >
          <Icon name={n.icon} size={20} />
          <span className="min-w-0 flex-1">
            <span className="block text-[14.5px] font-semibold">{n.label}</span>
            <span className={cx("block truncate text-[12px]", sec === n.id ? "text-accent/80" : "text-mute")}>{n.hint}</span>
          </span>
          {!!badge[n.id] && <span className="grid h-5 min-w-5 place-items-center rounded-full bg-accent px-1.5 text-[11px] font-bold text-white">{badge[n.id]}</span>}
        </button>
      ))}
      <div className="mt-auto space-y-2 px-1 pb-1">
        {me.user.role === "owner" || me.user.role === "manager" ? (
          <UsageMini onClick={() => go("billing")} />
        ) : (
          <button type="button" onClick={() => go("billing")} className="sp-tap w-full rounded-[14px] bg-paper p-3 text-left shadow-[0_0_0_0.5px_var(--sp-sep)]">
            <div className="text-[12px] text-mute">Үлдэгдэл кредит</div>
            <div className={cx("text-[22px] font-bold tnum", credits > 0 ? "text-ink" : "text-danger")}>{credits.toLocaleString("en-US")}</div>
            <div className="text-[12px] text-mute">{credits > 0 ? "≈ " + credits + " чат хариулт" : "Багц аваагүй — AI зогссон"}</div>
          </button>
        )}
        <div className="flex items-center gap-2 px-2 text-[12px] text-mute">
          <span className={cx("size-2 rounded-full", st?.ai ? "bg-ok" : "bg-danger")} />
          {st?.ai ? "Qwen · Alibaba Model Studio" : "Model Studio түлхүүр алга"}
        </div>
        <div className="flex items-center gap-2 px-2 text-[12px] text-mute">
          <span className={cx("size-2 rounded-full", sync === "synced" ? "bg-ok" : sync === "offline" || sync === "signedout" ? "bg-danger" : "bg-warn")} />
          ПОС-той {sync === "synced" ? "синк хийгдсэн" : sync === "offline" || sync === "signedout" ? "холбогдоогүй" : "синк хийж байна"}
        </div>
        <div className="flex items-center gap-2 rounded-[12px] px-2 pt-1">
          <div className="min-w-0 flex-1">
            <div className="truncate text-[13px] font-semibold text-ink">{me.user.name}</div>
            <div className="truncate text-[12px] text-mute">{ROLE_LABEL[me.user.role] ?? me.user.role}</div>
          </div>
          <button type="button" onClick={onLogout} className="sp-tap flex items-center gap-1 rounded-full px-2.5 py-1.5 text-[12.5px] font-semibold text-danger hover:bg-danger-soft">
            <Icon name="logout" size={16} /> Гарах
          </button>
        </div>
        <div className="flex gap-3 px-2 pt-1 text-[12px]">
          <Link className="text-accent" href="/portal">Портал</Link>
          <Link className="text-accent" href="/">ПОС</Link>
        </div>
      </div>
    </nav>
  );

  return (
    <div className="flex h-dvh bg-stage text-ink">
      <aside className="hidden w-[264px] shrink-0 border-r border-[var(--sp-sep)] bg-stage lg:block">{nav}</aside>
      {menu && (
        <div className="fixed inset-0 z-40 lg:hidden" onClick={() => setMenu(false)}>
          <div className="absolute inset-0 bg-black/30" />
          <aside className="absolute inset-y-0 left-0 w-[280px] bg-stage" onClick={(e) => e.stopPropagation()}>
            {nav}
          </aside>
        </div>
      )}
      <main className="sp-scroll min-w-0 flex-1 overflow-y-auto">
        <div className="sticky top-0 z-20 flex items-center gap-2 border-b border-[var(--sp-sep)] bg-stage/90 px-3 py-2 backdrop-blur lg:hidden">
          <button type="button" aria-label="Цэс" onClick={() => setMenu(true)} className="sp-tap grid size-10 place-items-center rounded-full">
            <Icon name="list" size={22} />
          </button>
          <div className="text-[15px] font-semibold">{NAV.find((n) => n.id === sec)?.label}</div>
        </div>
        {st && credits <= 0 && sec !== "billing" && (
          <div className="mx-4 mt-4 flex flex-wrap items-center gap-3 rounded-[16px] bg-danger-soft px-4 py-3 text-[14px] text-danger md:mx-8">
            <Icon name="warn" size={20} />
            <span className="min-w-0 flex-1">AI ажилтан ажиллахын тулд эхлээд багц аваарай. Төлбөр урьдчилж, QPay-ээр.</span>
            <button type="button" onClick={() => go("billing")} className="sp-tap rounded-full bg-danger px-4 py-1.5 font-semibold text-white">
              Багц авах
            </button>
          </div>
        )}
        {sec === "command" && <Command stats={st} go={go} />}
        {sec === "inbox" && <Inbox />}
        {sec === "tickets" && <Tickets />}
        {sec === "contacts" && <Contacts />}
        {sec === "knowledge" && <Knowledge />}
        {sec === "inventory" && <Inventory />}
        {sec === "billing" && <Billing />}
        {sec === "privacy" && <Privacy role={me.user.role} head={<Head title="Өгөгдөл ба нууцлал" sub="Таны өгөгдөл хаана, хэр удаан хадгалагдах, хэн хандсан" />} />}
        {sec === "settings" && <Settings />}
      </main>
      <Toaster bottom={24} />
    </div>
  );
}

export function Head({ title, sub, actions }: { title: string; sub?: string; actions?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-end gap-3 px-4 pb-4 pt-6 md:px-8">
      <div className="min-w-0 flex-1">
        <h1 className="text-[26px] font-bold tracking-[-0.02em] text-ink">{title}</h1>
        {sub && <p className="mt-0.5 text-[14px] text-mute">{sub}</p>}
      </div>
      {actions}
    </div>
  );
}
