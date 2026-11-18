"use client";

/* Биет борлуулалт — Mode A (сагсаар) ба Mode B (дүнгээр), BR09-1.1 */

import { useMemo, useState } from "react";
import { useSp } from "@/lib/sp/store";
import { itemCampaignLive, money, priceCart, SUGGEST_LIMIT } from "@/lib/sp/logic";
import { useBarcodeScanner } from "@/lib/scanner";
import { CameraScanner } from "@/components/CameraScanner";
import { Amount, Btn, Empty, IconBtn, NavBar, NumPad, SearchField, Segmented, cx, toast, useKeypad } from "@/components/sp/ui";
import { Icon } from "@/components/sp/icons";
import { OfflineBanner, Screen, usePos } from "./ctx";
import { CustomerChip } from "./Identify";

export function Sell() {
  const pos = usePos();
  const mode = pos.draft.mode;
  return (
    <div className="flex h-full flex-col">
      <NavBar title="Биет борлуулалт" onBack={pos.back} />
      <div className="shrink-0 px-4 pb-2 pt-2">
        <Segmented
          size="lg"
          options={[
            { id: "cart", label: "Сагсаар" },
            { id: "amount", label: "Дүнгээр" },
          ]}
          value={mode}
          onChange={(m) => pos.setDraft((d) => ({ ...d, mode: m as "cart" | "amount" }))}
        />
      </div>
      <div className="min-h-0 flex-1">{mode === "cart" ? <Catalog /> : <AmountMode />}</div>
    </div>
  );
}

/* ───────── Mode A — барааны сүлжээ ───────── */

function Catalog() {
  const s = useSp();
  const pos = usePos();
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("all");
  const [cam, setCam] = useState(false);

  const products = s.products.filter((p) => p.active);
  const cats = s.categories.filter((c) => c.active && products.some((p) => p.categoryId === c.id));
  const term = q.trim().toLowerCase();
  const list = products.filter((p) => (cat === "all" || p.categoryId === cat) && (!term || p.name.toLowerCase().includes(term) || p.barcode.includes(term)));
  const qty = new Map(pos.draft.cart.map((c) => [c.productId, c.qty]));
  const count = pos.draft.cart.reduce((a, c) => a + c.qty, 0);
  const customer = s.customers.find((c) => c.id === pos.draft.customerId) ?? null;
  const priced = priceCart(s, pos.draft.cart, customer, pos.draft.redeem ? 1e12 : 0);

  // Тухайн бараан дээр ажиллаж буй item campaign-ийн богино тэмдэг
  const tags = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of s.campaigns) {
      if (c.type !== "item" || !itemCampaignLive(c)) continue;
      const label = c.reward.kind === "product" ? `${c.qty}+${c.reward.qty}` : c.reward.kind === "percent" ? `−${c.reward.value}%` : `−${money(c.reward.value)}`;
      c.productIds.forEach((id) => m.set(id, label));
    }
    return m;
  }, [s.campaigns]);

  const add = (id: string) => {
    const p = s.products.find((x) => x.id === id);
    if (!p) return false;
    const n = (qty.get(id) ?? 0) + 1;
    pos.addItem(id);
    // BR09-9: нөөц хүрэлцэхгүй бол зөвхөн сануулна, хаахгүй
    if (n > p.stock) toast(`«${p.name}» нөөцөд ${p.stock} байна — шалгаарай`, "danger", { label: "Буцаах", run: () => pos.setQty(id, n - 1) });
    return true;
  };
  const byCode = (code: string) => {
    const p = s.products.find((x) => x.active && x.barcode === code);
    if (!p) {
      toast(`Бүртгэлгүй бар код: ${code}`, "danger", { label: "Бүртгэх", run: () => pos.go({ s: "product", barcode: code }) });
      return false;
    }
    return add(p.id);
  };
  useBarcodeScanner((code) => {
    if (!cam) byCode(code);
  });

  return (
    <Screen
      bottom={
        <Btn size="xl" block disabled={!count} onClick={() => pos.go({ s: "cart" })} className="!justify-between">
          <span className="flex items-center gap-2">
            <Icon name="bag" size={20} /> {count ? `Сагс · ${count} бараа` : "Бараа сонгоно уу"}
          </span>
          {count > 0 && <span className="tnum">{money(priced.total)}</span>}
        </Btn>
      }
    >
      <div className="sp-material sticky top-0 z-10 space-y-2 px-4 pb-2 pt-1">
        <div className="flex gap-2">
          <div className="min-w-0 flex-1">
            <SearchField
              value={q}
              onChange={setQ}
              placeholder="Бараа эсвэл бар код"
            />
          </div>
          <IconBtn name="scan" label="Камераар уншуулах" tone="accent" onClick={() => setCam(true)} />
        </div>
        <div className="sp-scroll -mx-4 flex gap-1.5 overflow-x-auto px-4">
          {[{ id: "all", name: "Бүгд" }, ...cats].map((c) => (
            <button key={c.id} type="button" aria-pressed={cat === c.id} onClick={() => setCat(c.id)} className="chip chip--lg shrink-0">
              {c.name}
            </button>
          ))}
        </div>
      </div>

      {list.length === 0 ? (
        <Empty
          icon="search"
          title={products.length ? "Бараа олдсонгүй" : "Бараа бүртгэлгүй"}
          body={products.length ? "Нэр эсвэл бар кодоо шалгана уу. «Дүнгээр» горимоор шууд төлбөр авч болно." : "Мерчантын апп эсвэл порталаас бараа нэмнэ үү. Одоохондоо «Дүнгээр» горимыг ашиглана уу."}
        />
      ) : (
        <div className="grid grid-cols-2 gap-2 px-4 pb-4 pt-1">
          {list.map((p) => {
            const n = qty.get(p.id) ?? 0;
            const low = p.stock <= p.minStock;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => add(p.id)}
                className={cx("sp-tap relative flex flex-col rounded-[18px] bg-paper p-2 text-left", n > 0 && "shadow-[inset_0_0_0_2px_var(--accent)]")}
              >
                <span className="plate block h-[84px] w-full">
                  <span className="grid size-full place-items-center text-black/30">
                    <Icon name="box" size={30} />
                  </span>
                  {p.image && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.image} alt="" className="absolute inset-0 size-full bg-[inherit] p-1.5" loading="lazy" onError={(e) => (e.currentTarget.style.display = "none")} />
                  )}
                </span>
                {n > 0 && (
                  <span className="absolute right-1.5 top-1.5 grid h-7 min-w-7 place-items-center rounded-full bg-accent px-1.5 text-[14px] font-bold text-white tnum">{n}</span>
                )}
                <span className="mt-2 line-clamp-2 min-h-[38px] px-1 text-[14.5px] font-medium leading-[1.3] text-ink">{p.name}</span>
                <span className="mt-1 flex items-center justify-between gap-1 px-1">
                  <span className="text-[16px] font-bold text-ink tnum">{money(p.price)}</span>
                  {tags.get(p.id) && (
                    <span className="inline-flex items-center gap-0.5 text-[12px] font-semibold text-accent">
                      <Icon name="tag" size={13} />
                      {tags.get(p.id)}
                    </span>
                  )}
                </span>
                <span className={cx("h-[18px] px-1 text-[12px] font-medium", p.stock === 0 ? "text-danger" : "text-warn")}>
                  {p.stock === 0 ? "⚠ Үлдэгдэл 0" : low ? `${p.stock} үлдсэн` : ""}
                </span>
              </button>
            );
          })}
        </div>
      )}
      {cam && <CameraScanner onScan={byCode} onClose={() => setCam(false)} />}
    </Screen>
  );
}

/* ───────── Mode B — дүнгээр ───────── */

function AmountMode() {
  const s = useSp();
  const pos = usePos();
  const amount = pos.draft.amount;
  const active = s.products.filter((p) => p.active && p.price > 0).length;
  const canSplit = active > 0 && active < SUGGEST_LIMIT;

  const key = (k: string) => {
    pos.setDraft((d) => {
      let v = String(d.amount || "");
      if (k === "back") v = v.slice(0, -1);
      else if (k === "enter") return d;
      else if (/^\d+$/.test(k)) v = (v + k).replace(/^0+/, "").slice(0, 9);
      return { ...d, amount: Number(v || 0), split: null };
    });
  };
  const next = () => pos.go(canSplit ? { s: "split" } : { s: "pay", job: { kind: "sale" } });
  useKeypad((k) => (k === "enter" ? amount > 0 && s.online && next() : key(k)));

  return (
    <Screen
      bottom={
        <Btn size="xl" block disabled={!amount || !s.online} onClick={next}>
          {amount ? `Төлбөр авах · ${money(amount)}` : "Дүн оруулна уу"}
        </Btn>
      }
    >
      <div className="flex h-full flex-col">
        {!s.online && <OfflineBanner />}
        <div className="flex flex-1 flex-col items-center justify-center px-4 py-3 text-center">
          <div className="text-[14px] text-mute">Төлөх дүн</div>
          <div className="mt-1">
            <Amount value={amount} size={amount > 9999999 ? 42 : 52} className={amount ? "" : "!text-mute"} />
          </div>
          <div className="mt-2 flex items-center gap-1.5 text-[12.5px] text-mute">
            <Icon name="receipt" size={14} />
            {!s.ebarimt ? "Ebarimt холбогдоогүй — баримт үүсэхгүй" : canSplit ? "Дараагийн алхамд бараагаар задалж болно" : "И-баримт «Бусад» төрлийн бараагаар үүснэ"}
          </div>
          <div className="mt-3">
            <CustomerChip />
          </div>
        </div>
        <div className="px-4 pb-3">
          <NumPad onKey={key} left={{ label: <span className="text-[22px] font-semibold text-ink">00</span>, key: "00" }} />
        </div>
      </div>
    </Screen>
  );
}
