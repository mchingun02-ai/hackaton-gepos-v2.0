"use client";

import { useState } from "react";
import { QrCode } from "@/components/QrCode";
import { moneyPlain } from "@/lib/demo";
import { CountUp } from "@/components/app/LoyaltyPromos";

/**
 * Байгууллагын гишүүний карт — эзний тохируулсан загвараар (өнгө, лого, нэр).
 * Apple Wallet-ийн store card бүтэц: банкны картын харьцаа (1.586:1), дээд зурваст
 * лого · нэр · оноо (хэтэвчний давхарласан жагсаалтад зөвхөн энэ зурвас харагдана),
 * доор талбарууд (эзэмшигч, зэрэглэл). Тайлбар нүүрэн дээр биш — дэлгэрэнгүйд.
 * Хэрэглэгчийн апп (серверийн өгөгдөл) болон эзний урьдчилан харах (жишээ өгөгдөл) хоёулаа ашиглана.
 * QR — гишүүний санамсаргүй токен (нэр, утас агуулахгүй); зөвхөн гишүүнийг танина.
 */
export function MembershipCard({
  title,
  merchant,
  bgColor,
  textColor,
  logoSrc,
  holder,
  tierName,
  points,
  qr,
  stale = false,
  qrSize = 64,
  animated = false,
  showQr = true,
}: {
  title: string;
  merchant: string;
  description?: string | null;
  bgColor: string;
  textColor: string;
  logoSrc: string | null;
  holder: string;
  tierName: string;
  points: number;
  qr: string;
  /** Сүлжээгүй — сүүлд уншсан утга (шинэ мэт харуулахгүй) */
  stale?: boolean;
  qrSize?: number;
  /** Оноо өөрчлөгдөхөд тоолж очно */
  animated?: boolean;
  /** Картын статик QR — нэг Gerege QR-тай үед нуугдана (сүлжээгүй үед нөөц) */
  showQr?: boolean;
}) {
  const [logoFailed, setLogoFailed] = useState(false);
  return (
    <div
      className="relative aspect-[1.586/1] w-full overflow-hidden rounded-[18px] shadow-[0_1px_2px_rgb(0_0_0/0.12),0_18px_36px_-22px_rgb(0_0_0/0.55)]"
      style={{ background: bgColor, color: textColor }}
    >
      {/* Гэрлийн тусгал + доод сүүдэр — ямар ч өнгөнд гүн өгнө */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{ background: "linear-gradient(160deg, rgb(255 255 255 / 0.22) 0%, rgb(255 255 255 / 0.04) 34%, transparent 55%, rgb(0 0 0 / 0.2) 100%)" }}
      />
      <span aria-hidden="true" className="pointer-events-none absolute inset-0 rounded-[18px] ring-1 ring-inset ring-white/15" />

      <div className="relative flex h-full flex-col px-4 pb-4 pt-3.5">
        {/* Дээд зурвас — давхарласан хэтэвчинд харагдах хэсэг */}
        <div className="flex h-9 items-center gap-2.5">
          {logoSrc && !logoFailed ? (
            <span className="grid size-9 shrink-0 place-items-center overflow-hidden rounded-[10px] bg-white shadow-[0_1px_3px_rgb(0_0_0/0.18)]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={logoSrc} alt="" className="size-full object-contain p-0.5" onError={() => setLogoFailed(true)} />
            </span>
          ) : (
            <span className="grid size-9 shrink-0 place-items-center rounded-[10px] bg-white/20 text-[15px] font-bold">{merchant.slice(0, 1)}</span>
          )}
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[15px] font-semibold leading-tight tracking-[-0.01em]">{title}</span>
            <span className="block truncate text-[11px] leading-tight opacity-70">{merchant}</span>
          </span>
          <span className="shrink-0 text-right">
            <span className="block text-[9.5px] font-semibold uppercase leading-tight tracking-[0.08em] opacity-70">Оноо</span>
            <span className={`tnum block text-[19px] font-semibold leading-tight tracking-[-0.02em] ${stale ? "opacity-60" : ""}`}>
              {animated ? <CountUp value={points} /> : moneyPlain(points)}
            </span>
          </span>
        </div>

        <div className="mt-auto flex items-end justify-between gap-3">
          <div className="flex min-w-0 gap-5">
            <span className="min-w-0">
              <span className="block text-[9.5px] font-semibold uppercase tracking-[0.08em] opacity-70">Эзэмшигч</span>
              <span className="block truncate text-[14px] font-medium">{holder}</span>
            </span>
            <span className="shrink-0">
              <span className="block text-[9.5px] font-semibold uppercase tracking-[0.08em] opacity-70">Зэрэглэл</span>
              <span className="block text-[14px] font-medium">{tierName}</span>
            </span>
          </div>
          {showQr && (
            <span className="shrink-0 rounded-[10px] bg-white p-1">
              <QrCode value={qr} size={qrSize} label="Гишүүний QR" />
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
