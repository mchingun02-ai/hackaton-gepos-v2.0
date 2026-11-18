"use client";

/* Бусад — товч тайлан, миний бүртгэл, багц, ажилтан, сэдэв, гарах (7.2, BR02, BR08) */

import { useMemo, useState } from "react";
import { DAY_LABEL, lowStock, money, num, PLAN_LABEL, PLAN_MODULES, salesTotals, startOfDay, staffName } from "@/lib/sp/logic";
import { setPlan, SpError, updateDelivery, updateMerchant, upsertStaff, uid, useSp } from "@/lib/sp/store";
import type { Plan, Staff } from "@/lib/sp/types";
import { Avatar, Badge, Btn, cx, Empty, Field, Group, IconBtn, NavBar, Notice, Row, Segmented, Sheet, Switch, toast, useConfirm, useTheme } from "@/components/sp/ui";
import { Icon } from "@/components/sp/icons";
import { Screen, short, useM } from "./core";

export function More() {
  const s = useSp();
  const m = useM();
  const { theme, toggle } = useTheme();
  const { confirm, node } = useConfirm();
  const acc = m.can("account");
  const low = lowStock(s).length;
  return (
    <Screen nav={<NavBar large title="Бусад" />}>
      <Group className="pt-2">
        <Row
          title={<b className="font-semibold">{s.merchant.name}</b>}
          sub={m.staff ? `${staffName(m.staff)} · ${m.role?.name ?? ""}` : "Мерчант админ"}
          trailing={<Badge tone="accent">{PLAN_LABEL[s.merchant.plan]}</Badge>}
        />
      </Group>
      {(m.can("reports") !== "hidden" || m.can("products") !== "hidden") && (
        <Group header="Борлуулалт">
          {m.can("reports") !== "hidden" && <Row icon="chart" iconTone="accent" title="Тайлан" chevron onClick={() => m.push({ k: "reports" })} />}
          {m.can("products") !== "hidden" && (
            <Row icon="box" iconTone="accent" title="Бараа" trailing={low ? <Badge tone="warn">{low} нөөц бага</Badge> : undefined} chevron onClick={() => m.push({ k: "products" })} />
          )}
        </Group>
      )}
      {(m.can("marketing") !== "hidden" || m.can("wallet") !== "hidden") && (
        <Group header="Харилцагч">
          {m.can("marketing") !== "hidden" && <Row icon="megaphone" iconTone="accent" title="Маркетинг SMS" sub="Сегмент, текст, төлбөр" chevron onClick={() => m.push({ k: "marketing" })} />}
          {m.can("wallet") !== "hidden" && (
            <Row
              icon="wallet"
              iconTone="accent"
              title="Wallet карт"
              trailing={m.can("wallet") === "locked" ? <Icon name="lock" size={16} className="text-mute" /> : undefined}
              value={m.can("wallet") === "ok" ? `${s.customers.filter((c) => c.passSerial && !c.erased).length} олгосон` : undefined}
              chevron
              onClick={() => m.push({ k: "wallet" })}
            />
          )}
        </Group>
      )}
      {(acc !== "hidden" || (m.can("delivery") === "ok" && m.manage)) && (
        <Group header="Тохиргоо" footer={m.can("delivery") === "ok" && m.manage && !s.delivery.enabled ? "Захиалгын хуудас «одоогоор захиалга авахгүй» гэж харагдаж байна." : undefined}>
          {m.can("delivery") === "ok" && m.manage && (
            <Row
              icon="truck"
              title="Онлайн захиалга авах"
              trailing={
                <Switch
                  checked={s.delivery.enabled}
                  label="Онлайн захиалга авах"
                  onChange={(v) =>
                    v
                      ? (updateDelivery(m.actor, { ...s.delivery, enabled: true }), toast("Захиалга авч эхэллээ", "ok"))
                      : confirm({
                          title: "Онлайн захиалгыг түр хаах уу?",
                          message: "Захиалгын хуудсаар шинэ захиалга ирэхгүй. Одоо байгаа захиалга хэвээр.",
                          ok: "Хаах",
                          destructive: true,
                          run: () => updateDelivery(m.actor, { ...s.delivery, enabled: false }),
                        })
                  }
                />
              }
            />
          )}
          {acc !== "hidden" && (
            <>
              <Row icon="id" iconTone="accent" title="Миний бүртгэл" chevron onClick={() => m.push({ k: "account" })} />
              <Row icon="star" iconTone="accent" title="Багц" value={PLAN_LABEL[s.merchant.plan]} chevron onClick={() => m.push({ k: "plans" })} />
              <Row icon="people" iconTone="accent" title="Ажилтан" value={s.staff.filter((x) => x.active).length} chevron onClick={() => m.push({ k: "staff" })} />
            </>
          )}
        </Group>
      )}
      <Group className="mt-5">
        <Row icon={theme === "dark" ? "moon" : "sun"} title="Харанхуй горим" trailing={<Switch checked={theme === "dark"} onChange={toggle} label="Харанхуй горим" />} />
      </Group>
      <Group className="mt-5" footer="Бараа, урамшуулал, хүргэлтийн тохиргоо, бүрэн тайлан — Merchant portal дээр.">
        <Row
          icon="logout"
          iconTone="danger"
          title="Гарах"
          destructive
          onClick={() => confirm({ title: "Аппаас гарах уу?", ok: "Гарах", destructive: true, run: m.logout })}
        />
      </Group>
      {node}
    </Screen>
  );
}

/* ───────── тайлан ───────── */

type Range = "today" | "week" | "month";

export function Reports() {
  const s = useSp();
  const m = useM();
  const [r, setR] = useState<Range>("week");
  const [hover, setHover] = useState<number | null>(null);
  const now = useMemo(() => new Date(), []);

  const days = r === "today" ? 1 : r === "week" ? 7 : 30;
  const from = startOfDay(new Date(now.getTime() - (days - 1) * 86400000));
  const prevFrom = new Date(from.getTime() - days * 86400000);
  const prevTo = new Date(now.getTime() - days * 86400000);
  const all = salesTotals(s, from, now);
  const prev = salesTotals(s, prevFrom, prevTo);
  const pos = salesTotals(s, from, now, "pos");
  const del = salesTotals(s, from, now, "delivery");
  const diff = prev.total ? Math.round(((all.total - prev.total) / prev.total) * 100) : null;
  const ok = all.list.filter((x) => !x.refund);

  // Баганууд: өнөөдөр — цагаар, бусад — өдрөөр
  const bars = useMemo(() => {
    if (r === "today") {
      const hours = Array.from({ length: now.getHours() + 1 }, (_, h) => ({ label: `${h}`, v: 0 }));
      ok.forEach((x) => (hours[new Date(x.at).getHours()].v += x.total));
      return hours.slice(Math.max(0, hours.length - 14));
    }
    const out = Array.from({ length: days }, (_, i) => {
      const d = new Date(from.getTime() + i * 86400000);
      return { label: days === 7 ? DAY_LABEL[d.getDay()] : String(d.getDate()), v: 0, key: d.toDateString() };
    });
    ok.forEach((x) => {
      const b = out.find((o) => o.key === new Date(x.at).toDateString());
      if (b) b.v += x.total;
    });
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [r, s.sales]);
  const max = Math.max(1, ...bars.map((b) => b.v));

  const top = new Map<string, { name: string; qty: number; sum: number }>();
  ok.forEach((x) =>
    x.lines.forEach((l) => {
      if (!l.productId || l.free) return;
      const t = top.get(l.productId) ?? { name: l.name, qty: 0, sum: 0 };
      t.qty += l.qty;
      t.sum += l.qty * l.price;
      top.set(l.productId, t);
    }),
  );
  const topList = [...top.values()].sort((a, b) => b.sum - a.sum).slice(0, 5);

  const cash = new Map<string, { count: number; sum: number }>();
  pos.list.filter((x) => !x.refund).forEach((x) => {
    const c = cash.get(x.staffId) ?? { count: 0, sum: 0 };
    c.count += 1;
    c.sum += x.total;
    cash.set(x.staffId, c);
  });
  const inRange = (iso: string) => new Date(iso) >= from && new Date(iso) <= now;
  const smsMk = s.sms.filter((c) => inRange(c.at)).reduce((a, c) => a + c.cost, 0);
  const smsDel = s.smsLog.filter((c) => c.kind === "delivery" && inRange(c.at)).reduce((a, c) => a + c.cost, 0);
  const label = r === "today" ? "Өчигдрийн энэ цагаас" : r === "week" ? "Өмнөх 7 хоногоос" : "Өмнөх 30 хоногоос";

  return (
    <Screen nav={<NavBar onBack={m.pop} backLabel="Бусад" title="Тайлан" />}>
      <div className="px-4 pt-3">
        <Segmented
          value={r}
          onChange={(v) => {
            setR(v);
            setHover(null);
          }}
          options={[
            { id: "today", label: "Өнөөдөр" },
            { id: "week", label: "7 хоног" },
            { id: "month", label: "Сар" },
          ]}
        />
      </div>
      <section className="mx-4 mt-3 rounded-[var(--sp-r-group)] bg-paper p-4">
        <div className="text-[14px] text-mute">Борлуулалт{hover !== null ? ` · ${bars[hover].label}${r === "today" ? " цаг" : ""}` : ""}</div>
        <div className="mt-1 text-[32px] font-bold tracking-[-0.03em] text-ink tnum">{hover !== null ? money(bars[hover].v) : short(all.total)}</div>
        {diff !== null && hover === null && (
          <div className={`mt-1 text-[14px] font-semibold ${diff >= 0 ? "text-ok" : "text-danger"}`}>
            {diff >= 0 ? "↑" : "↓"} {label} {Math.abs(diff)}% {diff >= 0 ? "их" : "бага"}
          </div>
        )}
        <div className="mt-4 flex h-[120px] items-end gap-[2px] border-b border-[var(--sp-sep)]" role="img" aria-label="Борлуулалтын график" onPointerLeave={() => setHover(null)}>
          {bars.map((b, i) => (
            <button
              key={i}
              type="button"
              aria-label={`${b.label}: ${money(b.v)}`}
              onPointerEnter={() => setHover(i)}
              onClick={() => setHover(hover === i ? null : i)}
              className="flex h-full min-w-0 flex-1 items-end"
            >
              <span
                className={cx("block w-full rounded-t-[4px] transition-opacity", hover !== null && hover !== i ? "bg-accent opacity-40" : "bg-accent")}
                style={{ height: `${Math.max(b.v ? 3 : 0, (b.v / max) * 100)}%` }}
              />
            </button>
          ))}
        </div>
        <div className="mt-1.5 flex gap-[2px] text-[11px] text-mute">
          {bars.map((b, i) => (
            <span key={i} className="min-w-0 flex-1 text-center">
              {bars.length > 14 ? (i % 5 === 0 ? b.label : "") : b.label}
            </span>
          ))}
        </div>
      </section>

      <Group className="mt-3">
        <Row title="Дэлгүүрт" sub={`${pos.count} гүйлгээ`} value={<b className="font-semibold text-ink">{money(pos.total)}</b>} />
        <Row title="Хүргэлт" sub={`${del.count} гүйлгээ`} value={<b className="font-semibold text-ink">{money(del.total)}</b>} />
        <Row title="Дундаж чек" value={money(all.avg)} />
        {all.refunds > 0 && <Row title="Буцаалт" value={`${all.refunds}`} />}
      </Group>

      <Group header="Их зарагдсан бараа">
        {topList.length === 0 ? <Row title="Борлуулалт алга" /> : topList.map((t, i) => <Row key={t.name} title={`${i + 1}. ${t.name}`} sub={`${num(t.qty)} ш`} value={money(t.sum)} />)}
      </Group>

      <Group header="Кассчин тус бүр">
        {cash.size === 0 ? (
          <Row title="Дэлгүүрийн борлуулалт алга" />
        ) : (
          [...cash.entries()]
            .sort((a, b) => b[1].sum - a[1].sum)
            .map(([id, c]) => <Row key={id} title={staffName(s.staff.find((x) => x.id === id))} sub={`${c.count} гүйлгээ`} value={money(c.sum)} />)
        )}
      </Group>

      <Group header="SMS зардал" footer="Экспорт, тохиргооны лог, Ebarimt тулгалт — Merchant portal дээр.">
        <Row title="Маркетинг SMS" value={money(smsMk)} />
        <Row title="Хүргэлтийн SMS" value={money(smsDel)} />
      </Group>
    </Screen>
  );
}

/* ───────── миний бүртгэл ───────── */

export function Account() {
  const s = useSp();
  const m = useM();
  const [edit, setEdit] = useState<null | "phone" | "email">(null);
  const [v, setV] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const open = (k: "phone" | "email") => {
    setEdit(k);
    setV(k === "phone" ? s.merchant.phone : s.merchant.email);
    setErr(null);
  };
  const save = () => {
    if (edit === "phone") {
      if (!/^\d{8}$/.test(v)) return setErr("8 оронтой дугаар оруулна уу.");
      updateMerchant(m.actor, { phone: v });
    } else {
      if (!/^\S+@\S+\.\S+$/.test(v)) return setErr("Имэйл хаяг буруу байна.");
      updateMerchant(m.actor, { email: v });
    }
    toast("Хадгаллаа", "ok");
    setEdit(null);
  };
  return (
    <Screen nav={<NavBar onBack={m.pop} backLabel="Бусад" title="Миний бүртгэл" />}>
      <Group header="eID-ээс баталгаажсан" footer="Эдгээр мэдээлэл eID-ээс автоматаар орсон тул засах боломжгүй. Нэвтрэлт зөвхөн eID-ээр.">
        {Object.entries(s.merchant.kyc).map(([k, val]) => (
          <Row key={k} title={<span className="text-[13px] text-mute">{k}</span>} sub={<span className="text-[15px] text-ink">{val}</span>} trailing={<Icon name="lock" size={15} className="text-mute" />} />
        ))}
      </Group>
      <Group header="Холбоо барих">
        <Row title="Утас" value={s.merchant.phone} chevron onClick={() => open("phone")} />
        <Row title="Имэйл" value={s.merchant.email} chevron onClick={() => open("email")} />
      </Group>
      <Sheet
        open={!!edit}
        onClose={() => setEdit(null)}
        title={edit === "phone" ? "Утас" : "Имэйл"}
        footer={
          <Btn block onClick={save}>
            Хадгалах
          </Btn>
        }
      >
        <div className="space-y-4 px-4 pb-4 pt-3">
          <Field label={edit === "phone" ? "Утасны дугаар" : "Имэйл хаяг"}>
            <input className="sp-field" inputMode={edit === "phone" ? "numeric" : "email"} value={v} onChange={(e) => setV(edit === "phone" ? e.target.value.replace(/\D/g, "").slice(0, 8) : e.target.value)} />
          </Field>
          {err && <Notice tone="danger">{err}</Notice>}
        </div>
      </Sheet>
    </Screen>
  );
}

/* ───────── багц ───────── */

const PLANS: { id: Plan; perks: string[] }[] = [
  { id: "basic", perks: ["Касс, бараа, нөөц", "Харилцагчийн бүртгэл (CRM)", "Маркетинг SMS", "Тайлан"] },
  { id: "plus", perks: ["Basic-ийн бүх боломж", "Хүргэлт ба захиалгын веб хуудас", "Оноо, бараагаар урамшуулал"] },
  { id: "premium", perks: ["Plus-ийн бүх боломж", "Apple, Google Wallet карт"] },
];
const RANK: Record<Plan, number> = { basic: 0, plus: 1, premium: 2 };

export function Plans() {
  const s = useSp();
  const m = useM();
  const { confirm, node } = useConfirm();
  const cur = s.merchant.plan;
  const canEdit = m.can("account") === "ok";
  return (
    <Screen nav={<NavBar onBack={m.pop} backLabel="Буцах" title="Багц" />}>
      <p className="px-6 pt-3 text-[14px] leading-snug text-mute">Багцаа хүссэн үедээ солино. Багц бууруулахад өгөгдөл устахгүй — дахин дээшлүүлэхэд хэвээр байна.</p>
      <div className="space-y-3 px-4 pt-3">
        {PLANS.map((p) => {
          const on = p.id === cur;
          const up = RANK[p.id] > RANK[cur];
          return (
            <section key={p.id} className={cx("rounded-[var(--sp-r-group)] bg-paper p-4", on && "shadow-[inset_0_0_0_2px_var(--accent)]")}>
              <div className="flex items-center justify-between">
                <h3 className="text-[20px] font-bold tracking-[-0.02em] text-ink">{PLAN_LABEL[p.id]}</h3>
                {on && <Badge tone="accent" icon="check">Одоогийн</Badge>}
              </div>
              <ul className="mt-2 space-y-1.5">
                {p.perks.map((x) => (
                  <li key={x} className="flex gap-2 text-[15px] text-ink">
                    <Icon name="check" size={17} stroke={2.2} className="mt-0.5 text-ok" />
                    {x}
                  </li>
                ))}
              </ul>
              {!on && canEdit && (
                <Btn
                  block
                  size="md"
                  variant={up ? (RANK[p.id] - RANK[cur] === 1 ? "filled" : "tinted") : "gray"}
                  className="mt-3"
                  onClick={() =>
                    confirm({
                      title: `${PLAN_LABEL[p.id]} багц руу ${up ? "шилжих" : "буурах"} уу?`,
                      message: up
                        ? "Шинэ цэсүүд шууд нээгдэнэ."
                        : `${PLAN_MODULES[cur].filter((x) => !PLAN_MODULES[p.id].includes(x)).length} цэс түгжигдэнэ. Өгөгдөл устахгүй, дахин дээшлүүлэхэд хэвээр байна.`,
                      ok: up ? "Шилжих" : "Буурах",
                      destructive: !up,
                      run: () => {
                        setPlan(m.actor, p.id);
                        toast(`${PLAN_LABEL[p.id]} багц идэвхжлээ`, "ok");
                      },
                    })
                  }
                >
                  {up ? `${PLAN_LABEL[p.id]} руу шилжих` : `${PLAN_LABEL[p.id]} руу буурах`}
                </Btn>
              )}
            </section>
          );
        })}
      </div>
      {!canEdit && <p className="px-6 pt-3 text-[13px] text-mute">Багц солихыг мерчантын админаас хүснэ үү.</p>}
      {node}
    </Screen>
  );
}

/* ───────── ажилтан ───────── */

const blank = (): Staff => ({ id: uid("st"), first: "", last: "", phone: "", address: "", email: "", roleId: "cashier", pin: String(Math.floor(1000 + Math.random() * 9000)), active: true });

export function StaffList() {
  const s = useSp();
  const m = useM();
  const [edit, setEdit] = useState<Staff | null>(null);
  const [isNew, setIsNew] = useState(false);
  const roleName = (id: string) => s.roles.find((r) => r.id === id)?.name ?? id;
  const list = [...s.staff].sort((a, b) => Number(b.active) - Number(a.active));
  return (
    <Screen
      nav={
        <NavBar
          onBack={m.pop}
          backLabel="Бусад"
          title="Ажилтан"
          trailing={
            <IconBtn
              name="plus"
              label="Ажилтан нэмэх"
              tone="plain"
              onClick={() => {
                setIsNew(true);
                setEdit(blank());
              }}
            />
          }
        />
      }
    >
      {list.length === 0 ? (
        <Empty icon="people" title="Ажилтан алга" body="Касс, хүргэлтийн ажилтнаа нэмж эрх олгоно уу." />
      ) : (
        <Group className="pt-3" footer="Дор хаяж нэг идэвхтэй Админ үлдэнэ. Ажилтан апп, порталд өөрийн eID-ээр, пос дээр PIN-ээр нэвтэрнэ.">
          {list.map((x) => (
            <button
              key={x.id}
              type="button"
              onClick={() => {
                setIsNew(false);
                setEdit({ ...x });
              }}
              className={cx("sp-row flex min-h-[60px] w-full items-center gap-3 px-4 py-2.5 text-left", !x.active && "opacity-55")}
            >
              <Avatar text={`${x.last[0] ?? ""}${x.first[0] ?? ""}`} size={40} tone={x.roleId === "admin" ? "accent" : "gray"} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[16px] text-ink">{staffName(x)}</span>
                <span className="block text-[13px] text-mute">
                  {roleName(x.roleId)} · {x.phone}
                </span>
              </span>
              {!x.active && <Badge>Идэвхгүй</Badge>}
              <Icon name="chevron" size={17} stroke={2.2} className="text-[var(--line)]" />
            </button>
          ))}
        </Group>
      )}
      <StaffSheet st={edit} isNew={isNew} onClose={() => setEdit(null)} />
    </Screen>
  );
}

function StaffSheet({ st, isNew, onClose }: { st: Staff | null; isNew: boolean; onClose: () => void }) {
  const s = useSp();
  const m = useM();
  const { confirm, node } = useConfirm();
  const [f, setF] = useState<Staff | null>(st);
  const [err, setErr] = useState<string | null>(null);
  const [was, setWas] = useState(st);
  if (st !== was) {
    setWas(st);
    setF(st);
    setErr(null);
  }
  const orig = st && s.staff.find((x) => x.id === st.id);

  const commit = (next: Staff, msg: string) => {
    try {
      upsertStaff(m.actor, next);
      toast(msg, "ok");
      onClose();
    } catch (e) {
      setErr(e instanceof SpError ? e.message : "Алдаа гарлаа");
    }
  };
  const save = () => {
    if (!f) return;
    if (!f.first.trim() || !f.last.trim()) return setErr("Нэр, овгоо оруулна уу.");
    if (!/^\d{8}$/.test(f.phone)) return setErr("Утас 8 оронтой байна.");
    if (!/^\d{4}$/.test(f.pin)) return setErr("PIN 4 оронтой байна.");
    if (f.regNo && !/^[А-ЯӨҮЁ]{2}\d{8}$/.test(f.regNo)) return setErr("Регистрийн дугаар 2 үсэг, 8 тоо байна.");
    if (s.staff.some((x) => x.id !== f.id && x.active && x.pin === f.pin)) return setErr("Энэ PIN өөр ажилтанд олгогдсон байна.");
    const next = { ...f, first: f.first.trim(), last: f.last.trim() };
    if (orig && orig.roleId !== f.roleId) {
      const rn = (id: string) => s.roles.find((r) => r.id === id)?.name;
      confirm({ title: "Эрх солих уу?", message: `${staffName(f)}: ${rn(orig.roleId)} → ${rn(f.roleId)}`, ok: "Солих", run: () => commit(next, "Эрх солигдлоо") });
      return;
    }
    commit(next, isNew ? "Ажилтан нэмэгдлээ" : "Хадгаллаа");
  };
  const set = (p: Partial<Staff>) => f && setF({ ...f, ...p });

  return (
    <>
    <Sheet
      open={!!st}
      onClose={onClose}
      full
      title={isNew ? "Шинэ ажилтан" : "Ажилтан"}
      footer={
        <Btn block onClick={save}>
          {isNew ? "Нэмэх" : "Хадгалах"}
        </Btn>
      }
    >
      {f && (
        <div className="space-y-3.5 px-4 pb-4 pt-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Нэр *">
              <input className="sp-field" value={f.first} onChange={(e) => set({ first: e.target.value })} name="sfirst" />
            </Field>
            <Field label="Овог *">
              <input className="sp-field" value={f.last} onChange={(e) => set({ last: e.target.value })} name="slast" />
            </Field>
          </div>
          <Field label="Утас *">
            <input className="sp-field tnum" inputMode="numeric" value={f.phone} onChange={(e) => set({ phone: e.target.value.replace(/\D/g, "").slice(0, 8) })} name="sphone" />
          </Field>
          <Field label="Регистрийн дугаар" hint="Апп, порталд eID-ээр нэвтрэхэд хэрэгтэй.">
            <input className="sp-field uppercase" value={f.regNo ?? ""} onChange={(e) => set({ regNo: e.target.value.toUpperCase().replace(/\s/g, "").slice(0, 10) || undefined })} placeholder="УБ85032114" name="sreg" />
          </Field>
          <Field label="Эрх *">
            <select className="sp-field" value={f.roleId} onChange={(e) => set({ roleId: e.target.value })} name="srole">
              {s.roles.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Пос PIN *" hint="Пос дээр нэвтрэх 4 оронтой код. Ажилтанд өөрт нь хэлнэ.">
            <input className="sp-field tnum" inputMode="numeric" value={f.pin} onChange={(e) => set({ pin: e.target.value.replace(/\D/g, "").slice(0, 4) })} name="spin" />
          </Field>
          <Field label="Хаяг">
            <input className="sp-field" value={f.address ?? ""} onChange={(e) => set({ address: e.target.value })} />
          </Field>
          <Field label="Имэйл">
            <input className="sp-field" inputMode="email" value={f.email ?? ""} onChange={(e) => set({ email: e.target.value })} />
          </Field>
          {err && <Notice tone="danger">{err}</Notice>}
          {!isNew && orig && (
            <Btn
              block
              variant={orig.active ? "dangerTinted" : "tinted"}
              size="md"
              onClick={() =>
                orig.active
                  ? confirm({
                      title: `${staffName(orig)}-г идэвхгүй болгох уу?`,
                      message: "Пос, апп-д нэвтрэх эрх нь хаагдана. Түүх хадгалагдана.",
                      ok: "Идэвхгүй болгох",
                      destructive: true,
                      run: () => commit({ ...orig, active: false }, "Идэвхгүй боллоо"),
                    })
                  : commit({ ...orig, active: true }, "Идэвхжлээ")
              }
            >
              {orig.active ? "Идэвхгүй болгох" : "Дахин идэвхжүүлэх"}
            </Btn>
          )}
        </div>
      )}
    </Sheet>
    {node}
    </>
  );
}
