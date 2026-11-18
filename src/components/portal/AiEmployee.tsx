"use client";

/*
 * Merchant portal доторх «AI ажилтан» — /ai-ийн бүх хэсгийг порталаас гаралгүй ашиглана.
 * AI-ийн API серверийн session (HttpOnly cookie gp_s)-оор ажилладаг. Порталын eID демо нэвтрэлт
 * session ҮҮСГЭДЭГГҮЙ тул session байхгүй (эсвэл өөр дэлгүүрийнх) бол энд PIN-ээр нэвтрүүлнэ —
 * клиент талаас автоматаар session үүсгэхгүй (аюулгүй байдал). Нэвтэрсний дараа Store Plus-ын
 * серверийн синк мөн нээгдэнэ.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Head, type Stats } from "@/components/ai/AiApp";
import { Billing } from "@/components/ai/Billing";
import { AUTH_EVENT, useLive } from "@/components/ai/client";
import { Command } from "@/components/ai/Command";
import { Contacts } from "@/components/ai/Contacts";
import { EmbedCtx, type Embed } from "@/components/ai/embed";
import { Inbox } from "@/components/ai/Inbox";
import { Inventory } from "@/components/ai/Inventory";
import { Knowledge } from "@/components/ai/Knowledge";
import { Login, type Me } from "@/components/ai/Login";
import { Privacy } from "@/components/ai/Privacy";
import { Settings } from "@/components/ai/Settings";
import { Tickets } from "@/components/ai/Tickets";
import { Icon, type IconName } from "@/components/sp/icons";
import { cx } from "@/components/sp/ui";
import { resyncSp, useSyncStatus } from "@/lib/sp/store";
import { PageHeader, type Section } from "./kit";

export type AiSec = "command" | "inbox" | "tickets" | "contacts" | "knowledge" | "inventory" | "billing" | "privacy" | "settings";

export const AI_NAV: {
  id: Section;
  sec: AiSec;
  label: string;
  icon: IconName;
  hint: string;
}[] = [
  {
    id: "ai-command",
    sec: "command",
    label: "Тушаал",
    icon: "sparkle",
    hint: "AI-д ажил өгөх — ПОС, харилцагч, урамшуулал, мэдлэгийн сан дээр өөрөө гүйцэтгэнэ.",
  },
  {
    id: "ai-inbox",
    sec: "inbox",
    label: "Харилцаа",
    icon: "chat",
    hint: "Messenger, вэб чат, дуудлага",
  },
  {
    id: "ai-tickets",
    sec: "tickets",
    label: "Хүсэлт, гомдол",
    icon: "bell",
    hint: "Шийдвэрлэх ажил",
  },
  {
    id: "ai-contacts",
    sec: "contacts",
    label: "Харилцагчид",
    icon: "people",
    hint: "AI-ийн цуглуулсан карт",
  },
  {
    id: "ai-knowledge",
    sec: "knowledge",
    label: "Мэдлэгийн сан",
    icon: "file",
    hint: "AI юуг мэдэх вэ",
  },
  {
    id: "ai-inventory",
    sec: "inventory",
    label: "Тооллого",
    icon: "box",
    hint: "Утсаар тоолох, батлах",
  },
  {
    id: "ai-billing",
    sec: "billing",
    label: "Багц, төлбөр",
    icon: "wallet",
    hint: "QPay-ээр урьдчилж",
  },
  {
    id: "ai-privacy",
    sec: "privacy",
    label: "Өгөгдөл ба нууцлал",
    icon: "lock",
    hint: "Таны өгөгдөл хаана, хэр удаан хадгалагдах, хэн хандсан",
  },
  {
    id: "ai-settings",
    sec: "settings",
    label: "Тохиргоо",
    icon: "gear",
    hint: "Сувгууд, MCP",
  },
];

export const aiSecOf = (s: Section) => AI_NAV.find((n) => n.id === s)?.sec ?? null;

/** Кредит энэ хэмжээнээс бага бол цэсэнд анхааруулга тэмдэг */
const LOW_CREDITS = 50;

/* ───────── серверийн session ───────── */

export type AiAuth = { me: Me | null | undefined; reload: () => Promise<void> };

/** /api/auth/me — нэвтрээгүй үед 200 { authenticated:false } тул хөтчийн консолд алдаа гарахгүй */
export function useAiAuth(enabled: boolean): AiAuth {
  const [me, setMe] = useState<Me | null | undefined>(undefined);
  const reload = useCallback(async () => {
    try {
      const j = (await fetch("/api/auth/me", { cache: "no-store" }).then((r) => r.json())) as Me | { authenticated: false };
      setMe(j.authenticated ? j : null);
    } catch {
      setMe(null);
    }
  }, []);
  useEffect(() => {
    if (!enabled) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- серверээс нэвтрэлт шалгах (гадаад систем)
    void reload();
    const off = () => setMe(null);
    window.addEventListener(AUTH_EVENT, off);
    return () => window.removeEventListener(AUTH_EVENT, off);
  }, [enabled, reload]);
  return { me, reload };
}

/** Session-ийн дэлгүүр порталын дэлгүүртэй таарч байгаа эсэх */
export const aiReady = (me: Me | null | undefined, regNo: string): boolean => !!me && me.tenant.id.toUpperCase() === regNo.trim().toUpperCase();

/** /api/agent/stats — зөвхөн нэвтэрсэн үед mount хийнэ (эс бөгөөс 401, SSE алдаа) */
export function AiStatsSource({ onData }: { onData: (s: Stats | null) => void }) {
  const { data } = useLive<Stats>("/api/agent/stats");
  useEffect(() => {
    onData(data);
  }, [data, onData]);
  useEffect(() => () => onData(null), [onData]);
  return null;
}

/** Цэсний badge: Харилцаа = ажилтны дараалал, Хүсэлт = нээлттэй, Багц = кредит бага */
export function aiBadge(sec: AiSec, st: Stats | null): { n: number | string; tone: "accent" | "danger" } | null {
  if (!st) return null;
  if (sec === "inbox" && st.humanQueue) return { n: st.humanQueue, tone: "accent" };
  if (sec === "tickets" && st.openTickets) return { n: st.openTickets, tone: "accent" };
  if (sec === "command" && st.pending) return { n: st.pending, tone: "accent" };
  if (sec === "billing" && st.wallet.credits < LOW_CREDITS)
    return {
      n: st.wallet.credits <= 0 ? "!" : st.wallet.credits,
      tone: "danger",
    };
  return null;
}

/* ───────── цэсний дээд хэсгийн товч төлөв ───────── */

export function AiStatus({ me, st, ready, onBilling, onLogin }: { me: Me | null | undefined; st: Stats | null; ready: boolean; onBilling: () => void; onLogin: () => void }) {
  const sync = useSyncStatus();
  if (me === undefined) return null;
  if (!ready)
    return (
      <button type="button" onClick={onLogin} className="sp-tap mb-1 flex w-full items-center gap-2 rounded-[10px] px-2.5 py-2 text-left text-[12px] text-mute hover:bg-[var(--sp-fill)]">
        <span className="size-2 shrink-0 rounded-full bg-warn" />
        <span className="min-w-0 flex-1 truncate">Серверт нэвтрээгүй — PIN оруулна</span>
      </button>
    );
  const credits = st?.wallet.credits ?? 0;
  return (
    <button type="button" onClick={onBilling} aria-label="Үлдэгдэл кредит — Багц, төлбөр" className="sp-tap mb-1 w-full rounded-[12px] bg-paper px-3 py-2 text-left shadow-[0_0_0_0.5px_var(--sp-sep)]">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[12px] text-mute">Үлдэгдэл кредит</span>
        <span className={cx("text-[15px] font-bold tnum", !st ? "text-mute" : credits > 0 ? (credits < LOW_CREDITS ? "text-warn" : "text-ink") : "text-danger")}>{st ? credits.toLocaleString("en-US") : "…"}</span>
      </div>
      <div className="mt-1 flex items-center gap-3 text-[11.5px] text-mute">
        <span className="flex min-w-0 items-center gap-1.5 truncate">
          <span className={cx("size-1.5 shrink-0 rounded-full", st?.ai ? "bg-ok" : "bg-danger")} />
          {st?.ai ? "AI ажиллаж байна" : "AI түлхүүр алга"}
        </span>
        <span className="flex min-w-0 items-center gap-1.5 truncate">
          <span className={cx("size-1.5 shrink-0 rounded-full", sync === "synced" ? "bg-ok" : sync === "offline" || sync === "signedout" ? "bg-danger" : "bg-warn")} />
          {sync === "synced" ? "Синк" : sync === "offline" || sync === "signedout" ? "Синкгүй" : "Синк…"}
        </span>
      </div>
    </button>
  );
}

/* ───────── агуулга ───────── */

export function AiSectionView({ sec, auth, stats, regNo, go }: { sec: AiSec; auth: AiAuth; stats: Stats | null; regNo: string; go: (s: Section) => void }) {
  const item = AI_NAV.find((n) => n.sec === sec)!;
  const { me } = auth;
  const ready = aiReady(me, regNo);
  const noCredit = ready && !!stats && stats.wallet.credits <= 0 && sec !== "billing";
  // AI-ийн хэсгүүдийн Head → порталын sticky толгой (давхар гарчиггүй); кредит дууссан анхааруулга толгойн доор
  const embed = useMemo<Embed>(
    () => ({
      head: (p) => (
        <>
          <PageHeader title={p.title} sub={p.sub} actions={p.actions} />
          {noCredit ? (
            <div className="mx-4 my-4 flex flex-wrap items-center gap-3 rounded-[16px] bg-danger-soft px-4 py-3 text-[14px] text-danger md:mx-8">
              <Icon name="warn" size={20} />
              <span className="min-w-0 flex-1">AI ажилтан ажиллахын тулд эхлээд багц аваарай. Төлбөр урьдчилж, QPay-ээр.</span>
              <button type="button" onClick={() => go("ai-billing")} className="sp-tap rounded-full bg-danger px-4 py-1.5 font-semibold text-white">
                Багц авах
              </button>
            </div>
          ) : (
            <div aria-hidden className="h-5" />
          )}
        </>
      ),
    }),
    [noCredit, go],
  );

  let body: React.ReactNode;
  if (me === undefined) body = <Head title={item.label} sub="Ачаалж байна…" />;
  else if (!ready)
    body = (
      <>
        <Head title={item.label} sub={item.hint} />
        <div className="mx-auto flex max-w-[1280px] flex-col items-center px-4 pb-10 md:px-8">
          <div className="mb-4 flex w-full max-w-[400px] items-start gap-3 rounded-[16px] bg-accent-soft px-4 py-3 text-[13.5px] leading-snug text-ink-2">
            <Icon name="sparkle" size={20} className="mt-0.5 shrink-0 text-accent" />
            <span>
              {me ? (
                <>
                  Энэ хөтөч өөр дэлгүүрээр (<b className="tnum">{me.tenant.id}</b>) нэвтэрсэн байна. <b className="tnum">{regNo}</b>-ийн PIN-ээр нэвтэрнэ үү.
                </>
              ) : (
                <>AI ажилтан серверт ажилладаг тул нэг удаа PIN-ээр нэвтэрнэ. Нэвтэрсний дараа порталын өгөгдөл серверт синк хийгдэнэ.</>
              )}
            </span>
          </div>
          <Login
            key={regNo}
            embedded
            regNo={regNo}
            onDone={() => {
              void resyncSp();
              void auth.reload();
            }}
          />
        </div>
      </>
    );
  else
    body = (
      <>
        {sec === "command" && <Head title={item.label} sub={item.hint} />}
        {sec === "command" && <Command stats={stats} go={(x) => go(`ai-${x}` as Section)} />}
        {sec === "inbox" && <Inbox />}
        {sec === "tickets" && <Tickets />}
        {sec === "contacts" && <Contacts />}
        {sec === "knowledge" && <Knowledge />}
        {sec === "inventory" && <Inventory />}
        {sec === "billing" && <Billing />}
        {sec === "privacy" && <Privacy role={me?.user.role ?? "staff"} head={<Head title={item.label} sub={item.hint} />} />}
        {sec === "settings" && <Settings />}
      </>
    );

  return (
    <EmbedCtx.Provider value={embed}>
      <div className="gp2 gp2-embed min-h-full">{body}</div>
    </EmbedCtx.Provider>
  );
}
