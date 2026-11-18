"use client";

import { useMemo, useState } from "react";
import { categories, moneyPlain, tierRule } from "@/lib/demo";
import { partnerOf, shopItems } from "@/lib/app-data";
import { ORDER_STEPS, type Order, type PayMethod, itemById, lineTotal, orderStep, useApp } from "@/lib/app-store";
import { Chip, PrimaryButton, ProductImage, Stepper } from "@/components/ui";
import { ItemCard, Panel, PartnerMark, Won } from "@/components/app/AppUi";

/** Хамтрагч дэлгүүрийн хуудас — бараа ангиллаар, сагсанд нэмэх */
export function StorePanel({ partnerId, onClose, onCart }: { partnerId: string; onClose: () => void; onCart: () => void }) {
  const { cart, setQty, cartItems, cartPartnerId } = useApp();
  const partner = partnerOf(partnerId);
  const items = shopItems.filter((item) => item.partnerId === partnerId);
  const cats = categories.filter((c) => c.key === "бүгд" || items.some((i) => i.product.category === c.key));
  const [cat, setCat] = useState("бүгд");
  const visible = items.filter((i) => cat === "бүгд" || i.product.category === cat);
  const qtyOf = (id: string) => cart.find((l) => l.itemId === id)?.qty ?? 0;
  const inThisShop = cartPartnerId === partnerId ? cartItems : [];
  const total = inThisShop.reduce((s, { item, qty }) => s + lineTotal(item, qty), 0);

  const add = (itemId: string) => {
    const item = items.find((i) => i.id === itemId)!;
    if (cartPartnerId && cartPartnerId !== partnerId && !window.confirm(`Сагсанд ${partnerOf(cartPartnerId).name}-ийн бараа байна. Сагсыг цэвэрлээд энэ дэлгүүрээс авах уу?`)) return;
    setQty(item, qtyOf(itemId) + 1);
  };

  return (
    <Panel
      title={partner.name}
      onClose={onClose}
      footer={
        inThisShop.length > 0 ? (
          <PrimaryButton onClick={onCart} size="lg">
            Сагс · {inThisShop.reduce((s, l) => s + l.qty, 0)} бараа · {moneyPlain(total)}₮
          </PrimaryButton>
        ) : undefined
      }
    >
      <div className="flex items-start gap-3 rounded-[18px] bg-paper p-4 ring-1 ring-inset ring-hair">
        <PartnerMark partner={partner} size={52} />
        <div className="min-w-0 flex-1">
          <p className="text-[16px] font-bold text-ink">{partner.name}</p>
          <p className="text-[12px] text-mute">
            {partner.kind} · ★ {partner.rating} · {partner.distanceKm} км · {partner.hours}
          </p>
          <p className="mt-1 text-[12px] text-mute">{partner.address}</p>
          <p className="mt-2 text-[12px] font-semibold text-ink-2">
            {partner.delivery
              ? `Хүргэлт ${partner.delivery.minutes} мин · ${moneyPlain(partner.delivery.fee)}₮ · ${moneyPlain(partner.delivery.freeFrom)}₮-өөс дээш үнэгүй`
              : "Хүргэлтгүй — дэлгүүрт очиж авна"}
          </p>
          <p className="mt-1 text-[12px] font-semibold text-accent">Гишүүний оноон дээр +{partner.pointRate}% нэмэлт оноо</p>
        </div>
      </div>

      <div className="no-bar -mx-4 mt-4 flex gap-2 overflow-x-auto px-4">
        {cats.map((c) => (
          <Chip key={c.key} on={c.key === cat} onClick={() => setCat(c.key)} outlined>
            {c.label}
          </Chip>
        ))}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2.5">
        {visible.map((item) => (
          <ItemCard key={item.id} item={item} qty={qtyOf(item.id)} onAdd={() => add(item.id)} />
        ))}
      </div>
    </Panel>
  );
}

/** Сагс ба төлбөр — хүргэлтийн хаяг, оноо ашиглах, хэтэвч эсвэл QPay */
export function CartPanel({ onClose, onDone }: { onClose: () => void; onDone: (order: Order) => void }) {
  const { member, cartItems, cartPartnerId, setQty, balance, points, address: saved, checkout } = useApp();
  const [address, setAddress] = useState(saved);
  const [method, setMethod] = useState<PayMethod>("хэтэвч");
  const [usePoints, setUsePoints] = useState(false);
  const [error, setError] = useState("");

  const partner = cartPartnerId ? partnerOf(cartPartnerId) : null;
  const calc = useMemo(() => {
    if (!member || !partner?.delivery) return null;
    const subtotal = cartItems.reduce((s, { item, qty }) => s + lineTotal(item, qty), 0);
    const off = Math.round(subtotal * tierRule[member.tier].off);
    const fee = subtotal - off >= partner.delivery.freeFrom ? 0 : partner.delivery.fee;
    const due = subtotal - off + fee;
    const pts = usePoints ? Math.min(points, due) : 0;
    return { subtotal, off, fee, due, pts, pay: due - pts };
  }, [member, partner, cartItems, usePoints, points]);

  if (!partner || !calc) {
    return (
      <Panel title="Сагс" onClose={onClose}>
        <p className="mt-20 text-center text-[14px] text-mute">
          {partner && !partner.delivery ? "Энэ дэлгүүр хүргэлт хийдэггүй." : "Сагс хоосон байна. Дэлгүүрээс бараа нэмнэ үү."}
        </p>
      </Panel>
    );
  }

  const short = method === "хэтэвч" && calc.pay > balance;
  const submit = () => {
    const result = checkout({ method, usePoints: calc.pts, address });
    if (typeof result === "string") setError(result);
    else onDone(result);
  };

  return (
    <Panel
      title={`Сагс · ${partner.name}`}
      onClose={onClose}
      footer={
        <>
          {error && <p className="mb-2 text-[13px] font-semibold text-warn">{error}</p>}
          <PrimaryButton onClick={submit} size="lg" disabled={short || !address.trim()}>
            {method === "хэтэвч" ? "Хэтэвчээр" : "QPay-ээр"} төлөх · {moneyPlain(calc.pay)}₮
          </PrimaryButton>
        </>
      }
    >
      <ul className="divide-y divide-hair overflow-hidden rounded-[18px] bg-paper px-4 ring-1 ring-inset ring-hair">
        {cartItems.map(({ item, qty }) => (
          <li key={item.id} className="flex items-center gap-3 py-3">
            <span className="plate size-12 shrink-0">
              <ProductImage src={item.product.image} name={item.product.name} sizes="48px" pad="p-1.5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[14px] font-bold text-ink">{item.product.name}</span>
              <span className="tnum block text-[12px] text-mute">
                {moneyPlain(item.price)}₮{item.deal ? ` · ${item.deal}` : ""}
              </span>
            </span>
            <span className="flex flex-col items-end gap-1.5">
              <Won value={lineTotal(item, qty)} className="text-[14px] font-bold text-ink" />
              <Stepper qty={qty} compact onLess={() => setQty(item, qty - 1)} onMore={() => setQty(item, qty + 1)} />
            </span>
          </li>
        ))}
      </ul>

      <label className="mt-4 block">
        <span className="meta mb-1.5 block">Хүргэлтийн хаяг</span>
        <textarea
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          rows={2}
          placeholder="Дүүрэг, хороо, байр, орц, тоот"
          className="w-full resize-none rounded-xl bg-paper px-3.5 py-3 text-[15px] text-ink ring-1 ring-inset ring-hair placeholder:text-mute focus:outline-none focus:ring-accent"
        />
        <span className="mt-1 block text-[12px] text-mute">Хүргэлт {partner.delivery!.minutes} минут</span>
      </label>

      <div className="mt-4 rounded-[18px] bg-paper p-4 ring-1 ring-inset ring-hair">
        <span className="meta">Төлбөр</span>
        <div className="mt-2 grid grid-cols-2 gap-2">
          {(["хэтэвч", "qpay"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMethod(m)}
              aria-pressed={method === m}
              className={`press rounded-xl px-3 py-2.5 text-left ring-1 ring-inset ${method === m ? "bg-ink text-paper ring-ink" : "bg-stage text-ink ring-hair"}`}
            >
              <span className="block text-[14px] font-bold">{m === "хэтэвч" ? "Хэтэвч" : "QPay"}</span>
              <span className={`tnum block text-[11.5px] ${method === m ? "text-paper/70" : "text-mute"}`}>
                {m === "хэтэвч" ? `Үлдэгдэл ${moneyPlain(balance)}₮` : "Банкны апп"}
              </span>
            </button>
          ))}
        </div>
        {short && <p className="mt-2 text-[12px] font-semibold text-warn">Хэтэвчний үлдэгдэл хүрэлцэхгүй — «Хэтэвч» табаас оноогоо мөнгө болгох эсвэл цэнэглэнэ үү.</p>}

        <button
          type="button"
          onClick={() => setUsePoints((v) => !v)}
          aria-pressed={usePoints}
          disabled={points === 0}
          className="press mt-3 flex w-full items-center justify-between rounded-xl bg-stage px-3.5 py-3 text-left disabled:opacity-50"
        >
          <span>
            <span className="block text-[14px] font-bold text-ink">Оноо ашиглах</span>
            <span className="tnum block text-[12px] text-mute">{moneyPlain(points)} оноо байна · 1 оноо = 1₮</span>
          </span>
          <span className={`flex h-6 w-10 items-center rounded-full p-0.5 transition-colors ${usePoints ? "bg-accent" : "bg-hair"}`}>
            <span className={`size-5 rounded-full bg-white shadow transition-transform ${usePoints ? "translate-x-4" : ""}`} />
          </span>
        </button>
      </div>

      <dl className="tnum mt-4 space-y-1.5 rounded-[18px] bg-paper p-4 text-[13px] ring-1 ring-inset ring-hair">
        <Row label="Барааны дүн" value={`${moneyPlain(calc.subtotal)}₮`} />
        {calc.off > 0 && <Row label={`${member!.tier} гишүүний хөнгөлөлт`} value={`−${moneyPlain(calc.off)}₮`} accent />}
        <Row label="Хүргэлт" value={calc.fee ? `${moneyPlain(calc.fee)}₮` : "Үнэгүй"} />
        {calc.pts > 0 && <Row label="Оноо" value={`−${moneyPlain(calc.pts)}₮`} accent />}
        <div className="flex justify-between border-t border-hair pt-2 text-[15px] font-bold text-ink">
          <dt>Төлөх</dt>
          <dd>{moneyPlain(calc.pay)}₮</dd>
        </div>
      </dl>
    </Panel>
  );
}

const Row = ({ label, value, accent }: { label: string; value: string; accent?: boolean }) => (
  <div className="flex justify-between">
    <dt className="text-mute">{label}</dt>
    <dd className={accent ? "font-semibold text-accent" : "text-ink"}>{value}</dd>
  </div>
);

/** Захиалгын явц — 4 алхам, хүргэгдэх хүртэл */
export function OrderPanel({ order, onClose }: { order: Order; onClose: () => void }) {
  const { now } = useApp();
  const partner = partnerOf(order.partnerId);
  const step = orderStep(order, now);

  return (
    <Panel title={`Захиалга #${order.id}`} onClose={onClose}>
      <div className="rounded-[18px] bg-paper p-5 ring-1 ring-inset ring-hair">
        <div className="flex items-center gap-3">
          <PartnerMark partner={partner} />
          <div>
            <p className="text-[15px] font-bold text-ink">{partner.name}</p>
            <p className="text-[12px] text-mute">{order.address}</p>
          </div>
        </div>
        <ol className="mt-5 space-y-0">
          {ORDER_STEPS.map((label, i) => (
            <li key={label} className="flex gap-3">
              <span className="flex flex-col items-center">
                <span className={`grid size-6 place-items-center rounded-full text-[11px] font-bold ${i <= step ? "bg-accent text-[color:var(--accent-ink)]" : "bg-stage text-mute ring-1 ring-inset ring-hair"}`}>
                  {i < step ? "✓" : i + 1}
                </span>
                {i < ORDER_STEPS.length - 1 && <span className={`w-0.5 flex-1 ${i < step ? "bg-accent" : "bg-hair"}`} style={{ minHeight: 22 }} />}
              </span>
              <span className={`pb-4 text-[14px] ${i <= step ? "font-bold text-ink" : "text-mute"}`}>
                {label}
                {i === step && i < ORDER_STEPS.length - 1 && <span className="ml-2 text-[12px] font-semibold text-accent">одоо</span>}
              </span>
            </li>
          ))}
        </ol>
      </div>

      <ul className="mt-3 divide-y divide-hair rounded-[18px] bg-paper px-4 ring-1 ring-inset ring-hair">
        {order.lines.map((line) => {
          const item = itemById(line.itemId);
          return (
            <li key={line.itemId} className="flex justify-between py-2.5 text-[13px]">
              <span className="text-ink">
                {item.product.name} <span className="text-mute">× {line.qty}</span>
              </span>
              <Won value={lineTotal(item, line.qty)} className="text-ink" />
            </li>
          );
        })}
      </ul>

      <dl className="tnum mt-3 space-y-1.5 rounded-[18px] bg-paper p-4 text-[13px] ring-1 ring-inset ring-hair">
        {order.off > 0 && <Row label="Гишүүний хөнгөлөлт" value={`−${moneyPlain(order.off)}₮`} accent />}
        <Row label="Хүргэлт" value={order.deliveryFee ? `${moneyPlain(order.deliveryFee)}₮` : "Үнэгүй"} />
        {order.pointsUsed > 0 && <Row label="Оноо" value={`−${moneyPlain(order.pointsUsed)}₮`} accent />}
        <Row label={`Төлсөн (${order.method === "хэтэвч" ? "хэтэвч" : "QPay"})`} value={`${moneyPlain(order.paid)}₮`} />
        <Row label="Авсан оноо" value={`+${moneyPlain(order.earned)}`} accent />
      </dl>
    </Panel>
  );
}
