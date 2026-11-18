"use client";

import { useState } from "react";
import { cartTotal, formatQty, lineTotal, moneyPlain, vatOf } from "@/lib/demo";
import { useStore } from "@/lib/store";
import { IconAlert, IconPrint, Wordmark } from "@/components/icons";
import { PrimaryButton } from "@/components/ui";
import PaySuccess from "@/components/pages/PaySuccess";

/** 58мм цаас = 32 тэмдэгт */
const W = 32;
const row = (left: string, right: string) =>
  left + " ".repeat(Math.max(1, W - right.length - left.length)) + right;
const mid = (text: string) => " ".repeat(Math.max(0, Math.floor((W - text.length) / 2))) + text;
const rule = "-".repeat(W);

/**
 * Гүйлгээ дууссаны дэлгэц.
 *
 * Баримт үүссэн ба дараалалд орсон хоёрыг тод ялгана. Аль ч тохиолдолд
 * гүйлгээ амжилттай — PosAPI унасан нь худалдааг зогсоох шалтгаан биш.
 */
export default function ReceiptScreen({ onNext }: { onNext: () => void }) {
  const { lastSale, person } = useStore();
  /* Амжилттай дэлгэц эхлээд гарч, дараа нь баримт. Нэг гүйлгээнд
     нэг л удаа — дарсны дараа дахин гарахгүй. */
  const [celebrating, setCelebrating] = useState(true);

  if (!lastSale) {
    return (
      <div className="grid size-full place-items-center bg-stage">
        <button type="button" onClick={onNext} className="press text-[14px] font-semibold text-ink">
          Касс руу буцах
        </button>
      </div>
    );
  }

  /* Урамшууллыг борлуулалтын агшинд хөлдөөж авсан — одоогийн сагснаас
     дахин бодвол дараагийн гүйлгээ эхлэхэд баримт өөрчлөгдөнө. */
  const { lines, change, queued, no, loyalty, method } = lastSale;
  const subtotal = cartTotal(lines);
  const discountAmount = loyalty.off;
  const total = subtotal - discountAmount - loyalty.spent;
  const vat = vatOf(total);

  const paper = [
    mid("Жишээ дэлгүүр ХХК"),
    mid("ТТД: 1234567"),
    mid("Салбар 001 · Касс 10000001"),
    rule,
    row("Кассчин", person?.name ?? "—"),
    row("Гүйлгээ", no),
    rule,
    ...lines.flatMap((item) => [
      item.product.name,
      row(
        `  ${formatQty(item.qty, item.product.unit)} x ${moneyPlain(item.product.price)}₮`,
        `${moneyPlain(lineTotal(item))}₮`,
      ),
    ]),
    rule,
    row("ДҮН", `${moneyPlain(subtotal)}₮`),
    ...(discountAmount > 0
      ? [row(`Хөнгөлөлт ${loyalty.member?.tier ?? ""}`.trim(), `-${moneyPlain(discountAmount)}₮`)]
      : []),
    ...(loyalty.spent > 0 ? [row("Оноогоор", `-${moneyPlain(loyalty.spent)}₮`)] : []),
    row("НИЙТ", `${moneyPlain(total)}₮`),
    row("НӨАТ", `${moneyPlain(vat)}₮`),
    ...(change > 0 ? [row("Хариулт", `${moneyPlain(change)}₮`)] : []),
    rule,

    /* Үйлчлүүлэгч оноогоо яг энд хардаг — урамшууллын мөчлөг
       хаагддаг цорын ганц газар. Үүнгүй бол оноо нь үл үзэгдэх тоо. */
    ...(loyalty.member
      ? [
          row("Харилцагч", loyalty.member.name),
          row("Оноо", `+${moneyPlain(loyalty.earned)}`),
          row("Үлдэгдэл оноо", moneyPlain(loyalty.member.points - loyalty.spent + loyalty.earned)),
          rule,
        ]
      : []),
    // PosAPI холбогдоогүй — татварын баримт, сугалаа, QR хэвлэхгүй
    mid("Е-БАРИМТ ХОЛБОГДООГҮЙ"),
    mid("Татварын баримт биш"),
    ...(queued ? [mid("Татварын код дутуу бараатай")] : []),
    mid(no),
    "",
    mid("Баярлалаа"),
  ].join("\n");

  return (
    <div className="relative flex size-full flex-col bg-stage">
      {celebrating && (
        <PaySuccess
          total={total}
          change={change}
          earned={loyalty.earned}
          queued={queued}
          method={method}
          onDone={() => setCelebrating(false)}
        />
      )}

      <header className="flex h-[60px] shrink-0 items-center px-5">
        <Wordmark size={15} />
        <span className="meta ml-auto">Баримт · {no}</span>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-[560px] px-4 pb-6 sm:px-5">
        <span className="meta flex items-center gap-2">
          <span className="inline-block size-[7px] rounded-full bg-accent" aria-hidden="true" />
          Төлбөр амжилттай
        </span>
        <div className="hugenum mt-2">
          {moneyPlain(total)}
          <span className="suffix">₮</span>
        </div>

        {/* Хариулт — энэ дэлгэцийн хамгийн чухал тоо: кассчин харж, мөнгөө өгнө */}
        {change > 0 && (
          <div className="mt-5 flex items-center justify-between rounded-[18px] bg-ink px-5 py-4 text-paper">
            <span className="text-[15px] font-bold">Хариулт өгөх</span>
            <span className="tnum text-[30px] font-bold leading-none tracking-[-0.03em]">
              {moneyPlain(change)}
              <span className="ml-0.5 text-[0.6em] font-semibold opacity-60">₮</span>
            </span>
          </div>
        )}

        <div
          className={`mt-4 rounded-[18px] p-4 ${
            "bg-warn-soft text-warn"
          }`}
        >
          <div className="flex items-center gap-2 text-[15px] font-bold">
            <IconAlert />
            Е-баримт холбогдоогүй
          </div>
          <p className="mt-1.5 text-[13px] leading-[18px]">
            Гүйлгээ бүртгэгдсэн, гэхдээ татварын баримт (сугалаа, QR) үүсээгүй — PosAPI холбогдоогүй.
            {queued && " Сагсанд татварын код дутуу бараа байсан."}
          </p>
        </div>

        <span className="meta mt-5 block">Хэвлэсэн баримт</span>
        {/* print-paper — хэвлэхэд зөвхөн энэ блок цаасан дээр гарна */}
        <div className="print-paper mt-2 overflow-x-auto rounded-[18px] bg-paper p-4 ring-1 ring-inset ring-hair">
          <pre className="font-mono text-[11px] leading-[15px] text-ink">{paper}</pre>
        </div>
      </div>
      </div>

      <div className="shrink-0 border-t border-hair bg-paper px-4 py-3 sm:px-5">
        <div className="mx-auto max-w-[560px]">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => window.print()}
              className="press flex h-[52px] shrink-0 items-center gap-2 rounded-xl px-4 text-[14px] font-bold text-ink-2 ring-1 ring-inset ring-hair hover:text-ink hover:ring-line"
            >
              <IconPrint />
              Хэвлэх
            </button>
            <PrimaryButton onClick={onNext}>Дараагийн гүйлгээ</PrimaryButton>
          </div>
        </div>
      </div>
    </div>
  );
}
