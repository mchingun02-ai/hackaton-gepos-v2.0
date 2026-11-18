"use client";

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  type Auth,
  type Permissions,
  type ServerProduct,
  type ServerSale,
  type ServerStaff,
  type ServerRefund,
  type RefundRequest,
  type PendingRefund,
  type ServerMember,
  type Redemption,
  type WalletPayment,
  type PendingSale,
  ApiError,
  HQ_CHANGE,
  OFFLINE,
  api,
  newIdempotencyKey,
  readConn,
  readSession,
  saveSession,
  readPending,
  savePending,
  readPendingRefund,
  savePendingRefund,
} from "@/lib/pos-api";
import {
  type CartLine,
  type Debtor,
  type Member,
  type MoneyEntry,
  type Product,
  type Staff,
  type Txn,
  type Category,
  cartTotal,
  lineTotal,
  debtors as seedDebtors,
  members as seedMembers,
  moneyEntries as seedMoney,
  products as seedProducts,
  soldSeed as seedSold,
  tierRule,
  txns as seedTxns,
  unitOf,
  vatOf,
} from "@/lib/demo";

export const DISCOUNT_RATE = 0.1;

type Shift = {
  openingFloat: number;
  openedAt: string;
  /** серверийн смен */
  id?: string;
  /** Нэвтэрсэн ажилтны смен эсэх (туршилтын горимд үргэлж тийм) */
  mine: boolean;
  cashierName?: string | null;
  /** Энэ сменд кассаас бэлнээр буцаасан (серверийн горим) */
  refundCashTotal?: number;
};

/** Эрх — туршилтын горимд сонгосон үүргээр, серверийн горимд серверээс */
export const ROLE_PERMS: Record<Staff["role"], Permissions> = {
  Кассчин: { sell: true, shift: true, refund: false, discount: false, editProducts: false, adjustStock: false, branchReports: false, merchantReports: false, manageStaff: false },
  Менежер: { sell: true, shift: true, refund: true, discount: true, editProducts: false, adjustStock: true, branchReports: true, merchantReports: false, manageStaff: false },
  Эзэн: { sell: true, shift: true, refund: true, discount: true, editProducts: true, adjustStock: true, branchReports: true, merchantReports: true, manageStaff: true },
};
const NO_PERMS = ROLE_PERMS.Кассчин;

/** demo — төвд холбогдоогүй, юу ч хадгалагдахгүй; server — бүх өгөгдөл Gerege төвд */
export type DataMode = "demo" | "server";
export type SyncState = { status: "idle" | "loading" | "ready" | "error"; error: string | null };

/** Нэг борлуулалтын урамшууллын тооцоо */
export type LoyaltyCalc = {
  member: Member | null;
  /** Зэрэглэлийн хөнгөлөлт */
  off: number;
  /** Энэ гүйлгээнд зарцуулсан оноо (1 оноо = 1₮) */
  spent: number;
  /** Энэ гүйлгээнээс хуримтлагдах оноо */
  earned: number;
};

type Sale = {
  method: "бэлэн" | "карт" | "qpay" | "хэтэвч";
  change: number;
  /** Бэлнээр авсан мөнгө — сервер хариултыг өөрөө тооцно */
  tendered?: number;
  b2b: boolean;
};

type Store = {
  /* өгөгдлийн эх сурвалж */
  mode: DataMode;
  sync: SyncState;
  /** Борлуулалт серверт хадгалагдаж байна */
  saving: boolean;
  /** Сүүлийн хадгалалтын алдаа (борлуулалт, смен) */
  saveError: string | null;
  clearSaveError: () => void;
  /** Серверээс бараа, үлдэгдэл, смен, гүйлгээг дахин ачаална */
  reload: () => void;
  /** Нэвтэрсэн ажилтны эрх. UI цэс үүгээр шүүгдэнэ; хамгаалалт нь сервер дээр. */
  perms: Permissions;
  /** Серверийн горимд PIN-ээр нэвтрэх. Алдаа бол мессеж. */
  loginPin: (pin: string) => Promise<string | null>;
  /** Session хүчингүй болж гаргасан шалтгаан — нэвтрэх дэлгэц дээр */
  authNotice: string | null;
  /** Серверт холбогдсон горимд (өрийн дэвтэр, орлого-зарлага, урамшуулал) зөвхөн туршилт */
  auth: () => Auth | null;
  /** Энэ ажилтны хариу нь тодорхойгүй төлбөр — шийдэхээс өмнө шинэ төлбөр хийхгүй */
  pendingSale: PendingSale<CartLine> | null;
  /** Өөр ажилтны дуусаагүй төлбөр — автоматаар үргэлжлүүлэхгүй */
  pendingOther: string | null;
  /** Сервер дээр хадгалагдсан эсэхийг шалгана. found бол баримт руу. */
  /** «Олдсонгүй» нь эцсийн хариу биш (анхны хүсэлт явж байж магадгүй) — сагсанд буцаахын тулд cancelPending */
  checkPending: () => Promise<{ found: boolean } | { error: string }>;
  /** Анхны түлхүүрээр дахин илгээнэ (сервер давхардуулахгүй) */
  resendPending: () => Promise<boolean>;
  /** Серверт цуцлалтыг баталгаажуулна (анхны хүсэлт явж байвал дуусахыг хүлээнэ).
      cancelled → сагсанд буцаана; completed → борлуулалт хадгалагдсан (баримт). */
  discardPending: () => Promise<"cancelled" | "completed" | { error: string }>;
  /** API алдааг мессеж болгоно; session алдагдсан бол нэвтрэх рүү буцаана */
  reportError: (e: unknown, fallback: string) => string;
  /** Өнөөдөр энэ кассаар хийсэн буцаалт (серверийн горим, менежер/эзэн) */
  refunds: ServerRefund[];
  /** Буцаалт хийнэ (сервер дүнг тооцно). Амжилттай бол буцаалт; алдаа бол мессеж. */
  submitRefund: (body: RefundRequest) => Promise<{ refund: ServerRefund } | { error: string; offline?: boolean }>;
  /** Карт/QPay буцаалтыг банкаар гараар буцаасныг лавлагаатай тэмдэглэнэ */
  markRefundExternal: (refundId: string, reference: string) => Promise<string | null>;
  /** Энэ ажилтны хариу ирээгүй буцаалт — шийдэхээс өмнө касс үргэлжлэхгүй */
  pendingRefund: PendingRefund | null;
  /** Буцаалтын хүсэлт явж байна (тэр үед «Дуусаагүй буцаалт» дэлгэц гаргахгүй) */
  refundSending: boolean;
  /** «Дуусаагүй буцаалт» дэлгэцээс шийдэгдсэн үр дүн — баримт хэвлэтэл дэлгэц үлдэнэ */
  resolvedRefund: ServerRefund | "cancelled" | null;
  clearResolvedRefund: () => void;
  /** Өөр ажилтны хариу ирээгүй буцаалт (автоматаар үргэлжлүүлэхгүй) */
  pendingRefundOther: string | null;
  checkPendingRefund: () => Promise<{ refund: ServerRefund } | { found: false; cancelled?: boolean } | { error: string }>;
  resendPendingRefund: () => Promise<{ refund: ServerRefund } | { error: string }>;
  /** Серверт цуцлалтыг баталгаажуулна; анхны буцаалт commit болсон бол түүнийг буцаана */
  cancelPendingRefund: () => Promise<{ refund: ServerRefund } | { cancelled: true } | { error: string }>;

  /* төлөв */
  person: Staff | null;
  shift: Shift | null;
  catalog: Product[];
  lines: CartLine[];
  discount: boolean;
  /** Гүйлгээнд холбогдсон урамшууллын гишүүн */
  activeMember: Member | null;
  /** Энэ гүйлгээнд зарцуулахаар сонгосон оноо */
  redeem: number;

  /* ─ захирлын хяналт ─ */
  /** Түгжигдсэн ажилтны id. Түгжээтэй хүн нэвтрэхгүй. */
  lockedStaff: string[];
  /** Бүх хөнгөлөлтийг зогсоосон эсэх — урамшууллын хувь ч ажиллахгүй */
  discountsOff: boolean;
  /** Бараа тус бүрийн зарагдсан тоо, орлого */
  sold: Record<string, { qty: number; amount: number }>;
  txns: Txn[];
  debtors: Debtor[];
  members: Member[];
  money: MoneyEntry[];
  lastSale: {
    no: string;
    queued: boolean;
    change: number;
    lines: CartLine[];
    loyalty: LoyaltyCalc;
    /** Амжилттай дэлгэц дээр «Бэлэн / Карт / QPay» гэж хэлэхэд хэрэгтэй */
    method: Sale["method"];
  } | null;

  /* бодогдсон утга */
  subtotal: number;
  /** Зэрэглэлийн хөнгөлөлт */
  discountAmount: number;
  /** Оноогоор төлсөн хэсэг */
  redeemAmount: number;
  /** Энэ гүйлгээнээс хуримтлагдах оноо */
  earnPreview: number;
  /** Гишүүний ашиглаж болох дээд оноо (нийт дүнгээс хэтрэхгүй) */
  redeemMax: number;
  total: number;
  vat: number;
  count: number;

  /* үйлдэл */
  /** Туршилтын горимд үүрэг сонгож орох */
  login: (person: Staff) => void;
  logout: () => void;
  /** Алдаа гарвал мессежийг буцаана, амжилттай бол null */
  openShift: (openingFloat: number) => Promise<string | null>;
  closeShift: () => Promise<string | null>;

  bump: (product: Product, delta: number) => void;
  /** Бараа сонгохгүйгээр шууд дүнгээр зарах */
  addFreeAmount: (amount: number) => void;
  setQty: (id: string, qty: number) => void;
  clearCart: () => void;
  toggleDiscount: () => void;

  /** QR уншуулах эсвэл утсаар хайж гишүүнийг гүйлгээнд холбох */
  toggleStaffLock: (id: string) => void;
  setDiscountsOff: (off: boolean) => void;

  attachMember: (member: Member) => void;
  detachMember: () => void;
  /** Сервер горим: QR-аар танигдсан гишүүн — оноог сервер олгоно, зарцуулалт хаалттай */
  serverMember: (ServerMember & { token: string }) | null;
  /** QR-ын токеноор ЭНЭ байгууллагын гишүүнийг хайна — алдаа бол мессеж, амжилттай бол null */
  attachServerMember: (token: string) => Promise<string | null>;
  detachServerMember: () => void;
  /** Сервер горим: оноо зарцуулах хүсэлт (хэрэглэгч апп дээрээ зөвшөөрнө) — approved үед л хөнгөлөлт болно */
  serverRedemption: Redemption | null;
  /** Энэ сагсанд зарцуулж болох дээд оноо (дэлгэцэнд; сервер дахин шалгана) */
  serverRedeemMax: number;
  /** Зөвшөөрсөн зарцуулалтын хөнгөлөлт (₮) */
  serverRedeemValue: number;
  requestServerRedemption: (points: number) => Promise<string | null>;
  cancelServerRedemption: () => void;
  /** Gerege хэтэвчээр төлөх хүсэлт (Gerege QR-тай л) — хэрэглэгч апп дээрээ зөвшөөрнө; дүн = нийт төлөх */
  serverWalletPay: WalletPayment | null;
  requestServerWalletPay: () => Promise<string | null>;
  cancelServerWalletPay: () => void;
  setRedeem: (points: number) => void;

  /** Сервер баталгаажуулсан үед л true. Алдааг saveError-оос уншина. */
  completeSale: (sale: Sale) => Promise<boolean>;
  clearLastSale: () => void;

  /** Каталог (нэр, нийтлэг үнэ) — эзэн. Алдаа гарвал мессеж, амжилттай бол null */
  upsertProduct: (product: Product) => Promise<string | null>;
  /** Энэ салбарын үлдэгдэл — менежер, эзэн */
  adjustStock: (product: Product, qty: number) => Promise<string | null>;
  addDebtor: (debtor: Omit<Debtor, "id">) => void;
  payDebt: (id: string, amount: number) => void;
  addMember: (member: Omit<Member, "id">) => void;
  addMoney: (entry: Omit<MoneyEntry, "id">) => void;
};

const Ctx = createContext<Store | null>(null);

export const useStore = (): Store => {
  const value = useContext(Ctx);
  if (!value) throw new Error("useStore нь StoreProvider дотор л ажиллана");
  return value;
};

const id = (prefix: string) => prefix + Math.random().toString(36).slice(2, 9);

const clock = () => {
  const d = new Date();
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const hhmm = (iso: string) => {
  const d = new Date(iso);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const fromServerProduct = (p: ServerProduct): Product => ({
  id: p.id,
  name: p.name,
  price: p.price,
  category: p.category as Category,
  taxType: p.taxType,
  taxCoded: p.taxCoded,
  image: p.image || "/products/__none.png",
  stock: p.stock,
  oldPrice: p.oldPrice ?? undefined,
  barCode: p.barCode ?? undefined,
  unit: p.unit,
});

const METHOD_LABEL = { cash: "Бэлэн", card: "Карт", qpay: "QPay", wallet: "Хэтэвч" } as const;
const METHOD_KEY = { бэлэн: "cash", карт: "card", qpay: "qpay", хэтэвч: "wallet" } as const;

const fromServerSale = (s: ServerSale): Txn => ({
  id: s.id,
  no: s.no,
  at: hhmm(s.createdAt),
  items: s.items,
  method: METHOD_LABEL[s.method],
  amount: s.total,
  // Е-баримт (PosAPI) холбогдоогүй — «үүссэн» гэж хэзээ ч бичихгүй
  receipt: s.receiptStatus === "queued" ? "Код дутуу" : "Холбогдоогүй",
});

const ROLE_LABEL = { cashier: "Кассчин", manager: "Менежер", owner: "Эзэн" } as const;
const fromServerStaff = (s: ServerStaff): Staff => ({ id: s.id, name: s.name, role: ROLE_LABEL[s.role], initials: s.initials });

const soldFrom = (sales: ServerSale[]) => {
  const out: Record<string, { qty: number; amount: number }> = {};
  for (const sale of sales) {
    for (const line of sale.lines) {
      if (!line.productId) continue;
      const prev = out[line.productId] ?? { qty: 0, amount: 0 };
      out[line.productId] = { qty: Number((prev.qty + line.qty).toFixed(3)), amount: prev.amount + line.lineTotal };
    }
  }
  return out;
};

/** Сервер энэ хүсэлтийг татгалзсан (4xx) — session алдагдсан, өөр ажилтных, түгжээтэй касс,
    «явж байна» (retry) биш. Тэр үед түлхүүрийг серверт цуцалж эцэслэнэ. */
const isRejection = (e: unknown) =>
  e instanceof ApiError &&
  e.status >= 400 &&
  e.status < 500 &&
  !e.sessionLost &&
  e.status !== 423 &&
  e.body.code !== "other_staff" &&
  e.body.code !== "retry";

const message = (e: unknown, fallback: string) =>
  e instanceof ApiError
    ? e.status === OFFLINE
      ? `${fallback} Сервертэй холбогдож чадсангүй — сүлжээгүй үед хадгалах боломжгүй. Сүлжээгээ шалгаад дахин оролдоно уу.`
      : e.message
    : fallback;

/**
 * Бүх хувьсах дата нэг дор.
 *
 * Хоёр горим:
 * - **server** — касс Gerege төвд холбогдсон (Тохиргоо → Төв систем). Бараа,
 *   салбарын үлдэгдэл, смен, борлуулалт серверт хадгалагдаж, refresh болон
 *   дахин нэвтрэхэд серверээс сэргэнэ. Үнэ, хөнгөлөлт, нийт дүнг сервер дахин
 *   тооцоолно; сервер баталгаажуулаагүй борлуулалт «амжилттай» болохгүй.
 *   Сүлжээгүй үед борлуулалт хийх боломжгүй (энэ шатанд офлайн горим үгүй).
 * - **demo** — холбогдоогүй. Жишээ өгөгдлөөр санах ойд ажиллана, хуудас
 *   дахин ачаалахад анхны байдалдаа буцна. Серверийн өгөгдөлтэй холилдохгүй.
 *
 * Өрийн дэвтэр, орлого-зарлага, урамшууллын гишүүд одоохондоо зөвхөн санах ойд.
 */
export function StoreProvider({ children }: { children: ReactNode }) {
  const [person, setPerson] = useState<Staff | null>(null);
  const [shift, setShift] = useState<Shift | null>(null);
  const [catalog, setCatalog] = useState<Product[]>(seedProducts);
  const [lines, setLines] = useState<CartLine[]>([]);
  const [discount, setDiscount] = useState(false);
  const [txns, setTxns] = useState<Txn[]>(seedTxns);
  const [debtors, setDebtors] = useState<Debtor[]>(seedDebtors);
  const [members, setMembers] = useState<Member[]>(seedMembers);
  const [money, setMoney] = useState<MoneyEntry[]>(seedMoney);
  const [lastSale, setLastSale] = useState<Store["lastSale"]>(null);
  const [activeMember, setActiveMember] = useState<Member | null>(null);
  const [serverMember, setServerMember] = useState<(ServerMember & { token: string }) | null>(null);
  const [serverRedemption, setServerRedemption] = useState<Redemption | null>(null);
  const [serverWalletPay, setServerWalletPay] = useState<WalletPayment | null>(null);
  const [lockedStaff, setLockedStaff] = useState<string[]>([]);
  const [discountsOff, setDiscountsOff] = useState(false);
  const [sold, setSold] = useState<Record<string, { qty: number; amount: number }>>(seedSold);
  const [redeem, setRedeemRaw] = useState(0);

  const [mode, setMode] = useState<DataMode>("demo");
  const [sync, setSync] = useState<SyncState>({ status: "idle", error: null });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [perms, setPerms] = useState<Permissions>(NO_PERMS);
  const [pendingSale, setPendingSale] = useState<PendingSale<CartLine> | null>(null);
  const [pendingOther, setPendingOther] = useState<string | null>(null);
  const [refunds, setRefunds] = useState<ServerRefund[]>([]);
  const [pendingRefund, setPendingRefund] = useState<PendingRefund | null>(null);
  const [refundSending, setRefundSending] = useState(false);
  const [resolvedRefund, setResolvedRefund] = useState<ServerRefund | "cancelled" | null>(null);
  const [pendingRefundOther, setPendingRefundOther] = useState<string | null>(null);
  const [authNotice, setAuthNotice] = useState<string | null>(null);
  /** Төхөөрөмж + ажилтны session */
  const connRef = useRef<Auth | null>(null);
  /* Нэг сагсны төлбөрийг дахин оролдоход ижил түлхүүр — сервер давхар борлуулалт үүсгэхгүй */
  const saleKey = useRef<string | null>(null);
  const savingNow = useRef(false);

  /* Серверийн өгөгдлийг цэвэрлэнэ — гарах, session алдагдах үед дараагийн хүнд үлдэхгүй */
  const clearServerData = useCallback(() => {
    // pendingSale localStorage-д үлдэнэ — дахин нэвтрэхэд сэргэнэ
    setPendingSale(null);
    setPendingOther(null);
    setRefunds([]);
    // Хариу ирээгүй буцаалт localStorage-д үлдэнэ — дахин нэвтрэхэд сэргэнэ
    setPendingRefund(null);
    setPendingRefundOther(null);
    setPerson(null);
    setPerms(NO_PERMS);
    setShift(null);
    setLines([]);
    setLastSale(null);
    setCatalog([]);
    setTxns([]);
    setSold({});
    setActiveMember(null);
    setServerMember(null);
    setServerRedemption(null);
    setServerWalletPay(null);
    setSaveError(null);
    saleKey.current = null;
  }, []);

  /** Session хүчингүй болсон (гарсан, хугацаа дууссан, түгжигдсэн) — нэвтрэх рүү */
  const expire = useCallback(
    (notice: string) => {
      const conn = connRef.current;
      if (conn) {
        saveSession(conn.deviceKey, null);
        connRef.current = { ...conn, session: null };
      }
      clearServerData();
      setSync({ status: "idle", error: null });
      setAuthNotice(notice);
    },
    [clearServerData],
  );

  /* Серверээс бүгдийг ачаална (нэвтэрсэн ажилтнаар). Амжилтгүй бол туршилтын өгөгдөл харуулахгүй. */
  const load = useCallback(
    async (conn: Auth) => {
      setSync({ status: "loading", error: null });
      try {
        const data = await api.bootstrap(conn);
        if (connRef.current !== conn) return;
        setPerson(fromServerStaff(data.staff));
        setPerms(data.permissions);
        // Хариу нь тодорхойгүй төлбөр: зөвхөн тэр ажилтан өөрөө шалгана
        const pending = readPending<CartLine>(conn.deviceKey);
        setPendingSale(pending && pending.staffId === data.staff.id ? pending : null);
        setPendingOther(pending && pending.staffId !== data.staff.id ? pending.staffName : null);
        const pr = readPendingRefund(conn.deviceKey);
        setPendingRefund(pr && pr.staffId === data.staff.id ? pr : null);
        setPendingRefundOther(pr && pr.staffId !== data.staff.id ? pr.staffName : null);
        setCatalog(data.products.map(fromServerProduct));
        setTxns(data.sales.map(fromServerSale));
        setSold(soldFrom(data.sales));
        setRefunds(data.refunds ?? []);
        setShift(
          data.shift
            ? {
                id: data.shift.id,
                openingFloat: data.shift.openingFloat,
                openedAt: hhmm(data.shift.openedAt),
                mine: data.shift.mine,
                cashierName: data.shift.cashierName,
                refundCashTotal: data.shift.refundCashTotal,
              }
            : null,
        );
        setSync({ status: "ready", error: null });
      } catch (e) {
        if (connRef.current !== conn) return;
        if (e instanceof ApiError && e.sessionLost) return expire(e.message);
        setSync({ status: "error", error: message(e, "Серверээс өгөгдөл ачаалж чадсангүй.") });
      }
    },
    [expire],
  );

  /* Горим сонгох: төвд холбогдсон эсэх. Холбох / салгах бүрт дахин. */
  useEffect(() => {
    const apply = () => {
      const device = readConn();
      const conn: Auth | null = device ? { ...device, session: readSession(device.deviceKey) } : null;
      connRef.current = conn;
      setAuthNotice(null);
      setLines([]);
      setLastSale(null);
      setActiveMember(null);
      setServerMember(null);
      setServerRedemption(null);
      setServerWalletPay(null);
      setRedeemRaw(0);
      setSaveError(null);
      saleKey.current = null;
      if (conn) {
        setMode("server");
        // Туршилтын өгөгдлийг бодит өгөгдөлтэй холихгүй
        clearServerData();
        setDebtors([]);
        setMoney([]);
        // Refresh: энэ tab-д нээлттэй session байвал ажилтан, смен серверээс сэргэнэ
        if (conn.session) load(conn);
        else setSync({ status: "idle", error: null });
      } else {
        setMode("demo");
        setPerson(null);
        setPerms(NO_PERMS);
        setCatalog(seedProducts);
        setTxns(seedTxns);
        setSold(seedSold);
        setDebtors(seedDebtors);
        setMoney(seedMoney);
        setShift(null);
        setSync({ status: "idle", error: null });
      }
    };
    apply();
    window.addEventListener(HQ_CHANGE, apply);
    return () => window.removeEventListener(HQ_CHANGE, apply);
  }, [load, clearServerData]);

  const loginPin = useCallback(
    async (pin: string) => {
      const conn = connRef.current;
      if (!conn) return "Касс төвд холбогдоогүй.";
      try {
        const res = await api.login(conn, pin);
        const next: Auth = { ...conn, session: res.session };
        saveSession(conn.deviceKey, res.session);
        connRef.current = next;
        setAuthNotice(null);
        await load(next);
        return null;
      } catch (e) {
        if (e instanceof ApiError && e.status === OFFLINE) return "Сервертэй холбогдож чадсангүй. Сүлжээгээ шалгана уу.";
        if (e instanceof ApiError && typeof e.body.attemptsLeft === "number") return `${e.message} (${e.body.attemptsLeft} оролдлого үлдсэн)`;
        return e instanceof Error ? e.message : "Нэвтэрч чадсангүй.";
      }
    },
    [load],
  );

  /** Хадгалалтын алдааг харуулна — session алдагдсан бол харуулахгүй (нэвтрэх дэлгэц
      шалтгааныг өөрөө бичнэ; дараагийн ажилтны дэлгэцэнд хуучин алдаа үлдэхгүй) */
  const showSaveError = (e: unknown, text: string) => {
    if (!(e instanceof ApiError && e.sessionLost)) setSaveError(text);
  };

  /** Серверийн алдаа: session алдагдсан бол нэвтрэх рүү, үгүй бол мессеж */
  const failed = useCallback(
    (e: unknown, fallback: string) => {
      if (e instanceof ApiError && e.sessionLost) {
        expire(e.message);
        return e.message;
      }
      return message(e, fallback);
    },
    [expire],
  );
  const attachServerMember = useCallback(
    async (token: string) => {
      const conn = connRef.current;
      if (!conn?.session) return "Касс төвд холбогдоогүй.";
      try {
        const res = await api.lookupMember(conn, token.trim());
        setServerMember({ ...res.member, token: token.trim() });
        setServerRedemption(null);
        setServerWalletPay(null);
        return null;
      } catch (e) {
        return failed(e, "Гишүүн олдсонгүй.");
      }
    },
    [failed],
  );


  /* Сагс өөрчлөгдвөл шинэ гүйлгээ — шинэ түлхүүр */
  useEffect(() => {
    saleKey.current = null;
  }, [lines]);

  const subtotal = cartTotal(lines);

  /* Зэрэглэлийн хөнгөлөлт эхэлж хасагдана. Гишүүн байхгүй бол гараар
     тавьсан хөнгөлөлт ажиллана — хуучин зан төлөв хэвээр. */
  const discountAmount = discountsOff
    ? 0
    : activeMember
    ? Math.round(subtotal * tierRule[activeMember.tier].off)
    : discount
      ? Math.round(subtotal * DISCOUNT_RATE)
      : 0;

  const afterDiscount = subtotal - discountAmount;

  /* Оноогоор бүх дүнг төлж болохгүй гэсэн дүрэм байхгүй, гэхдээ
     үлдэгдлээс ч, төлөх дүнгээс ч хэтэрч болохгүй. */
  /* Оноо зарцуулалт, гишүүний хөнгөлөлтийг сервер одоохондоо баталгаажуулж чадахгүй
     (гишүүд серверт байхгүй) — серверийн горимд хаалттай. */
  const redeemMax = activeMember && mode === "demo" ? Math.min(activeMember.points, afterDiscount) : 0;
  const redeemAmount = Math.min(redeem, redeemMax);

  /* Сервер горим: хэрэглэгч апп дээрээ ЗӨВШӨӨРСӨН оноо зарцуулалт л хөнгөлөлт болно — сервер дахин шалгана */
  const serverRedeemValue = mode === "server" && serverRedemption?.status === "approved" ? serverRedemption.value : 0;
  const serverRedeemMax =
    mode === "server" && serverMember?.canRedeem && serverMember.redeem
      ? Math.max(0, Math.min(serverMember.points, Math.floor(Math.floor((afterDiscount * serverMember.redeem.maxPct) / 100) / serverMember.redeem.pointValue)))
      : 0;
  const total = afterDiscount - redeemAmount - serverRedeemValue;

  const requestServerRedemption = useCallback(
    async (points: number) => {
      const conn = connRef.current;
      if (!conn?.session || !serverMember) return "Гишүүн холбогдоогүй.";
      try {
        const res = await api.requestRedemption(conn, { token: serverMember.token, points, cartTotal: afterDiscount });
        setServerRedemption(res.redemption);
        return null;
      } catch (e) {
        return failed(e, "Хүсэлт илгээж чадсангүй.");
      }
    },
    [serverMember, afterDiscount, failed],
  );
  const cancelServerRedemption = useCallback(() => {
    const conn = connRef.current;
    const r = serverRedemption;
    setServerRedemption(null);
    if (conn?.session && r && (r.status === "pending" || r.status === "approved")) api.cancelRedemption(conn, r.id).catch(() => {});
  }, [serverRedemption]);
  /* Хэрэглэгч апп дээрээ шийдэх хүртэл 1.5 сек тутам асууна (хугацаа дуусвал зогсоно) */
  const redemptionPending = serverRedemption?.status === "pending" ? serverRedemption.id : null;
  useEffect(() => {
    if (!redemptionPending) return;
    let stop = false;
    const tick = async () => {
      const conn = connRef.current;
      if (stop || !conn?.session) return;
      try {
        const res = await api.getRedemption(conn, redemptionPending);
        if (!stop) setServerRedemption((cur) => (cur?.id === res.redemption.id ? res.redemption : cur));
      } catch {
        /* сүлжээ — дараагийн удаа */
      }
    };
    const t = setInterval(() => void tick(), 1500);
    return () => {
      stop = true;
      clearInterval(t);
    };
  }, [redemptionPending]);

  /* Хэтэвч: касс нийт төлөх дүнгээр хүсэлт илгээнэ → хэрэглэгч апп дээрээ зөвшөөрнө. Сагс өөрчлөгдвөл
     хүсэлт хүчингүй (сервер дүнг яг тэнцүү эсэхийг шалгана) — энд ч автоматаар цуцална. */
  const requestServerWalletPay = useCallback(async () => {
    const conn = connRef.current;
    if (!conn?.session || !serverMember || serverMember.via !== "gerege_qr") return "Хэтэвчээр төлөхөд хэрэглэгчийн апп дээрх Gerege QR-ыг уншуулна.";
    try {
      const res = await api.requestWalletPay(conn, { token: serverMember.token, amount: total });
      setServerWalletPay(res.payment);
      return null;
    } catch (e) {
      return failed(e, "Хүсэлт илгээж чадсангүй.");
    }
  }, [serverMember, total, failed]);
  const cancelServerWalletPay = useCallback(() => {
    const conn = connRef.current;
    const p = serverWalletPay;
    setServerWalletPay(null);
    if (conn?.session && p && (p.status === "pending" || p.status === "approved")) api.cancelWalletPay(conn, p.id).catch(() => {});
  }, [serverWalletPay]);
  const walletPending = serverWalletPay?.status === "pending" ? serverWalletPay.id : null;
  useEffect(() => {
    if (!walletPending) return;
    let stop = false;
    const tick = async () => {
      const conn = connRef.current;
      if (stop || !conn?.session) return;
      try {
        const res = await api.getWalletPay(conn, walletPending);
        if (!stop) setServerWalletPay((cur) => (cur?.id === res.payment.id ? res.payment : cur));
      } catch {
        /* сүлжээ — дараагийн удаа */
      }
    };
    const t = setInterval(() => void tick(), 1500);
    return () => {
      stop = true;
      clearInterval(t);
    };
  }, [walletPending]);
  // Сагсны дүн хүсэлтийн дүнгээс зөрвөл хүсэлтийг цуцална (дахин хүснэ)
  useEffect(() => {
    const p = serverWalletPay;
    if (!p || p.amount === total || (p.status !== "pending" && p.status !== "approved")) return;
    const conn = connRef.current;
    const t = setTimeout(() => {
      setServerWalletPay(null);
      if (conn?.session) api.cancelWalletPay(conn, p.id).catch(() => {});
    }, 0);
    return () => clearTimeout(t);
  }, [serverWalletPay, total]);

  const vat = vatOf(total);
  /* «0.5 бараа» гэж байж болохгүй. Ширхэгээр зарагддагийг тоогоор нь,
     жин, литрээр зарагддагийг нэг бараа гэж тоолно. */
  const count = lines.reduce(
    (sum, line) => sum + (unitOf(line.product.unit).fractional ? 1 : line.qty),
    0,
  );

  /* Оноогоор төлсөн хэсгээс оноо дахин олгохгүй — өөрөө өөрийгөө тэжээхгүй */
  const earnPreview = activeMember
    ? Math.round(total * tierRule[activeMember.tier].earn)
    : 0;

  /** Нэмэх/хасах нь нэгжийн алхмаар: ширхэг 1, кг 0.1, литр 0.5 */
  const bump = useCallback(
    (product: Product, delta: number) => {
      const step = unitOf(product.unit).step;

      /* Үлдэгдлээс илүү зарж болохгүй. Задгай дүнгийн мөр каталогт
         байдаггүй, нөөцгүй учир түүнд таазгүй. */
      const stocked = catalog.find((item) => item.id === product.id);
      const ceiling = stocked ? stocked.stock : Infinity;

      setLines((current) => {
        const found = current.find((line) => line.product.id === product.id);
        if (!found) {
          if (delta <= 0) return current;
          return ceiling <= 0 ? current : [...current, { product, qty: Math.min(step, ceiling) }];
        }
        const raw = Number((found.qty + delta * step).toFixed(3));
        const qty = Math.min(raw, ceiling);
        return qty <= 0
          ? current.filter((line) => line.product.id !== product.id)
          : current.map((line) => (line.product.id === product.id ? { ...line, qty } : line));
      });
    },
    [catalog],
  );

  /**
   * Мөрийн тоо хэмжээг тогтооно.
   *
   * Сагсанд байхгүй бараанд дуудвал ШИНЭЭР нэмнэ. Энэ нь заавал
   * хэрэгтэй: жин, литрээр зарагддаг барааг хавтан дээр дарахад
   * шууд нэмэгддэггүй, жинлэх цонх нээгддэг — өөрөөр хэлбэл тэр
   * бараа энэ дуудлагын мөчид сагсанд хараахан байхгүй байдаг.
   * Зөвхөн map хийвэл чимээгүй юу ч болохгүй өнгөрнө.
   */
  const setQty = useCallback(
    (productId: string, qty: number) => {
      const value = Number(qty.toFixed(3));
      setLines((current) => {
        if (value <= 0) return current.filter((line) => line.product.id !== productId);
        if (current.some((line) => line.product.id === productId)) {
          return current.map((line) =>
            line.product.id === productId ? { ...line, qty: value } : line,
          );
        }
        const product = catalog.find((item) => item.id === productId);
        return product ? [...current, { product, qty: value }] : current;
      });
    },
    [catalog],
  );

  /**
   * Гүйлгээг дуусгана.
   *
   * Татварын кодгүй бараа байвал PosAPI татгалзах тул баримт дараалалд
   * орно — гэхдээ **гүйлгээ амжилттай хэвээр**. Энэ дүрэм нь бүх системийн
   * гол шийдвэр: татварын сервер худалдааг зогсоохгүй.
   */
  const completeDemo = useCallback(
    (sale: Sale) => {
      const sold = lines;
      if (sold.length === 0) return;

      const queued = sold.some((line) => !line.product.taxCoded);
      const no = Math.random().toString(16).slice(2, 12).toUpperCase();
      const amount = total;

      /* Урамшууллыг борлуулалт батлагдсаны дараа л бичнэ — төлбөр
         цуцлагдвал оноо хөдлөхгүй байх ёстой. */
      const loyalty: LoyaltyCalc = {
        member: activeMember,
        off: discountAmount,
        spent: redeemAmount,
        earned: earnPreview,
      };

      if (activeMember) {
        setMembers((current) =>
          current.map((m) =>
            m.id === activeMember.id
              ? {
                  ...m,
                  points: m.points - redeemAmount + earnPreview,
                  visits: m.visits + 1,
                }
              : m,
          ),
        );
      }

      setTxns((current) => [
        {
          id: id("t"),
          no,
          at: clock(),
          items: sold.reduce((sum, line) => sum + line.qty, 0),
          method: sale.method === "бэлэн" ? "Бэлэн" : sale.method === "карт" ? "Карт" : sale.method === "хэтэвч" ? "Хэтэвч" : "QPay",
          amount,
          receipt: queued ? "Код дутуу" : "Холбогдоогүй",
        },
        ...current,
      ]);

      // Үлдэгдэл хасагдана
      setCatalog((current) =>
        current.map((item) => {
          const line = sold.find((entry) => entry.product.id === item.id);
          return line ? { ...item, stock: Math.max(0, item.stock - line.qty) } : item;
        }),
      );

      setMoney((current) => [
        { id: id("e"), kind: "орлого", label: "Кассын борлуулалт", amount, at: "Өнөөдөр" },
        ...current,
      ]);

      setSold((current) => {
        const next = { ...current };
        for (const line of sold) {
          const prev = next[line.product.id] ?? { qty: 0, amount: 0 };
          next[line.product.id] = {
            qty: Number((prev.qty + line.qty).toFixed(3)),
            amount: prev.amount + lineTotal(line),
          };
        }
        return next;
      });

      setLastSale({ no, queued, change: sale.change, lines: sold, loyalty, method: sale.method });
      setLines([]);
      setActiveMember(null);
      setRedeemRaw(0);
    },
    [lines, total, activeMember, discountAmount, redeemAmount, earnPreview],
  );

  /* Хариу нь тодорхойгүй төлбөрийг дуусгах (баримт руу) */
  const finishPending = useCallback((p: PendingSale<CartLine>, s: ServerSale) => {
    savePending(null);
    setPendingSale(null);
    saleKey.current = null;
    setTxns((current) => (current.some((t) => t.id === s.id) ? current : [fromServerSale(s), ...current]));
    setLastSale({
      no: s.no,
      queued: s.receiptStatus === "queued",
      change: s.change,
      lines: p.lines,
      loyalty: { member: null, off: s.discount, spent: 0, earned: 0 },
      method: p.method,
    });
    setLines([]);
  }, []);

  /**
   * Тодорхойгүй төлбөрийг серверт эцэслэнэ: анхны түлхүүрийг цуцална (эсвэл анхны
   * transaction commit болсон бол түүний борлуулалтыг авна). Шинэ түлхүүрээр эхлэхээс
   * өмнө заавал — «олдсонгүй» эсвэл 4xx нь хожуу ирэх хүсэлтийг үгүйсгэхгүй.
   */
  const settlePending = useCallback(
    async (p: PendingSale<CartLine>, conn: Auth): Promise<"cancelled" | "completed" | { error: string }> => {
      try {
        const res = await api.cancelSale(conn, p.request.idempotencyKey);
        if (res.status === "completed" && res.sale) {
          finishPending(p, res.sale);
          load(conn);
          return "completed";
        }
        savePending(null);
        setPendingSale(null);
        saleKey.current = null;
        return "cancelled";
      } catch (e) {
        return { error: failed(e, "Цуцлалтыг баталгаажуулж чадсангүй — төлбөр хүлээгдэж байна.") };
      }
    },
    [finishPending, failed, load],
  );

  /**
   * Серверийн борлуулалт. Сервер үнэ, хөнгөлөлт, нийт дүнг дахин тооцоолж,
   * борлуулалт + мөр + төлбөр + үлдэгдлийг нэг transaction-оор бичнэ.
   * Хариу ирээгүй бол сагс хэвээр үлдэнэ; дахин оролдоход ижил түлхүүр
   * явах тул давхар борлуулалт үүсэхгүй.
   */
  const completeServer = useCallback(
    async (sale: Sale): Promise<boolean> => {
      const conn = connRef.current;
      const sold = lines;
      if (!conn || sold.length === 0 || savingNow.current) return false;
      if (!shift?.id) {
        setSaveError("Смен серверт нээгдээгүй байна. Дахин нэвтэрч смен нээнэ үү.");
        return false;
      }
      if (!person) return false;
      saleKey.current ??= newIdempotencyKey();
      /* Хариу нь тодорхойгүй төлбөр байвал түүнийг (анхны түлхүүр, агуулга) л дахин илгээнэ —
         шинэ түлхүүрээр өөр төлбөр үүсгэвэл давхар борлуулалт болж мэднэ. */
      const pending: PendingSale<CartLine> = pendingSale ?? {
        deviceKey: conn.deviceKey,
        staffId: person.id,
        staffName: person.name,
        request: {
          idempotencyKey: saleKey.current,
          shiftId: shift.id,
          cashierName: person.name,
          lines: sold.map((line) =>
            line.product.id.startsWith("free-") ? { free: line.product.price } : { productId: line.product.id, qty: line.qty },
          ),
          // Гишүүний (зэрэглэлийн) хөнгөлөлт серверт холбогдоогүй; гараар хөнгөлөлтийг сервер эрхээр шалгана
          discount: !discountsOff && discount && perms.discount ? { type: "manual" } : { type: "none" },
          payment: {
            method: METHOD_KEY[sale.method],
            tendered: sale.method === "бэлэн" ? sale.tendered : undefined,
            // Хэтэвч — хэрэглэгч ЗӨВШӨӨРСӨН хүсэлт; дүн, үлдэгдлийг сервер дахин шалгана
            ...(sale.method === "хэтэвч" && serverWalletPay?.status === "approved" ? { walletPaymentId: serverWalletPay.id } : {}),
          },
          expectedTotal: total,
          // Гишүүн — зөвхөн QR-ын токен; оноо, зэрэглэлийг сервер өөрөө тооцно
          ...(serverMember ? { memberToken: serverMember.token } : {}),
          // Зөвхөн хэрэглэгч ЗӨВШӨӨРСӨН зарцуулалт — дүн, үлдэгдлийг сервер дахин шалгана
          ...(serverMember && serverRedemption?.status === "approved" ? { redemptionId: serverRedemption.id } : {}),
        },
        lines: sold,
        method: sale.method,
        total,
        at: new Date().toISOString(),
      };
      // Илгээхээс ӨМНӨ хадгална: хариу ирэхээс өмнө хуудас хаагдсан ч түлхүүр алдагдахгүй
      savePending(pending);
      setPendingSale(pending);
      savingNow.current = true;
      setSaving(true);
      setSaveError(null);

      try {
        const res = await api.createSale(conn, pending.request);
        const s = res.sale;
        saleKey.current = null;
        savePending(null);
        setPendingSale(null);

        // Оноо — зөвхөн серверийн хариунаас (клиент тооцохгүй)
        const loyalty: LoyaltyCalc =
          s.loyalty && serverMember
            ? {
                member: { id: serverMember.id, name: serverMember.name ?? "Гишүүн", kind: "хүн", phone: serverMember.phone ?? "", points: s.loyalty.balance - s.loyalty.points + (s.loyalty.redeemedPoints ?? 0), tier: serverMember.tierName as Member["tier"], visits: 0, code: "" },
                off: s.discount - (s.loyalty.redeemValue ?? 0),
                spent: s.loyalty.redeemedPoints ?? 0,
                earned: s.loyalty.points,
              }
            : { member: activeMember, off: s.discount, spent: 0, earned: earnPreview };
        if (activeMember) {
          setMembers((current) =>
            current.map((m) => (m.id === activeMember.id ? { ...m, points: m.points + earnPreview, visits: m.visits + 1 } : m)),
          );
        }
        const stockBy = new Map(res.stock.map((x) => [x.productId, x.qty]));
        setCatalog((current) => current.map((item) => (stockBy.has(item.id) ? { ...item, stock: stockBy.get(item.id)! } : item)));
        setTxns((current) => (current.some((t) => t.id === s.id) ? current : [fromServerSale(s), ...current]));
        if (!res.duplicate) {
          setSold((current) => {
            const next = { ...current };
            for (const [id, v] of Object.entries(soldFrom([s]))) {
              const prev = next[id] ?? { qty: 0, amount: 0 };
              next[id] = { qty: Number((prev.qty + v.qty).toFixed(3)), amount: prev.amount + v.amount };
            }
            return next;
          });
        }
        setLastSale({ no: s.no, queued: s.receiptStatus === "queued", change: s.change, lines: pending.lines, loyalty, method: pending.method });
        setLines([]);
        setActiveMember(null);
        setServerMember(null);
        setServerRedemption(null);
        setServerWalletPay(null);
        setRedeemRaw(0);
        return true;
      } catch (e) {
        /* Сервер энэ хүсэлтийг татгалзсан (4xx) ч ижил түлхүүрийн өөр хүсэлт сүлжээнд явж байж
           болно — түлхүүрийг серверт цуцалж баталгаажуулсны дараа л pending-ийг арилгана. */
        if (isRejection(e)) {
          const settled = await settlePending(pending, conn);
          if (settled === "completed") return true;
        }
        showSaveError(e, failed(e, "Борлуулалт хадгалагдаагүй."));
        // Үнэ, үлдэгдэл серверт өөрчлөгдсөн байж магадгүй — шинэчилнэ (сагс хэвээр)
        if (e instanceof ApiError && (e.status === 409 || e.status === 404)) load(conn);
        return false;
      } finally {
        savingNow.current = false;
        setSaving(false);
      }
    },
    [lines, shift, activeMember, serverMember, serverRedemption, serverWalletPay, discountsOff, discount, total, earnPreview, person, load, perms, failed, pendingSale, settlePending],
  );


  const checkPending = useCallback(async () => {
    const conn = connRef.current;
    const p = pendingSale;
    if (!conn || !p) return { error: "Шалгах төлбөр алга." };
    try {
      const res = await api.findSale(conn, p.request.idempotencyKey);
      if (res.found && res.sale) {
        finishPending(p, res.sale);
        load(conn);
        return { found: true };
      }
      if (res.cancelled) {
        // Сервер дээр аль хэдийн цуцлагдсан — хожуу хүсэлт борлуулалт үүсгэж чадахгүй
        savePending(null);
        setPendingSale(null);
        saleKey.current = null;
        setLines(p.lines);
      }
      return { found: false };
    } catch (e) {
      return { error: failed(e, "Шалгаж чадсангүй.") };
    }
  }, [pendingSale, finishPending, failed, load]);

  const resendPending = useCallback(async () => {
    const conn = connRef.current;
    const p = pendingSale;
    if (!conn || !p || savingNow.current) return false;
    savingNow.current = true;
    setSaving(true);
    setSaveError(null);
    try {
      const res = await api.createSale(conn, p.request);
      finishPending(p, res.sale);
      load(conn);
      return true;
    } catch (e) {
      if (isRejection(e)) {
        const settled = await settlePending(p, conn);
        if (settled === "completed") return true;
        if (settled === "cancelled") setLines(p.lines);
      }
      showSaveError(e, failed(e, "Борлуулалт хадгалагдаагүй."));
      return false;
    } finally {
      savingNow.current = false;
      setSaving(false);
    }
  }, [pendingSale, finishPending, failed, load, settlePending]);

  const discardPending = useCallback(async () => {
    const conn = connRef.current;
    const p = pendingSale;
    if (!conn || !p) return { error: "Цуцлах төлбөр алга." };
    if (savingNow.current) return { error: "Төлбөр илгээгдэж байна — түр хүлээнэ үү." };
    savingNow.current = true;
    setSaving(true);
    try {
      const settled = await settlePending(p, conn);
      if (settled === "cancelled") setLines(p.lines);
      return settled;
    } finally {
      savingNow.current = false;
      setSaving(false);
    }
  }, [pendingSale, settlePending]);

  const completeSale = useCallback(
    async (sale: Sale) => {
      if (mode === "server") return completeServer(sale);
      completeDemo(sale);
      return true;
    },
    [mode, completeServer, completeDemo],
  );

  const openShift = useCallback(
    async (openingFloat: number) => {
      const conn = connRef.current;
      if (mode === "demo" || !conn) {
        setShift({ openingFloat, openedAt: clock(), mine: true });
        return null;
      }
      if (!person) return "Нэвтэрсэн ажилтан алга.";
      try {
        const res = await api.openShift(conn, { openingFloat });
        const sh = res.shift;
        setShift({ id: sh.id, openingFloat: sh.openingFloat, openedAt: hhmm(sh.openedAt), mine: sh.mine, cashierName: sh.cashierName });
        return null;
      } catch (e) {
        return failed(e, "Смен нээж чадсангүй.");
      }
    },
    [mode, person, failed],
  );

  const closeShift = useCallback(async () => {
    const conn = connRef.current;
    if (mode === "demo" || !conn) {
      setShift(null);
      return null;
    }
    if (!shift?.id) return "Нээлттэй смен алга.";
    try {
      await api.closeShift(conn, shift.id);
      setShift(null);
      return null;
    } catch (e) {
      const text = failed(e, "Смен хааж чадсангүй.");
      showSaveError(e, text);
      return text;
    }
  }, [mode, shift, failed]);

  const upsertProduct = useCallback(
    async (product: Product) => {
      const conn = connRef.current;
      if (mode === "demo" || !conn) {
        setCatalog((current) =>
          current.some((item) => item.id === product.id)
            ? current.map((item) => (item.id === product.id ? product : item))
            : [product, ...current],
        );
        return null;
      }
      const known = catalog.some((item) => item.id === product.id);
      try {
        const res = await api.upsertProduct(conn, {
          id: known ? product.id : undefined,
          name: product.name,
          price: product.price,
          oldPrice: product.oldPrice ?? null,
          unit: product.unit,
          category: product.category,
          barCode: product.barCode ?? null,
          image: product.image,
          taxType: product.taxType,
          taxCoded: product.taxCoded,
          stock: product.stock,
        });
        const saved = fromServerProduct(res.product);
        setCatalog((current) => (known ? current.map((item) => (item.id === product.id ? saved : item)) : [saved, ...current]));
        return null;
      } catch (e) {
        return failed(e, "Бараа хадгалагдаагүй.");
      }
    },
    [mode, catalog, failed],
  );

  const adjustStock = useCallback(
    async (product: Product, qty: number) => {
      const conn = connRef.current;
      if (mode === "demo" || !conn) {
        setCatalog((current) => current.map((item) => (item.id === product.id ? { ...item, stock: qty } : item)));
        return null;
      }
      try {
        const res = await api.adjustStock(conn, product.id, qty);
        const saved = fromServerProduct(res.product);
        setCatalog((current) => current.map((item) => (item.id === product.id ? saved : item)));
        return null;
      } catch (e) {
        return failed(e, "Үлдэгдэл хадгалагдаагүй.");
      }
    },
    [mode, failed],
  );

  /** Буцаалт хадгалагдсан (шууд, давтан хүсэлт эсвэл сэргээлтээр) — жагсаалт, үлдэгдэл */
  const finishRefund = useCallback((r: ServerRefund) => {
    savePendingRefund(null);
    setPendingRefund(null);
    setRefunds((current) => (current.some((x) => x.id === r.id) ? current : [r, ...current]));
    const conn = connRef.current;
    if (conn?.session) load(conn);
  }, [load]);

  /** Хариу ирээгүй буцаалтыг серверт эцэслэнэ (цуцлах; анхных commit болсон бол түүнийг авна) */
  const settleRefund = useCallback(
    async (p: PendingRefund, conn: Auth): Promise<{ refund: ServerRefund } | { cancelled: true } | { error: string }> => {
      try {
        const res = await api.cancelRefund(conn, p.request.idempotencyKey);
        if (res.status === "completed" && res.refund) {
          finishRefund(res.refund);
          return { refund: res.refund };
        }
        savePendingRefund(null);
        setPendingRefund(null);
        return { cancelled: true };
      } catch (e) {
        return { error: failed(e, "Цуцлалтыг баталгаажуулж чадсангүй — буцаалт хүлээгдэж байна.") };
      }
    },
    [failed, finishRefund],
  );

  /* Буцаалт — сервер дүнг тооцож нэг transaction-оор бичнэ. Илгээхээс ӨМНӨ түлхүүрийг
     localStorage-д хадгална: хариу ирээгүй, refresh, session дууссан ч анхны түлхүүрээр сэргээнэ. */
  const submitRefund = useCallback(
    async (body: RefundRequest) => {
      const conn = connRef.current;
      if (!conn) return { error: "Касс төвд холбогдоогүй — буцаалт серверийн горимд л." };
      if (!person || !body.idempotencyKey) return { error: "Нэвтэрсэн ажилтан алга." };
      const pending: PendingRefund = {
        deviceKey: conn.deviceKey,
        staffId: person.id,
        staffName: person.name,
        saleNo: body.saleNo ?? "",
        request: { ...body, idempotencyKey: body.idempotencyKey },
        at: new Date().toISOString(),
      };
      savePendingRefund(pending);
      setPendingRefund(pending);
      setRefundSending(true);
      try {
        const res = await api.createRefund(conn, pending.request);
        savePendingRefund(null);
        setPendingRefund(null);
        setRefunds((current) => (current.some((r) => r.id === res.refund.id) ? current : [res.refund, ...current]));
        const stockBy = new Map(res.stock.map((x) => [x.productId, x.qty]));
        setCatalog((current) => current.map((item) => (stockBy.has(item.id) ? { ...item, stock: stockBy.get(item.id)! } : item)));
        if (res.refund.moneyStatus === "refunded_cash" && !res.duplicate) {
          setShift((current) => (current ? { ...current, refundCashTotal: (current.refundCashTotal ?? 0) + res.refund.total } : current));
        }
        return { refund: res.refund };
      } catch (e) {
        if (isRejection(e)) {
          // Сервер татгалзсан ч ижил түлхүүрийн өөр хүсэлт явж болно — эхлээд серверт эцэслэнэ
          const settled = await settleRefund(pending, conn);
          if ("refund" in settled) return { refund: settled.refund };
          if ("cancelled" in settled) return { error: failed(e, "Буцаалт хадгалагдаагүй.") };
        }
        return { error: failed(e, "Буцаалт хадгалагдаагүй."), offline: true };
      } finally {
        setRefundSending(false);
      }
    },
    [failed, person, settleRefund],
  );

  const checkPendingRefund = useCallback(async () => {
    const conn = connRef.current;
    const p = pendingRefund;
    if (!conn || !p) return { error: "Шалгах буцаалт алга." };
    try {
      const res = await api.findRefund(conn, p.request.idempotencyKey);
      if (res.found && res.refund) {
        finishRefund(res.refund);
        setResolvedRefund(res.refund);
        return { refund: res.refund };
      }
      if (res.cancelled) {
        savePendingRefund(null);
        setPendingRefund(null);
        setResolvedRefund("cancelled");
      }
      return { found: false as const, cancelled: res.cancelled };
    } catch (e) {
      return { error: failed(e, "Шалгаж чадсангүй.") };
    }
  }, [pendingRefund, failed, finishRefund]);

  const resendPendingRefund = useCallback(async () => {
    const conn = connRef.current;
    const p = pendingRefund;
    if (!conn || !p) return { error: "Илгээх буцаалт алга." };
    try {
      const res = await api.createRefund(conn, p.request);
      finishRefund(res.refund);
      setResolvedRefund(res.refund);
      return { refund: res.refund };
    } catch (e) {
      if (isRejection(e)) {
        const settled = await settleRefund(p, conn);
        if ("refund" in settled) {
          setResolvedRefund(settled.refund);
          return { refund: settled.refund };
        }
        if ("cancelled" in settled) setResolvedRefund("cancelled");
      }
      return { error: failed(e, "Буцаалт хадгалагдаагүй.") };
    }
  }, [pendingRefund, failed, finishRefund, settleRefund]);

  const cancelPendingRefund = useCallback(async () => {
    const conn = connRef.current;
    const p = pendingRefund;
    if (!conn || !p) return { error: "Цуцлах буцаалт алга." };
    const settled = await settleRefund(p, conn);
    if ("refund" in settled) setResolvedRefund(settled.refund);
    else if ("cancelled" in settled) setResolvedRefund("cancelled");
    return settled;
  }, [pendingRefund, settleRefund]);

  const markRefundExternal = useCallback(
    async (refundId: string, reference: string) => {
      const conn = connRef.current;
      if (!conn) return "Касс төвд холбогдоогүй.";
      try {
        const res = await api.markRefundExternal(conn, refundId, reference);
        setRefunds((current) => current.map((r) => (r.id === refundId ? res.refund : r)));
        return null;
      } catch (e) {
        return failed(e, "Тэмдэглэж чадсангүй.");
      }
    },
    [failed],
  );

  const value = useMemo<Store>(
    () => ({
      mode,
      sync,
      saving,
      saveError,
      clearSaveError: () => setSaveError(null),
      reload: () => {
        if (connRef.current?.session) load(connRef.current);
      },
      perms,
      loginPin,
      authNotice,
      auth: () => connRef.current,
      reportError: failed,
      clearResolvedRefund: () => setResolvedRefund(null),
      refunds,
      submitRefund,
      markRefundExternal,
      pendingRefund,
      refundSending,
      resolvedRefund,
      pendingRefundOther,
      checkPendingRefund,
      resendPendingRefund,
      cancelPendingRefund,
      pendingSale,
      pendingOther,
      checkPending,
      resendPending,
      discardPending,
      person,
      shift,
      catalog,
      lines,
      discount,
      activeMember,
      redeem: redeemAmount,
      lockedStaff,
      discountsOff,
      sold,
      txns,
      debtors,
      members,
      money,
      lastSale,
      subtotal,
      discountAmount,
      redeemAmount,
      earnPreview,
      redeemMax,
      total,
      vat,
      count,

      login: (next) => {
        setPerson(next);
        setPerms(ROLE_PERMS[next.role]);
      },
      logout: () => {
        setLines([]);
        setSaveError(null);
        setAuthNotice(null);
        if (mode === "server" && connRef.current) {
          // Session-ийг сервер дээр хүчингүй болгоно. Смен нээлттэй хэвээр — дараагийн нэвтрэлтэд сэргэнэ.
          const conn = connRef.current;
          if (conn.session) api.logout(conn).catch(() => {});
          saveSession(conn.deviceKey, null);
          connRef.current = { ...conn, session: null };
          clearServerData();
          setSync({ status: "idle", error: null });
        } else {
          setPerson(null);
          setShift(null);
        }
        setLastSale(null);
        setActiveMember(null);
        setRedeemRaw(0);
      },

      toggleStaffLock: (id) =>
        setLockedStaff((current) =>
          current.includes(id) ? current.filter((x) => x !== id) : [...current, id],
        ),
      setDiscountsOff,

      attachMember: (member) => {
        setActiveMember(member);
        setRedeemRaw(0);
      },
      serverMember,
      attachServerMember,
      detachServerMember: () => {
        cancelServerRedemption();
        cancelServerWalletPay();
        setServerMember(null);
      },
      serverRedemption,
      serverRedeemMax,
      serverRedeemValue,
      requestServerRedemption,
      cancelServerRedemption,
      serverWalletPay,
      requestServerWalletPay,
      cancelServerWalletPay,
      detachMember: () => {
        setActiveMember(null);
        setRedeemRaw(0);
      },
      setRedeem: (points) => setRedeemRaw(Math.max(0, Math.round(points))),
      openShift,
      closeShift,

      bump,
      addFreeAmount: (amount) => {
        if (amount <= 0) return;
        setLines((current) => [
          ...current,
          {
            qty: 1,
            product: {
              id: "free-" + Math.random().toString(36).slice(2, 8),
              name: "Бусад борлуулалт",
              price: amount,
              stock: 0,
              category: "бусад",
              unit: "ш",
              taxType: "VAT_ABLE",
              // Задгай дүнгийн борлуулалтад ерөнхий татварын код хэрэглэнэ.
              // ШАЛГАХ: е-баримт ийм гүйлгээнд аль кодыг хүлээж авдгийг
              // PosAPI 3.0.1 тодорхойлолтоос батлах.
              taxCoded: true,
              image: "/products/__none.png",
            },
          },
        ]);
      },
      setQty,
      clearCart: () => setLines([]),
      toggleDiscount: () => setDiscount((value) => !value),

      completeSale,
      clearLastSale: () => setLastSale(null),

      upsertProduct,
      adjustStock,

      addDebtor: (debtor) => setDebtors((current) => [{ ...debtor, id: id("d") }, ...current]),
      payDebt: (debtorId, amount) => {
        setDebtors((current) =>
          current
            .map((item) =>
              item.id === debtorId
                ? { ...item, balance: Math.max(0, item.balance - amount) }
                : item,
            )
            .filter((item) => item.balance > 0),
        );
        setMoney((current) => [
          { id: id("e"), kind: "орлого", label: "Өр төлөлт", amount, at: "Өнөөдөр" },
          ...current,
        ]);
      },
      addMember: (member) => setMembers((current) => [{ ...member, id: id("m") }, ...current]),
      addMoney: (entry) => setMoney((current) => [{ ...entry, id: id("e") }, ...current]),
    }),
    [
      mode,
      serverMember,
      attachServerMember,
      serverRedemption,
      serverRedeemMax,
      serverRedeemValue,
      requestServerRedemption,
      cancelServerRedemption,
      serverWalletPay,
      requestServerWalletPay,
      cancelServerWalletPay,
      sync,
      saving,
      saveError,
      load,
      perms,
      loginPin,
      authNotice,
      clearServerData,
      failed,
      refunds,
      submitRefund,
      markRefundExternal,
      pendingRefund,
      refundSending,
      resolvedRefund,
      pendingRefundOther,
      checkPendingRefund,
      resendPendingRefund,
      cancelPendingRefund,
      pendingSale,
      pendingOther,
      checkPending,
      resendPending,
      discardPending,
      openShift,
      closeShift,
      upsertProduct,
      adjustStock,
      person,
      shift,
      catalog,
      lines,
      discount,
      txns,
      debtors,
      members,
      money,
      lastSale,
      subtotal,
      discountAmount,
      redeemAmount,
      earnPreview,
      redeemMax,
      activeMember,
      lockedStaff,
      discountsOff,
      sold,
      total,
      vat,
      count,
      bump,
      setQty,
      completeSale,
    ],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/**
 * CSV татах — Excel шууд нээнэ.
 *
 * Жинхэнэ .xlsx биш: тэрэнд сан нэмэх шаардлагатай. UTF-8 BOM тавьсан тул
 * Excel кирилл үсгийг зөв уншина.
 */
export function downloadCsv(filename: string, rows: (string | number)[][]) {
  const body = rows
    .map((row) =>
      row
        .map((cell) => {
          const text = String(cell);
          return /[",;\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
        })
        .join(","),
    )
    .join("\r\n");

  const blob = new Blob(["﻿" + body], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
