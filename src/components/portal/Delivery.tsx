"use client";

/*
 * Хүргэлт (BR04, BR09-1.2): захиалгын жагсаалт + дэлгэрэнгүй, хүргэлтийн тохиргоо.
 */

import { useMemo, useState } from "react";
import { Icon } from "@/components/sp/icons";
import { Badge, Btn, cx, Empty, Field, Notice, SearchField, Segmented, toast, useConfirm } from "@/components/sp/ui";
import { CANCEL_LABEL, fmtPhone, METHOD_LABEL, money, num, orderState, sortedOrders } from "@/lib/sp/logic";
import { DISTRICTS } from "@/lib/sp/seed";
import { cancelOrder, collectOrderPayment, handover, resendCode, setOrderStatus, SpError, uid, updateDelivery } from "@/lib/sp/store";
import type { CancelReason, DeliverySettings, DeliveryStatus, Order, PayMethod, SpState } from "@/lib/sp/types";
import { Card, Check, Chip, ColorField, contrast, dateTime, Dialog, Drawer, KV, Page, readImage, SectionTitle, SwitchRow, Table, Toolbar, usePortal } from "./kit";

/* ───────── төлөвийн тэмдэг ───────── */

function PayBadge({ o }: { o: Order }) {
  if (o.cancel?.refunded) return <Badge tone="gray" icon="undo">Буцаасан</Badge>;
  if (o.paid) return <Badge tone="ok" icon="check">Төлсөн{o.payMethod ? ` · ${METHOD_LABEL[o.payMethod]}` : ""}</Badge>;
  if (o.cancel) return <Badge tone="gray">Төлөөгүй</Badge>;
  return o.payLater ? <Badge tone="warn" icon="clock">Дараа төлөх</Badge> : <Badge tone="warn">Төлөөгүй</Badge>;
}

function StatusBadge({ s, o }: { s: SpState; o: Order }) {
  if (o.cancel) return <Badge tone="danger" icon="close">{CANCEL_LABEL[o.cancel.reason]}</Badge>;
  const st = s.delivery.statuses.find((x) => x.id === o.statusId);
  if (st?.final) return <Badge tone="ok" icon="check">{st.name}</Badge>;
  if (o.statusId === s.delivery.statuses[0]?.id) return <Badge tone="accent">{st?.name ?? "Шинэ"}</Badge>;
  return <Badge tone="gray" icon="truck">{st?.name ?? o.statusId}</Badge>;
}

/* ═════════ 9. Захиалгын жагсаалт ═════════ */

type Filter = "active" | "all" | "done" | "cancelled";

export function Orders() {
  const { s, sub } = usePortal();
  const [filter, setFilter] = useState<Filter>("active");
  const [q, setQ] = useState("");
  const [openId, setOpenId] = useState<string | null>(() => (sub && s.orders.some((o) => o.id === sub) ? sub : null));

  const all = useMemo(() => sortedOrders(s), [s]);
  const counts = useMemo(() => {
    const c = { active: 0, done: 0, cancelled: 0 };
    all.forEach((o) => (c[orderState(s, o)] += 1));
    return c;
  }, [all, s]);
  const rows = all.filter((o) => {
    if (filter !== "all" && orderState(s, o) !== filter) return false;
    const t = q.trim().toLowerCase();
    if (!t) return true;
    return String(o.no).includes(t) || o.phone.includes(t.replace(/\s/g, "")) || o.name.toLowerCase().includes(t);
  });
  const open = s.orders.find((o) => o.id === openId) ?? null;

  return (
    <Page
      title="Захиалга"
      sub={`${counts.active} идэвхтэй · ${counts.done} хүргэгдсэн · ${counts.cancelled} цуцалсан`}
      actions={
        <Btn size="md" variant="tinted" icon="link" onClick={() => window.open("/shop", "_blank", "noopener")}>
          Захиалгын хуудас
        </Btn>
      }
    >
      {!s.delivery.enabled && (
        <div className="mb-4">
          <Notice tone="warn">Хүргэлт унтраалттай байна — шинэ захиалга ирэхгүй. «Тохиргоо» хэсгээс асаана.</Notice>
        </div>
      )}
      <Toolbar>
        <Segmented<Filter>
          className="w-[440px] max-w-full"
          value={filter}
          onChange={setFilter}
          options={[
            { id: "active", label: `Идэвхтэй ${counts.active}` },
            { id: "done", label: "Хүргэгдсэн" },
            { id: "cancelled", label: "Цуцалсан" },
            { id: "all", label: "Бүгд" },
          ]}
        />
        <div className="ml-auto w-full sm:w-[280px]">
          <SearchField value={q} onChange={setQ} placeholder="№, утас, нэр" />
        </div>
      </Toolbar>
      <Table<Order>
        rows={rows}
        rowKey={(o) => o.id}
        onRow={(o) => setOpenId(o.id)}
        rowClass={(o) => orderState(s, o) !== "active" && "opacity-70"}
        empty={
          <Empty icon="truck" title={filter === "active" ? "Идэвхтэй захиалга алга" : "Захиалга олдсонгүй"} body="Захиалгын хуудасныхаа холбоосыг харилцагчдадаа түгээгээрэй. Шинэ захиалга энд шууд гарч ирнэ." />
        }
        cols={[
          { key: "no", label: "№", w: "80px", render: (o) => <span className="font-semibold tnum">#{o.no}</span> },
          { key: "at", label: "Огноо", render: (o) => <span className="whitespace-nowrap text-ink-2 tnum">{dateTime(o.createdAt)}</span> },
          {
            key: "who",
            label: "Хүлээн авагч",
            render: (o) => (
              <div className="min-w-[160px]">
                <div className="font-medium">{o.name || "—"}</div>
                <div className="text-[12px] text-mute tnum">
                  {fmtPhone(o.phone)} · {o.district}
                </div>
              </div>
            ),
          },
          { key: "total", label: "Дүн", align: "right", render: (o) => <span className="font-semibold">{money(o.total)}</span> },
          { key: "pay", label: "Төлбөр", render: (o) => <PayBadge o={o} /> },
          { key: "st", label: "Хүргэлт", render: (o) => <StatusBadge s={s} o={o} /> },
        ]}
      />
      <OrderDrawer order={open} onClose={() => setOpenId(null)} />
    </Page>
  );
}

function OrderDrawer({ order, onClose }: { order: Order | null; onClose: () => void }) {
  const { s, actor, canManage } = usePortal();
  const [code, setCode] = useState("");
  const [codeErr, setCodeErr] = useState<string | null>(null);
  const [pay, setPay] = useState(false);
  const [cancel, setCancel] = useState(false);
  const { confirm, node } = useConfirm();
  const o = order;
  const state = o ? orderState(s, o) : "active";
  const stName = (id: string) => s.delivery.statuses.find((x) => x.id === id)?.name ?? id;
  const steps = s.delivery.statuses.filter((x) => !x.final);

  const close = () => {
    setCode("");
    setCodeErr(null);
    onClose();
  };

  const doHandover = () => {
    if (!o) return;
    const r = handover(actor, o.id, code.trim());
    if (r === "ok") {
      toast(`#${o.no} хүргэгдлээ`, "ok");
      setCode("");
      setCodeErr(null);
    } else if (r === "unpaid") setCodeErr("Эхлээд төлбөрөө хүлээн авна уу.");
    else if (r === "locked") setCodeErr("5 удаа буруу оруулсан. Кодыг дахин илгээнэ үү.");
    else setCodeErr(`Код буруу байна. ${Math.max(0, 5 - (o.codeTries + 1))} оролдлого үлдлээ.`);
  };

  return (
    <>
      <Drawer
        open={!!o}
        onClose={close}
        title={o ? `Захиалга #${o.no}` : ""}
        sub={o ? dateTime(o.createdAt) : undefined}
        footer={
          o && state === "active" ? (
            <>
              {canManage && (
                <Btn size="md" variant="dangerTinted" onClick={() => setCancel(true)}>
                  Цуцлах
                </Btn>
              )}
              {!o.paid && (
                <Btn size="md" icon="cash" onClick={() => setPay(true)}>
                  Төлбөр хүлээн авах
                </Btn>
              )}
            </>
          ) : undefined
        }
      >
        {o && (
          <div className="space-y-5">
            <div className="flex flex-wrap gap-2">
              <StatusBadge s={s} o={o} />
              <PayBadge o={o} />
            </div>

            {o.cancel && (
              <Notice tone="gray" icon="info">
                {o.cancel.by} цуцалсан · {dateTime(o.cancel.at)} · {CANCEL_LABEL[o.cancel.reason]}
                {o.cancel.refunded && " · Төлбөр буцаагдаж, Ebarimt reverse хийгдсэн"}
              </Notice>
            )}

            {state === "active" && (
              <div className="rounded-[16px] bg-paper p-4">
                <div className="text-[13px] font-semibold text-mute">Ачаа хүлээлгэн өгөх код</div>
                <p className="mt-1 text-[13px] text-mute">Харилцагчаас 6 оронтой кодыг асууж оруулна. Зөвхөн зөв кодоор «{s.delivery.statuses.find((x) => x.final)?.name ?? "Хүргэгдсэн"}» болно.</p>
                <div className="mt-3 flex gap-2">
                  <input
                    className={cx("sp-field !w-[160px] text-center !text-[20px] font-semibold tracking-[0.3em] tnum", codeErr && "!shadow-[inset_0_0_0_1.5px_var(--danger)]")}
                    inputMode="numeric"
                    maxLength={6}
                    placeholder="••••••"
                    value={code}
                    aria-label="Ачаа хүлээлгэн өгөх код"
                    onChange={(e) => {
                      setCode(e.target.value.replace(/\D/g, ""));
                      setCodeErr(null);
                    }}
                    onKeyDown={(e) => e.key === "Enter" && code.length === 6 && doHandover()}
                  />
                  <Btn size="md" variant="tinted" disabled={code.length !== 6} onClick={doHandover}>
                    Хүлээлгэн өгөх
                  </Btn>
                </div>
                {codeErr && <p className="mt-2 text-[13px] text-danger">{codeErr}</p>}
                <button
                  type="button"
                  className="mt-2 text-[13px] font-medium text-accent"
                  onClick={() => {
                    resendCode(o.id);
                    toast(`Код ${fmtPhone(o.phone)} руу дахин илгээгдлээ`);
                  }}
                >
                  Кодыг SMS-ээр дахин илгээх
                </button>
              </div>
            )}

            {state === "active" && steps.length > 1 && (
              <div>
                <SectionTitle>Төлөв солих</SectionTitle>
                <div className="flex flex-wrap gap-2">
                  {steps.map((st) => (
                    <Chip
                      key={st.id}
                      on={st.id === o.statusId}
                      onClick={() => {
                        if (st.id === o.statusId) return;
                        try {
                          setOrderStatus(actor, o.id, st.id);
                          toast(`Төлөв: ${st.name}${s.delivery.sms && st.sms ? " · SMS явлаа" : ""}`);
                        } catch (e) {
                          toast(e instanceof SpError ? e.message : "Алдаа гарлаа", "danger");
                        }
                      }}
                    >
                      {st.name}
                    </Chip>
                  ))}
                </div>
              </div>
            )}

            <div>
              <SectionTitle>Хүлээн авагч</SectionTitle>
              <KV
                rows={[
                  ["Нэр", o.name || "—"],
                  ["Утас", <a key="p" className="text-accent tnum" href={`tel:${o.phone}`}>{fmtPhone(o.phone)}</a>],
                  ["Дүүрэг", o.district],
                  ["Хаяг", <span key="a" className="block max-w-[300px] text-right">{o.address}</span>],
                  ...(o.note ? ([["Тэмдэглэл", o.note]] as [string, string][]) : []),
                ]}
              />
            </div>

            <div>
              <SectionTitle>Бараа</SectionTitle>
              <div className="overflow-hidden rounded-[14px] bg-paper [&>*+*]:border-t [&>*+*]:border-[var(--sp-sep)]">
                {o.lines.map((l, i) => (
                  <div key={i} className="flex items-center gap-3 px-4 py-2.5 text-[14px]">
                    <span className="min-w-0 flex-1 truncate text-ink">{l.name}</span>
                    <span className="text-mute tnum">
                      {l.qty} × {num(l.price)}
                    </span>
                    <span className="w-[90px] text-right font-medium text-ink tnum">{money(l.qty * l.price)}</span>
                  </div>
                ))}
                <div className="flex items-center justify-between px-4 py-2.5 text-[14px] text-mute">
                  <span>Хүргэлтийн төлбөр</span>
                  <span className="tnum">{o.fee ? money(o.fee) : "Үнэгүй"}</span>
                </div>
                <div className="flex items-center justify-between px-4 py-3 text-[16px] font-semibold text-ink">
                  <span>Нийт</span>
                  <span className="tnum">{money(o.total)}</span>
                </div>
              </div>
            </div>

            <div>
              <SectionTitle>Түүх</SectionTitle>
              <ol className="space-y-0 rounded-[14px] bg-paper px-4 py-2">
                {o.history.map((h, i) => (
                  <li key={i} className="flex gap-3 py-2 text-[14px]">
                    <span className={cx("mt-1.5 size-2 shrink-0 rounded-full", i === o.history.length - 1 && !o.cancel ? "bg-accent" : "bg-[var(--line)]")} />
                    <span className="min-w-0 flex-1">
                      <span className="text-ink">{stName(h.statusId)}</span>
                      <span className="block text-[12px] text-mute">
                        {dateTime(h.at)} · {h.by}
                      </span>
                    </span>
                  </li>
                ))}
                {o.cancel && (
                  <li className="flex gap-3 py-2 text-[14px]">
                    <span className="mt-1.5 size-2 shrink-0 rounded-full bg-danger" />
                    <span>
                      <span className="text-danger">Цуцалсан — {CANCEL_LABEL[o.cancel.reason]}</span>
                      <span className="block text-[12px] text-mute">
                        {dateTime(o.cancel.at)} · {o.cancel.by}
                      </span>
                    </span>
                  </li>
                )}
              </ol>
            </div>
          </div>
        )}
      </Drawer>
      {o && <PayDialog open={pay} order={o} onClose={() => setPay(false)} />}
      {o && (
        <CancelDialog
          open={cancel}
          order={o}
          onClose={() => setCancel(false)}
          onPick={(reason) =>
            confirm({
              title: `#${o.no}-ийг цуцлах уу?`,
              message: o.paid ? "Төлбөр буцаагдаж, Ebarimt reverse явна. QR төлбөрийг өөрөө буцаана. Бараа нөөцөд буцна." : "Бараа нөөцөд буцна. Энэ үйлдлийг буцаах боломжгүй.",
              ok: "Цуцлах",
              destructive: true,
              run: () => {
                try {
                  cancelOrder(actor, o.id, reason);
                  setCancel(false);
                  toast(`#${o.no} цуцлагдлаа`);
                } catch (e) {
                  toast(e instanceof SpError ? e.message : "Алдаа гарлаа", "danger");
                }
              },
            })
          }
        />
      )}
      {node}
    </>
  );
}

function PayDialog({ open, order, onClose }: { open: boolean; order: Order; onClose: () => void }) {
  const { actor } = usePortal();
  const [method, setMethod] = useState<PayMethod>("qr");
  const [kind, setKind] = useState<"person" | "org">("person");
  const [reg, setReg] = useState("");
  const [busy, setBusy] = useState(false);
  const orgName = reg.length >= 7 ? `${reg.slice(0, 3)} Трейд ХХК` : "";
  const submit = () => {
    setBusy(true);
    try {
      collectOrderPayment(actor, order.id, method, uid("idem"), kind === "org" ? { kind, orgReg: reg, orgName } : { kind });
      toast(`${money(order.total)} хүлээн авлаа · Ebarimt илгээгдлээ`, "ok");
      onClose();
    } catch (e) {
      toast(e instanceof SpError ? e.message : "Алдаа гарлаа", "danger");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Төлбөр хүлээн авах"
      width={440}
      footer={
        <Btn size="md" loading={busy} disabled={kind === "org" && !orgName} onClick={submit}>
          {money(order.total)} авах
        </Btn>
      }
    >
      <div className="space-y-5">
        <div className="text-center">
          <div className="text-[13px] text-mute">#{order.no} · {order.name}</div>
          <div className="mt-1 text-[36px] font-bold tracking-[-0.03em] text-ink tnum">{money(order.total)}</div>
        </div>
        <Field label="Төлбөрийн хэлбэр">
          <Segmented<PayMethod> size="lg" value={method} onChange={setMethod} options={[{ id: "qr", label: "QR" }, { id: "card", label: "Карт" }, { id: "cash", label: "Бэлэн" }]} />
        </Field>
        <Field label="Ebarimt">
          <Segmented<"person" | "org"> value={kind} onChange={setKind} options={[{ id: "person", label: "Хувь хүн" }, { id: "org", label: "Байгууллага" }]} />
        </Field>
        {kind === "org" && (
          <Field label="Байгууллагын РД" hint={orgName ? `✓ ${orgName}` : "7 оронтой"}>
            <input className="sp-field tnum" inputMode="numeric" maxLength={7} value={reg} onChange={(e) => setReg(e.target.value.replace(/\D/g, ""))} />
          </Field>
        )}
      </div>
    </Dialog>
  );
}

function CancelDialog({ open, order, onClose, onPick }: { open: boolean; order: Order; onClose: () => void; onPick: (r: CancelReason) => void }) {
  const [reason, setReason] = useState<CancelReason>("merchant");
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={`#${order.no} цуцлах`}
      width={420}
      footer={
        <Btn size="md" variant="danger" onClick={() => onPick(reason)}>
          Үргэлжлүүлэх
        </Btn>
      }
    >
      <p className="mb-3 text-[14px] text-mute">Шалтгаанаа сонгоно уу.</p>
      <div className="overflow-hidden rounded-[14px] bg-paper [&>*+*]:border-t [&>*+*]:border-[var(--sp-sep)]">
        {(Object.keys(CANCEL_LABEL) as CancelReason[]).map((r) => (
          <label key={r} className="sp-row flex min-h-[52px] cursor-pointer items-center gap-3 px-4 text-[15px] text-ink">
            <input type="radio" name="cancel-reason" className="size-[18px] accent-[var(--accent)]" checked={reason === r} onChange={() => setReason(r)} />
            {CANCEL_LABEL[r]}
          </label>
        ))}
      </div>
    </Dialog>
  );
}

/* ═════════ 8. Хүргэлтийн тохиргоо ═════════ */

const DEFAULT_STATUS = ["received", "delivered"];

export function DeliverySettingsPage() {
  const { s, actor } = usePortal();
  const [d, setD] = useState<DeliverySettings>(s.delivery);
  const [err, setErr] = useState<string | null>(null);
  const dirty = JSON.stringify(d) !== JSON.stringify(s.delivery);
  const set = (p: Partial<DeliverySettings>) => setD((x) => ({ ...x, ...p }));
  const setPage = (p: Partial<DeliverySettings["page"]>) => setD((x) => ({ ...x, page: { ...x.page, ...p } }));
  const setStatus = (id: string, p: Partial<DeliveryStatus>) => set({ statuses: d.statuses.map((x) => (x.id === id ? { ...x, ...p } : x)) });

  const addStatus = () => {
    const fin = d.statuses.findIndex((x) => x.final);
    const st: DeliveryStatus = { id: uid("ds"), name: "", sms: false };
    const list = [...d.statuses];
    list.splice(fin < 0 ? list.length : fin, 0, st);
    set({ statuses: list });
  };
  const removeStatus = (st: DeliveryStatus) => {
    const busy = s.orders.filter((o) => !o.cancel && o.statusId === st.id).length;
    if (busy) {
      toast(`${busy} захиалга энэ төлөвт байна. Эхлээд шилжүүлнэ үү.`, "danger");
      return;
    }
    set({ statuses: d.statuses.filter((x) => x.id !== st.id) });
  };

  const save = () => {
    if (d.enabled && d.districts.length === 0) return setErr("Дор хаяж нэг дүүрэг сонгоно уу.");
    if (d.statuses.some((x) => !x.name.trim())) return setErr("Төлөвийн нэр хоосон байна.");
    if (!d.page.name.trim()) return setErr("Хуудасны нэрийг оруулна уу.");
    if (!(d.fee >= 0)) return setErr("Хүргэлтийн үнэ буруу байна.");
    setErr(null);
    updateDelivery(actor, { ...d, statuses: d.statuses.map((x) => ({ ...x, name: x.name.trim() })) });
    toast("Хүргэлтийн тохиргоо хадгалагдлаа", "ok");
  };

  return (
    <Page
      title="Хүргэлтийн тохиргоо"
      sub={d.enabled ? `${d.districts.length} дүүрэгт хүргэнэ · ${d.fee ? money(d.fee) : "үнэгүй"}` : "Хүргэлт унтраалттай"}
      actions={
        <Btn size="md" disabled={!dirty} onClick={save}>
          Хадгалах
        </Btn>
      }
    >
      {err && (
        <div className="mb-4">
          <Notice tone="danger">{err}</Notice>
        </div>
      )}
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
        <div className="space-y-5">
          <Card title="Ерөнхий">
            <div className="space-y-3">
              <div className="overflow-hidden rounded-[14px] shadow-[inset_0_0_0_0.5px_var(--sp-sep)] [&>*+*]:rounded-none [&>*+*]:border-t [&>*+*]:border-[var(--sp-sep)] [&>*]:rounded-none">
                <SwitchRow title="Хүргэлт хүлээн авах" sub="Унтраавал захиалгын хуудас шинэ захиалга авахгүй." checked={d.enabled} onChange={(v) => set({ enabled: v })} />
                <SwitchRow title="SMS мэдэгдэл" sub="Сонгосон төлөвт харилцагчид SMS явна. Гүйлгээний мессеж тул татгалзалтад хамаарахгүй." checked={d.sms} onChange={(v) => set({ sms: v })} />
              </div>
              <div className="pt-1">
                <Field label="Хүргэлтийн үнэ" hint="0 бол үнэгүй хүргэлт.">
                  <div className="relative max-w-[240px]">
                    <input
                      className="sp-field !pr-10 text-right tnum"
                      inputMode="numeric"
                      value={String(d.fee)}
                      onChange={(e) => set({ fee: Number(e.target.value.replace(/\D/g, "")) || 0 })}
                    />
                    <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-mute">₮</span>
                  </div>
                </Field>
              </div>
            </div>
          </Card>

          <Card
            title="Хүргэх бүс"
            action={
              <button type="button" className="text-[13px] font-semibold text-accent" onClick={() => set({ districts: d.districts.length === DISTRICTS.length ? [] : [...DISTRICTS] })}>
                {d.districts.length === DISTRICTS.length ? "Бүгдийг арилгах" : "Бүгдийг сонгох"}
              </button>
            }
          >
            <p className="mb-3 text-[13px] text-mute">Сонгоогүй дүүргийн хаягаар захиалга үүсэхгүй, харилцагчид шууд мэдэгдэнэ.</p>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-3">
              {DISTRICTS.map((x) => (
                <Check key={x} checked={d.districts.includes(x)} onChange={(v) => set({ districts: v ? [...d.districts, x] : d.districts.filter((y) => y !== x) })}>
                  {x}
                </Check>
              ))}
            </div>
          </Card>

          <Card
            title="Хүргэлтийн төлөв"
            action={
              <Btn size="sm" variant="tinted" icon="plus" onClick={addStatus}>
                Төлөв нэмэх
              </Btn>
            }
          >
            <div className="overflow-hidden rounded-[14px] shadow-[inset_0_0_0_0.5px_var(--sp-sep)] [&>*+*]:border-t [&>*+*]:border-[var(--sp-sep)]">
              <div className="grid grid-cols-[28px_minmax(0,1fr)_64px_40px] items-center gap-3 bg-[var(--sp-fill)] px-3 py-2 text-[12px] font-semibold text-mute">
                <span>#</span>
                <span>Нэр</span>
                <span className="text-center">SMS</span>
                <span />
              </div>
              {d.statuses.map((st, i) => {
                const fixed = DEFAULT_STATUS.includes(st.id) || st.final;
                return (
                  <div key={st.id} className="grid grid-cols-[28px_minmax(0,1fr)_64px_40px] items-center gap-3 px-3 py-2">
                    <span className="text-[13px] text-mute tnum">{i + 1}</span>
                    {fixed ? (
                      <span className="flex min-w-0 items-center gap-2 text-[15px] text-ink">
                        <span className="truncate">{st.name}</span>
                        {st.final ? <Badge tone="ok" icon="lock">Эцсийн · кодоор</Badge> : <Badge tone="gray">Үндсэн</Badge>}
                      </span>
                    ) : (
                      <input className="sp-field !h-10" value={st.name} placeholder="Жишээ: Хүргэлтэнд гарсан" aria-label="Төлөвийн нэр" onChange={(e) => setStatus(st.id, { name: e.target.value })} />
                    )}
                    <span className="flex justify-center">
                      <Check label={`${st.name} — SMS`} checked={st.sms} disabled={!d.sms} onChange={(v) => setStatus(st.id, { sms: v })} />
                    </span>
                    {fixed ? (
                      <span />
                    ) : (
                      <button type="button" aria-label="Устгах" onClick={() => removeStatus(st)} className="sp-tap grid size-9 place-items-center rounded-full text-danger hover:bg-danger-soft">
                        <Icon name="trash" size={18} />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
            <p className="mt-2 text-[13px] text-mute">Үндсэн 2 төлөвийг устгахгүй. «Хүргэгдсэн» төлөвт зөвхөн ачаа хүлээлгэн өгөх кодоор шилжинэ.</p>
          </Card>
        </div>

        <div className="space-y-5">
          <Card title="Захиалгын хуудас">
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <span className="grid size-16 shrink-0 place-items-center overflow-hidden rounded-[16px] bg-[var(--sp-fill)] text-mute">
                  {d.page.logo ? <img src={d.page.logo} alt="Лого" className="size-full object-cover" /> : <Icon name="building" size={26} />}
                </span>
                <div className="flex flex-wrap gap-2">
                  <label className="sp-tap inline-flex h-[34px] cursor-pointer items-center gap-2 rounded-full bg-[var(--sp-fill)] px-3 text-[13px] font-semibold text-ink">
                    <Icon name="upload" size={16} />
                    Лого оруулах
                    <input
                      type="file"
                      accept="image/*"
                      className="sr-only"
                      onChange={async (e) => {
                        const f = e.target.files?.[0];
                        if (f) setPage({ logo: await readImage(f, 256) });
                        e.target.value = "";
                      }}
                    />
                  </label>
                  {d.page.logo && (
                    <Btn size="sm" variant="plain" onClick={() => setPage({ logo: undefined })}>
                      Арилгах
                    </Btn>
                  )}
                </div>
              </div>
              <Field label="Нэр">
                <input className="sp-field" value={d.page.name} maxLength={40} onChange={(e) => setPage({ name: e.target.value })} />
              </Field>
              <Field label="Тайлбар" hint={`${d.page.desc.length}/120`}>
                <textarea className="sp-field" rows={2} maxLength={120} value={d.page.desc} onChange={(e) => setPage({ desc: e.target.value })} />
              </Field>
              <Field label="Өнгө">
                <ColorField label="Хуудасны өнгө" value={d.page.color} onChange={(v) => setPage({ color: v })} />
              </Field>
            </div>
          </Card>
          <Card title="Урьдчилан харах" action={<a href="/shop" target="_blank" rel="noreferrer" className="flex items-center gap-1 text-[13px] font-semibold text-accent">/shop <Icon name="link" size={14} /></a>}>
            <Thumb page={d.page} />
            <p className="mt-2 text-[12px] text-mute">Холбоос хуваалцахад (Messenger, SMS) гарах зураг. Лого, нэр, тайлбар, өнгөнөөс автоматаар үүснэ.</p>
          </Card>
        </div>
      </div>
    </Page>
  );
}

/** BR04-4: тохиргооноос үүссэн thumbnail (1200×630 харьцаа) */
function Thumb({ page }: { page: DeliverySettings["page"] }) {
  const fg = contrast(page.color, "#ffffff") >= 2.5 ? "#ffffff" : "#111113";
  const initials = page.name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "?";
  return (
    <div className="overflow-hidden rounded-[14px] shadow-[0_0_0_0.5px_var(--sp-sep)]">
      <div className="relative aspect-[1200/630] w-full overflow-hidden" style={{ background: page.color }}>
        <div className="absolute inset-0 flex flex-col justify-between p-5" style={{ color: fg }}>
          <span className="grid size-14 place-items-center overflow-hidden rounded-[14px] bg-white text-[18px] font-bold" style={{ color: page.color }}>
            {page.logo ? <img src={page.logo} alt="" className="size-full object-cover" /> : initials}
          </span>
          <div>
            <div className="line-clamp-1 text-[22px] font-bold leading-tight tracking-[-0.02em]">{page.name || "Дэлгүүрийн нэр"}</div>
            <div className="mt-1 line-clamp-2 text-[14px] leading-snug opacity-90">{page.desc || "Тайлбар"}</div>
          </div>
        </div>
      </div>
      <div className="bg-paper px-3 py-2">
        <div className="truncate text-[12px] text-mute">{typeof window !== "undefined" ? window.location.host : ""}/shop</div>
        <div className="truncate text-[14px] font-semibold text-ink">{page.name || "Дэлгүүрийн нэр"} — захиалга</div>
      </div>
    </div>
  );
}
