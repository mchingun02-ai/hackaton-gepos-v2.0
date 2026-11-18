"use client";

import { useMemo, useState } from "react";
import { moneyPlain, seedTxnCount, staff, staffToday, weekSales } from "@/lib/demo";
import { downloadCsv, useStore } from "@/lib/store";
import { IconAlert, IconExport, IconLock } from "@/components/icons";
import { Chip, Empty, Money, Td, Th, btnGhost } from "@/components/ui";

type Period = "өнөөдөр" | "7 хоног" | "сар";

/**
 * Захирлын самбар.
 *
 * Энэ нь кассын дэлгэц биш. Захирал бараа зардаггүй — өглөө утсаа
 * аваад «хэд зарсан бэ, юу буурсан бэ, хэн ажиллаж байна, юу
 * анхаарах вэ» гэдгийг л хардаг. Тиймээс эхний дэлгэц дээр ганц
 * том тоо, түүний өөрчлөлт, дараа нь анхаарах зүйлс.
 *
 * Хяналтын хэсэг нь үүнийг тайлангаас ялгаж байна: утаснаасаа
 * ажилтны эрхийг түгжих, хөнгөлөлтийг зогсоох. Эдгээр нь жинхэнэ
 * ажилладаг — түгжсэн ажилтан нэвтэрч чадахгүй, хөнгөлөлт
 * зогсоовол урамшууллын хувь ч бодогдохгүй.
 */
export default function AdminPage({ narrow }: { narrow: boolean }) {
  const {
    txns,
    catalog,
    debtors,
    money,
    sold,
    lockedStaff,
    toggleStaffLock,
    discountsOff,
    setDiscountsOff,
    shift,
    closeShift,
  } = useStore();

  const [period, setPeriod] = useState<Period>("өнөөдөр");

  /*
   * txns бол «сүүлийн гүйлгээ» гэсэн хэсэгчилсэн жагсаалт — өдрийн
   * нийт биш. Өдрийн жинхэнэ орлого, зарлага нь мөнгөн хөдөлгөөний
   * бичилтэд байна, зарсан болгонд тийш нэмэгдэнэ. Хоёрыг хольвол
   * «цэвэр ашиг» хасах тоо харуулна.
   */
  const stats = useMemo(() => {
    const today = (kind: "орлого" | "зарлага") =>
      money.filter((e) => e.kind === kind && e.at === "Өнөөдөр").reduce((s, e) => s + e.amount, 0);

    const revenue = today("орлого");
    const expense = today("зарлага");
    const seedCount = Object.values(staffToday).reduce((s, p) => s + p.txns, 0);
    const count = seedCount + Math.max(0, txns.length - seedTxnCount);
    const yesterday = weekSales[weekSales.length - 2]?.value ?? 1;

    /* Төлбөрийн хэлбэрийн харьцааг сүүлийн гүйлгээнээс авч өдрийн
       орлогод тэнцүүлж тараана — бүрэн бүртгэл ирэх хүртэлх ойролцоолол. */
    const seen = txns.reduce((sum, t) => sum + t.amount, 0) || 1;
    const share = (m: string) =>
      Math.round((txns.filter((t) => t.method === m).reduce((s, t) => s + t.amount, 0) / seen) * revenue);

    return {
      revenue,
      expense,
      net: revenue - expense,
      count,
      average: count ? Math.round(revenue / count) : 0,
      delta: Math.round(((revenue - yesterday) / yesterday) * 100),
      cash: share("Бэлэн"),
      card: share("Карт"),
      qpay: share("QPay"),
    };
  }, [txns, money]);

  /* Графикийн сүүлийн багана амьд байх ёстой — зарсан болгонд өснө */
  const week = useMemo(
    () => weekSales.map((d, i) => (i === weekSales.length - 1 ? { ...d, value: stats.revenue } : d)),
    [stats.revenue],
  );

  const top = useMemo(
    () =>
      Object.entries(sold)
        .map(([id, s]) => ({ product: catalog.find((p) => p.id === id), ...s }))
        .filter((row) => row.product)
        .sort((a, b) => b.amount - a.amount)
        .slice(0, 5),
    [sold, catalog],
  );
  const topMax = top[0]?.amount ?? 1;

  /* Анхаарах зүйлс — захирал эдгээрийг хайж олох учиргүй, өөрөө гарч ирнэ */
  const alerts = useMemo(() => {
    const list: { tone: "warn" | "danger"; title: string; detail: string }[] = [];
    const low = catalog.filter((p) => p.stock > 0 && p.stock <= 5);
    const out = catalog.filter((p) => p.stock === 0);
    const uncoded = catalog.filter((p) => !p.taxCoded);
    const overdue = debtors.filter((d) => d.dueInDays < 0);
    const queued = txns;

    if (out.length)
      list.push({ tone: "danger", title: `${out.length} бараа дууссан`, detail: out.slice(0, 3).map((p) => p.name).join(", ") });
    if (low.length)
      list.push({ tone: "warn", title: `${low.length} бараа дуусах дөхсөн`, detail: low.slice(0, 3).map((p) => `${p.name} · ${p.stock}${p.unit}`).join(", ") });
    if (overdue.length)
      list.push({ tone: "danger", title: `${overdue.length} өр хугацаа хэтэрсэн`, detail: moneyPlain(overdue.reduce((s, d) => s + d.balance, 0)) + "₮" });
    if (uncoded.length)
      list.push({ tone: "warn", title: `${uncoded.length} бараа татварын кодгүй`, detail: "Е-баримт үүсэхгүй" });
    if (queued.length)
      list.push({ tone: "warn", title: "Е-баримт холбогдоогүй", detail: `${queued.length} гүйлгээнд татварын баримт үүсээгүй` });
    return list;
  }, [catalog, debtors, txns]);

  const peak = Math.max(...week.map((d) => d.value), 1);

  /* Самбар өөрөө гүйлгэнэ (бүрхүүл overflow-hidden). Нарийн дэлгэцэд бүрхүүл padding-гүй тул
     16px хажуугийн зай энд — карт ирмэгт наалдахгүй, доод хэсэг тасрахгүй. */
  return (
    <div className={`min-h-0 flex-1 space-y-5 overflow-y-auto ${narrow ? "px-4 pb-6 pt-4" : ""}`}>
      {/* ── хугацаа ба экспорт ── */}
      <div className="flex items-center gap-2">
        <div className="no-bar flex gap-2 overflow-x-auto">
          {(["өнөөдөр", "7 хоног", "сар"] as Period[]).map((p) => (
            <Chip key={p} on={period === p} onClick={() => setPeriod(p)}>
              {p === "өнөөдөр" ? "Өнөөдөр" : p === "7 хоног" ? "7 хоног" : "Сар"}
            </Chip>
          ))}
        </div>
        <button
          type="button"
          onClick={() => downloadCsv("захирлын-тайлан", [
            ["Үзүүлэлт", "Дүн"],
            ["Орлого", String(stats.revenue)],
            ["Зарлага", String(stats.expense)],
            ["Цэвэр", String(stats.net)],
            ["Гүйлгээ", String(stats.count)],
            ["Дундаж чек", String(stats.average)],
          ])}
          className={`${btnGhost} ml-auto shrink-0`}
        >
          <IconExport />
          Excel
        </button>
      </div>

      {/* ── гол тоо ── */}
      <div className="rounded-[22px] bg-paper p-5 ring-1 ring-inset ring-hair">
        <span className="meta">Өнөөдрийн орлого</span>
        <div className="mt-1.5 flex flex-wrap items-end gap-3">
          <span className="hugenum text-[40px]!">
            {moneyPlain(stats.revenue)}
            <span className="suffix">₮</span>
          </span>
          <span
            className={`tnum mb-2 rounded-full px-2 py-1 text-[12px] font-bold ${
              stats.delta >= 0 ? "bg-ok-soft text-ok" : "bg-danger-soft text-danger"
            }`}
          >
            {stats.delta >= 0 ? "↑" : "↓"} {Math.abs(stats.delta)}%
          </span>
          <span className="mb-2 text-[12px] text-mute">өчигдөртэй харьцуулахад</span>
        </div>

        {/* 390px дээр гурван багана нь «ДУНДАЖ ЧЕК»-ийг хоёр мөр болгодог.
            Нарийнд хоёр багана, цэвэр ашиг доогуураа бүтнээрээ. */}
        <div className={`mt-4 grid gap-3 ${narrow ? "grid-cols-2" : "grid-cols-3"}`}>
          <Mini label="Гүйлгээ" value={String(stats.count)} />
          <Mini label="Дундаж чек" value={moneyPlain(stats.average) + "₮"} />
          <Mini
            label="Цэвэр ашиг"
            value={moneyPlain(stats.net) + "₮"}
            span={narrow}
            tone={stats.net >= 0 ? "ink" : "danger"}
          />
        </div>
      </div>

      {/* ── анхаарах зүйлс ── */}
      {alerts.length > 0 && (
        <div>
          <span className="meta">Анхаарах</span>
          <div className={`mt-2 grid gap-2 ${narrow ? "grid-cols-1" : "grid-cols-2"}`}>
            {alerts.map((a) => (
              <div
                key={a.title}
                className={`flex items-start gap-2.5 rounded-[16px] p-3 ${
                  a.tone === "danger" ? "bg-danger-soft text-danger" : "bg-warn-soft text-warn"
                }`}
              >
                <span className="mt-0.5 shrink-0">
                  <IconAlert />
                </span>
                <span className="min-w-0">
                  <span className="block text-[13px] font-bold">{a.title}</span>
                  <span className="block truncate text-[11.5px] opacity-80">{a.detail}</span>
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── 7 хоног ── */}
      <div className="rounded-[22px] bg-paper p-5 ring-1 ring-inset ring-hair">
        <div className="flex items-baseline justify-between">
          <h2 className="text-[15px] font-bold tracking-[-0.02em] text-ink">7 хоногийн борлуулалт</h2>
          <span className="meta">Дээд {moneyPlain(peak)}₮</span>
        </div>
        {/* Багана хувиар өндөрждөг тул эцэг нь ТОДОРХОЙ өндөртэй байх
            ёстой. Шошгыг тусдаа мөрөнд гаргаснаар баганын талбай
            flex-1-ээр тогтож, хувь зөв бодогдоно. */}
        <div className="mt-4 flex h-[150px] flex-col">
          <div className="flex flex-1 items-end gap-2">
            {week.map((day, index) => (
              <div
                key={day.day}
                className={`flex-1 rounded-t-md transition-[height] duration-500 ${
                  index === week.length - 1 ? "bg-accent" : "bg-ink/15"
                }`}
                style={{ height: `${Math.max(3, (day.value / peak) * 100)}%` }}
                title={day.day + " · " + moneyPlain(day.value) + "₮"}
              />
            ))}
          </div>
          <div className="mt-2 flex gap-2">
            {week.map((day) => (
              <span key={day.day} className="meta flex-1 text-center">
                {day.day}
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className={`grid gap-5 ${narrow ? "grid-cols-1" : "grid-cols-2"}`}>
        {/* ── топ бараа ── */}
        <div className="rounded-[22px] bg-paper p-5 ring-1 ring-inset ring-hair">
          <h2 className="text-[15px] font-bold tracking-[-0.02em] text-ink">Хамгийн их зарагдсан</h2>
          <div className="mt-4 space-y-3">
            {top.length === 0 ? (
              <Empty text="Борлуулалт алга" />
            ) : (
              top.map((row) => (
                <div key={row.product!.id}>
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-[13px] font-semibold text-ink">
                      {row.product!.name}
                    </span>
                    <Money value={row.amount} className="shrink-0 text-[13px] font-bold text-ink" />
                  </div>
                  <div className="mt-1.5 flex items-center gap-2">
                    <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-stage">
                      <span
                        className="block h-full rounded-full bg-ink/35"
                        style={{ width: `${(row.amount / topMax) * 100}%` }}
                      />
                    </span>
                    <span className="tnum shrink-0 text-[11px] text-mute">
                      {row.qty} {row.product!.unit}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* ── төлбөрийн арга ── */}
        <div className="rounded-[22px] bg-paper p-5 ring-1 ring-inset ring-hair">
          <h2 className="text-[15px] font-bold tracking-[-0.02em] text-ink">Төлбөрийн хэлбэр</h2>
          <div className="mt-4 space-y-3">
            {[
              { label: "Бэлэн", value: stats.cash },
              { label: "Карт", value: stats.card },
              { label: "QPay", value: stats.qpay },
            ].map((row) => {
              const share = stats.revenue ? Math.round((row.value / stats.revenue) * 100) : 0;
              return (
                <div key={row.label}>
                  <div className="flex items-baseline justify-between">
                    <span className="text-[13px] font-semibold text-ink">{row.label}</span>
                    <span className="tnum text-[13px] text-mute">
                      {share}% · <span className="font-bold text-ink">{moneyPlain(row.value)}₮</span>
                    </span>
                  </div>
                  <span className="mt-1.5 block h-1.5 overflow-hidden rounded-full bg-stage">
                    <span className="block h-full rounded-full bg-ink/35" style={{ width: `${share}%` }} />
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── ажилтан ба хяналт ── */}
      <div className="rounded-[22px] bg-paper p-5 ring-1 ring-inset ring-hair">
        <div className="flex items-baseline justify-between">
          <h2 className="text-[15px] font-bold tracking-[-0.02em] text-ink">Ажилтан</h2>
          <span className="meta">Эрх түгжих</span>
        </div>

        {narrow ? (
          <div className="mt-3 space-y-2">
            {staff.map((person) => (
              <StaffRow
                key={person.id}
                person={person}
                locked={lockedStaff.includes(person.id)}
                onToggle={() => toggleStaffLock(person.id)}
              />
            ))}
          </div>
        ) : (
          <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[560px] border-separate border-spacing-0">
            <thead>
              <tr>
                <Th>Нэр</Th>
                <Th>Албан тушаал</Th>
                <Th align="right">Борлуулалт</Th>
                <Th align="right">Гүйлгээ</Th>
                <Th align="right">Эрх</Th>
              </tr>
            </thead>
            <tbody>
              {staff.map((person) => {
                const perf = staffToday[person.id] ?? { sales: 0, txns: 0 };
                const locked = lockedStaff.includes(person.id);
                return (
                  <tr key={person.id} className="row">
                    <Td>
                      <span className="flex items-center gap-2.5">
                        <span className="grid size-8 place-items-center rounded-full bg-ink text-[11px] font-bold text-paper">
                          {person.initials}
                        </span>
                        <span className="font-bold text-ink">{person.name}</span>
                      </span>
                    </Td>
                    <Td className="text-mute">{person.role}</Td>
                    <Td align="right">
                      <Money value={perf.sales} className="font-bold text-ink" />
                    </Td>
                    <Td align="right" className="tnum text-mute">
                      {perf.txns}
                    </Td>
                    <Td align="right">
                      <button
                        type="button"
                        onClick={() => toggleStaffLock(person.id)}
                        className={`press ml-auto flex h-9 items-center gap-1.5 rounded-xl px-3 text-[12px] font-bold ring-1 ring-inset ${
                          locked
                            ? "bg-danger-soft text-danger ring-transparent"
                            : "text-ink-2 ring-hair hover:text-ink hover:ring-line"
                        }`}
                      >
                        <IconLock />
                        {locked ? "Түгжээтэй" : "Нээлттэй"}
                      </button>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </div>
        )}
      </div>

      {/* ── хяналт ── */}
      <div className="rounded-[22px] bg-paper p-5 ring-1 ring-inset ring-hair">
        <h2 className="text-[15px] font-bold tracking-[-0.02em] text-ink">Хяналт</h2>
        <p className="mt-1 text-[12px] text-mute">
          Эдгээр нь кассад шууд нөлөөлнө. Утаснаасаа л хийж болно.
        </p>

        <div className="mt-4 space-y-2">
          <Control
            title="Бүх хөнгөлөлт"
            detail={
              discountsOff
                ? "Зогссон — урамшууллын хувь ч бодогдохгүй"
                : "Ажиллаж байна — зэрэглэлээр хөнгөлнө"
            }
            on={!discountsOff}
            onToggle={() => setDiscountsOff(!discountsOff)}
            onLabel="Идэвхтэй"
            offLabel="Зогссон"
          />
          <Control
            title="Нээлттэй смен"
            detail={shift ? `Нээлтийн үлдэгдэл ${moneyPlain(shift.openingFloat)}₮` : "Смен хаагдсан"}
            on={!!shift}
            onToggle={() => shift && closeShift()}
            onLabel="Нээлттэй"
            offLabel="Хаагдсан"
            action={shift ? "Албадан хаах" : undefined}
          />
        </div>
      </div>
    </div>
  );
}

function Mini({
  label,
  value,
  span,
  tone = "ink",
}: {
  label: string;
  value: string;
  span?: boolean;
  tone?: "ink" | "danger";
}) {
  return (
    <div className={`rounded-[14px] bg-stage p-3 ${span ? "col-span-2" : ""}`}>
      <span className="meta block truncate">{label}</span>
      <div
        className={`tnum mt-1 text-[16px] font-bold tracking-[-0.02em] ${
          tone === "danger" ? "text-danger" : "text-ink"
        }`}
      >
        {value}
      </div>
    </div>
  );
}

function StaffRow({
  person,
  locked,
  onToggle,
}: {
  person: (typeof staff)[number];
  locked: boolean;
  onToggle: () => void;
}) {
  const perf = staffToday[person.id] ?? { sales: 0, txns: 0 };
  return (
    <div className="flex items-center gap-3 rounded-[16px] bg-stage p-3">
      <span className="grid size-9 shrink-0 place-items-center rounded-full bg-ink text-[11px] font-bold text-paper">
        {person.initials}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-bold text-ink">{person.name}</span>
        <span className="tnum block text-[11.5px] text-mute">
          {moneyPlain(perf.sales)}₮ · {perf.txns} гүйлгээ
        </span>
      </span>
      <button
        type="button"
        onClick={onToggle}
        aria-pressed={locked}
        className={`press grid size-9 shrink-0 place-items-center rounded-xl ${
          locked ? "bg-danger-soft text-danger" : "text-ink-2 ring-1 ring-inset ring-hair"
        }`}
        title={locked ? "Түгжээтэй" : "Нээлттэй"}
      >
        <IconLock />
      </button>
    </div>
  );
}

function Control({
  title,
  detail,
  on,
  onToggle,
  onLabel,
  offLabel,
  action,
}: {
  title: string;
  detail: string;
  on: boolean;
  onToggle: () => void;
  onLabel: string;
  offLabel: string;
  action?: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-[16px] bg-stage p-3.5">
      <span className="min-w-0 flex-1">
        <span className="block text-[13.5px] font-bold text-ink">{title}</span>
        <span className="block text-[11.5px] text-mute">{detail}</span>
      </span>
      <button
        type="button"
        onClick={onToggle}
        aria-pressed={on}
        className={`press shrink-0 rounded-xl px-3.5 py-2 text-[12px] font-bold ring-1 ring-inset ${
          on
            ? "text-ink-2 ring-hair hover:text-ink hover:ring-line"
            : "bg-danger-soft text-danger ring-transparent"
        }`}
      >
        {action && on ? action : on ? onLabel : offLabel}
      </button>
    </div>
  );
}
