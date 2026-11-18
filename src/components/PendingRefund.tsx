"use client";

import { useState } from "react";
import { moneyPlain } from "@/lib/demo";
import { useStore } from "@/lib/store";
import { PrimaryButton, btnGhost } from "@/components/ui";
import RefundPaper from "@/components/RefundPaper";
import { RefundPrintFooter } from "@/components/RefundSheet";

/**
 * Хариу ирээгүй буцаалт (сүлжээ тасарсан, refresh, session дууссан).
 * Борлуулалтын «Дуусаагүй төлбөр»-тэй ижил дүрэм — анхны түлхүүрээр:
 * «Шалгах» (олдсонгүй нь эцсийн хариу биш), «Дахин илгээх» (сервер давхардуулахгүй),
 * «Цуцлах» — серверт цуцлалтыг баталгаажуулна; анхны буцаалт явж байвал дуусахыг хүлээнэ.
 */
export default function PendingRefund() {
  const { pendingRefund, checkPendingRefund, resendPendingRefund, cancelPendingRefund, resolvedRefund: done, clearResolvedRefund } = useStore();
  const [busy, setBusy] = useState<null | "check" | "resend" | "cancel">(null);
  const [note, setNote] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [snapshot] = useState(pendingRefund);

  const run = async (kind: "check" | "resend" | "cancel") => {
    setBusy(kind);
    setNote(null);
    setNotFound(false);
    const res = kind === "check" ? await checkPendingRefund() : kind === "resend" ? await resendPendingRefund() : await cancelPendingRefund();
    setBusy(null);
    // Шийдэгдсэн бол store resolvedRefund-оор баримт/цуцлалтыг харуулна
    if ("refund" in res || ("cancelled" in res && res.cancelled)) return;
    if ("error" in res) setNote(res.error);
    else {
      setNotFound(true);
      setNote("Сервер дээр одоогоор олдсонгүй — анхны хүсэлт явж байж магадгүй. «Цуцлах» нь эхлээд серверт баталгаажуулна.");
    }
  };

  if (done) {
    return (
      <div className="flex size-full flex-col bg-stage">
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-[460px] space-y-4 p-5">
            <h1 className="text-[20px] font-bold tracking-[-0.03em] text-ink">
              {done === "cancelled" ? "Буцаалт хийгдээгүй" : "Буцаалт хадгалагдсан"}
            </h1>
            {done === "cancelled" ? (
              <p className="text-[14px] text-ink-2">Сервер цуцлалтыг баталгаажууллаа — энэ түлхүүрээр буцаалт үүсэхгүй.</p>
            ) : (
              <RefundPaper refund={done} />
            )}
          </div>
        </div>
        <div className="shrink-0 border-t border-hair bg-paper p-4">
          <div className="mx-auto max-w-[460px]">
            {done === "cancelled" ? (
              <PrimaryButton onClick={clearResolvedRefund} arrow={false}>
                Касс руу
              </PrimaryButton>
            ) : (
              <RefundPrintFooter onClose={clearResolvedRefund} />
            )}
          </div>
        </div>
      </div>
    );
  }
  if (!pendingRefund) return null;

  const at = new Date((snapshot ?? pendingRefund).at);
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    <div className="flex size-full flex-col items-center justify-center bg-stage px-5">
      <div className="w-full max-w-[460px] rounded-[26px] bg-paper p-7 ring-1 ring-inset ring-hair">
        <h1 className="text-[20px] font-bold tracking-[-0.03em] text-ink">Дуусаагүй буцаалт</h1>
        <p className="mt-2 text-[14px] leading-relaxed text-ink-2">
          {pad(at.getHours())}:{pad(at.getMinutes())}-д эхэлсэн буцаалтын хариу ирээгүй (баримт {pendingRefund.saleNo || "—"}).
          Сервер хадгалсан эсэхийг эхлээд шалгана — давхар буцаалт үүсгэхгүйн тулд.
        </p>
        <div className="mt-4 rounded-xl bg-stage px-4 py-3 text-[13px] text-ink-2">
          {pendingRefund.request.lines.length} мөр · Шалтгаан: {pendingRefund.request.reason}
          {typeof pendingRefund.request.expectedTotal === "number" && <span className="tnum block font-bold text-ink">{moneyPlain(pendingRefund.request.expectedTotal)}₮</span>}
        </div>
        {note && (
          <p role="alert" className="mt-3 rounded-xl bg-warn-soft px-3.5 py-2.5 text-[13px] font-semibold text-warn">
            {note}
          </p>
        )}
        <div className="mt-5 space-y-2">
          <PrimaryButton onClick={() => run("check")} disabled={!!busy}>
            {busy === "check" ? "Шалгаж байна…" : "Шалгах"}
          </PrimaryButton>
          <button type="button" onClick={() => run("resend")} disabled={!!busy} className={`${btnGhost} w-full justify-center`}>
            {busy === "resend" ? "Илгээж байна…" : "Дахин илгээх (ижил буцаалт)"}
          </button>
          {notFound && (
            <button type="button" onClick={() => run("cancel")} disabled={!!busy} className={`${btnGhost} w-full justify-center`}>
              {busy === "cancel" ? "Серверт шалгаж байна…" : "Цуцлах"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
