"use client";

import { useMemo, useState } from "react";
import { type Debtor } from "@/lib/demo";
import { downloadCsv, useStore } from "@/lib/store";
import { IconAlert, IconExport, IconPlus, IconSearch } from "@/components/icons";
import { Empty, Field, Money, PrimaryButton, Sheet, Stat, Td, Th, btnGhost } from "@/components/ui";

/**
 * Өрийн дэвтэр.
 *
 * Хугацаа хэтэрсэн өрийг дээр нь, улаанаар. Энэ бол бодит мөнгө —
 * жагсаалтын дунд алга болох ёсгүй.
 */
export default function DebtsPage({ narrow }: { narrow: boolean }) {
  const { debtors, addDebtor, payDebt } = useStore();
  const [query, setQuery] = useState("");
  const [adding, setAdding] = useState(false);
  const [paying, setPaying] = useState<Debtor | null>(null);

  const rows = useMemo(() => {
    const filtered = debtors.filter(
      (item) =>
        query.trim() === "" ||
        item.name.toLowerCase().includes(query.trim().toLowerCase()) ||
        item.phone.includes(query.trim()),
    );
    return [...filtered].sort((a, b) => a.dueInDays - b.dueInDays);
  }, [query, debtors]);

  const total = debtors.reduce((sum, item) => sum + item.balance, 0);
  const overdue = debtors.filter((item) => item.dueInDays < 0);
  const overdueSum = overdue.reduce((sum, item) => sum + item.balance, 0);

  const exportCsv = () =>
    downloadCsv("oriin-devter.csv", [
      ["Харилцагч", "Утас", "Сүүлд", "Үлдэгдэл", "Хугацаа (хоног)"],
      ...debtors.map((item) => [item.name, item.phone, item.last, item.balance, item.dueInDays]),
      [],
      ["Нийт", "", "", total, ""],
    ]);

  return (
    <>
      <div className={`grid gap-3 ${narrow ? "grid-cols-2" : "grid-cols-2 lg:grid-cols-4"}`}>
        <Stat label="Нийт өр" value={<Money value={total} />} hint={`${debtors.length} харилцагч`} />
        <Stat
          label="Хугацаа хэтэрсэн"
          value={<Money value={overdueSum} />}
          hint={`${overdue.length} харилцагч`}
          tone={overdue.length > 0 ? "warn" : "ink"}
        />
        <Stat
          label="Хамгийн их"
          value={<Money value={Math.max(0, ...debtors.map((d) => d.balance))} />}
        />
        <Stat
          label="Дундаж"
          value={<Money value={debtors.length ? Math.round(total / debtors.length) : 0} />}
        />
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <label className="relative block w-full sm:w-[280px]">
          <span className="sr-only">Харилцагч хайх</span>
          <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-mute">
            <IconSearch />
          </span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Нэр, утсаар хайх"
            className="h-10 w-full rounded-xl bg-paper pl-4 pr-10 text-[13px] text-ink ring-1 ring-inset ring-hair placeholder:text-mute focus:outline-none focus:ring-accent"
          />
        </label>
        <button type="button" onClick={exportCsv} className={btnGhost}>
          <IconExport />
          Excel
        </button>
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="press ml-auto flex h-10 items-center gap-2 rounded-xl bg-accent px-4 text-[13px] font-bold text-[color:var(--accent-ink)]"
        >
          <IconPlus />
          Зээл бүртгэх
        </button>
      </div>

      <div className="mt-4 min-h-0 flex-1 overflow-y-auto">
        {rows.length === 0 ? (
          <Empty text="Харилцагч олдсонгүй" />
        ) : narrow ? (
          <ul className="divide-y divide-hair">
            {rows.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => setPaying(item)}
                  className="flex w-full items-center gap-3 py-3 text-left"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14px] font-bold text-ink">
                      {item.name}
                    </span>
                    <span className="tnum mt-0.5 block text-[12px] text-mute">{item.phone}</span>
                  </span>
                  <span className="flex flex-col items-end gap-1">
                    <Money value={item.balance} className="text-[14px] font-bold text-ink" />
                    <DueBadge days={item.dueInDays} />
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <table className="w-full border-separate border-spacing-0">
            <thead>
              <tr>
                <Th>Харилцагч</Th>
                <Th>Утас</Th>
                <Th>Сүүлд</Th>
                <Th align="right">Үлдэгдэл</Th>
                <Th align="right">Хугацаа</Th>
                <Th align="right">Үйлдэл</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((item) => (
                <tr key={item.id} className="row">
                  <Td className="font-bold text-ink">{item.name}</Td>
                  <Td className="tnum text-mute">{item.phone}</Td>
                  <Td className="tnum text-mute">{item.last}</Td>
                  <Td align="right" className="font-bold text-ink">
                    <Money value={item.balance} />
                  </Td>
                  <Td align="right">
                    <DueBadge days={item.dueInDays} />
                  </Td>
                  <Td align="right">
                    <button
                      type="button"
                      onClick={() => setPaying(item)}
                      className="press h-9 rounded-lg bg-stage px-3 text-[13px] font-semibold text-ink hover:bg-hair"
                    >
                      Төлөлт
                    </button>
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {adding && <AddDebtor onClose={() => setAdding(false)} onSave={addDebtor} />}
      {paying && (
        <PayDebt
          debtor={paying}
          onClose={() => setPaying(null)}
          onPay={(amount) => {
            payDebt(paying.id, amount);
            setPaying(null);
          }}
        />
      )}
    </>
  );
}

function AddDebtor({
  onClose,
  onSave,
}: {
  onClose: () => void;
  onSave: (debtor: Omit<Debtor, "id">) => void;
}) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [amount, setAmount] = useState("");
  const [days, setDays] = useState("14");

  const valid = name.trim() !== "" && Number(amount) > 0;

  return (
    <Sheet
      title="Зээл бүртгэх"
      onClose={onClose}
      footer={
        <PrimaryButton
          disabled={!valid}
          arrow={false}
          onClick={() => {
            onSave({
              name: name.trim(),
              phone: phone.trim() || "—",
              balance: Number(amount),
              last: new Date().toISOString().slice(5, 10),
              dueInDays: Number(days || 0),
            });
            onClose();
          }}
        >
          Бүртгэх
        </PrimaryButton>
      }
    >
      <Field label="Харилцагчийн нэр" value={name} onChange={setName} placeholder="Нэр" />
      <Field label="Утас" value={phone} onChange={setPhone} placeholder="9911-2233" />
      <Field label="Зээлийн дүн (₮)" value={amount} onChange={setAmount} numeric placeholder="0" />
      <Field label="Хугацаа (хоног)" value={days} onChange={setDays} numeric placeholder="14" />
      <p className="text-[12px] leading-[16px] text-mute">
        Хугацаа хэтэрсэн зээл жагсаалтын дээр улаанаар гарна.
      </p>
    </Sheet>
  );
}

function PayDebt({
  debtor,
  onClose,
  onPay,
}: {
  debtor: Debtor;
  onClose: () => void;
  onPay: (amount: number) => void;
}) {
  const [amount, setAmount] = useState(String(debtor.balance));
  const value = Number(amount || 0);
  const valid = value > 0 && value <= debtor.balance;

  return (
    <Sheet
      title="Өр төлөлт"
      onClose={onClose}
      footer={
        <PrimaryButton disabled={!valid} arrow={false} onClick={() => onPay(value)}>
          Төлөлт бүртгэх
        </PrimaryButton>
      }
    >
      <div className="rounded-xl bg-stage p-4">
        <span className="meta">Харилцагч</span>
        <p className="mt-1 text-[15px] font-bold text-ink">{debtor.name}</p>
        <p className="tnum mt-0.5 text-[12px] text-mute">{debtor.phone}</p>
        <div className="mt-3 flex items-end justify-between border-t border-hair pt-3">
          <span className="text-[13px] text-mute">Үлдэгдэл</span>
          <Money value={debtor.balance} className="text-[22px] font-bold leading-none text-ink" />
        </div>
      </div>

      <Field label="Төлөх дүн (₮)" value={amount} onChange={setAmount} numeric />

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setAmount(String(debtor.balance))}
          className={btnGhost}
        >
          Бүтнээр
        </button>
        <button
          type="button"
          onClick={() => setAmount(String(Math.round(debtor.balance / 2)))}
          className={btnGhost}
        >
          Талыг
        </button>
      </div>

      <p className="text-[12px] leading-[16px] text-mute">
        Төлөлт нь орлогын бүртгэлд автоматаар орно.
      </p>
    </Sheet>
  );
}

function DueBadge({ days }: { days: number }) {
  if (days < 0) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-danger-soft px-2 py-1 text-[11px] font-semibold text-danger">
        <IconAlert />
        {Math.abs(days)} хоног хэтэрсэн
      </span>
    );
  }
  if (days <= 3) {
    return (
      <span className="rounded-full bg-warn-soft px-2 py-1 text-[11px] font-semibold text-warn">
        {days} хоногт
      </span>
    );
  }
  return <span className="text-[12px] text-mute">{days} хоногт</span>;
}
