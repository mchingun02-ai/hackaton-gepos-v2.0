"use client";

import { type ReactNode, useEffect, useState } from "react";
import { moneyPlain } from "@/lib/demo";
import { useStore } from "@/lib/store";
import Layout, { type Page } from "@/components/Layout";
import Login from "@/components/Login";
import OpenShift from "@/components/OpenShift";
import CashierPage, { OrderPanel } from "@/components/pages/CashierPage";
import PaymentScreen from "@/components/pages/PaymentScreen";
import ReceiptScreen from "@/components/pages/ReceiptScreen";
import ProductsPage from "@/components/pages/ProductsPage";
import ReportsPage from "@/components/pages/ReportsPage";
import DebtsPage from "@/components/pages/DebtsPage";
import LoyaltyPage from "@/components/pages/LoyaltyPage";
import OwnerPage from "@/components/pages/OwnerPage";
import AdminPage from "@/components/pages/AdminPage";
import ServerAdminPage from "@/components/pages/ServerAdminPage";
import ServerLoyaltyPage from "@/components/pages/ServerLoyaltyPage";
import PendingSale from "@/components/PendingSale";
import PendingRefund from "@/components/PendingRefund";
import { IconAlert, IconCaret } from "@/components/icons";
import { PrimaryButton, Stat, btnGhost } from "@/components/ui";
import { HqOverlay, HqSettings } from "@/components/HqLink";
import { useHq } from "@/lib/hq";

type Device = "till" | "handheld";
type Flow = "shopping" | "payment" | "receipt";

const POS_NO = "10000001";

const PAGE_META: Record<Page, { breadcrumb: string; title: string }> = {
  cashier: { breadcrumb: "Касс", title: "Шинэ гүйлгээ" },
  products: { breadcrumb: "Бүртгэл", title: "Бараа" },
  reports: { breadcrumb: "Тайлан", title: "Борлуулалт" },
  debts: { breadcrumb: "Харилцагч", title: "Өрийн дэвтэр" },
  loyalty: { breadcrumb: "Харилцагч", title: "Урамшуулал" },
  owner: { breadcrumb: "Санхүү", title: "Орлого, зарлага" },
  admin: { breadcrumb: "Удирдлага", title: "Захирлын самбар" },
  settings: { breadcrumb: "Систем", title: "Тохиргоо" },
};

/* Төв системийн түгжээ, мессеж нь аль ч дэлгэцийн дээр гарна */
export default function PosApp() {
  return (
    <>
      <PosScreens />
      <HqOverlay />
    </>
  );
}

/**
 * Өгөгдлийн төлөв — аль ч дэлгэцийн дээр, жижиг мөрөөр.
 * Туршилтын горимд «хадгалагдахгүй» гэж үргэлж харагдана; серверийн горимд
 * ачаалж байгаа, холбогдож чадаагүй, хадгалалт амжилтгүй болсныг мэдэгдэнэ.
 */
function DataBanner({ hideSaveError }: { hideSaveError: boolean }) {
  const { mode, sync, reload, saveError, clearSaveError, pendingOther, pendingRefundOther } = useStore();

  let tone: "mute" | "warn" | "danger" = "mute";
  let text: string | null = null;
  let action: { label: string; run: () => void } | null = null;

  if (!hideSaveError && saveError) {
    tone = "danger";
    text = saveError;
    action = { label: "Хаах", run: clearSaveError };
  } else if (pendingRefundOther) {
    tone = "warn";
    text = `${pendingRefundOther}-ийн дуусаагүй буцаалт энэ касст бий — тэр ажилтан нэвтэрч шалгана.`;
  } else if (pendingOther) {
    tone = "warn";
    text = `${pendingOther}-ийн дуусаагүй төлбөр энэ касст бий — тэр ажилтан нэвтэрч шалгана.`;
  } else if (mode === "demo") {
    tone = "warn";
    text = "Туршилтын горим — өгөгдөл хадгалагдахгүй. Тохиргоо → Төв систем-д холбоно уу.";
  } else if (sync.status === "loading") {
    text = "Серверээс бараа, смен, гүйлгээг ачаалж байна…";
  } else if (sync.status === "error") {
    tone = "danger";
    text = sync.error;
    action = { label: "Дахин оролдох", run: reload };
  }
  if (!text) return null;

  const color =
    tone === "danger" ? "bg-danger-soft text-danger" : tone === "warn" ? "bg-warn-soft text-warn" : "bg-paper text-ink-2";
  return (
    <div className="pointer-events-none fixed inset-x-0 top-2 z-40 flex justify-center px-3" role="status" aria-live="polite">
      <div
        className={`pointer-events-auto flex max-w-[640px] items-center gap-3 rounded-full px-4 py-2 text-[12px] font-semibold shadow-[0_8px_24px_-12px_rgb(0_0_0/0.35)] ring-1 ring-inset ring-hair ${color}`}
      >
        <span className="min-w-0">{text}</span>
        {action && (
          <button type="button" onClick={action.run} className="press shrink-0 rounded-full bg-paper px-3 py-1 text-ink ring-1 ring-inset ring-hair">
            {action.label}
          </button>
        )}
      </div>
    </div>
  );
}

/** Нэвтэрсэн ажилтны харах хуудсууд. Серверийн горимд хадгалагддаггүй
    хуудсууд (өр, орлого-зарлага, урамшуулал) хаалттай. */
const allowedPages = (mode: "demo" | "server", perms: ReturnType<typeof useStore>["perms"]): Page[] => [
  "cashier",
  "reports",
  ...(perms.editProducts || perms.adjustStock ? (["products"] as Page[]) : []),
  ...(mode === "demo" ? (["debts", "loyalty", "owner"] as Page[]) : []),
  // Сервер горим: урамшууллын дүрэм, гишүүний карт — зөвхөн эзэн
  ...(mode === "server" && perms.manageLoyalty ? (["loyalty"] as Page[]) : []),
  ...(perms.branchReports ? (["admin"] as Page[]) : []),
  "settings",
];

function PosScreens() {
  const store = useStore();
  const { person, shift, lines, discount, total, count } = store;
  const allowed = allowedPages(store.mode, store.perms);

  const [dark, setDark] = useState<boolean>(() =>
    typeof document === "undefined" ? false : document.documentElement.dataset.theme === "dark",
  );
  const [device, setDevice] = useState<Device>("till");
  const [phone, setPhone] = useState(false);
  const [page, setPage] = useState<Page>("cashier");
  const [flow, setFlow] = useState<Flow>("shopping");
  const [cartOpen, setCartOpen] = useState(false);
  const [payMethod, setPayMethod] = useState<"бэлэн" | "карт" | "qpay">("бэлэн");

  useEffect(() => {
    const query = window.matchMedia("(max-width: 900px)");
    const apply = () => setPhone(query.matches);
    apply();
    query.addEventListener("change", apply);
    return () => query.removeEventListener("change", apply);
  }, []);

  useEffect(() => {
    const theme = dark ? "dark" : "light";
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem("gp-theme", theme);
    } catch {
      /* private горимд хадгалагдахгүй */
    }
  }, [dark]);

  const toggleTheme = () => setDark((value) => !value);
  const narrow = phone || device === "handheld";

  const logout = () => {
    store.logout();
    setFlow("shopping");
    setPage("cashier");
  };

  const framed = (child: ReactNode) => {
    if (phone) return <div className="h-dvh w-full overflow-hidden">{child}</div>;
    /* 820px-д хатуу тогтоовол 900px-ийн цонхонд толгойтойгоо 954px болж,
       «Төлбөр авах» зэрэг доод мөр нүднээс гарна. Дэлгэц намхан бол
       фрэйм өөрөө агшина — апп дотроо аль хэдийн зөв гүйлгэдэг. */
    const h = "h-[min(820px,calc(100dvh-132px))]";
    const size = device === "till" ? h : `mx-auto w-[390px] ${h}`;
    return (
      <div className={`object overflow-hidden rounded-card ring-1 ring-inset ring-hair ${size}`}>
        {child}
      </div>
    );
  };

  const wrap = (child: ReactNode, step: string) => (
    <>
      <DataBanner hideSaveError={flow === "payment"} />
      {phone ? (
        child
      ) : (
        <Preview device={device} setDevice={setDevice} step={step}>
          {child}
        </Preview>
      )}
    </>
  );

  /* ── нэвтрэх ── */
  if (!person) {
    // Session алдагдсан (түгжигдсэн, хугацаа дууссан) үед төлбөр/баримтын дунд байсан
    // байж болно — дараагийн нэвтрэлт кассын эхнээс эхэлнэ.
    if (flow !== "shopping") setFlow("shopping");
    if (page !== "cashier") setPage("cashier");
    return wrap(framed(<Login onLogin={store.login} onToggleTheme={toggleTheme} />), "Нэвтрэх");
  }

  /* ── смен ── */
  if (!shift) {
    return wrap(
      framed(
        <OpenShift
          person={person}
          posNo={POS_NO}
          onOpen={store.openShift}
          onLogout={logout}
          onToggleTheme={toggleTheme}
        />,
      ),
      "Смен нээх",
    );
  }

  /* ── хариу ирээгүй буцаалт — шийдэхээс өмнө үргэлжлүүлэхгүй (хүсэлт явж байх үед биш) ── */
  if (((store.pendingRefund && !store.refundSending) || store.resolvedRefund) && flow === "shopping") {
    return wrap(framed(<PendingRefund />), "Дуусаагүй буцаалт");
  }

  /* ── хариу нь тодорхойгүй төлбөр — шийдэхээс өмнө шинэ гүйлгээ хийхгүй ── */
  if (store.pendingSale && flow === "shopping") {
    return wrap(framed(<PendingSale onReceipt={() => setFlow("receipt")} />), "Дуусаагүй төлбөр");
  }

  /* ── төлбөр, баримт — бүрхүүлгүй, анхаарал гүйлгээн дээр ── */
  if (flow === "payment") {
    return wrap(
      framed(
        <PaymentScreen
          initialMethod={payMethod}
          onBack={() => setFlow("shopping")}
          onPaid={() => setFlow("receipt")}
        />,
      ),
      "Төлбөр",
    );
  }

  if (flow === "receipt") {
    return wrap(
      framed(
        <ReceiptScreen
          onNext={() => {
            store.clearLastSale();
            setFlow("shopping");
            setCartOpen(false);
          }}
        />,
      ),
      "Баримт",
    );
  }

  /* ── өөр ажилтны смен нээлттэй (серверийн горим, кассчин) ── */
  if (store.mode === "server" && !shift.mine && !store.perms.branchReports) {
    return wrap(
      framed(
        <div className="flex size-full flex-col items-center justify-center bg-stage px-5">
          <div className="w-full max-w-[420px] rounded-[26px] bg-paper p-7 ring-1 ring-inset ring-hair">
            <h1 className="text-[20px] font-bold tracking-[-0.03em] text-ink">Өөр ажилтны смен нээлттэй</h1>
            <p className="mt-2 text-[14px] leading-relaxed text-ink-2">
              Энэ касст {shift.cashierName ?? "өөр ажилтны"} смен нээлттэй байна. Тэр хааж, эсвэл менежер хаасны дараа
              өөрийн смен нээнэ.
            </p>
            <div className="mt-5">
              <PrimaryButton onClick={logout} tone="ink">
                Гарах
              </PrimaryButton>
            </div>
          </div>
        </div>,
      ),
      "Смен",
    );
  }

  /* ── үндсэн хуудсууд ── */
  // Эрхгүй хуудас руу (жишээ нь эрх өөрчлөгдсөний дараа) — касс руу
  if (!allowed.includes(page)) setPage("cashier");
  const meta = PAGE_META[page];

  const content =
    page === "cashier" ? (
      <CashierPage
        narrow={narrow}
        onQuickPay={(method) => {
          setPayMethod(method);
          setFlow("payment");
        }}
      />
    ) : page === "products" ? (
      <ProductsPage narrow={narrow} />
    ) : page === "reports" ? (
      <ReportsPage narrow={narrow} />
    ) : page === "debts" ? (
      <DebtsPage narrow={narrow} />
    ) : page === "loyalty" ? (
      store.mode === "server" ? <ServerLoyaltyPage narrow={narrow} /> : <LoyaltyPage narrow={narrow} />
    ) : page === "admin" ? (
      store.mode === "server" ? <ServerAdminPage narrow={narrow} /> : <AdminPage narrow={narrow} />
    ) : page === "owner" ? (
      <OwnerPage narrow={narrow} />
    ) : (
      <SettingsPage narrow={narrow} />
    );

  const orderPanel =
    page === "cashier" ? (
      <OrderPanel
        onContinue={() => {
          setPayMethod("бэлэн");
          setFlow("payment");
        }}
      />
    ) : undefined;

  const mobileCart =
    page === "cashier" ? (
      <div className="shrink-0 rounded-t-[22px] bg-paper shadow-[0_-12px_30px_-24px_rgb(0_0_0/0.4)] ring-1 ring-inset ring-hair">
        {cartOpen ? (
          <>
            <div className="max-h-[62dvh] overflow-y-auto">{orderPanel}</div>
            <button
              type="button"
              onClick={() => setCartOpen(false)}
              className="meta w-full border-t border-hair py-3.5"
            >
              Хаах
            </button>
          </>
        ) : (
          /* Хураангуй мөр: дүн зүүнд (нүд эхлээд тийшээ очно), товч баруунд.
             Нэг мөрөнд багтаасан нь торонд 50px буцааж өгнө. */
          <div className="flex items-center gap-3 p-3 pl-4">
            <button
              type="button"
              onClick={() => setCartOpen(true)}
              className="flex min-w-0 flex-1 flex-col items-start text-left"
              aria-label="Захиалга нээх"
            >
              <span className="meta flex items-center gap-1.5">
                Захиалга
                {count > 0 && (
                  <span className="tnum rounded-full bg-ink px-1.5 py-px text-[10px] text-paper">
                    {count}
                  </span>
                )}
                <IconCaret />
              </span>
              <span className="hugenum text-[26px]!">
                {moneyPlain(total)}
                <span className="suffix">₮</span>
              </span>
            </button>
            <span className="w-[170px] shrink-0">
              <PrimaryButton disabled={lines.length === 0} onClick={() => setFlow("payment")}>
                Төлбөр
              </PrimaryButton>
            </span>
          </div>
        )}
      </div>
    ) : undefined;

  return wrap(
    <Layout
      page={page}
      onNavigate={(next) => {
        setPage(next);
        setCartOpen(false);
      }}
      person={person}
      posNo={POS_NO}
      phone={phone}
      device={device}
      onToggleTheme={toggleTheme}
      onLogout={logout}
      breadcrumb={meta.breadcrumb}
      title={meta.title}
      action={
        page === "cashier" ? (
          discount ? (
            <span className="meta hidden items-center gap-1.5 sm:flex">
              <span className="inline-block size-[6px] rounded-full bg-accent" aria-hidden="true" />
              Урамшуулал 10%
            </span>
          ) : undefined
        ) : (
          <button type="button" onClick={() => setPage("cashier")} className={btnGhost}>
            Касс руу
          </button>
        )
      }
      aside={narrow ? mobileCart : orderPanel}
      allowed={allowed}
      card={page !== "loyalty" && page !== "owner"}
    >
      {content}
    </Layout>,
    meta.title,
  );
}

/* ── дизайн үзэх бүрхүүл (бүтээгдэхүүний хэсэг биш) ── */
function Preview({
  device,
  setDevice,
  step,
  children,
}: {
  device: Device;
  setDevice: (value: Device) => void;
  step: string;
  children: ReactNode;
}) {
  return (
    <div className="min-h-dvh bg-stage px-5 py-7">
      <div className="mx-auto mb-6 flex max-w-[1480px] flex-wrap items-center gap-3">
        <div className="mr-auto">
          <div className="meta">Gerege POS — дизайн</div>
          <h1 className="mt-1 flex items-center text-[22px] font-bold tracking-[-0.035em] text-ink">
            {step}
            <span className="text-accent">.</span>
          </h1>
        </div>

        <button
          type="button"
          role="switch"
          aria-checked={device === "handheld"}
          aria-label="Төхөөрөмжийн хэлбэр"
          onClick={() => setDevice(device === "till" ? "handheld" : "till")}
          className="seg"
        >
          <span className="seg-track" aria-hidden="true">
            <span className="seg-thumb" />
            <span className="seg-label" data-on={device === "till" ? "" : undefined}>
              Суурин касс
            </span>
            <span className="seg-label" data-on={device === "handheld" ? "" : undefined}>
              Гар терминал
            </span>
          </span>
        </button>
      </div>

      <div className="mx-auto max-w-[1480px]">{children}</div>
    </div>
  );
}

/* ── тохиргоо ── */
function SettingsPage({ narrow }: { narrow: boolean }) {
  const { catalog, txns, mode } = useStore();
  const hq = useHq();
  const uncoded = txns.filter((t) => t.receipt === "Код дутуу").length;

  const groups: { group: string; items: { label: string; value: string; warn?: boolean }[] }[] = [
    {
      group: "Төхөөрөмж",
      items: [
        {
          label: "Өгөгдөл",
          value: mode === "server" ? "Gerege төвд хадгалагдана" : "Туршилт — хадгалагдахгүй",
          warn: mode === "demo",
        },
        { label: "Кассын дугаар", value: hq.device?.posNo ?? POS_NO },
        { label: "Салбар", value: hq.device?.branch ?? "Төв салбар · 001" },
        { label: "Хэвлэгч", value: "SUNMI дотоод принтер" },
      ],
    },
    {
      group: "Е-баримт",
      items: [
        { label: "PosAPI", value: "Холбогдоогүй", warn: true },
        { label: "Мерчант ТТД", value: "1234567" },
        { label: "Илгээгээгүй", value: `${txns.length} гүйлгээ`, warn: txns.length > 0 },
        { label: "Татварын код дутуу", value: `${uncoded} гүйлгээ`, warn: uncoded > 0 },
      ],
    },
    {
      group: "Төлбөр",
      items: [
        { label: "Карт", value: "Холбогдоогүй", warn: true },
        { label: "QPay", value: "Холбогдоогүй", warn: true },
      ],
    },
    {
      group: "Лиценз",
      items: [
        { label: "Багц", value: "Бизнес ПОС" },
        { label: "Сарын хураамж", value: "9,900₮" },
        { label: "Дараагийн төлөлт", value: "11-08" },
      ],
    },
  ];

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className={`grid gap-3 ${narrow ? "grid-cols-2" : "grid-cols-4"}`}>
        <Stat label="Хувилбар" value="v0.1" hint="дизайн батлах" />
        <Stat label="Холбогдоогүй" value="4" tone="warn" hint="е-баримт, төлбөр, сервер" />
        <Stat label="Ажилтан" value="2" />
        <Stat label="Бараа" value={catalog.length} />
      </div>

      <div className="mt-4 space-y-4">
        <HqSettings />
        {groups.map((section) => (
          <div
            key={section.group}
            className="rounded-[18px] bg-paper p-5 ring-1 ring-inset ring-hair"
          >
            <h2 className="text-[15px] font-bold tracking-[-0.02em] text-ink">{section.group}</h2>
            <ul className="mt-2 divide-y divide-hair">
              {section.items.map((item) => (
                <li key={item.label} className="flex min-h-12 items-center justify-between py-2.5">
                  <span className="text-[14px] text-ink-2">{item.label}</span>
                  <span className="flex items-center gap-2">
                    {item.warn && (
                      <span className="text-warn">
                        <IconAlert />
                      </span>
                    )}
                    <span
                      className={`tnum text-[14px] font-semibold ${
                        item.warn ? "text-warn" : "text-ink"
                      }`}
                    >
                      {item.value}
                    </span>
                    <span className="text-mute">
                      <IconCaret />
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
