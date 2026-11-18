"use client";

/* Касс / Борлуулалт — гүйлгээний жагсаалт, дэлгэрэнгүй, буцаалт (BR09-6) */

import { useMemo, useState } from "react";
import { Badge, Btn, Empty, Field, Notice, SearchField, toast } from "@/components/sp/ui";
import { fmtPhone, METHOD_LABEL, money, num, staffName } from "@/lib/sp/logic";
import { refundSale, SpError } from "@/lib/sp/store";
import type { Sale } from "@/lib/sp/types";
import { Dialog, Drawer, KV, Page, RangePicker, SectionTitle, Select, Table, Toolbar, dateTime, useRange, usePortal } from "./kit";

export const EBARIMT_LABEL: Record<Sale["ebarimt"]["status"], { label: string; tone: "ok" | "warn" | "danger" | "gray" }> = {
  sent: { label: "Илгээсэн", tone: "ok" },
  other: { label: "Бусад төрөл", tone: "warn" },
  off: { label: "Холбоогүй", tone: "danger" },
  reversed: { label: "Буцаасан", tone: "gray" },
};

export default function Sales() {
  const { s } = usePortal();
  const { range, setRange, from, to } = useRange("today");
  const [channel, setChannel] = useState<"all" | "pos" | "delivery">("all");
  const [method, setMethod] = useState<"all" | Sale["method"]>("all");
  const [cashier, setCashier] = useState("all");
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<string | null>(null);

  const rows = useMemo(
    () =>
      s.sales.filter((x) => {
        const t = new Date(x.at);
        // № хайхад хугацааны шүүлтийг үл тооно
        const n = q.replace(/\D/g, "");
        if (n) return String(x.no).includes(n);
        return t >= from && t <= to && (channel === "all" || x.channel === channel) && (method === "all" || x.method === method) && (cashier === "all" || x.staffId === cashier);
      }).sort((a, b) => b.at.localeCompare(a.at)),
    [s.sales, from, to, channel, method, cashier, q],
  );
  const ok = rows.filter((x) => !x.refund);
  const total = ok.reduce((a, x) => a + x.total, 0);
  const sale = s.sales.find((x) => x.id === open) ?? null;

  return (
    <Page title="Касс / Борлуулалт" sub={`${num(ok.length)} гүйлгээ · ${money(total)}${rows.length - ok.length ? ` · ${rows.length - ok.length} буцаалт` : ""}`}>
      <Toolbar>
        <div className="w-[220px]">
          <SearchField value={q} onChange={setQ} placeholder="Гүйлгээний №" />
        </div>
        <RangePicker value={range} onChange={setRange} />
        <Select label="Суваг" value={channel} onChange={setChannel} options={[{ id: "all", label: "Бүх суваг" }, { id: "pos", label: "Дэлгүүрт" }, { id: "delivery", label: "Хүргэлт" }]} />
        <Select label="Төлбөр" value={method} onChange={setMethod} options={[{ id: "all", label: "Бүх төлбөр" }, ...(["cash", "card", "qr"] as const).map((m) => ({ id: m, label: METHOD_LABEL[m] }))]} />
        <Select label="Кассчин" value={cashier} onChange={setCashier} options={[{ id: "all", label: "Бүх ажилтан" }, ...s.staff.map((x) => ({ id: x.id, label: staffName(x) }))]} />
      </Toolbar>
      <Table
        rows={rows}
        rowKey={(r) => r.id}
        onRow={(r) => setOpen(r.id)}
        rowClass={(r) => !!r.refund && "opacity-60"}
        empty={<Empty icon="receipt" title="Гүйлгээ олдсонгүй" body="Хугацаа эсвэл шүүлтүүрээ өөрчлөөд үзнэ үү." />}
        cols={[
          { key: "no", label: "№", w: "80px", render: (r) => <span className="font-medium tnum">{r.no}</span> },
          { key: "at", label: "Огноо", render: (r) => <span className="whitespace-nowrap tnum">{dateTime(r.at)}</span> },
          { key: "ch", label: "Суваг", render: (r) => (r.channel === "delivery" ? <Badge icon="truck">Хүргэлт</Badge> : <Badge>Дэлгүүрт</Badge>) },
          { key: "st", label: "Кассчин", render: (r) => staffName(s.staff.find((x) => x.id === r.staffId)) },
          { key: "m", label: "Төлбөр", render: (r) => METHOD_LABEL[r.method] },
          { key: "eb", label: "Ebarimt", render: (r) => <Badge tone={EBARIMT_LABEL[r.ebarimt.status].tone}>{EBARIMT_LABEL[r.ebarimt.status].label}</Badge> },
          { key: "t", label: "Дүн", align: "right", render: (r) => (r.refund ? <span><Badge tone="danger">Буцаасан</Badge> <s className="text-mute">{money(r.total)}</s></span> : <span className="font-semibold">{money(r.total)}</span>) },
        ]}
      />
      <SaleDrawer sale={sale} onClose={() => setOpen(null)} />
    </Page>
  );
}

export function SaleDrawer({ sale, onClose }: { sale: Sale | null; onClose: () => void }) {
  const { s, actor, canManage } = usePortal();
  const [ask, setAsk] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const cust = sale?.customerId ? s.customers.find((c) => c.id === sale.customerId) : null;

  const doRefund = () => {
    if (!sale) return;
    setBusy(true);
    try {
      refundSale(actor, sale.id, reason.trim() || "Харилцагчийн хүсэлтээр");
      toast(`№${sale.no} буцаагдлаа`, "ok");
      setAsk(false);
      setReason("");
    } catch (e) {
      toast(e instanceof SpError ? e.message : "Буцаалт амжилтгүй", "danger");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Drawer
        open={!!sale}
        onClose={onClose}
        title={sale ? `Гүйлгээ №${sale.no}` : ""}
        sub={sale ? `${dateTime(sale.at)} · ${staffName(s.staff.find((x) => x.id === sale.staffId))}` : ""}
        footer={
          sale && !sale.refund && canManage ? (
            <Btn size="md" variant="dangerTinted" icon="undo" onClick={() => setAsk(true)}>
              Буцаалт хийх
            </Btn>
          ) : undefined
        }
      >
        {sale && (
          <>
            {sale.refund && (
              <div className="mb-4">
                <Notice tone="danger" icon="undo">
                  {dateTime(sale.refund.at)}-д {sale.refund.by} буцаасан: {sale.refund.reason}
                </Notice>
              </div>
            )}
            <SectionTitle>Бараа</SectionTitle>
            <div className="overflow-hidden rounded-[14px] bg-paper">
              {sale.lines.map((l, i) => (
                <div key={i} className="flex min-h-[44px] items-center gap-3 border-t border-[var(--sp-sep)] px-4 py-2 text-[14px] first:border-t-0">
                  <span className="min-w-0 flex-1 text-ink">
                    {l.name} {l.free && <Badge tone="accent" icon="gift">Шагнал</Badge>}
                  </span>
                  <span className="text-mute tnum">
                    {l.qty} × {money(l.price)}
                  </span>
                  <span className="w-24 text-right font-medium text-ink tnum">{money(l.qty * l.price)}</span>
                </div>
              ))}
            </div>
            <SectionTitle>Тооцоо</SectionTitle>
            <KV
              rows={[
                ["Нийт", money(sale.subtotal)],
                ...sale.applied.map((a) => [<span key={a.campaignId}>Урамшуулал · {a.name}</span>, <span key="v" className="text-ok tnum">−{money(a.amount)}</span>] as [React.ReactNode, React.ReactNode]),
                ...(sale.pointsSpent ? [["Оноогоор төлсөн", <span key="p" className="tnum">−{money(sale.pointsSpent)}</span>] as [React.ReactNode, React.ReactNode]] : []),
                ["Төлсөн", <b key="t" className="tnum">{money(sale.total)}</b>],
                ["Төлбөрийн хэлбэр", METHOD_LABEL[sale.method]],
                ...(sale.cashGiven ? [["Бэлэн өгсөн / хариулт", `${money(sale.cashGiven)} / ${money(sale.cashGiven - sale.total)}`] as [React.ReactNode, React.ReactNode]] : []),
              ]}
            />
            <SectionTitle>Харилцагч ба оноо</SectionTitle>
            <KV
              rows={[
                ["Харилцагч", cust ? `${cust.name ?? "—"} · ${fmtPhone(cust.phone)}` : "Бүртгэлгүй"],
                ["Олгосон оноо", <span key="e" className="tnum">+{num(sale.pointsEarned)}</span>],
                ["Зарцуулсан оноо", <span key="s" className="tnum">{num(sale.pointsSpent)}</span>],
              ]}
            />
            <SectionTitle>Ebarimt</SectionTitle>
            <KV
              rows={[
                ["Төлөв", <Badge key="b" tone={EBARIMT_LABEL[sale.ebarimt.status].tone}>{EBARIMT_LABEL[sale.ebarimt.status].label}</Badge>],
                ["Төрөл", sale.ebarimt.kind === "org" ? `Байгууллага · ${sale.ebarimt.orgName ?? sale.ebarimt.orgReg}` : "Хувь хүн"],
                ["ДДТД", <span key="d" className="break-all font-mono text-[12px]">{sale.ebarimt.ddtd}</span>],
                ...(sale.ebarimt.lottery ? [["Сугалаа", sale.ebarimt.lottery] as [React.ReactNode, React.ReactNode]] : []),
              ]}
            />
          </>
        )}
      </Drawer>
      <Dialog
        open={ask}
        onClose={() => setAsk(false)}
        title="Буцаалт хийх"
        width={460}
        footer={
          <>
            <Btn size="md" variant="gray" onClick={() => setAsk(false)}>
              Болих
            </Btn>
            <Btn size="md" variant="danger" loading={busy} onClick={doRefund}>
              {sale ? `${money(sale.total)} буцаах` : "Буцаах"}
            </Btn>
          </>
        }
      >
        <p className="text-[15px] leading-snug text-ink-2">Буцаалт хийхэд:</p>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-[14px] text-ink-2">
          <li>Ebarimt руу буцаалтын (reverse) баримт явна</li>
          <li>Бараа нөөцөд буцаж нэмэгдэнэ</li>
          <li>Олгосон оноо хасагдаж, зарцуулсан оноо сэргэнэ</li>
        </ul>
        {sale?.method === "qr" && (
          <div className="mt-3">
            <Notice tone="warn">QR төлбөрийг та банкны аппаас харилцагч руу өөрөө буцаана.</Notice>
          </div>
        )}
        {sale?.method === "card" && (
          <div className="mt-3">
            <Notice tone="gray">Картын төлбөрийг пос төхөөрөмж дээр буцаалт (void/refund) хийнэ.</Notice>
          </div>
        )}
        <div className="mt-4">
          <Field label="Шалтгаан">
            <input className="sp-field" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Харилцагчийн хүсэлтээр" />
          </Field>
        </div>
      </Dialog>
    </>
  );
}
