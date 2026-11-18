/**
 * Агуулгагүй лог (docs/ARCHITECTURE.md §4B.5). Зөвхөн зөвшөөрөгдсөн түлхүүрүүд гарна — бусдыг хаяна.
 * Утга нь мөр бол 80 тэмдэгтээр тайрч, зөвхөн [A-Za-z0-9_.:-] үлдээнэ (мессеж, барааны нэр, утас алдагдахгүй).
 *   log("connector.fetch", { requestId, tenant, kind: "products", count: 37, ms: 120 })
 *   logError("agent", e, { requestId })  → errorClass = алдааны классын нэр (мессеж БИШ)
 */
const ALLOWED = new Set([
  "requestId",
  "tenant",
  "partner",
  "kind",
  "tool",
  "status",
  "ms",
  "count",
  "credits",
  "tokensIn",
  "tokensOut",
  "errorClass",
  "event",
  "delivery",
  "attempt",
]);

export type LogFields = Partial<Record<string, string | number | boolean | null | undefined>>;

const clean = (v: unknown) => {
  if (typeof v === "number" || typeof v === "boolean" || v === null) return v;
  if (typeof v === "string") return v.replace(/[^A-Za-z0-9_.:-]/g, "").slice(0, 80);
  return undefined;
};

/** Зөвшөөрөгдсөн талбаруудаас бүрдсэн JSON мөр (тестэд шалгахад export) */
export function logLine(event: string, fields: LogFields = {}): string {
  const out: Record<string, unknown> = { at: new Date().toISOString(), ev: clean(event) };
  for (const [k, v] of Object.entries(fields)) {
    if (!ALLOWED.has(k)) continue;
    const c = clean(v);
    if (c !== undefined) out[k] = c;
  }
  return JSON.stringify(out);
}

export function log(event: string, fields: LogFields = {}) {
  process.stdout.write(logLine(event, fields) + "\n");
}

/** Алдаа: зөвхөн классын нэр (мессеж нь хэрэглэгчийн өгөгдөл агуулж болзошгүй) */
export function logError(event: string, e: unknown, fields: LogFields = {}) {
  const errorClass = e instanceof Error ? e.constructor.name || "Error" : typeof e;
  process.stderr.write(logLine(event, { ...fields, errorClass, status: fields.status ?? "error" }) + "\n");
}
