"use client";

/* Харилцагч (CRM) — BR06: байнгын → бага эрэмбэ, дэлгэрэнгүй, оноо, зөвшөөрөл, устгах */

import { useMemo, useState } from "react";
import { Badge, Btn, Empty, Field, SearchField, Switch, toast, useConfirm } from "@/components/sp/ui";
import { fmtPhone, money, num, rankedCustomers, METHOD_LABEL, CANCEL_LABEL, orderState } from "@/lib/sp/logic";
import { addCustomer, adjustPoints, eraseCustomer, SpError, updateCustomer } from "@/lib/sp/store";
import type { Customer } from "@/lib/sp/types";
import { Check, Dialog, Drawer, KV, Page, SectionTitle, Table, Toolbar, dateOnly, dateTime, usePortal } from "./kit";

const SOURCE = { delivery: "Хүргэлт", pos: "Касс", manual: "Гараар" } as const;
const KIND = { earn: "Олгосон", spend: "Зарцуулсан", revert: "Буцаалт (хасав)", restore: "Буцаалт (сэргээв)", manual: "Гараар", expire: "Хүчингүй болсон" } as const;

export default function Crm() {
  const { s, sub } = usePortal();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<string | null>(() => (sub && s.customers.some((c) => c.id === sub) ? sub : null));
  const [add, setAdd] = useState(false);
  const list = useMemo(() => rankedCustomers(s), [s]);
  const rows = list.filter(({ c }) => {
    const t = q.trim().toLowerCase();
    if (!t) return true;
    return c.phone.includes(t.replace(/\s/g, "")) || (c.name ?? "").toLowerCase().includes(t);
  });
  type R = (typeof list)[number];

  return (
    <Page
      title="Харилцагч"
      sub={`${list.length} харилцагч · байнгын → бага худалдан авалттай`}
      actions={
        <Btn size="md" icon="plus" onClick={() => setAdd(true)}>
          Гараар бүртгэх
        </Btn>
      }
    >
      <Toolbar>
        <div className="w-full max-w-[360px]">
          <SearchField value={q} onChange={setQ} placeholder="Утас эсвэл нэрээр хайх" />
        </div>
      </Toolbar>
      <Table<R>
        rows={rows}
        rowKey={(r) => r.c.id}
        onRow={(r) => setOpen(r.c.id)}
        empty={
          <Empty
            icon="people"
            title={q ? "Олдсонгүй" : "Харилцагч алга"}
            body={q ? "Өөр дугаар эсвэл нэрээр хайна уу." : "Хүргэлтийн захиалга, кассын оноо цуглуулалтаар автоматаар бүртгэгдэнэ. Эсвэл гараар нэмнэ үү."}
            action={!q && <Btn size="md" onClick={() => setAdd(true)}>Гараар бүртгэх</Btn>}
          />
        }
        cols={[
          { key: "phone", label: "Утас", render: (r) => <span className="tnum font-medium">{fmtPhone(r.c.phone)}</span> },
          { key: "name", label: "Нэр", render: (r) => r.c.name ?? <span className="text-mute">—</span> },
          { key: "count", label: "Захиалга", align: "right", render: (r) => num(r.count) },
          { key: "spend", label: "Нийт дүн", align: "right", render: (r) => money(r.spend) },
          { key: "last", label: "Сүүлийн худалдан авалт", align: "right", render: (r) => (r.last ? dateOnly(r.last) : <span className="text-mute">—</span>) },
          { key: "points", label: "Оноо", align: "right", render: (r) => num(r.c.points) },
          {
            key: "opt",
            label: "Маркетинг",
            render: (r) => (r.c.optIn ? <Badge tone="ok" icon="check">Зөвшөөрсөн</Badge> : <Badge tone="gray" icon="stop">Татгалзсан</Badge>),
          },
        ]}
      />
      <AddDialog open={add} onClose={() => setAdd(false)} onDone={(id) => setOpen(id)} />
      <Detail id={open} onClose={() => setOpen(null)} />
    </Page>
  );
}

function AddDialog({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: (id: string) => void }) {
  const { actor } = usePortal();
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [opt, setOpt] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const close = () => {
    setPhone("");
    setName("");
    setOpt(true);
    setErr(null);
    onClose();
  };
  const save = () => {
    try {
      const c = addCustomer(actor, phone, name.trim() || undefined, "manual", opt);
      toast("Харилцагч бүртгэгдлээ", "ok");
      close();
      onDone(c.id);
    } catch (e) {
      setErr(e instanceof SpError ? e.message : "Алдаа гарлаа");
    }
  };
  return (
    <Dialog
      open={open}
      onClose={close}
      title="Харилцагч бүртгэх"
      width={440}
      footer={
        <>
          <Btn size="md" variant="gray" onClick={close}>
            Болих
          </Btn>
          <Btn size="md" disabled={phone.replace(/\D/g, "").length !== 8} onClick={save}>
            Бүртгэх
          </Btn>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Утасны дугаар *" error={err}>
          <input className="sp-field tnum" inputMode="numeric" autoFocus maxLength={9} placeholder="8 оронтой" value={phone} onChange={(e) => setPhone(e.target.value.replace(/[^\d ]/g, ""))} />
        </Field>
        <Field label="Нэр">
          <input className="sp-field" placeholder="Заавал биш" value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Check checked={opt} onChange={setOpt}>
          Маркетингийн SMS хүлээн авахыг зөвшөөрсөн
        </Check>
        <p className="text-[13px] leading-snug text-mute">Зөвшөөрөлгүй дугаар руу маркетингийн SMS явахгүй. Хүргэлтийн мэдэгдэл үүнд хамаарахгүй.</p>
      </div>
    </Dialog>
  );
}

function Detail({ id, onClose }: { id: string | null; onClose: () => void }) {
  const { s, actor } = usePortal();
  const { confirm, node } = useConfirm();
  const [delta, setDelta] = useState("");
  const [note, setNote] = useState("");
  const c = s.customers.find((x) => x.id === id) ?? null;
  const sales = c ? s.sales.filter((x) => x.customerId === c.id) : [];
  const orders = c ? s.orders.filter((x) => x.customerId === c.id) : [];
  const pts = c ? s.points.filter((x) => x.customerId === c.id) : [];
  const total = sales.filter((x) => !x.refund).reduce((a, x) => a + x.total, 0);
  const statusName = (sid: string) => s.delivery.statuses.find((x) => x.id === sid)?.name ?? sid;

  const doAdjust = (cust: Customer) => {
    const d = Number(delta);
    if (!d || !note.trim()) return;
    adjustPoints(actor, cust.id, d, note.trim());
    toast(`Оноо ${d > 0 ? "+" : ""}${num(d)} — бүртгэгдлээ`, "ok");
    setDelta("");
    setNote("");
  };

  return (
    <Drawer
      open={!!c}
      onClose={onClose}
      title={c ? (c.name ?? fmtPhone(c.phone)) : ""}
      sub={c ? `${fmtPhone(c.phone)} · ${SOURCE[c.source]} · ${dateOnly(c.createdAt)}-нд бүртгэгдсэн` : undefined}
      width={560}
    >
      {c && (
        <>
          {c.erased ? (
            <p className="rounded-[14px] bg-[var(--sp-fill)] px-4 py-3 text-[14px] text-ink-2">Энэ харилцагчийн хувийн мэдээлэл устгагдсан. Борлуулалтын нэгтгэсэн бичилт л үлдсэн.</p>
          ) : null}
          <SectionTitle>Профайл</SectionTitle>
          <KV
            rows={[
              ["Худалдан авалт", `${sales.filter((x) => !x.refund).length + orders.filter((o) => !o.cancel && !o.saleId).length} удаа`],
              ["Нийт дүн", money(total)],
              ["Онооны үлдэгдэл", <b key="p" className="tnum">{num(c.points)}</b>],
              ["Wallet pass", c.passSerial ? <Badge key="w" tone="accent" icon="wallet">{c.passSerial}</Badge> : "—"],
            ]}
          />
          <div className="mt-3 flex min-h-[56px] items-center justify-between gap-3 rounded-[14px] bg-paper px-4 py-2.5">
            <div>
              <div className="text-[15px] text-ink">Маркетингийн SMS</div>
              <div className="text-[13px] text-mute">{c.optIn ? "Зөвшөөрсөн — сегментэд орно" : "Татгалзсан — сегментээс хасагдана"}</div>
            </div>
            <Switch
              label="Маркетингийн зөвшөөрөл"
              checked={c.optIn}
              disabled={c.erased}
              onChange={(v) => {
                updateCustomer(actor, { ...c, optIn: v });
                toast(v ? "Зөвшөөрөл идэвхжлээ" : "Маркетингаас хасагдлаа", "ok");
              }}
            />
          </div>

          <SectionTitle>Худалдан авалт</SectionTitle>
          {sales.length + orders.length === 0 ? (
            <p className="rounded-[14px] bg-paper px-4 py-4 text-[14px] text-mute">Худалдан авалт алга.</p>
          ) : (
            <div className="overflow-hidden rounded-[14px] bg-paper [&>*+*]:border-t [&>*+*]:border-[var(--sp-sep)]">
              {orders.map((o) => {
                const st = orderState(s, o);
                return (
                  <div key={o.id} className="flex items-start gap-3 px-4 py-3 text-[14px]">
                    <div className="min-w-0 flex-1">
                      <div className="font-medium text-ink">Хүргэлт #{o.no}</div>
                      <div className="truncate text-[13px] text-mute">
                        {dateTime(o.createdAt)} · {o.lines.map((l) => `${l.name} ×${l.qty}`).join(", ")}
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="tnum text-ink">{money(o.total)}</div>
                      {o.cancel ? <Badge tone="danger">{CANCEL_LABEL[o.cancel.reason]}</Badge> : <Badge tone={st === "done" ? "ok" : "accent"}>{statusName(o.statusId)}</Badge>}
                    </div>
                  </div>
                );
              })}
              {sales
                .filter((x) => x.channel === "pos")
                .slice(0, 30)
                .map((x) => (
                  <div key={x.id} className="flex items-start gap-3 px-4 py-3 text-[14px]">
                    <div className="min-w-0 flex-1">
                      <div className="font-medium text-ink">Касс №{x.no}</div>
                      <div className="truncate text-[13px] text-mute">
                        {dateTime(x.at)} · {METHOD_LABEL[x.method]} · {x.lines.map((l) => `${l.name} ×${l.qty}`).join(", ")}
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="tnum text-ink">{money(x.total)}</div>
                      {x.refund ? <Badge tone="danger">Буцаасан</Badge> : x.pointsEarned ? <span className="text-[12px] text-ok">+{x.pointsEarned} оноо</span> : null}
                    </div>
                  </div>
                ))}
            </div>
          )}

          <SectionTitle>Онооны түүх</SectionTitle>
          {pts.length === 0 ? (
            <p className="rounded-[14px] bg-paper px-4 py-4 text-[14px] text-mute">Онооны хөдөлгөөн алга.</p>
          ) : (
            <div className="overflow-hidden rounded-[14px] bg-paper [&>*+*]:border-t [&>*+*]:border-[var(--sp-sep)]">
              {pts.slice(0, 40).map((p) => (
                <div key={p.id} className="flex items-center gap-3 px-4 py-2.5 text-[14px]">
                  <div className="min-w-0 flex-1">
                    <div className="text-ink">{KIND[p.kind]}</div>
                    <div className="truncate text-[12px] text-mute">
                      {dateTime(p.at)}
                      {p.note ? ` · ${p.note}` : ""}
                    </div>
                  </div>
                  <span className={p.delta >= 0 ? "tnum font-semibold text-ok" : "tnum font-semibold text-danger"}>
                    {p.delta > 0 ? "+" : ""}
                    {num(p.delta)}
                  </span>
                </div>
              ))}
            </div>
          )}

          {!c.erased && (
            <>
              <SectionTitle>Оноо гараар засах</SectionTitle>
              <div className="rounded-[14px] bg-paper p-4">
                <div className="grid grid-cols-[120px_1fr] gap-2">
                  <input className="sp-field tnum" inputMode="numeric" placeholder="+100 / −50" aria-label="Онооны өөрчлөлт" value={delta} onChange={(e) => setDelta(e.target.value.replace(/[^\d-]/g, ""))} />
                  <input className="sp-field" placeholder="Шалтгаан (заавал)" aria-label="Шалтгаан" value={note} onChange={(e) => setNote(e.target.value)} />
                </div>
                <div className="mt-3 flex items-center justify-between gap-3">
                  <span className="text-[13px] text-mute">Тохиргооны логт хэн, хэзээ гэж бичигдэнэ.</span>
                  <Btn size="sm" variant="tinted" disabled={!Number(delta) || !note.trim()} onClick={() => doAdjust(c)}>
                    Хадгалах
                  </Btn>
                </div>
              </div>

              <SectionTitle>Мэдээлэл устгах</SectionTitle>
              <div className="rounded-[14px] bg-paper p-4">
                <p className="text-[13px] leading-snug text-mute">Харилцагчийн хүсэлтээр утас, нэрийг устгаж псевдоним болгоно. Борлуулалтын нэгтгэсэн бичилт тайланд үлдэнэ. Буцаах боломжгүй.</p>
                <Btn
                  className="mt-3"
                  size="sm"
                  variant="dangerTinted"
                  icon="trash"
                  onClick={() =>
                    confirm({
                      title: "Хувийн мэдээллийг устгах уу?",
                      message: "Утас, нэр, Wallet pass устгагдаж, маркетингийн жагсаалтаас хасагдана. Буцаах боломжгүй.",
                      ok: "Устгах",
                      destructive: true,
                      run: () => {
                        eraseCustomer(actor, c.id);
                        toast("Мэдээлэл устгагдлаа", "ok");
                        onClose();
                      },
                    })
                  }
                >
                  Устгах / псевдонимжуулах
                </Btn>
              </div>
            </>
          )}
          {node}
        </>
      )}
    </Drawer>
  );
}
