"use client";

/*
 * Store Plus — хуваалцах UI бүрэлдэхүүн (пос, мерчантын апп, портал).
 * Apple HIG: тод шатлал, 44pt хүрэлт, материал, sheet/alert, spring хөдөлгөөн.
 * Өнгө/фонт нь globals.css-ийн токен — энд шинэ өнгө нэмэхгүй.
 */

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from "react";
import { Icon, type IconName } from "./icons";

export const spring = { type: "spring" as const, stiffness: 520, damping: 42, mass: 0.9 };
export const springSoft = { type: "spring" as const, stiffness: 340, damping: 34 };

/** SUNMI дээр богино чичиргээ — товч дарагдсаныг гараар мэдрүүлнэ */
export const tap = (ms = 8) => {
  try {
    navigator.vibrate?.(ms);
  } catch {
    /* дэмжихгүй хөтөч */
  }
};

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

/* ───────── товч ───────── */

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "filled" | "tinted" | "gray" | "plain" | "danger" | "dangerTinted" | "dark";
  size?: "xl" | "lg" | "md" | "sm";
  block?: boolean;
  icon?: IconName;
  loading?: boolean;
};

export function Btn({ variant = "filled", size = "lg", block, icon, loading, className, children, disabled, ...rest }: BtnProps) {
  const v = {
    filled: "bg-accent text-white shadow-[0_8px_20px_-10px_color-mix(in_oklab,var(--accent)_70%,transparent)]",
    tinted: "bg-accent-soft text-accent",
    gray: "bg-[var(--sp-fill)] text-ink",
    plain: "bg-transparent text-accent",
    danger: "bg-danger text-white",
    dangerTinted: "bg-danger-soft text-danger",
    dark: "bg-ink text-paper",
  }[variant];
  const s = {
    xl: "h-[60px] px-6 text-[18px] rounded-[var(--sp-r-btn)] font-semibold",
    lg: "h-[52px] px-5 text-[17px] rounded-[var(--sp-r-btn)] font-semibold",
    md: "h-[44px] px-4 text-[15px] rounded-[12px] font-semibold",
    sm: "h-[34px] px-3 text-[13px] rounded-full font-semibold",
  }[size];
  return (
    <button
      type="button"
      disabled={disabled || loading}
      onPointerDown={() => tap()}
      className={cx("sp-tap inline-flex items-center justify-center gap-2 whitespace-nowrap disabled:opacity-40", v, s, block && "w-full", className)}
      {...rest}
    >
      {loading ? <Spinner /> : icon ? <Icon name={icon} size={size === "sm" ? 16 : 20} /> : null}
      {children}
    </button>
  );
}

export function IconBtn({ name, label, onClick, className, tone = "gray", size = 44 }: { name: IconName; label: string; onClick?: () => void; className?: string; tone?: "gray" | "plain" | "accent"; size?: number }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      style={{ width: size, height: size }}
      className={cx(
        "sp-tap grid shrink-0 place-items-center rounded-full",
        tone === "gray" && "bg-[var(--sp-fill)] text-ink",
        tone === "plain" && "text-accent",
        tone === "accent" && "bg-accent text-white",
        className,
      )}
    >
      <Icon name={name} size={20} />
    </button>
  );
}

export const Spinner = ({ size = 18 }: { size?: number }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} className="sp-spin" aria-hidden="true">
    <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeOpacity="0.25" strokeWidth="2.5" />
    <path d="M21 12a9 9 0 0 0-9-9" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
  </svg>
);

/* ───────── навигаци ───────── */

/**
 * HIG navigation bar: 44pt өндөр, гарчиг төвд, зүүн талд буцах, баруун
 * талд нэг үйлдэл. `large` бол гарчиг доор том (Large Title).
 */
export function NavBar({
  title,
  onBack,
  backLabel,
  leading,
  trailing,
  large,
  sub,
}: {
  title?: ReactNode;
  onBack?: () => void;
  backLabel?: string;
  leading?: ReactNode;
  trailing?: ReactNode;
  large?: boolean;
  sub?: ReactNode;
}) {
  return (
    <header className="sp-material sticky top-0 z-20 shrink-0 border-b border-[var(--sp-sep)]">
      <div className="grid h-[52px] grid-cols-[1fr_auto_1fr] items-center px-2">
        <div className="flex min-w-0 items-center">
          {onBack ? (
            <button type="button" onClick={onBack} className="sp-tap flex h-11 min-w-11 items-center gap-0.5 rounded-full pr-2 text-[17px] text-accent" aria-label={backLabel ?? "Буцах"}>
              <Icon name="back" size={24} stroke={2.2} />
              {backLabel && <span className="truncate">{backLabel}</span>}
            </button>
          ) : (
            leading
          )}
        </div>
        <div className="min-w-0 truncate text-center text-[17px] font-semibold text-ink">{!large && title}</div>
        <div className="flex items-center justify-end gap-1">{trailing}</div>
      </div>
      {large && (
        <div className="px-4 pb-3 pt-0.5">
          <h1 className="text-[30px] font-bold leading-[1.1] tracking-[-0.03em] text-ink">{title}</h1>
          {sub && <div className="mt-1 text-[14px] text-mute">{sub}</div>}
        </div>
      )}
    </header>
  );
}

/** Доод tab bar (мерчантын апп) */
export function TabBar<T extends string>({ items, value, onChange }: { items: { id: T; label: string; icon: IconName; badge?: number; locked?: boolean }[]; value: T; onChange: (v: T) => void }) {
  return (
    <nav className="sp-material sticky bottom-0 z-20 flex shrink-0 border-t border-[var(--sp-sep)] pb-[max(env(safe-area-inset-bottom),8px)] pt-1.5" role="tablist">
      {items.map((it) => {
        const on = it.id === value;
        return (
          <button
            key={it.id}
            role="tab"
            aria-selected={on}
            type="button"
            onClick={() => onChange(it.id)}
            className={cx("sp-tap relative flex min-h-[49px] flex-1 flex-col items-center justify-center gap-1 text-[10.5px] font-semibold", on ? "text-accent" : "text-mute")}
          >
            <span className="relative">
              <Icon name={it.icon} size={25} stroke={on ? 2 : 1.7} />
              {!!it.badge && (
                <span className="absolute -right-2.5 -top-1.5 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-danger px-1 text-[11px] font-bold text-white">{it.badge}</span>
              )}
              {it.locked && <Icon name="lock" size={11} className="absolute -right-2 -top-1 text-mute" stroke={2.2} />}
            </span>
            {it.label}
          </button>
        );
      })}
    </nav>
  );
}

/* ───────── жагсаалт (Inset grouped) ───────── */

export function Group({ header, footer, children, className }: { header?: ReactNode; footer?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cx("px-4", className)}>
      {header && <h2 className="px-4 pb-1.5 pt-5 text-[13px] font-medium uppercase tracking-[0.02em] text-mute">{header}</h2>}
      <div className="overflow-hidden rounded-[var(--sp-r-group)] bg-paper [&>*+*]:border-t [&>*+*]:border-[var(--sp-sep)]">{children}</div>
      {footer && <p className="px-4 pt-1.5 text-[13px] leading-snug text-mute">{footer}</p>}
    </section>
  );
}

export function Row({
  icon,
  iconTone = "gray",
  title,
  sub,
  value,
  chevron,
  onClick,
  trailing,
  destructive,
  disabled,
  className,
}: {
  icon?: IconName;
  iconTone?: "gray" | "accent" | "ok" | "warn" | "danger" | "ink";
  title: ReactNode;
  sub?: ReactNode;
  value?: ReactNode;
  chevron?: boolean;
  onClick?: () => void;
  trailing?: ReactNode;
  destructive?: boolean;
  disabled?: boolean;
  className?: string;
}) {
  const tone = {
    gray: "bg-[var(--sp-fill)] text-ink",
    accent: "bg-accent-soft text-accent",
    ok: "bg-ok-soft text-ok",
    warn: "bg-warn-soft text-warn",
    danger: "bg-danger-soft text-danger",
    ink: "bg-ink text-paper",
  }[iconTone];
  const body = (
    <>
      {icon && (
        <span className={cx("grid size-9 shrink-0 place-items-center rounded-[10px]", tone)}>
          <Icon name={icon} size={19} />
        </span>
      )}
      <span className="min-w-0 flex-1 text-left">
        <span className={cx("block text-[16px] leading-snug", destructive ? "text-danger" : "text-ink")}>{title}</span>
        {sub && <span className="mt-0.5 block text-[13px] leading-snug text-mute">{sub}</span>}
      </span>
      {value !== undefined && <span className="shrink-0 text-right text-[15px] text-mute tnum">{value}</span>}
      {trailing}
      {chevron && <Icon name="chevron" size={17} stroke={2.2} className="text-[var(--line)]" />}
    </>
  );
  const cls = cx("flex min-h-[52px] w-full items-center gap-3 px-4 py-2.5", className);
  return onClick ? (
    <button type="button" disabled={disabled} onClick={onClick} className={cx("sp-row disabled:opacity-40", cls)}>
      {body}
    </button>
  ) : (
    <div className={cls}>{body}</div>
  );
}

/* ───────── удирдлага ───────── */

export function Switch({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => {
        tap();
        onChange(!checked);
      }}
      className="sp-switch"
    />
  );
}

/** HIG segmented control — гулсдаг сонголт */
export function Segmented<T extends string>({ options, value, onChange, className, size = "md" }: { options: { id: T; label: ReactNode }[]; value: T; onChange: (v: T) => void; className?: string; size?: "md" | "lg" }) {
  const idx = Math.max(0, options.findIndex((o) => o.id === value));
  return (
    <div role="tablist" className={cx("relative grid rounded-[11px] bg-[var(--sp-fill)] p-[3px]", size === "lg" ? "h-11" : "h-9", className)} style={{ gridTemplateColumns: `repeat(${options.length}, 1fr)` }}>
      <span
        aria-hidden="true"
        className="absolute bottom-[3px] top-[3px] rounded-[9px] bg-paper shadow-[0_3px_8px_rgb(0_0_0/0.12),0_0_0_0.5px_rgb(0_0_0/0.04)] transition-transform duration-300 [transition-timing-function:var(--ease-spring)] [:root[data-theme=dark]_&]:bg-[#3a3a3f]"
        style={{ left: 3, width: `calc((100% - 6px) / ${options.length})`, transform: `translateX(${idx * 100}%)` }}
      />
      {options.map((o) => (
        <button
          key={o.id}
          role="tab"
          aria-selected={o.id === value}
          type="button"
          onClick={() => {
            tap();
            onChange(o.id);
          }}
          className={cx("relative z-[1] truncate px-2 font-semibold transition-colors", size === "lg" ? "text-[15px]" : "text-[13px]", o.id === value ? "text-ink" : "text-mute")}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function SearchField({ value, onChange, placeholder = "Хайх", trailing, autoFocus }: { value: string; onChange: (v: string) => void; placeholder?: string; trailing?: ReactNode; autoFocus?: boolean }) {
  return (
    <label className="flex h-10 items-center gap-2 rounded-[11px] bg-[var(--sp-fill)] px-3 text-mute">
      <Icon name="search" size={18} />
      <input
        type="text"
        inputMode="search"
        enterKeyHint="search"
        value={value}
        autoFocus={autoFocus}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="min-w-0 flex-1 bg-transparent text-[16px] text-ink outline-none placeholder:text-mute"
      />
      {value && (
        <button type="button" aria-label="Цэвэрлэх" onClick={() => onChange("")} className="grid size-5 place-items-center rounded-full bg-mute/40 text-paper">
          <Icon name="close" size={12} stroke={2.6} />
        </button>
      )}
      {trailing}
    </label>
  );
}

export function Field({ label, hint, error, children }: { label: string; hint?: ReactNode; error?: string | null; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[13px] font-medium text-mute">{label}</span>
      {children}
      {error ? <span className="mt-1.5 block text-[13px] text-danger">{error}</span> : hint ? <span className="mt-1.5 block text-[13px] leading-snug text-mute">{hint}</span> : null}
    </label>
  );
}

/* ───────── тэмдэг ───────── */

export function Badge({ tone = "gray", children, icon }: { tone?: "gray" | "accent" | "ok" | "warn" | "danger" | "ink"; children: ReactNode; icon?: IconName }) {
  const t = {
    gray: "bg-[var(--sp-fill)] text-ink-2",
    accent: "bg-accent-soft text-accent",
    ok: "bg-ok-soft text-ok",
    warn: "bg-warn-soft text-warn",
    danger: "bg-danger-soft text-danger",
    ink: "bg-ink text-paper",
  }[tone];
  return (
    <span className={cx("inline-flex h-[22px] shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-2 text-[12px] font-semibold", t)}>
      {icon && <Icon name={icon} size={13} stroke={2.2} />}
      {children}
    </span>
  );
}

/** Том мөнгөн дүн — ₮ саарал, жижиг (hugenum-ийн хэмнэл) */
export function Amount({ value, size = 44, className }: { value: number; size?: number; className?: string }) {
  return (
    <span className={cx("inline-flex items-baseline font-bold tracking-[-0.035em] text-ink tnum", className)} style={{ fontSize: size, lineHeight: 1 }}>
      {Math.round(value).toLocaleString("en-US")}
      <span className="ml-[0.08em] text-[0.55em] font-semibold text-mute">₮</span>
    </span>
  );
}

export function Empty({ icon, title, body, action }: { icon: IconName; title: string; body?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-8 py-12 text-center">
      <span className="grid size-16 place-items-center rounded-full bg-[var(--sp-fill)] text-mute">
        <Icon name={icon} size={30} />
      </span>
      <h3 className="mt-4 text-[17px] font-semibold text-ink">{title}</h3>
      {body && <p className="mt-1.5 max-w-[300px] text-[14px] leading-snug text-mute">{body}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function Notice({ tone = "warn", icon, children, action }: { tone?: "warn" | "danger" | "ok" | "accent" | "gray"; icon?: IconName; children: ReactNode; action?: ReactNode }) {
  const t = { warn: "bg-warn-soft text-warn", danger: "bg-danger-soft text-danger", ok: "bg-ok-soft text-ok", accent: "bg-accent-soft text-accent", gray: "bg-[var(--sp-fill)] text-ink-2" }[tone];
  return (
    <div className={cx("flex items-start gap-2.5 rounded-[14px] px-3.5 py-3 text-[14px] leading-snug", t)}>
      <Icon name={icon ?? (tone === "ok" ? "check" : tone === "gray" ? "info" : "warn")} size={18} className="mt-px" />
      <div className="min-w-0 flex-1 font-medium">{children}</div>
      {action}
    </div>
  );
}

/* ───────── тоон гар, PIN ───────── */

export function NumPad({ onKey, left, className }: { onKey: (k: string) => void; left?: { label: ReactNode; key: string } | null; className?: string }) {
  const press = (k: string) => {
    tap();
    onKey(k);
  };
  return (
    <div className={cx("grid grid-cols-3 gap-2", className)}>
      {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((k) => (
        <button key={k} type="button" className="sp-key" onClick={() => press(k)}>
          {k}
        </button>
      ))}
      {left ? (
        <button type="button" className="sp-key sp-key--ghost !text-[16px] !text-accent" onClick={() => press(left.key)}>
          {left.label}
        </button>
      ) : (
        <span />
      )}
      <button type="button" className="sp-key" onClick={() => press("0")}>
        0
      </button>
      <button type="button" className="sp-key sp-key--ghost" aria-label="Устгах" onClick={() => press("back")}>
        <Icon name="backspace" size={26} />
      </button>
    </div>
  );
}

/** Гараас ирсэн тоон товчийг ч хүлээн авна (суурин кассын гар, бар код уншигч биш) */
export function useKeypad(onKey: (k: string) => void, enabled = true) {
  const ref = useRef(onKey);
  useEffect(() => {
    ref.current = onKey;
  });
  useEffect(() => {
    if (!enabled) return;
    const h = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA")) return;
      if (/^[0-9]$/.test(e.key)) ref.current(e.key);
      else if (e.key === "Backspace") ref.current("back");
      else if (e.key === "Enter") ref.current("enter");
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [enabled]);
}

export function PinDots({ length, filled, error }: { length: number; filled: number; error?: boolean }) {
  return (
    <div className={cx("flex justify-center gap-4", error && "sp-shake")} aria-label={`${filled} / ${length}`}>
      {Array.from({ length }, (_, i) => (
        <span key={i} className="sp-dot" data-on={i < filled ? "" : undefined} style={error ? { boxShadow: "inset 0 0 0 1.5px var(--danger)" } : undefined} />
      ))}
    </div>
  );
}

export function CodeBoxes({ length, value, error }: { length: number; value: string; error?: boolean }) {
  return (
    <div className={cx("flex justify-center gap-2", error && "sp-shake")}>
      {Array.from({ length }, (_, i) => {
        const ch = value[i];
        const cur = i === value.length;
        return (
          <span
            key={i}
            className={cx(
              "grid h-14 w-11 place-items-center rounded-[12px] bg-paper text-[26px] font-bold text-ink tnum transition-shadow",
              error ? "shadow-[inset_0_0_0_2px_var(--danger)]" : cur ? "shadow-[inset_0_0_0_2px_var(--accent)]" : "shadow-[inset_0_0_0_1px_var(--hair)]",
            )}
          >
            {ch ?? ""}
          </span>
        );
      })}
    </div>
  );
}

/* ───────── sheet, alert, toast ───────── */

/**
 * HIG sheet — доороос гарч, дээд талд барих зураас. Арын бүдэгрүүлэлт дээр
 * дарахад хаагдана. Төхөөрөмжийн хүрээн дотор (.sp-device) байрлана.
 */
export function Sheet({ open, onClose, title, children, footer, full, trailing }: { open: boolean; onClose: () => void; title?: ReactNode; children: ReactNode; footer?: ReactNode; full?: boolean; trailing?: ReactNode }) {
  const reduce = useReducedMotion();
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [open, onClose]);
  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end" role="dialog" aria-modal="true">
          <motion.button
            type="button"
            aria-label="Хаах"
            className="absolute inset-0 bg-black/35"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
          />
          <motion.div
            className={cx("relative flex max-h-[92%] flex-col rounded-t-[22px] bg-stage shadow-[var(--sp-shadow-sheet)]", full && "h-[92%]")}
            initial={reduce ? { opacity: 0 } : { y: "100%" }}
            animate={reduce ? { opacity: 1 } : { y: 0 }}
            exit={reduce ? { opacity: 0 } : { y: "100%" }}
            transition={spring}
          >
            <div className="mx-auto mt-2 h-[5px] w-9 shrink-0 rounded-full bg-[var(--line)]" />
            {(title || trailing) && (
              <div className="grid shrink-0 grid-cols-[1fr_auto_1fr] items-center px-2 pb-1 pt-1">
                <button type="button" onClick={onClose} className="sp-tap h-11 justify-self-start rounded-full px-2 text-[17px] text-accent">
                  Болих
                </button>
                <div className="truncate text-[17px] font-semibold text-ink">{title}</div>
                <div className="justify-self-end">{trailing}</div>
              </div>
            )}
            <div className="sp-scroll min-h-0 flex-1">{children}</div>
            {footer && <div className="shrink-0 px-4 pb-[max(env(safe-area-inset-bottom),14px)] pt-2">{footer}</div>}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

export type AlertAction = { label: string; onClick: () => void; style?: "default" | "cancel" | "destructive" | "primary" };

/** HIG alert — эрсдэлтэй үйлдлийн баталгаажуулалт (7.4) */
export function Alert({ open, title, message, actions, onClose }: { open: boolean; title: string; message?: ReactNode; actions: AlertAction[]; onClose: () => void }) {
  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[60] grid place-items-center p-6" role="alertdialog" aria-modal="true" aria-label={title}>
          <motion.div className="absolute inset-0 bg-black/35" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
          <motion.div
            className="sp-material-paper relative w-full max-w-[300px] overflow-hidden rounded-[18px] text-center shadow-[0_30px_60px_-20px_rgb(0_0_0/0.4)]"
            initial={{ opacity: 0, scale: 1.12 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.96 }}
            transition={{ type: "spring", stiffness: 600, damping: 38 }}
          >
            <div className="px-5 pb-4 pt-5">
              <h2 className="text-[17px] font-semibold text-ink">{title}</h2>
              {message && <div className="mt-1.5 text-[14px] leading-snug text-ink-2">{message}</div>}
            </div>
            <div className={cx("border-t border-[var(--sp-sep)]", actions.length === 2 ? "grid grid-cols-2 [&>*+*]:border-l" : "flex flex-col [&>*+*]:border-t", "[&>*]:border-[var(--sp-sep)]")}>
              {actions.map((a) => (
                <button
                  key={a.label}
                  type="button"
                  onClick={() => {
                    tap();
                    a.onClick();
                  }}
                  className={cx(
                    "sp-row h-12 text-[17px]",
                    a.style === "destructive" ? "font-semibold text-danger" : a.style === "cancel" ? "text-accent" : "font-semibold text-accent",
                  )}
                >
                  {a.label}
                </button>
              ))}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

/** Энгийн баталгаажуулалтын hook */
export function useConfirm() {
  const [st, setSt] = useState<{ title: string; message?: ReactNode; ok: string; destructive?: boolean; run: () => void } | null>(null);
  const node = (
    <Alert
      open={!!st}
      title={st?.title ?? ""}
      message={st?.message}
      onClose={() => setSt(null)}
      actions={[
        { label: "Болих", style: "cancel", onClick: () => setSt(null) },
        {
          label: st?.ok ?? "OK",
          style: st?.destructive ? "destructive" : "primary",
          onClick: () => {
            const r = st?.run;
            setSt(null);
            r?.();
          },
        },
      ]}
    />
  );
  return { confirm: (o: NonNullable<typeof st>) => setSt(o), node };
}

type ToastMsg = { id: number; text: string; tone: "ok" | "danger" | "ink"; action?: { label: string; run: () => void } };
const toastSubs = new Set<(t: ToastMsg) => void>();
let toastId = 0;
export function toast(text: string, tone: ToastMsg["tone"] = "ink", action?: ToastMsg["action"]) {
  const t = { id: ++toastId, text, tone, action };
  toastSubs.forEach((f) => f(t));
}

/** Доод талд богино мэдэгдэл — 3 сек (undo-той бол 5) */
export function Toaster({ bottom = 96 }: { bottom?: number }) {
  const [list, setList] = useState<ToastMsg[]>([]);
  useEffect(() => {
    const f = (t: ToastMsg) => {
      setList((l) => [...l.slice(-1), t]);
      setTimeout(() => setList((l) => l.filter((x) => x.id !== t.id)), t.action ? 5000 : 3000);
    };
    toastSubs.add(f);
    return () => {
      toastSubs.delete(f);
    };
  }, []);
  return (
    <div className="pointer-events-none fixed inset-x-0 z-[70] flex flex-col items-center gap-2 px-4" style={{ bottom }} aria-live="polite">
      <AnimatePresence>
        {list.map((t) => (
          <motion.div
            key={t.id}
            initial={{ opacity: 0, y: 16, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8 }}
            transition={springSoft}
            className={cx(
              "pointer-events-auto flex max-w-[420px] items-center gap-3 rounded-[16px] px-4 py-3 text-[14px] font-medium shadow-[0_16px_40px_-14px_rgb(0_0_0/0.5)]",
              t.tone === "danger" ? "bg-danger text-white" : t.tone === "ok" ? "bg-ok text-white" : "bg-[#1c1c1f] text-white",
            )}
          >
            <Icon name={t.tone === "danger" ? "warn" : "check"} size={18} />
            <span className="min-w-0 flex-1">{t.text}</span>
            {t.action && (
              <button
                type="button"
                className="shrink-0 font-semibold text-accent-bright"
                onClick={() => {
                  t.action?.run();
                  setList((l) => l.filter((x) => x.id !== t.id));
                }}
              >
                {t.action.label}
              </button>
            )}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

/* ───────── дэлгэцийн шилжилт ───────── */

/** Push/pop шилжилт — шинэ дэлгэц баруунаас, буцахад зүүнээс */
export function Stack({ k, dir = 1, children }: { k: string; dir?: 1 | -1; children: ReactNode }) {
  const reduce = useReducedMotion();
  return (
    <AnimatePresence mode="popLayout" initial={false} custom={dir}>
      <motion.div
        key={k}
        custom={dir}
        className="absolute inset-0 flex flex-col bg-stage"
        initial={reduce ? { opacity: 0 } : { x: dir > 0 ? "100%" : "-30%", opacity: dir > 0 ? 1 : 0.6 }}
        animate={{ x: 0, opacity: 1 }}
        exit={reduce ? { opacity: 0 } : { x: dir > 0 ? "-30%" : "100%", opacity: dir > 0 ? 0.6 : 1 }}
        transition={{ type: "spring", stiffness: 420, damping: 44 }}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}

/* ───────── төхөөрөмжийн хүрээ ───────── */

/**
 * Ширээний дэлгэц дээр апп-ыг бодит хэмжээгээр (пос 6.75" = 360×800,
 * утас 390×844) хүрээтэй харуулна; жижиг дэлгэц / бодит төхөөрөмж дээр
 * бүтэн дэлгэцээр.
 */
export function DeviceFrame({ w, h, children, caption, aside }: { w: number; h: number; children: ReactNode; caption?: ReactNode; aside?: ReactNode }) {
  const [mode, setMode] = useState<{ framed: boolean; scale: number }>({ framed: false, scale: 1 });
  useEffect(() => {
    const fit = () => {
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const framed = vw >= w + 120 && vh >= 560;
      const scale = framed ? Math.min(1, (vh - 64) / (h + 22)) : 1;
      setMode({ framed, scale });
    };
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, [w, h]);

  if (!mode.framed) {
    return <div className="sp-device h-[100dvh] w-full">{children}</div>;
  }
  return (
    <div className="flex min-h-[100dvh] items-center justify-center gap-14 bg-[radial-gradient(120%_80%_at_50%_0%,var(--paper)_0%,var(--stage)_60%)] px-8">
      <div className="flex flex-col items-center" style={{ height: (h + 22) * mode.scale }}>
        <div style={{ width: w, height: h, transform: `scale(${mode.scale})`, transformOrigin: "top center" }}>
          <div className="sp-device sp-device--framed" style={{ width: w, height: h }}>
            {children}
          </div>
        </div>
        {caption && <div className="meta mt-auto pt-6 text-center">{caption}</div>}
      </div>
      {aside && <aside className="hidden max-w-[300px] xl:block">{aside}</aside>}
    </div>
  );
}

/** Апп-ын сэдэв (light/dark) солих — одоо байгаа gp-theme түлхүүрийг ашиглана */
export function useTheme() {
  const [theme, setTheme] = useState<"light" | "dark">("light");
  useEffect(() => {
    setTheme((document.documentElement.dataset.theme as "light" | "dark") ?? "light");
  }, []);
  const toggle = () => {
    const t = theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = t;
    try {
      localStorage.setItem("gp-theme", t);
    } catch {
      /* хувийн цонх */
    }
    setTheme(t);
  };
  return { theme, toggle };
}

export function Avatar({ text, size = 40, tone = "ink" }: { text: string; size?: number; tone?: "ink" | "accent" | "gray" }) {
  return (
    <span
      className={cx(
        "grid shrink-0 place-items-center rounded-full font-semibold",
        tone === "ink" && "bg-ink text-paper",
        tone === "accent" && "bg-accent-soft text-accent",
        tone === "gray" && "bg-[var(--sp-fill)] text-ink",
      )}
      style={{ width: size, height: size, fontSize: size * 0.36 }}
    >
      {text}
    </span>
  );
}
