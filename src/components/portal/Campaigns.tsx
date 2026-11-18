"use client";

/*
 * Урамшуулал (BR05): жагсаалт + toggle, Point / Item тохиргоо, үр дүн (BR05-10).
 * Идэвхтэй campaign-ийн гол тохиргоо түгжээтэй (BR05-9).
 */

import { useMemo, useState } from "react";
import { Icon } from "@/components/sp/icons";
import { Badge, Btn, cx, Empty, Field, Notice, SearchField, Segmented, Switch, toast, useConfirm } from "@/components/sp/ui";
import { DAY_LABEL, inDates, itemCampaignLive, money, num, rewardText, scheduleText } from "@/lib/sp/logic";
import { SpError, toggleCampaign, uid, upsertCampaign } from "@/lib/sp/store";
import type { Campaign, ItemCampaign, ItemReward, PointCampaign, SpState, Tier } from "@/lib/sp/types";
import { Check, Chip, Dialog, Drawer, KV, Page, SectionTitle, Stat, SwitchRow, Table, ymd, usePortal } from "./kit";

const today = () => ymd(new Date());
const addDays = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return ymd(d);
};
const shortDate = (s: string) => s.slice(5).replace("-", ".");

/** BR05-10: campaign бүрийн үр дүн */
function results(s: SpState, c: Campaign) {
  if (c.type === "item") {
    const sales = s.sales.filter((x) => !x.refund && x.applied.some((a) => a.campaignId === c.id));
    const discount = sales.reduce((a, x) => a + x.applied.filter((y) => y.campaignId === c.id).reduce((b, y) => b + y.amount, 0), 0);
    const customers = new Set(sales.map((x) => x.customerId).filter(Boolean)).size;
    return { uses: Math.max(c.uses, sales.length), customers, discount, given: 0, spent: 0 };
  }
  const from = new Date(c.start + "T00:00:00").getTime();
  const to = new Date(c.end + "T23:59:59").getTime();
  const pts = s.points.filter((p) => {
    const t = new Date(p.at).getTime();
    return t >= from && t <= to;
  });
  const given = pts.filter((p) => p.kind === "earn").reduce((a, p) => a + p.delta, 0);
  const spent = pts.filter((p) => p.kind === "spend").reduce((a, p) => a + Math.abs(p.delta), 0);
  const customers = new Set(pts.filter((p) => p.kind === "earn").map((p) => p.customerId)).size;
  const uses = pts.filter((p) => p.kind === "earn").length;
  return { uses, customers, discount: spent, given, spent };
}

function stateOf(c: Campaign): { tone: "ok" | "gray" | "warn" | "accent"; label: string } {
  if (c.end < today()) return { tone: "gray", label: "Дууссан" };
  if (!c.active) return { tone: "gray", label: "Идэвхгүй" };
  if (c.start > today()) return { tone: "accent", label: "Эхлээгүй" };
  if (c.type === "item" && !itemCampaignLive(c)) return { tone: "warn", label: "Цагаа хүлээж буй" };
  return { tone: "ok", label: "Идэвхтэй" };
}

export default function Campaigns() {
  const { s, actor, sub } = usePortal();
  const [q, setQ] = useState("");
  const [pick, setPick] = useState(false);
  const [edit, setEdit] = useState<Campaign | null>(() => (sub === "new-point" ? newPoint(!s.campaigns.some((x) => x.type === "point" && x.active && inDates(x))) : sub === "new-item" ? newItem() : null));
  const [viewId, setViewId] = useState<string | null>(null);
  const { confirm, node } = useConfirm();

  const rows = useMemo(
    () =>
      [...s.campaigns]
        .filter((c) => c.name.toLowerCase().includes(q.trim().toLowerCase()))
        .sort((a, b) => Number(b.active) - Number(a.active) || b.createdAt.localeCompare(a.createdAt)),
    [s.campaigns, q],
  );
  const view = s.campaigns.find((c) => c.id === viewId) ?? null;

  const month = useMemo(() => {
    const since = Date.now() - 30 * 86400000;
    const sales = s.sales.filter((x) => !x.refund && new Date(x.at).getTime() >= since);
    const discount = sales.reduce((a, x) => a + x.applied.reduce((b, y) => b + y.amount, 0), 0);
    const given = s.points.filter((p) => p.kind === "earn" && new Date(p.at).getTime() >= since).reduce((a, p) => a + p.delta, 0);
    return { discount, given };
  }, [s.sales, s.points]);

  const toggle = (c: Campaign, v: boolean) => {
    if (v) {
      if (c.end < today()) return toast("Хугацаа нь дууссан. Огноог сунгаад идэвхжүүлнэ үү.", "danger");
      if (c.type === "point") {
        const other = s.campaigns.find((x) => x.type === "point" && x.active && x.id !== c.id && inDates(x));
        if (other) return toast(`«${other.name}» оноо урамшуулал идэвхтэй байна. Нэг л зэрэг ажиллана.`, "danger");
      }
      toggleCampaign(actor, c.id, true);
      toast(`«${c.name}» идэвхжлээ`, "ok");
      return;
    }
    confirm({
      title: `«${c.name}»-г зогсоох уу?`,
      message: c.type === "point" ? "Касс дээр оноо бодогдохоо болино. Цуглуулсан оноо хүчинтэй хэвээр." : "Касс дээр энэ урамшуулал хэрэглэгдэхээ болино.",
      ok: "Зогсоох",
      destructive: true,
      run: () => {
        toggleCampaign(actor, c.id, false);
        toast(`«${c.name}» зогслоо`);
      },
    });
  };

  const active = s.campaigns.filter((c) => c.active && c.end >= today()).length;

  return (
    <Page
      title="Урамшуулал"
      sub={`${active} идэвхтэй · ${s.campaigns.length} нийт`}
      actions={
        <Btn size="md" icon="plus" onClick={() => setPick(true)}>
          Шинэ урамшуулал
        </Btn>
      }
    >
      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        <Stat label="Идэвхтэй урамшуулал" value={active} sub={`Point ${s.campaigns.filter((c) => c.type === "point" && c.active).length} · Item ${s.campaigns.filter((c) => c.type === "item" && c.active).length}`} />
        <Stat label="Хямдрал · 30 хоног" value={money(month.discount)} sub="Item based урамшууллаар" />
        <Stat label="Олгосон оноо · 30 хоног" value={num(month.given)} sub="1 оноо = 1₮" />
      </div>
      <div className="mb-4 w-full sm:w-[280px]">
        <SearchField value={q} onChange={setQ} placeholder="Урамшуулал хайх" />
      </div>
      <Table<Campaign>
        rows={rows}
        rowKey={(c) => c.id}
        onRow={(c) => setViewId(c.id)}
        rowClass={(c) => !c.active && "opacity-75"}
        empty={
          <Empty
            icon="tag"
            title="Урамшуулал алга"
            body="Оноо цуглуулах (Point) эсвэл «3 авбал 1 үнэгүй» (Item) урамшуулал үүсгээд харилцагчаа эргэж ирүүлээрэй."
            action={<Btn size="md" icon="plus" onClick={() => setPick(true)}>Шинэ урамшуулал</Btn>}
          />
        }
        cols={[
          {
            key: "name",
            label: "Нэр",
            render: (c) => (
              <div className="min-w-[200px]">
                <div className="font-medium">{c.name}</div>
                <div className="text-[12px] text-mute">{c.type === "item" ? `${rewardText(c, s.products)} · ${scheduleText(c)}` : c.tiers.map((t) => t.name).join(" → ")}</div>
              </div>
            ),
          },
          { key: "type", label: "Төрөл", render: (c) => (c.type === "point" ? <Badge tone="accent" icon="star">Point</Badge> : <Badge tone="gray" icon="gift">Item</Badge>) },
          { key: "dates", label: "Хугацаа", render: (c) => <span className="whitespace-nowrap text-ink-2 tnum">{shortDate(c.start)} – {shortDate(c.end)}</span> },
          { key: "uses", label: "Ашигласан", align: "right", render: (c) => num(results(s, c).uses) },
          {
            key: "st",
            label: "Төлөв",
            render: (c) => {
              const st = stateOf(c);
              return <Badge tone={st.tone}>{st.label}</Badge>;
            },
          },
          {
            key: "on",
            label: <span className="sr-only">Идэвхтэй</span>,
            w: "72px",
            render: (c) => (
              <span onClick={(e) => e.stopPropagation()} className="flex justify-end">
                <Switch label={`${c.name} идэвхтэй`} checked={c.active} onChange={(v) => toggle(c, v)} />
              </span>
            ),
          },
        ]}
      />

      <Dialog open={pick} onClose={() => setPick(false)} title="Шинэ урамшуулал" width={560}>
        <p className="mb-4 text-[14px] text-mute">Төрлөө сонгоно уу.</p>
        <div className="grid gap-3 sm:grid-cols-2">
          {[
            { type: "point" as const, icon: "star", title: "Point based", body: "Худалдан авалт бүрд оноо цуглуулж, түвшин ахина. Оноогоор төлбөр төлнө." },
            { type: "item" as const, icon: "gift", title: "Item based", body: "Тодорхой барааг N ширхэг авбал бараа эсвэл хямдрал шагнална." },
          ].map((o) => (
            <button
              key={o.type}
              type="button"
              onClick={() => {
                setPick(false);
                setEdit(o.type === "point" ? newPoint(!s.campaigns.some((x) => x.type === "point" && x.active && inDates(x))) : newItem());
              }}
              className="sp-tap rounded-[18px] bg-paper p-5 text-left shadow-[0_0_0_0.5px_var(--sp-sep)] hover:shadow-[0_0_0_1.5px_var(--accent)]"
            >
              <span className="grid size-11 place-items-center rounded-[12px] bg-accent-soft text-accent">
                <Icon name={o.icon} size={22} />
              </span>
              <div className="mt-3 text-[16px] font-semibold text-ink">{o.title}</div>
              <div className="mt-1 text-[13px] leading-snug text-mute">{o.body}</div>
            </button>
          ))}
        </div>
      </Dialog>

      <Drawer
        open={!!view}
        onClose={() => setViewId(null)}
        title={view?.name ?? ""}
        sub={view ? `${view.type === "point" ? "Point based" : "Item based"} · ${shortDate(view.start)} – ${shortDate(view.end)}` : undefined}
        footer={
          view && (
            <Btn
              size="md"
              icon="edit"
              onClick={() => {
                setEdit(view);
                setViewId(null);
              }}
            >
              Засах
            </Btn>
          )
        }
      >
        {view && <CampaignView c={view} onToggle={(v) => toggle(view, v)} />}
      </Drawer>

      {edit && <Editor key={edit.id} initial={edit} isNew={!s.campaigns.some((c) => c.id === edit.id)} onClose={() => setEdit(null)} />}
      {node}
    </Page>
  );
}

function CampaignView({ c, onToggle }: { c: Campaign; onToggle: (v: boolean) => void }) {
  const { s } = usePortal();
  const r = results(s, c);
  const st = stateOf(c);
  return (
    <div className="space-y-5">
      <SwitchRow title={<span className="flex items-center gap-2">Идэвхтэй <Badge tone={st.tone}>{st.label}</Badge></span>} checked={c.active} onChange={onToggle} />
      <div>
        <SectionTitle>Үр дүн</SectionTitle>
        <div className="grid grid-cols-2 gap-3">
          <Stat label="Хамрагдсан харилцагч" value={num(r.customers)} />
          <Stat label="Ашигласан" value={num(r.uses)} sub="удаа" />
          {c.type === "point" ? (
            <>
              <Stat label="Олгосон оноо" value={num(r.given)} />
              <Stat label="Зарцуулсан оноо" value={num(r.spent)} sub={`= ${money(r.spent)} хямдрал`} />
            </>
          ) : (
            <div className="col-span-2">
              <Stat label="Нийт хямдрал" value={money(r.discount)} />
            </div>
          )}
        </div>
      </div>
      <div>
        <SectionTitle>Тохиргоо</SectionTitle>
        {c.type === "point" ? (
          <KV
            rows={[
              ...c.tiers.map((t, i) => [`${i + 1}. ${t.name}`, `${num(t.points)} оноо`] as [string, string]),
              ["Онооны хугацаа", c.expiryMonths ? `${c.expiryMonths} сар${c.expiryNotify ? " · мэдэгдэнэ" : ""}` : "Хугацаагүй"],
              ["Хугацаа", `${c.start} – ${c.end}`],
              ["Өдөрт / харилцагч", c.limitPerDay ?? "Хязгааргүй"],
              ["Нийт / харилцагч", c.limitPerCustomer ?? "Хязгааргүй"],
              ["Нийт", c.limitTotal ?? "Хязгааргүй"],
            ]}
          />
        ) : (
          <KV
            rows={[
              ["Бараа", c.productIds.map((id) => s.products.find((p) => p.id === id)?.name ?? id).join(", ")],
              ["Авах хэмжээ", `${c.qty} ширхэг`],
              ["Шагнал", rewardText(c, s.products)],
              ["Давтамж", scheduleText(c)],
              ["Хугацаа", `${c.start} – ${c.end}`],
              ["Өдөрт / харилцагч", c.limitPerDay ?? "Хязгааргүй"],
              ["Нийт / харилцагч", c.limitPerCustomer ?? "Хязгааргүй"],
              ["Нийт", c.limitTotal ?? "Хязгааргүй"],
            ]}
          />
        )}
      </div>
    </div>
  );
}

/* ───────── засварлагч ───────── */

const newPoint = (active = true): PointCampaign => ({
  id: uid("cmp"),
  type: "point",
  name: "",
  tiers: [
    { name: "Энгийн", points: 0 },
    { name: "Мөнгөн", points: 1000 },
  ],
  start: today(),
  end: addDays(90),
  active,
  expiryMonths: 12,
  createdAt: new Date().toISOString(),
});

const newItem = (): ItemCampaign => ({
  id: uid("cmp"),
  type: "item",
  name: "",
  productIds: [],
  qty: 2,
  reward: { kind: "percent", value: 10 },
  start: today(),
  end: addDays(30),
  days: [],
  from: "00:00",
  to: "23:59",
  active: true,
  uses: 0,
  createdAt: new Date().toISOString(),
});

const numIn = (v: string) => Number(v.replace(/\D/g, "")) || 0;
const optIn = (v: string) => (v.replace(/\D/g, "") ? Number(v.replace(/\D/g, "")) : undefined);

function Editor({ initial, isNew, onClose }: { initial: Campaign; isNew: boolean; onClose: () => void }) {
  const { s, actor } = usePortal();
  const [c, setC] = useState<Campaign>(initial);
  const [err, setErr] = useState<string | null>(null);
  const [open, setOpen] = useState(true);
  // BR05-9: хадгалагдсан идэвхтэй campaign-ийн гол тохиргоо түгжээтэй
  const locked = !isNew && initial.active;

  const validate = (): string | null => {
    if (!c.name.trim()) return "Нэрээ оруулна уу.";
    if (!c.start || !c.end || c.end < c.start) return "Дуусах огноо эхлэхээс хойш байна.";
    if (c.type === "point") {
      if (!c.tiers.length) return "Дор хаяж нэг түвшин хэрэгтэй.";
      if (c.tiers.some((t) => !t.name.trim())) return "Түвшний нэр хоосон байна.";
      for (let i = 1; i < c.tiers.length; i++) if (c.tiers[i].points <= c.tiers[i - 1].points) return "Түвшний оноо өсөх дарааллаар байна.";
      if (c.active) {
        const other = s.campaigns.find((x) => x.type === "point" && x.active && x.id !== c.id && inDates(x));
        if (other) return `«${other.name}» оноо урамшуулал идэвхтэй байна. Энэ урамшууллыг идэвхгүй хадгална уу.`;
      }
    } else {
      if (!c.productIds.length) return "Урамшуулалтай бараагаа сонгоно уу.";
      if (c.qty < 1) return "Авах хэмжээ 1-ээс багагүй.";
      if (c.reward.kind === "product" && (!c.reward.productId || c.reward.qty < 1)) return "Шагналын барааг сонгоно уу.";
      if (c.reward.kind === "percent" && (c.reward.value < 1 || c.reward.value > 100)) return "Хувь 1–100 хооронд.";
      if (c.reward.kind === "amount" && c.reward.value < 1) return "Хямдралын дүнг оруулна уу.";
      if (c.from >= c.to) return "Эхлэх цаг дуусахаас өмнө байна.";
    }
    return null;
  };

  const save = () => {
    const e = validate();
    if (e) return setErr(e);
    try {
      upsertCampaign(actor, { ...c, name: c.name.trim() });
      toast(isNew ? "Урамшуулал үүслээ" : "Хадгалагдлаа", "ok");
      setOpen(false);
      setTimeout(onClose, 250);
    } catch (x) {
      setErr(x instanceof SpError ? x.message : "Алдаа гарлаа");
    }
  };

  return (
    <Drawer
      open={open}
      onClose={() => {
        setOpen(false);
        setTimeout(onClose, 250);
      }}
      width={600}
      title={isNew ? (c.type === "point" ? "Шинэ Point based" : "Шинэ Item based") : c.name || "Урамшуулал"}
      sub={c.type === "point" ? "Оноо цуглуулах, түвшин" : "N ширхэг авбал шагнал"}
      footer={
        <Btn size="md" onClick={save}>
          {isNew ? "Үүсгэх" : "Хадгалах"}
        </Btn>
      }
    >
      <div className="space-y-5">
        {err && <Notice tone="danger">{err}</Notice>}
        {locked && (
          <Notice tone="gray" icon="lock">
            Идэвхтэй урамшууллын {c.type === "point" ? "түвшин, оноог" : "бараа, хэмжээ, шагналыг"} өөрчлөхгүй — харилцагчтай маргаан гарахаас сэргийлнэ. Өөрчлөх бол зогсоогоод засах, эсвэл шинэ урамшуулал үүсгэнэ.
          </Notice>
        )}
        <Field label="Нэр">
          <input className="sp-field" value={c.name} maxLength={50} autoFocus={isNew} placeholder={c.type === "point" ? "Жишээ: Гишүүнчлэл" : "Жишээ: Кока-Кола 3+1"} onChange={(e) => setC({ ...c, name: e.target.value })} />
        </Field>

        {c.type === "point" ? <PointFields c={c} set={setC} locked={locked} /> : <ItemFields c={c} set={setC} locked={locked} />}

        <div className="grid grid-cols-2 gap-3">
          <Field label="Эхлэх огноо">
            <input type="date" className="sp-field" value={c.start} onChange={(e) => setC({ ...c, start: e.target.value })} />
          </Field>
          <Field label="Дуусах огноо">
            <input type="date" className="sp-field" value={c.end} min={c.start} onChange={(e) => setC({ ...c, end: e.target.value })} />
          </Field>
        </div>
        <Limits c={c} set={setC} />
        <SwitchRow title="Идэвхтэй" sub="Хугацаа дуусахад автоматаар зогсоно." checked={c.active} onChange={(v) => setC({ ...c, active: v })} />
      </div>
    </Drawer>
  );
}

function PointFields({ c, set, locked }: { c: PointCampaign; set: (c: Campaign) => void; locked: boolean }) {
  const setTier = (i: number, p: Partial<Tier>) => set({ ...c, tiers: c.tiers.map((t, k) => (k === i ? { ...t, ...p } : t)) });
  return (
    <>
      <div>
        <SectionTitle
          action={
            !locked && (
              <Btn
                size="sm"
                variant="tinted"
                icon="plus"
                onClick={() => set({ ...c, tiers: [...c.tiers, { name: "", points: (c.tiers[c.tiers.length - 1]?.points ?? 0) + 1000 }] })}
              >
                Түвшин нэмэх
              </Btn>
            )
          }
        >
          Түвшин ({c.tiers.length})
        </SectionTitle>
        <div className="overflow-hidden rounded-[14px] bg-paper [&>*+*]:border-t [&>*+*]:border-[var(--sp-sep)]">
          {c.tiers.map((t, i) => (
            <div key={i} className="grid grid-cols-[24px_minmax(0,1fr)_140px_36px] items-center gap-2 px-3 py-2">
              <span className="text-center text-[13px] text-mute tnum">{i + 1}</span>
              <input className="sp-field !h-10" value={t.name} disabled={locked} placeholder="Түвшний нэр" aria-label="Түвшний нэр" onChange={(e) => setTier(i, { name: e.target.value })} />
              <div className="relative">
                <input className="sp-field !h-10 !pr-14 text-right tnum" disabled={locked} inputMode="numeric" value={String(t.points)} aria-label="Шаардах оноо" onChange={(e) => setTier(i, { points: numIn(e.target.value) })} />
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[12px] text-mute">оноо</span>
              </div>
              {!locked && c.tiers.length > 1 ? (
                <button type="button" aria-label="Түвшин хасах" onClick={() => set({ ...c, tiers: c.tiers.filter((_, k) => k !== i) })} className="sp-tap grid size-9 place-items-center rounded-full text-danger hover:bg-danger-soft">
                  <Icon name="minus" size={18} />
                </button>
              ) : (
                <span />
              )}
            </div>
          ))}
        </div>
        <p className="mt-1.5 px-1 text-[12px] text-mute">Нийт цуглуулсан оноо босгыг давахад дараагийн түвшин рүү ахина. Барааны оноог «Бараа» хэсэгт тохируулна.</p>
      </div>
      <Field label="Онооны хүчинтэй хугацаа" hint="0 = хугацаагүй. Хугацаа нь олгосон өдрөөс тоологдоно.">
        <div className="relative max-w-[200px]">
          <input className="sp-field !pr-12 text-right tnum" inputMode="numeric" value={String(c.expiryMonths)} onChange={(e) => set({ ...c, expiryMonths: numIn(e.target.value) })} />
          <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-mute">сар</span>
        </div>
      </Field>
      {c.expiryMonths > 0 && (
        <SwitchRow title="Хүчингүй болохоос өмнө мэдэгдэх" sub="Оноо дуусахаас 14 хоногийн өмнө харилцагчид SMS очно." checked={!!c.expiryNotify} onChange={(v) => set({ ...c, expiryNotify: v })} />
      )}
    </>
  );
}

const WEEK = [1, 2, 3, 4, 5, 6, 0];

function ItemFields({ c, set, locked }: { c: ItemCampaign; set: (c: Campaign) => void; locked: boolean }) {
  const { s } = usePortal();
  const [q, setQ] = useState("");
  const [first] = useState(() => new Set(c.productIds));
  // Сонгосон бараа эхэндээ — түгжээтэй үед ч юу сонгогдсон нь шууд харагдана
  const products = s.products
    .filter((p) => p.active && p.name.toLowerCase().includes(q.trim().toLowerCase()))
    .sort((a, b) => Number(first.has(b.id)) - Number(first.has(a.id)));
  const setReward = (r: ItemReward) => set({ ...c, reward: r });
  const rk = c.reward.kind;
  return (
    <>
      <div>
        <SectionTitle>Урамшуулалтай бараа ({c.productIds.length})</SectionTitle>
        <div className={cx("overflow-hidden rounded-[14px] bg-paper", locked && "opacity-60")}>
          <div className="p-2">
            <SearchField value={q} onChange={setQ} placeholder="Бараа хайх" />
          </div>
          <div className="sp-scroll max-h-[220px] overflow-y-auto px-3 pb-2">
            {products.map((p) => (
              <div key={p.id} className="flex items-center justify-between gap-2 border-t border-[var(--sp-sep)] py-1">
                <Check
                  disabled={locked}
                  checked={c.productIds.includes(p.id)}
                  onChange={(v) => set({ ...c, productIds: v ? [...c.productIds, p.id] : c.productIds.filter((x) => x !== p.id) })}
                >
                  <span className="text-[14px]">{p.name}</span>
                </Check>
                <span className="text-[13px] text-mute tnum">{money(p.price)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
      <Field label="Авах ёстой хэмжээ" hint="Сонгосон бараанаас нийлээд хэдэн ширхэг авбал шагнал өгөх вэ.">
        <div className="relative max-w-[200px]">
          <input className="sp-field !pr-[84px] text-right tnum" disabled={locked} inputMode="numeric" value={String(c.qty)} onChange={(e) => set({ ...c, qty: numIn(e.target.value) })} />
          <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-mute">ширхэг</span>
        </div>
      </Field>
      <div>
        <SectionTitle>Шагнал</SectionTitle>
        <div className={cx("space-y-3 rounded-[14px] bg-paper p-3", locked && "pointer-events-none opacity-60")}>
          <Segmented<ItemReward["kind"]>
            value={rk}
            onChange={(k) => setReward(k === "product" ? { kind: "product", productId: c.productIds[0] ?? "", qty: 1 } : { kind: k, value: k === "percent" ? 10 : 1000 })}
            options={[
              { id: "product", label: "Бараа үнэгүй" },
              { id: "percent", label: "% хямдрал" },
              { id: "amount", label: "₮ хямдрал" },
            ]}
          />
          {c.reward.kind === "product" ? (
            <div className="grid grid-cols-[minmax(0,1fr)_120px] gap-2">
              <select className="sp-field" aria-label="Шагналын бараа" value={c.reward.productId} onChange={(e) => setReward({ kind: "product", productId: e.target.value, qty: (c.reward as { qty: number }).qty })}>
                <option value="">Бараа сонгох…</option>
                {s.products
                  .filter((p) => p.active)
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
              </select>
              <input className="sp-field text-right tnum" inputMode="numeric" aria-label="Шагналын тоо" value={String(c.reward.qty)} onChange={(e) => setReward({ kind: "product", productId: (c.reward as { productId: string }).productId, qty: numIn(e.target.value) })} />
            </div>
          ) : (
            <div className="relative max-w-[200px]">
              <input className="sp-field !pr-10 text-right tnum" inputMode="numeric" aria-label="Хямдрал" value={String(c.reward.value)} onChange={(e) => setReward({ kind: rk as "percent" | "amount", value: numIn(e.target.value) })} />
              <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-mute">{rk === "percent" ? "%" : "₮"}</span>
            </div>
          )}
        </div>
      </div>
      <div>
        <SectionTitle>Давтамж</SectionTitle>
        <div className="space-y-3 rounded-[14px] bg-paper p-3">
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Гараг">
            {WEEK.map((d) => {
              const on = c.days.includes(d);
              return (
                <Chip key={d} on={on} onClick={() => set({ ...c, days: on ? c.days.filter((x) => x !== d) : [...c.days, d] })}>
                  {DAY_LABEL[d]}
                </Chip>
              );
            })}
          </div>
          <p className="text-[12px] text-mute">{c.days.length === 0 ? "Гараг сонгоогүй бол өдөр бүр." : scheduleText(c)}</p>
          <div className="grid max-w-[340px] grid-cols-2 gap-3">
            <Field label="Эхлэх цаг">
              <input type="time" className="sp-field" value={c.from} onChange={(e) => set({ ...c, from: e.target.value })} />
            </Field>
            <Field label="Дуусах цаг">
              <input type="time" className="sp-field" value={c.to} onChange={(e) => set({ ...c, to: e.target.value })} />
            </Field>
          </div>
        </div>
      </div>
    </>
  );
}

/** BR05-7: хязгаар — Point, Item аль алинд */
function Limits({ c, set }: { c: Campaign; set: (c: Campaign) => void }) {
  return (
    <div>
      <SectionTitle>Хязгаар</SectionTitle>
      <div className="grid grid-cols-3 gap-3">
        {(
          [
            ["limitPerDay", "Нэг харилцагч өдөрт"],
            ["limitPerCustomer", "Нэг харилцагч нийт"],
            ["limitTotal", "Нийт"],
          ] as const
        ).map(([k, l]) => (
          <Field key={k} label={l}>
            <input className="sp-field text-right tnum" inputMode="numeric" placeholder="∞" value={c[k] === undefined ? "" : String(c[k])} onChange={(e) => set({ ...c, [k]: optIn(e.target.value) })} />
          </Field>
        ))}
      </div>
      <p className="mt-1.5 px-1 text-[12px] text-mute">
        Хоосон = хязгааргүй.{c.type === "point" ? " Оноо олгох гүйлгээний тоог хязгаарлана." : " Хоёр Item урамшуулал давхцвал харилцагчид ашигтайг нь систем сонгоно."}
      </p>
    </div>
  );
}

