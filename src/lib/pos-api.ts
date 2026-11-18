/**
 * Gerege төвийн кассын өгөгдлийн API (Boxsi сайт → /api/pos/*).
 *
 * Касс төвд холбогдсон бол (Тохиргоо → Төв систем) бараа, үлдэгдэл, смен,
 * борлуулалт бүгд серверт хадгалагдана. Холбогдоогүй бол туршилтын горим —
 * юу ч хадгалагдахгүй. Хоёр горимын өгөгдөл хэзээ ч холилдохгүй.
 */

const HQ_KEY = "gp-hq-v1";
export const HQ_CHANGE = "gp-hq-change";

export type HqConn = { server: string; deviceKey: string };
/** Төхөөрөмж + нэвтэрсэн ажилтны session. Түлхүүр дангаараа зөвхөн «аль касс» гэдгийг танина. */
export type Auth = HqConn & { session: string | null };

/* Ажилтны session — зөвхөн энэ tab-д (refresh-д хадгалагдана, хөтөч хаахад арилна) */
const SESSION_KEY = "gp-session-v1";
export const readSession = (deviceKey: string): string | null => {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    const saved = raw ? (JSON.parse(raw) as { deviceKey?: string; session?: string }) : null;
    return saved?.deviceKey === deviceKey && saved.session ? saved.session : null;
  } catch {
    return null;
  }
};
export const saveSession = (deviceKey: string, session: string | null) => {
  try {
    if (session) sessionStorage.setItem(SESSION_KEY, JSON.stringify({ deviceKey, session }));
    else sessionStorage.removeItem(SESSION_KEY);
  } catch {}
};

/**
 * Хариу нь тодорхойгүй төлбөр (сүлжээ тасарсан, session дууссан). Анхны
 * idempotency key, хүсэлтийн агуулгатай нь хадгална — дахин илгээхэд сервер
 * давхар борлуулалт үүсгэхгүй. Нууц мэдээлэл агуулахгүй (session, PIN байхгүй).
 */
export type PendingSale<Line = unknown> = {
  deviceKey: string;
  staffId: string;
  staffName: string;
  request: SaleRequest;
  /** Баримтад харуулах сагсны мөрүүд */
  lines: Line[];
  method: "бэлэн" | "карт" | "qpay" | "хэтэвч";
  total: number;
  at: string;
};
const PENDING_KEY = "gp-pending-sale-v1";
export const readPending = <Line,>(deviceKey: string): PendingSale<Line> | null => {
  try {
    const raw = localStorage.getItem(PENDING_KEY);
    const p = raw ? (JSON.parse(raw) as PendingSale<Line>) : null;
    return p && p.deviceKey === deviceKey ? p : null;
  } catch {
    return null;
  }
};
export const savePending = (p: PendingSale | null) => {
  try {
    if (p) localStorage.setItem(PENDING_KEY, JSON.stringify(p));
    else localStorage.removeItem(PENDING_KEY);
  } catch {}
};

/** Хариу ирээгүй буцаалт — анхны түлхүүр, хүсэлттэй (нууц мэдээлэлгүй) */
export type PendingRefund = {
  deviceKey: string;
  staffId: string;
  staffName: string;
  saleNo: string;
  request: RefundRequest & { idempotencyKey: string };
  at: string;
};
const PENDING_REFUND_KEY = "gp-pending-refund-v1";
export const readPendingRefund = (deviceKey: string): PendingRefund | null => {
  try {
    const raw = localStorage.getItem(PENDING_REFUND_KEY);
    const p = raw ? (JSON.parse(raw) as PendingRefund) : null;
    return p && p.deviceKey === deviceKey ? p : null;
  } catch {
    return null;
  }
};
export const savePendingRefund = (p: PendingRefund | null) => {
  try {
    if (p) localStorage.setItem(PENDING_REFUND_KEY, JSON.stringify(p));
    else localStorage.removeItem(PENDING_REFUND_KEY);
  } catch {}
};

export const readConn = (): HqConn | null => {
  try {
    const raw = localStorage.getItem(HQ_KEY);
    const saved = raw ? (JSON.parse(raw) as Partial<HqConn>) : null;
    return saved?.server && saved.deviceKey ? { server: saved.server, deviceKey: saved.deviceKey } : null;
  } catch {
    return null;
  }
};

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public body: Record<string, unknown> = {},
  ) {
    super(message);
  }
  /** Ажилтны session хүчингүй (гарсан, хугацаа дууссан, түгжигдсэн, эрх өөрчлөгдсөн) */
  get sessionLost() {
    return this.status === 401 && this.body.code === "session";
  }
}

/** Сүлжээ тасарсан, сервер хариулаагүй — гүйлгээ хадгалагдсан эсэх тодорхойгүй */
export const OFFLINE = 0;

async function call<T>(conn: Auth | HqConn, path: string, body?: unknown): Promise<T> {
  const session = "session" in conn ? conn.session : null;
  let res: Response;
  try {
    res = await fetch(`${conn.server}${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${conn.deviceKey}`,
        ...(session ? { "X-Pos-Session": session } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(20_000),
      cache: "no-store",
    });
  } catch {
    throw new ApiError(OFFLINE, "Сервертэй холбогдож чадсангүй.");
  }
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) throw new ApiError(res.status, typeof data.error === "string" ? data.error : `Серверийн алдаа (${res.status})`, data);
  return data as T;
}

/* ───────── серверийн хэлбэр ───────── */

export type ServerProduct = {
  id: string;
  name: string;
  price: number;
  oldPrice: number | null;
  unit: string;
  category: string;
  barCode: string | null;
  image: string | null;
  taxType: "VAT_ABLE" | "VAT_FREE";
  taxCoded: boolean;
  stock: number;
  demo: boolean;
};

export type StaffRole = "cashier" | "manager" | "owner";
export type Permissions = {
  sell: boolean; shift: boolean; refund: boolean; discount: boolean; editProducts: boolean; adjustStock: boolean;
  branchReports: boolean; merchantReports: boolean; manageStaff: boolean;
  /** Урамшууллын дүрэм, картын загвар — зөвхөн эзэн (хуучин сервер илгээхгүй бол false) */
  manageLoyalty?: boolean;
};
export type ServerStaff = { id: string; name: string; role: StaffRole; initials: string };

export type ServerShift = {
  id: string;
  staffId: string | null;
  /** Нэвтэрсэн ажилтны смен эсэх */
  mine: boolean;
  openingFloat: number;
  openedAt: string;
  cashierName: string | null;
  salesTotal: number;
  salesCount: number;
  cashTotal: number;
  /** Энэ сменд кассаас бэлнээр буцаасан */
  refundCashTotal: number;
};

/** Мөнгө бодитоор буцсан эсэх */
export type RefundMoneyStatus = "refunded_cash" | "pending_external" | "refunded_external_manual" | "refunded_wallet";
export type ServerRefund = {
  id: string;
  no: string;
  saleId: string;
  saleNo: string | null;
  createdAt: string;
  staffName: string | null;
  reason: string;
  subtotal: number;
  discount: number;
  total: number;
  vat: number;
  method: "cash" | "card" | "qpay" | "wallet";
  moneyStatus: RefundMoneyStatus;
  externalRef: string | null;
  loyaltyStatus: string;
  merchantName: string | null;
  branchName: string | null;
  /** Буцаалт хийсэн касс */
  deviceNo: string | null;
  /** Гараар буцаасан мөнгөний бүртгэл */
  payout: { reference: string; staffName: string | null; at: string } | null;
  lines: { saleLineId: string; productId: string | null; name: string; unit: string | null; qty: number; unitPrice: number; refundAmount: number; disposition: string }[];
};
export type RefundableSale = {
  id: string;
  no: string;
  createdAt: string;
  cashierName: string | null;
  subtotal: number;
  discount: number;
  total: number;
  vat: number;
  method: "cash" | "card" | "qpay" | "wallet";
  refundedTotal: number;
  lines: {
    id: string; productId: string | null; name: string; unit: string | null; unitPrice: number; qty: number;
    lineNet: number; refundedQty: number; remainingQty: number; remainingAmount: number; free: boolean;
  }[];
};
export type RefundRequest = {
  idempotencyKey?: string;
  /** Касс аппын дотоод (дуусаагүй буцаалтын дэлгэцэд) — сервер үл тооно */
  saleNo?: string;
  saleId: string;
  reason: string;
  lines: { saleLineId: string; qty: number; disposition: "restock" | "damaged" }[];
  dryRun?: boolean;
  expectedTotal?: number;
};
export type RefundPreview = {
  preview: true;
  subtotal: number;
  discount: number;
  total: number;
  vat: number;
  method: "cash" | "card" | "qpay" | "wallet";
  moneyStatus: RefundMoneyStatus;
};

export type ServerSale = {
  id: string;
  no: string;
  createdAt: string;
  cashierName: string | null;
  subtotal: number;
  discount: number;
  discountType: string;
  total: number;
  vat: number;
  method: "cash" | "card" | "qpay" | "wallet";
  tendered: number | null;
  change: number;
  receiptStatus: "pending" | "queued";
  items: number;
  /** Гишүүнтэй борлуулалтад СЕРВЕРИЙН олгосон оноо (клиент тооцохгүй) */
  /** points — нийт (суурь + урамшуулал); promos — хэрэгжсэн онооны урамшуулал */
  loyalty?: {
    memberId: string;
    points: number;
    basePoints?: number;
    promos?: { id: number; kind: PromoKind; title: string; points: number }[];
    /** Зарцуулсан оноо, түүний хөнгөлөлт (₮) — discount-д багтсан */
    redeemedPoints?: number;
    redeemValue?: number;
    balance: number;
    ruleVersion: number | null;
  } | null;
  lines: { productId: string | null; name: string; unit: string | null; unitPrice: number; qty: number; lineTotal: number; taxType: string | null }[];
};

/** Кассын QR-аар танигдсан гишүүн — зөвхөн танина, оноо зарцуулах эрх биш */
export type ServerMember = {
  id: string;
  name: string | null;
  phone: string | null;
  tier: string;
  tierName: string;
  points: number;
  rateBp: number;
  programActive: boolean;
  /** gerege_qr — хэрэглэгчийн апп дээрх нэг удаагийн QR; card — картын статик QR (зөвхөн оноо цуглуулна) */
  via?: "gerege_qr" | "card";
  /** Энэ уншилтаар анх удаа элссэн */
  joined?: boolean;
  /** Зарцуулах боломж (Gerege QR + эзэн идэвхжүүлсэн + доод оноо) — хэрэглэгч апп дээрээ зөвшөөрнө */
  canRedeem: boolean;
  redeem?: { pointValue: number; minPoints: number; maxPct: number } | null;
  /** Энэ гишүүнд одоо хэрэгжих онооны урамшуулал (мэдээлэл — тооцоог сервер хийнэ) */
  promos?: { id: string; kind: PromoKind; title: string; badge: string }[];
};

export type PromoKind = "multiplier" | "threshold_bonus";
/** Онооны урамшуулал — status: live / scheduled / ended / stopped (серверийн цагаар) */
export type LoyaltyPromo = {
  id: string; kind: PromoKind; title: string; badge: string; description: string | null;
  multiplier: number | null; minAmount: number | null; bonusPoints: number | null; tiers: string[] | null;
  startsAt: string; endsAt: string; status: "live" | "scheduled" | "ended" | "stopped";
};
export type PromoInput = { id?: string; kind: PromoKind; title: string; description?: string; multiplier?: number; minAmount?: number; bonusPoints?: number; tiers?: string[]; startsAt: string; endsAt: string };

export type LoyaltyTier = { code: string; name: string; earnBp: number };
export type RedeemSpec = { enabled: boolean; pointValue: number; minPoints: number; maxPct: number };
export type LoyaltyRule = { id: string; version: number; status: string; tiers: LoyaltyTier[]; storeBonusBp: number; redeem?: RedeemSpec; activatedAt: string | null; updatedAt: string };
/** Хэтэвчээр төлөх хүсэлт: pending → (хэрэглэгч апп дээр) approved / declined; expired; used. Дүн = сагсны төлөх дүн */
export type WalletPayment = { id: string; status: "pending" | "approved" | "declined" | "cancelled" | "used" | "expired"; amount: number; expiresAt: string; decidedAt: string | null; saleId: string | null };
/** Оноо зарцуулах хүсэлт: pending → (хэрэглэгч апп дээр) approved / declined; expired; used */
export type Redemption = { id: string; status: "pending" | "approved" | "declined" | "cancelled" | "used" | "expired"; points: number; value: number; cartTotal: number; expiresAt: string; decidedAt: string | null; saleId: string | null };
export type LoyaltyCard = {
  id: string; version: number; status: string; title: string; description: string | null; bgColor: string; textColor: string;
  logoId: string | null; logoUrl: string | null; activatedAt: string | null; updatedAt: string;
};
export type LoyaltyAdmin = {
  merchant: string;
  rule: { active: LoyaltyRule | null; draft: LoyaltyRule | null; defaults: { tiers: LoyaltyTier[]; storeBonusBp: number; redeem?: RedeemSpec } };
  card: { active: LoyaltyCard | null; draft: LoyaltyCard | null };
  stats: { members: number; points: number };
};
export type LoyaltyMemberRow = { id: string; name: string | null; phone: string | null; tier: string; points: number; status: string; joinedAt: string };

export type Bootstrap = {
  staff: ServerStaff;
  permissions: Permissions;
  device: { serial: string; posNo: string | null; merchant: string; branch: string; locked: boolean };
  products: ServerProduct[];
  shift: ServerShift | null;
  sales: ServerSale[];
  /** Өнөөдөр энэ кассаар хийсэн буцаалт (менежер, эзэн) */
  refunds: ServerRefund[];
};

export type SaleRequest = {
  idempotencyKey: string;
  shiftId: string;
  cashierName: string | null;
  lines: ({ productId: string; qty: number } | { free: number })[];
  discount: { type: "none" } | { type: "manual" } | { type: "tier"; tier: string };
  payment: { method: "cash" | "card" | "qpay" | "wallet"; tendered?: number; walletPaymentId?: string };
  expectedTotal: number;
  /** Гишүүний QR-ын токен — сервер энэ байгууллагаас хайж оноо олгоно */
  memberToken?: string;
  /** Хэрэглэгч апп дээрээ зөвшөөрсөн оноо зарцуулах хүсэлт (Gerege QR-тай л) */
  redemptionId?: string;
};

export type Report = {
  scope: "shift" | "branch" | "merchant";
  branch?: string;
  totals: {
    count: number; total: number; discount: number; vat: number; cash: number; card: number; qpay: number; wallet?: number;
    refundCount: number; refundTotal: number; refundedCash: number; refundedExternal: number; refundPending: number; net: number;
  };
  byBranch: { branchId: string; name: string; count: number; total: number; refunds: number; net: number }[];
  sales: ServerSale[];
  refunds: ServerRefund[];
};

export type StaffEntry = { id: string; name: string; role: StaffRole; locked: boolean; pinSet: boolean; branchIds: string[] };

export const api = {
  login: (conn: HqConn, pin: string) =>
    call<{ session: string; expiresAt: string; staff: ServerStaff; permissions: Permissions }>(conn, "/api/pos/login", { pin }),
  logout: (auth: Auth) => call<{ ok: boolean }>(auth, "/api/pos/logout", {}),
  bootstrap: (auth: Auth) => call<Bootstrap>(auth, "/api/pos/bootstrap"),
  openShift: (auth: Auth, body: { openingFloat: number }) =>
    call<{ shift: ServerShift; existing: boolean }>(auth, "/api/pos/shift", { action: "open", ...body }),
  closeShift: (auth: Auth, shiftId: string) => call<{ shift: ServerShift }>(auth, "/api/pos/shift", { action: "close", shiftId }),
  findSale: (auth: Auth, idempotencyKey: string) =>
    call<{ found: boolean; cancelled?: boolean; sale?: ServerSale }>(auth, `/api/pos/sales?${new URLSearchParams({ idempotencyKey })}`),
  /** Хариу нь тодорхойгүй төлбөрийг серверт эцэслэх — анхны transaction явж байвал дуусахыг хүлээнэ */
  cancelSale: (auth: Auth, idempotencyKey: string) =>
    call<{ status: "cancelled" | "completed"; sale?: ServerSale }>(auth, "/api/pos/sales/cancel", { idempotencyKey }),
  createSale: (auth: Auth, body: SaleRequest) =>
    call<{ sale: ServerSale; duplicate: boolean; stock: { productId: string; qty: number }[] }>(auth, "/api/pos/sales", body),
  /** Каталог (нийтлэг үнэ) — зөвхөн эзэн */
  upsertProduct: (auth: Auth, body: Record<string, unknown>) => call<{ product: ServerProduct }>(auth, "/api/pos/products", body),
  /** Энэ салбарын үлдэгдэл — менежер, эзэн */
  adjustStock: (auth: Auth, productId: string, qty: number) => call<{ product: ServerProduct }>(auth, "/api/pos/stock", { productId, qty }),
  lookupSale: (auth: Auth, no: string) =>
    call<{ sale: RefundableSale; refunds: ServerRefund[] }>(auth, `/api/pos/refunds/lookup?${new URLSearchParams({ no })}`),
  previewRefund: (auth: Auth, body: RefundRequest) => call<RefundPreview>(auth, "/api/pos/refunds", { ...body, dryRun: true }),
  createRefund: (auth: Auth, body: RefundRequest) =>
    call<{ refund: ServerRefund; duplicate: boolean; stock: { productId: string; qty: number }[] }>(auth, "/api/pos/refunds", body),
  findRefund: (auth: Auth, idempotencyKey: string) =>
    call<{ found: boolean; cancelled?: boolean; refund?: ServerRefund }>(auth, `/api/pos/refunds?${new URLSearchParams({ idempotencyKey })}`),
  /** Хариу ирээгүй буцаалтыг серверт эцэслэх — анхны transaction явж байвал хүлээнэ */
  cancelRefund: (auth: Auth, idempotencyKey: string) =>
    call<{ status: "cancelled" | "completed"; refund?: ServerRefund }>(auth, "/api/pos/refunds/cancel", { idempotencyKey }),
  markRefundExternal: (auth: Auth, refundId: string, reference: string) =>
    call<{ refund: ServerRefund }>(auth, "/api/pos/refunds/mark-external", { refundId, reference }),
  report: (auth: Auth, params: Record<string, string>) => call<Report>(auth, `/api/pos/reports?${new URLSearchParams(params)}`),
  staff: (auth: Auth) => call<{ staff: StaffEntry[]; branches: { id: string; name: string }[] }>(auth, "/api/pos/staff"),
  saveStaff: (auth: Auth, body: Record<string, unknown>) => call<{ ok: boolean; id: string }>(auth, "/api/pos/staff", body),
  /* ── урамшуулал ── */
  lookupMember: (auth: Auth, token: string) => call<{ member: ServerMember }>(auth, `/api/pos/loyalty/member?${new URLSearchParams({ token })}`),
  loyaltyAdmin: (auth: Auth) => call<LoyaltyAdmin>(auth, "/api/pos/loyalty/admin"),
  requestRedemption: (auth: Auth, body: { token: string; points: number; cartTotal: number }) =>
    call<{ redemption: Redemption }>(auth, "/api/pos/loyalty/redeem", { action: "request", ...body }),
  getRedemption: (auth: Auth, id: string) => call<{ redemption: Redemption }>(auth, `/api/pos/loyalty/redeem?${new URLSearchParams({ id })}`),
  cancelRedemption: (auth: Auth, id: string) => call<{ redemption: Redemption }>(auth, "/api/pos/loyalty/redeem", { action: "cancel", id }),
  requestWalletPay: (auth: Auth, body: { token: string; amount: number }) => call<{ payment: WalletPayment }>(auth, "/api/pos/wallet", { action: "request", ...body }),
  getWalletPay: (auth: Auth, id: string) => call<{ payment: WalletPayment }>(auth, `/api/pos/wallet?${new URLSearchParams({ id })}`),
  cancelWalletPay: (auth: Auth, id: string) => call<{ payment: WalletPayment }>(auth, "/api/pos/wallet", { action: "cancel", id }),
  saveLoyaltyRule: (auth: Auth, body: { tiers: LoyaltyTier[]; storeBonusBp: number; redeem?: RedeemSpec }) => call<{ draft: LoyaltyRule }>(auth, "/api/pos/loyalty/rules", { action: "save", ...body }),
  activateLoyaltyRule: (auth: Auth) => call<{ active: LoyaltyRule }>(auth, "/api/pos/loyalty/rules", { action: "activate" }),
  saveLoyaltyCard: (auth: Auth, body: { title: string; description: string; bgColor: string; textColor: string; logoId: string | null }) =>
    call<{ draft: LoyaltyCard }>(auth, "/api/pos/loyalty/card", { action: "save", ...body }),
  activateLoyaltyCard: (auth: Auth) => call<{ active: LoyaltyCard }>(auth, "/api/pos/loyalty/card", { action: "activate" }),
  uploadLoyaltyLogo: (auth: Auth, data: string) =>
    call<{ logo: { id: string; width: number; height: number; bytes: number; url: string } }>(auth, "/api/pos/loyalty/logo", { mime: "image/png", data }),
  loyaltyPromos: (auth: Auth) => call<{ promos: LoyaltyPromo[]; tiers: LoyaltyTier[] | null }>(auth, "/api/pos/loyalty/promos"),
  saveLoyaltyPromo: (auth: Auth, body: PromoInput) => call<{ promo: LoyaltyPromo }>(auth, "/api/pos/loyalty/promos", { action: "save", ...body }),
  stopLoyaltyPromo: (auth: Auth, id: string) => call<{ promo: LoyaltyPromo }>(auth, "/api/pos/loyalty/promos", { action: "stop", id }),
  loyaltyMembers: (auth: Auth, q = "") => call<{ members: LoyaltyMemberRow[] }>(auth, `/api/pos/loyalty/members?${new URLSearchParams({ q })}`),
  setMemberTier: (auth: Auth, memberId: string, tier: string) => call<{ changed: boolean }>(auth, "/api/pos/loyalty/members", { action: "tier", memberId, tier }),
  adjustMemberPoints: (auth: Auth, memberId: string, points: number, reason: string, idempotencyKey: string) =>
    call<{ duplicate: boolean; balance: number }>(auth, "/api/pos/loyalty/members", { action: "adjust", memberId, points, reason, idempotencyKey }),
};

/** Гишүүний QR-ын хэлбэр (gm1.<22 тэмдэгт>) — кассын бар код уншигч үүнийг бараанаас ялгана */
/** Картын QR (gm1.) эсвэл хэрэглэгчийн апп дээрх нэг удаагийн Gerege QR (gq1.) */
export const isMemberToken = (v: string) => /^g[mq]1\.[A-Za-z0-9_-]{22}$/.test(v.trim());
export const isGeregeQr = (v: string) => /^gq1\.[A-Za-z0-9_-]{22}$/.test(v.trim());

export const newIdempotencyKey = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
