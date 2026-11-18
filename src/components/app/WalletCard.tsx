"use client";

import type { ReactNode } from "react";
import { type Member, moneyPlain } from "@/lib/demo";
import { QrCode } from "@/components/QrCode";

/**
 * Хэтэвчний хар 3D карт.
 *
 * Банкны металл карт шиг: хар суурь, нарийн бүдүүвч, зэрэглэлийн өнгөт
 * хүрээ, чип, гэрлийн тусгал. Хөдөлгөөнгүй — хазайх үед QR гажиж,
 * кассанд уншуулахад саад болдог тул тогтмол байна.
 */

const TIER_TONE: Record<Member["tier"], { edge: string; label: string; text: string }> = {
  Алтан: { edge: "linear-gradient(135deg,#f6d77b,#8a6417 40%,#f3cf6a 60%,#7a5512)", label: "GOLD", text: "#f3cf6a" },
  Мөнгөн: { edge: "linear-gradient(135deg,#f4f4f5,#6b6b73 40%,#e4e4e7 60%,#55555c)", label: "SILVER", text: "#e4e4e7" },
  Энгийн: { edge: "linear-gradient(135deg,#52525b,#18181b 45%,#3f3f46 60%,#18181b)", label: "MEMBER", text: "#a1a1aa" },
};

export function WalletCard({
  member,
  balance,
  points,
  action,
  onQr,
}: {
  member: Member;
  balance: number;
  points: number;
  /** Картын доор, гадна талд — «Мөнгө болгох» гэх мэт */
  action?: ReactNode;
  /** Картан дээрх QR-ыг дарахад томоор харуулах */
  onQr?: () => void;
}) {
  const tone = TIER_TONE[member.tier];

  // Гишүүний код → картын дугаар маягаар (GRG 9911 0022)
  const number = member.code.replace(/-/g, " ");

  return (
    <div>
      <div className="wcard" style={{ "--edge": tone.edge } as React.CSSProperties}>
        <div className="wcard-face">
          {/* бүдүүвч + гэрлийн тусгал */}
          <span className="wcard-grain" aria-hidden="true" />
          <span className="wcard-glare" aria-hidden="true" />

          <div className="relative flex items-start justify-between">
            <span className="flex items-center gap-2">
              <span className="grid size-7 place-items-center rounded-full bg-[#ff6a00] text-[13px] font-extrabold text-white">G</span>
              <span className="text-[14px] font-extrabold tracking-[0.18em] text-white">GEREGE</span>
            </span>
            <span className="text-[11px] font-bold tracking-[0.22em]" style={{ color: tone.text }}>
              {tone.label}
            </span>
            {/* Зэрэглэлийн доор кассанд уншуулах QR — урсгалаас гадуур, чип, үлдэгдлийг түлхэхгүй.
                58px үед ZXing уншаагүй, 72px үед уншсан (тест). */}
            <button
              type="button"
              onClick={onQr}
              aria-label="QR-ыг томоор харуулах"
              className="press absolute right-0 top-6 rounded-[10px] bg-white p-1 shadow-[0_6px_14px_-6px_rgb(0_0_0/0.6)]"
            >
                <QrCode value={member.code} size={72} label={`Гишүүний QR ${member.code}`} className="rounded-[6px]!" />
            </button>
          </div>

          <div className="relative mt-4 flex items-center gap-3">
            <Chip />
            <svg viewBox="0 0 24 24" className="size-5 text-white/60" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" aria-hidden="true">
              <path d="M8.5 8.5a5 5 0 0 1 0 7M12 6a8.5 8.5 0 0 1 0 12M15.5 3.5a12 12 0 0 1 0 17" />
            </svg>
          </div>

          <div className="relative mt-auto">
            <p className="text-[10.5px] font-semibold uppercase tracking-[0.16em] text-white/55">Үлдэгдэл</p>
            <p className="tnum text-[34px] font-bold leading-none tracking-[-0.035em] text-white">
              {moneyPlain(balance)}
              <span className="ml-1 text-[18px] font-semibold text-white/50">₮</span>
            </p>
            <div className="mt-3 flex items-end justify-between gap-3">
              <span className="min-w-0">
                <span className="tnum block text-[12.5px] tracking-[0.14em] text-white/80">{number}</span>
                <span className="block truncate text-[12px] font-semibold uppercase tracking-[0.08em] text-white/60">{member.name}</span>
              </span>
              <span className="tnum shrink-0 text-right">
                <span className="block text-[10px] font-semibold uppercase tracking-[0.14em] text-white/50">Оноо</span>
                <span className="block text-[15px] font-bold" style={{ color: tone.text }}>
                  {moneyPlain(points)}
                </span>
              </span>
            </div>
          </div>
        </div>
      </div>
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}

const Chip = () => (
  <svg viewBox="0 0 44 34" className="h-[30px] w-[40px]" aria-hidden="true">
    <defs>
      <linearGradient id="wchip" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#f5dd94" />
        <stop offset="0.5" stopColor="#b8913a" />
        <stop offset="1" stopColor="#ecd08a" />
      </linearGradient>
    </defs>
    <rect x="1" y="1" width="42" height="32" rx="6" fill="url(#wchip)" />
    <path d="M1 12h13M1 22h13M30 12h13M30 22h13M14 1v32M30 1v32M14 17h16" stroke="#7a5d1e" strokeWidth="1" fill="none" opacity="0.55" />
  </svg>
);
