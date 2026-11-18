/*
 * Дизайн батлуулахад зориулсан жишээ дата.
 *
 * Талбаруудыг е-баримт 3.0-ийн шаардлагаар нэрлэсэн — дизайн батлагдсаны
 * дараа энэ файл бодит дата давхаргаар солигдоход дэлгэц өөрчлөгдөхгүй.
 */

export type TaxType = "VAT_ABLE" | "VAT_FREE";

export type Product = {
  id: string;
  name: string;
  price: number;
  category: Category;
  taxType: TaxType;
  /** classificationCode + taxProductCode бөглөгдсөн эсэх */
  taxCoded: boolean;
  /** public/products доторх зураг */
  image: string;
  /** агуулахын үлдэгдэл */
  stock: number;
  /** хөнгөлөлтийн өмнөх үнэ — байвал зураастай харуулна */
  oldPrice?: number;
  /** бар код. Байхгүй бол дотоод код үүсгэнэ. */
  barCode?: string;
  /** хэмжих нэгж — е-баримтын measureUnit */
  unit: string;
};

export type Category = "хүнс" | "ундаа" | "чихэр" | "ахуй" | "эрүүл мэнд" | "бусад";

export const categories: { key: Category | "бүгд"; label: string }[] = [
  { key: "бүгд", label: "Бүгд" },
  { key: "хүнс", label: "Хүнс" },
  { key: "ундаа", label: "Ундаа" },
  { key: "чихэр", label: "Чихэр" },
  { key: "ахуй", label: "Ахуй" },
  { key: "эрүүл мэнд", label: "Эрүүл мэнд" },
  { key: "бусад", label: "Бусад" },
];

/** Жишээ бар код — EAN-13 шалгах оронтой */
const eanFor = (seed: string): string => {
  const body = String(48600000000 + Number(seed) * 10607).padStart(12, "0").slice(0, 12);
  const sum = body
    .split("")
    .reduce((acc, ch, i) => acc + Number(ch) * (i % 2 === 0 ? 1 : 3), 0);
  return body + String((10 - (sum % 10)) % 10);
};

type Extra = {
  old?: number;
  taxCoded?: boolean;
  taxType?: TaxType;
  noBarcode?: boolean;
  unit?: string;
};

const p = (
  id: string,
  name: string,
  price: number,
  category: Category,
  image: string,
  stock: number,
  extra: Extra = {},
): Product => ({
  id,
  name,
  price,
  category,
  stock,
  oldPrice: extra.old,
  taxType: extra.taxType ?? "VAT_ABLE",
  taxCoded: extra.taxCoded ?? true,
  barCode: extra.noBarcode ? undefined : eanFor(id),
  unit: extra.unit ?? "ш",
  image: `/products/${image}.png`,
});

export const products: Product[] = [
  p("1", "Талх", 2500, "хүнс", "bread", 142),
  p("2", "Сүү 1л", 3800, "хүнс", "milk-1l", 86, { old: 4200 }),
  p("3", "Өндөг 10ш", 6900, "хүнс", "eggs-10", 54),
  p("4", "Тараг 500г", 3200, "хүнс", "yogurt-500g", 73),
  p("5", "Будаа", 4500, "хүнс", "rice-1kg", 210, { unit: "кг" }),
  p("6", "Гурил", 2800, "хүнс", "flour-2kg", 164, { unit: "кг" }),
  p("7", "Тос", 9800, "хүнс", "oil-1l", 48, { old: 11500, unit: "л" }),
  p("8", "Давс", 1500, "хүнс", "salt-1kg", 320, { unit: "кг" }),

  p("9", "Ус 0.5л", 1200, "ундаа", "water-500ml", 639),
  p("10", "Ус 1.5л", 2200, "ундаа", "water-1500ml", 412),
  p("11", "Кофе", 3500, "ундаа", "coffee", 97),
  p("12", "Цай 100г", 4200, "ундаа", "tea-100g", 58),
  p("13", "Жүүс 1л", 4800, "ундаа", "juice-1l", 76, { old: 5400 }),
  p("14", "Кола 0.5л", 2800, "ундаа", "cola-500ml", 288),

  p("15", "Шоколад", 2800, "чихэр", "chocolate", 134),
  p("16", "Жигнэмэг", 1900, "чихэр", "cookies", 207),
  p("17", "Чихэр 200г", 3400, "чихэр", "candy-200g", 91),

  p("18", "Угаалгын нунтаг", 12500, "ахуй", "laundry-powder", 32, { old: 14900 }),
  p("19", "Савангийн шингэн", 6700, "ахуй", "liquid-soap", 61),
  p("20", "Жорлонгийн цаас", 8900, "ахуй", "toilet-paper", 45, { unit: "багц" }),

  p("21", "Эмийн маск", 500, "эрүүл мэнд", "medical-mask", 880, { taxType: "VAT_FREE" }),
  p("22", "Гар ариутгагч", 4300, "эрүүл мэнд", "hand-sanitizer", 119),

  // Татварын код дутуу — кассчинд анхааруулга харагдана
  p("23", "Гар утасны цэнэглэгч", 25000, "бусад", "phone-charger", 12, { taxCoded: false, noBarcode: true }),
  p("24", "Чихэвч", 18000, "бусад", "earphones", 8, { taxCoded: false, old: 21000 }),
];

export const money = (value: number): string =>
  value.toLocaleString("en-US") + "₮";

export const moneyPlain = (value: number): string => value.toLocaleString("en-US");

/** НӨАТ 10%, үнэд багтсан: дүн / 11, хагасыг дээш */
export const vatOf = (amount: number): number => Math.floor((amount * 10 + 55) / 110);

export type CartLine = { product: Product; qty: number };

/** Мөрийн дүн бүхэл төгрөгөөр — сервер (Landing lib/pos-db.ts) яг ингэж тооцдог */
export const lineTotal = (line: CartLine): number => Math.round(line.product.price * line.qty);

export const cartTotal = (lines: CartLine[]): number =>
  lines.reduce((sum, line) => sum + lineTotal(line), 0);

export const cartVat = (lines: CartLine[]): number =>
  lines.reduce(
    (sum, line) => sum + (line.product.taxType === "VAT_ABLE" ? vatOf(lineTotal(line)) : 0),
    0,
  );

/* ───────────────────────── ажилтан ─────────────────────────
   PIN энд байхгүй. Төвд холбогдсон касс PIN-ийг сервер рүү илгээж шалгуулна
   (scrypt hash, оролдлогын хязгаар — Landing lib/pos-auth.ts). Туршилтын
   горимд PIN-гүй, үүргээ сонгож орно. */

export type StaffRole = "Кассчин" | "Менежер" | "Эзэн";

export type Staff = {
  id: string;
  name: string;
  role: StaffRole;
  initials: string;
};

/** Туршилтын горимын ажилтан */
export const staff: Staff[] = [
  { id: "s1", name: "Б. Болд", role: "Кассчин", initials: "ББ" },
  { id: "s2", name: "С. Отгон", role: "Менежер", initials: "СО" },
  { id: "s3", name: "Г. Ганбат", role: "Эзэн", initials: "ГГ" },
];

/* ───────────────── өрийн дэвтэр ───────────────── */

export type Debtor = {
  id: string;
  name: string;
  phone: string;
  balance: number;
  /** сүүлийн гүйлгээний огноо */
  last: string;
  dueInDays: number;
};

export const debtors: Debtor[] = [
  { id: "d1", name: "Б. Ganzorig", phone: "9911-2233", balance: 148_000, last: "10-07", dueInDays: 3 },
  { id: "d2", name: "Цэцэгмаа", phone: "8800-4412", balance: 62_500, last: "10-06", dueInDays: 9 },
  { id: "d3", name: "Эрдэнэ сүлжээ", phone: "7700-1100", balance: 940_000, last: "10-08", dueInDays: -2 },
  { id: "d4", name: "Д. Батаа", phone: "9090-7788", balance: 24_000, last: "10-05", dueInDays: 14 },
  { id: "d5", name: "Оргил дэлгүүр", phone: "9510-3344", balance: 311_200, last: "10-08", dueInDays: 6 },
];

/* ───────────────── урамшуулал ───────────────── */

export type Member = {
  id: string;
  name: string;
  /** Хувь хүн утсаар, байгууллага ТТД-гаар танигдана */
  kind: "хүн" | "байгууллага";
  phone: string;
  /** Зөвхөн байгууллагад — B2B баримтад мөн энэ ТТД очно */
  tin?: string;
  points: number;
  tier: Tier;
  visits: number;
  /**
   * Гишүүний QR дотор байх мөр.
   *
   * Үйлчлүүлэгч Gerege апп дээрээ үүнийг QR болгон харуулна, кассчин
   * уншуулна. Утасгүй, апп суулгаагүй хүнд зориулж кассаас утсаар нь
   * хайж болно — тиймээс код нь танихад хангалттай боловч нууц биш.
   */
  code: string;
};

export type Tier = "Энгийн" | "Мөнгөн" | "Алтан";

/**
 * Зэрэглэлийн дүрэм.
 *
 * `off` — худалдан авалтаас хасагдах хувь.
 * `earn` — худалдан авалтын дүнгээс хуримтлагдах оноо (1 оноо = 1₮).
 *
 * Хоёулаа нэг дор ажиллана: Алтан гишүүн 7% хөнгөлөлт аваад, үлдсэн
 * дүнгээс нь 3%-ийг оноогоор буцааж авна.
 */
export const tierRule: Record<Tier, { off: number; earn: number }> = {
  Энгийн: { off: 0, earn: 0.01 },
  Мөнгөн: { off: 0.03, earn: 0.02 },
  Алтан: { off: 0.07, earn: 0.03 },
};

export const members: Member[] = [
  { id: "m1", name: "С. Болормаа", kind: "хүн", phone: "9911-0022", points: 4_820, tier: "Алтан", visits: 64, code: "GRG-9911-0022" },
  { id: "m2", name: "Эрдэнэ сүлжээ ХХК", kind: "байгууллага", phone: "7700-1100", tin: "2845119", points: 18_400, tier: "Алтан", visits: 112, code: "GRG-2845119" },
  { id: "m3", name: "Т. Ням", kind: "хүн", phone: "8811-7733", points: 1_240, tier: "Мөнгөн", visits: 21, code: "GRG-8811-7733" },
  { id: "m4", name: "Оргил цогцолбор ХХК", kind: "байгууллага", phone: "9510-3344", tin: "5120883", points: 6_750, tier: "Мөнгөн", visits: 47, code: "GRG-5120883" },
  { id: "m5", name: "Г. Хулан", kind: "хүн", phone: "9500-1188", points: 380, tier: "Энгийн", visits: 7, code: "GRG-9500-1188" },
  { id: "m6", name: "Б. Содном", kind: "хүн", phone: "9966-5544", points: 2_150, tier: "Мөнгөн", visits: 33, code: "GRG-9966-5544" },
];

/** Код, утас, нэрээр гишүүн олох — QR уншуулах ба гараар хайх хоёуланд */
export const findMember = (members: Member[], query: string): Member | undefined => {
  const q = query.trim().toLowerCase();
  if (!q) return undefined;
  const digits = q.replace(/[^0-9]/g, "");
  return members.find(
    (m) =>
      m.code.toLowerCase() === q ||
      m.name.toLowerCase().includes(q) ||
      (digits.length >= 4 && m.phone.replace(/[^0-9]/g, "").includes(digits)) ||
      (digits.length >= 4 && (m.tin ?? "").includes(digits)),
  );
};

/**
 * Байгууллага бүрт өөрийн урамшууллын QR үүснэ.
 *
 * Нэг эзэн хэд хэдэн хуулийн этгээд, салбар ажиллуулдаг. Оноо нь
 * байгууллага тус бүрт тусдаа хуримтлагдана — нэг дэлгүүрийн оноо
 * нөгөөд шилждэггүй.
 */
export type LoyaltyOrg = {
  id: string;
  name: string;
  tin: string;
  branch: string;
  code: string;
  joined: number;
  /** 100₮ тутамд хэдэн оноо */
  pointRate: number;
  active: boolean;
};

export const loyaltyOrgs: LoyaltyOrg[] = [
  {
    id: "o1",
    name: "Жишээ дэлгүүр ХХК",
    tin: "1234567",
    branch: "Төв салбар · 001",
    code: "GEREGE-LOYALTY-1234567-001",
    joined: 1_284,
    pointRate: 1,
    active: true,
  },
  {
    id: "o2",
    name: "Жишээ дэлгүүр ХХК",
    tin: "1234567",
    branch: "Зайсан салбар · 002",
    code: "GEREGE-LOYALTY-1234567-002",
    joined: 416,
    pointRate: 1,
    active: true,
  },
  {
    id: "o3",
    name: "Жишээ Кафе ХХК",
    tin: "7781204",
    branch: "Нэг салбар · 001",
    code: "GEREGE-LOYALTY-7781204-001",
    joined: 238,
    pointRate: 2,
    active: false,
  },
];

/* ───────────────── хэрэглэгчийн булан ───────────────── */

export type MemberVisit = {
  id: string;
  date: string;
  branch: string;
  /** Төлсөн дүн (хөнгөлөлтийн дараа) */
  paid: number;
  /** Зэрэглэлийн хөнгөлөлт */
  off: number;
  earned: number;
  spent: number;
};

/**
 * Гишүүний сүүлийн худалдан авалтууд — жишээ.
 *
 * Хадгалалт (B1) болтол гүйлгээ гишүүнтэй хадгалагдахгүй тул энд
 * гишүүний кодоос тогтвортой (дахин ачаалахад өөрчлөгдөхгүй) жишээ
 * үүсгэнэ. Хөнгөлөлт, оноо нь `tierRule`-ээр яг кассынх шиг бодогдоно.
 */
export const memberHistory = (member: Member, count = 6): MemberVisit[] => {
  // mulberry32 — кодоос тогтвортой, мөр бүр өөр утга
  let seed = 0;
  for (const ch of member.code) seed = (Math.imul(seed, 31) + ch.charCodeAt(0)) | 0;
  const next = () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
  const rule = tierRule[member.tier];
  const branches = loyaltyOrgs.filter((org) => org.active);
  const start = new Date(2026, 9, 8);

  let day = 0;
  return Array.from({ length: count }, (_, index) => {
    day += 1 + Math.floor(next() * 6);
    const subtotal = Math.round((4_000 + next() * 60_000) / 100) * 100;
    const off = Math.round(subtotal * rule.off);
    const spent = index === 2 ? Math.min(1_000, member.points) : 0;
    const paid = subtotal - off - spent;
    const date = new Date(start.getTime() - day * 86_400_000);
    return {
      id: `${member.id}-v${index}`,
      date: `${date.getMonth() + 1}/${String(date.getDate()).padStart(2, "0")}`,
      branch: branches[Math.floor(next() * branches.length)]?.branch ?? "",
      paid,
      off,
      earned: Math.floor(paid * rule.earn),
      spent,
    };
  });
};

/* ───────────────── орлого, зарлага ───────────────── */

export type MoneyEntry = {
  id: string;
  kind: "орлого" | "зарлага";
  label: string;
  amount: number;
  at: string;
};

export const moneyEntries: MoneyEntry[] = [
  { id: "e1", kind: "орлого", label: "Кассын борлуулалт", amount: 842_600, at: "Өнөөдөр" },
  { id: "e2", kind: "зарлага", label: "Бараа худалдан авалт", amount: 410_000, at: "Өнөөдөр" },
  { id: "e3", kind: "зарлага", label: "Түрээс", amount: 300_000, at: "10-07" },
  { id: "e4", kind: "орлого", label: "Өр төлөлт", amount: 148_000, at: "10-07" },
  { id: "e5", kind: "зарлага", label: "Цалин", amount: 1_200_000, at: "10-05" },
  { id: "e6", kind: "орлого", label: "Кассын борлуулалт", amount: 756_300, at: "10-05" },
];

/* ───────────────── өнөөдрийн гүйлгээ ───────────────── */

export type Txn = {
  id: string;
  no: string;
  at: string;
  items: number;
  method: "Бэлэн" | "Карт" | "QPay" | "Хэтэвч";
  amount: number;
  /** е-баримтын төлөв. PosAPI холбогдоогүй тул «Холбогдоогүй»; татварын код
      дутуу бараатай бол холбогдсон ч баримт гарахгүй — «Код дутуу». */
  receipt: "Холбогдоогүй" | "Код дутуу";
};

export const txns: Txn[] = [
  { id: "t1", no: "A3F9C2B10D", at: "14:52", items: 3, method: "Бэлэн", amount: 8_800, receipt: "Холбогдоогүй" },
  { id: "t2", no: "7C41D9E0B2", at: "14:38", items: 7, method: "Карт", amount: 34_560, receipt: "Код дутуу" },
  { id: "t3", no: "9B20A7F4C1", at: "14:11", items: 1, method: "QPay", amount: 2_500, receipt: "Холбогдоогүй" },
  { id: "t4", no: "5E8D1C0A66", at: "13:47", items: 12, method: "Карт", amount: 128_400, receipt: "Холбогдоогүй" },
  { id: "t5", no: "2A6F4B9D30", at: "13:20", items: 2, method: "Бэлэн", amount: 6_100, receipt: "Холбогдоогүй" },
  { id: "t6", no: "C1D7E3A852", at: "12:58", items: 5, method: "Бэлэн", amount: 19_900, receipt: "Холбогдоогүй" },
];

/** Сүүлийн 7 хоногийн борлуулалт — дашбоардын график */
export const weekSales = [
  { day: "Да", value: 612_000 },
  { day: "Мя", value: 548_300 },
  { day: "Лх", value: 731_900 },
  { day: "Пү", value: 489_500 },
  { day: "Ба", value: 905_200 },
  { day: "Бя", value: 1_124_000 },
  { day: "Ня", value: 842_600 },
];

/** Дотоод бар код үүсгэх — EAN-13 маягийн, 200 угтвартай (дэлгүүрийн дотоод муж) */
export const makeBarcode = (seed: number): string => {
  const body = String(2_000_000_000_00 + seed * 7919).slice(0, 12);
  const digits = body.split("").map(Number);
  const sum = digits.reduce((acc, d, i) => acc + d * (i % 2 === 0 ? 1 : 3), 0);
  const check = (10 - (sum % 10)) % 10;
  return body + check;
};

/* ───────────────── хэмжих нэгж ─────────────────
   Е-баримтын PosAPI-д `measureUnit` заавал очдог. Доорх жагсаалт нь
   дэлгүүрт түгээмэл хэрэглэгддэг нэгжүүд.

   ШАЛГАХ: е-баримт тодорхой нэрсийг хүлээж авдаг эсэхийг PosAPI 3.0.1
   албан тодорхойлолттой тулгах шаардлагатай. Хэрэв хаалттай жагсаалт
   бол энэ массивыг тэрүүгээр солино.

   `fractional` — бутархай тоогоор зарагддаг эсэх. Жин, эзэлхүүн, уртыг
   ширхэгээр нэмж болохгүй: 0.350 кг гэж жигнэнэ. */

export type Unit = {
  key: string;
  label: string;
  fractional: boolean;
  /** нэмэх товч дарахад нэмэгдэх хэмжээ */
  step: number;
};

export const units: Unit[] = [
  { key: "ш", label: "ширхэг", fractional: false, step: 1 },
  { key: "кг", label: "килограмм", fractional: true, step: 0.1 },
  { key: "г", label: "грамм", fractional: false, step: 50 },
  { key: "л", label: "литр", fractional: true, step: 0.5 },
  { key: "мл", label: "миллилитр", fractional: false, step: 100 },
  { key: "м", label: "метр", fractional: true, step: 0.5 },
  { key: "багц", label: "багц", fractional: false, step: 1 },
  { key: "хайрцаг", label: "хайрцаг", fractional: false, step: 1 },
  { key: "хос", label: "хос", fractional: false, step: 1 },
];

export const unitOf = (key: string): Unit => units.find((u) => u.key === key) ?? units[0];

/** Тоо хэмжээг нэгжид тохируулж бичнэ: 2 ш, 0.35 кг */
export const formatQty = (qty: number, unitKey: string): string => {
  const unit = unitOf(unitKey);
  const value = unit.fractional
    ? Number(qty.toFixed(3)).toLocaleString("en-US", { maximumFractionDigits: 3 })
    : String(Math.round(qty));
  return `${value} ${unit.key}`;
};

/**
 * Эхлэлийн борлуулалтын түүх — барааны id → зарагдсан тоо, орлого.
 *
 * Захирлын самбар хоосон байж болохгүй: шинэ дэлгүүр нээсэн ч өчигдрийн
 * тоо харагддаг байх ёстой. Бодит зарагдалт энэ дээр нэмэгдэнэ.
 */
export const soldSeed: Record<string, { qty: number; amount: number }> = {
  "1": { qty: 184, amount: 460_000 },
  "2": { qty: 96, amount: 364_800 },
  "11": { qty: 71, amount: 248_500 },
  "15": { qty: 63, amount: 176_400 },
  "3": { qty: 34, amount: 234_600 },
  "5": { qty: 28, amount: 126_000 },
  "19": { qty: 22, amount: 198_000 },
  "9": { qty: 41, amount: 49_200 },
};

/** Ажилтан тус бүрийн өнөөдрийн гүйцэтгэл */
export const staffToday: Record<string, { sales: number; txns: number }> = {
  s1: { sales: 512_400, txns: 38 },
  s2: { sales: 330_200, txns: 21 },
};

/** Эхлэлийн гүйлгээний тоо — амьд нэмэгдсэнийг үүнээс тооцно */
export const seedTxnCount = txns.length;
