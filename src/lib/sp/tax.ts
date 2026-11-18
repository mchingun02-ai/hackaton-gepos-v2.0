/*
 * НӨАТ, НХАТ — Пос апп, мерчантын гар утасны апп, Merchant portal гурав
 * энэ нэг файлын дүрмийг хэрэглэнэ.
 *
 * Зарчим:
 *  - НӨАТ-ын чөлөөлөлт бараанаас биш, хэн зарж байгаагаас хамаарна.
 *    НӨАТ-ын тухай хуулийн 13.10: сүү, мах, гурил, ногоо (13.1.15–17)-г
 *    ДАМЖУУЛАН зарж буй этгээд чөлөөлөгдөхгүй. Эм, эмнэлгийн хэрэгслийн
 *    худалдаа ч чөлөөлөгдөхгүй (13.7). Иймд дэлгүүрийн бараа = НӨАТ 10%.
 *  - Мерчантын НӨАТ, НХАТ төлөгч эсэхийг admin.geregepos.mn дээр бүртгэлийн
 *    үед и-Баримтаас (getInfo) татаж, үйл ажиллагаа, үйлдвэрлэгч эсэхийг
 *    Gerege-ийн ажилтан тохируулна. Бараа бүртгэгч татвар сонгохгүй.
 *  - Бараан дээр зөвхөн БҮНА код (ангилал) хадгална. НХАТ ногдох эсэх
 *    (архи, тамхи) нь БҮНА-гаас гарна. Хувийг баримт гаргах мөчид тооцно.
 */

import type { Product, TaxProfile } from "./types";

export type Tile = {
  id: string;
  icon: string;
  label: string;
  /** анхдагч БҮНА 7 оронтой код (и-Баримтын албан ангилал gs1_gs1.xlsx) */
  buna: string;
  /** дэд сонголт */
  alt?: { buna: string; label: string }[];
};

/** Дэлгүүр, худалдаа. Кодыг Gerege хөтөлнө. */
export const RETAIL_TILES: Tile[] = [
  { id: "milk", icon: "🥛", label: "Сүү, цагаан идээ", buna: "6252211", alt: [{ buna: "6252211", label: "Сүү" }, { buna: "2223011", label: "Тараг" }, { buna: "6252203", label: "Аарц" }] },
  { id: "bread", icon: "🍞", label: "Талх, боов", buna: "2349011", alt: [{ buna: "2349011", label: "Талх" }, { buna: "6112509", label: "Нарийн боов" }] },
  { id: "meat", icon: "🥩", label: "Мах, хиам", buna: "6252306", alt: [{ buna: "6252306", label: "Үхрийн мах" }, { buna: "6252312", label: "Хонины мах" }, { buna: "6222304", label: "Тахианы мах" }, { buna: "6222306", label: "Хиам" }] },
  { id: "eggs", icon: "🥚", label: "Өндөг", buna: "6252208" },
  { id: "grain", icon: "🌾", label: "Гурил, будаа", buna: "6112502", alt: [{ buna: "6112502", label: "Гурил" }, { buna: "6112515", label: "Будаа" }, { buna: "6112501", label: "Гоймон" }] },
  { id: "veg", icon: "🥕", label: "Жимс, ногоо", buna: "6252124", alt: [{ buna: "6252124", label: "Төмс" }, { buna: "6252108", label: "Лууван" }, { buna: "6252122", label: "Сонгино" }, { buna: "6252111", label: "Мандарин" }] },
  { id: "sweet", icon: "🍬", label: "Чихэр, амттан", buna: "2367011", alt: [{ buna: "2367011", label: "Чихэр" }, { buna: "6112519", label: "Шоколад" }, { buna: "2342012", label: "Жигнэмэг" }] },
  { id: "drink", icon: "🥤", label: "Ус, ундаа", buna: "2449011", alt: [{ buna: "2449011", label: "Ундаа" }, { buna: "2449021", label: "Рашаан, ус" }, { buna: "2143100", label: "Шүүс" }] },
  { id: "tea", icon: "☕", label: "Цай, кофе", buna: "6212703", alt: [{ buna: "6212703", label: "Кофе" }, { buna: "0162000", label: "Цай" }] },
  { id: "oil", icon: "🧂", label: "Тос, амтлагч", buna: "6252224", alt: [{ buna: "6252224", label: "Тос" }, { buna: "6222904", label: "Давс" }, { buna: "6222908", label: "Кетчуп" }] },
  { id: "beer", icon: "🍺", label: "Пиво", buna: "2431000" },
  { id: "alcohol", icon: "🍶", label: "Архи, дарс", buna: "2413151", alt: [{ buna: "2413151", label: "Архи" }, { buna: "2421200", label: "Дарс" }, { buna: "6212931", label: "Виски" }] },
  { id: "tobacco", icon: "🚬", label: "Тамхи", buna: "2502000" },
  { id: "chem", icon: "🧴", label: "Ахуйн хими", buna: "6124403", alt: [{ buna: "6124403", label: "Угаалгын нунтаг" }, { buna: "6124402", label: "Толбо арилгагч" }] },
  { id: "hygiene", icon: "🪥", label: "Ариун цэвэр", buna: "6127521", alt: [{ buna: "6127521", label: "Шампунь" }, { buna: "6127525", label: "Шүдний оо" }, { buna: "6127502", label: "Цаас" }, { buna: "6127504", label: "Саван" }] },
  { id: "baby", icon: "👶", label: "Хүүхдийн", buna: "6127506" },
  { id: "med", icon: "💊", label: "Эм, эмнэлгийн", buna: "6127391", alt: [{ buna: "6127391", label: "Эм" }, { buna: "6217491", label: "Эмнэлгийн хэрэгсэл" }] },
  { id: "office", icon: "✏️", label: "Бичиг хэрэг", buna: "6115107", alt: [{ buna: "6115107", label: "Бичиг хэрэг" }, { buna: "6115108", label: "Ном" }] },
  { id: "wear", icon: "👕", label: "Хувцас, гутал", buna: "6223355", alt: [{ buna: "6223355", label: "Хувцас" }, { buna: "6253401", label: "Гутал" }] },
  { id: "other", icon: "📦", label: "Бусад", buna: "6215991" },
];

/** Ресторан, кафе, баар */
export const FOOD_TILES: Tile[] = [
  { id: "dish", icon: "🍲", label: "Хоол", buna: "6331023" },
  { id: "buuz", icon: "🥟", label: "Бууз, хуушуур", buna: "6331041", alt: [{ buna: "6331041", label: "Бууз" }, { buna: "6331043", label: "Хуушуур" }] },
  { id: "soup", icon: "🍜", label: "Шөл", buna: "6331004" },
  { id: "hot", icon: "☕", label: "Цай, кофе", buna: "6340053", alt: [{ buna: "6340053", label: "Кофе" }, { buna: "6340052", label: "Сүүтэй цай" }] },
  { id: "cold", icon: "🥤", label: "Ус, жүүс", buna: "6340057", alt: [{ buna: "6340057", label: "Ус" }, { buna: "6340056", label: "Жүүс" }] },
  { id: "dessert", icon: "🍰", label: "Амттан", buna: "6339901" },
  { id: "beer", icon: "🍺", label: "Пиво", buna: "2431000" },
  { id: "alcohol", icon: "🍶", label: "Архи, дарс", buna: "2413151", alt: [{ buna: "2413151", label: "Архи" }, { buna: "2421200", label: "Дарс" }, { buna: "6212931", label: "Виски" }] },
  { id: "tobacco", icon: "🚬", label: "Тамхи", buna: "2502000" },
];

export const SERVICE_ACTIVITIES = ["restaurant", "bar", "hotel", "carwash"] as const;

export const ACTIVITY_LABEL: Record<TaxProfile["activity"], string> = {
  retail: "Дэлгүүр, худалдаа",
  restaurant: "Ресторан, кафе",
  bar: "Баар",
  hotel: "Зочид буудал, амралт",
  carwash: "Авто угаалга, засвар",
  exempt: "Эмнэлэг, сургалт (НӨАТ-гүй үйлчилгээ)",
  fuel: "Шатахуун",
};

export const PRODUCER_LABEL: Record<TaxProfile["producer"][number], string> = {
  milk: "Сүү, сүүн бүтээгдэхүүн",
  meat: "Мах",
  crop: "Гурил, ногоо, үр тариа",
  herder: "Малчин, хоршоо",
};

export const tilesFor = (p: TaxProfile) => (p.activity === "restaurant" || p.activity === "bar" || p.activity === "hotel" ? FOOD_TILES : RETAIL_TILES);

/** Архи, согтууруулах ундаа, тамхи — НХАТ-ын бараа (Хотын албан татварын тухай хууль) */
export const isExciseBuna = (code?: string) => !!code && (/^24(1|2|3)/.test(code) || code === "2229031" || code === "6212931" || /^25/.test(code));

export function tileOf(code: string | undefined, p: TaxProfile): Tile | undefined {
  if (!code) return undefined;
  const all = [...tilesFor(p), ...RETAIL_TILES, ...FOOD_TILES];
  return all.find((t) => t.buna === code || t.alt?.some((a) => a.buna === code));
}

/** НХАТ-ын хувь: хот, ангилал, огноогоор. Gerege хөтөлнө, кодонд тогтмол бичихгүй байх ёстой —
    одоогоор нэг хүснэгт. УБ: 2%, 2027.01.01-ээс үйлчилгээ 1%, архи тамхи 2% (НИТХ 2026.11.09, хэвлэлийн мэдээ). */
export const CITY_RATES = [
  { from: "2025-06-01", service: 0.02, excise: 0.02 },
  { from: "2027-01-01", service: 0.01, excise: 0.02 },
];

function rates(date: Date) {
  const d = date.toISOString().slice(0, 10);
  return [...CITY_RATES].reverse().find((r) => r.from <= d) ?? CITY_RATES[0];
}

export type VatKind = "VAT_ABLE" | "VAT_FREE" | "NONE";

export function vatKind(p: TaxProfile, prod?: Pick<Product, "ownProduction">): VatKind {
  if (!p.vatPayer) return "NONE";
  if (p.freeProject || p.activity === "exempt") return "VAT_FREE";
  if (prod?.ownProduction && p.producer.length) return "VAT_FREE";
  return "VAT_ABLE";
}

export function cityRate(p: TaxProfile, prod: Pick<Product, "bunaCode"> | undefined, date = new Date()): number {
  if (!p.cityTaxPayer) return 0;
  const r = rates(date);
  const excise = isExciseBuna(prod?.bunaCode);
  if ((SERVICE_ACTIVITIES as readonly string[]).includes(p.activity)) return excise ? r.excise : r.service;
  return excise ? r.excise : 0;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Бүх татвартай дүнгээс НӨАТ, НХАТ-ыг задлана (НӨАТ, НХАТ хоёулаа татваргүй үнээс). */
export function splitTax(amount: number, p: TaxProfile, prod?: Pick<Product, "bunaCode" | "ownProduction">, date = new Date()) {
  const vk = vatKind(p, prod);
  const v = vk === "VAT_ABLE" ? 0.1 : 0;
  const c = cityRate(p, prod, date);
  const base = amount / (1 + v + c);
  return { vat: r2(base * v), city: r2(base * c), vatKind: vk, cityRate: c };
}

/** Хэрэглэгчид харагдах нэг мөр: «НӨАТ 10% · НХАТ 2%» */
export function taxText(p: TaxProfile, prod?: Pick<Product, "bunaCode" | "ownProduction">, date = new Date()) {
  const vk = vatKind(p, prod);
  const c = cityRate(p, prod, date);
  const parts = [vk === "VAT_ABLE" ? "НӨАТ 10%" : vk === "VAT_FREE" ? "НӨАТ-аас чөлөөлөгдсөн" : "НӨАТ-гүй"];
  if (c) parts.push(`НХАТ ${Math.round(c * 100)}%`);
  return parts.join(" · ");
}

/** Татварын горим — admin.geregepos.mn дээрх тохиргооноос гарна */
export function modeOf(p: TaxProfile) {
  if (!p.vatPayer && !p.cityTaxPayer) return { code: "A", title: "Татваргүй", body: "НӨАТ, НХАТ төлөгч биш. Бараа бүртгэхэд татварын асуулт байхгүй." };
  if (p.freeProject || p.activity === "exempt") return { code: "E", title: "НӨАТ-гүй үйлчилгээ", body: "Бүх борлуулалт НӨАТ-аас чөлөөлөгдөнө." };
  if ((SERVICE_ACTIVITIES as readonly string[]).includes(p.activity) && p.cityTaxPayer)
    return { code: "D", title: "НӨАТ + НХАТ, үйлчилгээ", body: "Бүх борлуулалт НХАТ-тай. Архи, тамхи 2%." };
  if (p.cityTaxPayer) return { code: "C", title: "НӨАТ + НХАТ, худалдаа", body: "Бараа НӨАТ 10%. Архи, тамхинд НХАТ автоматаар." };
  if (p.vatPayer) return { code: "B", title: "НӨАТ", body: "Бүх бараа НӨАТ 10%. Асуулт байхгүй." };
  return { code: "A", title: "НХАТ-тай, НӨАТ-гүй", body: "НӨАТ төлөгч биш. НХАТ-ыг ангиллаас тооцно." };
}

/** Баримтын НӨАТ, НХАТ: мөр бүрээр, хөнгөлөлтийг мөрүүдэд хувь тэнцүүлэн тараана. */
export function saleTax(
  p: TaxProfile,
  products: Product[],
  lines: { productId?: string; qty: number; price: number; free?: boolean }[],
  total: number,
  date = new Date(),
) {
  const gross = lines.reduce((a, l) => a + (l.free ? 0 : l.qty * l.price), 0);
  const k = gross > 0 ? total / gross : 0;
  let vat = 0;
  let city = 0;
  for (const l of lines) {
    if (l.free) continue;
    const prod = products.find((x) => x.id === l.productId);
    const t = splitTax(l.qty * l.price * k, p, prod, date);
    vat += t.vat;
    city += t.city;
  }
  return { vat: r2(vat), city: r2(city) };
}

export const DEFAULT_TAX: TaxProfile = {
  vatPayer: true,
  cityTaxPayer: true,
  freeProject: false,
  activity: "retail",
  producer: [],
};
