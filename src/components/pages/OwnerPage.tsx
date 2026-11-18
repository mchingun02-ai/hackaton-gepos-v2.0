"use client";

import { useState } from "react";
import { type MoneyEntry, moneyPlain, weekSales } from "@/lib/demo";
import { downloadCsv, useStore } from "@/lib/store";
import { IconExport, IconPlus } from "@/components/icons";
import { Chip, Field, Money, PrimaryButton, Sheet, Stat, Td, Th, btnGhost } from "@/components/ui";

/**
 * Орлого, зарлага — эзний хяналт.
 *
 * Кассчинд биш, эзэнд зориулагдсан: өнөөдөр хэдэн гүйлгээ явсан, орлого
 * хэд болсныг утаснаасаа харна. Тиймээс «өнөөдөр» хамгийн дээр.
 */
export default function OwnerPage({ narrow }: { narrow: boolean }) {
  const { money, txns, addMoney } = useStore();
  const [adding, setAdding] = useState(false);

  const income = money
    .filter((item) => item.kind === "орлого")
    .reduce((sum, item) => sum + item.amount, 0);
  const expense = money
    .filter((item) => item.kind === "зарлага")
    .reduce((sum, item) => sum + item.amount, 0);
  const todayIncome = money
    .filter((item) => item.kind === "орлого" && item.at === "Өнөөдөр")
    .reduce((sum, item) => sum + item.amount, 0);
  const net = income - expense;
  const peak = Math.max(...weekSales.map((day) => day.value), todayIncome);

  const exportCsv = () =>
    downloadCsv("orlogo-zarlaga.csv", [
      ["Гүйлгээ", "Төрөл", "Огноо", "Дүн"],
      ...money.map((item) => [item.label, item.kind, item.at, item.amount]),
      [],
      ["Нийт орлого", "", "", income],
      ["Нийт зарлага", "", "", expense],
      ["Цэвэр", "", "", net],
    ]);

  return (
    <div className="min-h-0 flex-1 space-y-4 overflow-y-auto">
      <div className={`grid gap-3 ${narrow ? "grid-cols-2" : "grid-cols-2 lg:grid-cols-4"}`}>
        {/* Нэг л accent: өнөөдрийн орлого — эзний энэ хуудсанд ирэх шалтгаан */}
        <Stat
          label="Өнөөдрийн орлого"
          value={<Money value={todayIncome} />}
          hint={`${txns.length} гүйлгээ`}
          tone="accent"
        />
        <Stat label="Нийт орлого" value={<Money value={income} />} />
        <Stat label="Нийт зарлага" value={<Money value={expense} />} />
        <Stat
          label="Цэвэр"
          value={<Money value={Math.abs(net)} sign={net >= 0 ? "" : "−"} />}
          tone={net >= 0 ? "ink" : "warn"}
          hint={net >= 0 ? "ашигтай" : "алдагдалтай"}
        />
      </div>

      <div className="rounded-[18px] bg-paper p-5 ring-1 ring-inset ring-hair">
        <div className="flex items-center justify-between">
          <h2 className="text-[15px] font-bold tracking-[-0.02em] text-ink">
            7 хоногийн борлуулалт
          </h2>
          <span className="meta">Хамгийн их {moneyPlain(peak)}₮</span>
        </div>

        <div className="mt-5 flex h-[168px] items-end gap-2 sm:gap-3">
          {weekSales.map((day, index) => {
            const last = index === weekSales.length - 1;
            const value = last ? todayIncome : day.value;
            return (
              <div key={day.day} className="flex flex-1 flex-col items-center gap-2">
                <span className="tnum text-[11px] font-semibold text-mute">
                  {Math.round(value / 1000)}к
                </span>
                <div
                  className={`w-full rounded-t-lg ${last ? "bg-accent" : "bg-stage"}`}
                  style={{ height: `${Math.max(4, Math.round((value / peak) * 120))}px` }}
                />
                <span className={`text-[11px] font-semibold ${last ? "text-ink" : "text-mute"}`}>
                  {day.day}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="rounded-[18px] bg-paper p-5 ring-1 ring-inset ring-hair">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-[15px] font-bold tracking-[-0.02em] text-ink">Орлого, зарлага</h2>
          <button type="button" onClick={exportCsv} className={`${btnGhost} ml-auto`}>
            <IconExport />
            Excel
          </button>
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="press flex h-10 items-center gap-2 rounded-xl bg-accent px-4 text-[13px] font-bold text-[color:var(--accent-ink)]"
          >
            <IconPlus />
            Бүртгэх
          </button>
        </div>

        <div className="mt-4">
          {narrow ? (
            <ul className="divide-y divide-hair">
              {money.map((item) => (
                <li key={item.id} className="flex items-center gap-3 py-3">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14px] font-bold text-ink">
                      {item.label}
                    </span>
                    <span className="mt-0.5 block text-[12px] text-mute">{item.at}</span>
                  </span>
                  <Money
                    value={item.amount}
                    sign={item.kind === "орлого" ? "+" : "−"}
                    className={`text-[14px] font-bold ${
                      item.kind === "орлого" ? "text-ok" : "text-ink"
                    }`}
                  />
                </li>
              ))}
            </ul>
          ) : (
            <table className="w-full border-separate border-spacing-0">
              <thead>
                <tr>
                  <Th>Гүйлгээ</Th>
                  <Th>Төрөл</Th>
                  <Th>Огноо</Th>
                  <Th align="right">Дүн</Th>
                </tr>
              </thead>
              <tbody>
                {money.map((item) => (
                  <tr key={item.id} className="row">
                    <Td className="font-bold text-ink">{item.label}</Td>
                    <Td>
                      <span
                        className={`rounded-full px-2 py-1 text-[11px] font-semibold ${
                          item.kind === "орлого" ? "bg-ok/10 text-ok" : "bg-stage text-ink-2"
                        }`}
                      >
                        {item.kind}
                      </span>
                    </Td>
                    <Td className="text-mute">{item.at}</Td>
                    <Td
                      align="right"
                      className={`font-bold ${item.kind === "орлого" ? "text-ok" : "text-ink"}`}
                    >
                      <Money value={item.amount} sign={item.kind === "орлого" ? "+" : "−"} />
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {adding && <AddEntry onClose={() => setAdding(false)} onSave={addMoney} />}
    </div>
  );
}

function AddEntry({
  onClose,
  onSave,
}: {
  onClose: () => void;
  onSave: (entry: Omit<MoneyEntry, "id">) => void;
}) {
  const [kind, setKind] = useState<"орлого" | "зарлага">("зарлага");
  const [label, setLabel] = useState("");
  const [amount, setAmount] = useState("");
  const valid = label.trim() !== "" && Number(amount) > 0;

  return (
    <Sheet
      title="Орлого, зарлага бүртгэх"
      onClose={onClose}
      footer={
        <PrimaryButton
          disabled={!valid}
          arrow={false}
          onClick={() => {
            onSave({ kind, label: label.trim(), amount: Number(amount), at: "Өнөөдөр" });
            onClose();
          }}
        >
          Бүртгэх
        </PrimaryButton>
      }
    >
      <div>
        <span className="meta mb-1.5 block">Төрөл</span>
        <div className="grid grid-cols-2 gap-2">
          {(["орлого", "зарлага"] as const).map((item) => (
            <Chip
              key={item}
              on={kind === item}
              onClick={() => setKind(item)}
              large
              className="w-full justify-center"
            >
              {item === "орлого" ? "Орлого" : "Зарлага"}
            </Chip>
          ))}
        </div>
      </div>

      <Field
        label="Тайлбар"
        value={label}
        onChange={setLabel}
        placeholder={kind === "орлого" ? "Жишээ: Түрээсийн орлого" : "Жишээ: Цалин"}
      />
      <Field label="Дүн (₮)" value={amount} onChange={setAmount} numeric placeholder="0" />

      <p className="text-[12px] leading-[16px] text-mute">
        Кассын борлуулалт, өр төлөлт автоматаар орлогод бүртгэгддэг. Энд гараар бүртгэх нь бусад
        орлого, бүх зарлагад зориулагдсан.
      </p>
    </Sheet>
  );
}
