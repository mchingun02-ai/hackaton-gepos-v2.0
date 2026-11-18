"use client";

/* Mode B suggest — 10-аас доош бараатай үед дүнг бараагаар задлах (BR09-1.1, US15-4/5). */

import { useEffect, useMemo } from "react";
import { useSp } from "@/lib/sp/store";
import { money, suggestSplit } from "@/lib/sp/logic";
import type { SaleLine } from "@/lib/sp/types";
import { Amount, Btn, NavBar, cx } from "@/components/sp/ui";
import { Icon } from "@/components/sp/icons";
import { Screen, usePos } from "./ctx";

export function Split() {
  const s = useSp();
  const pos = usePos();
  const amount = pos.draft.amount;
  const active = s.products.filter((p) => p.active && p.price > 0).length;
  const options = useMemo(() => suggestSplit(s.products, amount), [s.products, amount]);
  const sel = pos.draft.split;
  const key = (ls: SaleLine[] | null) => (ls ? ls.map((l) => `${l.productId}:${l.qty}`).join(",") : "none");
  const pick = (ls: SaleLine[] | null) => pos.setDraft((d) => ({ ...d, split: ls }));
  // Хамгийн цөөн ширхэгтэй саналыг урьдчилан сонгоно
  const first = options[0] ?? null;
  useEffect(() => {
    if (first) pos.setDraft((d) => (d.split ? d : { ...d, split: first }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [first]);

  return (
    <Screen
      nav={<NavBar title="И-баримтын задаргаа" onBack={pos.back} />}
      bottom={
        <Btn size="xl" block disabled={!s.online} onClick={() => pos.go({ s: "pay", job: { kind: "sale" } })}>
          Үргэлжлүүлэх · {money(amount)}
        </Btn>
      }
    >
      <div className="px-4 pb-6 pt-4">
        <Amount value={amount} size={36} />
        <p className="mt-2 text-[14px] leading-snug text-mute">
          Танайд {active} бараа бүртгэлтэй тул дүнг бараагаар задалж болно. Сонгосон задаргаа И-баримтад орно.
        </p>
        <div className="mt-4 overflow-hidden rounded-[var(--sp-r-group)] bg-paper [&>*+*]:border-t [&>*+*]:border-[var(--sp-sep)]">
          {[...options, null].map((ls) => {
            const on = key(ls) === key(sel);
            return (
              <button key={key(ls)} type="button" onClick={() => pick(ls)} className="sp-row flex min-h-[64px] w-full items-center gap-3 px-4 py-3 text-left" aria-pressed={on}>
                <span className={cx("grid size-6 shrink-0 place-items-center rounded-full", on ? "bg-accent text-white" : "shadow-[inset_0_0_0_1.5px_var(--line)]")}>
                  {on && <Icon name="check" size={15} stroke={2.6} />}
                </span>
                <span className="min-w-0 flex-1">
                  {ls ? (
                    <>
                      <span className="block text-[15.5px] font-semibold text-ink">{ls.map((l) => `${l.name} ×${l.qty}`).join(" · ")}</span>
                      <span className="text-[13px] text-mute tnum">{ls.map((l) => `${money(l.price)}×${l.qty}`).join(" + ")}</span>
                    </>
                  ) : (
                    <>
                      <span className="block text-[15.5px] font-semibold text-ink">Задлахгүй</span>
                      <span className="text-[13px] text-mute">{s.ebarimt ? "«Бусад» төрлийн нэг бараагаар" : "Ebarimt холбогдоогүй"}</span>
                    </>
                  )}
                </span>
              </button>
            );
          })}
        </div>
        {options.length === 0 && <p className="mt-3 px-1 text-[13px] text-mute">Энэ дүнд яг таарах барааны нийлбэр олдсонгүй.</p>}
        <p className="mt-3 flex items-start gap-1.5 px-1 text-[12.5px] leading-snug text-mute">
          <Icon name="info" size={14} className="mt-px" /> Задаргаа сонговол барааны нөөцөөс хасагдана.
        </p>
      </div>
    </Screen>
  );
}
