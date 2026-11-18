"use client";

/* Харилцагч (CRM) — жагсаалт, гараар бүртгэх, дэлгэрэнгүй түүх, оноо, opt-in, устгах (BR06, US12) */

import { useState } from "react";
import { activePointCampaign, customerStats, dateShort, fmtPhone, hhmm, isToday, money, PLAN_MODULES, rankedCustomers, tierOf } from "@/lib/sp/logic";
import { addCustomer, adjustPoints, eraseCustomer, SpError, updateCustomer, useSp } from "@/lib/sp/store";
import type { PointEntry } from "@/lib/sp/types";
import { Avatar, Badge, Btn, Empty, Field, Group, IconBtn, NavBar, Row, SearchField, Segmented, Sheet, Switch, toast, useConfirm } from "@/components/sp/ui";
import { Icon } from "@/components/sp/icons";
import { linesText, Screen, short, useM } from "./core";

const avatarText = (name?: string, phone?: string) => {
  if (!name) return (phone ?? "").slice(-2);
  const parts = name.split(/[.\s]+/).filter(Boolean);
  return parts.map((p) => p[0]).join("").slice(0, 2).toUpperCase();
};

const SOURCE = { delivery: "хүргэлтээр", pos: "касс дээр", manual: "гараар" } as const;

export function CustomerList() {
  const s = useSp();
  const m = useM();
  const [q, setQ] = useState("");
  const list = rankedCustomers(s);
  const qq = q.trim().toLowerCase().replace(/\s/g, "");
  const shown = list.filter((r) => !qq || `${r.c.name ?? ""}${r.c.phone}`.toLowerCase().replace(/\s/g, "").includes(qq));

  return (
    <Screen nav={<NavBar large title="Харилцагч" sub={`${list.length} харилцагч · байнгын нь дээрээ`} trailing={<IconBtn name="plus" label="Гараар бүртгэх" tone="plain" onClick={m.openAddCustomer} />} />}>
      <div className="px-4 pt-3">
        <SearchField value={q} onChange={setQ} placeholder="Нэр, утсаар хайх" />
      </div>
      {list.length === 0 ? (
        <Empty icon="people" title="Харилцагч алга" body="Хүргэлтийн захиалга, касс дээр оноо цуглуулахад автоматаар нэмэгдэнэ. Эсвэл гараар бүртгэнэ үү." action={<Btn icon="plus" onClick={m.openAddCustomer}>Гараар бүртгэх</Btn>} />
      ) : shown.length === 0 ? (
        <Empty icon="search" title="Олдсонгүй" body="Өөр нэр, дугаараар хайж үзнэ үү." />
      ) : (
        <Group className="mt-3">
          {shown.map((r, i) => (
            <button key={r.c.id} type="button" onClick={() => m.push({ k: "customer", id: r.c.id })} className="sp-row flex min-h-[60px] w-full items-center gap-3 px-4 py-2.5 text-left">
              <Avatar text={avatarText(r.c.name, r.c.phone)} size={40} tone={i < 3 && !qq ? "accent" : "gray"} />
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5">
                  <span className="truncate text-[16px] text-ink">{r.c.name ?? fmtPhone(r.c.phone)}</span>
                  {!r.c.optIn && <Badge tone="gray">SMS-гүй</Badge>}
                </span>
                <span className="block text-[13px] text-mute tnum">
                  {r.c.name ? fmtPhone(r.c.phone) + " · " : ""}
                  {r.count} удаа
                </span>
              </span>
              <span className="shrink-0 text-[15px] font-semibold text-ink tnum">{short(r.spend)}</span>
              <Icon name="chevron" size={17} stroke={2.2} className="text-[var(--line)]" />
            </button>
          ))}
        </Group>
      )}
    </Screen>
  );
}

export function AddCustomerSheet({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (id: string) => void }) {
  const s = useSp();
  const m = useM();
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [opt, setOpt] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [was, setWas] = useState(open);
  if (open !== was) {
    setWas(open);
    if (open) {
      setPhone("");
      setName("");
      setOpt(false);
      setErr(null);
    }
  }
  const save = () => {
    const p = phone.replace(/\D/g, "");
    if (p.length !== 8) return setErr("Утасны дугаар 8 оронтой байна.");
    const existed = s.customers.some((c) => c.phone === p && !c.erased);
    try {
      const c = addCustomer(m.actor, p, name.trim() || undefined, "manual", opt);
      toast(existed ? "Энэ дугаар бүртгэлтэй байна — нээлээ" : "Харилцагч бүртгэгдлээ", existed ? "ink" : "ok");
      onCreated(c.id);
    } catch (e) {
      setErr(e instanceof SpError ? e.message : "Алдаа гарлаа");
    }
  };
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Гараар бүртгэх"
      footer={
        <Btn block onClick={save} disabled={phone.replace(/\D/g, "").length !== 8}>
          Бүртгэх
        </Btn>
      }
    >
      <div className="space-y-4 px-4 pb-4 pt-3">
        <Field label="Утасны дугаар *" error={err}>
          <input className="sp-field tnum" inputMode="numeric" placeholder="9911 2233" value={phone} onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 8))} name="cphone" />
        </Field>
        <Field label="Нэр">
          <input className="sp-field" placeholder="Жишээ: Б.Ану" value={name} onChange={(e) => setName(e.target.value)} name="cname" />
        </Field>
        <div className="flex items-start gap-3 rounded-[14px] bg-paper p-3.5">
          <div className="min-w-0 flex-1">
            <div className="text-[15px] font-medium text-ink">Маркетингийн SMS</div>
            <div className="mt-0.5 text-[13px] leading-snug text-mute">Харилцагч хямдрал, урамшууллын SMS авахыг зөвшөөрсөн. Хүссэн үедээ татгалзана.</div>
          </div>
          <Switch checked={opt} onChange={setOpt} label="Маркетингийн SMS зөвшөөрсөн" />
        </div>
      </div>
    </Sheet>
  );
}

const KIND: Record<PointEntry["kind"], string> = { earn: "Олгосон", spend: "Зарцуулсан", revert: "Буцаалтаар хасагдсан", restore: "Буцаалтаар сэргэсэн", manual: "Гараар", expire: "Хүчингүй болсон" };

export function CustomerDetail({ id }: { id: string }) {
  const s = useSp();
  const m = useM();
  const [tab, setTab] = useState<"buy" | "pts">("buy");
  const [adj, setAdj] = useState<null | { v: string; sign: 1 | -1; note: string }>(null);
  const { confirm, node } = useConfirm();
  const c = s.customers.find((x) => x.id === id);
  if (!c || c.erased)
    return (
      <Screen nav={<NavBar onBack={m.pop} backLabel="Харилцагч" />}>
        <Empty icon="people" title="Харилцагчийн мэдээлэл устсан" body="Борлуулалтын нэгтгэсэн бичилт тайланд үлдсэн." />
      </Screen>
    );

  const st = customerStats(s).get(c.id) ?? { count: 0, spend: 0 };
  const camp = activePointCampaign(s);
  const tier = tierOf(s, c.id, camp);
  const premium = PLAN_MODULES[s.merchant.plan].includes("wallet");

  type H = { at: string; title: string; sub: string; amount: number; struck?: boolean; orderId?: string };
  const hist: H[] = [
    ...s.sales
      .filter((x) => x.customerId === c.id)
      .map((x) => {
        const o = x.orderId ? s.orders.find((y) => y.id === x.orderId) : undefined;
        const extra = [x.pointsEarned ? `+${x.pointsEarned} оноо` : "", x.pointsSpent ? `${x.pointsSpent} оноо зарцуулсан` : "", x.refund ? "Буцаасан" : ""].filter(Boolean).join(" · ");
        return {
          at: x.at,
          title: x.channel === "delivery" ? `Хүргэлт${o ? ` #${o.no}` : ""}` : "Дэлгүүрт",
          sub: [linesText(x.lines.filter((l) => l.name !== "Хүргэлт"), 2), extra].filter(Boolean).join(" · "),
          amount: x.total,
          struck: !!x.refund,
          orderId: o?.id,
        };
      }),
    ...s.orders
      .filter((o) => o.customerId === c.id && !o.saleId)
      .map((o) => ({
        at: o.createdAt,
        title: `Хүргэлт #${o.no}`,
        sub: `${linesText(o.lines, 2)} · ${o.cancel ? "Цуцлагдсан" : "Төлөгдөөгүй"}`,
        amount: o.total,
        struck: !!o.cancel,
        orderId: o.id,
      })),
  ].sort((a, b) => b.at.localeCompare(a.at));
  const pts = s.points.filter((p) => p.customerId === c.id).sort((a, b) => b.at.localeCompare(a.at));
  const when = (iso: string) => (isToday(iso) ? `Өнөөдөр ${hhmm(iso)}` : `${dateShort(iso)}`);

  return (
    <Screen
      nav={
        <NavBar
          onBack={m.pop}
          backLabel="Харилцагч"
          trailing={
            <a href={`tel:${c.phone}`} aria-label="Залгах" className="sp-tap grid size-11 place-items-center rounded-full text-ok">
              <Icon name="phone" size={22} />
            </a>
          }
        />
      }
    >
      <div className="flex items-center gap-4 px-4 pt-3">
        <Avatar text={avatarText(c.name, c.phone)} size={64} tone="accent" />
        <div className="min-w-0">
          <h1 className="truncate text-[26px] font-bold tracking-[-0.02em] text-ink">{c.name ?? fmtPhone(c.phone)}</h1>
          <div className="text-[14px] text-mute tnum">
            {fmtPhone(c.phone)}
            {tier ? ` · ${tier.tier.name} түвшин` : ""}
          </div>
        </div>
      </div>

      <div className="mx-4 mt-4 grid grid-cols-3 gap-2">
        {[
          ["Удаа", String(st.count)],
          ["Нийт дүн", short(st.spend)],
          ["Оноо", c.points.toLocaleString("en-US")],
        ].map(([k, v]) => (
          <div key={k} className="rounded-[16px] bg-paper px-3 py-3">
            <div className="text-[12px] text-mute">{k}</div>
            <div className="mt-1 text-[19px] font-bold leading-tight tracking-[-0.02em] text-ink tnum">{v}</div>
          </div>
        ))}
      </div>

      <Group className="mt-3">
        <Row
          title="Маркетингийн SMS"
          sub={c.optIn ? "Зөвшөөрсөн" : "Татгалзсан — сегментээс хасагдана"}
          trailing={
            <Switch
              checked={c.optIn}
              label="Маркетингийн SMS"
              onChange={(v) => {
                updateCustomer(m.actor, { ...c, optIn: v });
                toast(v ? "Зөвшөөрөл бүртгэлээ" : "SMS-ээс хасагдлаа");
              }}
            />
          }
        />
        <Row
          title="Wallet карт"
          sub={premium ? (c.passSerial ? `Олгосон · ${c.passSerial}` : "Олгоогүй — касс дээр QR-аар авна") : "Premium багцад нээгдэнэ"}
          trailing={premium ? <Badge tone={c.passSerial ? "ok" : "gray"} icon={c.passSerial ? "check" : undefined}>{c.passSerial ? "Идэвхтэй" : "Байхгүй"}</Badge> : <Icon name="lock" size={18} className="text-mute" />}
        />
        <Row title="Бүртгэгдсэн" value={`${dateShort(c.createdAt)} · ${SOURCE[c.source]}`} />
        {m.manage && <Row icon="star" title="Оноо гараар засах" chevron onClick={() => setAdj({ v: "", sign: 1, note: "" })} />}
      </Group>

      <div className="px-4 pt-5">
        <Segmented
          value={tab}
          onChange={setTab}
          options={[
            { id: "buy", label: `Худалдан авалт · ${hist.length}` },
            { id: "pts", label: `Оноо · ${pts.length}` },
          ]}
        />
      </div>

      {tab === "buy" ? (
        hist.length === 0 ? (
          <Empty icon="bag" title="Худалдан авалт алга" body="Касс эсвэл хүргэлтээр худалдан авалт хийхэд энд харагдана." />
        ) : (
          <Group className="mt-3">
            {hist.slice(0, 40).map((h, i) => (
              <Row
                key={i}
                title={`${when(h.at)} · ${h.title}`}
                sub={h.sub}
                value={<span className={h.struck ? "text-mute line-through" : "font-semibold text-ink"}>{money(h.amount)}</span>}
                chevron={!!h.orderId && m.can("delivery") === "ok"}
                onClick={h.orderId && m.can("delivery") === "ok" ? () => m.push({ k: "order", id: h.orderId }) : undefined}
              />
            ))}
          </Group>
        )
      ) : pts.length === 0 ? (
        <Empty icon="star" title="Онооны түүх алга" body={camp ? "Идэвхтэй урамшууллын үед худалдан авалт бүрт оноо олгогдоно." : "Идэвхтэй оноо урамшуулал алга."} />
      ) : (
        <Group className="mt-3">
          {pts.slice(0, 40).map((p) => (
            <Row
              key={p.id}
              title={KIND[p.kind]}
              sub={`${when(p.at)}${p.note ? ` · ${p.note}` : ""}`}
              value={<span className={p.delta >= 0 ? "font-semibold text-ok" : "font-semibold text-danger"}>{p.delta >= 0 ? `+${p.delta}` : `−${Math.abs(p.delta)}`}</span>}
            />
          ))}
        </Group>
      )}

      {m.manage && (
        <div className="mt-6 px-4">
          <Btn
            variant="plain"
            block
            size="md"
            className="!text-danger"
            onClick={() =>
              confirm({
                title: "Харилцагчийн мэдээллийг устгах уу?",
                message: "Нэр, утас, оноо, картын холбоос устна. Борлуулалтын нэгтгэсэн бичилт тайланд үлдэнэ. Буцаах боломжгүй.",
                ok: "Устгах",
                destructive: true,
                run: () => {
                  eraseCustomer(m.actor, c.id);
                  toast("Харилцагчийн мэдээлэл устлаа");
                  m.pop();
                },
              })
            }
          >
            Харилцагчийн мэдээллийг устгах…
          </Btn>
        </div>
      )}
      <Sheet
        open={!!adj}
        onClose={() => setAdj(null)}
        title="Оноо засах"
        footer={
          <Btn
            block
            disabled={!adj?.v || !adj.note.trim()}
            onClick={() => {
              if (!adj) return;
              const d = adj.sign * Number(adj.v);
              adjustPoints(m.actor, c.id, d, adj.note.trim());
              toast(`${d > 0 ? "+" : "−"}${Math.abs(d)} оноо · лог тайланд бичигдлээ`, "ok");
              setAdj(null);
            }}
          >
            Хадгалах
          </Btn>
        }
      >
        {adj && (
          <div className="space-y-4 px-4 pb-4 pt-3">
            <Segmented
              value={adj.sign === 1 ? "add" : "sub"}
              onChange={(v) => setAdj({ ...adj, sign: v === "add" ? 1 : -1 })}
              options={[
                { id: "add", label: "Нэмэх" },
                { id: "sub", label: "Хасах" },
              ]}
            />
            <Field label={`Оноо (одоо ${c.points.toLocaleString("en-US")})`}>
              <input className="sp-field tnum" inputMode="numeric" value={adj.v} onChange={(e) => setAdj({ ...adj, v: e.target.value.replace(/\D/g, "").slice(0, 7) })} name="adjv" />
            </Field>
            <Field label="Шалтгаан *">
              <input className="sp-field" value={adj.note} onChange={(e) => setAdj({ ...adj, note: e.target.value })} placeholder="Жишээ: Гомдлын нөхөн олговор" name="adjnote" />
            </Field>
          </div>
        )}
      </Sheet>
      {node}
    </Screen>
  );
}
