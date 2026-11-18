"use client";

/* 58мм баримт — .print-paper + window.print (32 тэмдэгт мөр). */

import { useSp } from "@/lib/sp/store";
import { maskPhone, METHOD_LABEL, num, staffName } from "@/lib/sp/logic";
import type { Sale, SpState } from "@/lib/sp/types";
import { QrCode } from "@/components/QrCode";

const W = 32;
const row = (l: string, r: string) => {
  const space = W - l.length - r.length;
  return space >= 1 ? l + " ".repeat(space) + r : `${l}\n${" ".repeat(Math.max(0, W - r.length))}${r}`;
};
const mid = (t: string) => " ".repeat(Math.max(0, Math.floor((W - t.length) / 2))) + t;
const rule = "-".repeat(W);

export function receiptText(s: SpState, sale: Sale) {
  const d = new Date(sale.at);
  const date = `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  const cashier = s.staff.find((x) => x.id === sale.staffId);
  const cu = s.customers.find((c) => c.id === sale.customerId);
  const out = [mid(s.delivery.page.name), mid(`ТТД ${s.merchant.regNo}`), rule, row("Гүйлгээ", `№${String(sale.no).padStart(4, "0")}`), row("Огноо", date), row("Кассчин", staffName(cashier)), rule];
  for (const l of sale.lines) {
    out.push(l.name.slice(0, W));
    out.push(row(`  ${l.qty} × ${num(l.price)}`, l.free ? "0" : num(l.qty * l.price)));
  }
  out.push(rule, row("Дүн", num(sale.subtotal)));
  for (const a of sale.applied) out.push(row(a.name.slice(0, 22), `-${num(a.amount)}`));
  if (sale.pointsSpent) out.push(row(`Оноо ${num(sale.pointsSpent)}`, `-${num(sale.pointsSpent)}`));
  const tax = sale.tax ?? { vat: Math.round(sale.total / 11), city: 0 };
  out.push(row("ТӨЛСӨН", `${num(sale.total)}₮`), row(METHOD_LABEL[sale.method], ""));
  out.push(row("Үүнээс НӨАТ", tax.vat.toFixed(2)));
  if (tax.city) out.push(row("Үүнээс НХАТ", tax.city.toFixed(2)));
  if (sale.cashGiven) out.push(row("Авсан", num(sale.cashGiven)), row("Хариулт", num(sale.cashGiven - sale.total)));
  if (cu) {
    out.push(rule, row("Харилцагч", maskPhone(cu.phone)));
    if (sale.pointsEarned) out.push(row("Нэмэгдсэн оноо", `+${num(sale.pointsEarned)}`));
    out.push(row("Үлдэгдэл оноо", num(cu.points)));
  }
  out.push(rule, mid("И-БАРИМТ"));
  if (sale.ebarimt.status === "off") out.push(mid("Ebarimt холбогдоогүй"));
  else {
    if (sale.ebarimt.kind === "org") out.push(row("Байгууллага", sale.ebarimt.orgReg ?? ""));
    out.push(row("ДДТД", sale.ebarimt.ddtd.slice(0, 12) + "…"));
    if (sale.ebarimt.lottery) out.push(row("Сугалаа", sale.ebarimt.lottery));
    if (sale.ebarimt.status === "reversed") out.push(mid("БУЦААГДСАН"));
  }
  if (sale.refund) out.push(rule, mid("БУЦААЛТ"), row("Шалтгаан", sale.refund.reason.slice(0, 20)));
  return out.join("\n");
}

export function ReceiptPaper({ sale }: { sale: Sale }) {
  const s = useSp();
  return (
    <div className="print-paper mx-auto w-full max-w-[300px] rounded-[14px] bg-white p-4 text-black shadow-[0_1px_0_rgb(0_0_0/0.06),0_10px_30px_-18px_rgb(0_0_0/0.4)]">
      <pre className="whitespace-pre-wrap font-mono text-[10.5px] leading-[15px] text-black">{receiptText(s, sale)}</pre>
      {sale.ebarimt.status !== "off" && (
        <div className="mt-2 flex flex-col items-center gap-1">
          <QrCode value={`https://ebarimt.mn/?ddtd=${sale.ebarimt.ddtd}`} size={132} label="И-баримтын QR" />
          <pre className="font-mono text-[10px] text-black">ebarimt.mn-д бүртгүүлээрэй</pre>
        </div>
      )}
    </div>
  );
}

export const printReceipt = () => setTimeout(() => window.print(), 120);
