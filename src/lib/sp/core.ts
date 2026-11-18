/*
 * Store Plus — нэг төлөв, олон апп.
 *
 * Пос (/), мерчантын апп (/merchant), Merchant portal (/portal), захиалгын
 * хуудас (/shop) бүгд энэ store-г ашиглана. localStorage-д хадгалж,
 * BroadcastChannel-аар нээлттэй цонхнуудад шууд түгээнэ — нэг цонхонд
 * захиалга өгөхөд нөгөө цонхны пос дээр мэдэгдэл шууд ирнэ (BR09-10).
 *
 * Бүх үйлдэл аудит лог бичнэ (BR08-8).
 */

import { buildSeed, ddtd } from "./seed";
import { DEFAULT_TAX, isExciseBuna, modeOf, saleTax } from "./tax";
import { activePointCampaign, CANCEL_LABEL, money, PLAN_LABEL, priceCart, smsParts, SMS_PRICE, staffName, type CartInput } from "./logic";
import type {
  Audit,
  Campaign,
  CancelReason,
  Category,
  Customer,
  DeliverySettings,
  Merchant,
  Order,
  PayMethod,
  Plan,
  Product,
  Role,
  Sale,
  SaleLine,
  SmsCampaign,
  SpState,
  Staff,
  TaxProfile,
  WalletPass,
} from "./types";

/**
 * Төлвийг хаана хадгалахаас үл хамааран бүх үйлдэл энэ модульд байна.
 * Хөтөч дээр: localStorage + серверийн синк (store.tsx).
 * Сервер дээр: SQLite (src/lib/sp/server.ts) — AI ажилтан, MCP эндээс үйлдэл хийнэ.
 */
export type SpBackend = { get(): SpState; set(s: SpState): void };
let backend: SpBackend | null = null;
/** Сервер дээр зөвхөн withSp() дотор тохируулагдана; гадуур null — core дуудвал SpError. */
export function setSpBackend(b: SpBackend | null) {
  backend = b;
}
export const getSpBackend = () => backend;

const uid = (p: string) => `${p}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const nowIso = () => new Date().toISOString();

/** Туршилтын бараанд и-Баримтын БҮНА код (ангиллын зургийн хүснэгтээс) */
const SEED_BUNA: Record<string, string> = {
  p1: "2349011", p2: "6252211", p3: "6252208", p4: "2223011", p5: "6112515", p6: "6112502", p7: "6252224",
  p8: "2449021", p9: "2449021", p10: "6212703", p11: "0162000", p12: "2143100", p13: "2449011", p14: "6112519",
  p15: "2342012", p16: "2367011", p17: "6124403", p18: "6127504", p19: "6127502", p20: "6217491", p21: "6127504",
  p22: "2431000", p23: "2413151",
};
const SEED_EXTRA: Product[] = [
  { id: "p22", name: "Пиво 0.5 л", categoryId: "c2", price: 5600, stock: 96, minStock: 12, delivery: false, deliveryStopped: false, points: 0, image: "", barcode: "4860000000226", unit: "ш", active: true, bunaCode: "2431000", bunaSource: "tile" },
  { id: "p23", name: "Архи 0.75 л", categoryId: "c2", price: 28000, stock: 24, minStock: 6, delivery: false, deliveryStopped: false, points: 0, image: "", barcode: "4860000000233", unit: "ш", active: true, bunaCode: "2413151", bunaSource: "tile" },
];

/** Хуучин өгөгдөл: төлсөн боловч борлуулалтын бичилтгүй захиалгад бичилт үүсгэнэ
    (цуцлахад буцаалт, Ebarimt reverse зөв явна). */
export const STAFF_REG: Record<string, string> = { st1: "УБ98110225", st2: "УБ92071503", st3: "УБ85032114", st4: "УБ95040318", st5: "УБ99122907" };

export function repair(s0: SpState): SpState {
  // eID-ийн РД-гүй хуучин өгөгдөлд нэмнэ
  let s = s0;
  // НӨАТ, НХАТ: хуучин өгөгдөлд татварын тохиргоо, туршилтын бараанд БҮНА код нэмнэ
  if (!s.merchant.tax) s = { ...s, merchant: { ...s.merchant, tax: { ...DEFAULT_TAX, setBy: "Анхдагч (admin.geregepos.mn-д тохируулаагүй)" } } };
  if (s.products.some((p) => !p.bunaCode && SEED_BUNA[p.id]))
    s = { ...s, products: s.products.map((p) => (p.bunaCode || !SEED_BUNA[p.id] ? p : { ...p, bunaCode: SEED_BUNA[p.id], bunaSource: "tile" as const })) };
  if (!s.products.some((p) => p.id === "p22")) s = { ...s, products: [...s.products, ...SEED_EXTRA] };
  // Facebook чат цэс нэмэгдсэн — хуучин өгөгдлийн «Админ» эрхэд нэмнэ
  for (const m of ["chat", "ai"] as const)
    if (s.roles.some((r) => r.id === "admin" && r.builtIn && !r.modules.includes(m)))
      s = { ...s, roles: s.roles.map((r) => (r.id === "admin" && r.builtIn && !r.modules.includes(m) ? { ...r, modules: [...r.modules, m] } : r)) };
  if (s.staff.some((x) => !x.regNo && STAFF_REG[x.id]) || !s.merchant.ownerRegNo) {
    s = {
      ...s,
      staff: s.staff.map((x) => (x.regNo || !STAFF_REG[x.id] ? x : { ...x, regNo: STAFF_REG[x.id] })),
      merchant: { ...s.merchant, ownerRegNo: s.merchant.ownerRegNo ?? "УБ85032114" },
    };
  }
  const lost = s.orders.filter((o) => o.paid && !o.saleId && !o.cancel);
  if (!lost.length) return s;
  let no = s.seq.sale;
  const sales: Sale[] = [];
  const orders = s.orders.map((o) => {
    if (!lost.includes(o)) return o;
    no += 1;
    const id = `s-fix-${o.id}`;
    sales.push({
      id, no, at: o.history[0]?.at ?? o.createdAt, staffId: "web", channel: "delivery", mode: "cart",
      lines: [...o.lines, ...(o.fee ? [{ name: "Хүргэлт", qty: 1, price: o.fee }] : [])],
      subtotal: o.total, applied: [], pointsSpent: 0, pointsEarned: 0, total: o.total, method: o.payMethod ?? "qr",
      customerId: o.customerId, orderId: o.id, ebarimt: { kind: "person", status: "sent", ddtd: ddtd() }, idemKey: `fix-${o.id}`,
    });
    return { ...o, saleId: id };
  });
  return { ...s, orders, sales: [...sales, ...s.sales], seq: { ...s.seq, sale: no } };
}

/** BR05-8: хугацаа нь дууссан campaign автоматаар идэвхгүй */
export function expire(s: SpState): SpState {
  const today = new Date().toISOString().slice(0, 10);
  let changed = false;
  const campaigns = s.campaigns.map((c) => {
    if (c.active && c.end < today) {
      changed = true;
      return { ...c, active: false };
    }
    return c;
  });
  return changed ? { ...s, campaigns } : s;
}

/** Шинэ (seed) төлөв */
export const freshState = () => repair(buildSeed());
/** Хадгалсан төлвийг засаж, хугацаа дууссан урамшууллыг хаана */
export const normalize = (s: SpState) => expire(repair(s));

function ensure(): SpState {
  if (!backend) throw new SpError("Store Plus: хадгалах газар тохируулаагүй (withSp-ээс гадуур)");
  return backend.get();
}

function set(next: SpState) {
  if (!backend) throw new SpError("Store Plus: хадгалах газар тохируулаагүй (withSp-ээс гадуур)");
  backend.set(next);
}

function audit(s: SpState, who: string, action: string, target: string, from?: string, to?: string): Audit[] {
  return [{ id: uid("a"), at: nowIso(), who, action, target, from, to }, ...s.audit].slice(0, 500);
}

/* ═════════════════════════ үйлдлүүд ═════════════════════════ */

export class SpError extends Error {}

/** Үйлдэл хийсэн хүний нэр — пос дээр нэвтэрсэн ажилтан, порталд мерчант */
export type Actor = { id: string; name: string };
export const actorOf = (st?: Staff | null): Actor => (st ? { id: st.id, name: staffName(st) } : { id: "owner", name: "Мерчант админ" });

function patch(fn: (s: SpState) => SpState) {
  set(fn(ensure()));
}

function addNotice(s: SpState, n: Omit<SpState["notices"][number], "id" | "at" | "read">) {
  return [{ ...n, id: uid("n"), at: nowIso(), read: false }, ...s.notices].slice(0, 100);
}

function deliverySms(s: SpState, o: Order, statusId: string): SpState["smsLog"] {
  const st = s.delivery.statuses.find((x) => x.id === statusId);
  if (!s.delivery.sms || !st?.sms) return s.smsLog;
  const extra = statusId === "received" ? ` Ачаа хүлээн авах код: ${o.code}` : "";
  const text = `${s.delivery.page.name}: #${o.no} — ${st.name}.${extra}`;
  const { parts } = smsParts(text);
  return [{ id: uid("sm"), at: nowIso(), kind: "delivery" as const, phone: o.phone, text, cost: parts * SMS_PRICE }, ...s.smsLog].slice(0, 1000);
}

/* ───────── нэвтрэлт ───────── */

/** Пос апп — ажилтан өөрийн PIN-ээр (BR09-2) */
export function staffLogin(staffId: string, pin: string): Staff {
  const s = ensure();
  const st = s.staff.find((x) => x.id === staffId);
  if (!st || !st.active) throw new SpError("Ажилтны эрх идэвхгүй байна.");
  if (st.pin !== pin) throw new SpError("PIN код буруу байна.");
  return st;
}

/** Ажилтныг ганц PIN-ээр таних — мерчантын апп, порталд */
export function staffByPin(pin: string): Staff | null {
  return ensure().staff.find((x) => x.active && x.pin === pin) ?? null;
}

/** BR01-3, BR01-4: РД + PIN, 3 удаа буруу → PUK */
export function merchantLogin(regNo: string, pin: string): "ok" | "wrong" | "puk" | "locked" {
  const s = ensure();
  const m = s.merchant;
  if (m.locked) return "locked";
  if (regNo.trim().toUpperCase() !== m.regNo.toUpperCase()) return "wrong";
  if (m.pinTries >= 3) return "puk";
  if (pin === m.pin) {
    set({ ...s, merchant: { ...m, pinTries: 0 } });
    return "ok";
  }
  const tries = m.pinTries + 1;
  set({ ...s, merchant: { ...m, pinTries: tries } });
  return tries >= 3 ? "puk" : "wrong";
}

const PUK_KEY = "gepos-puk-tries";
const getPuk = () => { try { return Number(localStorage.getItem(PUK_KEY) || 0); } catch { return 0; } };
const setPuk = (n: number) => { try { localStorage.setItem(PUK_KEY, String(n)); } catch { /* хувийн цонх */ } };
export function resetPinWithPuk(puk: string, newPin: string): "ok" | "wrong" | "locked" {
  const s = ensure();
  if (s.merchant.locked) return "locked";
  if (puk !== s.merchant.puk) {
    const pukTries = getPuk() + 1;
    setPuk(pukTries);
    if (pukTries >= 5) {
      set({ ...s, merchant: { ...s.merchant, locked: true } });
      return "locked";
    }
    return "wrong";
  }
  setPuk(0);
  set({ ...s, merchant: { ...s.merchant, pin: newPin, pinTries: 0 }, audit: audit(s, s.merchant.name, "PIN сэргээв (PUK)", "Миний бүртгэл") });
  return "ok";
}

/** BR01-1, 2: eID бүртгэл → PIN/PUK */
export function registerMerchant(kind: "person" | "org", kyc: Record<string, string>, name: string, regNo: string, pin: string, puk: string, contact?: { phone?: string; email?: string }) {
  patch((s) => ({
    ...s,
    merchant: { ...s.merchant, kind, kyc, name, regNo, pin, puk, pinTries: 0, locked: false, phone: contact?.phone ?? s.merchant.phone, email: contact?.email ?? s.merchant.email },
    audit: audit(s, name, "Бүртгэл үүсгэв (eID)", kind === "org" ? "Байгууллага" : "Хувь хүн"),
  }));
}

export function updateMerchant(who: Actor, p: Partial<Pick<Merchant, "phone" | "email" | "pin" | "puk">>) {
  patch((s) => ({
    ...s,
    merchant: { ...s.merchant, ...p },
    audit: audit(s, who.name, "Бүртгэлийн мэдээлэл засав", Object.keys(p).join(", ")),
  }));
}

/* ───────── багц, ажилтан, эрх (BR02) ───────── */

export function setPlan(who: Actor, plan: Plan) {
  patch((s) => ({ ...s, merchant: { ...s.merchant, plan }, audit: audit(s, who.name, "Багц солив", "Багц", PLAN_LABEL[s.merchant.plan], PLAN_LABEL[plan]) }));
}

export function upsertStaff(who: Actor, st: Staff) {
  const s = ensure();
  const prev = s.staff.find((x) => x.id === st.id);
  const isAdmin = (x: Staff) => x.active && x.roleId === "admin";
  const next = prev ? s.staff.map((x) => (x.id === st.id ? st : x)) : [...s.staff, st];
  // BR02-4: дор хаяж нэг идэвхтэй админ үлдэнэ
  if (!next.some(isAdmin)) throw new SpError("Дор хаяж нэг идэвхтэй Админ үлдэх ёстой.");
  const roleName = (id: string) => s.roles.find((r) => r.id === id)?.name ?? id;
  let log = s.audit;
  if (!prev) log = audit(s, who.name, "Ажилтан нэмэв", staffName(st), undefined, roleName(st.roleId));
  else if (prev.roleId !== st.roleId) log = audit(s, who.name, "Эрх солив", staffName(st), roleName(prev.roleId), roleName(st.roleId));
  else if (prev.active !== st.active) log = audit(s, who.name, st.active ? "Ажилтан идэвхжүүлэв" : "Ажилтан идэвхгүй болгов", staffName(st));
  else log = audit(s, who.name, "Ажилтны мэдээлэл засав", staffName(st));
  set({ ...s, staff: next, audit: log });
}

export function addRole(who: Actor, role: Role) {
  patch((s) => ({ ...s, roles: [...s.roles, role], audit: audit(s, who.name, "Шинэ эрх үүсгэв", role.name, undefined, role.modules.join(", ")) }));
}

/* ───────── НӨАТ, НХАТ (admin.geregepos.mn) ───────── */

export function setTaxProfile(who: Actor, tax: TaxProfile) {
  patch((s) => ({
    ...s,
    merchant: { ...s.merchant, tax: { ...tax, setBy: who.name } },
    audit: audit(s, who.name, "Татварын тохиргоо", s.merchant.name, s.merchant.tax ? modeOf(s.merchant.tax).title : "—", modeOf(tax).title),
  }));
}

export { isExciseBuna };

/* ───────── бараа (BR03) ───────── */

export function upsertCategory(who: Actor, c: Category) {
  patch((s) => {
    const exists = s.categories.some((x) => x.id === c.id);
    return {
      ...s,
      categories: exists ? s.categories.map((x) => (x.id === c.id ? c : x)) : [...s.categories, c],
      audit: audit(s, who.name, exists ? "Барааны төрөл засав" : "Барааны төрөл нэмэв", c.name),
    };
  });
}

export function upsertProduct(who: Actor, p: Product) {
  patch((s) => {
    const prev = s.products.find((x) => x.id === p.id);
    let log = s.audit;
    if (!prev) log = audit({ ...s, audit: log }, who.name, "Бараа нэмэв", p.name);
    else {
      // BR03-10: үнэ, оноо, нөөцийн гар засвар бүр лог
      if (prev.price !== p.price) log = audit({ ...s, audit: log }, who.name, "Үнэ засав", p.name, money(prev.price), money(p.price));
      if (prev.points !== p.points) log = audit({ ...s, audit: log }, who.name, "Оноо засав", p.name, String(prev.points), String(p.points));
      if (prev.stock !== p.stock) log = audit({ ...s, audit: log }, who.name, "Нөөц засав", p.name, String(prev.stock), String(p.stock));
      if (prev.deliveryStopped !== p.deliveryStopped)
        log = audit({ ...s, audit: log }, who.name, p.deliveryStopped ? "Хүргэлт зогсоов" : "Хүргэлт сэргээв", p.name);
      if (prev.active !== p.active) log = audit({ ...s, audit: log }, who.name, p.active ? "Бараа идэвхжүүлэв" : "Бараа идэвхгүй болгов", p.name);
      if (log === s.audit) log = audit(s, who.name, "Бараа засав", p.name);
    }
    return { ...s, products: prev ? s.products.map((x) => (x.id === p.id ? p : x)) : [...s.products, p], audit: log };
  });
}

/** BR09-1.2: олноор «хүргэлт зогссон» */
export function setDeliveryStopped(who: Actor, ids: string[], stopped: boolean) {
  patch((s) => ({
    ...s,
    products: s.products.map((p) => (ids.includes(p.id) ? { ...p, deliveryStopped: stopped } : p)),
    audit: audit(s, who.name, stopped ? "Хүргэлт зогсоов" : "Хүргэлт сэргээв", `${ids.length} бараа`),
  }));
}

/* ───────── харилцагч (BR06) ───────── */

export function findCustomer(phone: string): Customer | null {
  const p = phone.replace(/\D/g, "");
  return ensure().customers.find((c) => c.phone === p && !c.erased) ?? null;
}

export function findByPass(code: string): Customer | null {
  const c = code.trim().toUpperCase();
  return ensure().customers.find((x) => !x.erased && (x.passSerial?.toUpperCase() === c || x.phone === c)) ?? null;
}

export function addCustomer(who: Actor, phone: string, name: string | undefined, source: Customer["source"], optIn = true): Customer {
  const s = ensure();
  const p = phone.replace(/\D/g, "");
  if (p.length !== 8) throw new SpError("Утасны дугаар 8 оронтой байна.");
  const exists = s.customers.find((c) => c.phone === p && !c.erased);
  if (exists) return exists;
  const c: Customer = { id: uid("cu"), phone: p, name: name || undefined, optIn, source, createdAt: nowIso(), points: 0 };
  set({ ...s, customers: [c, ...s.customers], audit: source === "manual" ? audit(s, who.name, "Харилцагч бүртгэв", p) : s.audit });
  return c;
}

export function updateCustomer(who: Actor, c: Customer) {
  patch((s) => ({ ...s, customers: s.customers.map((x) => (x.id === c.id ? c : x)), audit: audit(s, who.name, "Харилцагч засав", c.phone) }));
}

/** BR06-8: устгах / псевдонимжуулах — борлуулалтын бичилт үлдэнэ */
export function eraseCustomer(who: Actor, id: string) {
  patch((s) => ({
    ...s,
    customers: s.customers.map((c) => (c.id === id ? { ...c, phone: `•••• ${c.id.slice(-4)}`, name: undefined, optIn: false, erased: true, passSerial: undefined } : c)),
    audit: audit(s, who.name, "Харилцагчийн мэдээлэл устгав", id),
  }));
}

export function adjustPoints(who: Actor, customerId: string, delta: number, note: string) {
  patch((s) => {
    const c = s.customers.find((x) => x.id === customerId);
    if (!c) return s;
    return {
      ...s,
      customers: s.customers.map((x) => (x.id === customerId ? { ...x, points: Math.max(0, x.points + delta) } : x)),
      points: [{ id: uid("pt"), customerId, delta, kind: "manual" as const, at: nowIso(), note }, ...s.points],
      audit: audit(s, who.name, "Оноо гараар өөрчлөв", c.phone, String(c.points), String(Math.max(0, c.points + delta))),
    };
  });
}

/* ───────── борлуулалт (BR09) ───────── */

export type SaleInput = {
  who: Actor;
  mode: "cart" | "amount";
  /** A mode */
  cart?: CartInput;
  /** B mode */
  amount?: number;
  /** B mode-д suggest сонгосон бол задаргаа */
  split?: SaleLine[];
  customerId?: string;
  redeem?: number;
  method: PayMethod;
  cashGiven?: number;
  ebarimt: { kind: "person" | "org"; orgReg?: string; orgName?: string };
  /** BR09-8: давхардлын хамгаалалт — нэг төлбөрт нэг түлхүүр */
  idemKey: string;
  channel?: "pos" | "delivery";
  orderId?: string;
  /** хүргэлтийн захиалгын бэлэн мөрүүд */
  lines?: SaleLine[];
  total?: number;
};

export function completeSale(inp: SaleInput): Sale {
  const s = ensure();
  // BR09-7: онлайн шаардлага — дутуу гүйлгээ үүсгэхгүй
  if (!s.online) throw new SpError("Сүлжээ тасарсан байна. Гүйлгээ хадгалагдаагүй.");
  const dup = s.sales.find((x) => x.idemKey === inp.idemKey);
  if (dup) return dup;

  const customer = inp.customerId ? s.customers.find((c) => c.id === inp.customerId) ?? null : null;
  let lines: SaleLine[];
  let subtotal: number;
  let applied: Sale["applied"] = [];
  let pointsSpent = 0;
  let pointsEarned = 0;
  let total: number;
  let status: Sale["ebarimt"]["status"] = s.ebarimt ? "sent" : "off";

  if (inp.lines) {
    lines = inp.lines;
    total = inp.total ?? lines.reduce((a, l) => a + l.qty * l.price, 0);
    subtotal = total;
  } else if (inp.mode === "cart") {
    const pr = priceCart(s, inp.cart ?? [], customer, inp.redeem ?? 0);
    lines = pr.lines;
    subtotal = pr.subtotal;
    applied = pr.applied;
    pointsSpent = pr.redeem;
    pointsEarned = pr.pointsEarned;
    total = pr.total;
  } else {
    const amount = Math.round(inp.amount ?? 0);
    if (inp.split?.length) {
      lines = inp.split;
    } else {
      // BR09-1.1: задаргаагүй бол Ebarimt руу «бусад» төрлийн бараа
      lines = [{ name: "Бусад", qty: 1, price: amount }];
      if (s.ebarimt) status = "other";
    }
    subtotal = amount;
    total = amount;
    if (customer && activePointCampaign(s)) {
      pointsEarned = lines.reduce((a, l) => a + (s.products.find((p) => p.id === l.productId)?.points ?? 0) * l.qty, 0);
    }
  }
  if (total < 0) throw new SpError("Дүн буруу байна.");

  const no = s.seq.sale + 1;
  const sale: Sale = {
    id: uid("s"),
    no,
    at: nowIso(),
    staffId: inp.who.id,
    channel: inp.channel ?? "pos",
    mode: inp.mode,
    lines,
    subtotal,
    applied,
    pointsSpent,
    pointsEarned,
    total,
    method: inp.method,
    cashGiven: inp.cashGiven,
    customerId: customer?.id,
    orderId: inp.orderId,
    tax: saleTax(s.merchant.tax ?? DEFAULT_TAX, s.products, lines, total),
    ebarimt: { ...inp.ebarimt, status, ddtd: ddtd(), lottery: status === "off" ? undefined : `AB ${Math.floor(1000 + Math.random() * 8999)} ${Math.floor(1000 + Math.random() * 8999)}` },
    idemKey: inp.idemKey,
  };

  // BR03-3 нөөц хасна; BR03-8 0 болбол хүргэлт автоматаар зогсоно.
  // Хүргэлтийн захиалгын нөөц захиалга үүсэхэд аль хэдийн хасагдсан.
  const products = inp.channel === "delivery" ? s.products : s.products.map((p) => {
    const q = lines.filter((l) => l.productId === p.id).reduce((a, l) => a + l.qty, 0);
    if (!q) return p;
    const stock = Math.max(0, p.stock - q);
    return { ...p, stock, deliveryStopped: stock === 0 ? true : p.deliveryStopped };
  });

  let customers = s.customers;
  let points = s.points;
  if (customer) {
    const delta = pointsEarned - pointsSpent;
    customers = customers.map((c) => (c.id === customer.id ? { ...c, points: c.points + delta } : c));
    if (pointsSpent) points = [{ id: uid("pt"), customerId: customer.id, saleId: sale.id, delta: -pointsSpent, kind: "spend" as const, at: sale.at }, ...points];
    if (pointsEarned) points = [{ id: uid("pt"), customerId: customer.id, saleId: sale.id, delta: pointsEarned, kind: "earn" as const, at: sale.at }, ...points];
  }
  const campaigns: Campaign[] = s.campaigns.map((c) => (c.type === "item" && applied.some((a) => a.campaignId === c.id) ? { ...c, uses: c.uses + 1 } : c));

  let notices = s.notices;
  for (const p of products) {
    const before = s.products.find((x) => x.id === p.id);
    if (before && before.stock > p.minStock && p.stock <= p.minStock) {
      notices = addNotice({ ...s, notices }, { kind: "stock", title: "Нөөц дуусах дөхлөө", body: `${p.name} — ${p.stock} үлдлээ` });
    }
  }

  set({ ...s, sales: [sale, ...s.sales], products, customers, points, campaigns, notices, seq: { ...s.seq, sale: no } });
  return sale;
}

/**
 * BR09-6 буцаалт: Ebarimt reverse, олгосон оноо хасах, зарцуулсан оноо
 * сэргээх, нөөц нэмэх. QR бол мерчант өөрөө буцаана (UI сэрэмжлүүлнэ).
 */
export function refundSale(who: Actor, saleId: string, reason: string) {
  const s = ensure();
  if (!s.online) throw new SpError("Сүлжээ тасарсан байна. Буцаалт хийгдээгүй.");
  const sale = s.sales.find((x) => x.id === saleId);
  if (!sale) throw new SpError("Гүйлгээ олдсонгүй.");
  if (sale.refund) throw new SpError("Энэ гүйлгээ аль хэдийн буцаагдсан.");
  const at = nowIso();
  const products = s.products.map((p) => {
    const q = sale.lines.filter((l) => l.productId === p.id).reduce((a, l) => a + l.qty, 0);
    return q ? { ...p, stock: p.stock + q } : p;
  });
  let customers = s.customers;
  let points = s.points;
  if (sale.customerId) {
    const delta = sale.pointsSpent - sale.pointsEarned;
    customers = customers.map((c) => (c.id === sale.customerId ? { ...c, points: Math.max(0, c.points + delta) } : c));
    if (sale.pointsEarned) points = [{ id: uid("pt"), customerId: sale.customerId, saleId, delta: -sale.pointsEarned, kind: "revert" as const, at }, ...points];
    if (sale.pointsSpent) points = [{ id: uid("pt"), customerId: sale.customerId, saleId, delta: sale.pointsSpent, kind: "restore" as const, at }, ...points];
  }
  const sales = s.sales.map((x) =>
    x.id === saleId ? { ...x, refund: { at, by: who.name, reason }, ebarimt: { ...x.ebarimt, status: x.ebarimt.status === "off" ? ("off" as const) : ("reversed" as const) } } : x,
  );
  set({ ...s, sales, products, customers, points, audit: audit(s, who.name, "Буцаалт хийв", `Гүйлгээ №${sale.no}`, money(sale.total), reason) });
}

/* ───────── хүргэлт (BR04, BR09-1.2) ───────── */

export type OrderInput = {
  name: string;
  phone: string;
  address: string;
  district: string;
  note?: string;
  items: CartInput;
  payLater: boolean;
};

/** Захиалгын веб хуудаснаас. BR04-6…10, BR06-2 */
export function createOrder(inp: OrderInput): Order {
  const s = ensure();
  if (!s.delivery.enabled || !["plus", "premium"].includes(s.merchant.plan)) throw new SpError("Энэ дэлгүүр одоогоор хүргэлт хүлээн авахгүй байна.");
  if (!s.delivery.districts.includes(inp.district)) throw new SpError(`${inp.district} дүүрэг хүргэлтийн бүсээс гадуур байна.`);
  const phone = inp.phone.replace(/\D/g, "");
  if (phone.length !== 8) throw new SpError("Утасны дугаар 8 оронтой байна.");
  const lines: SaleLine[] = [];
  for (const it of inp.items) {
    const p = s.products.find((x) => x.id === it.productId);
    if (!p || !p.active || !p.delivery || p.deliveryStopped) throw new SpError(`«${p?.name ?? "Бараа"}» одоогоор хүргэлтээр зарагдахгүй байна.`);
    if (p.stock < it.qty) throw new SpError(`«${p.name}» ${p.stock} ширхэг л үлдсэн байна.`);
    lines.push({ productId: p.id, name: p.name, qty: it.qty, price: p.price });
  }
  if (!lines.length) throw new SpError("Сагс хоосон байна.");

  let customer = s.customers.find((c) => c.phone === phone && !c.erased);
  let customers = s.customers;
  if (!customer) {
    customer = { id: uid("cu"), phone, name: inp.name, optIn: false, source: "delivery", createdAt: nowIso(), points: 0 };
    customers = [customer, ...customers];
  }
  const no = s.seq.order + 1;
  const total = lines.reduce((a, l) => a + l.qty * l.price, 0) + s.delivery.fee;
  const order: Order = {
    id: uid("o"),
    no,
    createdAt: nowIso(),
    name: inp.name,
    phone,
    address: inp.address,
    district: inp.district,
    note: inp.note,
    lines,
    fee: s.delivery.fee,
    total,
    payLater: inp.payLater,
    paid: false,
    statusId: s.delivery.statuses[0]?.id ?? "received",
    history: [{ statusId: s.delivery.statuses[0]?.id ?? "received", at: nowIso(), by: "Захиалгын хуудас" }],
    code: String(Math.floor(100000 + Math.random() * 900000)),
    codeTries: 0,
    customerId: customer.id,
  };
  // Захиалга үүсэхэд нөөц түр хасагдана — давхар зарагдахгүй.
  const products = s.products.map((p) => {
    const q = lines.filter((l) => l.productId === p.id).reduce((a, l) => a + l.qty, 0);
    if (!q) return p;
    const stock = p.stock - q;
    return { ...p, stock, deliveryStopped: stock === 0 ? true : p.deliveryStopped };
  });
  let next: SpState = { ...s, orders: [order, ...s.orders], customers, products, seq: { ...s.seq, order: no } };
  next = { ...next, notices: addNotice(next, { kind: "order", title: `Шинэ захиалга #${no}`, body: `${inp.name} · ${money(total)}${inp.payLater ? " · Дараа төлөх" : ""}` }), smsLog: deliverySms(next, order, order.statusId) };
  set(next);
  if (!inp.payLater) {
    // Одоо төлөх — QR-аар төлсөн гэж үзнэ
    collectOrderPayment({ id: "web", name: "Захиалгын хуудас" }, order.id, "qr", `order-${order.id}`);
  }
  return ensure().orders.find((o) => o.id === order.id)!;
}

export function collectOrderPayment(who: Actor, orderId: string, method: PayMethod, idemKey: string, ebarimt: SaleInput["ebarimt"] = { kind: "person" }) {
  const s = ensure();
  const o = s.orders.find((x) => x.id === orderId);
  if (!o) throw new SpError("Захиалга олдсонгүй.");
  if (o.paid) return;
  const sale = completeSale({
    who,
    mode: "cart",
    channel: "delivery",
    orderId,
    lines: [...o.lines, ...(o.fee ? [{ name: "Хүргэлт", qty: 1, price: o.fee }] : [])],
    total: o.total,
    customerId: o.customerId,
    method,
    ebarimt,
    idemKey,
  });
  const s2 = ensure();
  set({ ...s2, orders: s2.orders.map((x) => (x.id === orderId ? { ...x, paid: true, payMethod: method, saleId: sale.id } : x)) });
  return sale;
}

export function setOrderStatus(who: Actor, orderId: string, statusId: string) {
  const s = ensure();
  const st = s.delivery.statuses.find((x) => x.id === statusId);
  if (st?.final) throw new SpError("«Хүргэгдсэн» төлөвт зөвхөн ачаа хүлээн авах кодоор шилжинэ.");
  const o = s.orders.find((x) => x.id === orderId)!;
  const next: SpState = {
    ...s,
    orders: s.orders.map((x) => (x.id === orderId ? { ...x, statusId, history: [...x.history, { statusId, at: nowIso(), by: who.name }] } : x)),
  };
  set({ ...next, smsLog: deliverySms(next, o, statusId) });
}

/** BR04-10, BR09-1.2: зөвхөн зөв кодоор «хүргэгдсэн» */
export function handover(who: Actor, orderId: string, code: string): "ok" | "wrong" | "unpaid" | "locked" {
  const s = ensure();
  const o = s.orders.find((x) => x.id === orderId);
  if (!o) return "wrong";
  if (!o.paid) return "unpaid";
  if (o.codeTries >= 5) return "locked";
  if (code !== o.code) {
    set({ ...s, orders: s.orders.map((x) => (x.id === orderId ? { ...x, codeTries: x.codeTries + 1 } : x)) });
    return o.codeTries + 1 >= 5 ? "locked" : "wrong";
  }
  const fin = s.delivery.statuses.find((x) => x.final) ?? { id: "delivered" };
  const next: SpState = {
    ...s,
    orders: s.orders.map((x) => (x.id === orderId ? { ...x, statusId: fin.id, history: [...x.history, { statusId: fin.id, at: nowIso(), by: who.name }] } : x)),
  };
  set({ ...next, smsLog: deliverySms(next, o, fin.id) });
  return "ok";
}

/** Код дахин илгээх — SMS лог */
export function resendCode(orderId: string) {
  patch((s) => {
    const o = s.orders.find((x) => x.id === orderId);
    if (!o) return s;
    const text = `${s.delivery.page.name}: #${o.no} ачаа хүлээн авах код: ${o.code}`;
    return {
      ...s,
      orders: s.orders.map((x) => (x.id === orderId ? { ...x, codeTries: 0 } : x)),
      smsLog: [{ id: uid("sm"), at: nowIso(), kind: "delivery" as const, phone: o.phone, text, cost: smsParts(text).parts * SMS_PRICE }, ...s.smsLog].slice(0, 1000),
    };
  });
}

/** BR04-11, BR09: цуцлах — төлсөн бол буцаалт (Ebarimt reverse), нөөц буцна */
export function cancelOrder(who: Actor, orderId: string, reason: CancelReason) {
  const s = ensure();
  const o = s.orders.find((x) => x.id === orderId);
  if (!o || o.cancel) return;
  if (o.saleId) refundSale(who, o.saleId, CANCEL_LABEL[reason]);
  const s2 = ensure();
  const products = s2.products.map((p) => {
    const q = o.lines.filter((l) => l.productId === p.id).reduce((a, l) => a + l.qty, 0);
    // refundSale хүргэлтийн борлуулалтын нөөцийг нэмсэн тул давхар нэмэхгүй
    return q && !o.saleId ? { ...p, stock: p.stock + q } : p;
  });
  set({
    ...s2,
    products,
    orders: s2.orders.map((x) => (x.id === orderId ? { ...x, cancel: { at: nowIso(), by: who.name, reason, refunded: !!o.saleId } } : x)),
    audit: audit(s2, who.name, "Захиалга цуцлав", `#${o.no}`, undefined, CANCEL_LABEL[reason]),
  });
}

export function updateDelivery(who: Actor, d: DeliverySettings) {
  patch((s) => ({ ...s, delivery: d, audit: audit(s, who.name, "Хүргэлтийн тохиргоо солив", "Хүргэлт") }));
}

/* ───────── урамшуулал (BR05) ───────── */

export function upsertCampaign(who: Actor, c: Campaign) {
  const s = ensure();
  const prev = s.campaigns.find((x) => x.id === c.id);
  // BR05-9: идэвхтэй campaign-ийн гол тохиргоог өөрчлөхийг хаана
  if (prev && prev.active) {
    const key = (x: Campaign) => (x.type === "point" ? JSON.stringify(x.tiers) : JSON.stringify([x.reward, x.qty, x.productIds]));
    if (key(prev) !== key(c)) throw new SpError("Идэвхтэй урамшууллын түвшин, шагналыг өөрчлөх боломжгүй. Шинэ урамшуулал үүсгэнэ үү.");
  }
  set({
    ...s,
    campaigns: prev ? s.campaigns.map((x) => (x.id === c.id ? c : x)) : [c, ...s.campaigns],
    audit: audit(s, who.name, prev ? "Урамшуулал засав" : "Урамшуулал үүсгэв", c.name),
  });
}

export function toggleCampaign(who: Actor, id: string, active: boolean) {
  patch((s) => {
    const c = s.campaigns.find((x) => x.id === id);
    if (!c) return s;
    return {
      ...s,
      campaigns: s.campaigns.map((x) => (x.id === id ? { ...x, active } : x)),
      audit: audit(s, who.name, active ? "Урамшуулал идэвхжүүлэв" : "Урамшуулал зогсоов", c.name),
    };
  });
}

/* ───────── Wallet pass ───────── */

export function updatePass(who: Actor, p: WalletPass) {
  patch((s) => ({ ...s, pass: p, audit: audit(s, who.name, p.published && !s.pass.published ? "Wallet pass нийтлэв" : "Wallet pass загвар солив", "Wallet pass") }));
}

export function issuePass(customerId: string) {
  patch((s) => ({
    ...s,
    customers: s.customers.map((c) => (c.id === customerId && !c.passSerial ? { ...c, passSerial: `GP-${Date.now().toString(36).toUpperCase().slice(-6)}` } : c)),
  }));
}

/* ───────── маркетинг (BR07) ───────── */

/** BR07-2, 8: төлбөр амжилттай болсны дараа л илгээнэ */
export function sendSmsCampaign(who: Actor, c: Omit<SmsCampaign, "id" | "at" | "sent" | "delivered" | "failed">, phones: string[]) {
  patch((s) => {
    const failed = phones.filter(() => Math.random() < 0.03).length;
    const camp: SmsCampaign = { ...c, id: uid("sms"), at: nowIso(), sent: phones.length, delivered: phones.length - failed, failed };
    const log = phones.map((phone) => ({ id: uid("sm"), at: camp.at, kind: "marketing" as const, phone, text: c.text, cost: c.parts * SMS_PRICE }));
    return {
      ...s,
      sms: [camp, ...s.sms],
      smsLog: [...log, ...s.smsLog].slice(0, 3000),
      audit: audit(s, who.name, "Маркетинг SMS илгээв", `${phones.length} дугаар`, undefined, money(c.cost)),
    };
  });
}

/* ───────── систем ───────── */

export function setOnline(online: boolean) {
  patch((s) => ({ ...s, online }));
}
export function setEbarimt(who: Actor, on: boolean) {
  patch((s) => ({ ...s, ebarimt: on, audit: audit(s, who.name, on ? "Ebarimt холбов" : "Ebarimt салгав", "Ebarimt") }));
}
export function readNotices() {
  patch((s) => ({ ...s, notices: s.notices.map((n) => ({ ...n, read: true })) }));
}
export function resetDemo() {
  set(freshState());
}

export { uid };

/**
 * Өргөтгөл: шинэ үйлдэл бичих шаардлагатай бол энэ замаар төлөвийг
 * өөрчилнө (localStorage + бусад цонх руу автоматаар түгнэ).
 * `log` өгвөл аудит лог бичнэ.
 */
export function mutate(fn: (s: SpState) => SpState, log?: { who: Actor; action: string; target: string; from?: string; to?: string }) {
  const s = ensure();
  const next = fn(s);
  set(log ? { ...next, audit: audit(next, log.who.name, log.action, log.target, log.from, log.to) } : next);
}
