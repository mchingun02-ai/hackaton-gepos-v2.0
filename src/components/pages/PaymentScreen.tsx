"use client";

import { useState } from "react";
import { moneyPlain } from "@/lib/demo";
import { useStore } from "@/lib/store";
import { IconBack, IconCash, Wordmark } from "@/components/icons";
import { Chip, Money, PrimaryButton } from "@/components/ui";
import { Keypad } from "@/components/pages/CashierPage";

type Method = "бэлэн" | "карт" | "qpay" | "хэтэвч";

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "00", "0", "⌫"];

/**
 * Төлбөр авах.
 *
 * Дараалал чухал: төлбөр батлагдаагүй бол баримт үүсгэхгүй. Энэ дэлгэц
 * зөвхөн төлбөрийг хариуцна — е-баримт нь дараагийн алхамд оролдоно.
 *
 * Ард нь дараалал зогсож байгаа үед хоёр зүйл хамгийн хурдан олдох ёстой:
 * ХАРИУЛТ (бэх хайрцаг — accent биш, учир нь энэ бол үйлдэл биш, тоо) ба
 * «Төлбөр авах» товч — доод мөрөнд тогтмол, гүйлгэх шаардлагагүй.
 */
export default function PaymentScreen({
  onBack,
  onPaid,
  initialMethod = "бэлэн",
}: {
  onBack: () => void;
  onPaid: () => void;
  initialMethod?: Method;
}) {
  const { total, vat, discountAmount, completeSale, mode, saving, saveError, clearSaveError, serverMember, serverWalletPay } = useStore();
  // Хэтэвч — зөвхөн хэрэглэгчийн апп дээрх Gerege QR-аар танигдсан гишүүнд (картын QR-аар биш)
  const walletOk = mode === "server" && serverMember?.via === "gerege_qr";
  const [method, setMethod] = useState<Method>(initialMethod);
  const [digits, setDigits] = useState("");
  const [b2b, setB2b] = useState(false);
  const [tin, setTin] = useState("");

  const tendered = digits === "" ? 0 : Number(digits);
  const change = Math.max(0, tendered - total);
  const short = method === "бэлэн" && digits !== "" && tendered < total;
  const blocked = (method === "бэлэн" && short) || (b2b && tin.trim().length < 7) || (method === "хэтэвч" && serverWalletPay?.status !== "approved");

  const presets = [total, Math.ceil(total / 1000) * 1000, Math.ceil(total / 5000) * 5000, 50_000]
    .filter((value, index, all) => value >= total && all.indexOf(value) === index)
    .slice(0, 4);

  const press = (key: string) => {
    if (key === "⌫") setDigits((value) => value.slice(0, -1));
    else setDigits((value) => (value + key).replace(/^0+(?=\d)/, "").slice(0, 9));
  };

  /* Серверийн горимд борлуулалт хадгалагдсаныг сервер баталсны дараа л
     баримтын дэлгэц рүү шилжинэ. Алдаа гарвал сагс хэвээр, энд үлдэнэ. */
  const pay = async () => {
    const ok = await completeSale({
      method,
      change: method === "бэлэн" ? change : 0,
      tendered: method === "бэлэн" ? (digits === "" ? total : tendered) : undefined,
      b2b,
    });
    if (ok) onPaid();
  };

  const back = () => {
    clearSaveError();
    onBack();
  };

  const methodLabel = method === "бэлэн" ? "Бэлэн" : method === "карт" ? "Карт" : method === "хэтэвч" ? "Gerege хэтэвч" : "QPay";

  return (
    <div className="flex size-full flex-col bg-stage">
      <header className="flex h-[60px] shrink-0 items-center gap-2 px-3 sm:px-5">
        <button
          type="button"
          onClick={back}
          disabled={saving}
          className="press grid size-11 place-items-center rounded-xl text-ink-2 hover:bg-paper hover:text-ink"
          aria-label="Буцах"
        >
          <IconBack />
        </button>
        <Wordmark size={15} />
        <span className="meta ml-auto">Төлбөр</span>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-[640px] px-4 pb-6 sm:px-5">
          <div className="rounded-[22px] bg-paper p-5 ring-1 ring-inset ring-hair">
            <span className="meta">Нийт төлөх</span>
            <div className="mt-1 flex items-end justify-between gap-3">
              <span className="hugenum">
                {moneyPlain(total)}
                <span className="suffix">₮</span>
              </span>
              <span className="pb-1 text-right text-[12px] text-mute">
                <span className="tnum block">Үүнээс НӨАТ {moneyPlain(vat)}₮</span>
                {discountAmount > 0 && (
                  <span className="tnum block">Хөнгөлөлт −{moneyPlain(discountAmount)}₮</span>
                )}
              </span>
            </div>

            <div className={`mt-5 grid gap-2 ${walletOk ? "grid-cols-2 sm:grid-cols-4" : "grid-cols-3"}`}>
              {(
                [
                  ["бэлэн", "Бэлэн"],
                  ["карт", "Карт"],
                  ["qpay", "QPay"],
                  ...(walletOk ? ([["хэтэвч", "Хэтэвч"]] as [Method, string][]) : []),
                ] as [Method, string][]
              ).map(([key, label]) => (
                <Chip
                  key={key}
                  on={method === key}
                  onClick={() => setMethod(key)}
                  large
                  className="w-full justify-center"
                >
                  {label}
                </Chip>
              ))}
            </div>

            {method === "бэлэн" ? (
              <div className="mt-5">
                <span className="meta flex items-center gap-1.5">
                  <IconCash />
                  Авсан мөнгө
                </span>
                <div
                  className={`mt-2 flex items-baseline gap-1 border-b-2 pb-2 ${
                    short ? "border-danger" : "border-accent"
                  }`}
                >
                  <span className="tnum text-[36px] font-bold leading-none tracking-[-0.035em] text-ink">
                    {digits === "" ? "0" : moneyPlain(tendered)}
                  </span>
                  <span className="text-[18px] font-semibold text-mute">₮</span>
                </div>
                {short && (
                  <p className="tnum mt-2 text-[13px] font-semibold text-danger">
                    Дүн хүрэлцэхгүй — {moneyPlain(total - tendered)}₮ дутуу
                  </p>
                )}

                <div className="no-bar -mx-5 mt-3 flex gap-2 overflow-x-auto px-5">
                  {presets.map((value) => (
                    <Chip
                      key={value}
                      on={digits === String(value)}
                      onClick={() => setDigits(String(value))}
                    >
                      <span className="tnum">{moneyPlain(value)}₮</span>
                    </Chip>
                  ))}
                </div>

                <div className="mt-4">
                  <Keypad keys={KEYS} onPress={press} />
                </div>

                {change > 0 && (
                  <div className="mt-4 flex items-center justify-between rounded-xl bg-ink px-4 py-3 text-paper">
                    <span className="text-[14px] font-bold">Хариулт</span>
                    <span className="tnum text-[26px] font-bold leading-none tracking-[-0.03em]">
                      {moneyPlain(change)}
                      <span className="ml-0.5 text-[0.6em] font-semibold opacity-60">₮</span>
                    </span>
                  </div>
                )}
              </div>
            ) : method === "хэтэвч" ? (
              <WalletBlock />
            ) : (
              <div className="mt-5 rounded-xl bg-stage px-4 py-7 text-center">
                <span className="mx-auto mb-3 grid size-10 place-items-center rounded-full bg-paper text-ink ring-1 ring-inset ring-hair">
                  <IconCash />
                </span>
                <p className="text-[14px] font-bold text-ink">
                  {method === "карт" ? "Картаа уншуулна уу" : "QPay QR-ыг уншуулна уу"}
                </p>
                <p className="mt-1 text-[12px] text-mute">
                  {method === "карт"
                    ? "Банкны терминал хариу өгөхийг хүлээнэ"
                    : "Төлбөр баталгаажмагц автоматаар үргэлжилнэ"}
                </p>
              </div>
            )}

            <div className="mt-5 border-t border-hair pt-4">
              <button
                type="button"
                onClick={() => setB2b((value) => !value)}
                aria-pressed={b2b}
                className={`press flex h-11 w-full items-center gap-2 rounded-xl px-3.5 text-[13px] font-semibold ${
                  b2b ? "bg-ink text-paper" : "bg-stage text-ink-2 hover:text-ink"
                }`}
              >
                Байгууллагын баримт · B2B
                <span className={`ml-auto text-[12px] ${b2b ? "text-paper/60" : "text-mute"}`}>
                  {b2b ? "Болих" : "Нэмэх"}
                </span>
              </button>

              {b2b && (
                <label className="mt-2 block">
                  <span className="sr-only">Худалдан авагчийн ТТД</span>
                  <input
                    value={tin}
                    onChange={(event) => setTin(event.target.value.replace(/\D/g, "").slice(0, 10))}
                    inputMode="numeric"
                    autoFocus
                    placeholder="Худалдан авагчийн ТТД"
                    className="tnum h-12 w-full rounded-xl bg-stage px-4 text-[15px] text-ink ring-1 ring-inset ring-transparent placeholder:text-mute focus:bg-paper focus:outline-none focus:ring-accent"
                  />
                </label>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Доод мөр тогтмол: дараалалтай үед гүйлгэж товч хайх цаг байхгүй */}
      <div className="shrink-0 border-t border-hair bg-paper px-4 py-3 sm:px-5">
        {saveError && (
          <p
            role="alert"
            className="mx-auto mb-3 flex max-w-[640px] items-start gap-2 rounded-xl bg-danger-soft px-3.5 py-2.5 text-[13px] font-semibold text-danger"
          >
            <span className="min-w-0 flex-1">
              {saveError}
              <span className="mt-0.5 block font-normal text-ink-2">
                Сагс хэвээр байна. «Дахин оролдох» дарахад давхар гүйлгээ үүсэхгүй.
              </span>
            </span>
          </p>
        )}
        <div className="mx-auto flex max-w-[640px] items-center gap-4">
          <span className="min-w-0 leading-tight">
            <span className="meta block">
              {methodLabel}
              {mode === "demo" && " · туршилт"}
            </span>
            <Money value={total} className="text-[20px] font-bold text-ink" />
          </span>
          <span className="ml-auto w-full max-w-[260px]">
            <PrimaryButton disabled={blocked || saving} onClick={pay}>
              {saving ? "Серверт хадгалж байна…" : saveError ? "Дахин оролдох" : "Төлбөр авах"}
            </PrimaryButton>
          </span>
        </div>
      </div>
    </div>
  );
}

/**
 * Gerege хэтэвч: кассчин нийт дүнгээр хүсэлт илгээнэ → хэрэглэгч АПП ДЭЭРЭЭ зөвшөөрнө → «Төлбөр авах».
 * QR дангаараа мөнгө хасаж чадахгүй; дүн, үлдэгдлийг сервер борлуулалтын transaction-д дахин шалгана.
 */
function WalletBlock() {
  const { total, serverMember, serverWalletPay, requestServerWalletPay, cancelServerWalletPay } = useStore();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const p = serverWalletPay;
  const send = async () => {
    setBusy(true);
    setError(null);
    const err = await requestServerWalletPay();
    setBusy(false);
    if (err) setError(err);
  };
  const ended = p && (p.status === "declined" || p.status === "expired" || p.status === "cancelled");

  return (
    <div className="mt-5 rounded-xl bg-stage px-4 py-6 text-center">
      <span className="mx-auto mb-3 grid size-10 place-items-center rounded-full bg-[#111114] text-[15px] font-extrabold text-white">G</span>
      {p?.status === "pending" ? (
        <div role="status">
          <p className="flex items-center justify-center gap-2 text-[14px] font-bold text-ink">
            <span className="size-2 animate-pulse rounded-full bg-accent" />
            Хэрэглэгч апп дээрээ зөвшөөрөхийг хүлээж байна…
          </p>
          <p className="tnum mt-1 text-[12px] text-mute">
            {serverMember?.name ?? "Гишүүн"} · {moneyPlain(p.amount)}₮
          </p>
          <button type="button" className="mt-3 text-[12.5px] font-semibold text-mute hover:text-danger" onClick={cancelServerWalletPay}>
            Цуцлах
          </button>
        </div>
      ) : p?.status === "approved" ? (
        <div role="status">
          <p className="text-[14px] font-bold text-ok">✓ Хэрэглэгч {moneyPlain(p.amount)}₮ төлөхийг зөвшөөрлөө</p>
          <p className="mt-1 text-[12px] text-mute">«Төлбөр авах» дарахад хэтэвчнээс хасагдана.</p>
          <button type="button" className="mt-3 text-[12.5px] font-semibold text-mute hover:text-danger" onClick={cancelServerWalletPay}>
            Болих
          </button>
        </div>
      ) : (
        <div>
          <p className="text-[14px] font-bold text-ink">Gerege хэтэвчээр төлөх</p>
          <p className="mt-1 text-[12px] text-mute">Хэрэглэгч апп дээрээ {moneyPlain(total)}₮ төлөхийг зөвшөөрнө.</p>
          {ended && (
            <p role="alert" className="mt-2 text-[12px] font-semibold text-danger">
              {p.status === "declined" ? "Хэрэглэгч татгалзсан." : p.status === "expired" ? "Хугацаа дууссан." : "Цуцлагдсан."}
            </p>
          )}
          {error && (
            <p role="alert" className="mt-2 text-[12px] font-semibold text-danger">
              {error}
            </p>
          )}
          <button
            type="button"
            disabled={busy || total <= 0}
            onClick={() => void send()}
            className="press mt-4 h-11 rounded-xl bg-ink px-5 text-[13.5px] font-bold text-paper disabled:opacity-40"
          >
            {busy ? "Илгээж байна…" : ended ? "Дахин хүсэх" : "Хэрэглэгчээс зөвшөөрөл хүсэх"}
          </button>
        </div>
      )}
    </div>
  );
}
