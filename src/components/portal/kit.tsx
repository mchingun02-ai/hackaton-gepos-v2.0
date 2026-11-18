"use client";

/*
 * Merchant portal — ширээний дэлгэцийн бүрэлдэхүүн (macOS/iPadOS хэмнэл).
 * Өнгө нь зөвхөн токеноор. Sheet-ийн хэлээр төвийн dialog, баруун drawer.
 */

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { Icon, type IconName } from "@/components/sp/icons";
import { Btn, cx, Segmented, spring, Switch } from "@/components/sp/ui";
import { access, PLAN_LABEL, MODULE_PLAN, startOfDay } from "@/lib/sp/logic";
import { setPlan, type Actor } from "@/lib/sp/store";
import type { Module, Plan, Role, SpState, Staff } from "@/lib/sp/types";

/* ───────── портал контекст ───────── */

export type Section =
  | "dashboard"
  | "sales"
  | "products"
  | "categories"
  | "orders"
  | "delivery"
  | "campaigns"
  | "wallet"
  | "crm"
  | "marketing"
  | "chat"
  | "ai"
  | "ai-command"
  | "ai-inbox"
  | "ai-tickets"
  | "ai-contacts"
  | "ai-knowledge"
  | "ai-inventory"
  | "ai-billing"
  | "ai-privacy"
  | "ai-settings"
  | "reports"
  | "account";

export const SECTION_MODULE: Record<Section, Module> = {
  dashboard: "dashboard",
  sales: "sales",
  products: "products",
  categories: "products",
  orders: "delivery",
  delivery: "delivery",
  campaigns: "campaigns",
  wallet: "wallet",
  crm: "crm",
  marketing: "marketing",
  chat: "chat",
  ai: "ai",
  "ai-command": "aiemp",
  "ai-inbox": "aiemp",
  "ai-tickets": "aiemp",
  "ai-contacts": "aiemp",
  "ai-knowledge": "aiemp",
  "ai-inventory": "aiemp",
  "ai-billing": "aiemp",
  "ai-privacy": "aiemp",
  "ai-settings": "aiemp",
  reports: "reports",
  account: "account",
};

export type PortalCtx = {
  s: SpState;
  /** null = мерчант өөрөө (бүх эрх) */
  role: Role | null;
  staff: Staff | null;
  actor: Actor;
  /** BR09-2: буцаалт, цуцлалт, зогсоох эрх */
  canManage: boolean;
  go: (s: Section, sub?: string) => void;
  sub: string | undefined;
  can: (m: Module) => "ok" | "locked" | "hidden";
};

export const Ctx = createContext<PortalCtx | null>(null);
export function usePortal() {
  const c = useContext(Ctx);
  if (!c) throw new Error("PortalCtx missing");
  return c;
}

/* ───────── хуудасны бүтэц ───────── */

/** Хуудас: дээд toolbar (гарчиг + нэг гол үйлдэл) + агуулга */
export function Page({ title, sub, actions, children, tabs }: { title: ReactNode; sub?: ReactNode; actions?: ReactNode; children: ReactNode; tabs?: ReactNode }) {
  return (
    <div className="min-h-full">
      <PageHeader title={title} sub={sub} actions={actions} tabs={tabs} />
      <div className="mx-auto max-w-[1280px] px-4 py-6 md:px-8">{children}</div>
    </div>
  );
}

/** Хуудасны sticky толгой (гарчиг, тайлбар, үйлдэл) — AI ажилтны хэсгүүд мөн үүнийг ашиглана */
export function PageHeader({ title, sub, actions, tabs }: { title: ReactNode; sub?: ReactNode; actions?: ReactNode; tabs?: ReactNode }) {
  return (
    <header className="sp-material sticky top-0 z-20 border-b border-[var(--sp-sep)]">
      <div className="flex min-h-[64px] items-center gap-3 px-4 py-2.5 md:px-8">
        <MenuButton />
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-[22px] font-bold leading-tight tracking-[-0.02em] text-ink">{title}</h1>
          {sub && <div className="truncate text-[13px] text-mute" title={typeof sub === "string" ? sub : undefined}>{sub}</div>}
        </div>
        {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {tabs && <div className="px-4 pb-3 md:px-8">{tabs}</div>}
    </header>
  );
}

/** Жижиг дэлгэц дээр sidebar нээх товч — PortalApp-аас үйлдэл ирнэ */
export const MenuCtx = createContext<(() => void) | null>(null);
function MenuButton() {
  const open = useContext(MenuCtx);
  if (!open) return null;
  return (
    <button type="button" onClick={open} aria-label="Цэс" className="sp-tap -ml-1 grid size-11 place-items-center rounded-full text-ink lg:hidden">
      <Icon name="list" size={22} />
    </button>
  );
}

export function Card({ title, action, children, className, pad = true }: { title?: ReactNode; action?: ReactNode; children: ReactNode; className?: string; pad?: boolean }) {
  return (
    <section className={cx("rounded-[18px] bg-paper shadow-[0_0_0_0.5px_var(--sp-sep),0_1px_2px_rgb(0_0_0/0.03)]", className)}>
      {(title || action) && (
        <div className="flex min-h-[52px] items-center justify-between gap-3 px-5 pt-3">
          <h2 className="text-[15px] font-semibold text-ink">{title}</h2>
          {action}
        </div>
      )}
      <div className={cx(pad && "px-5 pb-5 pt-3")}>{children}</div>
    </section>
  );
}

export function Stat({ label, value, sub, tone, onClick }: { label: string; value: ReactNode; sub?: ReactNode; tone?: "accent" | "warn" | "ok"; onClick?: () => void }) {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className={cx("sp-row block w-full rounded-[18px] bg-paper p-5 text-left shadow-[0_0_0_0.5px_var(--sp-sep)]", onClick && "sp-tap")}
    >
      <div className="text-[13px] font-medium text-mute">{label}</div>
      <div className={cx("mt-1.5 text-[28px] font-bold leading-none tracking-[-0.03em] tnum", tone === "accent" ? "text-accent" : tone === "warn" ? "text-warn" : "text-ink")}>{value}</div>
      {sub && <div className="mt-2 text-[13px] text-mute">{sub}</div>}
    </Tag>
  );
}

/* ───────── хүснэгт ───────── */

export type Col<T> = { key: string; label: ReactNode; align?: "right" | "center"; w?: string; render: (r: T) => ReactNode; className?: string };

/**
 * Хүснэгт: hairline тусгаарлагч, sticky толгой, баруун тийш тэгшилсэн тоо.
 * Мөр дээр дарахад дэлгэрэнгүй нээгдэнэ.
 */
export function Table<T>({
  cols,
  rows,
  rowKey,
  onRow,
  empty,
  maxH = "calc(100dvh - 240px)",
  rowClass,
  select,
}: {
  cols: Col<T>[];
  rows: T[];
  rowKey: (r: T) => string;
  onRow?: (r: T) => void;
  empty?: ReactNode;
  maxH?: string;
  rowClass?: (r: T) => string | false | undefined;
  select?: { selected: Set<string>; onChange: (s: Set<string>) => void };
}) {
  if (!rows.length && empty) return <div className="rounded-[18px] bg-paper shadow-[0_0_0_0.5px_var(--sp-sep)]">{empty}</div>;
  const all = select && rows.length > 0 && rows.every((r) => select.selected.has(rowKey(r)));
  return (
    <div className="sp-scroll overflow-auto rounded-[18px] bg-paper shadow-[0_0_0_0.5px_var(--sp-sep)]" style={{ maxHeight: maxH }}>
      <table className="w-full border-separate border-spacing-0 text-[14px]">
        <thead>
          <tr>
            {select && (
              <th className="sp-material sticky top-0 z-[1] w-10 border-b border-[var(--sp-sep)] pl-4">
                <Check
                  label="Бүгдийг сонгох"
                  checked={!!all}
                  onChange={(v) => select.onChange(new Set(v ? rows.map(rowKey) : []))}
                />
              </th>
            )}
            {cols.map((c) => (
              <th
                key={c.key}
                style={{ width: c.w }}
                className={cx(
                  "sp-material sticky top-0 z-[1] whitespace-nowrap border-b border-[var(--sp-sep)] px-4 py-2.5 text-[12px] font-semibold text-mute",
                  c.align === "right" ? "text-right" : c.align === "center" ? "text-center" : "text-left",
                )}
              >
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const k = rowKey(r);
            return (
              <tr
                key={k}
                onClick={onRow ? () => onRow(r) : undefined}
                className={cx("group", onRow && "cursor-pointer", rowClass?.(r))}
              >
                {select && (
                  <td className="w-10 border-b border-[var(--sp-sep)] pl-4 group-last:border-b-0" onClick={(e) => e.stopPropagation()}>
                    <Check
                      label="Сонгох"
                      checked={select.selected.has(k)}
                      onChange={(v) => {
                        const n = new Set(select.selected);
                        if (v) n.add(k);
                        else n.delete(k);
                        select.onChange(n);
                      }}
                    />
                  </td>
                )}
                {cols.map((c) => (
                  <td
                    key={c.key}
                    className={cx(
                      "border-b border-[var(--sp-sep)] px-4 py-3 align-middle text-ink transition-colors group-last:border-b-0",
                      onRow && "group-hover:bg-[var(--sp-fill)]",
                      c.align === "right" ? "text-right tnum" : c.align === "center" ? "text-center" : "text-left",
                      c.className,
                    )}
                  >
                    {c.render(r)}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function Check({ checked, onChange, label, children, disabled }: { checked: boolean; onChange: (v: boolean) => void; label?: string; children?: ReactNode; disabled?: boolean }) {
  return (
    <label className={cx("inline-flex min-h-[32px] cursor-pointer items-center gap-2.5 text-[15px] text-ink", disabled && "pointer-events-none opacity-40")}>
      <input type="checkbox" className="peer sr-only" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} aria-label={label} />
      <span
        aria-hidden="true"
        className={cx(
          "grid size-[20px] shrink-0 place-items-center rounded-[6px] transition-colors peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-accent",
          checked ? "bg-accent text-white" : "shadow-[inset_0_0_0_1.5px_var(--line)]",
        )}
      >
        {checked && <Icon name="check" size={14} stroke={2.6} />}
      </span>
      {children}
    </label>
  );
}

/* ───────── dialog, drawer ───────── */

function useEsc(open: boolean, onClose: () => void) {
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [open, onClose]);
}

/** Төвийн dialog — Sheet-тэй ижил хэл (Болих зүүн, гарчиг төвд) */
export function Dialog({ open, onClose, title, children, footer, width = 480 }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; footer?: ReactNode; width?: number }) {
  const reduce = useReducedMotion();
  useEsc(open, onClose);
  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 grid place-items-center p-4" role="dialog" aria-modal="true">
          <motion.button type="button" aria-label="Хаах" className="absolute inset-0 bg-black/35" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
          <motion.div
            className="relative flex max-h-[min(88dvh,820px)] w-full flex-col overflow-hidden rounded-[22px] bg-stage shadow-[0_30px_80px_-20px_rgb(0_0_0/0.45)]"
            style={{ maxWidth: width }}
            initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.96, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.98, y: 6 }}
            transition={spring}
          >
            <div className="grid shrink-0 grid-cols-[1fr_auto_1fr] items-center border-b border-[var(--sp-sep)] px-2 py-1.5">
              <button type="button" onClick={onClose} className="sp-tap h-11 justify-self-start rounded-full px-3 text-[16px] text-accent">
                Болих
              </button>
              <div className="truncate px-2 text-[16px] font-semibold text-ink">{title}</div>
              <span />
            </div>
            <div className="sp-scroll min-h-0 flex-1 px-5 py-5">{children}</div>
            {footer && <div className="flex shrink-0 justify-end gap-2 border-t border-[var(--sp-sep)] px-5 py-3">{footer}</div>}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

/** Баруун талын дэлгэрэнгүй самбар (мөр дээр дарахад) */
export function Drawer({ open, onClose, title, sub, children, footer, width = 520 }: { open: boolean; onClose: () => void; title: ReactNode; sub?: ReactNode; children: ReactNode; footer?: ReactNode; width?: number }) {
  const reduce = useReducedMotion();
  useEsc(open, onClose);
  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true">
          <motion.button type="button" aria-label="Хаах" className="absolute inset-0 bg-black/25" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
          <motion.aside
            className="relative flex h-full w-full flex-col bg-stage shadow-[-20px_0_60px_-20px_rgb(0_0_0/0.35)]"
            style={{ maxWidth: width }}
            initial={reduce ? { opacity: 0 } : { x: "100%" }}
            animate={reduce ? { opacity: 1 } : { x: 0 }}
            exit={reduce ? { opacity: 0 } : { x: "100%" }}
            transition={spring}
          >
            <div className="sp-material flex min-h-[64px] shrink-0 items-center gap-3 border-b border-[var(--sp-sep)] px-5 py-2.5">
              <div className="min-w-0 flex-1">
                <div className="truncate text-[17px] font-semibold text-ink">{title}</div>
                {sub && <div className="truncate text-[13px] text-mute">{sub}</div>}
              </div>
              <button type="button" onClick={onClose} aria-label="Хаах" className="sp-tap grid size-9 place-items-center rounded-full bg-[var(--sp-fill)] text-ink">
                <Icon name="close" size={16} stroke={2.2} />
              </button>
            </div>
            <div className="sp-scroll min-h-0 flex-1 px-5 py-5">{children}</div>
            {footer && <div className="flex shrink-0 flex-wrap justify-end gap-2 border-t border-[var(--sp-sep)] px-5 py-3">{footer}</div>}
          </motion.aside>
        </div>
      )}
    </AnimatePresence>
  );
}

/** Дэлгэрэнгүйн доторх шошго-утга мөр */
export function KV({ rows }: { rows: [ReactNode, ReactNode][] }) {
  return (
    <dl className="overflow-hidden rounded-[14px] bg-paper [&>*+*]:border-t [&>*+*]:border-[var(--sp-sep)]">
      {rows.map(([k, v], i) => (
        <div key={i} className="flex min-h-[44px] items-center justify-between gap-4 px-4 py-2.5 text-[14px]">
          <dt className="shrink-0 text-mute">{k}</dt>
          <dd className="min-w-0 text-right text-ink">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

export const SectionTitle = ({ children, action }: { children: ReactNode; action?: ReactNode }) => (
  <div className="mb-2 mt-6 flex items-center justify-between px-1 first:mt-0">
    <h3 className="text-[13px] font-semibold uppercase tracking-[0.02em] text-mute">{children}</h3>
    {action}
  </div>
);

/* ───────── багцаар түгжигдсэн дэлгэц (7.4) ───────── */

export function Locked({ module, title, body, icon }: { module: Module; title: string; body: ReactNode; icon: IconName }) {
  const { s, can, actor, go } = usePortal();
  const need: Plan = MODULE_PLAN[module] ?? "plus";
  const [confirm, setConfirm] = useState(false);
  const canBuy = can("account") === "ok";
  return (
    <Page title={title} sub={`${PLAN_LABEL[need]} багцад багтана`}>
      <div className="mx-auto mt-6 max-w-[560px] rounded-[22px] bg-paper p-8 text-center shadow-[0_0_0_0.5px_var(--sp-sep)]">
        <span className="relative mx-auto grid size-16 place-items-center rounded-full bg-accent-soft text-accent">
          <Icon name={icon} size={30} />
          <span className="absolute -bottom-1 -right-1 grid size-7 place-items-center rounded-full bg-paper text-mute shadow-[0_0_0_0.5px_var(--sp-sep)]">
            <Icon name="lock" size={14} stroke={2.2} />
          </span>
        </span>
        <h2 className="mt-4 text-[20px] font-bold text-ink">{title} — {PLAN_LABEL[need]} багцад</h2>
        <p className="mx-auto mt-2 max-w-[420px] text-[15px] leading-snug text-mute">{body}</p>
        <p className="mt-3 text-[13px] text-mute">Одоогийн багц: {PLAN_LABEL[s.merchant.plan]}</p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          {canBuy ? (
            <>
              <Btn size="md" onClick={() => setConfirm(true)}>
                {PLAN_LABEL[need]} руу шилжих
              </Btn>
              <Btn size="md" variant="gray" onClick={() => go("account", "plan")}>
                Багц харьцуулах
              </Btn>
            </>
          ) : (
            <p className="text-[14px] text-ink-2">Багц солихыг мерчантын админаас хүснэ үү.</p>
          )}
        </div>
      </div>
      <Dialog
        open={confirm}
        onClose={() => setConfirm(false)}
        title="Багц дээшлүүлэх"
        width={420}
        footer={
          <>
            <Btn size="md" variant="gray" onClick={() => setConfirm(false)}>
              Болих
            </Btn>
            <Btn
              size="md"
              onClick={() => {
                setPlan(actor, need);
                setConfirm(false);
              }}
            >
              {PLAN_LABEL[need]} болгох
            </Btn>
          </>
        }
      >
        <p className="text-[15px] leading-snug text-ink-2">
          {PLAN_LABEL[need]} багц идэвхжмэгц «{title}» цэс шууд нээгдэнэ. Төлбөрийн нөхцөл: гэрээний дагуу.
        </p>
      </Dialog>
    </Page>
  );
}

/* ───────── хугацааны шүүлт (BR08-6) ───────── */

export type RangeId = "today" | "7" | "30" | "custom";
export type Range = { id: RangeId; from: string; to: string };

export const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export function useRange(initial: RangeId = "7") {
  const [r, setR] = useState<Range>(() => mkRange(initial));
  const bounds = useMemo(() => {
    const from = startOfDay(new Date(r.from + "T00:00:00"));
    const to = new Date(r.to + "T23:59:59.999");
    return { from, to };
  }, [r]);
  return { range: r, setRange: setR, ...bounds };
}

export function mkRange(id: RangeId, from?: string, to?: string): Range {
  const now = new Date();
  const t = ymd(now);
  if (id === "today") return { id, from: t, to: t };
  if (id === "custom") return { id, from: from ?? t, to: to ?? t };
  const d = new Date(now);
  d.setDate(d.getDate() - (Number(id) - 1));
  return { id, from: ymd(d), to: t };
}

export function RangePicker({ value, onChange }: { value: Range; onChange: (r: Range) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Segmented
        className="w-[360px] max-w-full"
        value={value.id}
        onChange={(id) => onChange(mkRange(id, value.from, value.to))}
        options={[
          { id: "today", label: "Өнөөдөр" },
          { id: "7", label: "7 хоног" },
          { id: "30", label: "Сар" },
          { id: "custom", label: "Муж" },
        ]}
      />
      {value.id === "custom" && (
        <span className="flex items-center gap-1.5">
          <input type="date" className="sp-field !h-9 !w-[150px] !text-[14px]" value={value.from} max={value.to} onChange={(e) => onChange({ ...value, from: e.target.value })} aria-label="Эхлэх огноо" />
          <span className="text-mute">–</span>
          <input type="date" className="sp-field !h-9 !w-[150px] !text-[14px]" value={value.to} min={value.from} onChange={(e) => onChange({ ...value, to: e.target.value })} aria-label="Дуусах огноо" />
        </span>
      )}
    </div>
  );
}

/* ───────── бусад ───────── */

/** CSV экспорт — Excel-д кирилл зөв харагдахаар BOM-той */
export function downloadCsv(name: string, rows: (string | number)[][]) {
  const esc = (v: string | number) => {
    const s = String(v ?? "");
    return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = "﻿" + rows.map((r) => r.map(esc).join(",")).join("\r\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name.endsWith(".csv") ? name : `${name}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const dateTime = (iso: string) => {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
};
export const dateOnly = (iso: string) => dateTime(iso).slice(0, 10);

/** Зураг файлыг data URL болгоно (лого) */
export function readImage(file: File, max = 400): Promise<string> {
  return new Promise((res, rej) => {
    const fr = new FileReader();
    fr.onerror = () => rej(fr.error);
    fr.onload = () => {
      const img = new Image();
      img.onload = () => {
        const k = Math.min(1, max / Math.max(img.width, img.height));
        const c = document.createElement("canvas");
        c.width = Math.round(img.width * k);
        c.height = Math.round(img.height * k);
        c.getContext("2d")?.drawImage(img, 0, 0, c.width, c.height);
        res(c.toDataURL("image/png"));
      };
      img.onerror = () => res(String(fr.result));
      img.src = String(fr.result);
    };
    fr.readAsDataURL(file);
  });
}

/** Өнгө сонгогч + hex талбар */
export function ColorField({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) {
  const [txt, setTxt] = useState(value);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- гаднаас өнгө солигдвол бичвэрийг дагуулна
  useEffect(() => setTxt(value), [value]);
  return (
    <div className="flex items-center gap-2">
      <label className="relative size-12 shrink-0 cursor-pointer overflow-hidden rounded-[12px] shadow-[inset_0_0_0_1px_var(--sp-sep)]" style={{ background: value }}>
        <input type="color" aria-label={label} value={value} onChange={(e) => onChange(e.target.value)} className="absolute inset-0 cursor-pointer opacity-0" />
      </label>
      <input
        className="sp-field font-mono uppercase"
        value={txt}
        aria-label={`${label} (hex)`}
        maxLength={7}
        onChange={(e) => {
          const v = e.target.value.startsWith("#") ? e.target.value : `#${e.target.value}`;
          setTxt(v);
          if (/^#[0-9a-fA-F]{6}$/.test(v)) onChange(v.toLowerCase());
        }}
      />
    </div>
  );
}

/** WCAG контраст харьцаа */
export function contrast(a: string, b: string) {
  const lum = (h: string) => {
    const n = parseInt(h.slice(1), 16);
    const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
      const x = v / 255;
      return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  };
  const [l1, l2] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}

/** Шүүлтүүрийн мөр (хайлт + сонголтууд) */
export const Toolbar = ({ children }: { children: ReactNode }) => <div className="mb-4 flex flex-wrap items-center gap-2">{children}</div>;

/** Жижиг select */
export function Select<T extends string>({ value, onChange, options, label, className }: { value: T; onChange: (v: T) => void; options: { id: T; label: string }[]; label: string; className?: string }) {
  return (
    <select aria-label={label} value={value} onChange={(e) => onChange(e.target.value as T)} className={cx("sp-field !h-10 !w-auto !text-[14px]", className)}>
      {options.map((o) => (
        <option key={o.id} value={o.id}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export { access };

/**
 * Олон таб (5-аас олон) — Segmented-ийн хэлээр, хэвтээ гүйдэг.
 * Порталын бүх таб нэг л хэв маягтай байна.
 */
export function Tabs<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { id: T; label: string }[] }) {
  return (
    <div className="sp-scroll -mx-1 overflow-x-auto px-1">
      <div role="tablist" className="inline-flex gap-[2px] rounded-[11px] bg-[var(--sp-fill)] p-[3px]">
        {options.map((o) => (
          <button
            key={o.id}
            type="button"
            role="tab"
            aria-selected={o.id === value}
            onClick={() => onChange(o.id)}
            className={cx(
              "sp-tap h-[30px] shrink-0 whitespace-nowrap rounded-[9px] px-3 text-[13px] font-semibold transition-colors",
              o.id === value ? "bg-paper text-ink shadow-[0_3px_8px_rgb(0_0_0/0.12),0_0_0_0.5px_rgb(0_0_0/0.04)] [:root[data-theme=dark]_&]:bg-[#3a3a3f]" : "text-mute hover:text-ink",
            )}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Сонгогдох чип (гараг, төлөв) — нэг хэв маяг */
export function Chip({ on, onClick, children, label }: { on: boolean; onClick: () => void; children: ReactNode; label?: string }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      aria-label={label}
      onClick={onClick}
      className={cx("sp-tap h-10 min-w-11 rounded-full px-4 text-[14px] font-semibold", on ? "bg-accent text-white" : "bg-[var(--sp-fill)] text-ink hover:bg-[var(--sp-fill-2)]")}
    >
      {children}
    </button>
  );
}

/** Switch-тэй мөр (тайлбартай) */
export function SwitchRow({ title, sub, checked, onChange, disabled }: { title: ReactNode; sub?: ReactNode; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <div className="flex min-h-[56px] items-center justify-between gap-4 rounded-[14px] bg-paper px-4 py-2.5">
      <div className="min-w-0">
        <div className="text-[15px] text-ink">{title}</div>
        {sub && <div className="text-[13px] leading-snug text-mute">{sub}</div>}
      </div>
      <Switch label={typeof title === "string" ? title : "Сонголт"} checked={checked} onChange={onChange} disabled={disabled} />
    </div>
  );
}
