"use client";

/*
 * Хүргэлтийн захиалгын веб хуудас (BR04, US07, 6.2.2).
 * Мерчантын нэр, тайлбар, лого, өнгөөр брэндлэгдэнэ (BR04-4) — өнгө нь
 * мерчантын тохиргоо тул accent-аас өөр байж болно.
 */

import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { deliverable, fmtPhone, maskPhone, money, PLAN_MODULES } from "@/lib/sp/logic";
import { DISTRICTS } from "@/lib/sp/seed";
import { createOrder, issuePass, mutate, SpError, SpGate, useSp } from "@/lib/sp/store";
import type { Order, Product } from "@/lib/sp/types";
import { Btn, cx, Empty, Notice, SearchField, Sheet, Spinner, toast, Toaster } from "@/components/sp/ui";
import { Icon } from "@/components/sp/icons";
import { QrCode } from "@/components/QrCode";

type Cart = Record<string, number>;

export default function ShopApp() {
  return (
    <SpGate fallback={<div className="h-[100dvh] bg-stage" />}>
      <div className="min-h-[100dvh] bg-[var(--sp-fill)] md:py-0">
        <div className="sp-device mx-auto h-[100dvh] max-w-[480px] md:shadow-[0_0_0_1px_var(--sp-sep),0_30px_80px_-40px_rgb(0_0_0/0.35)]">
          <Shop />
          <Toaster bottom={110} />
        </div>
      </div>
    </SpGate>
  );
}

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();

function Shop() {
  const s = useSp();
  const page = s.delivery.page;
  const brand: CSSProperties = { background: page.color, color: "#fff" };
  const [orderId, setOrderId] = useState<string | null>(() => new URLSearchParams(window.location.search).get("order"));
  const [view, setView] = useState<"store" | "checkout" | "done">(() => (new URLSearchParams(window.location.search).get("order") ? "done" : "store"));
  const [cart, setCart] = useState<Cart>({});

  // ?order=<id> — захиалгын төлөвийг шууд харуулна
  useEffect(() => {
    const onPop = () => {
      const x = new URLSearchParams(window.location.search).get("order");
      setOrderId(x);
      setView(x ? "done" : "store");
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  useEffect(() => {
    document.title = `${page.name} — хүргэлтийн захиалга`;
  }, [page.name]);

  const open = s.delivery.enabled && PLAN_MODULES[s.merchant.plan].includes("delivery");

  if (view === "done" && orderId) {
    return (
      <Done
        id={orderId}
        brand={brand}
        onNew={() => {
          window.history.pushState(null, "", "/shop");
          setOrderId(null);
          setView("store");
        }}
      />
    );
  }

  if (!open)
    return (
      <div className="flex h-full flex-col items-center justify-center px-8 text-center">
        <Logo brand={brand} size={72} />
        <h1 className="mt-5 text-[24px] font-bold tracking-[-0.02em] text-ink">{page.name}</h1>
        <p className="mt-3 text-[16px] leading-snug text-mute">Одоогоор онлайн захиалга хүлээн авахгүй байна. Дэлгүүрээр зочлох эсвэл утсаар холбогдоно уу.</p>
        <a href={`tel:${s.merchant.phone}`} className="sp-tap mt-6 inline-flex h-[52px] items-center gap-2 rounded-[var(--sp-r-btn)] bg-[var(--sp-fill-2)] px-6 text-[17px] font-semibold text-ink">
          <Icon name="phone" size={20} /> {fmtPhone(s.merchant.phone)}
        </a>
        <Powered />
      </div>
    );

  return view === "checkout" ? (
    <Checkout
      cart={cart}
      setCart={setCart}
      brand={brand}
      onBack={() => setView("store")}
      onDone={(o) => {
        setCart({});
        window.history.pushState(null, "", `/shop?order=${o.id}`);
        setOrderId(o.id);
        setView("done");
      }}
    />
  ) : (
    <Store cart={cart} setCart={setCart} brand={brand} onCheckout={() => setView("checkout")} />
  );
}

function Logo({ brand, size = 56 }: { brand: CSSProperties; size?: number }) {
  const s = useSp();
  const page = s.delivery.page;
  return page.logo ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={page.logo} alt="" width={size} height={size} className="shrink-0 rounded-[16px] object-cover" style={{ width: size, height: size }} />
  ) : (
    <span className="grid shrink-0 place-items-center rounded-[16px] font-bold" style={{ ...brand, width: size, height: size, fontSize: size * 0.36 }}>
      {initials(page.name)}
    </span>
  );
}

const Powered = () => <p className="mt-6 text-center text-[12px] text-mute">Gerege POS-оор ажилладаг</p>;

const districtShort = (d: string) => ({ Баянзүрх: "БЗД", Сүхбаатар: "СБД", Чингэлтэй: "ЧД", "Хан-Уул": "ХУД", Баянгол: "БГД", Сонгинохайрхан: "СХД", Налайх: "НД", Багануур: "БНД", Багахангай: "БХД" })[d] ?? d;

/** Сагсны мөр — бараа, нийт дүн */
function useCartLines(cart: Cart) {
  const s = useSp();
  return useMemo(() => {
    const lines = Object.entries(cart)
      .map(([id, qty]) => ({ p: s.products.find((x) => x.id === id), qty }))
      .filter((x): x is { p: Product; qty: number } => !!x.p && x.qty > 0);
    const sum = lines.reduce((a, l) => a + l.p.price * l.qty, 0);
    const count = lines.reduce((a, l) => a + l.qty, 0);
    return { lines, sum, count };
  }, [cart, s.products]);
}

function Stepper({ qty, onChange, max, brand }: { qty: number; onChange: (n: number) => void; max: number; brand: CSSProperties }) {
  return (
    <div className="flex h-10 items-center rounded-full bg-[var(--sp-fill)]">
      <button type="button" aria-label="Хасах" onClick={() => onChange(qty - 1)} className="sp-tap grid size-10 place-items-center rounded-full text-ink">
        <Icon name={qty === 1 ? "trash" : "minus"} size={18} stroke={2.2} />
      </button>
      <span className="min-w-6 text-center text-[16px] font-semibold text-ink tnum">{qty}</span>
      <button
        type="button"
        aria-label="Нэмэх"
        onClick={() => (qty >= max ? toast(`${max} ширхэг л үлдсэн байна`, "danger") : onChange(qty + 1))}
        className="sp-tap grid size-10 place-items-center rounded-full"
        style={brand}
      >
        <Icon name="plus" size={18} stroke={2.4} />
      </button>
    </div>
  );
}

function Store({ cart, setCart, brand, onCheckout }: { cart: Cart; setCart: (c: Cart) => void; brand: CSSProperties; onCheckout: () => void }) {
  const s = useSp();
  const page = s.delivery.page;
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("all");
  const { sum, count } = useCartLines(cart);

  // Хүргэлттэй бараа: боломжтой нь дээр, зогссон / дууссан нь доор саарал
  const shown = s.products.filter((p) => p.active && p.delivery);
  const cats = s.categories.filter((c) => c.active && shown.some((p) => p.categoryId === c.id));
  const qq = q.trim().toLowerCase();
  const list = shown
    .filter((p) => (cat === "all" || p.categoryId === cat) && (!qq || p.name.toLowerCase().includes(qq)))
    .sort((a, b) => Number(deliverable(b)) - Number(deliverable(a)));
  const set = (id: string, n: number) => {
    const next = { ...cart };
    if (n <= 0) delete next[id];
    else next[id] = n;
    setCart(next);
  };

  return (
    <div className="flex h-full flex-col">
      <div className="sp-scroll min-h-0 flex-1 pb-6">
        <header className="px-4 pt-8">
          <div className="flex items-center gap-3.5">
            <Logo brand={brand} />
            <div className="min-w-0">
              <h1 className="text-[24px] font-bold leading-tight tracking-[-0.02em] text-ink">{page.name}</h1>
              {page.desc && <p className="mt-0.5 text-[15px] leading-snug text-mute">{page.desc}</p>}
            </div>
          </div>
          <div className="mt-3 flex items-center gap-2 text-[14px] font-semibold text-ink-2">
            <Icon name="truck" size={18} />
            <span>
              {s.delivery.fee ? `Хүргэлт ${money(s.delivery.fee)}` : "Үнэгүй хүргэлт"} · {s.delivery.districts.map(districtShort).join(", ")}
            </span>
          </div>
        </header>

        <div className="sticky top-0 z-10 bg-stage/90 px-4 pb-2 pt-3 backdrop-blur-md">
          <SearchField value={q} onChange={setQ} placeholder="Бараа хайх" />
          <div className="sp-scroll -mx-4 mt-2.5 flex gap-2 overflow-x-auto px-4">
            {[{ id: "all", name: "Бүгд" }, ...cats].map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setCat(c.id)}
                className={cx("sp-tap h-9 shrink-0 rounded-full px-4 text-[15px] font-semibold", cat === c.id ? "" : "bg-paper text-ink")}
                style={cat === c.id ? brand : undefined}
              >
                {c.name}
              </button>
            ))}
          </div>
        </div>

        {list.length === 0 ? (
          <Empty icon="search" title="Бараа олдсонгүй" body="Өөр нэрээр хайх эсвэл «Бүгд» ангиллыг сонгоно уу." />
        ) : (
          <div className="grid grid-cols-2 gap-2.5 px-4 pt-2 min-[440px]:gap-3">
            {list.map((p) => {
              const ok = deliverable(p);
              const qty = cart[p.id] ?? 0;
              const reason = p.stock <= 0 ? "Дууссан" : p.deliveryStopped ? "Хүргэлт түр зогссон · дэлгүүрээс авч болно" : null;
              return (
                <article key={p.id} className={cx("flex flex-col rounded-[18px] bg-paper p-2.5", !ok && "opacity-60")}>
                  <div className="relative aspect-square overflow-hidden rounded-[12px] bg-white">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={p.image} alt="" className={cx("size-full object-contain p-2", !ok && "grayscale")} loading="lazy" />
                  </div>
                  <h2 className="mt-2 line-clamp-2 min-h-[2.5em] text-[15px] leading-tight text-ink">{p.name}</h2>
                  <div className="mt-1 flex min-h-10 items-center justify-between gap-2">
                    <span className="text-[16px] font-bold text-ink tnum">{money(p.price)}</span>
                    {ok ? (
                      qty > 0 ? null : (
                        <button type="button" aria-label={`${p.name} нэмэх`} onClick={() => set(p.id, 1)} className="sp-tap grid size-10 place-items-center rounded-full" style={brand}>
                          <Icon name="plus" size={20} stroke={2.4} />
                        </button>
                      )
                    ) : (
                      <span className="grid size-10 place-items-center rounded-full bg-[var(--sp-fill)] text-mute" aria-hidden="true">
                        <Icon name={p.stock <= 0 ? "close" : "stop"} size={18} />
                      </span>
                    )}
                  </div>
                  {ok && qty > 0 && (
                    <div className="mt-1.5">
                      <Stepper qty={qty} max={p.stock} brand={brand} onChange={(n) => set(p.id, n)} />
                    </div>
                  )}
                  {reason && <p className="mt-1 text-[12px] font-medium leading-snug text-warn">{reason}</p>}
                </article>
              );
            })}
          </div>
        )}
        <Powered />
      </div>

      {count > 0 && (
        <div className="sp-material shrink-0 border-t border-[var(--sp-sep)] px-4 pb-[max(env(safe-area-inset-bottom),14px)] pt-3">
          <button type="button" onClick={onCheckout} className="sp-tap flex h-[56px] w-full items-center gap-3 rounded-[var(--sp-r-btn)] px-5 text-[17px] font-semibold" style={brand}>
            <Icon name="bag" size={22} />
            <span className="flex-1 text-left">Сагс · {count} бараа</span>
            <span className="tnum">{money(sum)}</span>
          </button>
        </div>
      )}
    </div>
  );
}

function Checkout({ cart, setCart, brand, onBack, onDone }: { cart: Cart; setCart: (c: Cart) => void; brand: CSSProperties; onBack: () => void; onDone: (o: Order) => void }) {
  const s = useSp();
  const { lines, sum, count } = useCartLines(cart);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [district, setDistrict] = useState(s.delivery.districts[0] ?? DISTRICTS[0]);
  const [addr, setAddr] = useState("");
  const [note, setNote] = useState("");
  const [later, setLater] = useState(false);
  const [optIn, setOptIn] = useState(false);
  const [touched, setTouched] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [pay, setPay] = useState(false);
  const [busy, setBusy] = useState(false);

  const fee = s.delivery.fee;
  const total = sum + fee;
  const outRange = !s.delivery.districts.includes(district);
  const phoneOk = /^\d{8}$/.test(phone);
  const valid = name.trim() && phoneOk && addr.trim() && !outRange && count > 0;

  useEffect(() => {
    if (count === 0) onBack();
  }, [count, onBack]);

  const place = () => {
    setBusy(true);
    setErr(null);
    setTimeout(() => {
      try {
        const o = createOrder({
          name: name.trim(),
          phone,
          address: addr.trim(),
          district,
          note: note.trim() || undefined,
          items: lines.map((l) => ({ productId: l.p.id, qty: l.qty })),
          payLater: later,
        });
        // BR06-5: харилцагч өөрөө зөвшөөрсөн бол opt-in
        if (optIn) mutate((x) => ({ ...x, customers: x.customers.map((c) => (c.id === o.customerId ? { ...c, optIn: true } : c)) }));
        setPay(false);
        onDone(o);
      } catch (e) {
        setPay(false);
        setErr(e instanceof SpError ? e.message : "Захиалга үүссэнгүй. Дахин оролдоно уу.");
      }
      setBusy(false);
    }, 500);
  };

  const submit = () => {
    setTouched(true);
    if (!valid) return;
    if (later) place();
    else setPay(true);
  };

  const fieldErr = (bad: boolean) => touched && bad;

  return (
    <div className="flex h-full flex-col">
      <header className="sp-material sticky top-0 z-10 grid h-[52px] shrink-0 grid-cols-[1fr_auto_1fr] items-center border-b border-[var(--sp-sep)] px-2">
        <button type="button" onClick={onBack} className="sp-tap flex h-11 items-center gap-0.5 pr-2 text-[17px] text-ink" aria-label="Буцах">
          <Icon name="back" size={24} stroke={2.2} /> Сагс
        </button>
        <h1 className="text-[17px] font-semibold text-ink">Хүргэлтийн мэдээлэл</h1>
        <span />
      </header>
      <div className="sp-scroll min-h-0 flex-1 px-4 pb-6">
        <Section title={`Сагс · ${count}`}>
          <div className="divide-y divide-[var(--sp-sep)] rounded-[18px] bg-paper">
            {lines.map((l) => (
              <div key={l.p.id} className="flex items-center gap-3 px-3 py-2.5">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={l.p.image} alt="" className="size-11 shrink-0 rounded-[10px] bg-white object-contain p-1" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[15px] text-ink">{l.p.name}</div>
                  <div className="text-[13px] text-mute tnum">{money(l.p.price * l.qty)}</div>
                </div>
                <Stepper
                  qty={l.qty}
                  max={l.p.stock}
                  brand={brand}
                  onChange={(n) => {
                    const next = { ...cart };
                    if (n <= 0) delete next[l.p.id];
                    else next[l.p.id] = n;
                    setCart(next);
                  }}
                />
              </div>
            ))}
          </div>
        </Section>

        <Section title="Хүлээн авагч">
          <div className="grid grid-cols-2 gap-3">
            <Input label="Нэр *" error={fieldErr(!name.trim()) ? "Нэрээ оруулна уу" : null}>
              <input className="sp-field" value={name} onChange={(e) => setName(e.target.value)} placeholder="Нэр" autoComplete="name" name="name" />
            </Input>
            <Input label="Утас *" error={fieldErr(!phoneOk) ? "8 оронтой дугаар" : null}>
              <input
                className="sp-field tnum"
                value={phone.length > 4 ? `${phone.slice(0, 4)} ${phone.slice(4)}` : phone}
                onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 8))}
                placeholder="9911 2233"
                inputMode="numeric"
                autoComplete="tel"
                name="phone"
              />
            </Input>
          </div>
        </Section>

        <Section title="Хаяг">
          <div className="space-y-3">
            <Input
              label="Дүүрэг *"
              error={
                outRange
                  ? `Энэ дүүрэг рүү хүргэлт хийдэггүй. Хүргэх бүс: ${s.delivery.districts.join(", ")}.`
                  : null
              }
            >
              <select
                className={cx("sp-field", outRange && "!shadow-[inset_0_0_0_1.5px_var(--danger)]")}
                value={district}
                onChange={(e) => setDistrict(e.target.value)}
                name="district"
                aria-invalid={outRange}
              >
                {DISTRICTS.map((d) => (
                  <option key={d} value={d}>
                    {d}
                    {s.delivery.districts.includes(d) ? "" : " — хүргэхгүй"}
                  </option>
                ))}
              </select>
            </Input>
            {outRange ? (
              <div className="rounded-[18px] bg-paper p-4">
                <p className="text-[15px] leading-snug text-ink">Дэлгүүрээс очиж авах бол утсаар холбогдоно уу.</p>
                <a href={`tel:${s.merchant.phone}`} className="sp-tap mt-3 flex h-12 items-center justify-center gap-2 rounded-[14px] bg-[var(--sp-fill)] text-[16px] font-semibold text-ink">
                  <Icon name="phone" size={19} /> Дэлгүүр рүү залгах
                </a>
              </div>
            ) : (
              <>
                <Input label="Хороо, байр, орц, тоот *" error={fieldErr(!addr.trim()) ? "Хаягаа оруулна уу" : null}>
                  <input className="sp-field" value={addr} onChange={(e) => setAddr(e.target.value)} placeholder="13-р хороо, 45-р байр, 2-р орц, 38 тоот" autoComplete="street-address" name="address" />
                </Input>
                <Input label="Нэмэлт тайлбар">
                  <input className="sp-field" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Орцны код, хүргэх цаг" name="note" />
                </Input>
              </>
            )}
          </div>
        </Section>

        {!outRange && (
          <>
            <Section title="Төлбөр">
              <div className="space-y-2.5">
                {[
                  { v: false, t: "Одоо төлөх", d: "Банкны аппаар эсвэл QR-аар" },
                  { v: true, t: "Хүргэлтээр төлөх", d: "Хүргэгч ирэхэд QR, карт эсвэл бэлнээр" },
                ].map((o) => {
                  const on = later === o.v;
                  return (
                    <button
                      key={o.t}
                      type="button"
                      role="radio"
                      aria-checked={on}
                      onClick={() => setLater(o.v)}
                      className="sp-tap flex w-full items-center gap-3.5 rounded-[18px] bg-paper p-4 text-left"
                      style={on ? { boxShadow: `inset 0 0 0 2px ${s.delivery.page.color}` } : { boxShadow: "inset 0 0 0 1px var(--hair)" }}
                    >
                      <span className="grid size-6 shrink-0 place-items-center rounded-full" style={on ? { background: s.delivery.page.color } : { boxShadow: "inset 0 0 0 1.5px var(--line)" }}>
                        {on && <span className="size-2.5 rounded-full bg-white" />}
                      </span>
                      <span>
                        <span className="block text-[17px] font-semibold text-ink">{o.t}</span>
                        <span className="block text-[14px] text-mute">{o.d}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </Section>

            <div className="mt-4 space-y-1.5 rounded-[18px] bg-paper p-4 text-[16px]">
              <div className="flex justify-between text-mute">
                <span>Бараа · {count}</span>
                <span className="tnum">{money(sum)}</span>
              </div>
              <div className="flex justify-between text-mute">
                <span>Хүргэлт</span>
                <span className={cx("tnum", !fee && "font-semibold text-ok")}>{fee ? money(fee) : "Үнэгүй хүргэлт"}</span>
              </div>
              <div className="flex justify-between pt-1 text-[18px] font-bold text-ink">
                <span>Нийт</span>
                <span className="tnum">{money(total)}</span>
              </div>
            </div>

            <label className="mt-4 flex cursor-pointer items-start gap-3 px-1">
              <input type="checkbox" checked={optIn} onChange={(e) => setOptIn(e.target.checked)} className="mt-0.5 size-5 shrink-0" style={{ accentColor: s.delivery.page.color }} />
              <span className="text-[14px] leading-snug text-mute">{s.delivery.page.name}-ын хямдрал, урамшууллын SMS авахыг зөвшөөрч байна. Хүссэн үедээ татгалзана.</span>
            </label>
          </>
        )}
        {err && (
          <div className="mt-4">
            <Notice tone="danger">{err}</Notice>
          </div>
        )}
      </div>

      <div className="sp-material shrink-0 border-t border-[var(--sp-sep)] px-4 pb-[max(env(safe-area-inset-bottom),12px)] pt-3">
        <button
          type="button"
          disabled={outRange || busy}
          onClick={submit}
          className="sp-tap flex h-[56px] w-full items-center justify-center gap-2 rounded-[var(--sp-r-btn)] text-[17px] font-semibold disabled:!bg-[var(--sp-fill-2)] disabled:!text-mute"
          style={brand}
        >
          {busy && <Spinner />}
          Захиалах · {money(total)}
        </button>
        {outRange && <p className="mt-2 text-center text-[13px] text-mute">Хүргэлтийн бүсэд байгаа хаяг оруулбал идэвхжинэ</p>}
      </div>

      <Sheet
        open={pay}
        onClose={() => !busy && setPay(false)}
        title="Төлбөр"
        footer={
          <button type="button" disabled={busy} onClick={place} className="sp-tap flex h-[52px] w-full items-center justify-center gap-2 rounded-[var(--sp-r-btn)] text-[17px] font-semibold" style={brand}>
            {busy && <Spinner />} Төлсөн, шалгах
          </button>
        }
      >
        <div className="flex flex-col items-center px-6 pb-3 pt-2 text-center">
          <div className="text-[34px] font-bold tracking-[-0.03em] text-ink tnum">{money(total)}</div>
          <div className="mt-3 rounded-[16px] bg-white p-2">
            <QrCode value={`gepos:shop:${s.merchant.regNo}:${total}:${phone}`} size={180} label="Төлбөрийн QR" />
          </div>
          <p className="mt-3 text-[14px] leading-snug text-mute">Банкны аппаараа QR-ыг уншуулж төлнө үү. Утсан дээр бол QR-ыг дарж банкны аппаа сонгоно.</p>
        </div>
      </Sheet>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="pt-5">
      <h2 className="px-1 pb-2 text-[13px] font-semibold uppercase tracking-[0.02em] text-mute">{title}</h2>
      {children}
    </section>
  );
}

function Input({ label, error, children }: { label: string; error?: string | null; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[13px] font-medium text-ink-2">{label}</span>
      {children}
      {error && (
        <span className="mt-1.5 flex items-start gap-1.5 text-[13px] leading-snug text-danger">
          <Icon name="warn" size={15} className="mt-px" /> {error}
        </span>
      )}
    </label>
  );
}

function Done({ id, brand, onNew }: { id: string; brand: CSSProperties; onNew: () => void }) {
  const s = useSp();
  const o = s.orders.find((x) => x.id === id);
  const page = s.delivery.page;
  if (!o)
    return (
      <div className="flex h-full flex-col justify-center">
        <Empty icon="search" title="Захиалга олдсонгүй" body="Холбоос буруу эсвэл хугацаа нь дууссан байна." action={<Btn onClick={onNew}>Дэлгүүр рүү буцах</Btn>} />
      </div>
    );

  const statuses = s.delivery.statuses;
  const idx = statuses.findIndex((x) => x.id === o.statusId);
  const final = statuses[idx]?.final;
  const cust = s.customers.find((c) => c.id === o.customerId);
  const showPass = s.merchant.plan === "premium" && s.pass.published && cust && !cust.erased;

  return (
    <div className="sp-scroll h-full px-4 pb-8 pt-10">
      <div className="flex flex-col items-center text-center">
        <span className="grid size-[68px] place-items-center rounded-full" style={o.cancel ? undefined : brand}>
          {o.cancel ? (
            <span className="grid size-[68px] place-items-center rounded-full bg-danger-soft text-danger">
              <Icon name="close" size={34} stroke={2.6} />
            </span>
          ) : (
            <Icon name="check" size={34} stroke={2.6} />
          )}
        </span>
        <h1 className="mt-4 text-[26px] font-bold tracking-[-0.02em] text-ink">{o.cancel ? "Захиалга цуцлагдлаа" : final ? "Хүргэгдлээ" : "Захиалга хүлээн авлаа"}</h1>
        <p className="mt-1 text-[15px] text-mute">
          #{o.no} · {page.name}
        </p>
      </div>

      {!o.cancel && !final && (
        <section className="mt-6 rounded-[20px] bg-paper p-5 text-center">
          <h2 className="text-[16px] font-semibold text-ink">Ачаа хүлээн авах код</h2>
          <div className="mt-3 flex justify-center gap-2">
            {o.code.split("").map((d, i) => (
              <span key={i} className="grid h-14 w-11 place-items-center rounded-[12px] bg-[var(--sp-fill)] text-[28px] font-bold text-ink tnum">
                {d}
              </span>
            ))}
          </div>
          <p className="mt-3 text-[15px] font-medium leading-snug text-ink">Хүргэгчид энэ кодыг хэлнэ үү.</p>
          <p className="text-[14px] leading-snug text-mute">Кодгүйгээр хүргэлт дуусахгүй.</p>
          {s.delivery.sms && (
            <p className="mt-3 flex items-center justify-center gap-1.5 text-[13px] text-mute">
              <Icon name="sms" size={16} /> Код, төлөвийг {maskPhone(o.phone)} руу SMS-ээр илгээсэн
            </p>
          )}
        </section>
      )}

      {o.cancel ? (
        <div className="mt-6">
          <Notice tone="danger" icon="info">
            {o.cancel.refunded ? "Төлбөр тань буцаагдана. Асуух зүйл байвал дэлгүүр рүү залгана уу." : "Дэлгүүр захиалгыг цуцалсан. Асуух зүйл байвал залгана уу."}
          </Notice>
        </div>
      ) : (
        <section className="mt-3 rounded-[20px] bg-paper p-5" aria-label="Захиалгын төлөв">
          <ol className="relative space-y-4">
            {statuses.map((st, i) => {
              const done = i <= idx;
              const at = o.history.filter((h) => h.statusId === st.id).pop()?.at;
              return (
                <li key={st.id} className="relative flex items-start gap-3">
                  {i < statuses.length - 1 && <span className="absolute left-[11px] top-6 h-[calc(100%-4px)] w-0.5" style={{ background: i < idx ? page.color : "var(--sp-fill-2)" }} />}
                  <span className="relative z-[1] grid size-6 shrink-0 place-items-center rounded-full" style={done ? brand : { background: "var(--sp-fill-2)" }}>
                    {done ? <Icon name="check" size={14} stroke={3} /> : <span className="size-2 rounded-full bg-[var(--line)]" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className={cx("block text-[16px]", done ? "font-semibold text-ink" : "text-mute")}>{st.name}</span>
                    {at && <span className="block text-[13px] text-mute tnum">{new Date(at).toLocaleTimeString("mn-MN", { hour: "2-digit", minute: "2-digit", hour12: false })}</span>}
                  </span>
                  {i === idx && !final && <span className="sp-pulse mt-1.5 size-2 rounded-full" style={{ background: page.color }} aria-hidden="true" />}
                </li>
              );
            })}
          </ol>
        </section>
      )}

      <section className="mt-3 space-y-1.5 rounded-[20px] bg-paper p-5 text-[15px]">
        {o.lines.map((l, i) => (
          <div key={i} className="flex justify-between gap-3">
            <span className="text-ink-2">
              {l.name} <span className="text-mute">×{l.qty}</span>
            </span>
            <span className="shrink-0 text-ink-2 tnum">{money(l.qty * l.price)}</span>
          </div>
        ))}
        <div className="flex justify-between text-mute">
          <span>Хүргэлт</span>
          <span className="tnum">{o.fee ? money(o.fee) : "Үнэгүй"}</span>
        </div>
        <div className="flex justify-between border-t border-[var(--sp-sep)] pt-2 text-[17px] font-bold text-ink">
          <span>{o.paid ? "Төлсөн" : "Хүргэлтээр төлнө"}</span>
          <span className="tnum">{money(o.total)}</span>
        </div>
      </section>

      {showPass && cust && (
        <section className="mt-3 rounded-[20px] bg-paper p-5">
          <h2 className="text-[17px] font-semibold text-ink">Хөнгөлөлтийн карт</h2>
          {cust.passSerial ? (
            <div className="mt-3 flex items-center gap-3 rounded-[16px] p-4" style={{ background: s.pass.bg, color: s.pass.fg }}>
              <div className="min-w-0 flex-1">
                <div className="text-[13px] opacity-70">{page.name}</div>
                <div className="text-[20px] font-bold">
                  {cust.points.toLocaleString("en-US")} {s.pass.label.toLowerCase()}
                </div>
                <div className="mt-1 text-[12px] opacity-70 tnum">{cust.passSerial}</div>
              </div>
              <div className="rounded-[8px] bg-white p-1">
                <QrCode value={cust.passSerial} size={64} label="Картын QR" />
              </div>
            </div>
          ) : (
            <>
              <p className="mt-1 text-[14px] leading-snug text-mute">Дараагийн худалдан авалтаас оноо цуглуулахын тулд картаа утсандаа хадгална уу.</p>
              <Btn
                variant="gray"
                block
                icon="wallet"
                className="mt-3"
                onClick={() => {
                  issuePass(cust.id);
                  toast("Карт бэлэн боллоо", "ok");
                }}
              >
                Хөнгөлөлтийн карт авах
              </Btn>
            </>
          )}
        </section>
      )}

      <div className="mt-4 space-y-2">
        <a href={`tel:${s.merchant.phone}`} className="sp-tap flex h-[52px] items-center justify-center gap-2 rounded-[var(--sp-r-btn)] bg-[var(--sp-fill-2)] text-[17px] font-semibold text-ink">
          <Icon name="phone" size={20} /> Дэлгүүр рүү залгах
        </a>
        <button type="button" onClick={onNew} className="sp-tap h-11 w-full text-[16px] font-semibold text-ink-2">
          Шинэ захиалга өгөх
        </button>
      </div>
      <Powered />
    </div>
  );
}
