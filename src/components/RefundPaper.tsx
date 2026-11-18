"use client";

import { formatQty, moneyPlain } from "@/lib/demo";
import type { ServerRefund } from "@/lib/pos-api";

/** 58мм цаас = 32 тэмдэгт (борлуулалтын баримттай ижил) */
const W = 32;
const row = (left: string, right: string) => left + " ".repeat(Math.max(1, W - right.length - left.length)) + right;
const mid = (text: string) => " ".repeat(Math.max(0, Math.floor((W - text.length) / 2))) + text;
const rule = "-".repeat(W);
/** Урт текстийг 32 тэмдэгтээр таслана (үгээр) */
const wrap = (text: string, indent = "") => {
  const out: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/).filter(Boolean)) {
    if ((line + " " + word).trim().length > W - indent.length) {
      if (line) out.push(indent + line);
      line = word;
    } else line = (line + " " + word).trim();
  }
  if (line) out.push(indent + line);
  return out;
};
const pad = (n: number) => String(n).padStart(2, "0");
const stamp = (iso: string) => {
  const d = new Date(iso);
  return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

/** Мөнгөний бодит төлөв — баримт дээр */
export const refundMoneyLines = (r: ServerRefund) =>
  r.moneyStatus === "refunded_cash"
    ? ["Мөнгө: Бэлнээр буцаасан"]
    : r.moneyStatus === "refunded_external_manual"
      ? ["Мөнгө: Гараар буцаасан", ...wrap(`Лавлагаа: ${r.externalRef ?? r.payout?.reference ?? "—"}`)]
      : ["Мөнгө: Буцаалт хүлээгдэж буй", ...wrap("Карт/QPay — мөнгө автоматаар буцаагүй")];

export function refundPaperText(r: ServerRefund) {
  const method = r.method === "cash" ? "Бэлэн" : r.method === "card" ? "Карт" : r.method === "wallet" ? "Gerege хэтэвч" : "QPay";
  return [
    ...(r.merchantName ? [mid(r.merchantName)] : []),
    mid(`${r.branchName ?? "Салбар"} · Касс ${r.deviceNo ?? "—"}`),
    rule,
    mid("БУЦААЛТЫН БАРИМТ"),
    row("Буцаалт", r.no),
    row("Анхны баримт", r.saleNo ?? "—"),
    row("Огноо", stamp(r.createdAt)),
    row("Ажилтан", r.staffName ?? "—"),
    row("Анхны төлбөр", method),
    ...wrap(`Шалтгаан: ${r.reason}`),
    rule,
    ...r.lines.flatMap((l) => [
      ...wrap(l.name),
      row(`  ${formatQty(l.qty, l.unit ?? "ш")} x ${moneyPlain(l.unitPrice)}₮`, `-${moneyPlain(l.refundAmount)}₮`),
      `  ${l.disposition === "restock" ? "Үлдэгдэлд буцаасан" : l.disposition === "damaged" ? "Гэмтэлтэй — худалдахгүй" : "Задгай дүн"}`,
    ]),
    rule,
    row("ДҮН", `${moneyPlain(r.subtotal)}₮`),
    ...(r.discount > 0 ? [row("Хөнгөлөлт", `-${moneyPlain(r.discount)}₮`)] : []),
    row("БУЦААХ", `${moneyPlain(r.total)}₮`),
    row("Үүнээс НӨАТ", `${moneyPlain(r.vat)}₮`),
    rule,
    ...refundMoneyLines(r),
    rule,
    mid("Е-БАРИМТ ХОЛБОГДООГҮЙ"),
    mid("Татварын буцаалтын баримт биш"),
    mid(r.no),
    "",
  ].join("\n");
}

/** Хэвлэх цаас — зөвхөн энэ блок цаасан дээр гарна (.print-paper) */
export default function RefundPaper({ refund }: { refund: ServerRefund }) {
  return (
    <div className="print-paper overflow-x-auto rounded-[18px] bg-paper p-4 ring-1 ring-inset ring-hair" data-refund-paper={refund.no}>
      <pre className="font-mono text-[11px] leading-[15px] text-ink">{refundPaperText(refund)}</pre>
    </div>
  );
}
