"use client";

/* Мерчантын апп — нийтлэг төлөв (сесс, навигаци) ба жижиг бүрэлдэхүүн. */

import { createContext, useContext, type ReactNode } from "react";
import { MODULE_LABEL, PLAN_LABEL, MODULE_PLAN } from "@/lib/sp/logic";
import { actorOf, useSp, type Actor } from "@/lib/sp/store";
import type { Module, Order, Role, SpState, Staff } from "@/lib/sp/types";
import { Badge, Btn, cx } from "@/components/sp/ui";
import { Icon } from "@/components/sp/icons";

export type Session = { kind: "owner" } | { kind: "staff"; staffId: string };
export type Tab = "home" | "delivery" | "campaigns" | "crm" | "more";
export type Route = { k: string; id?: string };

export type SmsDraft = { minSpend: number; minOrders: number; text: string };

export type Ctx = {
  session: Session;
  staff: Staff | null;
  role: Role | null;
  actor: Actor;
  /** BR09-2 — цуцлах, буцаах эрх */
  manage: boolean;
  can: (m: Module) => "ok" | "locked" | "hidden";
  push: (r: Route) => void;
  pop: () => void;
  goTab: (t: Tab, r?: Route) => void;
  logout: () => void;
  draft: SmsDraft;
  setDraft: (d: SmsDraft) => void;
  openAddCustomer: () => void;
};

export const MCtx = createContext<Ctx | null>(null);
export const useM = () => {
  const c = useContext(MCtx);
  if (!c) throw new Error("MerchantApp context");
  return c;
};

export function sessionInfo(s: SpState, session: Session) {
  const staff = session.kind === "staff" ? s.staff.find((x) => x.id === session.staffId) ?? null : null;
  const role = staff ? s.roles.find((r) => r.id === staff.roleId) ?? null : null;
  return { staff, role, actor: actorOf(staff), manage: staff ? !!role?.manage : true };
}

/* ───────── дэлгэцийн араг ───────── */

export function Screen({ nav, children, footer, className }: { nav?: ReactNode; children: ReactNode; footer?: ReactNode; className?: string }) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      {nav}
      <div className={cx("sp-scroll min-h-0 flex-1 pb-6", className)}>{children}</div>
      {footer && <div className="sp-material shrink-0 border-t border-[var(--sp-sep)] px-4 pb-3 pt-3">{footer}</div>}
    </div>
  );
}

/** 7.4 — багцад ороогүй модуль: түгжээтэй, шилжих замтай */
export function Locked({ module }: { module: Module }) {
  const s = useSp();
  const m = useM();
  const need = MODULE_PLAN[module] ?? "plus";
  const perks: Record<string, string[]> = {
    delivery: ["Өөрийн лого, өнгөтэй захиалгын веб хуудас", "Захиалга пос, утсанд шууд ирнэ", "Ачаа хүлээлгэн өгөх кодоор баталгаажна"],
    campaigns: ["Оноо, бараагаар урамшуулал", "Касс дээр автоматаар тооцогдоно"],
    wallet: ["Apple, Google Wallet-д хадгалагдах карт", "Оноо, түвшин автоматаар шинэчлэгдэнэ"],
  };
  return (
    <div className="flex flex-col items-center px-8 pt-16 text-center">
      <span className="grid size-[72px] place-items-center rounded-[20px] bg-[var(--sp-fill)] text-ink-2">
        <Icon name="lock" size={32} />
      </span>
      <h2 className="mt-5 text-[22px] font-bold tracking-[-0.02em] text-ink">
        {MODULE_LABEL[module]} {PLAN_LABEL[need]} багцад багтана
      </h2>
      <p className="mt-2 text-[15px] leading-snug text-mute">
        Одоо таны багц {PLAN_LABEL[s.merchant.plan]}. {PLAN_LABEL[need]} руу шилжмэгц энэ цэс шууд нээгдэнэ.
      </p>
      <ul className="mt-6 w-full space-y-3 rounded-[var(--sp-r-group)] bg-paper px-5 py-4 text-left">
        {(perks[module] ?? []).map((p) => (
          <li key={p} className="flex gap-3 text-[15px] leading-snug text-ink">
            <Icon name="check" size={18} stroke={2.2} className="mt-0.5 text-ok" />
            {p}
          </li>
        ))}
      </ul>
      {m.can("account") === "ok" ? (
        <Btn block className="mt-6" onClick={() => m.push({ k: "plans" })}>
          {PLAN_LABEL[need]} багцыг үзэх
        </Btn>
      ) : (
        <p className="mt-6 text-[14px] text-mute">Багц солихыг мерчантын админаас хүснэ үү.</p>
      )}
    </div>
  );
}

/* ───────── захиалгын тэмдэг ───────── */

export function StatusBadge({ s, o }: { s: SpState; o: Order }) {
  if (o.cancel) return <Badge tone="danger" icon="close">Цуцлагдсан</Badge>;
  const st = s.delivery.statuses.find((x) => x.id === o.statusId);
  if (st?.final) return <Badge tone="ok" icon="check">{st.name}</Badge>;
  const idx = s.delivery.statuses.findIndex((x) => x.id === o.statusId);
  return idx <= 0 ? (
    <Badge tone="gray" icon="box">{st?.name ?? "Хүлээн авсан"}</Badge>
  ) : (
    <Badge tone="accent" icon="truck">{st?.name}</Badge>
  );
}

export function PayBadge({ o }: { o: Order }) {
  if (o.cancel) return o.cancel.refunded ? <Badge tone="gray" icon="undo">Буцаасан</Badge> : o.paid ? <Badge tone="gray">Төлөгдсөн</Badge> : null;
  if (o.paid) return <Badge tone="ok" icon="check">Төлөгдсөн</Badge>;
  return <Badge tone="warn" icon="clock">{o.payLater ? "Дараа төлөх" : "Төлөгдөөгүй"}</Badge>;
}

/** 1,410,000 → «1.41 сая» */
export const short = (n: number) => (n >= 1_000_000 ? `${(n / 1_000_000).toFixed(2)} сая₮` : `${Math.round(n).toLocaleString("en-US")}₮`);

export const linesText = (lines: { name: string; qty: number }[], max = 3) =>
  lines.slice(0, max).map((l) => `${l.name.replace(/\s*«.*»/, "")} ×${l.qty}`).join(", ") + (lines.length > max ? ` +${lines.length - max}` : "");

export const isNewOrder = (s: SpState, o: Order) => !o.cancel && o.statusId === s.delivery.statuses[0]?.id && Date.now() - new Date(o.createdAt).getTime() < 30 * 60000;

export const BigTitle = ({ children, sub }: { children: ReactNode; sub?: ReactNode }) => (
  <div className="px-4 pb-2 pt-3">
    {sub && <div className="text-[14px] font-medium text-mute">{sub}</div>}
    <h1 className="text-[32px] font-bold leading-[1.1] tracking-[-0.03em] text-ink">{children}</h1>
  </div>
);
