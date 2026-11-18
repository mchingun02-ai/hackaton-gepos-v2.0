"use client";

import { useEffect, useMemo, useState } from "react";
import { formatQty, moneyPlain, unitOf } from "@/lib/demo";
import { useStore } from "@/lib/store";
import { type RefundMoneyStatus, type RefundPreview, type RefundableSale, type ServerRefund, api, newIdempotencyKey } from "@/lib/pos-api";
import { Chip, Field, Money, PrimaryButton, Sheet, Stepper } from "@/components/ui";
import { IconPrint } from "@/components/icons";
import RefundPaper from "@/components/RefundPaper";

/** Мөнгөний бодит төлөв — баримт, жагсаалт дээр */
export const refundMoneyLabel = (status: RefundMoneyStatus, ref?: string | null) =>
  status === "refunded_cash"
    ? "Бэлнээр буцаасан (касс)"
    : status === "refunded_external_manual"
      ? `Гараар буцаасан${ref ? ` · ${ref}` : ""}`
      : status === "refunded_wallet"
        ? "Хэрэглэгчийн хэтэвч рүү автоматаар буцсан"
        : "Хүлээгдэж буй — карт/QPay автоматаар буцаагүй";

const METHOD = { cash: "Бэлэн", card: "Карт", qpay: "QPay", wallet: "Gerege хэтэвч" } as const;

type Pick = { qty: number; disposition: "restock" | "damaged" };

/**
 * Буцаалт — анхны баримтаас мөр, тоо хэмжээ сонгоно. Дүнг сервер (dryRun) тооцож харуулна.
 * Анхны борлуулалт өөрчлөгдөхгүй; буцаалт тусдаа баримт болно.
 * Хариу тодорхойгүй (сүлжээ тасарсан) бол маягт түгжигдэж, ижил түлхүүрээр л дахин илгээнэ —
 * сонголт өөрчилж шинэ түлхүүрээр давхар буцаалт үүсгэх боломжгүй.
 */
export default function RefundSheet({ saleNo, onClose }: { saleNo: string; onClose: () => void }) {
  const { auth, reportError, submitRefund } = useStore();
  const [sale, setSale] = useState<RefundableSale | null>(null);
  const [prior, setPrior] = useState<ServerRefund[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [picks, setPicks] = useState<Record<string, Pick>>({});
  const [reason, setReason] = useState("");
  const [preview, setPreview] = useState<RefundPreview | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [key, setKey] = useState(() => newIdempotencyKey());
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  /** Хариу тодорхойгүй — ижил түлхүүрээр л дахин */
  const [uncertain, setUncertain] = useState(false);
  const [result, setResult] = useState<ServerRefund | null>(null);

  useEffect(() => {
    const a = auth();
    if (!a) return;
    let live = true;
    const timer = setTimeout(async () => {
      try {
        const res = await api.lookupSale(a, saleNo);
        if (!live) return;
        setSale(res.sale);
        setPrior(res.refunds);
      } catch (e) {
        if (live) setLoadError(reportError(e, "Баримт олдсонгүй."));
      }
    }, 0);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [auth, reportError, saleNo]);

  const lines = useMemo(
    () => Object.entries(picks).filter(([, p]) => p.qty > 0).map(([saleLineId, p]) => ({ saleLineId, qty: Number(p.qty.toFixed(3)), disposition: p.disposition })),
    [picks],
  );
  const reasonOk = reason.trim().length >= 3;

  // Урьдчилсан тооцоо — сервер (dryRun), юу ч бичихгүй
  useEffect(() => {
    const a = auth();
    if (!a || !sale || lines.length === 0 || uncertain) {
      const t = setTimeout(() => setPreview(null), 0);
      return () => clearTimeout(t);
    }
    let live = true;
    const timer = setTimeout(async () => {
      try {
        const res = await api.previewRefund(a, { saleId: sale.id, reason: reason.trim() || "урьдчилсан тооцоо", lines });
        if (live) {
          setPreview(res);
          setPreviewError(null);
        }
      } catch (e) {
        if (live) {
          setPreview(null);
          setPreviewError(reportError(e, "Тооцоолж чадсангүй."));
        }
      }
    }, 250);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [auth, reportError, sale, lines, reason, uncertain]);

  const setPick = (id: string, next: Partial<Pick>) => {
    if (uncertain) return;
    setPicks((current) => ({ ...current, [id]: { ...(current[id] ?? { qty: 0, disposition: "restock" }), ...next } }));
    setKey(newIdempotencyKey());
  };

  const submit = async () => {
    if (!sale || !preview) return;
    setSending(true);
    setSendError(null);
    const res = await submitRefund({ idempotencyKey: key, saleId: sale.id, saleNo: sale.no, reason: reason.trim(), lines, expectedTotal: preview.total });
    setSending(false);
    if ("refund" in res) setResult(res.refund);
    else {
      setSendError(res.error);
      if (res.offline) setUncertain(true);
    }
  };

  if (result) {
    return (
      <Sheet title="Буцаалт хийгдлээ" onClose={onClose} footer={<RefundPrintFooter onClose={onClose} />}>
        <div className="rounded-xl bg-stage px-4 py-3">
          <span className="tnum block text-[15px] font-bold text-ink">{result.no}</span>
          <span className="tnum block text-[13px] text-mute">Анхны баримт {result.saleNo}</span>
        </div>
        <div className="flex items-baseline justify-between">
          <span className="text-[14px] text-ink-2">Буцаах дүн</span>
          <Money value={result.total} className="text-[22px] font-bold text-ink" />
        </div>
        <p className={`rounded-xl px-3.5 py-2.5 text-[13px] font-semibold ${result.moneyStatus === "pending_external" ? "bg-warn-soft text-warn" : "bg-stage text-ink"}`}>
          {refundMoneyLabel(result.moneyStatus, result.externalRef)}
          {result.moneyStatus === "pending_external" && (
            <span className="mt-0.5 block font-normal text-ink-2">Банк/QPay-аар гараар буцаагаад «Тайлан → Буцаалт»-аас лавлагаатай тэмдэглэнэ.</span>
          )}
        </p>
        <p className="text-[12px] text-mute">Урамшууллын оноо холбогдоогүй тул өөрчлөгдөөгүй. Е-баримт холбогдоогүй.</p>
        <span className="meta block">Хэвлэх баримт</span>
        <RefundPaper refund={result} />
      </Sheet>
    );
  }

  const footer = (
    <>
      {sendError && (
        <p role="alert" className="mb-3 rounded-xl bg-danger-soft px-3.5 py-2.5 text-[13px] font-semibold text-danger">
          {sendError}
          {uncertain && <span className="mt-0.5 block font-normal text-ink-2">Хариу ирээгүй — сонголт түгжигдсэн. «Дахин оролдох» нь ижил буцаалтыг давхардуулахгүй.</span>}
        </p>
      )}
      <PrimaryButton onClick={submit} disabled={!preview || !reasonOk || sending}>
        {sending ? "Серверт хадгалж байна…" : uncertain ? "Дахин оролдох" : preview ? `Буцаалт хийх · ${moneyPlain(preview.total)}₮` : "Буцаалт хийх"}
      </PrimaryButton>
    </>
  );

  return (
    <Sheet title="Буцаалт" onClose={onClose} footer={footer}>
      {loadError && <p className="rounded-xl bg-danger-soft px-3.5 py-2.5 text-[13px] font-semibold text-danger">{loadError}</p>}
      {!sale && !loadError && <p className="text-[13px] text-mute">Баримт ачаалж байна…</p>}
      {sale && (
        <>
          <div className="rounded-xl bg-stage px-4 py-3">
            <span className="tnum block text-[15px] font-bold text-ink">{sale.no}</span>
            <span className="tnum block text-[13px] text-mute">
              {METHOD[sale.method]} · {moneyPlain(sale.total)}₮
              {sale.refundedTotal > 0 && ` · өмнө нь ${moneyPlain(sale.refundedTotal)}₮ буцаасан`}
            </span>
          </div>

          <ul className="divide-y divide-hair">
            {sale.lines.map((l) => {
              const pick = picks[l.id] ?? { qty: 0, disposition: "restock" as const };
              const step = l.free ? l.remainingQty : unitOf(l.unit ?? "ш").fractional ? unitOf(l.unit ?? "ш").step : 1;
              const done = l.remainingQty <= 0;
              return (
                <li key={l.id} className={`py-3 ${done ? "opacity-50" : ""}`}>
                  <div className="flex items-center gap-3">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[14px] font-bold text-ink">{l.name}</span>
                      <span className="tnum block text-[12px] text-mute">
                        {formatQty(l.qty, l.unit ?? "ш")} зарсан · {done ? "бүгд буцаагдсан" : `${formatQty(l.remainingQty, l.unit ?? "ш")} буцааж болно`}
                      </span>
                    </span>
                    {!done &&
                      (l.free ? (
                        <Chip on={pick.qty > 0} onClick={() => setPick(l.id, { qty: pick.qty > 0 ? 0 : l.remainingQty })}>
                          Бүтнээр · {moneyPlain(l.remainingAmount)}₮
                        </Chip>
                      ) : (
                        <Stepper
                          compact
                          qty={pick.qty}
                          unit={l.unit ?? "ш"}
                          onLess={() => setPick(l.id, { qty: Math.max(0, Number((pick.qty - step).toFixed(3))) })}
                          onMore={() => setPick(l.id, { qty: Math.min(l.remainingQty, Number((pick.qty + step).toFixed(3))) })}
                        />
                      ))}
                  </div>
                  {!l.free && pick.qty > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      <Chip on={pick.disposition === "restock"} onClick={() => setPick(l.id, { disposition: "restock" })}>
                        Үлдэгдэлд буцаах
                      </Chip>
                      <Chip on={pick.disposition === "damaged"} onClick={() => setPick(l.id, { disposition: "damaged" })}>
                        Гэмтэлтэй — худалдахгүй
                      </Chip>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>

          <Field label="Шалтгаан (заавал)" value={reason} onChange={(v) => !uncertain && setReason(v)} placeholder="Ж: хугацаа дууссан, буруу бараа" />

          {preview && (
            <div className="space-y-1 rounded-xl bg-stage px-4 py-3 text-[13px]">
              <div className="flex justify-between">
                <span className="text-mute">Дүн</span>
                <Money value={preview.subtotal} className="font-medium text-ink-2" />
              </div>
              {preview.discount > 0 && (
                <div className="flex justify-between">
                  <span className="text-mute">Анхны хөнгөлөлт</span>
                  <Money value={preview.discount} sign="−" className="font-medium text-ink-2" />
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-mute">Үүнээс НӨАТ</span>
                <Money value={preview.vat} className="font-medium text-ink-2" />
              </div>
              <div className="flex items-end justify-between border-t border-dashed border-line pt-2">
                <span className="meta">Буцаах</span>
                <Money value={preview.total} className="text-[20px] font-bold text-ink" />
              </div>
              <p className={`pt-1 text-[12px] ${preview.moneyStatus === "pending_external" ? "font-semibold text-warn" : "text-mute"}`}>
                {preview.moneyStatus === "refunded_cash"
                  ? "Энэ сменийн кассаас бэлнээр буцаана."
                  : "Карт/QPay холбогдоогүй — мөнгө автоматаар буцахгүй, «хүлээгдэж буй» гэж бүртгэгдэнэ."}
              </p>
            </div>
          )}
          {previewError && <p className="rounded-xl bg-danger-soft px-3.5 py-2.5 text-[13px] font-semibold text-danger">{previewError}</p>}

          {prior.length > 0 && (
            <div>
              <span className="meta mb-1.5 block">Өмнөх буцаалт</span>
              <ul className="space-y-1 text-[13px]">
                {prior.map((r) => (
                  <li key={r.id} className="flex justify-between gap-2">
                    <span className="tnum text-ink-2">{r.no}</span>
                    <span className="tnum text-mute">{moneyPlain(r.total)}₮ · {refundMoneyLabel(r.moneyStatus, r.externalRef)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </Sheet>
  );
}

/** Хэвлэх (дахин хэвлэж болно) — хэвлэлт зөвхөн цаасыг гаргана, буцаалтын бүртгэлд нөлөөгүй */
export function RefundPrintFooter({ onClose }: { onClose: () => void }) {
  return (
    <div className="flex gap-2">
      <button
        type="button"
        onClick={() => window.print()}
        className="press flex h-[52px] shrink-0 items-center gap-2 rounded-xl px-4 text-[14px] font-bold text-ink-2 ring-1 ring-inset ring-hair hover:text-ink hover:ring-line"
      >
        <IconPrint />
        Хэвлэх
      </button>
      <PrimaryButton onClick={onClose} arrow={false}>
        Хаах
      </PrimaryButton>
    </div>
  );
}

/** Буцаалтын баримтыг дахин хэвлэх (жагсаалтаас) */
export function RefundReceiptSheet({ refund, onClose }: { refund: ServerRefund; onClose: () => void }) {
  return (
    <Sheet title="Буцаалтын баримт" onClose={onClose} footer={<RefundPrintFooter onClose={onClose} />}>
      <RefundPaper refund={refund} />
    </Sheet>
  );
}
