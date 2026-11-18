"use client";

import { useState } from "react";
import { moneyPlain } from "@/lib/demo";
import { downloadCsv, useStore } from "@/lib/store";
import { IconAlert, IconExport } from "@/components/icons";
import { Chip, Money, PrimaryButton, Stat, Td, Th, btnGhost } from "@/components/ui";
import RefundSheet, { RefundReceiptSheet, refundMoneyLabel } from "@/components/RefundSheet";
import type { ServerRefund } from "@/lib/pos-api";

const RANGES = ["Өнөөдөр", "7 хоног", "Сар"];

/**
 * Тайлан.
 *
 * Дарааллын тоог хамгийн дээр: смен хаахаас өмнө татвар руу илгээгдээгүй
 * баримт байвал Z тайлан зөрнө. Үүнийг ёроолд нуувал хэн ч анзаарахгүй.
 */
export default function ReportsPage({ narrow }: { narrow: boolean }) {
  const { txns, shift, closeShift, perms, mode, refunds, markRefundExternal } = useStore();
  /* Буцаалт — серверийн горимд менежер, эзэн (сервер ч шалгана) */
  const canRefund = mode === "server" && perms.refund;
  const [refundNo, setRefundNo] = useState<string | null>(null);
  const [printRefund, setPrintRefund] = useState<ServerRefund | null>(null);
  const [findNo, setFindNo] = useState("");
  const [markError, setMarkError] = useState<string | null>(null);
  const refundTotal = refunds.reduce((sum, r) => sum + r.total, 0);
  const refundCash = refunds.filter((r) => r.moneyStatus === "refunded_cash").reduce((sum, r) => sum + r.total, 0);
  const refundPending = refunds.filter((r) => r.moneyStatus === "pending_external").reduce((sum, r) => sum + r.total, 0);
  const markExternal = async (id: string) => {
    const reference = window.prompt("Банк/QPay-аар буцаасан гүйлгээний лавлагаа (дугаар)");
    if (!reference) return;
    setMarkError(await markRefundExternal(id, reference.trim()));
  };
  const canClose = !!shift && (shift.mine || perms.branchReports);
  const [range, setRange] = useState(RANGES[0]);
  const [closed, setClosed] = useState<null | { gross: number; count: number }>(null);

  // Е-баримт (PosAPI) холбогдоогүй — нэг ч гүйлгээнд татварын баримт үүсээгүй
  const queued = txns.length;
  const failed = txns.filter((t) => t.receipt === "Код дутуу").length;
  const gross = txns.reduce((sum, t) => sum + t.amount, 0);
  const cash = txns.filter((t) => t.method === "Бэлэн").reduce((s, t) => s + t.amount, 0);
  const card = txns.filter((t) => t.method === "Карт").reduce((s, t) => s + t.amount, 0);
  const qr = txns.filter((t) => t.method === "QPay" || t.method === "Хэтэвч").reduce((s, t) => s + t.amount, 0);
  // Кассад байх ёстой: нээлтийн үлдэгдэл + бэлэн борлуулалт − энэ сменд бэлнээр буцаасан
  const expected = (shift?.openingFloat ?? 0) + cash - (shift?.refundCashTotal ?? 0);

  const exportTxns = () =>
    downloadCsv("borluulalt.csv", [
      ["Дугаар", "Цаг", "Бараа", "Төлбөр", "Дүн", "Е-баримт"],
      ...txns.map((t) => [t.no, t.at, t.items, t.method, t.amount, t.receipt]),
      [],
      ["Нийт", "", "", "", gross, ""],
    ]);

  const exportVat = () =>
    downloadCsv("noat-tailan.csv", [
      ["Дугаар", "Цаг", "Дүн", "НӨАТ", "Е-баримт"],
      ...txns.map((t) => [t.no, t.at, t.amount, Math.floor((t.amount * 10 + 55) / 110), t.receipt]),
    ]);

  const [closing, setClosing] = useState(false);
  const [closeError, setCloseError] = useState<string | null>(null);

  /* Серверийн горимд смен серверт хаагдсаны дараа л хаагдсан гэж үзнэ */
  const doClose = async () => {
    setClosing(true);
    setCloseError(null);
    const failed = await closeShift();
    setClosing(false);
    if (failed) setCloseError(failed);
    else setClosed({ gross, count: txns.length });
  };

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        {RANGES.map((item) => (
          <Chip key={item} on={range === item} onClick={() => setRange(item)}>
            {item}
          </Chip>
        ))}
        {canRefund && (
          <form
            className="ml-auto flex items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (findNo.trim()) setRefundNo(findNo.trim());
            }}
          >
            <input
              value={findNo}
              onChange={(e) => setFindNo(e.target.value)}
              placeholder="Баримтын дугаар"
              aria-label="Буцаах баримтын дугаар"
              className="tnum h-10 w-[150px] rounded-xl bg-stage px-3 text-[13px] text-ink placeholder:text-mute focus:bg-paper focus:outline-none focus:ring-1 focus:ring-accent"
            />
            <button type="submit" className={btnGhost} disabled={!findNo.trim()}>
              Буцаалт
            </button>
          </form>
        )}
        <button type="button" onClick={exportTxns} className={`${btnGhost} ${canRefund ? "" : "ml-auto"}`}>
          <IconExport />
          Excel татах
        </button>
      </div>

      {(queued > 0 || failed > 0) && (
        <div className="mt-4 flex items-start gap-2.5 rounded-xl bg-warn-soft px-4 py-3 text-warn">
          <span className="mt-0.5 shrink-0">
            <IconAlert />
          </span>
          <p className="text-[13px] leading-[18px]">
            <span className="font-semibold">Е-баримт холбогдоогүй — {queued} гүйлгээнд татварын баримт үүсээгүй</span>
            {failed > 0 && <>, {failed} гүйлгээнд татварын код дутуу бараа бий</>}. PosAPI холбогдсоны
            дараа илгээнэ.
          </p>
        </div>
      )}

      {closed && (
        <div className="mt-4 rounded-xl bg-ink px-4 py-3 text-[13px] font-semibold text-paper">
          Смен хаагдлаа — {closed.count} гүйлгээ, {moneyPlain(closed.gross)}₮. Дахин нэвтэрч шинэ
          смен нээнэ.
        </div>
      )}

      <div className={`mt-4 grid gap-3 ${narrow ? "grid-cols-2" : "grid-cols-2 lg:grid-cols-4"}`}>
        <Stat
          label="Нийт борлуулалт"
          value={<Money value={gross} />}
          hint={`${txns.length} гүйлгээ`}
        />
        <Stat label="Бэлэн" value={<Money value={cash} />} />
        <Stat label="Карт / QR / хэтэвч" value={<Money value={card + qr} />} />
        <Stat
          label="Е-баримтгүй"
          value={queued}
          hint="PosAPI холбогдоогүй"
          tone={queued > 0 ? "warn" : "ink"}
        />
      </div>

      {canRefund && (
        <div className={`mt-3 grid gap-3 ${narrow ? "grid-cols-2" : "grid-cols-2 lg:grid-cols-4"}`}>
          <Stat label="Буцаалт" value={<Money value={refundTotal} />} hint={`${refunds.length} буцаалт · өнөөдөр`} />
          <Stat label="Цэвэр борлуулалт" value={<Money value={gross - refundTotal} />} hint="борлуулалт − буцаалт" />
          <Stat label="Бэлнээр буцаасан" value={<Money value={refundCash} />} hint="кассаас бодитоор" />
          <Stat
            label="Хүлээгдэж буй буцаалт"
            value={<Money value={refundPending} />}
            hint="карт/QPay — мөнгө буцаагүй"
            tone={refundPending > 0 ? "warn" : "ink"}
          />
        </div>
      )}

      {shift && (
        <div className="mt-3 flex flex-wrap gap-3 rounded-xl bg-stage px-4 py-3 text-[13px]">
          <span className="text-mute">
            Нээлтийн үлдэгдэл{" "}
            <span className="tnum font-semibold text-ink">
              {moneyPlain(shift.openingFloat)}₮
            </span>
          </span>
          <span className="text-mute">
            Кассад байх ёстой{" "}
            <span className="tnum font-semibold text-ink">{moneyPlain(expected)}₮</span>
          </span>
          <span className="text-mute">
            Нээсэн <span className="tnum font-semibold text-ink">{shift.openedAt}</span>
          </span>
        </div>
      )}

      <h2 className="mb-3 mt-5 text-[15px] font-bold tracking-[-0.02em] text-ink">
        Гүйлгээ · {txns.length}
      </h2>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {narrow ? (
          <ul className="divide-y divide-hair">
            {txns.map((t) => (
              <li key={t.id} className="flex items-center gap-3 py-3">
                <span className="min-w-0 flex-1">
                  <span className="tnum block text-[14px] font-bold text-ink">{t.no}</span>
                  <span className="tnum mt-0.5 block text-[12px] text-mute">
                    {t.at} · {t.items} бараа · {t.method}
                  </span>
                </span>
                <span className="flex flex-col items-end gap-1">
                  <Money value={t.amount} className="text-[14px] font-bold text-ink" />
                  <ReceiptBadge state={t.receipt} />
                </span>
                {canRefund && (
                  <button type="button" onClick={() => setRefundNo(t.no)} className={btnGhost}>
                    Буцаах
                  </button>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <table className="w-full border-separate border-spacing-0">
            <thead>
              <tr>
                <Th>Дугаар</Th>
                <Th>Цаг</Th>
                <Th align="right">Бараа</Th>
                <Th>Төлбөр</Th>
                <Th align="right">Дүн</Th>
                <Th align="right">Е-баримт</Th>
                {canRefund && <Th align="right">{""}</Th>}
              </tr>
            </thead>
            <tbody>
              {txns.map((t) => (
                <tr key={t.id} className="row">
                  <Td className="tnum font-bold text-ink">{t.no}</Td>
                  <Td className="tnum text-mute">{t.at}</Td>
                  <Td align="right" className="tnum">
                    {t.items}
                  </Td>
                  <Td className="text-mute">{t.method}</Td>
                  <Td align="right" className="font-bold text-ink">
                    <Money value={t.amount} />
                  </Td>
                  <Td align="right">
                    <ReceiptBadge state={t.receipt} />
                  </Td>
                  {canRefund && (
                    <Td align="right">
                      <button type="button" onClick={() => setRefundNo(t.no)} className={btnGhost}>
                        Буцаах
                      </button>
                    </Td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {canRefund && refunds.length > 0 && (
        <>
          <h2 className="mb-3 mt-5 text-[15px] font-bold tracking-[-0.02em] text-ink">Буцаалт · {refunds.length}</h2>
          {markError && (
            <p role="alert" className="mb-3 rounded-xl bg-danger-soft px-3.5 py-2.5 text-[13px] font-semibold text-danger">
              {markError}
            </p>
          )}
          <ul className="divide-y divide-hair">
            {refunds.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-3 py-3">
                <span className="min-w-0 flex-1">
                  <span className="tnum block text-[14px] font-bold text-ink">{r.no}</span>
                  <span className="tnum mt-0.5 block text-[12px] text-mute">
                    Анхны баримт {r.saleNo} · {r.staffName} · {r.reason}
                  </span>
                </span>
                <span className="flex flex-col items-end gap-1">
                  <Money value={r.total} sign="−" className="text-[14px] font-bold text-ink" />
                  <span
                    className={`text-[12px] ${r.moneyStatus === "pending_external" ? "rounded-full bg-warn-soft px-2 py-0.5 font-semibold text-warn" : "text-mute"}`}
                  >
                    {refundMoneyLabel(r.moneyStatus, r.externalRef)}
                  </span>
                </span>
                <button type="button" onClick={() => setPrintRefund(r)} className={btnGhost}>
                  Хэвлэх
                </button>
                {r.moneyStatus === "pending_external" && (
                  <button type="button" onClick={() => markExternal(r.id)} className={btnGhost}>
                    Гараар буцаасныг тэмдэглэх
                  </button>
                )}
              </li>
            ))}
          </ul>
        </>
      )}

      {refundNo && <RefundSheet saleNo={refundNo} onClose={() => setRefundNo(null)} />}
      {printRefund && <RefundReceiptSheet refund={refunds.find((r) => r.id === printRefund.id) ?? printRefund} onClose={() => setPrintRefund(null)} />}

      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-hair pt-4">
        <button type="button" onClick={exportTxns} className={btnGhost}>
          <IconExport />
          Борлуулалт — Excel
        </button>
        <button type="button" onClick={exportVat} className={btnGhost}>
          <IconExport />
          НӨАТ тайлан — Excel
        </button>
        {canClose && (
          <span className="ml-auto w-full sm:w-auto sm:min-w-[260px]">
            <PrimaryButton onClick={doClose} disabled={closing} tone="ink">
              {closing ? "Смен хааж байна…" : "Z тайлан — смен хаах"}
            </PrimaryButton>
          </span>
        )}
        {closeError && (
          <p role="alert" className="w-full rounded-xl bg-danger-soft px-3.5 py-2.5 text-[13px] font-semibold text-danger">
            {closeError}
          </p>
        )}
      </div>
    </>
  );
}

function ReceiptBadge({ state }: { state: "Холбогдоогүй" | "Код дутуу" }) {
  if (state === "Холбогдоогүй") return <span className="text-[12px] text-mute">Е-баримт холбогдоогүй</span>;
  const warn = true;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-semibold ${
        warn ? "bg-warn-soft text-warn" : "bg-danger-soft text-danger"
      }`}
    >
      <IconAlert />
      {state}
    </span>
  );
}
