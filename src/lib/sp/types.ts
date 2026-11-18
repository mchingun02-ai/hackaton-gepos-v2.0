/*
 * Store Plus (GePOS v2.0, Phase 1) — өгөгдлийн загвар.
 * BRD - Store Plus Phase 1 v2: BR01–BR09.
 *
 * Пос апп, мерчантын гар утасны апп, Merchant portal, захиалгын веб хуудас
 * бүгд энэ нэг загварыг хуваалцана. Туршилтын горимд төхөөрөмжийн
 * localStorage-д хадгалагдаж, нээлттэй цонхнууд хооронд шууд синк хийгдэнэ.
 */

/** BR02 — багц */
export type Plan = "basic" | "plus" | "premium";

/** Цэс / модуль. Багц ба эрх хоёулаа үүгээр шүүнэ. */
export type Module =
  | "dashboard"
  | "sales" // Касс / борлуулалт
  | "products"
  | "delivery"
  | "campaigns"
  | "wallet"
  | "crm"
  | "marketing"
  | "chat" // Facebook Messenger чат
  | "ai" // AI туслах (Gemini)
  | "reports"
  | "account"; // Миний бүртгэл (багц, ажилтан)

export type Role = {
  id: string;
  name: string;
  modules: Module[];
  /** BR09-2: буцаалт, хүргэлт цуцлах, хүргэлт зогсоох эрх */
  manage: boolean;
  builtIn?: boolean;
};

export type Staff = {
  id: string;
  first: string;
  last: string;
  phone: string;
  address?: string;
  email?: string;
  roleId: string;
  pin: string;
  active: boolean;
  /** eID-ийн регистрийн дугаар — веб, утасны апп руу eID-ээр нэвтэрнэ */
  regNo?: string;
};

export type Category = { id: string; name: string; active: boolean };

export type Product = {
  id: string;
  name: string;
  categoryId: string;
  /** BR03-1 — optional */
  cost?: number;
  price: number;
  stock: number;
  /** BR03-7 — доод үлдэгдлийн босго */
  minStock: number;
  /** BR03-2 — хүргэлттэй эсэх */
  delivery: boolean;
  /** BR03-5 — «хүргэлт зогссон» */
  deliveryStopped: boolean;
  /** BR03-4 — нэг ширхэгт олгох оноо */
  points: number;
  image: string;
  barcode: string;
  unit: string;
  /** BR03-9 — устгахгүй, идэвхгүй болгоно */
  active: boolean;
  /** и-Баримтын БҮНА 7 оронтой код. НХАТ (архи, тамхи)-ыг үүнээс тооцно. */
  bunaCode?: string;
  /** кодыг хаанаас авсан: и-Баримтын сан, GePOS-ын сан, ангиллын зураг */
  bunaSource?: "ebarimt" | "gepos" | "tile";
  /** зөвхөн үйлдвэрлэгч мерчантад — өөрийн үйлдвэрлэл, дотоодын түүхий эд (13.1.15–17) */
  ownProduction?: boolean;
  /** кассаас нэмсэн бол эзэнд мэдэгдэнэ */
  addedBy?: "pos" | "mobile" | "portal";
};

/** admin.geregepos.mn дээр хэрэглэгч бүртгэх үед тохируулна. Мерчант өөрчлөхгүй. */
export type TaxProfile = {
  /** getTinInfo-оор олсон ТТД */
  tin?: string;
  /** и-Баримт getInfo */
  vatPayer: boolean;
  cityTaxPayer: boolean;
  freeProject: boolean;
  /** салбарын үйл ажиллагаа — Gerege-ийн ажилтан сонгоно */
  activity: "retail" | "restaurant" | "bar" | "hotel" | "carwash" | "exempt" | "fuel";
  /** өөрөө үйлдвэрлэдэг бол (дотоодын түүхий эдээр) */
  producer: ("milk" | "meat" | "crop" | "herder")[];
  /** getInfo хийсэн хугацаа, нэр */
  checkedAt?: string;
  ebarimtName?: string;
  setBy?: string;
};

export type Customer = {
  id: string;
  phone: string;
  name?: string;
  /** BR06-5 — маркетингийн зөвшөөрөл */
  optIn: boolean;
  source: "delivery" | "pos" | "manual";
  createdAt: string;
  points: number;
  /** Wallet pass олгосон бол */
  passSerial?: string;
  /** BR06-8 — псевдонимжуулсан */
  erased?: boolean;
};

export type PointEntry = {
  id: string;
  customerId: string;
  saleId?: string;
  delta: number;
  kind: "earn" | "spend" | "revert" | "restore" | "manual" | "expire";
  at: string;
  note?: string;
};

export type Tier = { name: string; points: number };

export type PointCampaign = {
  id: string;
  type: "point";
  name: string;
  tiers: Tier[];
  start: string; // YYYY-MM-DD
  end: string;
  active: boolean;
  /** BR05-5 — 0 = хугацаагүй */
  expiryMonths: number;
  /** BR05-5 — хүчингүй болохоос өмнө мэдэгдэх эсэх */
  expiryNotify?: boolean;
  /** BR05-7 — хязгаар (хоосон = хязгааргүй) */
  limitPerDay?: number;
  limitPerCustomer?: number;
  limitTotal?: number;
  createdAt: string;
};

export type ItemReward =
  | { kind: "product"; productId: string; qty: number }
  | { kind: "percent"; value: number }
  | { kind: "amount"; value: number };

export type ItemCampaign = {
  id: string;
  type: "item";
  name: string;
  productIds: string[];
  /** авах ёстой хэмжээ */
  qty: number;
  reward: ItemReward;
  start: string;
  end: string;
  /** 0=Ням … 6=Бямба. Хоосон = өдөр бүр */
  days: number[];
  from: string; // HH:MM
  to: string;
  active: boolean;
  limitPerDay?: number;
  limitPerCustomer?: number;
  limitTotal?: number;
  uses: number;
  createdAt: string;
};

export type Campaign = PointCampaign | ItemCampaign;

export type PayMethod = "cash" | "card" | "qr";

export type SaleLine = {
  productId?: string;
  name: string;
  qty: number;
  price: number;
  /** шагналаар үнэгүй өгсөн мөр */
  free?: boolean;
};

export type Applied = { campaignId: string; name: string; amount: number };

export type Ebarimt = {
  kind: "person" | "org";
  orgReg?: string;
  orgName?: string;
  /** sent = Ebarimt-д явсан, other = «бусад» төрлөөр, off = холбоогүй, reversed = буцаасан */
  status: "sent" | "other" | "off" | "reversed";
  ddtd: string;
  lottery?: string;
};

export type Sale = {
  id: string;
  no: number;
  at: string;
  staffId: string;
  channel: "pos" | "delivery";
  mode: "cart" | "amount";
  lines: SaleLine[];
  subtotal: number;
  applied: Applied[];
  pointsSpent: number;
  pointsEarned: number;
  total: number;
  method: PayMethod;
  cashGiven?: number;
  customerId?: string;
  orderId?: string;
  ebarimt: Ebarimt;
  /** баримт гаргах мөчид тооцсон НӨАТ, НХАТ */
  tax?: { vat: number; city: number };
  idemKey: string;
  refund?: { at: string; by: string; reason: string };
};

export type DeliveryStatus = { id: string; name: string; final?: boolean; sms: boolean };

export type Order = {
  id: string;
  no: number;
  createdAt: string;
  name: string;
  phone: string;
  address: string;
  district: string;
  note?: string;
  lines: SaleLine[];
  fee: number;
  total: number;
  /** BR04-8 */
  payLater: boolean;
  paid: boolean;
  payMethod?: PayMethod;
  saleId?: string;
  statusId: string;
  history: { statusId: string; at: string; by: string }[];
  /** BR04-10 — ачаа буулгах код */
  code: string;
  codeTries: number;
  cancel?: { at: string; by: string; reason: CancelReason; refunded: boolean };
  customerId: string;
};

export type CancelReason = "merchant" | "out-of-stock" | "customer";

export type DeliverySettings = {
  /** BR04-1 — хүргэх дүүргүүд */
  districts: string[];
  /** BR04-2 */
  statuses: DeliveryStatus[];
  /** BR04-3 — 0 байж болно */
  fee: number;
  /** BR04-4 */
  page: { name: string; desc: string; color: string; logo?: string };
  /** BR04-5 */
  sms: boolean;
  enabled: boolean;
};

export type WalletPass = {
  published: boolean;
  bg: string;
  fg: string;
  label: string;
  back: string;
  logo?: string;
};

export type SmsCampaign = {
  id: string;
  at: string;
  text: string;
  minSpend: number;
  minOrders: number;
  recipients: number;
  excluded: number;
  parts: number;
  cost: number;
  payer: { kind: "person" | "org"; orgReg?: string; orgName?: string };
  sent: number;
  delivered: number;
  failed: number;
};

export type SmsLog = { id: string; at: string; kind: "delivery" | "marketing"; phone: string; text: string; cost: number };

export type Audit = {
  id: string;
  at: string;
  who: string;
  action: string;
  target: string;
  from?: string;
  to?: string;
};

export type Merchant = {
  kind: "person" | "org";
  name: string;
  regNo: string;
  /** KYC — зөвхөн харах (BR02) */
  kyc: Record<string, string>;
  phone: string;
  email: string;
  plan: Plan;
  pin: string;
  puk: string;
  pinTries: number;
  locked: boolean;
  /** Эзэмшигч (eID) — байгууллага бол эрх бүхий этгээдийн РД */
  ownerRegNo?: string;
  /** НӨАТ, НХАТ-ын тохиргоо (admin.geregepos.mn) */
  tax?: TaxProfile;
};

export type Notice = { id: string; at: string; title: string; body: string; read: boolean; kind: "order" | "stock" | "system" };

export type SpState = {
  v: number;
  merchant: Merchant;
  roles: Role[];
  staff: Staff[];
  categories: Category[];
  products: Product[];
  customers: Customer[];
  points: PointEntry[];
  campaigns: Campaign[];
  sales: Sale[];
  orders: Order[];
  delivery: DeliverySettings;
  pass: WalletPass;
  sms: SmsCampaign[];
  smsLog: SmsLog[];
  audit: Audit[];
  notices: Notice[];
  /** Ebarimt холбосон эсэх (BR09-1.1) */
  ebarimt: boolean;
  /** BR09-7 — туршилтад сүлжээ тасрахыг дуурайна */
  online: boolean;
  seq: { sale: number; order: number };
};
