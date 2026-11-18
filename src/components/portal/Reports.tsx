"use client";

/* Тайлан — BR08: 7 таб, хугацааны шүүлт, кассчны задаргаа, CSV экспорт */

import { useMemo, useState } from "react";
import { Badge, Btn, Empty, toast } from "@/components/sp/ui";
import { CANCEL_LABEL, METHOD_LABEL, money, num, orderState, staffName } from "@/lib/sp/logic";
import type { Audit, Campaign, Sale, SmsCampaign, SmsLog } from "@/lib/sp/types";
import { Card, Page, RangePicker, SectionTitle, Stat, Table, Tabs, dateTime, downloadCsv, usePortal, useRange, ymd } from "./kit";
import { EBARIMT_LABEL } from "./Sales";

type Tab = "pos" | "delivery" | "sms" | "dsms" | "audit" | "campaigns" | "ebarimt";
const TABS: { id: Tab; label: string }[] = [
  { id: "pos", label: "Биет борлуулалт" },
  { id: "delivery", label: "Хүргэлтийн борлуулалт" },
  { id: "sms", label: "Маркетинг SMS" },
  { id: "dsms", label: "Хүргэлтийн SMS" },
  { id: "audit", label: "Тохиргооны лог" },
  { id: "campaigns", label: "Урамшуулал" },
  { id: "ebarimt", label: "Ebarimt тулгалт" },
];

const EB_LABEL = Object.fromEntries(Object.entries(EBARIMT_LABEL).map(([k, v]) => [k, v.label])) as Record<Sale["ebarimt"]["status"], string>;

export default function Reports() {
  const { s, sub } = usePortal();
  const [tab, setTab] = useState<Tab>(() => (TABS.some((t) => t.id === sub) ? (sub as Tab) : "pos"));
  const { range, setRange, from, to } = useRange("7");
  const inR = (iso: string) => {
    const t = new Date(iso);
    return t >= from && t <= to;
  };
  const staffOf = (id: string) => staffName(s.staff.find((x) => x.id === id));

  const sales = useMemo(() => s.sales.filter((x) => inR(x.at)), [s.sales, from, to]); // eslint-disable-line react-hooks/exhaustive-deps
  const pos = sales.filter((x) => x.channel === "pos");
  const del = sales.filter((x) => x.channel === "delivery");
  const orders = s.orders.filter((o) => inR(o.createdAt));
  const msms = s.sms.filter((x) => inR(x.at));
  const dsms = s.smsLog.filter((x) => x.kind === "delivery" && inR(x.at));
  const log = s.audit.filter((x) => inR(x.at)).sort((a, b) => b.at.localeCompare(a.at));

  const camps = useMemo(
    () =>
      s.campaigns.map((c) => {
        const hit = sales.filter((x) => !x.refund && (c.type === "item" ? x.applied.some((a) => a.campaignId === c.id) : x.customerId && (x.pointsEarned || x.pointsSpent) && x.at.slice(0, 10) >= c.start && x.at.slice(0, 10) <= c.end));
        return {
          c,
          customers: new Set(hit.map((x) => x.customerId).filter(Boolean)).size,
          uses: hit.length,
          given: c.type === "point" ? hit.reduce((a, x) => a + x.pointsEarned, 0) : 0,
          spent: c.type === "point" ? hit.reduce((a, x) => a + x.pointsSpent, 0) : 0,
          discount: hit.reduce((a, x) => a + x.applied.filter((y) => y.campaignId === c.id).reduce((b, y) => b + y.amount, 0), 0),
        };
      }),
    [s.campaigns, sales],
  );

  // Ebarimt тулгалт: өдөр бүр борлуулалт ↔ илгээсэн баримт
  const days = useMemo(() => {
    const m = new Map<string, { sales: number; sent: number; n: number; bad: number }>();
    for (const x of sales) {
      const d = ymd(new Date(x.at));
      const r = m.get(d) ?? { sales: 0, sent: 0, n: 0, bad: 0 };
      if (!x.refund) {
        r.sales += x.total;
        r.n += 1;
        if (x.ebarimt.status === "sent") r.sent += x.total;
      }
      if (mismatch(x)) r.bad += 1;
      m.set(d, r);
    }
    return [...m.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [sales]);
  const bad = sales.filter(mismatch);

  const exportCsv = () => {
    const name = `${TABS.find((t) => t.id === tab)!.label} ${range.from}_${range.to}`;
    const saleRows = (list: Sale[]) => [
      ["№", "Огноо", "Кассчин", "Суваг", "Төлбөр", "Дүн", "Хямдрал", "Оноо олгосон", "Оноо зарцуулсан", "Ebarimt", "Буцаалт"],
      ...list.map((x) => [x.no, dateTime(x.at), staffOf(x.staffId), x.channel, METHOD_LABEL[x.method], x.total, x.applied.reduce((a, y) => a + y.amount, 0), x.pointsEarned, x.pointsSpent, EB_LABEL[x.ebarimt.status], x.refund ? x.refund.reason : ""]),
    ];
    const rows: (string | number)[][] =
      tab === "pos"
        ? saleRows(pos)
        : tab === "delivery"
          ? saleRows(del)
          : tab === "sms"
            ? [["Огноо", "Текст", "Хүлээн авагч", "Хэсэг", "Илгээсэн", "Хүрсэн", "Амжилтгүй", "Зардал", "Төлөгч"], ...msms.map((x) => [dateTime(x.at), x.text, x.recipients, x.parts, x.sent, x.delivered, x.failed, x.cost, x.payer.orgName ?? "Хувь хүн"])]
            : tab === "dsms"
              ? [["Огноо", "Утас", "Текст", "Зардал"], ...dsms.map((x) => [dateTime(x.at), x.phone, x.text, x.cost])]
              : tab === "audit"
                ? [["Огноо", "Хэн", "Үйлдэл", "Юуг", "Өмнө", "Шинэ"], ...log.map((x) => [dateTime(x.at), x.who, x.action, x.target, x.from ?? "", x.to ?? ""])]
                : tab === "campaigns"
                  ? [["Урамшуулал", "Төрөл", "Хамрагдсан харилцагч", "Ашигласан", "Олгосон оноо", "Зарцуулсан оноо", "Хямдрал"], ...camps.map((r) => [r.c.name, r.c.type, r.customers, r.uses, r.given, r.spent, r.discount])]
                  : [["Өдөр", "Борлуулалт", "Илгээсэн баримт", "Зөрүү", "Зөрүүтэй гүйлгээ"], ...days.map(([d, r]) => [d, r.sales, r.sent, r.sales - r.sent, r.bad])];
    downloadCsv(name, rows);
    toast("CSV татагдлаа", "ok");
  };

  return (
    <Page
      title="Тайлан"
      sub={`${range.from === range.to ? range.from : `${range.from} – ${range.to}`}`}
      actions={
        <Btn size="md" icon="download" onClick={exportCsv}>
          CSV татах
        </Btn>
      }
      tabs={
        <div className="space-y-3">
          <Tabs value={tab} onChange={setTab} options={TABS} />
          <RangePicker value={range} onChange={setRange} />
        </div>
      }
    >
      {tab === "pos" && <SalesTab list={pos} staffOf={staffOf} />}
      {tab === "delivery" && (
        <>
          <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="Захиалга" value={num(orders.length)} sub={`${orders.filter((o) => orderState(s, o) === "done").length} хүргэгдсэн`} />
            <Stat label="Цуцалсан" value={num(orders.filter((o) => o.cancel).length)} />
            <Stat label="Төлөгдсөн дүн" value={money(del.filter((x) => !x.refund).reduce((a, x) => a + x.total, 0))} tone="accent" />
            <Stat label="Хүргэлтийн төлбөр" value={money(orders.filter((o) => !o.cancel).reduce((a, o) => a + o.fee, 0))} />
          </div>
          {orders.some((o) => o.cancel) && (
            <>
              <SectionTitle>Цуцлалт</SectionTitle>
              <Card pad={false} className="mb-5">
                <div className="[&>*+*]:border-t [&>*+*]:border-[var(--sp-sep)]">
                  {orders
                    .filter((o) => o.cancel)
                    .map((o) => (
                      <div key={o.id} className="flex items-center justify-between gap-3 px-5 py-3 text-[14px]">
                        <span className="text-ink">
                          #{o.no} · {o.name}
                        </span>
                        <span className="text-mute">
                          {CANCEL_LABEL[o.cancel!.reason]} · {o.cancel!.by} · {o.cancel!.refunded ? "буцаалт хийсэн" : "төлөгдөөгүй"}
                        </span>
                      </div>
                    ))}
                </div>
              </Card>
            </>
          )}
          <SectionTitle>Төлөгдсөн хүргэлтүүд</SectionTitle>
          <SaleTable list={del} staffOf={staffOf} />
        </>
      )}
      {tab === "sms" && (
        <>
          <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="Илгээлт" value={num(msms.length)} />
            <Stat label="Илгээсэн SMS" value={num(msms.reduce((a, x) => a + x.sent, 0))} />
            <Stat label="Хүрсэн" value={num(msms.reduce((a, x) => a + x.delivered, 0))} sub={`${num(msms.reduce((a, x) => a + x.failed, 0))} амжилтгүй`} />
            <Stat label="Зардал" value={money(msms.reduce((a, x) => a + x.cost, 0))} tone="accent" />
          </div>
          <Table<SmsCampaign>
            rows={msms}
            rowKey={(r) => r.id}
            empty={<Empty icon="megaphone" title="Энэ хугацаанд илгээлт алга" body="Хугацааны мужаа өргөсгөнө үү." />}
            cols={[
              { key: "at", label: "Огноо", w: "150px", render: (r) => <span className="tnum">{dateTime(r.at)}</span> },
              { key: "text", label: "Текст", render: (r) => <span className="line-clamp-1 max-w-[360px] text-ink-2">{r.text}</span> },
              { key: "payer", label: "Төлөгч", render: (r) => r.payer.orgName ?? "Хувь хүн" },
              { key: "sent", label: "Илгээсэн", align: "right", render: (r) => num(r.sent) },
              { key: "del", label: "Хүрсэн", align: "right", render: (r) => num(r.delivered) },
              { key: "cost", label: "Зардал", align: "right", render: (r) => money(r.cost) },
            ]}
          />
        </>
      )}
      {tab === "dsms" && (
        <>
          <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-3">
            <Stat label="SMS" value={num(dsms.length)} />
            <Stat label="Зардал" value={money(dsms.reduce((a, x) => a + x.cost, 0))} tone="accent" />
            <Stat label="Төрөл" value="Гүйлгээний" sub="Opt-out-д хамаарахгүй" />
          </div>
          <Table<SmsLog>
            rows={dsms}
            rowKey={(r) => r.id}
            empty={<Empty icon="sms" title="Хүргэлтийн SMS алга" body="Захиалгын төлөв солигдох үед SMS явбал энд бичигдэнэ (Хүргэлт → Тохиргоо → SMS)." />}
            cols={[
              { key: "at", label: "Огноо", w: "150px", render: (r) => <span className="tnum">{dateTime(r.at)}</span> },
              { key: "phone", label: "Утас", render: (r) => <span className="tnum">{r.phone}</span> },
              { key: "text", label: "Текст", render: (r) => <span className="line-clamp-1 max-w-[460px] text-ink-2">{r.text}</span> },
              { key: "cost", label: "Зардал", align: "right", render: (r) => money(r.cost) },
            ]}
          />
        </>
      )}
      {tab === "audit" && (
        <Table<Audit>
          rows={log}
          rowKey={(r) => r.id}
          empty={<Empty icon="list" title="Өөрчлөлт алга" body="Энэ хугацаанд тохиргоо өөрчлөгдөөгүй." />}
          cols={[
            { key: "at", label: "Хэзээ", w: "150px", render: (r) => <span className="tnum">{dateTime(r.at)}</span> },
            { key: "who", label: "Хэн", render: (r) => r.who },
            { key: "act", label: "Үйлдэл", render: (r) => <span className="font-medium">{r.action}</span> },
            { key: "target", label: "Юуг", render: (r) => r.target },
            {
              key: "chg",
              label: "Өмнө → Шинэ",
              render: (r) =>
                r.from || r.to ? (
                  <span className="text-ink-2">
                    {r.from && <span className="text-mute line-through decoration-[var(--line)]">{r.from}</span>}
                    {r.from && r.to && " → "}
                    {r.to}
                  </span>
                ) : (
                  <span className="text-mute">—</span>
                ),
            },
          ]}
        />
      )}
      {tab === "campaigns" && (
        <Table<(typeof camps)[number]>
          rows={camps}
          rowKey={(r) => r.c.id}
          empty={<Empty icon="tag" title="Урамшуулал алга" body="Урамшуулал цэснээс анхны campaign-аа үүсгэнэ үү." />}
          cols={[
            {
              key: "n",
              label: "Урамшуулал",
              render: (r) => (
                <span className="flex items-center gap-2">
                  <Badge tone={r.c.type === "point" ? "accent" : "gray"}>{r.c.type === "point" ? "Point" : "Item"}</Badge>
                  <span className="font-medium">{r.c.name}</span>
                  {!(r.c as Campaign).active && <span className="text-[12px] text-mute">идэвхгүй</span>}
                </span>
              ),
            },
            { key: "cu", label: "Харилцагч", align: "right", render: (r) => num(r.customers) },
            { key: "uses", label: "Гүйлгээ", align: "right", render: (r) => num(r.uses) },
            { key: "g", label: "Олгосон оноо", align: "right", render: (r) => (r.c.type === "point" ? num(r.given) : "—") },
            { key: "sp", label: "Зарцуулсан оноо", align: "right", render: (r) => (r.c.type === "point" ? num(r.spent) : "—") },
            { key: "d", label: "Хямдрал", align: "right", render: (r) => (r.c.type === "item" ? money(r.discount) : "—") },
          ]}
        />
      )}
      {tab === "ebarimt" && (
        <>
          <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="Борлуулалт" value={money(days.reduce((a, [, r]) => a + r.sales, 0))} />
            <Stat label="Илгээсэн баримт" value={money(days.reduce((a, [, r]) => a + r.sent, 0))} />
            <Stat label="Зөрүү" value={money(days.reduce((a, [, r]) => a + r.sales - r.sent, 0))} tone={bad.length ? "warn" : "ok"} />
            <Stat label="Зөрүүтэй гүйлгээ" value={num(bad.length)} tone={bad.length ? "warn" : "ok"} sub={s.ebarimt ? "Ebarimt холбогдсон" : "Ebarimt холбогдоогүй"} />
          </div>
          <SectionTitle>Өдрөөр</SectionTitle>
          <Table<(typeof days)[number]>
            rows={days}
            rowKey={(r) => r[0]}
            maxH="360px"
            empty={<Empty icon="receipt" title="Гүйлгээ алга" />}
            cols={[
              { key: "d", label: "Өдөр", render: ([d]) => <span className="tnum">{d}</span> },
              { key: "n", label: "Гүйлгээ", align: "right", render: ([, r]) => num(r.n) },
              { key: "s", label: "Борлуулалт", align: "right", render: ([, r]) => money(r.sales) },
              { key: "e", label: "Илгээсэн баримт", align: "right", render: ([, r]) => money(r.sent) },
              {
                key: "x",
                label: "Төлөв",
                render: ([, r]) => (r.bad ? <Badge tone="warn" icon="warn">{r.bad} зөрүүтэй</Badge> : <Badge tone="ok" icon="check">Тэнцүү</Badge>),
              },
            ]}
          />
          <SectionTitle>Зөрүүтэй гүйлгээ</SectionTitle>
          <Table<Sale>
            rows={bad}
            rowKey={(r) => r.id}
            maxH="420px"
            empty={<Empty icon="check" title="Зөрүү алга" body="Бүх гүйлгээний баримт Ebarimt-д илгээгдсэн." />}
            cols={[
              { key: "no", label: "№", render: (r) => <span className="tnum">{r.no}</span> },
              { key: "at", label: "Огноо", render: (r) => <span className="tnum">{dateTime(r.at)}</span> },
              { key: "st", label: "Кассчин", render: (r) => staffOf(r.staffId) },
              { key: "t", label: "Дүн", align: "right", render: (r) => money(r.total) },
              { key: "eb", label: "Ebarimt", render: (r) => <Badge tone={EBARIMT_LABEL[r.ebarimt.status].tone}>{EB_LABEL[r.ebarimt.status]}</Badge> },
              { key: "why", label: "Шалтгаан", render: (r) => <span className="text-ink-2">{why(r)}</span> },
            ]}
          />
        </>
      )}
    </Page>
  );
}

function mismatch(x: Sale) {
  if (x.refund) return x.ebarimt.status !== "reversed";
  return x.ebarimt.status !== "sent";
}
function why(x: Sale) {
  if (x.refund) return x.ebarimt.status === "off" ? "Буцаалт — баримт илгээгдээгүй байсан" : "Буцаалтын reverse явсангүй";
  if (x.ebarimt.status === "off") return "Ebarimt холбоогүй үед гарсан";
  if (x.ebarimt.status === "other") return "«Бусад» төрлөөр баримт гарсан";
  return "—";
}

function SalesTab({ list, staffOf }: { list: Sale[]; staffOf: (id: string) => string }) {
  const ok = list.filter((x) => !x.refund);
  const total = ok.reduce((a, x) => a + x.total, 0);
  const by = new Map<string, { n: number; total: number; refunds: number; cash: number; card: number; qr: number }>();
  for (const x of list) {
    const r = by.get(x.staffId) ?? { n: 0, total: 0, refunds: 0, cash: 0, card: 0, qr: 0 };
    if (x.refund) r.refunds += 1;
    else {
      r.n += 1;
      r.total += x.total;
      r[x.method] += x.total;
    }
    by.set(x.staffId, r);
  }
  const rows = [...by.entries()].sort((a, b) => b[1].total - a[1].total);
  return (
    <>
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Борлуулалт" value={money(total)} tone="accent" />
        <Stat label="Гүйлгээ" value={num(ok.length)} />
        <Stat label="Дундаж чек" value={money(ok.length ? total / ok.length : 0)} />
        <Stat label="Буцаалт" value={num(list.length - ok.length)} sub={money(list.filter((x) => x.refund).reduce((a, x) => a + x.total, 0))} />
      </div>
      <SectionTitle>Кассчин тус бүрээр</SectionTitle>
      <Table<(typeof rows)[number]>
        rows={rows}
        rowKey={(r) => r[0]}
        maxH="360px"
        empty={<Empty icon="person" title="Гүйлгээ алга" />}
        cols={[
          { key: "n", label: "Ажилтан", render: ([id]) => <span className="font-medium">{staffOf(id)}</span> },
          { key: "c", label: "Гүйлгээ", align: "right", render: ([, r]) => num(r.n) },
          { key: "cash", label: "Бэлэн", align: "right", render: ([, r]) => money(r.cash) },
          { key: "card", label: "Карт", align: "right", render: ([, r]) => money(r.card) },
          { key: "qr", label: "QR", align: "right", render: ([, r]) => money(r.qr) },
          { key: "rf", label: "Буцаалт", align: "right", render: ([, r]) => num(r.refunds) },
          { key: "t", label: "Нийт", align: "right", render: ([, r]) => <b>{money(r.total)}</b> },
        ]}
      />
      <SectionTitle>Гүйлгээ</SectionTitle>
      <SaleTable list={list} staffOf={staffOf} />
    </>
  );
}

function SaleTable({ list, staffOf }: { list: Sale[]; staffOf: (id: string) => string }) {
  return (
    <Table<Sale>
      rows={[...list].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 300)}
      rowKey={(r) => r.id}
      maxH="520px"
      empty={<Empty icon="receipt" title="Энэ хугацаанд гүйлгээ алга" body="Хугацааны мужаа өргөсгөнө үү." />}
      cols={[
        { key: "no", label: "№", w: "70px", render: (r) => <span className="tnum">{r.no}</span> },
        { key: "at", label: "Огноо", render: (r) => <span className="tnum">{dateTime(r.at)}</span> },
        { key: "st", label: "Кассчин", render: (r) => staffOf(r.staffId) },
        { key: "m", label: "Төлбөр", render: (r) => METHOD_LABEL[r.method] },
        { key: "d", label: "Хямдрал", align: "right", render: (r) => (r.applied.length ? money(r.applied.reduce((a, y) => a + y.amount, 0)) : "—") },
        { key: "t", label: "Дүн", align: "right", render: (r) => (r.refund ? <span className="text-mute line-through">{money(r.total)}</span> : money(r.total)) },
        { key: "eb", label: "Ebarimt", render: (r) => <Badge tone={EBARIMT_LABEL[r.ebarimt.status].tone}>{EB_LABEL[r.ebarimt.status]}</Badge> },
      ]}
    />
  );
}

