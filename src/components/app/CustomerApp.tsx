"use client";

import { type ReactNode, useEffect, useMemo, useState } from "react";
import { LayoutGroup, MotionConfig, motion } from "motion/react";
import { memberHistory, members, moneyPlain } from "@/lib/demo";
import { type FinancePartner, deals, financePartners, partnerOf, partners } from "@/lib/app-data";
import { AppStoreProvider, ORDER_STEPS, type Order, orderStep, useApp } from "@/lib/app-store";
import { Wordmark, IconLogout, IconQr } from "@/components/icons";
import { Chip, PrimaryButton } from "@/components/ui";
import { CustomerLogin, MemberQr, TierPerks } from "@/components/CustomerCorner";
import { FinanceCoupon, ItemCard, Panel, PartnerMark, SectionHead, Won } from "@/components/app/AppUi";
import { CartPanel, OrderPanel, StorePanel } from "@/components/app/Shop";
import { WalletCard } from "@/components/app/WalletCard";
import LoyaltyApp from "@/components/app/LoyaltyApp";
import { customerApiBase } from "@/lib/customer-api";

/**
 * Gerege — хэрэглэгчийн апп (CU маягийн).
 *
 * Таван таб: Нүүр · Урамшуулал · Дэлгүүр · Хэтэвч · Миний.
 * Gerege POS ашигладаг бүх дэлгүүр нэг сүлжээ: урамшуулал нь энд
 * нийтлэгдэж, оноо нь нэг хэтэвчинд хуримтлагдаж, мөнгө болж хаана ч
 * зарцуулагдана.
 */

export type Tab = "home" | "deals" | "stores" | "wallet" | "me";

/* Сервер тохируулагдсан бол (NEXT_PUBLIC_GEREGE_API, эсвэл локал :3001) серверийн гишүүнчлэл;
   эс бөгөөс (эсвэл ?demo=1) хуучин туршилтын апп. Хоёулаа ижил header, доод цэстэй. */
export default function CustomerApp() {
  const [mode, setMode] = useState<"pending" | "server" | "demo">("pending");
  useEffect(() => {
    const timer = setTimeout(() => {
      const demo = new URLSearchParams(window.location.search).get("demo") === "1";
      setMode(!demo && customerApiBase() ? "server" : "demo");
    }, 0);
    return () => clearTimeout(timer);
  }, []);
  if (mode === "pending") return <main className="min-h-dvh bg-stage" />;
  if (mode === "server") return <LoyaltyApp />;
  return (
    <AppStoreProvider>
      <Shell />
    </AppStoreProvider>
  );
}

function Shell() {
  const app = useApp();
  const { ready, member, login, logout, cartItems } = app;
  const [tab, setTab] = useState<Tab>("home");
  const [store, setStore] = useState<string | null>(null);
  const [cartOpen, setCartOpen] = useState(false);
  const [order, setOrder] = useState<Order | null>(null);
  const [showQr, setShowQr] = useState(false);
  const [finance, setFinance] = useState<FinancePartner | null>(null);

  // ?code=GRG-… — кассын «Урамшуулал» хуудаснаас шууд нээх (туршилт)
  useEffect(() => {
    if (!ready) return;
    const code = new URLSearchParams(window.location.search).get("code");
    const hit = code ? members.find((m) => m.code === code) : undefined;
    if (hit) {
      login(hit);
      window.history.replaceState(null, "", window.location.pathname);
    }
  }, [ready, login]);

  if (!ready) return <main className="min-h-dvh bg-stage" />;

  if (!member) {
    return (
      <main className="min-h-dvh bg-stage">
        <div className="mx-auto w-full max-w-[440px] px-4 pb-10 pt-5">
          <Wordmark />
          <CustomerLogin onLogin={login} />
        </div>
      </main>
    );
  }

  const cartCount = cartItems.reduce((s, l) => s + l.qty, 0);
  const openStore = (id: string) => setStore(id);

  return (
    <main className="min-h-dvh bg-stage">
      <div className="mx-auto w-full max-w-[440px] px-4 pb-[calc(96px+env(safe-area-inset-bottom))] pt-4">
        <header className="flex items-center justify-between">
          <Wordmark />
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setShowQr(true)}
              aria-label="Миний QR"
              className="press grid size-10 place-items-center rounded-xl text-ink hover:bg-paper"
            >
              <IconQr />
            </button>
            <button
              type="button"
              onClick={() => setCartOpen(true)}
              aria-label="Сагс"
              className="press relative grid size-10 place-items-center rounded-xl text-ink hover:bg-paper"
            >
              <CartIcon />
              {cartCount > 0 && (
                <span className="tnum absolute -right-0.5 -top-0.5 grid min-w-5 place-items-center rounded-full bg-accent px-1 text-[10px] font-bold leading-5 text-[color:var(--accent-ink)]">
                  {cartCount}
                </span>
              )}
            </button>
          </div>
        </header>

        {tab === "home" && <HomeTab onStore={openStore} onFinance={setFinance} onTab={setTab} onOrder={setOrder} onQr={() => setShowQr(true)} />}
        {tab === "deals" && <DealsTab onStore={openStore} onFinance={setFinance} />}
        {tab === "stores" && <StoresTab onStore={openStore} />}
        {tab === "wallet" && <WalletTab onQr={() => setShowQr(true)} />}
        {tab === "me" && <MeTab onOrder={setOrder} onLogout={logout} />}
      </div>

      <BottomNav tab={tab} onTab={setTab} />

      {store && (
        <StorePanel
          partnerId={store}
          onClose={() => setStore(null)}
          onCart={() => {
            setStore(null);
            setCartOpen(true);
          }}
        />
      )}
      {cartOpen && (
        <CartPanel
          onClose={() => setCartOpen(false)}
          onDone={(placed) => {
            setCartOpen(false);
            setOrder(placed);
          }}
        />
      )}
      {order && <OrderPanel order={order} onClose={() => setOrder(null)} />}
      {finance && <FinancePanel partner={finance} onClose={() => setFinance(null)} onStore={(id) => { setFinance(null); openStore(id); }} />}
      {showQr && (
        <Panel title="Миний QR" onClose={() => setShowQr(false)}>
          <MemberQr member={member} size={260} />
        </Panel>
      )}
    </main>
  );
}

/* Урамшууллын картаас сагсанд нэмэх — нэг захиалга нэг дэлгүүрээс */
function useAddDeal() {
  const { cart, setQty, cartPartnerId } = useApp();
  const qtyOf = (id: string) => cart.find((l) => l.itemId === id)?.qty ?? 0;
  const add = (item: (typeof deals)[number]) => {
    if (
      cartPartnerId &&
      cartPartnerId !== item.partnerId &&
      !window.confirm(`Сагсанд ${partnerOf(cartPartnerId).name}-ийн бараа байна. Сагсыг цэвэрлээд энэ дэлгүүрээс авах уу?`)
    )
      return;
    setQty(item, qtyOf(item.id) + 1);
  };
  return { qtyOf, add };
}

/* ───────────────────────── Нүүр ───────────────────────── */

function HomeTab({
  onStore,
  onFinance,
  onTab,
  onOrder,
  onQr,
}: {
  onStore: (id: string) => void;
  onFinance: (partner: FinancePartner) => void;
  onTab: (tab: Tab) => void;
  onOrder: (order: Order) => void;
  onQr: () => void;
}) {
  const { member, balance, points, orders, now } = useApp();
  const { qtyOf, add } = useAddDeal();
  const first = member!.kind === "хүн" ? member!.name.split(". ").pop() : member!.name;
  const active = orders.filter((o) => orderStep(o, now) < ORDER_STEPS.length - 1);
  const fresh = partners.filter((p) => p.isNew);

  return (
    <>
      <section className="mt-6">
        <p className="meta">{member!.tier} гишүүн</p>
        <h1 className="mt-1.5 text-[30px] font-extrabold leading-[0.98] tracking-[-0.045em] text-ink">
          Сайн байна уу, <span className="text-mute">{first}</span>
          <span className="text-accent">.</span>
        </h1>
      </section>

      {/* Хэтэвч — хар 3D карт */}
      <section className="mt-5">
        <WalletCard
          member={member!}
          balance={balance}
          points={points}
          onQr={onQr}
          action={
            <button type="button" onClick={() => onTab("wallet")} className="press h-11 w-full rounded-xl bg-accent text-[14px] font-bold text-[color:var(--accent-ink)]">
              Оноог мөнгө болгох →
            </button>
          }
        />
      </section>

      {active.length > 0 && (
        <>
          <SectionHead title="Явж буй захиалга" />
          <div className="space-y-2">
            {active.map((o) => (
              <OrderRow key={o.id} order={o} onOpen={() => onOrder(o)} />
            ))}
          </div>
        </>
      )}

      <SectionHead title="Шинэ хамтрагчид" action={<TextLink onClick={() => onTab("stores")}>Бүгд</TextLink>} />
      <div className="no-bar -mx-4 flex gap-2.5 overflow-x-auto px-4">
        {financePartners
          .filter((p) => p.isNew)
          .map((p) => (
            <FinanceCard key={p.id} partner={p} onOpen={() => onFinance(p)} isNew />
          ))}
        {fresh.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => onStore(p.id)}
            className="press w-[200px] shrink-0 rounded-[18px] bg-paper p-4 text-left ring-1 ring-inset ring-hair"
          >
            <div className="flex items-center justify-between">
              <PartnerMark partner={p} />
              <span className="rounded-full bg-accent-soft px-2 py-1 text-[10.5px] font-bold text-accent">ШИНЭ</span>
            </div>
            <p className="mt-3 truncate text-[14px] font-bold text-ink">{p.name}</p>
            <p className="text-[12px] text-mute">
              {p.kind} · {p.distanceKm} км
            </p>
            <p className="mt-1.5 text-[12px] font-semibold text-accent">+{p.pointRate}% нэмэлт оноо</p>
          </button>
        ))}
      </div>

      <SectionHead title="Онцлох урамшуулал" action={<TextLink onClick={() => onTab("deals")}>Бүгд</TextLink>} />
      <div className="grid grid-cols-2 gap-2.5">
        {deals.slice(0, 4).map((item) => (
          <ItemCard
            key={item.id}
            item={item}
            partner={partnerOf(item.partnerId)}
            showShop
            qty={qtyOf(item.id)}
            onAdd={() => add(item)}
            onShop={() => onStore(item.partnerId)}
          />
        ))}
      </div>
    </>
  );
}

/* ───────────────────────── Урамшуулал ───────────────────────── */

function DealsTab({ onStore, onFinance }: { onStore: (id: string) => void; onFinance: (partner: FinancePartner) => void }) {
  const { qtyOf, add } = useAddDeal();
  const [shop, setShop] = useState("бүгд");
  const visible = deals.filter((d) => shop === "бүгд" || d.partnerId === shop);

  return (
    <>
      <section className="mt-6">
        <p className="meta">Хамтрагч дэлгүүрүүд</p>
        <h1 className="mt-1.5 text-[30px] font-extrabold leading-[0.98] tracking-[-0.045em] text-ink">
          Урамшуулал<span className="text-accent">.</span>
        </h1>
        <p className="mt-2 text-[13px] text-mute">Хаанаас, юуг хямд авах — Gerege POS ашигладаг бүх дэлгүүрийн хямдрал нэг дор.</p>
      </section>

      <SectionHead title="Карт, төлбөрийн урамшуулал" />
      <div className="no-bar -mx-4 flex gap-2.5 overflow-x-auto px-4">
        {financePartners.map((p) => (
          <FinanceCard key={p.id} partner={p} onOpen={() => onFinance(p)} />
        ))}
      </div>

      <SectionHead title="Барааны хямдрал" />
      <div className="no-bar -mx-4 flex gap-2 overflow-x-auto px-4">
        <Chip on={shop === "бүгд"} onClick={() => setShop("бүгд")} outlined>
          Бүгд · {deals.length}
        </Chip>
        {partners
          .filter((p) => deals.some((d) => d.partnerId === p.id))
          .map((p) => (
            <Chip key={p.id} on={shop === p.id} onClick={() => setShop(p.id)} outlined>
              {p.name}
            </Chip>
          ))}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2.5">
        {visible.map((item) => (
          <ItemCard
            key={item.id}
            item={item}
            partner={partnerOf(item.partnerId)}
            showShop
            qty={qtyOf(item.id)}
            onAdd={() => add(item)}
            onShop={() => onStore(item.partnerId)}
          />
        ))}
      </div>
    </>
  );
}

/* ───────────────────────── Дэлгүүр ───────────────────────── */

function StoresTab({ onStore }: { onStore: (id: string) => void }) {
  const [onlyDelivery, setOnlyDelivery] = useState(false);
  const list = useMemo(
    () => [...partners].sort((a, b) => a.distanceKm - b.distanceKm).filter((p) => !onlyDelivery || p.delivery),
    [onlyDelivery],
  );

  return (
    <>
      <section className="mt-6">
        <p className="meta">Gerege POS сүлжээ</p>
        <h1 className="mt-1.5 text-[30px] font-extrabold leading-[0.98] tracking-[-0.045em] text-ink">
          Хамтрагч дэлгүүрүүд<span className="text-accent">.</span>
        </h1>
      </section>

      <div className="mt-4 flex gap-2">
        <Chip on={!onlyDelivery} onClick={() => setOnlyDelivery(false)} outlined>
          Бүгд
        </Chip>
        <Chip on={onlyDelivery} onClick={() => setOnlyDelivery(true)} outlined>
          Хүргэлттэй
        </Chip>
      </div>

      <ul className="mt-4 space-y-2.5">
        {list.map((p) => (
          <li key={p.id}>
            <button
              type="button"
              onClick={() => onStore(p.id)}
              className="press flex w-full items-center gap-3 rounded-[18px] bg-paper p-4 text-left ring-1 ring-inset ring-hair"
            >
              <PartnerMark partner={p} size={48} />
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5">
                  <span className="truncate text-[15px] font-bold text-ink">{p.name}</span>
                  {p.isNew && <span className="rounded-full bg-accent-soft px-1.5 py-0.5 text-[10px] font-bold text-accent">ШИНЭ</span>}
                </span>
                <span className="block text-[12px] text-mute">
                  {p.kind} · ★ {p.rating} · {p.distanceKm} км
                </span>
                <span className="mt-1 block text-[12px] font-semibold text-ink-2">
                  {p.delivery ? `Хүргэлт ${p.delivery.minutes} мин · ${moneyPlain(p.delivery.fee)}₮` : "Очиж авна"}
                  <span className="text-accent"> · +{p.pointRate}% оноо</span>
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}

/* ───────────────────────── Хэтэвч ───────────────────────── */

function WalletTab({ onQr }: { onQr: () => void }) {
  const { member, balance, points, txns, convertPoints, topUp } = useApp();
  const [amount, setAmount] = useState("");
  const [topping, setTopping] = useState(false);
  const want = Math.min(Number(amount) || 0, points);

  return (
    <>
      <section className="mt-6">
        <WalletCard
          member={member!}
          balance={balance}
          points={points}
          onQr={onQr}
          action={
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setTopping(true)} className="press h-11 rounded-xl bg-ink text-[14px] font-bold text-paper">
                Цэнэглэх
              </button>
              <button type="button" onClick={() => convertPoints(points)} disabled={!points} className="press h-11 rounded-xl bg-accent text-[14px] font-bold text-[color:var(--accent-ink)] disabled:opacity-50">
                Бүх оноог мөнгө болгох
              </button>
            </div>
          }
        />
        <p className="mt-2 text-center text-[12px] text-mute">Gerege POS-той бүх хамтрагч дэлгүүрт төлнө.</p>
      </section>

      {/* Оноо → мөнгө */}
      <section className="mt-3 rounded-[22px] bg-paper p-5 ring-1 ring-inset ring-hair">
        <div className="flex items-baseline justify-between">
          <span className="meta">Урамшууллын оноо</span>
          <span className="tnum text-[22px] font-bold tracking-[-0.03em] text-ink">{moneyPlain(points)}</span>
        </div>
        <p className="mt-1 text-[12px] text-mute">1 оноо = 1₮. Хүссэн хэмжээгээрээ хэтэвч рүү мөнгө болгон шилжүүлнэ.</p>
        <div className="mt-3 flex gap-2">
          <input
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/\D/g, ""))}
            inputMode="numeric"
            placeholder="Оноо"
            className="tnum h-12 min-w-0 flex-1 rounded-xl bg-stage px-3.5 text-[15px] text-ink ring-1 ring-inset ring-transparent placeholder:text-mute focus:bg-paper focus:outline-none focus:ring-accent"
          />
          <button
            type="button"
            disabled={!want}
            onClick={() => {
              convertPoints(want);
              setAmount("");
            }}
            className="press h-12 shrink-0 rounded-xl bg-ink px-4 text-[14px] font-bold text-paper disabled:opacity-40"
          >
            {want ? `+${moneyPlain(want)}₮ болгох` : "Мөнгө болгох"}
          </button>
        </div>
      </section>

      <SectionHead title="Гүйлгээ" />
      {txns.length === 0 ? (
        <p className="rounded-[18px] bg-paper p-5 text-center text-[13px] text-mute ring-1 ring-inset ring-hair">Гүйлгээ алга. Оноогоо мөнгө болгох эсвэл захиалга хийнэ үү.</p>
      ) : (
        <ul className="divide-y divide-hair rounded-[18px] bg-paper px-4 ring-1 ring-inset ring-hair">
          {txns.map((t) => (
            <li key={t.id} className="flex items-center justify-between gap-3 py-3">
              <span className="min-w-0">
                <span className="block truncate text-[14px] font-bold text-ink">{t.title}</span>
                <span className="tnum block text-[12px] text-mute">{new Date(t.at).toLocaleString("mn-MN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
              </span>
              <span className="tnum shrink-0 text-right text-[13px]">
                {t.money !== 0 && <span className={`block font-bold ${t.money > 0 ? "text-ink" : "text-mute"}`}>{t.money > 0 ? "+" : "−"}{moneyPlain(Math.abs(t.money))}₮</span>}
                {t.points !== 0 && <span className={`block font-semibold ${t.points > 0 ? "text-accent" : "text-mute"}`}>{t.points > 0 ? "+" : "−"}{moneyPlain(Math.abs(t.points))} оноо</span>}
              </span>
            </li>
          ))}
        </ul>
      )}

      {topping && (
        <Panel title="Хэтэвч цэнэглэх" onClose={() => setTopping(false)}>
          <p className="text-[13px] text-mute">QPay-ээр цэнэглэнэ. Туршилтын хувилбарт шууд орно.</p>
          <div className="mt-4 grid grid-cols-2 gap-2">
            {[10_000, 20_000, 50_000, 100_000].map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => {
                  topUp(v);
                  setTopping(false);
                }}
                className="press h-14 rounded-xl bg-paper text-[16px] font-bold text-ink ring-1 ring-inset ring-hair hover:ring-ink"
              >
                <Won value={v} />
              </button>
            ))}
          </div>
        </Panel>
      )}
    </>
  );
}

/* ───────────────────────── Миний ───────────────────────── */

function MeTab({ onOrder, onLogout }: { onOrder: (order: Order) => void; onLogout: () => void }) {
  const { member, orders } = useApp();
  const inStore = useMemo(() => memberHistory(member!, 4), [member]);

  return (
    <>
      <section className="mt-6">
        <p className="meta">
          {member!.tier} гишүүн · {member!.kind === "байгууллага" ? `ТТД ${member!.tin}` : member!.phone}
        </p>
        <h1 className="mt-1.5 text-[30px] font-extrabold leading-[0.98] tracking-[-0.045em] text-ink">
          {member!.name}
          <span className="text-accent">.</span>
        </h1>
      </section>

      <div className="mt-5">
        <MemberQr member={member!} />
      </div>
      <div className="mt-3">
        <TierPerks member={member!} />
      </div>

      <SectionHead title="Хүргэлтийн захиалга" />
      {orders.length === 0 ? (
        <p className="rounded-[18px] bg-paper p-5 text-center text-[13px] text-mute ring-1 ring-inset ring-hair">Захиалга алга.</p>
      ) : (
        <div className="space-y-2">
          {orders.map((o) => (
            <OrderRow key={o.id} order={o} onOpen={() => onOrder(o)} />
          ))}
        </div>
      )}

      <SectionHead title="Дэлгүүрт хийсэн худалдан авалт" />
      <ul className="divide-y divide-hair rounded-[18px] bg-paper px-4 ring-1 ring-inset ring-hair">
        {inStore.map((v) => (
          <li key={v.id} className="flex items-center justify-between gap-3 py-3">
            <span className="min-w-0">
              <span className="block truncate text-[14px] font-bold text-ink">{v.branch}</span>
              <span className="tnum block text-[12px] text-mute">
                {v.date}
                {v.off > 0 && ` · хөнгөлөлт −${moneyPlain(v.off)}₮`}
              </span>
            </span>
            <span className="tnum shrink-0 text-right">
              <span className="block text-[14px] font-bold text-ink">{moneyPlain(v.paid)}₮</span>
              <span className="block text-[12px] font-semibold text-accent">+{moneyPlain(v.earned)} оноо</span>
            </span>
          </li>
        ))}
      </ul>

      <div className="mt-6">
        <PrimaryButton onClick={onLogout} tone="ink" arrow={false}>
          <span className="flex items-center gap-2">
            <IconLogout /> Гарах
          </span>
        </PrimaryButton>
      </div>
    </>
  );
}

/* ───────────────────────── банк, төлбөр ───────────────────────── */

function FinanceCard({ partner, onOpen, isNew }: { partner: FinancePartner; onOpen: () => void; isNew?: boolean }) {
  return (
    <button type="button" onClick={onOpen} aria-label={`${partner.name}: ${partner.offer}`} className="press shrink-0 rounded-[22px]">
      <FinanceCoupon partner={partner} isNew={isNew} />
    </button>
  );
}

function FinancePanel({ partner, onClose, onStore }: { partner: FinancePartner; onClose: () => void; onStore: (id: string) => void }) {
  return (
    <Panel title={partner.name} onClose={onClose}>
      <FinanceCoupon partner={partner} wide />
      <div className="mt-3 rounded-[22px] bg-paper p-5 ring-1 ring-inset ring-hair">
        <p className="meta">
          {partner.kind} · {partner.until} хүртэл
        </p>
        <h2 className="mt-1.5 text-[24px] font-extrabold leading-tight tracking-[-0.035em] text-ink">
          {partner.offer}
          <span className="text-accent">.</span>
        </h2>
        <ul className="mt-4 space-y-2">
          {partner.terms.map((t) => (
            <li key={t} className="flex gap-2.5 text-[14px] text-ink-2">
              <span className="mt-[7px] size-1.5 shrink-0 rounded-full bg-accent" />
              {t}
            </li>
          ))}
        </ul>
        <p className="mt-4 rounded-xl bg-stage px-3.5 py-3 text-[12.5px] leading-relaxed text-mute">
          Кассанд Gerege QR-аа уншуулаад {partner.name}-ээр төлөхөд урамшуулал автоматаар тооцогдоно.
        </p>
      </div>

      <SectionHead title="Хүчинтэй дэлгүүрүүд" />
      <ul className="space-y-2">
        {partners.map((p) => (
          <li key={p.id}>
            <button
              type="button"
              onClick={() => onStore(p.id)}
              className="press flex w-full items-center gap-3 rounded-[16px] bg-paper p-3 text-left ring-1 ring-inset ring-hair"
            >
              <PartnerMark partner={p} size={36} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[14px] font-bold text-ink">{p.name}</span>
                <span className="block text-[12px] text-mute">
                  {p.kind} · {p.distanceKm} км
                </span>
              </span>
              <span className="text-[13px] font-semibold text-mute">→</span>
            </button>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

/* ───────────────────────── хэсгүүд ───────────────────────── */

function OrderRow({ order, onOpen }: { order: Order; onOpen: () => void }) {
  const { now } = useApp();
  const partner = partnerOf(order.partnerId);
  const step = orderStep(order, now);
  return (
    <button type="button" onClick={onOpen} className="press flex w-full items-center gap-3 rounded-[18px] bg-paper p-3.5 text-left ring-1 ring-inset ring-hair">
      <PartnerMark partner={partner} size={40} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[14px] font-bold text-ink">{partner.name}</span>
        <span className="tnum block text-[12px] text-mute">
          #{order.id} · {moneyPlain(order.paid)}₮
        </span>
      </span>
      <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold ${step === ORDER_STEPS.length - 1 ? "bg-stage text-mute" : "bg-accent-soft text-accent"}`}>
        {ORDER_STEPS[step]}
      </span>
    </button>
  );
}

const TextLink = ({ onClick, children }: { onClick: () => void; children: ReactNode }) => (
  <button type="button" onClick={onClick} className="press text-[13px] font-semibold text-mute hover:text-ink">
    {children} →
  </button>
);

/* Доод цэс — хар хөвөгч капсул. Идэвхтэй таб цагаан капсулд дүүрсэн icon +
   нэртэй; бусад нь зөвхөн хүрээтэй icon. Нэр нь идэвхтэй үед л гарна, тиймээс
   таван таб 360px өргөнд багтана. */
const NAV: { key: Tab; label: string; line: ReactNode; solid: ReactNode }[] = [
  {
    key: "home",
    label: "Нүүр",
    line: <path d="M4 10.5 12 4l8 6.5V19a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 19zM10 14.5v3M14 14.5v3" />,
    solid: (
      <>
        <path d="M4 10.5 12 4l8 6.5V19a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 19z" fill="currentColor" />
        <path d="M10 14.5v3M14 14.5v3" stroke="#fff" />
      </>
    ),
  },
  {
    key: "deals",
    label: "Урамшуулал",
    line: <path d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM9 15l6-6M9.5 9.5h.01M14.5 14.5h.01" />,
    solid: (
      <>
        <circle cx="12" cy="12" r="9" fill="currentColor" />
        <path d="M9 15l6-6M9.5 9.5h.01M14.5 14.5h.01" stroke="#fff" />
      </>
    ),
  },
  {
    key: "stores",
    label: "Дэлгүүр",
    line: <path d="M5 9h14l-1.2 10.2A1.5 1.5 0 0 1 16.3 20.5H7.7a1.5 1.5 0 0 1-1.5-1.3zM8.5 9 10 4.5M15.5 9 14 4.5M10.5 13v3.5M13.5 13v3.5M3.5 9h17" />,
    solid: (
      <>
        <path d="M5 9h14l-1.2 10.2A1.5 1.5 0 0 1 16.3 20.5H7.7a1.5 1.5 0 0 1-1.5-1.3z" fill="currentColor" />
        <path d="M8.5 9 10 4.5M15.5 9 14 4.5M3.5 9h17" />
        <path d="M10.5 13v3.5M13.5 13v3.5" stroke="#fff" />
      </>
    ),
  },
  {
    key: "wallet",
    label: "Хэтэвч",
    line: <path d="M4 7.5A2.5 2.5 0 0 1 6.5 5h11A1.5 1.5 0 0 1 19 6.5V8M4 7.5v10A2.5 2.5 0 0 0 6.5 20h12a1.5 1.5 0 0 0 1.5-1.5v-9A1.5 1.5 0 0 0 18.5 8h-12A2.5 2.5 0 0 1 4 7.5zM16 14h.01" />,
    solid: (
      <>
        <rect x="4" y="7.5" width="16" height="12.5" rx="2.2" fill="currentColor" />
        <path d="M6.5 4.8h10.8A1.5 1.5 0 0 1 18.8 6.3v1.2" />
        <path d="M16 14h.01" stroke="#fff" strokeWidth={2.4} />
      </>
    ),
  },
  {
    key: "me",
    label: "Миний",
    line: <path d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 12.5a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM6.5 18.2c1-2.2 3-3.4 5.5-3.4s4.5 1.2 5.5 3.4" />,
    solid: (
      <>
        <circle cx="12" cy="12" r="9" fill="currentColor" />
        <path d="M12 12.5a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM6.5 18.2c1-2.2 3-3.4 5.5-3.4s4.5 1.2 5.5 3.4" stroke="#fff" fill="#fff" />
      </>
    ),
  },
];

/* Пүршний тохиргоо — хурдан эхэлж, зөөлөн суух. Хэт хөвөөгүй (damping 34)
   тул капсул «савлахгүй», зүгээр л байрандаа очно. */
const TAB_SPRING = { type: "spring", stiffness: 430, damping: 34, mass: 0.9 } as const;

export function BottomNav({ tab, onTab }: { tab: Tab; onTab: (tab: Tab) => void }) {
  const select = (key: Tab) => {
    if (key === tab) return;
    // Android дээр хөнгөн чичиргээ — хуруу «дарсан» гэдгийг мэдэрнэ
    try {
      navigator.vibrate?.(8);
    } catch {}
    onTab(key);
  };

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-30 flex justify-center px-3 pb-[max(12px,env(safe-area-inset-bottom))]"
      aria-label="Апп цэс"
    >
      {/* Хөдөлгөөн багасгах тохиргоотой утсан дээр бүх хөдөлгөөн шууд солигдоно */}
      <MotionConfig transition={TAB_SPRING} reducedMotion="user">
        <LayoutGroup id="tabbar">
          <div className="flex w-full max-w-[416px] items-center gap-1 rounded-full bg-[#16161d] p-2 shadow-[0_18px_40px_-14px_rgb(0_0_0/0.55)] ring-1 ring-white/5">
            {NAV.map((item) => {
              const on = tab === item.key;
              return (
                <motion.button
                  key={item.key}
                  layout
                  type="button"
                  onClick={() => select(item.key)}
                  aria-current={on ? "page" : undefined}
                  aria-label={item.label}
                  whileTap={{ scale: 0.96 }}
                  className={`relative flex h-12 items-center justify-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                    on ? "flex-none pl-3 pr-4" : "flex-1"
                  }`}
                  style={{ borderRadius: 999 }}
                >
                  {/* Цагаан капсул — нэг л элемент, табаас таб руу гулсана (layoutId) */}
                  {on && <motion.span layoutId="tab-pill" className="absolute inset-0 bg-white" style={{ borderRadius: 999 }} />}

                  <motion.span
                    layout="position"
                    className="relative z-10 flex items-center gap-2"
                    animate={{ color: on ? "#16161d" : "#8e8e9a" }}
                    transition={{ color: { duration: 0.25 } }}
                  >
                    {/* Хүрээтэй ба дүүрсэн icon хоёулаа үргэлж DOM-д — давхар байрлаж,
                        зөвхөн тод/бүдэг солигдоно. Өмнө нь icon-ыг устгаж дахин үүсгэдэг
                        (AnimatePresence) байсан нь шилжих агшинд анивчиж, үсэрдэг байв. */}
                    <span className="relative size-[24px] shrink-0">
                      <motion.svg
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth={1.7}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden="true"
                        className="absolute inset-0 size-[24px]"
                        initial={false}
                        animate={{ opacity: on ? 0 : 1 }}
                        // Ирж буй icon эхлээд тодорно, явж буй нь дараа нь — хоёулаа зэрэг бүдгэрэхгүй
                        transition={{ duration: 0.14, delay: on ? 0.12 : 0 }}
                      >
                        {item.line}
                      </motion.svg>
                      <motion.svg
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth={1.7}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden="true"
                        className="absolute inset-0 size-[24px]"
                        initial={false}
                        animate={{ opacity: on ? 1 : 0, scale: on ? 1 : 0.85 }}
                        transition={{ opacity: { duration: 0.14, delay: on ? 0 : 0.12 }, scale: { type: "spring", stiffness: 520, damping: 30 } }}
                      >
                        {item.solid}
                      </motion.svg>
                    </span>

                    {/* Нэр — зөвхөн идэвхтэй үед. Гарахдаа шууд алга болно (хүлээлгэвэл
                        хуучин капсул нэрээ барьсаар өргөн хоцордог) */}
                    {on && (
                      <motion.span
                        className="whitespace-nowrap text-[14.5px] font-bold tracking-[-0.01em]"
                        initial={{ opacity: 0, x: -6 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.05, duration: 0.24, ease: [0.2, 0.8, 0.2, 1] }}
                      >
                        {item.label}
                      </motion.span>
                    )}
                  </motion.span>
                </motion.button>
              );
            })}
          </div>
        </LayoutGroup>
      </MotionConfig>
    </nav>
  );
}

const CartIcon = () => (
  <svg viewBox="0 0 20 20" className="size-[19px]" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M2.5 3.5h2l1.6 9h9.4l1.5-6.5H5.4M8 16.5h.01M14.5 16.5h.01" />
  </svg>
);
