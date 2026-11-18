"use client";

import { useState } from "react";
import { type Staff, moneyPlain } from "@/lib/demo";
import { IconCash, IconClock, ThemeToggle, Wordmark } from "@/components/icons";
import { Chip, PrimaryButton } from "@/components/ui";
import { Keypad } from "@/components/pages/CashierPage";

const PRESETS = [0, 50_000, 100_000, 200_000];

/**
 * Смен нээх.
 *
 * Нээлтийн үлдэгдлийг заавал асуух шалтгаан: өдрийн эцэст Z тайлан
 * «кассад байх ёстой» дүнг үүнээс тооцдог. Энэ алхмыг алгасвал
 * зөрүү гарсан эсэхийг хэзээ ч мэдэхгүй.
 */
export default function OpenShift({
  person,
  posNo,
  onOpen,
  onLogout,
  onToggleTheme,
}: {
  person: Staff;
  posNo: string;
  /** Алдаа гарвал мессежийг буцаана */
  onOpen: (openingFloat: number) => Promise<string | null>;
  onLogout: () => void;
  onToggleTheme: () => void;
}) {
  const [digits, setDigits] = useState("100000");
  /* Огноо — энэ дэлгэц зөвхөн нэвтэрсний дараа (клиентэд) гардаг тул эхний render-д тооцно */
  const [now] = useState(() => {
    const d = new Date();
    const pad = (value: number) => String(value).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  });
  /* 100,000 нь ердийн утга учир урьдчилж бичигдсэн. Гэхдээ товчлуур
     дээр эхний удаа дарахад тэр дүнгийн ард залгагдвал 100,000,700
     болно — тиймээс эхний даралт цэвэрлэж эхэлнэ. */
  const [typed, setTyped] = useState(false);


  const amount = Number(digits || "0");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const open = async () => {
    setBusy(true);
    setError(null);
    const failed = await onOpen(amount);
    // Амжилттай бол энэ дэлгэц алга болно — төлөвийг зөвхөн алдаанд шинэчилнэ
    if (failed) {
      setError(failed);
      setBusy(false);
    }
  };

  return (
    <div className="relative flex size-full flex-col items-center overflow-y-auto bg-stage px-4 py-4">
      <span className="absolute right-5 top-5">
        <ThemeToggle onClick={onToggleTheme} />
      </span>

      <div className="my-auto w-full max-w-[460px] rounded-[26px] bg-paper p-5 ring-1 ring-inset ring-hair sm:p-7">
        <div className="flex items-center justify-between">
          <Wordmark size={15} />
          <button
            type="button"
            onClick={onLogout}
            className="press text-[13px] font-semibold text-mute hover:text-ink"
          >
            Гарах
          </button>
        </div>

        <div className="mt-5 flex items-center gap-3 rounded-2xl bg-stage p-3">
          <span className="grid size-10 place-items-center rounded-full bg-ink text-[12px] font-bold text-paper">
            {person.initials}
          </span>
          <span className="leading-tight">
            <span className="block text-[14px] font-bold text-ink">{person.name}</span>
            <span className="block text-[12px] text-mute">{person.role}</span>
          </span>
        </div>

        <h1 className="mt-5 text-[24px] font-bold tracking-[-0.04em] text-ink">
          Смен нээх
        </h1>
        <p className="mt-1.5 text-[13px] leading-[19px] text-mute">
          Кассад одоо байгаа бэлэн мөнгийг оруулна уу. Өдрийн эцэст Z тайлан энэ дүнгээс
          зөрүүг тооцно.
        </p>

        <div className="mt-5">
          <span className="meta flex items-center gap-1.5">
            <IconCash />
            Нээлтийн үлдэгдэл
          </span>

          <label className="mt-2 flex items-baseline gap-1 border-b-2 border-accent pb-2">
            <span className="sr-only">Нээлтийн үлдэгдэл</span>
            <input
              value={moneyPlain(amount)}
              onChange={(event) => {
                setTyped(true);
                setDigits(event.target.value.replace(/\D/g, "").slice(0, 9));
              }}
              inputMode="numeric"
              className="tnum w-full bg-transparent text-[38px] font-bold leading-none tracking-[-0.035em] text-ink outline-none"
            />
            <span className="text-[20px] font-semibold text-mute">₮</span>
          </label>

          <div className="no-bar mt-3 flex gap-2 overflow-x-auto">
            {PRESETS.map((value) => (
              <Chip
                key={value}
                on={value === amount}
                onClick={() => {
                  setTyped(true);
                  setDigits(String(value));
                }}
              >
                <span className="tnum">{moneyPlain(value)}₮</span>
              </Chip>
            ))}
          </div>

          {/*
            Товчлуур заавал хэрэгтэй. Шалтгаан нь хоёр:
            бэлэн мөнгө 137,450₮ гэх мэт бүхэл бус дүнтэй байдаг тул
            бэлэн сонголтууд хангахгүй, мөн мэдрэгч дэлгэцтэй касст
            хатуу гар байдаггүй — дээрх талбарыг дарахад юу ч гарч
            ирэхгүй. Төлбөр, жинлэх дэлгэцтэй ижил товчлуур.
          */}
          <div className="mt-3">
            <Keypad
              compact
              keys={["1", "2", "3", "4", "5", "6", "7", "8", "9", "000", "0", "⌫"]}
              onPress={(key) => {
                setDigits((current) => {
                  const base = typed ? current : "";
                  if (key === "⌫") return (typed ? current : "").slice(0, -1);
                  const next = (base === "0" ? "" : base) + key;
                  return next.replace(/^0+(?=\d)/, "").slice(0, 9);
                });
                setTyped(true);
              }}
            />
          </div>
        </div>

        <div className="mt-4 flex items-center gap-2 text-[12px] text-mute">
          <IconClock />
          <span className="tnum">{now || "—"}</span>
          <span>·</span>
          <span className="tnum">Касс {posNo}</span>
        </div>

        <div className="mt-4">
          {error && (
            <p role="alert" className="mb-3 rounded-xl bg-danger-soft px-3.5 py-2.5 text-[13px] font-semibold text-danger">
              {error}
            </p>
          )}
          <PrimaryButton onClick={open} disabled={busy} size="lg">
            {busy ? "Серверт нээж байна…" : "Смен нээх"}
          </PrimaryButton>
        </div>
      </div>
    </div>
  );
}
