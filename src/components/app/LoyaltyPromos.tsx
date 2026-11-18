"use client";

import { useEffect, useRef, useState } from "react";
import { animate, motion, useReducedMotion } from "motion/react";
import { moneyPlain } from "@/lib/demo";
import { type Promo, type PromoTeaser, customerApi } from "@/lib/customer-api";
import { Chip, btnGhost } from "@/components/ui";
import { SectionHead } from "@/components/app/AppUi";

/**
 * Хэрэглэгчийн апп — элссэн дэлгүүрүүдийн ОНООНЫ урамшуулал (серверээс).
 * Купон байхгүй: касс дээр гишүүний QR уншуулахад сервер автоматаар тооцно. Зэрэглэлд
 * хамаарахгүйг саарал «🔒»-оор, удахгүй эхлэхийг тусад нь харуулна.
 */

const EASE = [0.2, 0.8, 0.2, 1] as const;
const DAY = 86_400_000;
const pad = (n: number) => String(n).padStart(2, "0");
const md = (iso: string) => {
  const d = new Date(iso);
  return `${pad(d.getMonth() + 1)}/${pad(d.getDate())}`;
};
/** «3 хоног үлдсэн», «өнөөдөр дуусна», «10/16-нд эхэлнэ» */
export const promoWhen = (p: Promo, now = Date.now()) => {
  if (p.status === "scheduled") return `${md(p.startsAt)}-нд эхэлнэ`;
  const left = new Date(p.endsAt).getTime() - now;
  if (left < DAY) return "өнөөдөр дуусна";
  return `${md(p.endsAt)} хүртэл · ${Math.ceil(left / DAY)} хоног`;
};
const whoFor = (p: Promo) => (p.tierNames?.length ? `${p.tierNames.join(", ")} гишүүнд` : "Бүх гишүүнд");
const condition = (p: Promo) =>
  p.kind === "threshold_bonus" && p.minAmount !== null ? `${moneyPlain(p.minAmount)}₮-өөс дээш худалдан авалтад` : "Худалдан авалт бүрт";

/** Тоо өсөж/буурч очих (оноо) — «Хөдөлгөөн багасгах» тохиргоонд шууд */
export function CountUp({ value, className }: { value: number; className?: string }) {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLSpanElement>(null);
  const prev = useRef(value);
  useEffect(() => {
    const el = ref.current;
    const from = prev.current;
    prev.current = value;
    if (!el) return;
    if (reduce || from === value) {
      el.textContent = moneyPlain(value);
      return;
    }
    const ctl = animate(from, value, { duration: 0.9, ease: EASE, onUpdate: (v) => (el.textContent = moneyPlain(Math.round(v))) });
    return () => ctl.stop();
  }, [value, reduce]);
  return (
    <span ref={ref} className={className}>
      {moneyPlain(value)}
    </span>
  );
}

/** Дэлгүүрийн тэмдэг: лого байвал лого, эсвэл / ачаалагдахгүй бол картын өнгө */
export function ProgramMark({ color, src, size = "size-9" }: { color: string; src: string | null; size?: string }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) return <span className={`${size} shrink-0 rounded-xl`} style={{ background: color }} />;
  return (
    <span className={`grid ${size} shrink-0 place-items-center overflow-hidden rounded-xl bg-white ring-1 ring-inset ring-hair`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt="" className="size-full object-contain" onError={() => setFailed(true)} />
    </span>
  );
}

function LiveDot() {
  return (
    <span className="relative inline-flex size-2">
      <motion.span
        className="absolute inset-0 rounded-full bg-ok"
        animate={{ scale: [1, 2.2], opacity: [0.5, 0] }}
        transition={{ duration: 1.6, repeat: Infinity, ease: "easeOut" }}
      />
      <span className="relative size-2 rounded-full bg-ok" />
    </span>
  );
}

const Badge = ({ text, big = false }: { text: string; big?: boolean }) => (
  <span className={`tnum shrink-0 rounded-lg bg-accent font-extrabold tracking-[-0.02em] text-[color:var(--accent-ink)] ${big ? "px-2.5 py-1 text-[15px]" : "px-2 py-0.5 text-[12px]"}`}>
    {text}
  </span>
);

/** Нүүр: «Танд зориулсан» — хажуу тийш гүйлгэдэг товч картууд */
export function PromoStrip({ promos, onAll }: { promos: Promo[]; onAll: () => void }) {
  const list = promos.filter((p) => p.eligible && p.status === "live").slice(0, 8);
  if (!list.length) return null;
  return (
    <>
      <SectionHead
        title="Танд зориулсан"
        action={
          <button type="button" className="text-[12.5px] font-semibold text-mute hover:text-ink" onClick={onAll}>
            Бүгд
          </button>
        }
      />
      <div className="no-bar -mx-4 flex gap-2.5 overflow-x-auto px-4 pb-1">
        {list.map((p, i) => (
          <motion.button
            key={p.id}
            type="button"
            onClick={onAll}
            initial={{ opacity: 0, x: 24 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.05 * i, duration: 0.4, ease: EASE }}
            whileTap={{ scale: 0.97 }}
            className="w-[210px] shrink-0 rounded-[18px] bg-paper p-4 text-left ring-1 ring-inset ring-hair"
          >
            <div className="flex items-center justify-between gap-2">
              <ProgramMark color={p.bgColor ?? "#4002FF"} src={customerApi.logoSrc(p.logoUrl)} size="size-8" />
              <Badge text={p.badge} />
            </div>
            <p className="mt-3 line-clamp-2 text-[14px] font-bold leading-snug text-ink">{p.title}</p>
            <p className="mt-0.5 truncate text-[12px] text-mute">{p.merchantName}</p>
            <p className="mt-2 flex items-center gap-1.5 text-[11.5px] font-semibold text-ink-2">
              <LiveDot />
              {promoWhen(p)}
            </p>
          </motion.button>
        ))}
      </div>
    </>
  );
}

function PromoCard({ p, index }: { p: Promo; index: number }) {
  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ delay: Math.min(index, 8) * 0.04, duration: 0.35, ease: EASE }}
      className={`rounded-[20px] bg-paper p-4 ring-1 ring-inset ring-hair ${p.eligible ? "" : "opacity-60"}`}
    >
      <div className="flex items-center gap-3">
        <ProgramMark color={p.bgColor ?? "#4002FF"} src={customerApi.logoSrc(p.logoUrl)} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-bold text-ink">{p.merchantName}</span>
          <span className="block truncate text-[11.5px] text-mute">
            {p.eligible ? "" : "🔒 "}
            {whoFor(p)}
          </span>
        </span>
        <Badge text={p.badge} big />
      </div>
      <p className="mt-3 text-[15.5px] font-bold leading-snug tracking-[-0.01em] text-ink">{p.title}</p>
      <p className="mt-0.5 text-[12.5px] leading-relaxed text-ink-2">
        {condition(p)}
        {p.description ? ` · ${p.description}` : ""}
      </p>
      <div className="mt-3 flex items-center justify-between gap-2 border-t border-hair pt-3 text-[11.5px] font-semibold">
        <span className={`flex items-center gap-1.5 ${p.status === "live" ? "text-ink-2" : "text-mute"}`}>
          {p.status === "live" && <LiveDot />}
          {promoWhen(p)}
        </span>
        <span className="text-mute">{p.eligible ? "QR уншуулахад автоматаар" : "Таны зэрэглэлд хамаарахгүй"}</span>
      </div>
    </motion.li>
  );
}

/** «Урамшуулал» таб — элссэн дэлгүүрүүдийн бүх урамшуулал + элсээгүй дэлгүүрүүд */
export function PromoTab({
  promos,
  others,
  busy,
  onJoin,
}: {
  promos: Promo[];
  others: PromoTeaser[];
  busy: string | null;
  onJoin: (merchantId: string) => void;
}) {
  const [shop, setShop] = useState("all");
  const shops = [...new Map(promos.map((p) => [p.merchantId, p.merchantName])).entries()];
  const shown = promos.filter((p) => shop === "all" || p.merchantId === shop);
  const live = shown.filter((p) => p.status === "live").sort((a, b) => Number(b.eligible) - Number(a.eligible));
  const soon = shown.filter((p) => p.status === "scheduled");

  return (
    <>
      <section className="mt-6">
        <p className="meta">Элссэн дэлгүүрүүд</p>
        <h1 className="mt-1.5 text-[30px] font-extrabold leading-[0.98] tracking-[-0.045em] text-ink">
          Урамшуулал<span className="text-accent">.</span>
        </h1>
        <p className="mt-2 text-[13px] text-mute">Купон хэрэггүй — касс дээр гишүүний QR-аа уншуулахад оноо автоматаар нэмэгдэнэ.</p>
      </section>

      {shops.length > 1 && (
        <div className="no-bar -mx-4 mt-4 flex gap-2 overflow-x-auto px-4">
          <Chip on={shop === "all"} onClick={() => setShop("all")} outlined>
            Бүгд · {promos.length}
          </Chip>
          {shops.map(([id, name]) => (
            <Chip key={id} on={shop === id} onClick={() => setShop(id)} outlined>
              {name}
            </Chip>
          ))}
        </div>
      )}

      {promos.length === 0 && (
        <p className="mt-5 rounded-[18px] bg-paper px-4 py-4 text-[13.5px] leading-relaxed text-ink-2 ring-1 ring-inset ring-hair">
          Элссэн дэлгүүрүүдэд одоогоор урамшуулал алга. Шинэ урамшуулал зарлагдмагц энд гарна.
        </p>
      )}

      {live.length > 0 && (
        <>
          <SectionHead title="Одоо явагдаж байна" />
          <ul className="space-y-2.5">
            {live.map((p, i) => (
              <PromoCard key={p.id} p={p} index={i} />
            ))}
          </ul>
        </>
      )}
      {soon.length > 0 && (
        <>
          <SectionHead title="Удахгүй" />
          <ul className="space-y-2.5">
            {soon.map((p, i) => (
              <PromoCard key={p.id} p={p} index={i + live.length} />
            ))}
          </ul>
        </>
      )}

      {others.length > 0 && (
        <>
          <SectionHead title="Элсээгүй дэлгүүрүүд" />
          <ul className="space-y-2">
            {others.map((o, i) => (
              <motion.li
                key={o.merchantId}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.04 * i, duration: 0.3, ease: EASE }}
                className="flex items-center gap-3 rounded-[18px] bg-paper px-4 py-3 ring-1 ring-inset ring-hair"
              >
                <ProgramMark color={o.bgColor ?? "#4002FF"} src={customerApi.logoSrc(o.logoUrl)} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] font-bold text-ink">{o.merchantName}</span>
                  <span className="block text-[12px] text-accent">{o.count} урамшуулал · элсэж авна</span>
                </span>
                <button type="button" className={btnGhost} disabled={busy === o.merchantId} onClick={() => onJoin(o.merchantId)}>
                  {busy === o.merchantId ? "…" : "Элсэх"}
                </button>
              </motion.li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}
