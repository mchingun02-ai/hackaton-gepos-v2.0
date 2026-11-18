"use client";

import { useCallback, useEffect, useState } from "react";
import { moneyPlain } from "@/lib/demo";
import { useStore } from "@/lib/store";
import { type Report, type StaffEntry, api } from "@/lib/pos-api";
import { Chip, Empty, Money, PrimaryButton, Stat, Td, Th, btnGhost } from "@/components/ui";

/**
 * Захирлын самбар — серверийн горим.
 *
 * Менежер: өөрийн салбарын тайлан. Эзэн: байгууллагын бүх салбарын тайлан
 * + ажилтны эрх (үүрэг, салбар, түгжээ, PIN). Сервер эрх бүрийг дахин
 * шалгадаг тул энд харагдахгүй байгаа үйлдлийг API-аар шууд дуудсан ч
 * хориглогдоно.
 */

const ROLE = { cashier: "Кассчин", manager: "Менежер", owner: "Эзэн" } as const;

const today = () => {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

export default function ServerAdminPage({ narrow }: { narrow: boolean }) {
  const { perms } = useStore();
  return (
    /* Нарийн дэлгэцэд бүрхүүл padding-гүй — 16px хажуугийн зай энд */
    <div className={`min-h-0 flex-1 overflow-y-auto ${narrow ? "px-4 pb-6 pt-4" : ""}`}>
      <ReportsBlock narrow={narrow} />
      {perms.manageStaff && <StaffBlock />}
    </div>
  );
}

function ReportsBlock({ narrow }: { narrow: boolean }) {
  const { perms, auth, reportError } = useStore();
  const [scope, setScope] = useState<"branch" | "merchant">(perms.merchantReports ? "merchant" : "branch");
  const [date, setDate] = useState(today);
  const [branchId, setBranchId] = useState<string | null>(null);
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    const a = auth();
    if (!a) return;
    setLoading(true);
    setError(null);
    try {
      const params: Record<string, string> = { scope, date };
      if (scope === "branch" && branchId) params.branchId = branchId;
      setReport(await api.report(a, params));
    } catch (e) {
      setError(reportError(e, "Тайлан ачаалж чадсангүй."));
      setReport(null);
    } finally {
      setLoading(false);
    }
  }, [auth, reportError, scope, date, branchId]);

  useEffect(() => {
    const timer = setTimeout(load, 0);
    return () => clearTimeout(timer);
  }, [load]);

  const t = report?.totals;
  return (
    <section>
      <div className="flex flex-wrap items-center gap-2">
        {perms.merchantReports && (
          <>
            <Chip on={scope === "merchant"} onClick={() => setScope("merchant")}>
              Бүх салбар
            </Chip>
            <Chip
              on={scope === "branch"}
              onClick={() => {
                setScope("branch");
                setBranchId(null);
              }}
            >
              Энэ салбар
            </Chip>
          </>
        )}
        <label className="ml-auto flex items-center gap-2 text-[13px] text-mute">
          Өдөр
          <input
            type="date"
            value={date}
            max={today()}
            onChange={(e) => e.target.value && setDate(e.target.value)}
            className="h-10 rounded-xl bg-stage px-3 text-[14px] text-ink"
          />
        </label>
        <button type="button" onClick={load} className={btnGhost} disabled={loading}>
          {loading ? "Ачаалж байна…" : "Шинэчлэх"}
        </button>
      </div>

      {error && (
        <p role="alert" className="mt-3 rounded-xl bg-danger-soft px-3.5 py-2.5 text-[13px] font-semibold text-danger">
          {error}
        </p>
      )}

      {t && (
        <>
          <div className={`mt-4 grid gap-3 ${narrow ? "grid-cols-2" : "grid-cols-4"}`}>
            <Stat label={scope === "merchant" ? "Байгууллага" : report?.branch ?? "Салбар"} value={<Money value={t.total} />} hint={`${t.count} гүйлгээ`} />
            <Stat label="Бэлэн" value={<Money value={t.cash} />} />
            <Stat label="Карт / QPay" value={<Money value={t.card + t.qpay} />} />
            <Stat label="Хөнгөлөлт" value={<Money value={t.discount} />} hint="Е-баримт холбогдоогүй" tone="warn" />
          </div>
          <div className={`mt-3 grid gap-3 ${narrow ? "grid-cols-2" : "grid-cols-4"}`}>
            <Stat label="Буцаалт" value={<Money value={t.refundTotal} />} hint={`${t.refundCount} буцаалт`} />
            <Stat label="Цэвэр борлуулалт" value={<Money value={t.net} />} hint="борлуулалт − буцаалт" />
            <Stat label="Бодитоор буцаасан" value={<Money value={t.refundedCash + t.refundedExternal} />} hint="бэлэн + гараар тэмдэглэсэн" />
            <Stat label="Хүлээгдэж буй буцаалт" value={<Money value={t.refundPending} />} hint="карт/QPay — мөнгө буцаагүй" tone={t.refundPending > 0 ? "warn" : "ink"} />
          </div>

          {scope === "merchant" && report && (
            <div className="mt-4 rounded-[18px] bg-paper p-4 ring-1 ring-inset ring-hair">
              <h2 className="text-[15px] font-bold text-ink">Салбараар</h2>
              {/* Нарийнд хүснэгт өөрийн хүрээнд хэвтээ гүйлгэнэ; баганын хооронд зай */}
              <div className="mt-2 overflow-x-auto">
              <table className="w-full min-w-[520px] text-[14px] [&_td:not(:first-child)]:pl-4 [&_th:not(:first-child)]:pl-4 [&_th]:whitespace-nowrap">
                <thead>
                  <tr>
                    <Th>Салбар</Th>
                    <Th align="right">Гүйлгээ</Th>
                    <Th align="right">Борлуулалт</Th>
                    <Th align="right">Цэвэр</Th>
                    <Th align="right">{""}</Th>
                  </tr>
                </thead>
                <tbody>
                  {report.byBranch.map((b) => (
                    <tr key={b.branchId} className="border-t border-hair">
                      <Td>{b.name}</Td>
                      <Td align="right">{b.count}</Td>
                      <Td align="right">{moneyPlain(b.total)}₮</Td>
                      <Td align="right">{moneyPlain(b.net)}₮</Td>
                      <Td align="right">
                        <button
                          type="button"
                          className="text-[13px] font-semibold text-accent"
                          onClick={() => {
                            setScope("branch");
                            setBranchId(b.branchId);
                          }}
                        >
                          Дэлгэрэнгүй
                        </button>
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            </div>
          )}

          {scope === "branch" && report && (
            <div className="mt-4 rounded-[18px] bg-paper p-4 ring-1 ring-inset ring-hair">
              <h2 className="text-[15px] font-bold text-ink">Гүйлгээ</h2>
              {report.sales.length === 0 ? (
                <Empty text="Энэ өдөр гүйлгээ алга" />
              ) : (
                <ul className="mt-2 divide-y divide-hair text-[14px]">
                  {report.sales.slice(0, 50).map((s) => (
                    <li key={s.id} className="flex items-center gap-3 py-2">
                      <span className="tnum shrink-0 text-mute">{s.no}</span>
                      <span className="min-w-0 truncate text-ink-2" title={s.cashierName ?? undefined}>{s.cashierName ?? "—"}</span>
                      <span className="tnum ml-auto shrink-0 font-semibold text-ink">{moneyPlain(s.total)}₮</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </>
      )}
    </section>
  );
}

function StaffBlock() {
  const { auth, reportError } = useStore();
  const [staff, setStaff] = useState<StaffEntry[]>([]);
  const [branches, setBranches] = useState<{ id: string; name: string }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    const a = auth();
    if (!a) return;
    try {
      const res = await api.staff(a);
      setStaff(res.staff);
      setBranches(res.branches);
    } catch (e) {
      setError(reportError(e, "Ажилтны жагсаалт ачаалж чадсангүй."));
    }
  }, [auth, reportError]);

  useEffect(() => {
    const timer = setTimeout(load, 0);
    return () => clearTimeout(timer);
  }, [load]);

  const save = async (body: Record<string, unknown>) => {
    const a = auth();
    if (!a) return false;
    setBusy(true);
    setError(null);
    try {
      await api.saveStaff(a, body);
      await load();
      return true;
    } catch (e) {
      setError(reportError(e, "Хадгалж чадсангүй."));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const resetPin = async (person: StaffEntry) => {
    const pin = window.prompt(`${person.name} — шинэ PIN (4–6 оронтой тоо)`);
    if (pin) await save({ id: person.id, pin });
  };

  return (
    <section className="mt-6 rounded-[18px] bg-paper p-5 ring-1 ring-inset ring-hair">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-[15px] font-bold text-ink">Ажилтан, эрх</h2>
        <button type="button" className={btnGhost} onClick={() => setAdding((v) => !v)}>
          {adding ? "Болих" : "Ажилтан нэмэх"}
        </button>
      </div>
      <p className="mt-1 text-[12px] text-mute">Өөрчлөлт бүр audit log-д бичигдэнэ. Түгжсэн, эрх өөрчилсөн ажилтан шууд гарна.</p>

      {error && (
        <p role="alert" className="mt-3 rounded-xl bg-danger-soft px-3.5 py-2.5 text-[13px] font-semibold text-danger">
          {error}
        </p>
      )}

      {adding && <AddStaff branches={branches} busy={busy} onSave={async (body) => (await save(body)) && setAdding(false)} />}

      <ul className="mt-3 divide-y divide-hair">
        {staff.map((person) => {
          const editable = person.role !== "owner";
          return (
            <li key={person.id} className="py-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="min-w-0 break-words text-[14px] font-bold text-ink">{person.name}</span>
                <span className="text-[12px] text-mute">{ROLE[person.role]}</span>
                {person.locked && <span className="rounded-full bg-danger-soft px-2 py-0.5 text-[11px] font-semibold text-danger">Түгжээтэй</span>}
                {editable && (
                  <span className="ml-auto flex flex-wrap gap-1.5">
                    <Chip on={person.role === "manager"} onClick={() => save({ id: person.id, role: person.role === "manager" ? "cashier" : "manager" })}>
                      Менежер
                    </Chip>
                    <Chip on={person.locked} onClick={() => save({ id: person.id, locked: !person.locked })}>
                      {person.locked ? "Түгжээ нээх" : "Түгжих"}
                    </Chip>
                    <Chip on={false} onClick={() => resetPin(person)}>
                      PIN солих
                    </Chip>
                  </span>
                )}
              </div>
              {editable && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {branches.map((b) => {
                    const on = person.branchIds.includes(b.id);
                    return (
                      <Chip
                        key={b.id}
                        on={on}
                        className="max-w-full"
                        title={b.name}
                        onClick={() =>
                          save({ id: person.id, branchIds: on ? person.branchIds.filter((x) => x !== b.id) : [...person.branchIds, b.id] })
                        }
                      >
                        <span className="min-w-0 truncate">{b.name}</span>
                      </Chip>
                    );
                  })}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function AddStaff({
  branches,
  busy,
  onSave,
}: {
  branches: { id: string; name: string }[];
  busy: boolean;
  onSave: (body: Record<string, unknown>) => void;
}) {
  const [name, setName] = useState("");
  const [role, setRole] = useState<"cashier" | "manager">("cashier");
  const [pin, setPin] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const field = "h-11 w-full rounded-xl bg-stage px-3.5 text-[14px] text-ink focus:outline-none focus:ring-1 focus:ring-accent";
  const valid = name.trim() && /^\d{4,6}$/.test(pin) && picked.length > 0;
  return (
    <div className="mt-3 space-y-2 rounded-xl bg-stage/60 p-3">
      <input className={field} placeholder="Нэр" value={name} onChange={(e) => setName(e.target.value)} />
      <input
        className={field}
        placeholder="PIN (4–6 оронтой)"
        inputMode="numeric"
        type="password"
        autoComplete="off"
        value={pin}
        onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
      />
      <div className="flex flex-wrap gap-1.5">
        <Chip on={role === "cashier"} onClick={() => setRole("cashier")}>
          Кассчин
        </Chip>
        <Chip on={role === "manager"} onClick={() => setRole("manager")}>
          Менежер
        </Chip>
        <span className="mx-1 w-px bg-hair" />
        {branches.map((b) => (
          <Chip key={b.id} on={picked.includes(b.id)} className="max-w-full" title={b.name} onClick={() => setPicked((p) => (p.includes(b.id) ? p.filter((x) => x !== b.id) : [...p, b.id]))}>
            <span className="min-w-0 truncate">{b.name}</span>
          </Chip>
        ))}
      </div>
      <PrimaryButton disabled={!valid || busy} onClick={() => onSave({ name: name.trim(), role, pin, branchIds: picked })} arrow={false}>
        {busy ? "Хадгалж байна…" : "Нэмэх"}
      </PrimaryButton>
    </div>
  );
}
