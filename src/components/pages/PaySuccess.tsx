"use client";

import { useEffect, useState } from "react";
import { moneyPlain } from "@/lib/demo";

/**
 * Гүйлгээ бүтсэн мөч.
 *
 * Энэ дэлгэц яагаад байх ёстой вэ: кассчин төлбөр авах товчийг дараад
 * шууд баримт руу шилжвэл «болсон уу, үгүй юу» гэдэг нь нэг хормын
 * эргэлзээ үлдээдэг. Тэр эргэлзээ өдөрт 500 удаа давтагдана. Тод,
 * эргэлзээгүй нэг тэмдэг тэр ачааллыг арилгана.
 *
 * Хугацаа нь зориуд богино: 1.6 секундын дараа өөрөө баримт руу орно.
 * Дараалалтай үед хүлээлгэх эрхгүй — хаана ч дарвал шууд өнгөрнө.
 * Харин **хариулт өгөх мөнгө байвал өөрөө хаагдахгүй**: кассчин
 * мөнгөө гартаа аваагүй байхад дэлгэц солигдвол алдаа гарна.
 */
export default function PaySuccess({
  total,
  change,
  earned,
  queued,
  method,
  onDone,
}: {
  total: number;
  change: number;
  earned: number;
  queued: boolean;
  method: "бэлэн" | "карт" | "qpay" | "хэтэвч";
  onDone: () => void;
}) {
  const [leaving, setLeaving] = useState(false);
  const holdForChange = change > 0;

  useEffect(() => {
    if (holdForChange) return;
    const timer = setTimeout(() => {
      setLeaving(true);
      setTimeout(onDone, 160);
    }, 1600);
    return () => clearTimeout(timer);
  }, [holdForChange, onDone]);

  const label = method === "бэлэн" ? "Бэлнээр" : method === "карт" ? "Картаар" : method === "хэтэвч" ? "Хэтэвчээр" : "QPay-ээр";

  return (
    <button
      type="button"
      onClick={onDone}
      aria-label="Баримт руу"
      className={`absolute inset-0 z-40 flex flex-col items-center justify-center gap-0 bg-stage px-6 transition-opacity duration-150 ${
        leaving ? "opacity-0" : "opacity-100"
      }`}
    >
      <span className="ok-badge">
        <svg viewBox="0 0 32 32" className="size-10" aria-hidden="true">
          <path
            d="M8 16.5 13.5 22 24 11"
            className="ok-check"
            fill="none"
            stroke="var(--accent-ink)"
            strokeWidth={3}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>

      <span className="ok-rise ok-d1 meta mt-6">{label} төлөгдлөө</span>

      <span className="ok-rise ok-d2 hugenum mt-1.5 text-[44px]!">
        {moneyPlain(total)}
        <span className="suffix">₮</span>
      </span>

      {/* Хариулт байвал энэ нь дэлгэцийн гол зүйл — кассчин үүнийг
          харж мөнгөө гаргана. Тиймээс бусдаас том, өөр өнгөөр. */}
      {change > 0 && (
        <span className="ok-rise ok-d3 mt-6 flex items-center gap-4 rounded-[18px] bg-ink px-6 py-4 text-paper">
          <span className="text-[14px] font-bold">Хариулт өгөх</span>
          <span className="tnum text-[32px] font-bold leading-none tracking-[-0.03em]">
            {moneyPlain(change)}
            <span className="ml-0.5 text-[0.6em] font-semibold opacity-60">₮</span>
          </span>
        </span>
      )}

      {earned > 0 && (
        <span className="ok-rise ok-d3 tnum mt-4 text-[13px] font-semibold text-accent">
          +{moneyPlain(earned)} оноо
        </span>
      )}

      <span className="ok-rise ok-d3 mt-4 max-w-[300px] text-[12px] leading-[17px] text-mute">
        Гүйлгээ бүртгэгдсэн. Е-баримт холбогдоогүй
        {queued ? " · татварын код дутуу бараатай" : ""}.
      </span>

      <span className="ok-rise ok-d3 mt-8 text-[12px] text-mute">
        {holdForChange ? "Үргэлжлүүлэхийн тулд дарна уу" : "Баримт руу шилжиж байна…"}
      </span>
    </button>
  );
}
