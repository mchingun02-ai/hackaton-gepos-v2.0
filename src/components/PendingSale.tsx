"use client";

import { useState } from "react";
import { moneyPlain } from "@/lib/demo";
import { useStore } from "@/lib/store";
import { PrimaryButton, btnGhost } from "@/components/ui";

/**
 * Хариу нь тодорхойгүй төлбөр.
 *
 * Сүлжээ тасарсан эсвэл session дууссан үед сервер борлуулалтыг хадгалсан
 * эсэх нь тодорхойгүй. Энэ ажилтан дахин нэвтрэхэд энд гарна:
 * - «Шалгах» — анхны түлхүүрээр сервер дээр хайна; олдвол баримт;
 * - «Дахин илгээх» — анхны түлхүүр, агуулгаар (сервер давхардуулахгүй);
 * - «Сагсанд буцаах» — серверт анхны түлхүүрийг цуцалж баталгаажуулна; анхны хүсэлт явж
 *   байвал сервер түүнийг дуусахыг хүлээнэ (commit бол баримт, үгүй бол сагсанд).
 * «Шалгах» дээр «олдсонгүй» гэдэг нь эцсийн хариу биш.
 * Шийдэгдэхээс өмнө шинэ төлбөр эхлэхгүй.
 */
export default function PendingSale({ onReceipt }: { onReceipt: () => void }) {
  const { pendingSale, checkPending, resendPending, discardPending, saving, saveError } = useStore();
  const [note, setNote] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  /* Аль үйлдэл явж байна — тэр товчны бичиг л өөрчлөгдөнө, бусад нь хаалттай */
  const [busy, setBusy] = useState<null | "check" | "cancel">(null);
  if (!pendingSale) return null;

  const check = async () => {
    setBusy("check");
    setNote(null);
    setNotFound(false);
    const res = await checkPending();
    setBusy(null);
    if ("error" in res) setNote(res.error);
    else if (res.found) onReceipt();
    else {
      setNotFound(true);
      setNote("Сервер дээр одоогоор олдсонгүй — анхны хүсэлт явж байж магадгүй. «Сагсанд буцаах» нь эхлээд серверт цуцлалтыг баталгаажуулна.");
    }
  };

  const resend = async () => {
    setNote(null);
    setNotFound(false);
    if (await resendPending()) onReceipt();
  };

  const discard = async () => {
    setBusy("cancel");
    setNote(null);
    const res = await discardPending();
    setBusy(null);
    setNotFound(false);
    if (res === "completed") onReceipt();
    else if (typeof res === "object") setNote(res.error);
  };

  const at = new Date(pendingSale.at);
  const pad = (n: number) => String(n).padStart(2, "0");
  const items = pendingSale.lines.length;

  return (
    <div className="flex size-full flex-col items-center justify-center bg-stage px-5">
      <div className="w-full max-w-[460px] rounded-[26px] bg-paper p-7 ring-1 ring-inset ring-hair">
        <h1 className="text-[20px] font-bold tracking-[-0.03em] text-ink">Дуусаагүй төлбөр</h1>
        <p className="mt-2 text-[14px] leading-relaxed text-ink-2">
          {pad(at.getHours())}:{pad(at.getMinutes())}-д эхэлсэн төлбөрийн хариу ирээгүй. Сервер хадгалсан эсэхийг эхлээд
          шалгана — давхар төлбөр авахгүйн тулд.
        </p>
        <div className="mt-4 flex items-baseline justify-between rounded-xl bg-stage px-4 py-3">
          <span className="text-[13px] text-mute">{items} мөр</span>
          <span className="tnum text-[22px] font-bold text-ink">{moneyPlain(pendingSale.total)}₮</span>
        </div>

        {(note || saveError) && (
          <p role="alert" className="mt-3 rounded-xl bg-warn-soft px-3.5 py-2.5 text-[13px] font-semibold text-warn">
            {saveError ?? note}
          </p>
        )}

        <div className="mt-5 space-y-2">
          <PrimaryButton onClick={check} disabled={!!busy || saving}>
            {busy === "check" ? "Шалгаж байна…" : "Шалгах"}
          </PrimaryButton>
          <button type="button" onClick={resend} disabled={!!busy || saving} className={`${btnGhost} w-full justify-center`}>
            {saving && !busy ? "Илгээж байна…" : "Дахин илгээх (ижил төлбөр)"}
          </button>
          {notFound && (
            <button type="button" onClick={discard} disabled={!!busy || saving} className={`${btnGhost} w-full justify-center`}>
              {busy === "cancel" ? "Серверт шалгаж байна…" : "Сагсанд буцаах"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
