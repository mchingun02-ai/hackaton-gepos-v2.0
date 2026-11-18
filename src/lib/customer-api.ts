/**
 * Gerege хэрэглэгчийн аппын серверийн клиент (гишүүнчлэл, оноо).
 *
 * Нэвтрэлт: утас + SMS код эсвэл Gerege eID → Bearer session (localStorage). Клиент user ID,
 * утас, оноо, зэрэглэлийг хэзээ ч өөрөө тооцохгүй — бүгд серверээс.
 * Сүлжээ тасарвал сүүлд амжилттай уншсан хуулбарыг «хуучирсан» гэж тэмдэглэн харуулна.
 */

export type MembershipCardDesign = { title: string; description: string | null; bgColor: string; textColor: string; logoUrl: string | null };
export type Membership = {
  id: string;
  merchantId: string;
  merchantName: string;
  tier: string;
  tierName: string;
  points: number;
  qr: string;
  joinedAt: string;
  card: MembershipCardDesign | null;
  asOf: string;
};
export type Program = { merchantId: string; merchantName: string; joined: boolean; card: (MembershipCardDesign & { id: string }) | null };
export type HistoryEntry = { id: string; kind: "earn" | "reverse" | "adjust" | "redeem" | "redeem_reverse"; points: number; at: string; saleNo: string | null; refundNo: string | null; note: string | null; amount: number | null };
export type CustomerProfile = { id: string; displayName: string | null; phone: string | null; authMethod: "phone" | "eid"; qrConsent?: boolean };
/** Нэг удаагийн Gerege QR (2 минут) */
export type GeregeQr = { token: string; expiresAt: string; ttlSeconds: number };
/** Касс үүсгэсэн оноо зарцуулах хүсэлт — хэрэглэгч энд зөвшөөрнө */
export type PendingRedemption = { id: string; status: string; points: number; value: number; cartTotal: number; expiresAt: string; merchantName: string };
/** Gerege хэтэвч (₮) — үлдэгдэл = ledger-ийн нийлбэр (сервер); цэнэглэлт QPay (туршилтын орчинд «dev») */
export type WalletEntry = { id: string; kind: "topup" | "pay" | "refund" | "adjust"; amount: number; balanceAfter: number; at: string; merchantName: string | null; ref: string | null; note: string | null };
export type WalletState = {
  wallet: { balance: number; status: string; max: number };
  ledger: WalletEntry[];
  topup: { available: boolean; dev: boolean; min: number; max: number; presets: number[] };
};
export type WalletTopup = { id: string; amount: number; provider: "qpay" | "dev"; status: "pending" | "paid" | "cancelled" | "expired"; expiresAt: string; paidAt: string | null };
/** Касс хэтэвчээр төлөх хүсэлт илгээсэн — хэрэглэгч энд зөвшөөрнө */
export type PendingWalletPayment = { id: string; status: string; amount: number; expiresAt: string; merchantName: string };
export type AuthConfig ={ eid: boolean; sms: boolean; devOtp: boolean; push?: boolean; publicKey?: string | null };
/** Цахим баримт (жагсаалт) — status: paid / partial_refund / refunded; ebarimt холбогдоогүй */
export type ReceiptHead = {
  id: string; no: string; at: string; merchantId: string; merchantName: string; branchName: string | null; logoUrl: string | null; bgColor: string | null;
  total: number; method: string; points: number; redeemedPoints: number; refunded: number; status: "paid" | "partial_refund" | "refunded"; ebarimt: string;
};
export type ReceiptDetail = ReceiptHead & {
  cashierName: string | null; subtotal: number; discount: number; redeemValue: number; vat: number;
  lines: { name: string; unit: string | null; unitPrice: number; qty: number; total: number }[];
  refunds: { no: string; total: number; at: string }[];
};
export type AppNotification = { id: string; kind: string; title: string; body: string; at: string; merchantId: string; ref: string | null; unread: boolean };
export type StoreBranch = {
  id: string; name: string; address: string | null; phone: string | null; lat: number | null; lng: number | null;
  hours: { day: string; open: string; close: string }[];
  state: { known: false } | { known: true; open: boolean; until?: string; opensAt?: string };
  merchantId: string; merchantName: string; cardTitle: string | null; bgColor: string | null; logoUrl: string | null; joined: boolean;
};
/** Элссэн дэлгүүрийн онооны урамшуулал — status: live / scheduled (серверийн цагаар); eligible — таны зэрэглэлд хамаарах эсэх */
export type Promo = {
  id: string; kind: "multiplier" | "threshold_bonus"; title: string; badge: string; description: string | null;
  multiplier: number | null; minAmount: number | null; bonusPoints: number | null;
  startsAt: string; endsAt: string; status: "live" | "scheduled" | "ended" | "stopped";
  merchantId: string; merchantName: string; logoUrl: string | null; bgColor: string | null; tierNames: string[] | null; eligible: boolean;
};
/** Элсээгүй дэлгүүрт хэдэн урамшуулал байгаа (сонирхуулах) */
export type PromoTeaser = { merchantId: string; merchantName: string; logoUrl: string | null; bgColor: string | null; count: number };

const TOKEN_KEY = "gp-cust-token-v1";
const CACHE_KEY = "gp-cust-cache-v1";

/** Серверийн хаяг: NEXT_PUBLIC_GEREGE_API; локал хөгжүүлэлтэд :3001. Тохируулаагүй бол null (demo апп). */
export function customerApiBase(): string | null {
  if (typeof window === "undefined") return null;
  const env = process.env.NEXT_PUBLIC_GEREGE_API;
  if (env) return env.replace(/\/$/, "");
  const { hostname, protocol } = window.location;
  if (hostname === "localhost" || hostname === "127.0.0.1") return `${protocol}//${hostname}:3001`;
  return null;
}

export class CustomerApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
  ) {
    super(message);
  }
}
/** status 0 = сүлжээ */
export const OFFLINE = 0;

async function request<T>(path: string, init: { method?: string; body?: unknown; token?: string | null } = {}): Promise<T> {
  const base = customerApiBase();
  if (!base) throw new CustomerApiError(OFFLINE, "Сервер тохируулаагүй.");
  let res: Response;
  try {
    res = await fetch(base + path, {
      method: init.method ?? (init.body === undefined ? "GET" : "POST"),
      headers: { "Content-Type": "application/json", ...(init.token ? { Authorization: `Bearer ${init.token}` } : {}) },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      cache: "no-store",
    });
  } catch {
    throw new CustomerApiError(OFFLINE, "Сүлжээгүй байна.");
  }
  const data = (await res.json().catch(() => ({}))) as { error?: string; code?: string };
  if (!res.ok) throw new CustomerApiError(res.status, data.error ?? "Алдаа гарлаа.", data.code);
  return data as T;
}

export const customerApi = {
  config: () => request<AuthConfig>("/api/customer/auth/config"),
  requestOtp: (phone: string) => request<{ sent: boolean; expiresInSeconds: number; devCode?: string }>("/api/customer/auth/otp/request", { body: { phone } }),
  verifyOtp: (phone: string, code: string) => request<{ token: string; customer: CustomerProfile }>("/api/customer/auth/otp/verify", { body: { phone, code } }),
  exchange: (code: string) => request<{ token: string; customer: CustomerProfile }>("/api/customer/auth/exchange", { body: { code } }),
  logout: (token: string) => request<{ ok: boolean }>("/api/customer/auth/logout", { body: {}, token }),
  me: (token: string) => request<{ customer: CustomerProfile }>("/api/customer/me", { token }),
  memberships: (token: string) => request<{ memberships: Membership[]; asOf: string }>("/api/customer/memberships", { token }),
  programs: (token: string) => request<{ programs: Program[] }>("/api/customer/programs", { token }),
  join: (token: string, merchantId: string) => request<{ membership: Membership; created: boolean }>("/api/customer/memberships", { body: { merchantId }, token }),
  history: (token: string, memberId: string) => request<{ history: HistoryEntry[]; asOf: string }>(`/api/customer/memberships/${encodeURIComponent(memberId)}/history`, { token }),
  promos: (token: string) => request<{ promos: Promo[]; others: PromoTeaser[]; asOf: string }>("/api/customer/promos", { token }),
  qrConsent: (token: string) => request<{ qrConsent: boolean }>("/api/customer/qr/consent", { body: {}, token }),
  qr: (token: string) => request<GeregeQr>("/api/customer/qr", { body: {}, token }),
  wallet: (token: string) => request<WalletState>("/api/customer/wallet", { token }),
  topup: (token: string, amount: number) => request<{ topup: WalletTopup }>("/api/customer/wallet/topups", { body: { amount }, token }),
  topupAction: (token: string, id: string, action: "dev_pay" | "cancel") =>
    request<{ topup: WalletTopup }>(`/api/customer/wallet/topups/${encodeURIComponent(id)}`, { body: { action }, token }),
  pendingWalletPayments: (token: string) => request<{ payments: PendingWalletPayment[] }>("/api/customer/wallet/payments", { token }),
  decideWalletPayment: (token: string, id: string, action: "approve" | "decline") =>
    request<{ payment: { id: string; status: string } }>(`/api/customer/wallet/payments/${encodeURIComponent(id)}`, { body: { action }, token }),
  pendingRedemptions: (token: string) => request<{ redemptions: PendingRedemption[] }>("/api/customer/redemptions", { token }),
  decideRedemption: (token: string, id: string, action: "approve" | "decline") =>
    request<{ redemption: { id: string; status: string } }>(`/api/customer/redemptions/${encodeURIComponent(id)}`, { body: { action }, token }),
  receipts: (token: string, before?: string) => request<{ receipts: ReceiptHead[]; next: string | null }>(`/api/customer/receipts${before ? `?before=${encodeURIComponent(before)}` : ""}`, { token }),
  receipt: (token: string, id: string) => request<{ receipt: ReceiptDetail }>(`/api/customer/receipts/${encodeURIComponent(id)}`, { token }),
  notifications: (token: string) => request<{ notifications: AppNotification[]; unread: number }>("/api/customer/notifications", { token }),
  notificationsSeen: (token: string) => request<{ unread: number }>("/api/customer/notifications", { body: {}, token }),
  stores: (token: string) => request<{ branches: StoreBranch[] }>("/api/customer/stores", { token }),
  pushSubscribe: (token: string, subscription: PushSubscriptionJSON) => request<{ subscribed: boolean }>("/api/customer/push", { body: { action: "subscribe", subscription }, token }),
  pushUnsubscribe: (token: string, endpoint: string) => request<{ subscribed: boolean }>("/api/customer/push", { body: { action: "unsubscribe", endpoint }, token }),
  rotate: (token: string, memberId: string) => request<{ membership: Membership }>(`/api/customer/memberships/${encodeURIComponent(memberId)}/rotate`, { body: {}, token }),
  eidStartUrl: () => {
    const base = customerApiBase();
    return base ? `${base}/api/customer/auth/eid/start?${new URLSearchParams({ redirect: `${window.location.origin}/app` })}` : null;
  },
  logoSrc: (path: string | null) => {
    const base = customerApiBase();
    return path && base ? base + path : null;
  },
};

/* ── session, кэш (зөвхөн энэ төхөөрөмж) ── */
const safe = <T,>(fn: () => T, fallback: T) => {
  try {
    return fn();
  } catch {
    return fallback;
  }
};
export const readToken = () => safe(() => localStorage.getItem(TOKEN_KEY), null);
export const saveToken = (token: string | null) =>
  safe(() => {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(CACHE_KEY);
    }
  }, undefined);

export type CustomerCache = { memberships: Membership[]; history: Record<string, HistoryEntry[]>; asOf: string; me?: CustomerProfile | null; promos?: Promo[] };
export const readCache = (): CustomerCache | null => safe(() => JSON.parse(localStorage.getItem(CACHE_KEY) ?? "null") as CustomerCache | null, null);
export const saveCache = (cache: CustomerCache) => safe(() => localStorage.setItem(CACHE_KEY, JSON.stringify(cache)), undefined);
