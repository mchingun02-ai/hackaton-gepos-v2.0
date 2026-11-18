/**
 * OpenAPI 3.1 — `/api/v1` бүх зам (docs/ARCHITECTURE.md §4.4, §4A.3, §7). GET /api/v1/openapi.json үүнийг буцаана.
 * Тооллогын (inventory) замууд нь тооллогын модулийнх — энд гэрээг нь баримтжуулна.
 */
type Obj = Record<string, unknown>;

const ref = (n: string) => ({ $ref: `#/components/schemas/${n}` });
const json = (schema: Obj, description = "OK") => ({ description, content: { "application/json": { schema } } });
const ERR = { "4XX": { $ref: "#/components/responses/Error" }, "5XX": { $ref: "#/components/responses/Error" } };
const items = (s: Obj, paged = false) => ({ type: "object", required: ["items"], properties: { items: { type: "array", items: s }, ...(paged ? { next: { type: ["string", "null"], description: "Дараагийн хуудасны cursor" } } : {}) } });
const body = (schema: Obj) => ({ required: true, content: { "application/json": { schema } } });
const multipart = (props: Obj) => ({ required: true, content: { "multipart/form-data": { schema: { type: "object", properties: props } } } });
const P = (name: string, inn: "path" | "query" | "header", schema: Obj = { type: "string" }, required = inn === "path", description?: string) => ({ name, in: inn, required, schema, ...(description ? { description } : {}) });
const PAGE = [P("cursor", "query"), P("limit", "query", { type: "integer", minimum: 1, maximum: 200, default: 50 })];
const IDEM = P("Idempotency-Key", "header", { type: "string", maxLength: 100 }, false, "Давтан илгээхэд анхны хариуг буцаана (24 цаг)");

type Op = { summary: string; tags: string[]; security: Obj[]; parameters?: Obj[]; requestBody?: Obj; responses?: Obj; "x-scope"?: string };
const TENANT_SEC = [{ apiKey: [] }, { session: [] }];
const PARTNER_SEC = [{ partnerKey: [] }];
const VISITOR_SEC = [{ visitorToken: [] }];

function op(summary: string, tag: string, scope: string | null, o: Partial<Op> & { ok?: Obj; status?: number } = {}): Op {
  const { ok, status, ...rest } = o;
  const sec = tag === "Partner" ? PARTNER_SEC : tag === "Agent (visitor)" ? VISITOR_SEC : TENANT_SEC;
  return { summary, tags: [tag], security: sec, ...(scope ? { "x-scope": scope } : {}), ...rest, responses: { [String(status ?? 200)]: json(ok ?? { type: "object" }), ...ERR } };
}

export function openapi(origin = "") {
  const paths: Record<string, Obj> = {
    /* ───── Connector (§4.4) ───── */
    "/me": { get: op("Tenant нэр, pos_kind, scopes, capabilities", "Connector", "any", { ok: ref("Me") }) },
    "/products": {
      get: op("Бараа (live: түншийн connector-оос шууд, хадгалахгүй)", "Connector", "connector:read", {
        parameters: [P("search", "query"), P("barcode", "query"), P("updated_since", "query", { type: "string", format: "date-time" }), ...PAGE],
        ok: items(ref("Product"), true),
      }),
      put: op("Бөөнөөр upsert (≤500, extId-аар) — sync горим", "Connector", "connector:write", { parameters: [IDEM], requestBody: body(items(ref("ProductInput"))), ok: ref("UpsertResult") }),
    },
    "/products/{id}": { get: op("Нэг бараа", "Connector", "connector:read", { parameters: [P("id", "path")], ok: ref("Product") }) },
    "/stock": {
      get: op("Үлдэгдэл", "Connector", "connector:read", { parameters: [P("productIds", "query", { type: "string" }, false, "таслалаар")], ok: items(ref("Stock")) }),
      put: op("Үлдэгдлийн түвшин оноох (sync)", "Connector", "connector:write", { parameters: [IDEM], requestBody: body(items(ref("StockInput"))), ok: { type: "object", properties: { updated: { type: "integer" } } } }),
    },
    "/sales": {
      get: op("Борлуулалт (sync)", "Connector", "connector:read", { parameters: [P("from", "query", { type: "string", format: "date-time" }), P("to", "query", { type: "string", format: "date-time" }), ...PAGE], ok: items(ref("Sale"), true) }),
      post: op("Борлуулалт түлхэх (≤500, extId-аар давхардахгүй)", "Connector", "connector:write", {
        parameters: [IDEM],
        requestBody: body(items(ref("SaleInput"))),
        ok: { type: "object", properties: { inserted: { type: "integer" }, duplicates: { type: "integer" } } },
      }),
    },
    "/customers": {
      get: op("Харилцагч (sync; live-д хоосон)", "Connector", "connector:read", { parameters: PAGE, ok: items(ref("Customer"), true) }),
      put: op("Харилцагч upsert (зөвхөн seed/синтетик)", "Connector", "connector:write", { parameters: [IDEM], requestBody: body(items(ref("CustomerInput"))) }),
    },
    "/stock-adjustments": {
      get: op("Батлагдсан тооллогын засвар татах", "Connector", "connector:read", { parameters: [P("status", "query", { enum: ["pending", "applied", "all"], default: "pending" }), ...PAGE], ok: items(ref("Adjustment"), true) }),
    },
    "/stock-adjustments/{id}/ack": { post: op("Засварыг хүлээн авснаа мэдэгдэх", "Connector", "connector:write", { parameters: [P("id", "path"), IDEM], ok: { type: "object", properties: { id: { type: "string" }, status: { const: "applied" }, ackedAt: { type: "string", format: "date-time" } } } }) },
    "/webhooks": {
      get: op("Гарах webhook жагсаалт", "Connector", "connector:write", { ok: items(ref("Webhook")) }),
      post: op("Webhook бүртгэх (secret нэг удаа)", "Connector", "connector:write", {
        parameters: [IDEM],
        requestBody: body({ type: "object", required: ["url"], properties: { url: { type: "string", format: "uri", pattern: "^https://" }, events: { type: "array", items: { enum: ["stock.adjusted", "product.created", "*"] } } } }),
        status: 201,
        ok: { allOf: [ref("Webhook"), { type: "object", properties: { secret: { type: "string" } } }] },
      }),
    },
    "/webhooks/{id}": { delete: op("Webhook устгах", "Connector", "connector:write", { parameters: [P("id", "path")] }) },

    /* ───── Тооллого (§5) ───── */
    "/inventory/sessions": {
      get: op("Тооллогууд", "Inventory", "inventory:count", { parameters: [P("status", "query"), ...PAGE] }),
      post: op("Тооллого үүсгэх", "Inventory", "inventory:count", { parameters: [IDEM], requestBody: body({ type: "object", properties: { name: { type: "string" }, scope: { enum: ["all", "category", "shelf", "products"] }, scopeRef: { type: "string" }, blind: { type: "boolean" } } }), status: 201 }),
    },
    "/inventory/sessions/{id}": {
      get: op("Тооллого", "Inventory", "inventory:count", { parameters: [P("id", "path")] }),
      patch: op("Төлөв солих (submit | cancel | reopen)", "Inventory", "inventory:count", { parameters: [P("id", "path")], requestBody: body({ type: "object", properties: { action: { enum: ["submit", "cancel", "reopen"] } } }) }),
    },
    "/inventory/sessions/{id}/photos": { post: op("Тавиурын зураг → илрүүлэлт (Qwen vision)", "Inventory", "inventory:count", { parameters: [P("id", "path")], requestBody: multipart({ photo: { type: "string", format: "binary" } }) }) },
    "/inventory/sessions/{id}/counts": { post: op("Тоо нэмэх (арга + оролт)", "Inventory", "inventory:count", { parameters: [P("id", "path"), IDEM], requestBody: body({ type: "object", required: ["productId", "method"], properties: { productId: { type: "string" }, method: { type: "string" }, inputs: { type: "object" } } }) }) },
    "/inventory/sessions/{id}/counts/{cid}": { delete: op("Тоог хүчингүй болгох", "Inventory", "inventory:count", { parameters: [P("id", "path"), P("cid", "path")] }) },
    "/inventory/sessions/{id}/variance": { get: op("Зөрүүний тайлан", "Inventory", "inventory:count", { parameters: [P("id", "path")] }) },
    "/inventory/sessions/{id}/approve": { post: op("Батлах → адаптераар засвар (delta)", "Inventory", "inventory:approve", { parameters: [P("id", "path"), IDEM] }) },
    "/inventory/sessions/{id}/reject": { post: op("Татгалзах", "Inventory", "inventory:approve", { parameters: [P("id", "path")] }) },
    "/inventory/products/{id}/profile": {
      get: op("Тоолох профайл", "Inventory", "inventory:count", { parameters: [P("id", "path")] }),
      put: op("Тоолох арга, хайрцагны тоо, нэгж жин", "Inventory", "inventory:count", { parameters: [P("id", "path")], requestBody: body({ type: "object" }) }),
    },
    "/inventory/drafts": { post: op("Зургаар бараа бүртгэх (ноорог)", "Inventory", "inventory:count", { requestBody: multipart({ photo: { type: "string", format: "binary" } }), status: 201 }) },
    "/inventory/drafts/{id}/confirm": { post: op("Ноорог батлах → бараа", "Inventory", "inventory:count", { parameters: [P("id", "path")] }) },
    "/inventory/drafts/{id}": { delete: op("Ноорог устгах", "Inventory", "inventory:count", { parameters: [P("id", "path")] }) },
    "/inventory/photos/{id}": { get: { ...op("Зураг (tenant хавтаснаас)", "Inventory", "inventory:count", { parameters: [P("id", "path")] }), responses: { 200: { description: "image/jpeg", content: { "image/jpeg": {} } }, ...ERR } } },
    "/inventory/reorder": { get: op("Захиалах санал", "Inventory", "inventory:count") },
    "/inventory/gaps": { get: op("Тавиурын цоорхой", "Inventory", "inventory:count") },

    /* ───── Widget / агент ───── */
    "/widget/tokens": { post: op("Widget токен үүсгэх/эргүүлэх", "Widget", "dashboard") },
    "/widget/session": {
      post: { ...op("Зочны (visitor) токен — widget токеноор", "Widget", null, { requestBody: body({ type: "object", required: ["w"], properties: { w: { type: "string" }, channel: { enum: ["web", "voice"] } } }), ok: { type: "object", properties: { token: { type: "string" }, sid: { type: "string" }, exp: { type: "integer" } } } }), security: [] },
    },
    "/agent/chat": { post: op("Харилцагчийн чат", "Agent (visitor)", "agent:customer", { requestBody: body({ type: "object", properties: { text: { type: "string" } } }) }) },
    "/agent/voice": { post: op("Дуудлага (аудио)", "Agent (visitor)", "agent:customer", { requestBody: multipart({ audio: { type: "string", format: "binary" } }) }) },
    "/agent/events": { get: { ...op("SSE урсгал (?token=)", "Agent (visitor)", "agent:customer"), responses: { 200: { description: "text/event-stream", content: { "text/event-stream": {} } }, ...ERR } } },
    "/agent/command": { post: op("Захирлын тушаал", "Agent", "agent:director", { requestBody: body({ type: "object", properties: { text: { type: "string" }, assistant: { type: "string" } } }) }) },
    "/assistants": { get: op("Туслахууд (§10)", "Agent", "dashboard") },
    "/assistants/{id}": { patch: op("Туслах тохируулах", "Agent", "dashboard", { parameters: [P("id", "path")], requestBody: body({ type: "object" }) }) },

    /* ───── Хэрэглээ (§7), нууцлал (§4B) ───── */
    "/usage": { get: op("Хэрэглээний хэмжүүр", "Usage", "usage:read", { parameters: [P("days", "query", { type: "integer", default: 30, minimum: 7, maximum: 90 })], ok: ref("Usage") }) },
    "/branding": { get: op("Түншийн брэнд (embed, widget)", "Embed", "any", { ok: ref("Brand") }) },
    "/embed/exchange": { post: { ...op("Embed токен → session cookie (/connect)", "Embed", null, { requestBody: body({ type: "object", required: ["token"], properties: { token: { type: "string", pattern: "^get_" } } }) }), security: [] } },
    "/onboarding/terms": { post: op("Үйлчилгээний нөхцөл зөвшөөрөх (owner)", "Embed", "billing", { requestBody: body({ type: "object", required: ["accept"], properties: { accept: { const: true } } }) }) },
    "/privacy": { get: op("Өгөгдөл ба нууцлал — горим, тоо, хугацаа, хандалтын түүх", "Privacy", "dashboard") },
    "/privacy/export": { post: op("Экспорт (owner) → нэг удаагийн 15 мин холбоос", "Privacy", "dashboard") },
    "/privacy/consent": { put: op("Түншид экспорт хийхийг зөвшөөрөх", "Privacy", "dashboard", { requestBody: body({ type: "object", properties: { exportToPartner: { type: "boolean" } } }) }) },
    "/privacy/retention": { put: op("Хадгалах хугацааг богиносгох", "Privacy", "dashboard", { requestBody: body(ref("Retention")) }) },
    "/privacy/delete": { post: op("Бүх өгөгдлийг бүрмөсөн устгах (owner, нэрээр баталгаажуулна)", "Privacy", "dashboard", { requestBody: body({ type: "object", required: ["confirm"], properties: { confirm: { type: "string" } } }) }) },
    "/exports/{token}": { get: { ...op("Экспорт татах (нэг удаа)", "Privacy", null, { parameters: [P("token", "path")] }), security: [] } },

    /* ───── Partner (§4A.3) ───── */
    "/partner/me": { get: op("Түншийн нэр, брэнд, tenant-ын тоо, sandbox", "Partner", "partner:manage") },
    "/partner/tenants": {
      get: op("Tenant жагсаалт", "Partner", "partner:manage", { parameters: [P("status", "query", { enum: ["pending_terms", "active", "suspended"] }), ...PAGE], ok: items(ref("PartnerTenant"), true) }),
      post: op("Tenant үүсгэх (extMerchantId-аар idempotent)", "Partner", "partner:manage", {
        requestBody: body({ type: "object", required: ["extMerchantId", "name"], properties: { extMerchantId: { type: "string" }, name: { type: "string" }, regNo: { type: "string" } } }),
        status: 201,
        ok: { type: "object", properties: { tenantId: { type: "string" }, status: { type: "string" }, posKind: { type: "string" }, created: { type: "boolean" }, connectorKey: { type: "string", description: "sync горимд, нэг удаа" } } },
      }),
    },
    "/partner/tenants/{id}": { get: op("Tenant төлөв", "Partner", "partner:manage", { parameters: [P("id", "path")], ok: ref("PartnerTenant") }) },
    "/partner/tenants/{id}/suspend": { post: op("Түдгэлзүүлэх", "Partner", "partner:manage", { parameters: [P("id", "path")] }) },
    "/partner/tenants/{id}/resume": { post: op("Сэргээх", "Partner", "partner:manage", { parameters: [P("id", "path")] }) },
    "/partner/tenants/{id}/keys": {
      post: op("Tenant-ын connector түлхүүр (connector:read|write, inventory:count)", "Partner", "partner:manage", {
        parameters: [P("id", "path")],
        requestBody: body({ type: "object", required: ["scopes"], properties: { label: { type: "string" }, scopes: { type: "array", items: { enum: ["connector:read", "connector:write", "inventory:count"] } } } }),
        status: 201,
        ok: { type: "object", properties: { key: { type: "string" }, prefix: { type: "string" }, scopes: { type: "array", items: { type: "string" } } } },
      }),
    },
    "/partner/tenants/{id}/keys/{prefix}": { delete: op("Түлхүүр хүчингүй болгох", "Partner", "partner:manage", { parameters: [P("id", "path"), P("prefix", "path")] }) },
    "/partner/tenants/{id}/embed-token": {
      post: op("5 минутын нэг удаагийн embed токен + url", "Partner", "partner:manage", {
        parameters: [P("id", "path")],
        requestBody: body({ type: "object", required: ["user"], properties: { user: { type: "object", required: ["id", "role"], properties: { id: { type: "string" }, name: { type: "string" }, role: { enum: ["owner", "manager", "staff"] } } }, view: { enum: ["onboarding", "dashboard", "billing", "count"] } } }),
        status: 201,
        ok: { type: "object", properties: { token: { type: "string" }, url: { type: "string" }, expiresAt: { type: "string", format: "date-time" } } },
      }),
    },
    "/partner/tenants/{id}/export": { post: op("Экспорт (мерчант зөвшөөрсөн үед л; үгүй бол 403 consent_required)", "Partner", "partner:manage", { parameters: [P("id", "path")] }) },
    "/partner/tenants/{id}/data": { delete: op("Бүрэн устгалт (крипто-устгалт) — тоонуудын гэрчилгээ", "Partner", "partner:manage", { parameters: [P("id", "path")] }) },
    "/partner/usage": { get: op("Tenant бүрийн тоон нийлбэр", "Partner", "partner:manage", { parameters: [P("days", "query", { type: "integer", default: 30 })] }) },
    "/partner/access-log": { get: op("Хандалтын лог (агуулгагүй)", "Partner", "partner:manage", { parameters: [P("tenant", "query"), P("since", "query", { type: "string", format: "date-time" }), P("limit", "query", { type: "integer" })] }) },
    "/partner/branding": { put: op("White-label: нэр, лого, өнгө, frameOrigins", "Partner", "partner:manage", { requestBody: body(ref("Brand")) }) },
    "/partner/connector": { put: op("Түншийн connector (live | sync) → secret нэг удаа", "Partner", "partner:manage", { requestBody: body({ type: "object", required: ["url"], properties: { url: { type: "string", format: "uri" }, mode: { enum: ["live", "sync"], default: "live" } } }) }) },
    "/partner/connector/test": { post: op("Гарын үсэгтэй GET /health + products?limit=1", "Partner", "partner:manage") },
    "/partner/webhook": { put: op("Нэг webhook, бүх tenant-ын үйл явдал → secret нэг удаа", "Partner", "partner:manage", { requestBody: body({ type: "object", required: ["url"], properties: { url: { type: "string" }, events: { type: "array", items: { enum: ["stock.adjusted", "product.created", "tenant.activated", "tenant.suspended", "wallet.low", "wallet.empty"] } } } }) }) },
    "/partner/webhook/test": { post: op("Туршилтын үйл явдал илгээх", "Partner", "partner:manage") },
    "/partner/retention": { put: op("Хадгалах хугацааны бодлого", "Partner", "partner:manage", { requestBody: body(ref("Retention")) }) },
    "/partner/tenants/{id}/topup": { post: { ...op("Түншийн хэтэвчнээс tenant руу кредит (дараа)", "Partner", "partner:manage", { parameters: [P("id", "path")] }), responses: { 501: { $ref: "#/components/responses/Error" } }, "x-status": "planned" } },
  };

  const str = { type: "string" };
  const int = { type: "integer" };
  const schemas: Record<string, Obj> = {
    Error: { type: "object", required: ["error"], properties: { error: { type: "object", required: ["code", "message"], properties: { code: str, message: str } } } },
    Me: { type: "object", properties: { tenant: { type: "object", properties: { id: str, name: str, posKind: { enum: ["gepos", "connector", "live"] }, status: str } }, principal: str, scopes: { type: "array", items: str }, capabilities: { type: "object" } } },
    Product: {
      type: "object",
      required: ["id", "name", "barcodes", "unit", "price", "active", "updatedAt"],
      properties: { id: str, extId: str, sku: str, barcodes: { type: "array", items: str }, name: str, brand: str, category: str, unit: { enum: ["pcs", "kg", "l", "pack"] }, price: { type: "integer", description: "₮ бүхэл" }, cost: int, active: { type: "boolean" }, imageUrl: str, taxCode: { type: "string", description: "БҮНА" }, updatedAt: { type: "string", format: "date-time" } },
    },
    ProductInput: { type: "object", required: ["extId", "name", "price"], properties: { extId: str, sku: str, barcodes: { type: "array", items: str }, name: str, brand: str, category: str, unit: { enum: ["pcs", "kg", "l", "pack"] }, price: int, cost: int, active: { type: "boolean" }, imageUrl: str, taxCode: str } },
    UpsertResult: { type: "object", properties: { upserted: int, created: int, items: { type: "array", items: { type: "object", properties: { extId: str, id: str, created: { type: "boolean" } } } } } },
    Stock: { type: "object", properties: { productId: str, location: str, qty: { type: "number" }, minQty: { type: "number" }, updatedAt: { type: "string", format: "date-time" } } },
    StockInput: { type: "object", required: ["qty"], properties: { productId: str, extId: str, location: str, qty: { type: "number" }, minQty: { type: "number" } } },
    SaleLine: { type: "object", required: ["name", "qty", "unitPrice"], properties: { productId: str, name: str, qty: { type: "number" }, unitPrice: int } },
    Sale: { type: "object", properties: { id: str, extId: str, at: { type: "string", format: "date-time" }, channel: { enum: ["pos", "delivery", "online"] }, lines: { type: "array", items: ref("SaleLine") }, total: int, method: { enum: ["cash", "card", "qr", "other"] }, customerId: str, status: { enum: ["completed", "refunded"] } } },
    SaleInput: { type: "object", required: ["extId", "at", "lines"], properties: { extId: str, at: { type: "string", format: "date-time" }, channel: { enum: ["pos", "delivery", "online"] }, lines: { type: "array", items: ref("SaleLine") }, total: int, method: { enum: ["cash", "card", "qr", "other"] }, customerId: str, status: { enum: ["completed", "refunded"] } } },
    Customer: { type: "object", properties: { id: str, extId: str, phone: str, name: str, optIn: { type: "boolean" }, points: int } },
    CustomerInput: { type: "object", required: ["extId"], properties: { extId: str, phone: str, name: str, optIn: { type: "boolean" }, points: int } },
    Adjustment: { type: "object", properties: { id: str, productId: str, extId: str, delta: { type: "number" }, reason: { enum: ["count", "damage", "expiry", "manual"] }, ref: str, by: str, status: { enum: ["pending", "applied"] }, at: { type: "string", format: "date-time" }, ackedAt: { type: ["string", "null"], format: "date-time" } } },
    Webhook: { type: "object", properties: { id: str, url: str, events: { type: "array", items: str }, active: { type: "boolean" } } },
    PartnerTenant: { type: "object", properties: { tenantId: str, extMerchantId: str, name: str, status: { enum: ["pending_terms", "active", "suspended"] }, posKind: str, plan: { type: ["string", "null"] }, credits: int, expiresAt: { type: ["string", "null"] }, termsAcceptedAt: { type: ["string", "null"] }, createdAt: str, lastActiveAt: { type: ["string", "null"] } } },
    Brand: { type: "object", properties: { name: str, logoUrl: { type: "string", pattern: "^https://" }, color: { type: "string", pattern: "^#[0-9A-Fa-f]{6}$" }, frameOrigins: { type: "array", items: str } } },
    Retention: { type: "object", properties: { transcriptsDays: int, contactsDays: int, actionsDays: int, photos: { oneOf: [{ const: "on_approve" }, int] } } },
    Usage: {
      type: "object",
      properties: {
        wallet: { type: "object", properties: { credits: int, plan: { type: ["string", "null"] }, expiresAt: { type: ["string", "null"] } } },
        cycle: { type: "object", properties: { startedAt: { type: ["string", "null"] }, granted: int, spent: int, pctLeft: { type: "number" } } },
        burn: { type: "object", properties: { perDay7: { type: "number" }, perDay30: { type: "number" }, trend: { type: ["number", "null"] } } },
        runway: { type: "object", properties: { daysLeft: { type: ["number", "null"] }, emptyOn: { type: ["string", "null"] }, expiresInDays: { type: ["number", "null"] }, status: { enum: ["ok", "low", "critical", "expiring_unused", "empty"] }, dailyAllowance: { type: ["number", "null"] } } },
        daily: { type: "array", items: { type: "object", properties: { day: str, web: int, fb: int, voice: int, director: int, mcp: int, inventory: int } } },
        byChannel: { type: "array", items: { type: "object", properties: { channel: str, credits: int, pct: { type: "number" }, events: int } } },
        byFeature: { type: "array", items: { type: "object", properties: { feature: str, credits: int, pct: { type: "number" }, events: int, unitCost: { type: "number" } } } },
        byAssistant: { type: "array", items: { type: "object", properties: { assistant: str, credits: int } } },
        tokens: { type: "array", items: { type: "object", properties: { model: str, in: int, out: int, calls: int } } },
        value: { type: "object", properties: { conversations: int, aiResolvedPct: { type: ["number", "null"] }, creditsPerConversation: { type: ["number", "null"] }, tugrikPerConversation: { type: ["integer", "null"] } } },
      },
    },
  };

  return {
    openapi: "3.1.0",
    info: {
      title: "Gerege AI — Connector & Partner API",
      version: "1.0.0",
      description:
        "Нийтлэг: `Authorization: Bearer gai_…` (tenant) эсвэл session cookie · `gpk_…` зөвхөн /partner/** · JSON ≤1МБ · бичих хүсэлтэд `Idempotency-Key` · " +
        "`?cursor=&limit=` (≤200) · алдаа `{error:{code,message}}` · цаг ISO-8601 UTC · мөнгө ₮ бүхэл · түлхүүр бүрт 600 хүсэлт/мин. Эвдэх өөрчлөлт зөвхөн /api/v2. " +
        "Түншийн талын connector-ийн гэрээ: docs/partner-connector-openapi.yaml.",
    },
    servers: [{ url: `${origin}/api/v1` }],
    tags: ["Connector", "Inventory", "Widget", "Agent", "Agent (visitor)", "Usage", "Embed", "Privacy", "Partner"].map((name) => ({ name })),
    paths,
    components: {
      securitySchemes: {
        apiKey: { type: "http", scheme: "bearer", description: "Tenant API key `gai_…` (scopes: connector:read|write, inventory:count, usage:read, mcp)" },
        session: { type: "apiKey", in: "cookie", name: "gp_s" },
        partnerKey: { type: "http", scheme: "bearer", description: "Partner key `gpk_…` — зөвхөн /partner/**" },
        visitorToken: { type: "http", scheme: "bearer", description: "Зочны токен `gvs_…` (SSE-д ?token=)" },
      },
      responses: { Error: json(ref("Error"), "Алдаа") },
      schemas,
    },
  };
}
