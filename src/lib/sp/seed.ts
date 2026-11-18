/* Туршилтын жишээ өгөгдөл — анх ачаалахад нэг удаа үүснэ. Огноо нь
   тухайн өдөрт харьцангуй тул хэзээ нээсэн ч «өнөөдөр»-ийн тоо гарна. */

import type { Campaign, Category, Customer, Order, PointEntry, Product, Role, Sale, SpState, Staff } from "./types";

export const SP_VERSION = 3;

/** Тогтмол санамсаргүй тоо — seed бүрт ижил өгөгдөл */
function rng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

const iso = (d: Date) => d.toISOString();
const day = (offset: number) => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d.toISOString().slice(0, 10);
};

export const ROLES: Role[] = [
  { id: "admin", name: "Админ", modules: ["dashboard", "sales", "products", "delivery", "campaigns", "wallet", "crm", "marketing", "chat", "ai", "aiemp", "reports", "account"], manage: true, builtIn: true },
  { id: "manager", name: "Дэлгүүрийн менежер", modules: ["dashboard", "sales", "products", "reports", "campaigns", "delivery"], manage: true, builtIn: true },
  { id: "cashier", name: "Касс / Борлуулагч", modules: ["sales"], manage: false, builtIn: true },
  { id: "accountant", name: "Нягтлан бодогч", modules: ["reports"], manage: false, builtIn: true },
  { id: "courier", name: "Хүргэгч", modules: ["delivery"], manage: false },
];

const STAFF: Staff[] = [
  { id: "st1", regNo: "УБ98110225", first: "Сарнай", last: "Бат", phone: "99112233", roleId: "cashier", pin: "1111", active: true },
  { id: "st2", regNo: "УБ92071503", first: "Тэмүүлэн", last: "Дорж", phone: "88114455", roleId: "manager", pin: "2222", active: true, email: "temuulen@munkhod.mn" },
  { id: "st3", regNo: "УБ85032114", first: "Мөнх", last: "Очир", phone: "99001122", roleId: "admin", pin: "1234", active: true, email: "munkh@munkhod.mn" },
  { id: "st4", regNo: "УБ95040318", first: "Энхжин", last: "Эрдэнэ", phone: "95117788", roleId: "accountant", pin: "3333", active: true },
  { id: "st5", regNo: "УБ99122907", first: "Номин", last: "Гантулга", phone: "86006611", roleId: "courier", pin: "5555", active: true },
];

const CATS: Category[] = [
  { id: "c1", name: "Хүнс", active: true },
  { id: "c2", name: "Ундаа", active: true },
  { id: "c3", name: "Чихэр", active: true },
  { id: "c4", name: "Ахуй", active: true },
  { id: "c5", name: "Эрүүл мэнд", active: true },
];

const ean = (n: number) => {
  const body = String(486000000000 + n * 10607).slice(0, 12);
  const sum = body.split("").reduce((a, ch, i) => a + Number(ch) * (i % 2 ? 3 : 1), 0);
  return body + String((10 - (sum % 10)) % 10);
};

type P = [string, number, string, string, number, Partial<Product>?];
const RAW: P[] = [
  ["Талх «Атар»", 1800, "c1", "bread", 142, { points: 10, cost: 1300 }],
  ["Сүү 1 л «Сүү ХК»", 3900, "c1", "milk-1l", 86, { points: 20, cost: 3100 }],
  ["Өндөг 10 ш", 6500, "c1", "eggs-10", 4, { points: 30, cost: 5200, minStock: 10 }],
  ["Тараг 500 г", 3200, "c1", "yogurt-500g", 73, { points: 15 }],
  ["Будаа 1 кг", 4200, "c1", "rice-1kg", 210, { points: 20, unit: "кг" }],
  ["Гурил 2 кг", 5600, "c1", "flour-2kg", 64, { points: 25 }],
  ["Ургамлын тос 1 л", 9800, "c1", "oil-1l", 48, { points: 50 }],
  ["Ус «Ундраа» 0.5 л", 900, "c2", "water-500ml", 639, { points: 5 }],
  ["Ус 1.5 л", 2200, "c2", "water-1500ml", 412, { points: 10 }],
  ["Кофе 3-in-1, 20 ш", 11900, "c2", "coffee", 9, { points: 60, minStock: 10 }],
  ["Цай 100 г", 4200, "c2", "tea-100g", 58, { points: 20 }],
  ["Жүүс 1 л", 4800, "c2", "juice-1l", 76, { points: 25 }],
  ["Кока-Кола 0.5 л", 2500, "c2", "cola-500ml", 288, { points: 10 }],
  ["Шоколад «Алтан тариа»", 2800, "c3", "chocolate", 134, { points: 15 }],
  ["Жигнэмэг", 1900, "c3", "cookies", 207, { points: 10 }],
  ["Чихэр 200 г", 3400, "c3", "candy-200g", 0, { points: 15, deliveryStopped: true }],
  ["Угаалгын нунтаг", 12500, "c4", "laundry-powder", 32, { points: 60 }],
  ["Савангийн шингэн", 6700, "c4", "liquid-soap", 61, { points: 30 }],
  ["Жорлонгийн цаас", 8900, "c4", "toilet-paper", 45, { points: 40, unit: "багц" }],
  ["Эмнэлгийн маск", 500, "c5", "medical-mask", 880, { points: 0, delivery: false }],
  ["Гар ариутгагч", 4300, "c5", "hand-sanitizer", 119, { points: 20 }],
];

const PRODUCTS: Product[] = RAW.map(([name, price, categoryId, img, stock, extra], i) => ({
  id: `p${i + 1}`,
  name,
  price,
  categoryId,
  stock,
  minStock: 5,
  delivery: true,
  deliveryStopped: false,
  points: 0,
  image: `/products/${img}.png`,
  barcode: ean(i + 1),
  unit: "ш",
  active: true,
  ...extra,
}));

export const DISTRICTS = ["Баянзүрх", "Сүхбаатар", "Чингэлтэй", "Хан-Уул", "Баянгол", "Сонгинохайрхан", "Налайх", "Багануур", "Багахангай"];

const NAMES = ["Б.Ану", "Г.Номин", "Э.Ариун", "Ц.Бат", "Д.Тэмүүлэн", "О.Сараа", "Н.Гэрэл", "Т.Билгүүн", "А.Мөнхзул", "С.Ундрал", "П.Хулан", "Ж.Оргил", "М.Дөлгөөн", "Х.Тэнгис"];

export function buildSeed(): SpState {
  const r = rng(42);
  const now = new Date();

  const customers: Customer[] = NAMES.map((name, i) => ({
    id: `cu${i + 1}`,
    phone: (i % 3 ? "88" : "99") + String(100000 + Math.floor(r() * 899999)),
    name,
    optIn: i % 5 !== 3,
    source: i % 3 === 0 ? "delivery" : i % 3 === 1 ? "pos" : "manual",
    createdAt: iso(new Date(now.getTime() - (40 - i) * 86400000)),
    points: 0,
    passSerial: i < 6 ? `GP-${(100200 + i * 37).toString(36).toUpperCase()}` : undefined,
  }));
  customers[0].phone = "99112245";

  const points: PointEntry[] = [];
  const sales: Sale[] = [];
  let no = 0;
  const staffPos = ["st1", "st1", "st2", "st3"];
  const methods = ["qr", "card", "cash", "qr", "card"] as const;

  for (let d = 13; d >= 0; d--) {
    const n = d === 0 ? 37 : 22 + Math.floor(r() * 18);
    for (let k = 0; k < n; k++) {
      const at = new Date(now);
      at.setDate(at.getDate() - d);
      at.setHours(8 + Math.floor((k / n) * 13), Math.floor(r() * 60), 0, 0);
      if (d === 0 && at > now) at.setTime(now.getTime() - (n - k) * 60000 * 7);
      const lines = Array.from({ length: 1 + Math.floor(r() * 4) }, () => {
        const p = PRODUCTS[Math.floor(r() * PRODUCTS.length)];
        return { productId: p.id, name: p.name, qty: 1 + Math.floor(r() * 3), price: p.price };
      });
      const subtotal = lines.reduce((a, l) => a + l.qty * l.price, 0);
      const cust = r() < 0.45 ? customers[Math.floor(r() * customers.length)] : undefined;
      const earned = cust ? lines.reduce((a, l) => a + (PRODUCTS.find((p) => p.id === l.productId)?.points ?? 0) * l.qty, 0) : 0;
      no += 1;
      const id = `s${no}`;
      if (cust && earned) {
        cust.points += earned;
        points.push({ id: `pt${points.length + 1}`, customerId: cust.id, saleId: id, delta: earned, kind: "earn", at: iso(at) });
      }
      sales.push({
        id,
        no,
        at: iso(at),
        staffId: staffPos[Math.floor(r() * staffPos.length)],
        channel: r() < 0.18 ? "delivery" : "pos",
        mode: r() < 0.2 ? "amount" : "cart",
        lines,
        subtotal,
        applied: [],
        pointsSpent: 0,
        pointsEarned: earned,
        total: subtotal,
        method: methods[Math.floor(r() * methods.length)],
        customerId: cust?.id,
        ebarimt: { kind: "person", status: r() < 0.03 ? "off" : "sent", ddtd: ddtd(r) },
        idemKey: `seed-${no}`,
      });
    }
  }
  customers[0].points = Math.max(customers[0].points, 1240);

  const campaigns: Campaign[] = [
    {
      id: "cmp1",
      type: "point",
      name: "Мөнх-Од гишүүнчлэл",
      tiers: [
        { name: "Энгийн", points: 0 },
        { name: "Мөнгөн", points: 1000 },
        { name: "Алтан", points: 5000 },
      ],
      start: day(-60),
      end: day(120),
      active: true,
      expiryMonths: 12,
      createdAt: iso(new Date(now.getTime() - 60 * 86400000)),
    },
    {
      id: "cmp2",
      type: "item",
      name: "Кока-Кола 3+1",
      productIds: ["p13"],
      qty: 3,
      reward: { kind: "product", productId: "p13", qty: 1 },
      start: day(-10),
      end: day(20),
      days: [],
      from: "00:00",
      to: "23:59",
      active: true,
      limitPerCustomer: 5,
      uses: 41,
      createdAt: iso(new Date(now.getTime() - 10 * 86400000)),
    },
    {
      id: "cmp3",
      type: "item",
      name: "Өглөөний цай −15%",
      productIds: ["p2", "p1"],
      qty: 2,
      reward: { kind: "percent", value: 15 },
      start: day(-3),
      end: day(30),
      days: [1, 2, 3, 4, 5],
      from: "07:00",
      to: "10:00",
      active: false,
      uses: 0,
      createdAt: iso(new Date(now.getTime() - 3 * 86400000)),
    },
  ];

  const mkOrder = (i: number, cu: Customer, lines: [string, number][], statusId: string, minsAgo: number, payLater: boolean, paid: boolean, extra: Partial<Order> = {}): Order => {
    const ls = lines.map(([pid, qty]) => {
      const p = PRODUCTS.find((x) => x.id === pid)!;
      return { productId: pid, name: p.name, qty, price: p.price };
    });
    const created = new Date(now.getTime() - minsAgo * 60000);
    const total = ls.reduce((a, l) => a + l.qty * l.price, 0) + 2400;
    return {
      id: `o${i}`,
      no: 1030 + i,
      createdAt: iso(created),
      name: cu.name ?? "",
      phone: cu.phone,
      address: ["БЗД, 13-р хороо, 45-р байр, 2-р орц, 38 тоот", "СБД, 1-р хороо, Их тойруу 12, 504 тоот", "ХУД, 11-р хороо, Зайсан хотхон 7, 91 тоот", "ЧД, 4-р хороо, 22-р байр, 15 тоот"][i % 4],
      district: ["Баянзүрх", "Сүхбаатар", "Хан-Уул", "Чингэлтэй"][i % 4],
      lines: ls,
      fee: 2400,
      total,
      payLater,
      paid,
      payMethod: paid ? "qr" : undefined,
      statusId,
      history: [{ statusId: "received", at: iso(created), by: "Захиалгын хуудас" }],
      code: String(100000 + Math.floor(r() * 899999)),
      codeTries: 0,
      customerId: cu.id,
      ...extra,
    };
  };

  const orders: Order[] = [
    mkOrder(16, customers[0], [["p2", 2], ["p1", 2], ["p5", 1], ["p8", 1]], "received", 6, true, false),
    mkOrder(15, customers[3], [["p17", 1], ["p19", 2]], "onway", 28, false, true),
    mkOrder(14, customers[1], [["p12", 1], ["p11", 1]], "received", 47, false, true),
    mkOrder(13, customers[6], [["p7", 1], ["p6", 1]], "onway", 75, true, false),
    mkOrder(10, customers[2], [["p10", 2]], "delivered", 60 * 5, false, true),
    mkOrder(8, customers[9], [["p16", 2], ["p15", 1]], "received", 60 * 26, false, false, {
      cancel: { at: iso(new Date(now.getTime() - 60 * 60000 * 25)), by: "Д.Тэмүүлэн", reason: "out-of-stock", refunded: false },
    }),
  ];
  orders[1].history.push({ statusId: "onway", at: iso(new Date(now.getTime() - 20 * 60000)), by: "Г.Номин" });
  orders[3].history.push({ statusId: "onway", at: iso(new Date(now.getTime() - 50 * 60000)), by: "Г.Номин" });
  orders[4].history.push({ statusId: "delivered", at: iso(new Date(now.getTime() - 4 * 3600000)), by: "Г.Номин" });

  return {
    v: SP_VERSION,
    merchant: {
      kind: "org",
      name: "Мөнх-Од мини маркет ХХК",
      regNo: "6543210",
      kyc: {
        "Байгууллагын нэр": "Мөнх-Од мини маркет ХХК",
        "Байгууллагын РД": "6543210",
        "Байгуулагдсан огноо": "2016-04-12",
        "Үйл ажиллагааны чиглэл": "Хүнсний жижиглэн худалдаа",
        "Хаяг": "Улаанбаатар, Баянзүрх, 13-р хороо, 45-р байр",
        "Эрх бүхий этгээд": "О.Мөнх — Гүйцэтгэх захирал",
      },
      phone: "99001122",
      email: "info@munkhod.mn",
      plan: "premium",
      pin: "1234",
      puk: "123456",
      pinTries: 0,
      locked: false,
      ownerRegNo: "УБ85032114",
    },
    roles: ROLES,
    staff: STAFF,
    categories: CATS,
    products: PRODUCTS,
    customers,
    points,
    campaigns,
    sales,
    orders,
    delivery: {
      districts: ["Баянзүрх", "Сүхбаатар", "Чингэлтэй", "Хан-Уул"],
      statuses: [
        { id: "received", name: "Захиалга хүлээн авсан", sms: true },
        { id: "onway", name: "Хүргэлтэнд гарсан", sms: false },
        { id: "delivered", name: "Хүргэгдсэн", final: true, sms: true },
      ],
      fee: 2400,
      page: { name: "Мөнх-Од мини маркет", desc: "Өдөр тутмын хүнс 45 минутад гэрт тань", color: "#ff6a00" },
      sms: true,
      enabled: true,
    },
    pass: { published: true, bg: "#111113", fg: "#ffffff", label: "Оноо", back: "1 оноо = 1₮. Оноо 12 сарын дараа хүчингүй болно." },
    sms: [
      {
        id: "sms1",
        at: iso(new Date(now.getTime() - 4 * 86400000)),
        text: "Мөнх-Од: Энэ 7 хоногт Кока-Кола 3+1! Татгалзах: STOP 132213",
        minSpend: 50000,
        minOrders: 2,
        recipients: 214,
        excluded: 9,
        parts: 1,
        cost: 214 * 20,
        payer: { kind: "org", orgReg: "6543210", orgName: "Мөнх-Од мини маркет ХХК" },
        sent: 214,
        delivered: 208,
        failed: 6,
      },
    ],
    smsLog: [],
    audit: [
      { id: "a1", at: iso(new Date(now.getTime() - 3 * 86400000)), who: "О.Мөнх", action: "Багц солив", target: "Багц", from: "Plus", to: "Premium" },
      { id: "a2", at: iso(new Date(now.getTime() - 2 * 86400000)), who: "Д.Тэмүүлэн", action: "Үнэ засав", target: "Кофе 3-in-1, 20 ш", from: "12,500₮", to: "11,900₮" },
      { id: "a3", at: iso(new Date(now.getTime() - 26 * 3600000)), who: "Д.Тэмүүлэн", action: "Захиалга цуцлав", target: "#1038", to: "Бараа дууссан" },
    ],
    notices: [],
    ebarimt: true,
    online: true,
    seq: { sale: no, order: 1046 },
  };
}

export function ddtd(r: () => number = Math.random) {
  let s = "";
  for (let i = 0; i < 33; i++) s += Math.floor(r() * 10);
  return s;
}
