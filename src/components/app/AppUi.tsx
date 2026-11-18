"use client";

import type { ReactNode } from "react";
import { moneyPlain } from "@/lib/demo";
import type { FinancePartner, Partner, ShopItem } from "@/lib/app-data";
import { ProductImage } from "@/components/ui";

/* Gerege аппын жижиг хэсгүүд. Кассын (ui.tsx) хэв загварыг өвлөнө —
   ижил өнгө, ижил тоон хэв, ижил улбар шар accent. */

/** Дэлгэц бүрхэх самбар — дэлгүүр, сагс, захиалга нээгдэнэ */
export function Panel({
  title,
  onClose,
  children,
  footer,
}: {
  title: ReactNode;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-40 flex justify-center bg-black/40" role="dialog" aria-modal="true">
      <div className="panel-in flex h-full w-full max-w-[440px] flex-col bg-stage">
        <header className="flex items-center gap-2 bg-paper px-2 py-2 ring-1 ring-hair">
          <button
            type="button"
            onClick={onClose}
            aria-label="Буцах"
            className="press grid size-11 place-items-center rounded-xl text-ink hover:bg-stage"
          >
            <svg viewBox="0 0 20 20" className="size-[18px]" aria-hidden="true">
              <path d="M12.5 4.5 7 10l5.5 5.5" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <div className="min-w-0 flex-1 text-[16px] font-bold tracking-[-0.02em] text-ink">{title}</div>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-6 pt-4">{children}</div>
        {footer && <div className="bg-paper px-4 pb-[max(16px,env(safe-area-inset-bottom))] pt-3 ring-1 ring-hair">{footer}</div>}
      </div>
    </div>
  );
}

export const Won = ({ value, className = "" }: { value: number; className?: string }) => (
  <span className={`tnum ${className}`}>
    {moneyPlain(value)}
    <span className="font-medium text-mute">₮</span>
  </span>
);

/** Хамтрагчийн тэмдэг — логогүй тул эхний үсэг, брэнд өнгө */
export function PartnerMark({ partner, size = 40 }: { partner: Partner; size?: number }) {
  return (
    <span
      className="grid shrink-0 place-items-center rounded-[12px] font-extrabold text-white"
      style={{ width: size, height: size, background: partner.color, fontSize: size * 0.42 }}
      aria-hidden="true"
    >
      {partner.mark}
    </span>
  );
}

/** Банк, төлбөрийн жинхэнэ лого — цагаан хайрцагт (брэнд өнгө харанхуй сэдэвт ч зөв).
    Үгэн лого (M bank, Голомт) өргөн хайрцагт, icon лого дөрвөлжинд. */
export function FinanceLogo({ partner, height = 40 }: { partner: FinancePartner; height?: number }) {
  return (
    <span
      className="grid shrink-0 place-items-center overflow-hidden rounded-[12px] bg-white ring-1 ring-inset ring-black/5"
      style={{ height, width: partner.wide ? height * 2.6 : height, padding: partner.wide ? "0 8px" : 4 }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- жижиг лого, хэмжээ нь мэдэгдэж байгаа */}
      <img src={partner.logo} alt={partner.name} className="max-h-full max-w-full object-contain" />
    </span>
  );
}

/**
 * Банкны урамшууллын купон — брэнд өнгөний градиент, цагаан хавтан дээр лого,
 * гол урамшуулал том тоогоор («+5%», «3,000₮»), саарал дагавартай.
 * Карусельд (compact) ба дэлгэрэнгүй цонхны толгойд (бүтэн өргөн) нэг загвар.
 */
export function FinanceCoupon({ partner, isNew, wide }: { partner: FinancePartner; isNew?: boolean; wide?: boolean }) {
  return (
    <span
      className={`relative flex flex-col overflow-hidden rounded-[22px] text-left text-white ${wide ? "h-[184px] w-full p-5" : "h-[156px] w-[236px] p-4"}`}
      style={{ background: `linear-gradient(135deg, ${partner.bg[0]} 0%, ${partner.bg[1]} 100%)` }}
    >
      {/* Гэрлийн тусгал + купоны цоолбор — «картан» мэдрэмж */}
      <span className="pointer-events-none absolute -right-10 -top-12 size-40 rounded-full bg-white/15 blur-2xl" aria-hidden="true" />
      <span className="pointer-events-none absolute -left-2.5 top-[58%] size-5 rounded-full bg-stage" aria-hidden="true" />
      <span className="pointer-events-none absolute -right-2.5 top-[58%] size-5 rounded-full bg-stage" aria-hidden="true" />

      <span className="relative flex items-start justify-between gap-2">
        <span
          className="grid place-items-center rounded-[10px] bg-white shadow-[0_6px_14px_-8px_rgb(0_0_0/0.5)]"
          style={{ height: wide ? 40 : 34, width: partner.wide ? (wide ? 112 : 92) : wide ? 40 : 34, padding: partner.wide ? "3px 8px" : 3 }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- жижиг лого, хэмжээ нь мэдэгдэж байгаа */}
          <img src={partner.logo} alt={partner.name} className="size-full object-contain" />
        </span>
        <span className="rounded-full bg-white/15 px-2 py-1 text-[10.5px] font-bold tracking-[0.06em] text-white backdrop-blur">
          {isNew ? "ШИНЭ" : `${partner.until} хүртэл`}
        </span>
      </span>

      <span className="relative mt-auto">
        <span className="flex items-baseline gap-1.5">
          <span className={`tnum font-extrabold leading-none tracking-[-0.045em] ${wide ? "text-[46px]" : "text-[31px]"}`}>{partner.headline}</span>
          <span className={`font-semibold text-white/70 ${wide ? "text-[16px]" : "text-[13px]"}`}>{partner.headlineSub}</span>
        </span>
        <span className="mt-1.5 block truncate text-[12px] text-white/65">
          {partner.name} · {partner.kind}
        </span>
      </span>
    </span>
  );
}

export function SectionHead({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <div className="mb-3 mt-7 flex items-center justify-between">
      <h2 className="text-[17px] font-bold tracking-[-0.03em] text-ink">{title}</h2>
      {action}
    </div>
  );
}

/** Урамшууллын тэмдэг: «−20%» эсвэл «1+1» */
export const DealBadge = ({ deal }: { deal: string }) => (
  <span className="tnum rounded-full bg-accent px-2 py-1 text-[11px] font-bold leading-none text-[color:var(--accent-ink)]">{deal}</span>
);

/** Барааны карт — урамшуулал, дэлгүүрийн хуудас хоёулаа ашиглана */
export function ItemCard({
  item,
  partner,
  qty,
  onAdd,
  showShop,
  onShop,
}: {
  item: ShopItem;
  partner?: Partner;
  qty: number;
  onAdd: () => void;
  showShop?: boolean;
  /** Дэлгүүрийн нэр дээр дарахад дэлгүүрийг нээх */
  onShop?: () => void;
}) {
  return (
    <div className="relative flex flex-col overflow-hidden rounded-[18px] bg-paper ring-1 ring-inset ring-hair">
      <span className="plate relative block h-[120px] w-full rounded-none!">
        <ProductImage src={item.product.image} name={item.product.name} sizes="200px" pad="p-3" />
        {item.deal && (
          <span className="absolute left-2 top-2">
            <DealBadge deal={item.deal} />
          </span>
        )}
      </span>
      <span className="flex flex-1 flex-col p-3">
        {showShop && partner && (
          <button type="button" onClick={onShop} className="mb-1 flex min-w-0 items-center gap-1.5 text-left text-[11px] font-semibold text-mute hover:text-ink">
            <span className="size-2 shrink-0 rounded-full" style={{ background: partner.color }} />
            <span className="truncate">{partner.name} →</span>
          </button>
        )}
        <span className="line-clamp-2 text-[14px] font-bold leading-snug tracking-[-0.02em] text-ink">{item.product.name}</span>
        <span className="mt-auto flex items-end justify-between gap-2 pt-2">
          <span>
            {item.oldPrice && <span className="tnum block text-[11px] text-mute line-through">{moneyPlain(item.oldPrice)}₮</span>}
            <Won value={item.price} className="text-[15px] font-bold text-ink" />
          </span>
          <button
            type="button"
            onClick={onAdd}
            aria-label={`${item.product.name} сагсанд нэмэх`}
            className={`press grid size-9 shrink-0 place-items-center rounded-full text-[14px] font-bold ${
              qty > 0 ? "bg-accent text-[color:var(--accent-ink)]" : "bg-ink text-paper"
            }`}
          >
            {qty > 0 ? qty : "+"}
          </button>
        </span>
        {item.dealEnds && <span className="tnum mt-1.5 text-[11px] text-mute">{item.dealEnds} хүртэл</span>}
      </span>
    </div>
  );
}
