/**
 * Бэлэн үүрэгт туслахууд (docs/ARCHITECTURE.md §10).
 * «Туслах» = хэрэгслийн дэд олонлог + prompt + батлуулах дүрэм + KB audience. Нэг агентын давталт (agent.ts loop) хэвээр;
 * бүгд ижил TenantContext-ээр ажиллана — туслах солигдоход tenant ХЭЗЭЭ Ч өөрчлөгдөхгүй.
 * Хэрэгслийг НЭРЭЭР заана: ажиллах үед бүртгэлд байхгүй нэр (ж: өөр модулийн тооллогын хэрэгсэл хараахан нэмэгдээгүй) алгасагдана.
 */
export type AssistantId = "service" | "sales" | "inventory" | "marketing" | "finance" | "tax" | "chief";
export type AssistantChannel = "web" | "fb" | "voice" | "director" | "mcp";
export type Audience = "customer" | "internal";

export type AssistantDef = {
  id: AssistantId;
  /** UI-ийн чип */
  name: string;
  purpose: string;
  /** захирлын тушаалд ашиглах хэрэгсэл; null = бүх director хэрэгсэл (chief) */
  tools: string[] | null;
  /** харилцагчийн сувагт (service ∪ sales-ийн customer хэсэг) */
  customerTools?: string[];
  channels: AssistantChannel[];
  kbAudience: Audience[];
  /** үргэлж батлуулах хэрэгсэл (risk-ээс үл хамааран) */
  confirm: string[];
  /** нөхцөлтэй батламж (ж: 30%-иас их хямдрал) */
  confirmIf?: (tool: string, args: Record<string, unknown>) => boolean;
  /** prompt-ийн туслахад зориулсан хэсэг (ЮУ ХИЙХ / ЮУ ХИЙХГҮЙ) */
  role: string[];
};

const pct = (v: unknown) => (typeof v === "number" ? v : Number(String(v ?? "").replace(/[^\d.]/g, "")) || 0);

export const ASSISTANTS: Record<AssistantId, AssistantDef> = {
  service: {
    id: "service",
    name: "Харилцагчийн үйлчилгээ",
    purpose: "Асуултад хариулах, гомдол бүртгэх, хүнд шилжүүлэх",
    tools: ["search_knowledge", "get_store_info", "list_products", "order_status", "create_ticket", "save_contact_info", "handoff_to_human"],
    customerTools: ["search_knowledge", "get_store_info", "list_products", "order_status", "create_ticket", "save_contact_info", "handoff_to_human"],
    channels: ["web", "fb", "voice"],
    kbAudience: ["customer"],
    confirm: [],
    role: ["Харилцагчийн асуултад мэдлэгийн сан, ПОС-ын бодит өгөгдлөөр хариулна; гомдлыг тасалбар болгоно; шаардлагатай үед ажилтанд шилжүүлнэ."],
  },
  sales: {
    id: "sales",
    name: "Борлуулалт, захиалга",
    purpose: "Бараа санал болгох, хүргэлтийн захиалга авах, захиалга удирдах",
    tools: ["list_products", "create_delivery_order", "order_status", "save_contact_info", "list_orders", "set_order_status", "cancel_order"],
    customerTools: ["list_products", "create_delivery_order", "order_status", "save_contact_info"],
    channels: ["web", "fb", "voice", "director"],
    kbAudience: ["customer"],
    confirm: ["cancel_order"],
    role: [
      "Хүргэлтийн захиалгыг удирдана: жагсаах, төлөв өөрчлөх, цуцлах (цуцлахыг захирал батална).",
      "Тайлан, урамшуулал, нөөцийн асуудал энэ туслахын ажил биш — «Захирлын туслах»-аар асуухыг санал болго.",
    ],
  },
  inventory: {
    id: "inventory",
    name: "Нөөц, тооллого",
    purpose: "Үлдэгдэл, дутагдал, тооллого, захиалах санал, зөрүү",
    tools: ["list_products", "low_stock", "update_product", "add_product", "inventory_status", "start_count", "variance_report", "reorder_suggestions", "approve_count"],
    channels: ["director"],
    kbAudience: ["customer", "internal"],
    confirm: ["approve_count"],
    role: [
      "Үлдэгдэл, дуусаж буй бараа, тооллого, зөрүү, захиалах саналыг хэрэгслээр шалгаж хариулна.",
      "Тооллого батлах нь үлдэгдлийг өөрчилнө — заавал захирлын батламжтай.",
      "Хямдрал, мессеж илгээх, санхүүгийн буцаалт энэ туслахын ажил биш.",
    ],
  },
  marketing: {
    id: "marketing",
    name: "Маркетинг, урамшуулал",
    purpose: "Хямдрал үүсгэх, сегмент, мессеж бэлтгэх",
    tools: ["list_customers", "create_discount", "toggle_campaign", "message_customers", "ai_insights", "list_products"],
    channels: ["director"],
    kbAudience: ["customer", "internal"],
    confirm: ["message_customers"],
    confirmIf: (tool, a) => tool === "create_discount" && pct(a.percent) > 30,
    role: [
      "Урамшуулал, хямдрал, харилцагчийн сегмент, мессежийн кампанит ажлыг хариуцна.",
      "Мессеж илгээх нь үргэлж захирлын батламжтай; 30%-иас их хямдрал мөн батлуулна. Messenger-ээр зөвхөн сүүлийн 24 цагт бичсэн хүмүүст хүрнэ.",
      "Борлуулалтын буцаалт, тооллого энэ туслахын ажил биш.",
    ],
  },
  finance: {
    id: "finance",
    name: "Санхүү, тайлан",
    purpose: "Борлуулалт, харьцуулалт, кредитийн хэрэглээ",
    tools: ["sales_report", "list_orders", "low_stock", "ai_insights", "usage_report", "refund_sale"],
    channels: ["director"],
    kbAudience: ["customer", "internal"],
    confirm: ["refund_sale"],
    role: [
      "Борлуулалт, орлого, харьцуулалт, AI кредитийн хэрэглээг ЗӨВХӨН уншиж тайлагнана.",
      "Буцаалт (refund_sale) хийх бол заавал захирлын батламжтай.",
      "Тоог зөвхөн хэрэгслийн үр дүнгээс; таамаглахгүй.",
    ],
  },
  tax: {
    id: "tax",
    name: "Татвар, и-Баримт",
    purpose: "НӨАТ/НХАТ-ын тайлбар, баримтын төлөв, БҮНА кодгүй бараа",
    tools: ["sales_report", "search_knowledge", "tax_summary", "list_products"],
    channels: ["director"],
    kbAudience: ["customer", "internal"],
    confirm: [],
    role: [
      "НӨАТ, НХАТ, и-Баримтын асуултад зөвхөн уншиж тайлбарлана — бичих хэрэгсэлгүй.",
      "Барааны татварын ангилал, БҮНА кодыг ХЭЗЭЭ Ч тааж онохгүй; мэдээлэл алга бол «нягтлан/лавлах сангаар шалгана уу» гэ.",
    ],
  },
  chief: {
    id: "chief",
    name: "Захирлын туслах",
    purpose: "Тушаалыг зөв туслахад чиглүүлэх, олон алхамтай ажлыг нэгтгэх",
    tools: null,
    channels: ["director", "mcp"],
    kbAudience: ["customer", "internal"],
    confirm: [],
    role: ["Олон салбарт хамаарах тушаалыг алхам алхмаар гүйцэтгэнэ."],
  },
};

export const ASSISTANT_IDS = Object.keys(ASSISTANTS) as AssistantId[];
/** Захирал гараар сонгож болох туслахууд (UI picker) */
export const DIRECTOR_ASSISTANTS: AssistantId[] = ["chief", "sales", "inventory", "marketing", "finance", "tax"];
export const isAssistant = (x: unknown): x is AssistantId => typeof x === "string" && (ASSISTANT_IDS as string[]).includes(x);

/** Харилцагчийн сувгийн нэгдсэн туслах (service ∪ sales-ийн customer хэсэг) — нэг ээлжид нэг LLM дуудлага (§10 чиглүүлэлт 1) */
export const CUSTOMER_TOOLS: readonly string[] = [...new Set([...(ASSISTANTS.service.customerTools ?? []), ...(ASSISTANTS.sales.customerTools ?? [])])];

/**
 * Туслахын зөвшөөрсөн хэрэгслийн олонлог. `known` — ажиллах үеийн бүртгэлийн нэрс (байхгүйг алгасна).
 * null = хязгааргүй (chief → scope-ийн бүх хэрэгсэл).
 */
export function allowedTools(id: AssistantId, known: Iterable<string>, channel: "director" | "customer" = "director"): ReadonlySet<string> | null {
  const def = ASSISTANTS[id];
  const want = channel === "customer" ? CUSTOMER_TOOLS : def.tools;
  if (!want) return null;
  const have = new Set(known);
  return new Set(want.filter((n) => have.has(n)));
}

/** Туслахын дүрмээр энэ дуудлагыг батлуулах эсэх */
export const needsConfirm = (id: AssistantId, tool: string, args: Record<string, unknown>) => ASSISTANTS[id].confirm.includes(tool) || !!ASSISTANTS[id].confirmIf?.(tool, args);
