"use client";

/* Урамшуулал — Point / Item based campaign: жагсаалт, үүсгэх, засах, үр дүн (BR05, US08, US09) */

import { useState } from "react";
import { DAY_LABEL, money, num, rewardText, scheduleText } from "@/lib/sp/logic";
import { SpError, toggleCampaign, uid, upsertCampaign, useSp } from "@/lib/sp/store";
import type { Campaign, ItemCampaign, ItemReward, PointCampaign, SpState } from "@/lib/sp/types";
import { Badge, Btn, cx, Empty, Field, Group, IconBtn, NavBar, Notice, Row, SearchField, Segmented, Sheet, Switch, toast, useConfirm } from "@/components/sp/ui";
import { Icon } from "@/components/sp/icons";
import { Locked, Screen, useM } from "./core";

const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const md = (s: string) => s.slice(5).replace("-", ".");
const today = () => ymd(new Date());
const plusDays = (n: number) => ymd(new Date(Date.now() + n * 86400000));

/** Төлөв: идэвхтэй / хуваарь хүлээж буй / дууссан / зогссон */
function stateOf(c: Campaign): { label: string; tone: "ok" | "gray" | "warn" } {
  if (!c.active) return { label: "Зогссон", tone: "gray" };
  if (c.end < today()) return { label: "Дууссан", tone: "gray" };
  if (c.start > today()) return { label: "Эхлээгүй", tone: "warn" };
  return { label: "Идэвхтэй", tone: "ok" };
}

/** BR05-10 — campaign тус бүрийн үр дүн */
export function campaignResults(s: SpState, c: Campaign) {
  if (c.type === "item") {
    const sales = s.sales.filter((x) => !x.refund && x.applied.some((a) => a.campaignId === c.id));
    const discount = sales.reduce((a, x) => a + x.applied.filter((y) => y.campaignId === c.id).reduce((b, y) => b + y.amount, 0), 0);
    const customers = new Set(sales.map((x) => x.customerId).filter(Boolean)).size;
    return { customers, given: 0, spent: 0, discount, uses: Math.max(c.uses, sales.length) };
  }
  const end = c.end + "T23:59:59";
  const pts = s.points.filter((p) => p.at.slice(0, 10) >= c.start && p.at <= end);
  const given = pts.filter((p) => p.kind === "earn").reduce((a, p) => a + p.delta, 0);
  const spent = -pts.filter((p) => p.kind === "spend").reduce((a, p) => a + p.delta, 0);
  const customers = new Set(pts.filter((p) => p.kind === "earn").map((p) => p.customerId)).size;
  const uses = new Set(pts.map((p) => p.saleId).filter(Boolean)).size;
  return { customers, given, spent, discount: spent, uses };
}

export function CampaignList() {
  const s = useSp();
  const m = useM();
  const [pick, setPick] = useState(false);
  const { confirm, node } = useConfirm();
  if (m.can("campaigns") === "locked")
    return (
      <Screen nav={<NavBar large title="Урамшуулал" />}>
        <Locked module="campaigns" />
      </Screen>
    );

  const list = [...s.campaigns].sort((a, b) => Number(b.active) - Number(a.active) || b.createdAt.localeCompare(a.createdAt));
  const toggle = (c: Campaign, on: boolean) => {
    if (!on) {
      confirm({
        title: `«${c.name}»-г зогсоох уу?`,
        message: "Касс дээр шууд хэрэглэгдэхгүй болно. Олгосон оноо хэвээр үлдэнэ.",
        ok: "Зогсоох",
        destructive: true,
        run: () => {
          toggleCampaign(m.actor, c.id, false);
          toast("Урамшуулал зогслоо");
        },
      });
      return;
    }
    const other = c.type === "point" ? s.campaigns.find((x) => x.type === "point" && x.active && x.id !== c.id) : null;
    if (other) {
      confirm({
        title: "Оноо урамшууллыг солих уу?",
        message: `Нэг удаад нэг оноо урамшуулал ажиллана. «${other.name}» зогсож, «${c.name}» идэвхжинэ.`,
        ok: "Солих",
        run: () => {
          toggleCampaign(m.actor, other.id, false);
          toggleCampaign(m.actor, c.id, true);
          toast("Идэвхжлээ", "ok");
        },
      });
      return;
    }
    toggleCampaign(m.actor, c.id, true);
    toast("Идэвхжлээ", "ok");
  };

  return (
    <Screen nav={<NavBar large title="Урамшуулал" sub="Идэвхтэй нь дээрээ" trailing={<IconBtn name="plus" label="Шинэ урамшуулал" tone="plain" onClick={() => setPick(true)} />} />}>
      {list.length === 0 ? (
        <Empty icon="gift" title="Урамшуулал алга" body="Оноо цуглуулах эсвэл «3 авбал 1 үнэгүй» мэт урамшуулал үүсгэнэ үү." action={<Btn icon="plus" onClick={() => setPick(true)}>Шинэ урамшуулал</Btn>} />
      ) : (
        <Group className="pt-3">
          {list.map((c) => {
            const st = stateOf(c);
            const r = campaignResults(s, c);
            return (
              <div key={c.id} className="flex items-center gap-3 px-4 py-3">
                <button type="button" onClick={() => m.push({ k: "campaign", id: c.id })} className="sp-tap min-w-0 flex-1 text-left">
                  <span className="flex flex-wrap items-center gap-1.5">
                    <span className="truncate text-[16px] font-semibold text-ink">{c.name}</span>
                  </span>
                  <span className="mt-1 flex flex-wrap gap-1.5">
                    <Badge tone="accent" icon={c.type === "point" ? "star" : "gift"}>{c.type === "point" ? "Оноо" : "Бараа"}</Badge>
                    <Badge tone={st.tone} icon={st.tone === "ok" ? "check" : undefined}>{st.label}</Badge>
                  </span>
                  <span className="mt-1 block text-[13px] leading-snug text-mute">
                    {md(c.start)}–{md(c.end)} · {c.type === "item" ? scheduleText(c) : `${c.tiers.length} түвшин`} · {num(r.uses)} удаа
                  </span>
                </button>
                <Switch checked={c.active} onChange={(v) => toggle(c, v)} label={`${c.name} идэвхтэй`} />
              </div>
            );
          })}
        </Group>
      )}
      <p className="px-8 pt-2 text-[13px] leading-snug text-mute">Оноо + бараа урамшуулал давхар хэрэглэгдэнэ; давхцсан бараа урамшууллаас харилцагчид ашигтай нэг нь сонгогдоно.</p>

      <Sheet open={pick} onClose={() => setPick(false)} title="Шинэ урамшуулал">
        <Group className="pb-6 pt-2">
          <Row icon="star" iconTone="accent" title="Оноо (Point based)" sub="Худалдан авалт бүрт оноо, түвшин" chevron onClick={() => (setPick(false), m.push({ k: "campEdit", id: "new-point" }))} />
          <Row icon="gift" iconTone="accent" title="Бараа (Item based)" sub="N ширхэг авбал бараа эсвэл хямдрал" chevron onClick={() => (setPick(false), m.push({ k: "campEdit", id: "new-item" }))} />
        </Group>
      </Sheet>
      {node}
    </Screen>
  );
}

export function CampaignDetail({ id }: { id: string }) {
  const s = useSp();
  const m = useM();
  const { confirm, node } = useConfirm();
  const c = s.campaigns.find((x) => x.id === id);
  if (!c)
    return (
      <Screen nav={<NavBar onBack={m.pop} backLabel="Урамшуулал" />}>
        <Empty icon="gift" title="Урамшуулал олдсонгүй" />
      </Screen>
    );
  const r = campaignResults(s, c);
  const st = stateOf(c);
  const lim = [c.limitPerDay ? `өдөрт ${c.limitPerDay}` : "", c.limitPerCustomer ? `хүнд ${c.limitPerCustomer}` : "", c.limitTotal ? `нийт ${c.limitTotal}` : ""].filter(Boolean).join(" · ");

  return (
    <Screen
      nav={<NavBar onBack={m.pop} backLabel="Урамшуулал" title={c.type === "point" ? "Оноо урамшуулал" : "Бараа урамшуулал"} trailing={<Btn variant="plain" size="sm" onClick={() => m.push({ k: "campEdit", id: c.id })}>Засах</Btn>} />}
    >
      <div className="px-4 pt-4">
        <h1 className="text-[26px] font-bold leading-tight tracking-[-0.02em] text-ink">{c.name}</h1>
        <div className="mt-2 flex gap-1.5">
          <Badge tone={st.tone} icon={st.tone === "ok" ? "check" : undefined}>{st.label}</Badge>
          <Badge>
            {md(c.start)}–{md(c.end)}
          </Badge>
        </div>
      </div>

      <div className="mx-4 mt-4 grid grid-cols-2 gap-2">
        {(
          [
            ["Хамрагдсан харилцагч", num(r.customers)],
            ["Ашигласан", `${num(r.uses)} удаа`],
            c.type === "point" ? ["Олгосон оноо", num(r.given)] : ["Нийт хямдрал", money(r.discount)],
            c.type === "point" ? ["Зарцуулсан оноо", num(r.spent)] : ["Хэрэглэсэн дундаж", r.uses ? money(r.discount / r.uses) : "—"],
          ] as const
        ).map(([k, v]) => (
          <div key={k} className="rounded-[16px] bg-paper px-3.5 py-3">
            <div className="text-[12px] text-mute">{k}</div>
            <div className="mt-1 text-[20px] font-bold tracking-[-0.02em] text-ink tnum">{v}</div>
          </div>
        ))}
      </div>

      <Group header="Тохиргоо">
        <Row
          title="Идэвхтэй"
          trailing={
            <Switch
              checked={c.active}
              label="Идэвхтэй"
              onChange={(v) =>
                v
                  ? (toggleCampaign(m.actor, c.id, true), toast("Идэвхжлээ", "ok"))
                  : confirm({ title: "Урамшууллыг зогсоох уу?", message: "Касс дээр шууд хэрэглэгдэхгүй болно.", ok: "Зогсоох", destructive: true, run: () => toggleCampaign(m.actor, c.id, false) })
              }
            />
          }
        />
        {c.type === "point" ? (
          <>
            {[...c.tiers].sort((a, b) => a.points - b.points).map((t) => (
              <Row key={t.name} icon="star" title={t.name} value={`${num(t.points)} оноо`} />
            ))}
            <Row title="Онооны хугацаа" value={c.expiryMonths ? `${c.expiryMonths} сар${c.expiryNotify ? " · мэдэгдэнэ" : ""}` : "Хугацаагүй"} />
          </>
        ) : (
          <>
            <Row title="Нөхцөл" sub={`${c.productIds.map((p) => s.products.find((x) => x.id === p)?.name).filter(Boolean).join(", ")}`} value={`${c.qty} ш`} />
            <Row title="Шагнал" value={rewardText(c, s.products)} />
            <Row title="Хуваарь" value={scheduleText(c)} />
          </>
        )}
        <Row title="Хязгаар" value={lim || "Хязгааргүй"} />
      </Group>
      {node}
    </Screen>
  );
}

/* ───────── засварлагч ───────── */

const blankPoint = (): PointCampaign => ({
  id: uid("cmp"),
  type: "point",
  name: "",
  tiers: [
    { name: "Энгийн", points: 0 },
    { name: "Мөнгөн", points: 1000 },
  ],
  start: today(),
  end: plusDays(90),
  active: true,
  expiryMonths: 12,
  expiryNotify: true,
  createdAt: new Date().toISOString(),
});
const blankItem = (): ItemCampaign => ({
  id: uid("cmp"),
  type: "item",
  name: "",
  productIds: [],
  qty: 3,
  reward: { kind: "percent", value: 10 },
  start: today(),
  end: plusDays(30),
  days: [],
  from: "00:00",
  to: "23:59",
  active: true,
  uses: 0,
  createdAt: new Date().toISOString(),
});

const numIn = (v: string) => (v === "" ? undefined : Math.max(0, Math.floor(Number(v.replace(/\D/g, "")) || 0)));
const WEEK = [1, 2, 3, 4, 5, 6, 0];

export function CampaignEditor({ id }: { id: string }) {
  const s = useSp();
  const m = useM();
  const orig = s.campaigns.find((x) => x.id === id);
  const [c, setC] = useState<Campaign>(() => (orig ? structuredClone(orig) : id === "new-item" ? blankItem() : blankPoint()));
  const [err, setErr] = useState<string | null>(null);
  const [prodPick, setProdPick] = useState(false);
  const [q, setQ] = useState("");
  const isNew = !orig;
  const keyLocked = !!orig?.active;
  const set = (p: Partial<PointCampaign> | Partial<ItemCampaign>) => setC((x) => ({ ...x, ...p }) as Campaign);

  const save = () => {
    setErr(null);
    if (!c.name.trim()) return setErr("Нэр оруулна уу.");
    if (c.start > c.end) return setErr("Дуусах огноо эхлэхээс хойш байна.");
    if (c.type === "point") {
      if (c.tiers.length === 0 || c.tiers.some((t) => !t.name.trim())) return setErr("Түвшин бүрт нэр өгнө үү.");
    } else {
      if (!c.productIds.length) return setErr("Дор хаяж нэг бараа сонгоно уу.");
      if (c.qty < 1) return setErr("Авах тоо 1-ээс их байна.");
      if (c.reward.kind !== "product" && c.reward.value <= 0) return setErr("Шагналын хэмжээг оруулна уу.");
      if (c.reward.kind === "percent" && c.reward.value > 100) return setErr("Хувь 100-аас ихгүй.");
      if (c.from >= c.to) return setErr("Цагийн хуваарь буруу байна.");
    }
    try {
      const next = { ...c, name: c.name.trim() } as Campaign;
      // Шинэ оноо урамшуулал идэвхтэй бол бусад оноо урамшуулал зогсоно
      upsertCampaign(m.actor, next);
      if (next.type === "point" && next.active) s.campaigns.filter((x) => x.type === "point" && x.active && x.id !== next.id).forEach((x) => toggleCampaign(m.actor, x.id, false));
      toast(isNew ? "Урамшуулал үүслээ" : "Хадгаллаа", "ok");
      m.pop();
    } catch (e) {
      setErr(e instanceof SpError ? e.message : "Алдаа гарлаа");
    }
  };

  const lockNote = keyLocked && (
    <div className="px-4 pt-3">
      <Notice tone="gray" icon="lock">
        Идэвхтэй урамшууллын {c.type === "point" ? "түвшин" : "бараа, шагнал"}-ыг өөрчлөхгүй (BR05-9). Зогсоож засах эсвэл шинээр үүсгэнэ үү.
      </Notice>
    </div>
  );

  return (
    <Screen
      nav={<NavBar onBack={m.pop} backLabel="Буцах" title={isNew ? (c.type === "point" ? "Шинэ оноо урамшуулал" : "Шинэ бараа урамшуулал") : "Засах"} />}
      footer={
        <Btn block onClick={save}>
          {isNew ? "Үүсгэх" : "Хадгалах"}
        </Btn>
      }
    >
      {lockNote}
      <div className="px-4 pt-4">
        <Field label="Нэр *">
          <input className="sp-field" value={c.name} onChange={(e) => set({ name: e.target.value })} placeholder={c.type === "point" ? "Жишээ: Гишүүнчлэл" : "Жишээ: Кока-Кола 3+1"} name="cname" />
        </Field>
      </div>

      {c.type === "point" ? (
        <Group header="Түвшин" footer="Нийт цуглуулсан оноогоор түвшин ахина. 1 оноо = 1₮.">
          {c.tiers.map((t, i) => (
            <div key={i} className="flex items-center gap-2 px-3 py-2">
              <input
                className="sp-field !h-11 min-w-0 flex-1 !w-auto"
                disabled={keyLocked}
                value={t.name}
                onChange={(e) => set({ tiers: c.tiers.map((x, k) => (k === i ? { ...x, name: e.target.value } : x)) })}
                placeholder="Нэр"
                aria-label="Түвшний нэр"
              />
              <input
                className="sp-field !h-11 !w-[96px] shrink-0 text-right tnum"
                disabled={keyLocked}
                inputMode="numeric"
                value={t.points}
                onChange={(e) => set({ tiers: c.tiers.map((x, k) => (k === i ? { ...x, points: numIn(e.target.value) ?? 0 } : x)) })}
                aria-label="Босго оноо"
              />
              <IconBtn name="minus" label="Түвшин хасах" size={36} className={cx("text-danger", (keyLocked || c.tiers.length <= 1) && "pointer-events-none opacity-30")} onClick={() => set({ tiers: c.tiers.filter((_, k) => k !== i) })} />
            </div>
          ))}
          {!keyLocked && <Row icon="plus" iconTone="accent" title={<span className="text-accent">Түвшин нэмэх</span>} onClick={() => set({ tiers: [...c.tiers, { name: "", points: (c.tiers.at(-1)?.points ?? 0) + 1000 }] })} />}
        </Group>
      ) : (
        <>
          <Group header="Нөхцөл">
            <Row title="Бараа" value={c.productIds.length ? `${c.productIds.length} сонгосон` : "Сонгох"} chevron={!keyLocked} onClick={keyLocked ? undefined : () => setProdPick(true)} />
            <Row
              title="Авах тоо"
              trailing={
                <div className="flex items-center gap-2">
                  <IconBtn name="minus" label="Хасах" size={36} className={keyLocked ? "pointer-events-none opacity-30" : ""} onClick={() => set({ qty: Math.max(1, c.qty - 1) })} />
                  <span className="w-8 text-center text-[17px] font-semibold text-ink tnum">{c.qty}</span>
                  <IconBtn name="plus" label="Нэмэх" size={36} className={keyLocked ? "pointer-events-none opacity-30" : ""} onClick={() => set({ qty: c.qty + 1 })} />
                </div>
              }
            />
          </Group>
          {c.productIds.length > 0 && (
            <p className="px-8 pt-1.5 text-[13px] leading-snug text-mute">{c.productIds.map((p) => s.products.find((x) => x.id === p)?.name).filter(Boolean).join(", ")}</p>
          )}
          <Group header="Шагнал">
            <div className="space-y-3 p-3">
              <Segmented
                value={c.reward.kind}
                onChange={(k) => {
                  if (keyLocked) return;
                  const r: ItemReward = k === "product" ? { kind: "product", productId: c.productIds[0] ?? s.products[0].id, qty: 1 } : { kind: k, value: k === "percent" ? 10 : 1000 };
                  set({ reward: r });
                }}
                options={[
                  { id: "product", label: "Бараа" },
                  { id: "percent", label: "%" },
                  { id: "amount", label: "₮" },
                ]}
              />
              {c.reward.kind === "product" ? (
                <div className="grid grid-cols-[1fr_88px] gap-2">
                  <select className="sp-field" disabled={keyLocked} value={c.reward.productId} onChange={(e) => set({ reward: { kind: "product", productId: e.target.value, qty: (c.reward as { qty: number }).qty } })} aria-label="Шагнал бараа">
                    {s.products.filter((p) => p.active).map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                  <input className="sp-field tnum" disabled={keyLocked} inputMode="numeric" value={c.reward.qty} onChange={(e) => set({ reward: { ...(c.reward as { kind: "product"; productId: string; qty: number }), qty: Math.max(1, numIn(e.target.value) ?? 1) } })} aria-label="Үнэгүй тоо" />
                </div>
              ) : (
                <input
                  className="sp-field tnum"
                  disabled={keyLocked}
                  inputMode="numeric"
                  value={c.reward.value}
                  onChange={(e) => set({ reward: { kind: c.reward.kind as "percent" | "amount", value: numIn(e.target.value) ?? 0 } })}
                  aria-label={c.reward.kind === "percent" ? "Хямдрал %" : "Хямдрал ₮"}
                />
              )}
              <p className="text-[13px] text-mute">
                {c.qty} ширхэг авбал → {rewardText(c, s.products)}
              </p>
            </div>
          </Group>
          <Group header="Хуваарь" footer="Гараг сонгоогүй бол өдөр бүр. Касс дээр гүйлгээ хийх мөчид шалгана.">
            <div className="flex justify-between gap-1 p-3">
              {WEEK.map((d) => {
                const on = c.days.includes(d);
                return (
                  <button
                    key={d}
                    type="button"
                    aria-pressed={on}
                    onClick={() => set({ days: on ? c.days.filter((x) => x !== d) : [...c.days, d] })}
                    className={cx("sp-tap grid size-11 place-items-center rounded-full text-[14px] font-semibold", on ? "bg-accent text-white" : "bg-[var(--sp-fill)] text-ink")}
                  >
                    {DAY_LABEL[d]}
                  </button>
                );
              })}
            </div>
            <div className="grid grid-cols-2 gap-2 px-3 pb-3">
              <Field label="Эхлэх цаг">
                <input type="time" className="sp-field tnum" value={c.from} onChange={(e) => set({ from: e.target.value })} />
              </Field>
              <Field label="Дуусах цаг">
                <input type="time" className="sp-field tnum" value={c.to} onChange={(e) => set({ to: e.target.value })} />
              </Field>
            </div>
          </Group>
        </>
      )}

      <Group header="Хугацаа">
        <div className="grid grid-cols-2 gap-2 p-3">
          <Field label="Эхлэх">
            <input type="date" className="sp-field tnum" value={c.start} onChange={(e) => set({ start: e.target.value })} />
          </Field>
          <Field label="Дуусах">
            <input type="date" className="sp-field tnum" value={c.end} onChange={(e) => set({ end: e.target.value })} />
          </Field>
        </div>
        {c.type === "point" && (
          <>
            <div className="flex items-center gap-3 px-4 py-2.5">
              <span className="flex-1 text-[16px] text-ink">Онооны хугацаа</span>
              <select className="sp-field !h-10 !w-[150px]" value={c.expiryMonths} onChange={(e) => set({ expiryMonths: Number(e.target.value) })} aria-label="Онооны хугацаа">
                {[0, 3, 6, 12, 24].map((v) => (
                  <option key={v} value={v}>
                    {v ? `${v} сар` : "Хугацаагүй"}
                  </option>
                ))}
              </select>
            </div>
            <Row title="Дуусахаас өмнө мэдэгдэх" sub="Харилцагчид SMS / Wallet-аар" trailing={<Switch checked={!!c.expiryNotify} onChange={(v) => set({ expiryNotify: v })} label="Мэдэгдэх" />} />
          </>
        )}
      </Group>

      <Group header="Хязгаар" footer="Хоосон бол хязгааргүй.">
        {(
          [
            ["limitPerDay", "Нэг хүнд өдөрт"],
            ["limitPerCustomer", "Нэг хүнд нийт"],
            ["limitTotal", "Нийт удаа"],
          ] as const
        ).map(([k, label]) => (
          <div key={k} className="flex items-center gap-3 px-4 py-2">
            <span className="flex-1 text-[16px] text-ink">{label}</span>
            <input
              className="sp-field !h-10 !w-[110px] text-right tnum"
              inputMode="numeric"
              placeholder="∞"
              value={(c as { [key: string]: unknown })[k] === undefined ? "" : String((c as { [key: string]: unknown })[k])}
              onChange={(e) => set({ [k]: numIn(e.target.value) || undefined } as Partial<ItemCampaign>)}
              aria-label={label}
            />
          </div>
        ))}
      </Group>

      <Group className="mt-5">
        <Row title="Шууд идэвхжүүлэх" sub={c.type === "point" ? "Нэг удаад нэг оноо урамшуулал ажиллана" : undefined} trailing={<Switch checked={c.active} onChange={(v) => set({ active: v })} label="Идэвхтэй" />} />
      </Group>
      {err && (
        <div className="px-4 pt-3">
          <Notice tone="danger">{err}</Notice>
        </div>
      )}

      {c.type === "item" && (
        <Sheet open={prodPick} onClose={() => setProdPick(false)} title="Бараа сонгох" full trailing={<Btn variant="plain" size="sm" onClick={() => setProdPick(false)}>Болсон</Btn>}>
          <div className="px-4 pt-1">
            <SearchField value={q} onChange={setQ} placeholder="Бараа хайх" />
          </div>
          <Group className="pb-6 pt-3">
            {s.products
              .filter((p) => p.active && (!q || p.name.toLowerCase().includes(q.toLowerCase())))
              .map((p) => {
                const on = c.productIds.includes(p.id);
                return (
                  <Row
                    key={p.id}
                    title={p.name}
                    sub={money(p.price)}
                    trailing={
                      <span className={cx("grid size-6 place-items-center rounded-full", on ? "bg-accent text-white" : "shadow-[inset_0_0_0_1.5px_var(--line)]")}>{on && <Icon name="check" size={15} stroke={2.6} />}</span>
                    }
                    onClick={() => set({ productIds: on ? c.productIds.filter((x) => x !== p.id) : [...c.productIds, p.id] })}
                  />
                );
              })}
          </Group>
        </Sheet>
      )}
    </Screen>
  );
}

