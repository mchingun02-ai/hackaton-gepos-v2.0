"use client";

import Image from "next/image";
import { type ReactNode, useState } from "react";
import { moneyPlain, unitOf } from "@/lib/demo";
import { IconMinus, IconPlus } from "@/components/icons";

/** Зураг, дутуу үед нь нэрийн эхний үсэг. Каталогт зураггүй бараа үргэлж байна. */
export function ProductImage({
  src,
  name,
  sizes,
  pad,
}: {
  src: string;
  name: string;
  sizes: string;
  pad: string;
}) {
  const [broken, setBroken] = useState(false);

  if (broken || !src) {
    return (
      <span className="grid size-full place-items-center text-[#9a9aa2]">
        <span className="text-xl font-bold">{name.slice(0, 1).toUpperCase()}</span>
      </span>
    );
  }

  // Камераас авсан зураг data: URL хэлбэртэй ирдэг. next/image үүнийг
  // оновчлох боломжгүй тул энгийн img-ээр дүрслэнэ.
  if (src.startsWith("data:")) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt=""
        className={`absolute inset-0 size-full object-contain ${pad}`}
        onError={() => setBroken(true)}
      />
    );
  }

  return <Image src={src} alt="" fill sizes={sizes} className={pad} onError={() => setBroken(true)} />;
}

/**
 * Мөнгөн дүн — tabular тоо, ₮ нь тооноос жижиг, сааралдуу.
 *
 * Бүх дэлгэц дээр дүнг ЭНЭ-гээр бичнэ; `{moneyPlain(x)}₮` гэж гараар
 * залгавал ₮ нь тоотой адил жинтэй болж, тоо уншигдахаа болино.
 * `sign` нь өмнөх тэмдэг (−, +) — тоотой нэг өнгөөр гарна.
 */
export function Money({
  value,
  sign,
  className = "",
}: {
  value: number;
  sign?: string;
  className?: string;
}) {
  return (
    <span className={`tnum whitespace-nowrap ${className}`}>
      {sign}
      {moneyPlain(value)}
      <span className="ml-px text-[0.78em] font-medium text-mute">₮</span>
    </span>
  );
}

/**
 * Үнэ — тод бэх, нэгжтэй бол саарал /кг. Өмнө нь үнэ бүрийн доор улбар шар
 * зураас байсан: 24 хавтантай торонд 24 accent болж, сагсны товч алга
 * болдог байв. Үнэ нь мэдээлэл — accent биш.
 */
export function PriceTag({ value, old, unit }: { value: number; old?: number; unit?: string }) {
  return (
    <span className="flex flex-wrap items-baseline gap-x-1.5">
      <span className="text-[15px] font-bold tracking-[-0.02em] text-ink">
        <Money value={value} />
        {unit && unit !== "ш" && (
          <span className="text-[12px] font-semibold text-mute">/{unit}</span>
        )}
      </span>
      {old !== undefined && (
        <span className="tnum text-[12px] font-medium text-mute line-through">
          {moneyPlain(old)}₮
        </span>
      )}
    </span>
  );
}

/**
 * Тоо хэмжээний степпер — сагсны мөрөнд.
 * Товчнууд 36px: кассчин хурдан дарахад 28px алддаг байсан. «+» нь бэх —
 * сагсанд 6 мөр байхад 6 улбар шар товч гарахгүй.
 */
export function Stepper({
  qty,
  unit = "ш",
  onLess,
  onMore,
  onPick,
  compact,
}: {
  qty: number;
  unit?: string;
  onLess: () => void;
  onMore: () => void;
  /** Бутархай нэгжид тоог гараар оруулах */
  onPick?: () => void;
  /** Нарийн дэлгэцэд багтаах — жижиг товч, богино зай */
  compact?: boolean;
}) {
  const meta = unitOf(unit);
  const shown = meta.fractional
    ? Number(qty.toFixed(3)).toLocaleString("en-US", { maximumFractionDigits: 3 })
    : String(Math.round(qty));

  const box = compact ? "size-8" : "size-9";

  return (
    <span className="inline-flex items-center gap-1 rounded-xl bg-stage p-0.5">
      <button
        type="button"
        onClick={onLess}
        disabled={qty === 0}
        className={`press grid ${box} place-items-center rounded-[10px] text-ink-2 hover:bg-paper hover:text-ink disabled:opacity-35`}
        aria-label="Хасах"
      >
        <IconMinus />
      </button>

      {meta.fractional && onPick ? (
        <button
          type="button"
          onClick={onPick}
          title="Тоо хэмжээ оруулах"
          className="press tnum min-w-[56px] rounded-[10px] px-1.5 py-1 text-[13px] font-bold text-ink underline decoration-line decoration-dotted underline-offset-4"
        >
          {shown} {meta.key}
        </button>
      ) : (
        <span className={`tnum text-center font-bold text-ink ${compact ? "w-6 text-[13px]" : "w-7 text-[14px]"}`}>
          {shown}
        </span>
      )}

      <button
        type="button"
        onClick={onMore}
        className={`press grid ${box} place-items-center rounded-[10px] bg-ink text-paper`}
        aria-label="Нэмэх"
      >
        <IconPlus />
      </button>
    </span>
  );
}

/* Хуучин string-ууд — торны товч, жижиг газарт хэрэглэсээр байна */
export const btnPrimary =
  "press flex h-[52px] w-full items-center justify-center rounded-xl bg-accent text-[15px] font-bold text-[color:var(--accent-ink)] disabled:opacity-40";

export const btnGhost =
  "press flex h-10 items-center gap-2 rounded-xl px-4 text-[13px] font-semibold text-ink-2 ring-1 ring-inset ring-hair hover:text-ink hover:ring-line";

/**
 * Үндсэн үйлдлийн товч — дизайны хэлний «pill + дугуй сум» (globals.css .gb).
 *
 * Дэлгэц бүрт ийм товч ГАНЦ байна: Үргэлжлүүлэх, Төлбөр авах, Хадгалах.
 * Сум нь «цааш» гэсэн утгатай тул урагшлуулдаггүй үйлдэлд (Хадгалах)
 * `arrow={false}`. Харанхуйд сэдэв өөрөө улбар шарыг тодруулна.
 */
export function PrimaryButton({
  children,
  onClick,
  disabled,
  arrow = true,
  tone = "accent",
  size = "md",
  className = "",
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  arrow?: boolean;
  /** `ink` — хуудсан дээр accent аль хэдийн зарцуулагдсан үед */
  tone?: "accent" | "ink";
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const sizeClass = size === "lg" ? "gb--lg" : size === "sm" ? "gb--sm" : "";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`gb gb--block ${tone === "accent" ? "gb--primary" : "gb--dark"} ${sizeClass} ${
        arrow ? "" : "justify-center! pr-6!"
      } ${className}`}
    >
      <span className="gb-bloom" aria-hidden="true" />
      <span className="gb-label">{children}</span>
      {arrow && (
        <span className="gb-chip" aria-hidden="true">
          <svg
            className="gb-arrow"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M5 12h14M13 6l6 6-6 6" />
          </svg>
        </span>
      )}
    </button>
  );
}

/** Сонголтын чип — ангилал, шүүлтүүр, нэгж, төлбөрийн арга (globals.css .chip) */
export function Chip({
  on,
  onClick,
  children,
  outlined,
  large,
  className = "",
  title,
}: {
  on: boolean;
  onClick: () => void;
  children: ReactNode;
  /** Цагаан дэвсгэр дээр саарал биш, хүрээтэй */
  outlined?: boolean;
  large?: boolean;
  className?: string;
  title?: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      title={title}
      className={`press chip ${outlined ? "chip--line" : ""} ${large ? "chip--lg" : ""} ${className}`}
    >
      {children}
    </button>
  );
}

/** Тоон хураангуйн хайрцаг — дашбоард, тайланд */
export function Stat({
  label,
  value,
  hint,
  tone = "ink",
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  tone?: "ink" | "accent" | "ok" | "warn";
}) {
  const colour =
    tone === "accent"
      ? "text-accent"
      : tone === "ok"
        ? "text-ok"
        : tone === "warn"
          ? "text-warn"
          : "text-ink";
  return (
    <div className="rounded-[18px] bg-paper p-4 ring-1 ring-inset ring-hair">
      <span className="meta">{label}</span>
      <div className={`tnum mt-2 text-[26px] font-bold leading-none tracking-[-0.035em] ${colour}`}>
        {value}
      </div>
      {hint && <div className="mt-1.5 text-[12px] text-mute">{hint}</div>}
    </div>
  );
}

/** Жагсаалтын толгой — хүснэгтийн баганын нэр */
export function Th({ children, align = "left" }: { children: ReactNode; align?: "left" | "right" }) {
  return (
    <th
      className={`meta border-b border-hair pb-2.5 font-semibold ${
        align === "right" ? "text-right" : "text-left"
      }`}
    >
      {children}
    </th>
  );
}

export function Td({
  children,
  align = "left",
  className = "",
}: {
  children: ReactNode;
  align?: "left" | "right";
  className?: string;
}) {
  return (
    <td
      className={`py-3 text-[14px] first:pl-1 last:pr-1 ${
        align === "right" ? "text-right" : "text-left"
      } ${className}`}
    >
      {children}
    </td>
  );
}

/** Хоосон төлөв — чимэглэлгүй, нэг мөр мета; хүсвэл доор нь үйлдэл */
export function Empty({ text, action }: { text: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-14 text-center">
      <span
        className="grid size-10 place-items-center rounded-full ring-1 ring-inset ring-hair text-mute"
        aria-hidden="true"
      >
        <svg viewBox="0 0 20 20" className="size-4" fill="none" stroke="currentColor" strokeWidth={1.6}>
          <path d="M4 10h12" strokeLinecap="round" strokeDasharray="2 3" />
        </svg>
      </span>
      <span className="meta">{text}</span>
      {action}
    </div>
  );
}

/** Баруун талаас гарах хуудас — бүх нэмэх/засах форм үүнийг хуваалцана */
export function Sheet({
  title,
  onClose,
  footer,
  children,
}: {
  title: string;
  onClose: () => void;
  footer: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="absolute inset-0 z-30 flex justify-end bg-black/40">
      <div className="flex h-full w-full max-w-[440px] flex-col bg-paper">
        <div className="flex items-center justify-between border-b border-hair py-3 pl-5 pr-3">
          <h2 className="text-[17px] font-bold tracking-[-0.03em] text-ink">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Хаах"
            className="press grid size-11 place-items-center rounded-xl text-ink-2 hover:bg-stage hover:text-ink"
          >
            <svg viewBox="0 0 22 22" className="size-[19px]" aria-hidden="true">
              <path
                d="M6 6l10 10M16 6 6 16"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.8}
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5">{children}</div>
        <div className="border-t border-hair p-4">{footer}</div>
      </div>
    </div>
  );
}

export function Field({
  label,
  value,
  onChange,
  placeholder,
  numeric,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  numeric?: boolean;
}) {
  return (
    <label className="block">
      <span className="meta mb-1.5 block">{label}</span>
      <input
        value={value}
        onChange={(event) =>
          onChange(numeric ? event.target.value.replace(/\D/g, "") : event.target.value)
        }
        inputMode={numeric ? "numeric" : undefined}
        placeholder={placeholder}
        className={`h-12 w-full rounded-xl bg-stage px-3.5 text-[15px] text-ink ring-1 ring-inset ring-transparent placeholder:text-mute focus:bg-paper focus:outline-none focus:ring-accent ${
          numeric ? "tnum" : ""
        }`}
      />
    </label>
  );
}
