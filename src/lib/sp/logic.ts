/* Store Plus — цэвэр тооцоолол. Төлөв өөрчлөхгүй, зөвхөн бодно. */

import { DEFAULT_TAX, saleTax } from "./tax";
import type {
  Applied,
  Customer,
  ItemCampaign,
  Module,
  Plan,
  PointCampaign,
  Product,
  Role,
  SaleLine,
  SpState,
  Tier,
} from "./types";

/* ───────── формат ───────── */

export const money = (n: number) => `${Math.round(n).toLocaleString("en-US")}₮`;
export const num = (n: number) => Math.round(n).toLocaleString("en-US");
/** 99112245 → 9911 ••45 (дэлгэц дээр бүтэн дугаар ил гаргахгүй) */
export const maskPhone = (p: string) => (p.length >= 8 ? `${p.slice(0, 4)} ••${p.slice(-2)}` : p);
export const fmtPhone = (p: string) => (p.length === 8 ? `${p.slice(0, 4)} ${p.slice(4)}` : p);
export const hhmm = (iso: string) => {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};
export const dateShort = (iso: string) => {
  const d = new Date(iso);
  return `${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
};
export const ago = (iso: string, now = Date.now()) => {
  const m = Math.max(0, Math.round((now - new Date(iso).getTime()) / 60000));
  if (m < 1) return "дөнгөж сая";
  if (m < 60) return `${m} мин өмнө`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} цагийн өмнө`;
  return `${Math.round(h / 24)} өдрийн өмнө`;
};
export const isToday = (iso: string, now = new Date()) => {
  const d = new Date(iso);
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
};
export const initials = (first: string, last: string) => `${last.slice(0, 1)}${first.slice(0, 1)}`.toUpperCase();
export const staffName = (s?: { first: string; last: string }) => (s ? `${s.last.slice(0, 1)}.${s.first}` : "—");

/* ───────── багц ба эрх (BR02, 7.4) ───────── */

export const PLAN_LABEL: Record<Plan, string> = { basic: "Basic", plus: "Plus", premium: "Premium" };
export const PLAN_MODULES: Record<Plan, Module[]> = {
  basic: ["dashboard", "sales", "products", "crm", "marketing", "chat", "ai", "reports", "account"],
  plus: ["dashboard", "sales", "products", "crm", "marketing", "chat", "ai", "reports", "account", "delivery", "campaigns"],
  premium: ["dashboard", "sales", "products", "crm", "marketing", "chat", "ai", "reports", "account", "delivery", "campaigns", "wallet"],
};
/** Тухайн модульд хамгийн бага шаардагдах багц */
export const MODULE_PLAN: Partial<Record<Module, Plan>> = { delivery: "plus", campaigns: "plus", wallet: "premium" };

export const MODULE_LABEL: Record<Module, string> = {
  dashboard: "Dashboard",
  sales: "Касс / Борлуулалт",
  products: "Бараа",
  delivery: "Хүргэлт",
  campaigns: "Урамшуулал",
  wallet: "Wallet pass",
  crm: "Харилцагч",
  marketing: "Маркетинг",
  chat: "Facebook чат",
  ai: "AI туслах",
  reports: "Тайлан",
  account: "Миний бүртгэл",
};

/**
 * 7.4: эрхэд ороогүй цэс огт харагдахгүй («hidden»),
 * багцад ороогүй цэс түгжээтэй харагдана («locked») — K3 conversion.
 */
export function access(module: Module, plan: Plan, role?: Role | null): "ok" | "locked" | "hidden" {
  if (role && !role.modules.includes(module)) return "hidden";
  return PLAN_MODULES[plan].includes(module) ? "ok" : "locked";
}

/* ───────── урамшуулал (BR05) ───────── */

const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const hm = (d: Date) => `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;

export const inDates = (c: { start: string; end: string }, now = new Date()) => {
  const t = ymd(now);
  return t >= c.start && t <= c.end;
};

/** Идэвхтэй point based campaign — оноо зөвхөн үүн дээр тооцогдоно (6.2.3) */
export function activePointCampaign(s: SpState, now = new Date()): PointCampaign | null {
  if (!PLAN_MODULES[s.merchant.plan].includes("campaigns")) return null;
  return (s.campaigns.find((c) => c.type === "point" && c.active && inDates(c, now)) as PointCampaign) ?? null;
}

/** BR05-2d: хугацаа, гараг, цаг, минутаар шалгана */
export function itemCampaignLive(c: ItemCampaign, now = new Date()) {
  if (!c.active || !inDates(c, now)) return false;
  if (c.days.length && !c.days.includes(now.getDay())) return false;
  const t = hm(now);
  return t >= c.from && t <= c.to;
}

export const DAY_LABEL = ["Ня", "Да", "Мя", "Лх", "Пү", "Ба", "Бя"];

export function scheduleText(c: ItemCampaign) {
  const days = c.days.length === 0 || c.days.length === 7 ? "Өдөр бүр" : [...c.days].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7)).map((d) => DAY_LABEL[d]).join(", ");
  const time = c.from === "00:00" && c.to === "23:59" ? "" : ` · ${c.from}–${c.to}`;
  return days + time;
}

export function rewardText(c: ItemCampaign, products: Product[]) {
  const r = c.reward;
  if (r.kind === "product") return `${r.qty} ш «${products.find((p) => p.id === r.productId)?.name ?? "бараа"}» үнэгүй`;
  if (r.kind === "percent") return `${r.value}% хямдрал`;
  return `${money(r.value)} хямдрал`;
}

/** Тухайн харилцагчийн нийт цуглуулсан оноо → түвшин */
export function tierOf(s: SpState, customerId: string | undefined, camp: PointCampaign | null): { tier: Tier; next?: Tier; earned: number } | null {
  if (!camp || !customerId) return null;
  const earned = s.points.filter((p) => p.customerId === customerId && p.kind === "earn").reduce((a, p) => a + p.delta, 0);
  const sorted = [...camp.tiers].sort((a, b) => a.points - b.points);
  let tier = sorted[0];
  let next: Tier | undefined;
  for (const t of sorted) {
    if (earned >= t.points) tier = t;
    else {
      next = t;
      break;
    }
  }
  return { tier, next, earned };
}

export type CartInput = { productId: string; qty: number }[];

export type Priced = {
  lines: SaleLine[];
  subtotal: number;
  applied: Applied[];
  discount: number;
  redeemMax: number;
  redeem: number;
  pointsEarned: number;
  total: number;
  vat: number;
  /** НХАТ */
  city: number;
  /** босгонд бага зэрэг дутсан item campaign (6.2.5 сануулга) */
  hint: string | null;
  stockWarn: string[];
};

function usesBy(s: SpState, campaignId: string, customerId?: string, onlyToday = false) {
  const today = new Date();
  return s.sales.filter(
    (x) =>
      !x.refund &&
      x.applied.some((a) => a.campaignId === campaignId) &&
      (!customerId || x.customerId === customerId) &&
      (!onlyToday || isToday(x.at, today)),
  ).length;
}

/**
 * Сагсны үнэ — BR05-6 давхардал: Point + Item давхарлана; давхцсан Item
 * campaign-аас харилцагчид хамгийн ашигтайг нь л сонгоно. Оноо 1 = 1₮.
 */
export function priceCart(s: SpState, cart: CartInput, customer: Customer | null, redeemWanted: number, now = new Date()): Priced {
  const byId = new Map(s.products.map((p) => [p.id, p]));
  const lines: SaleLine[] = [];
  const stockWarn: string[] = [];
  for (const c of cart) {
    const p = byId.get(c.productId);
    if (!p || c.qty <= 0) continue;
    lines.push({ productId: p.id, name: p.name, qty: c.qty, price: p.price });
    if (c.qty > p.stock) stockWarn.push(p.name);
  }
  const subtotal = lines.reduce((a, l) => a + l.qty * l.price, 0);

  const campaignsOn = PLAN_MODULES[s.merchant.plan].includes("campaigns");
  const candidates: { c: ItemCampaign; amount: number; free?: SaleLine }[] = [];
  let hint: string | null = null;

  if (campaignsOn) {
    for (const c of s.campaigns) {
      if (c.type !== "item" || !itemCampaignLive(c, now)) continue;
      if (c.limitTotal && c.uses >= c.limitTotal) continue;
      if (customer && c.limitPerCustomer && usesBy(s, c.id, customer.id) >= c.limitPerCustomer) continue;
      if (customer && c.limitPerDay && usesBy(s, c.id, customer.id, true) >= c.limitPerDay) continue;
      const q = lines.filter((l) => l.productId && c.productIds.includes(l.productId));
      const qty = q.reduce((a, l) => a + l.qty, 0);
      const times = Math.floor(qty / c.qty);
      if (times < 1) {
        if (qty > 0 && c.qty - qty <= 1) {
          const first = byId.get(c.productIds[0]);
          hint = `«${c.name}» — дахиад ${c.qty - qty} ширхэг нэмбэл ${rewardText(c, s.products)}`;
          if (!first) hint = null;
        }
        continue;
      }
      const base = q.reduce((a, l) => a + l.qty * l.price, 0);
      const r = c.reward;
      if (r.kind === "product") {
        const p = byId.get(r.productId);
        if (!p) continue;
        const fq = r.qty * times;
        candidates.push({ c, amount: fq * p.price, free: { productId: p.id, name: p.name, qty: fq, price: p.price, free: true } });
      } else if (r.kind === "percent") {
        candidates.push({ c, amount: Math.round((base * r.value) / 100) });
      } else {
        candidates.push({ c, amount: Math.min(base, r.value * times) });
      }
    }
  }

  candidates.sort((a, b) => b.amount - a.amount);
  const taken: typeof candidates = [];
  const used = new Set<string>();
  for (const cand of candidates) {
    if (cand.c.productIds.some((id) => used.has(id))) continue;
    cand.c.productIds.forEach((id) => used.add(id));
    taken.push(cand);
  }

  const applied: Applied[] = taken.map((t) => ({ campaignId: t.c.id, name: t.c.name, amount: t.amount }));
  for (const t of taken) if (t.free) lines.push(t.free);
  // Үнэгүй мөр нь subtotal-д орж, хямдралаар тэнцүүлэгдэнэ — баримт дээр ил тод.
  const fullSubtotal = subtotal + taken.reduce((a, t) => a + (t.free ? t.free.qty * t.free.price : 0), 0);
  const discount = applied.reduce((a, x) => a + x.amount, 0);
  const afterDiscount = Math.max(0, fullSubtotal - discount);

  let camp = activePointCampaign(s, now);
  // BR05-7: point campaign-ийн хязгаар — давсан бол энэ гүйлгээнд оноо олгохгүй
  if (camp && customer) {
    const earnSales = s.sales.filter((x) => !x.refund && x.pointsEarned > 0);
    const mine = earnSales.filter((x) => x.customerId === customer.id);
    if (
      (camp.limitTotal && earnSales.length >= camp.limitTotal) ||
      (camp.limitPerCustomer && mine.length >= camp.limitPerCustomer) ||
      (camp.limitPerDay && mine.filter((x) => isToday(x.at, now)).length >= camp.limitPerDay)
    )
      camp = { ...camp, tiers: camp.tiers, limitTotal: -1 };
  }
  const earnBlocked = camp?.limitTotal === -1;
  const redeemMax = customer && camp ? Math.min(customer.points, afterDiscount) : 0;
  const redeem = Math.max(0, Math.min(redeemWanted, redeemMax));
  const pointsEarned =
    customer && camp && !earnBlocked ? lines.filter((l) => !l.free).reduce((a, l) => a + (byId.get(l.productId ?? "")?.points ?? 0) * l.qty, 0) : 0;
  const total = afterDiscount - redeem;
  return {
    lines,
    subtotal: fullSubtotal,
    applied,
    discount,
    redeemMax,
    redeem,
    pointsEarned,
    total,
    ...(() => {
      const tx = saleTax(s.merchant.tax ?? DEFAULT_TAX, s.products, lines, total, now);
      return { vat: tx.vat, city: tx.city };
    })(),
    hint: taken.length ? null : hint,
    stockWarn,
  };
}

/* ───────── Mode B suggest (BR09-1.1) ───────── */

export const SUGGEST_LIMIT = 10;

/**
 * 10-аас доош бараа бүртгэлтэй үед дүнг боломжит барааны нийлбэрээр
 * задлах санал. Яг тэнцүү нийлбэрүүдээс хамгийн цөөн ширхэгтэй 3-ыг өгнө.
 */
export function suggestSplit(products: Product[], amount: number, max = 3): SaleLine[][] {
  const list = products.filter((p) => p.active && p.price > 0).sort((a, b) => b.price - a.price);
  if (list.length === 0 || list.length >= SUGGEST_LIMIT || amount <= 0) return [];
  const out: SaleLine[][] = [];
  const counts = new Array(list.length).fill(0);
  let steps = 0;
  const walk = (i: number, rest: number, items: number) => {
    if (out.length >= 12 || steps++ > 40000) return;
    if (rest === 0) {
      out.push(list.map((p, k) => ({ productId: p.id, name: p.name, qty: counts[k], price: p.price })).filter((l) => l.qty > 0));
      return;
    }
    if (i >= list.length || items >= 12) return;
    const p = list[i];
    const top = Math.min(Math.floor(rest / p.price), p.stock > 0 ? p.stock : 0, 12 - items);
    for (let q = top; q >= 0; q--) {
      counts[i] = q;
      walk(i + 1, rest - q * p.price, items + q);
    }
    counts[i] = 0;
  };
  walk(0, amount, 0);
  return out
    .sort((a, b) => a.reduce((x, l) => x + l.qty, 0) - b.reduce((x, l) => x + l.qty, 0))
    .slice(0, max);
}

/* ───────── SMS (BR07-4) ───────── */

export const SMS_PRICE = 20; // ₮ / хэсэг — [БӨГЛӨХ] оператортой хийсэн гэрээгээр
export const OPT_OUT = " Татгалзах: STOP 132213";

/** Кирилл үсэгтэй бол UCS-2: 70 / 67 тэмдэгт, латин бол GSM-7: 160 / 153 */
export function smsParts(text: string) {
  const unicode = /[^\x00-\x7F]/.test(text);
  const single = unicode ? 70 : 160;
  const multi = unicode ? 67 : 153;
  const len = [...text].length;
  const parts = len === 0 ? 0 : len <= single ? 1 : Math.ceil(len / multi);
  return { len, parts, unicode, perPart: parts > 1 ? multi : single };
}

/** BR07-1, 3, 5: үнийн дүн ба давтамжаар шүүсэн сегмент, opt-out хасалт */
export function segment(s: SpState, minSpend: number, minOrders: number) {
  const stats = customerStats(s);
  const match = s.customers.filter((c) => !c.erased && (stats.get(c.id)?.spend ?? 0) >= minSpend && (stats.get(c.id)?.count ?? 0) >= minOrders);
  const ok = match.filter((c) => c.optIn);
  return { recipients: ok, excluded: match.length - ok.length };
}

/* ───────── CRM (BR06) ───────── */

export function customerStats(s: SpState) {
  const m = new Map<string, { count: number; spend: number; last?: string }>();
  for (const sale of s.sales) {
    if (!sale.customerId || sale.refund) continue;
    const r = m.get(sale.customerId) ?? { count: 0, spend: 0 };
    r.count += 1;
    r.spend += sale.total;
    if (!r.last || sale.at > r.last) r.last = sale.at;
    m.set(sale.customerId, r);
  }
  for (const o of s.orders) {
    if (o.cancel || o.saleId) continue; // төлөгдсөн нь sale-ээр тоологдсон
    const r = m.get(o.customerId) ?? { count: 0, spend: 0 };
    r.count += 1;
    r.spend += o.total;
    if (!r.last || o.createdAt > r.last) r.last = o.createdAt;
    m.set(o.customerId, r);
  }
  return m;
}

/** Байнгын → бага худалдан авалттай (BR06-0) */
export function rankedCustomers(s: SpState) {
  const st = customerStats(s);
  return s.customers
    .filter((c) => !c.erased)
    .map((c) => ({ c, ...(st.get(c.id) ?? { count: 0, spend: 0 }) }))
    .sort((a, b) => b.count - a.count || b.spend - a.spend);
}

/* ───────── хүргэлт ───────── */

export function orderState(s: SpState, o: { cancel?: unknown; statusId: string }): "active" | "done" | "cancelled" {
  if (o.cancel) return "cancelled";
  return s.delivery.statuses.find((x) => x.id === o.statusId)?.final ? "done" : "active";
}

/** Идэвхтэйгээс идэвхгүй рүү (BR04, BR09-1.2) */
export function sortedOrders(s: SpState) {
  const w = { active: 0, done: 1, cancelled: 2 } as const;
  return [...s.orders].sort((a, b) => w[orderState(s, a)] - w[orderState(s, b)] || b.createdAt.localeCompare(a.createdAt));
}

export const CANCEL_LABEL = { merchant: "Мерчант цуцалсан", "out-of-stock": "Бараа дууссан", customer: "Харилцагч татгалзсан" } as const;

export const METHOD_LABEL = { cash: "Бэлэн", card: "Карт", qr: "QR" } as const;

/** Бараа хүргэлтээр зарагдах боломжтой эсэх (BR03-5, BR03-7) */
export const deliverable = (p: Product) => p.active && p.delivery && !p.deliveryStopped && p.stock > 0;

/* ───────── тайлан ───────── */

export function salesTotals(s: SpState, from: Date, to: Date, channel?: "pos" | "delivery") {
  const list = s.sales.filter((x) => {
    const t = new Date(x.at);
    return t >= from && t <= to && (!channel || x.channel === channel);
  });
  const ok = list.filter((x) => !x.refund);
  const total = ok.reduce((a, x) => a + x.total, 0);
  return { list, count: ok.length, total, avg: ok.length ? total / ok.length : 0, refunds: list.length - ok.length };
}

export function startOfDay(d = new Date()) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function lowStock(s: SpState) {
  return s.products.filter((p) => p.active && p.stock <= p.minStock);
}
