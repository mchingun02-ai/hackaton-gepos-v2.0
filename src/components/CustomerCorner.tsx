"use client";

import { useState } from "react";
import { type Member, members, tierRule } from "@/lib/demo";
import { QrCode } from "@/components/QrCode";
import { Field, PrimaryButton } from "@/components/ui";

/**
 * Хэрэглэгчийн булангийн хэсгүүд — Gerege аппын «Нэвтрэх» ба «Миний» таб.
 *
 * Нэвтрэлт: утасны дугаар + SMS код. Туршилтын хувилбарт код нь 0000,
 * гишүүд нь кассын demo жагсаалт.
 */

export const DEMO_OTP = "0000";
const digits = (s: string) => s.replace(/\D/g, "");

export function CustomerLogin({ onLogin }: { onLogin: (member: Member) => void }) {
  const [step, setStep] = useState<"phone" | "otp">("phone");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [error, setError] = useState("");

  const sendCode = () => {
    if (digits(phone).length !== 8) {
      setError("Утасны дугаар 8 оронтой байна.");
      return;
    }
    setError("");
    setStep("otp");
  };

  const verify = () => {
    if (otp !== DEMO_OTP) {
      setError("Код буруу байна.");
      return;
    }
    const hit = members.find((m) => digits(m.phone) === digits(phone));
    if (!hit) {
      setError("Энэ дугаар урамшууллын гишүүнээр бүртгэлгүй байна. Дэлгүүрийн кассаас бүртгүүлнэ үү.");
      return;
    }
    setError("");
    onLogin(hit);
  };

  return (
    <section className="mt-16">
      <p className="meta">Gerege · урамшууллын хэтэвч</p>
      <h1 className="mt-2 text-[40px] font-extrabold leading-[0.95] tracking-[-0.045em] text-ink">
        Оноо, хэтэвч<span className="text-mute">, хямдрал</span> нэг дор
        <span className="text-accent">.</span>
      </h1>
      <p className="mt-4 text-[14px] leading-relaxed text-mute">
        Хамтрагч дэлгүүрүүдийн урамшуулал, хүргэлт, оноогоо мөнгө болгох — утасны дугаараараа нэвтэрнэ.
      </p>

      <div className="mt-8 space-y-4 rounded-[22px] bg-paper p-5 ring-1 ring-inset ring-hair">
        {step === "phone" ? (
          <>
            <Field label="Утасны дугаар" value={phone} onChange={setPhone} placeholder="99110022" numeric />
            <PrimaryButton onClick={sendCode} size="lg">
              Код авах
            </PrimaryButton>
          </>
        ) : (
          <>
            <Field label={`${phone} руу илгээсэн код`} value={otp} onChange={setOtp} placeholder="0000" numeric />
            <PrimaryButton onClick={verify} size="lg">
              Нэвтрэх
            </PrimaryButton>
            <button
              type="button"
              onClick={() => {
                setStep("phone");
                setOtp("");
                setError("");
              }}
              className="press w-full text-center text-[13px] font-semibold text-mute hover:text-ink"
            >
              Дугаар солих
            </button>
          </>
        )}
        {error && (
          <p role="alert" className="text-[13px] font-semibold text-warn">
            {error}
          </p>
        )}
      </div>

      <p className="mt-4 text-center text-[12px] text-mute">
        Туршилт — <span className="tnum font-semibold text-ink-2">9911-0022</span>, код{" "}
        <span className="tnum font-semibold text-ink-2">{DEMO_OTP}</span>
      </p>
    </section>
  );
}

/** Кассанд уншуулах гишүүний QR — цагаан дэвсгэр, том */
export function MemberQr({ member, size = 232 }: { member: Member; size?: number }) {
  return (
    <section className="rounded-[22px] bg-paper p-5 text-center ring-1 ring-inset ring-hair">
      <div className="flex justify-center">
        <QrCode value={member.code} size={size} label={`Гишүүний QR ${member.code}`} />
      </div>
      <p className="tnum mt-3 text-[13px] font-semibold tracking-[0.04em] text-ink">{member.code}</p>
      <p className="mt-1 text-[12px] leading-relaxed text-mute">
        Кассчинд уншуулна уу — хөнгөлөлт шууд хасагдаж, оноо нэмэгдэнэ.
      </p>
    </section>
  );
}

/** Зэрэглэлийн хоёр эрх — хөнгөлөлт ба оноо */
export function TierPerks({ member }: { member: Member }) {
  const rule = tierRule[member.tier];
  return (
    <div className="grid grid-cols-2 gap-3">
      <div className="rounded-[18px] bg-paper p-4 ring-1 ring-inset ring-hair">
        <p className="meta">Хөнгөлөлт</p>
        <p className="tnum mt-1.5 text-[26px] font-bold tracking-[-0.03em] text-ink">{Math.round(rule.off * 100)}%</p>
        <p className="text-[12px] text-mute">худалдан авалт бүрд</p>
      </div>
      <div className="rounded-[18px] bg-paper p-4 ring-1 ring-inset ring-hair">
        <p className="meta">Оноо</p>
        <p className="tnum mt-1.5 text-[26px] font-bold tracking-[-0.03em] text-ink">{Math.round(rule.earn * 100)}%</p>
        <p className="text-[12px] text-mute">төлсөн дүнгээс буцна</p>
      </div>
    </div>
  );
}
