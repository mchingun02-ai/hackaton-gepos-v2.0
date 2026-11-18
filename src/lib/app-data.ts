/**
 * Хэрэглэгчийн аппын жишээ өгөгдөл: Gerege POS-д холбогдсон хамтрагч
 * дэлгүүрүүд, тэдний бараа, урамшуулал.
 *
 * Бодит системд дэлгүүр бүр өөрийн кассаас (энэ POS) бараа, үнэ,
 * урамшууллаа нийтэлнэ. Одоогоор кассын каталогийг (demo.ts) дэлгүүр
 * бүрт өөр үнээр тараасан жишээ.
 */
import { products as posCatalog, type Product } from "@/lib/demo";

export type Partner = {
  id: string;
  name: string;
  kind: "Дэлгүүр" | "Супермаркет" | "Кафе" | "Эмийн сан" | "Цахилгаан бараа";
  /** Логоны оронд — эхний үсэг, өнгө */
  mark: string;
  color: string;
  address: string;
  distanceKm: number;
  rating: number;
  hours: string;
  delivery: { fee: number; freeFrom: number; minutes: string } | null;
  /** Gerege POS-д шинээр нэгдсэн — «Шинэ хамтрагч» хэсэгт гарна */
  isNew?: boolean;
  /** Дэлгүүрийн нэмэлт оноо, % — гишүүний зэрэглэлийн оноон дээр нэмэгдэнэ (дэлгүүр өөрөө санхүүжүүлнэ) */
  pointRate: number;
};

/**
 * Банк, төлбөрийн хамтрагчид — бараа зардаггүй, харин тэдний карт / аппаар
 * Gerege POS-той ямар ч дэлгүүрт төлөхөд урамшуулал өгнө.
 *
 * ЖИШЭЭ: санал болгосон урамшууллууд нь дизайны жишээ. Бодит нөхцөлийг
 * банк бүртэй гэрээгээр тохирч, эндээс (эсвэл төвөөс) солино.
 */
export type FinancePartner = {
  id: string;
  name: string;
  kind: "Банк" | "Төлбөр";
  logo: string;
  /** Үгэн лого (M bank, Голомт) — өргөн хайрцагт; эс бөгөөс дөрвөлжин icon */
  wide?: boolean;
  /** Купон картын суурь — брэнд өнгөний бараан → тод градиент (логоноос авсан) */
  bg: [string, string];
  /** Том тоо — «+5%», «3,000₮» */
  headline: string;
  /** Том тооны доорх тайлбар */
  headlineSub: string;
  /** Нэг мөр урамшуулал — дэлгэрэнгүй цонхны гарчиг */
  offer: string;
  /** Дэлгэрэнгүй нөхцөл */
  terms: string[];
  until: string;
  isNew?: boolean;
};

export const financePartners: FinancePartner[] = [
  {
    id: "f-mbank",
    name: "M bank",
    kind: "Банк",
    logo: "/partners/m-bank.webp",
    wide: true,
    bg: ["#0a5a4c", "#1fae92"],
    headline: "+5%",
    headlineSub: "нэмэлт оноо",
    offer: "M bank картаар төлөхөд +5% нэмэлт оноо",
    terms: ["Gerege POS-той бүх хамтрагч дэлгүүрт", "Нэг гүйлгээнд дээд тал нь 5,000 оноо", "Оноо 24 цагийн дотор хэтэвчинд орно"],
    until: "12/31",
    isNew: true,
  },
  {
    id: "f-golomt",
    name: "Голомт банк",
    kind: "Банк",
    logo: "/partners/golomt-bank.png",
    wide: true,
    bg: ["#052f5f", "#0b5bb0"],
    headline: "3,000₮",
    headlineSub: "буцаалт",
    offer: "30,000₮-өөс дээш худалдан авалтад 3,000₮ буцаалт",
    terms: ["Голомт банкны дебит, кредит карт", "Сард 2 удаа хүртэл", "Буцаалт хэтэвчинд мөнгөөр орно"],
    until: "11/30",
    isNew: true,
  },
  {
    id: "f-arig",
    name: "Ариг банк",
    kind: "Банк",
    logo: "/partners/arig-bank.png",
    bg: ["#6d0f3f", "#d42f7d"],
    headline: "+3%",
    headlineSub: "оноо",
    offer: "Ариг картаар төлөхөд +3% оноо",
    terms: ["Супермаркет, дэлгүүрт", "Хамгийн бага гүйлгээ 5,000₮"],
    until: "12/15",
    isNew: true,
  },
  {
    id: "f-qpay",
    name: "QPay",
    kind: "Төлбөр",
    logo: "/partners/qpay.png",
    bg: ["#101a30", "#22406f"],
    headline: "0₮",
    headlineSub: "хүргэлт",
    offer: "QPay-ээр төлөхөд хүргэлт үнэгүй",
    terms: ["Gerege апп-аар захиалсан хүргэлтэд", "20,000₮-өөс дээш захиалга"],
    until: "11/15",
  },
  {
    id: "f-bpay",
    name: "bPay",
    kind: "Төлбөр",
    logo: "/partners/bpay.png",
    bg: ["#061d4d", "#173d8f"],
    headline: "+2%",
    headlineSub: "оноо",
    offer: "bPay-ээр төлөхөд +2% оноо",
    terms: ["Кафе, ресторанд", "Оноо шууд хэтэвчинд орно"],
    until: "12/31",
    isNew: true,
  },
];

export const partners: Partner[] = [
  {
    id: "s1",
    name: "Номин экспресс",
    kind: "Дэлгүүр",
    mark: "Н",
    color: "#2563eb",
    address: "СБД, 1-р хороо, Энхтайваны өргөн чөлөө",
    distanceKm: 0.4,
    rating: 4.8,
    hours: "07:00–24:00",
    delivery: { fee: 3_000, freeFrom: 30_000, minutes: "20–35" },
    pointRate: 1,
  },
  {
    id: "s2",
    name: "Оргил супермаркет",
    kind: "Супермаркет",
    mark: "О",
    color: "#16a34a",
    address: "ХУД, 3-р хороо, Зайсан",
    distanceKm: 1.2,
    rating: 4.6,
    hours: "08:00–23:00",
    delivery: { fee: 4_000, freeFrom: 50_000, minutes: "30–50" },
    isNew: true,
    pointRate: 2,
  },
  {
    id: "s3",
    name: "Бөөрөлзгөнө кафе",
    kind: "Кафе",
    mark: "Б",
    color: "#db2777",
    address: "СБД, 8-р хороо, Их тойруу",
    distanceKm: 0.8,
    rating: 4.9,
    hours: "08:00–22:00",
    delivery: { fee: 2_500, freeFrom: 20_000, minutes: "15–25" },
    isNew: true,
    pointRate: 3,
  },
  {
    id: "s4",
    name: "Эрүүл амьдрал эмийн сан",
    kind: "Эмийн сан",
    mark: "Э",
    color: "#0891b2",
    address: "БЗД, 14-р хороо, Нарны зам",
    distanceKm: 2.1,
    rating: 4.7,
    hours: "09:00–21:00",
    delivery: null,
    pointRate: 1,
  },
  {
    id: "s5",
    name: "Техник плас",
    kind: "Цахилгаан бараа",
    mark: "Т",
    color: "#7c3aed",
    address: "ЧД, 4-р хороо, Их Монгол улсын гудамж",
    distanceKm: 3.4,
    rating: 4.5,
    hours: "10:00–20:00",
    delivery: { fee: 5_000, freeFrom: 100_000, minutes: "60–90" },
    isNew: true,
    pointRate: 1,
  },
];

export type ShopItem = {
  id: string;
  partnerId: string;
  product: Product;
  price: number;
  /** Урамшуулалтай бол хуучин үнэ */
  oldPrice?: number;
  /** «1+1», «2 дахь нь 50%» гэх мэт */
  deal?: string;
  dealEnds?: string;
};

/* Дэлгүүр бүрийн бараа: кассын каталогоос ангиллаар нь сонгоно */
const assortment: Record<string, string[]> = {
  s1: ["хүнс", "ундаа", "чихэр", "ахуй"],
  s2: ["хүнс", "ундаа", "чихэр", "ахуй", "эрүүл мэнд"],
  s3: ["ундаа", "чихэр"],
  s4: ["эрүүл мэнд", "ахуй"],
  s5: ["бусад"],
};

/* Урамшуулал: [дэлгүүр, барааны id, хувь эсвэл тусгай, дуусах огноо] */
const promos: [string, string, number | string, string][] = [
  ["s2", "7", 20, "10/20"],
  ["s2", "18", 25, "10/31"],
  ["s2", "13", "1+1", "10/15"],
  ["s1", "14", "2 дахь нь 50%", "10/18"],
  ["s1", "2", 10, "10/14"],
  ["s3", "11", 15, "10/25"],
  ["s3", "15", "1+1", "10/12"],
  ["s4", "22", 30, "10/30"],
  ["s5", "24", 15, "10/31"],
  ["s5", "23", 10, "11/05"],
  ["s1", "16", 20, "10/16"],
];

const round100 = (n: number) => Math.round(n / 100) * 100;

export const shopItems: ShopItem[] = partners.flatMap((partner, pIndex) =>
  posCatalog
    .filter((product) => assortment[partner.id].includes(product.category))
    .map((product) => {
      // Дэлгүүр бүр бага зэрэг өөр үнэтэй — бодит зах зээл шиг
      const base = round100(product.price * (1 + ((pIndex * 3 + Number(product.id)) % 5) * 0.02));
      const promo = promos.find(([s, id]) => s === partner.id && id === product.id);
      if (!promo) return { id: `${partner.id}-${product.id}`, partnerId: partner.id, product, price: base };
      const [, , offer, ends] = promo;
      return typeof offer === "number"
        ? { id: `${partner.id}-${product.id}`, partnerId: partner.id, product, price: round100(base * (1 - offer / 100)), oldPrice: base, deal: `−${offer}%`, dealEnds: ends }
        : { id: `${partner.id}-${product.id}`, partnerId: partner.id, product, price: base, deal: offer, dealEnds: ends };
    }),
);

export const deals = shopItems.filter((item) => item.deal);
export const partnerOf = (id: string) => partners.find((p) => p.id === id)!;
