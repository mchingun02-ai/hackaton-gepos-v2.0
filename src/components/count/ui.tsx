"use client";

/** Тооллогын PWA-ийн жижиг UI хэсгүүд — GePOS v2.0 (.gp2), том хүрэлтийн талбай (≥ 52px). */
import type { ReactNode } from "react";
import { Icon, type IconName } from "@/components/sp/icons";
import { cx } from "@/components/sp/ui";
import type { Level } from "@/lib/inventory/reconcile";
import type { LineStatus, SessionStatus } from "./types";

export const fmt = (n: number | null | undefined, d = 2) => (n == null ? "—" : Number(n.toFixed(d)).toLocaleString("en-US"));
export const money = (n: number | null | undefined) => (n == null ? "—" : `${Math.round(n).toLocaleString("en-US")}₮`);

const LEVEL: Record<Level, { label: string; cls: string; icon: IconName }> = {
  ok: { label: "Таарсан", cls: "bg-ok-soft text-ok", icon: "check" },
  warn: { label: "Шалгах", cls: "bg-warn-soft text-warn", icon: "warn" },
  critical: { label: "Дахин тоолох", cls: "bg-danger-soft text-danger", icon: "undo" },
};
/** Түвшин — өнгө + үг хоёулаа */
export function LevelChip({ level }: { level: Level | null | undefined }) {
  if (!level) return null;
  const l = LEVEL[level];
  return (
    <span className={cx("inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[13px] font-semibold", l.cls)}>
      <Icon name={l.icon} size={14} />
      {l.label}
    </span>
  );
}

const LINE: Record<LineStatus, { label: string; cls: string }> = {
  pending: { label: "Тоолоогүй", cls: "bg-[var(--sp-fill)] text-mute" },
  counted: { label: "Тоолсон", cls: "bg-accent-soft text-accent" },
  recount: { label: "Дахин тоолох", cls: "bg-danger-soft text-danger" },
  recounted: { label: "Дахин тоолсон", cls: "bg-accent-soft text-accent" },
  skipped: { label: "Алгассан", cls: "bg-[var(--sp-fill)] text-mute" },
};
export function LineChip({ status }: { status: LineStatus }) {
  const l = LINE[status] ?? LINE.pending;
  return <span className={cx("inline-flex items-center rounded-full px-2.5 py-1 text-[12.5px] font-semibold", l.cls)}>{l.label}</span>;
}

const SESS: Record<SessionStatus, { label: string; cls: string }> = {
  counting: { label: "Тоолж байна", cls: "bg-accent-soft text-accent" },
  review: { label: "Хянагдаж байна", cls: "bg-warn-soft text-warn" },
  approved: { label: "ПОС хүлээн авч байна", cls: "bg-warn-soft text-warn" },
  applied: { label: "Батлагдсан", cls: "bg-ok-soft text-ok" },
  cancelled: { label: "Цуцалсан", cls: "bg-[var(--sp-fill)] text-mute" },
};
export function SessionChip({ status }: { status: SessionStatus }) {
  const s = SESS[status];
  return <span className={cx("inline-flex items-center rounded-full px-2.5 py-1 text-[12.5px] font-semibold", s.cls)}>{s.label}</span>;
}

/** Дэлгэцийн толгой: буцах + гарчиг + баруун үйлдэл */
export function TopBar({ title, sub, onBack, right }: { title: ReactNode; sub?: ReactNode; onBack?: () => void; right?: ReactNode }) {
  return (
    <header className="sp-material sticky top-0 z-30 flex min-h-[60px] items-center gap-1 border-b border-[var(--sp-sep)] px-2 pt-[env(safe-area-inset-top)]">
      {onBack ? (
        <button type="button" onClick={onBack} aria-label="Буцах" className="sp-tap grid size-[52px] shrink-0 place-items-center rounded-full text-accent">
          <Icon name="back" size={26} />
        </button>
      ) : (
        <span className="w-3" />
      )}
      <div className="min-w-0 flex-1 py-2">
        <div className="truncate text-[18px] font-bold leading-tight text-ink">{title}</div>
        {sub && <div className="truncate text-[13px] text-mute">{sub}</div>}
      </div>
      {right}
    </header>
  );
}

/** Доод талын бэхэлсэн үйлдлийн хэсэг */
export function BottomBar({ children }: { children: ReactNode }) {
  return <div className="sp-material fixed inset-x-0 bottom-0 z-30 border-t border-[var(--sp-sep)] px-3 pb-[max(env(safe-area-inset-bottom),12px)] pt-3">{children}</div>;
}

/** Том ± товчтой тоон талбар */
export function NumField({
  label,
  value,
  onChange,
  step = 1,
  min = 0,
  decimal,
  hint,
  autoFocus,
  name,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  step?: number;
  min?: number;
  decimal?: boolean;
  hint?: string;
  autoFocus?: boolean;
  name?: string;
}) {
  const n = Number(value || 0);
  const set = (x: number) => onChange(String(Math.max(min, Math.round(x * 1000) / 1000)));
  return (
    <label className="block">
      <span className="flex items-baseline justify-between text-[14px] font-medium text-mute">
        {label}
        {hint && <span className="text-[12.5px]">{hint}</span>}
      </span>
      <div className="mt-1.5 flex items-stretch gap-2">
        <button type="button" aria-label={`${label} хасах`} onClick={() => set(n - step)} className="sp-tap grid h-[56px] w-[56px] shrink-0 place-items-center rounded-[16px] bg-[var(--sp-fill)] text-ink">
          <Icon name="minus" size={24} />
        </button>
        <input
          name={name}
          autoFocus={autoFocus}
          inputMode={decimal ? "decimal" : "numeric"}
          enterKeyHint="done"
          value={value}
          onChange={(e) => onChange(e.target.value.replace(decimal ? /[^\d.]/g : /\D/g, "").slice(0, 9))}
          onFocus={(e) => e.currentTarget.select()}
          className="sp-field h-[56px] min-w-0 flex-1 text-center text-[24px] font-bold tnum"
        />
        <button type="button" aria-label={`${label} нэмэх`} onClick={() => set(n + step)} className="sp-tap grid h-[56px] w-[56px] shrink-0 place-items-center rounded-[16px] bg-[var(--sp-fill)] text-ink">
          <Icon name="plus" size={24} />
        </button>
      </div>
    </label>
  );
}

export function ErrorNote({ children }: { children: ReactNode }) {
  return (
    <div role="alert" className="flex items-start gap-2 rounded-[14px] bg-danger-soft px-3.5 py-3 text-[14.5px] text-danger">
      <Icon name="warn" size={18} className="mt-0.5 shrink-0" />
      <span>{children}</span>
    </div>
  );
}

export function InfoNote({ children, tone = "accent" }: { children: ReactNode; tone?: "accent" | "warn" | "ok" }) {
  const cls = tone === "warn" ? "bg-warn-soft text-warn" : tone === "ok" ? "bg-ok-soft text-ok" : "bg-accent-soft text-accent";
  return (
    <div role="status" className={cx("flex items-start gap-2 rounded-[14px] px-3.5 py-3 text-[14.5px]", cls)}>
      <Icon name={tone === "warn" ? "warn" : tone === "ok" ? "check" : "info"} size={18} className="mt-0.5 shrink-0" />
      <span>{children}</span>
    </div>
  );
}

/** Камерын оролт — утасны жинхэнэ камер (бүтэн нягтрал) */
/**
 * Утасны жинхэнэ камер (бүтэн нягтрал) — ЗУРАГ авна; амьд баркод уншигч (ZXing) огт асаахгүй.
 * `gallery` — capture-гүй, олон зураг сонгох (бүтэн эгнээг нэг дор): файл бүр өөрийн «Тавиур N».
 */
export function CameraInput({ onFile, onFiles, id, gallery }: { onFile?: (f: File) => void; onFiles?: (f: File[]) => void; id: string; gallery?: boolean }) {
  return (
    <input
      id={id}
      type="file"
      accept="image/*"
      {...(gallery ? { multiple: true } : { capture: "environment" as const })}
      className="sr-only"
      onChange={(e) => {
        const fs = Array.from(e.target.files ?? []).slice(0, 20);
        e.target.value = "";
        if (!fs.length) return;
        if (onFiles) onFiles(fs);
        else onFile?.(fs[0]);
      }}
    />
  );
}

/** Камерын дүрс (icons.tsx-д байхгүй) */
export function CamIcon({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z" />
      <circle cx="12" cy="13" r="3.5" />
    </svg>
  );
}
