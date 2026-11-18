"use client";

/* Сагс — тоо ширхэг, урамшууллын мөр (BR09-4), харилцагч, нийлбэр, «Төлбөр авах». */

import { useSp } from "@/lib/sp/store";
import { money, num, priceCart } from "@/lib/sp/logic";
import { Btn, Empty, NavBar, Notice, toast } from "@/components/sp/ui";
import { Icon } from "@/components/sp/icons";
import { Line, OfflineBanner, Screen, card, usePos } from "./ctx";
import { CustomerBlock } from "./Identify";

export function Cart() {
  const s = useSp();
  const pos = usePos();
  const customer = s.customers.find((c) => c.id === pos.draft.customerId) ?? null;
  const pr = priceCart(s, pos.draft.cart, customer, pos.draft.redeem ? 1e12 : 0);
  const byId = new Map(s.products.map((p) => [p.id, p]));

  const minus = (id: string, qty: number) => {
    if (qty > 1) return pos.setQty(id, qty - 1);
    pos.setQty(id, 0);
    toast(`${byId.get(id)?.name ?? "Бараа"} хасагдлаа`, "ink", { label: "Буцаах", run: () => pos.setQty(id, 1) });
  };

  if (!pos.draft.cart.length)
    return (
      <Screen nav={<NavBar title="Сагс" onBack={pos.back} />}>
        <Empty icon="bag" title="Сагс хоосон" body="Бараан дээр дарж сагсанд нэмнэ. Бар код уншуулж ч болно." action={<Btn onClick={pos.back}>Бараа сонгох</Btn>} />
      </Screen>
    );

  return (
    <Screen
      nav={<NavBar title="Сагс" onBack={pos.back} />}
      bottom={
        <>
          <Btn size="xl" block disabled={!s.online} onClick={() => pos.go({ s: "pay", job: { kind: "sale" } })}>
            Төлбөр авах · {money(pr.total)}
          </Btn>
          {!s.online && <p className="pt-2 text-center text-[12px] text-mute">Сүлжээгүй үед гүйлгээ үүсгэхгүй</p>}
        </>
      }
    >
      {!s.online && <OfflineBanner />}
      <div className="space-y-3 px-4 pb-6 pt-3">
        <div className={`${card} overflow-hidden [&>*+*]:border-t [&>*+*]:border-[var(--sp-sep)]`}>
          {pr.lines.map((l, i) => {
            const p = l.productId ? byId.get(l.productId) : undefined;
            if (l.free)
              return (
                <div key={`f${i}`} className="flex items-center gap-3 px-4 py-3">
                  <span className="grid size-9 place-items-center rounded-[10px] bg-ok-soft text-ok">
                    <Icon name="gift" size={18} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] font-medium text-ink">{l.name}</span>
                    <span className="text-[13px] text-ok">Урамшуулал · {l.qty} ш үнэгүй</span>
                  </span>
                  <span className="text-[15px] font-semibold text-ok tnum">0₮</span>
                </div>
              );
            const over = p && l.qty > p.stock;
            return (
              <div key={l.productId} className="flex items-center gap-2 py-2.5 pl-4 pr-2">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15.5px] font-medium text-ink">{l.name}</span>
                  <span className="text-[13px] text-mute tnum">
                    {money(l.price)} · <span className="font-semibold text-ink">{money(l.price * l.qty)}</span>
                  </span>
                  {over && <span className="block text-[12px] font-medium text-warn">Нөөцөд {p.stock} байна</span>}
                </span>
                <div className="flex items-center rounded-full bg-[var(--sp-fill)]">
                  <button type="button" aria-label="Хасах" onClick={() => minus(l.productId!, l.qty)} className="sp-tap grid size-11 place-items-center rounded-full text-ink">
                    <Icon name={l.qty > 1 ? "minus" : "trash"} size={19} className={l.qty > 1 ? "" : "text-danger"} />
                  </button>
                  <span className="w-7 text-center text-[17px] font-bold text-ink tnum">{l.qty}</span>
                  <button type="button" aria-label="Нэмэх" onClick={() => pos.setQty(l.productId!, l.qty + 1)} className="sp-tap grid size-11 place-items-center rounded-full text-ink">
                    <Icon name="plus" size={19} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {pr.hint && (
          <Notice tone="accent" icon="tag">
            {pr.hint}
          </Notice>
        )}
        {pr.stockWarn.length > 0 && <Notice tone="warn">Нөөцөөс илүү: {pr.stockWarn.join(", ")}. Борлуулалт хийгдэнэ, нөөцөө шалгаарай.</Notice>}

        <CustomerBlock />

        <div className={`${card} px-4 py-3`}>
          <Line label="Барааны дүн" value={money(pr.subtotal)} />
          {pr.applied.map((a) => (
            <Line
              key={a.campaignId}
              label={
                <span className="inline-flex items-center gap-1.5">
                  <Icon name="tag" size={14} className="text-accent" /> {a.name}
                </span>
              }
              value={`−${money(a.amount)}`}
              tone="ok"
            />
          ))}
          {pr.redeem > 0 && <Line label={`Оноогоор (${num(pr.redeem)})`} value={`−${money(pr.redeem)}`} tone="ok" />}
          <div className="my-1.5 border-t border-[var(--sp-sep)]" />
          <div className="flex items-baseline justify-between">
            <span className="text-[17px] font-semibold text-ink">Төлөх</span>
            <span className="text-[28px] font-bold tracking-[-0.03em] text-ink tnum">{money(pr.total)}</span>
          </div>
          <div className="text-right text-[12px] text-mute">{pr.vat ? `НӨАТ ${money(Math.round(pr.vat))}` : "НӨАТ-гүй"}{pr.city ? ` · НХАТ ${money(Math.round(pr.city))}` : ""} багтсан</div>
        </div>
      </div>
    </Screen>
  );
}
