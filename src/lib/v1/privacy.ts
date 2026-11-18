/**
 * «Өгөгдөл ба нууцлал» хуудасны өгөгдөл (§4B.5): холболтын горим, юу хадгалагдаж буй (ангилал тус бүрийн ТОО),
 * хадгалах хугацаа, шифрлэлт, гуравдагч боловсруулагч, хандалтын түүх (агуулгагүй).
 */
import { tenantAccessLog } from "@/lib/tenant/access";
import type { TenantContext } from "@/lib/tenant/context";
import { hasTenantKey } from "@/lib/tenant/crypto";
import { retentionFor } from "@/lib/tenant/retention";

const COUNT_TABLES = [
  ["conversations", "Яриа"],
  ["messages", "Мессеж"],
  ["contacts", "Харилцагчийн карт"],
  ["tickets", "Хүсэлт, гомдол"],
  ["actions", "AI-ийн үйлдлийн аудит"],
  ["kb_docs", "Мэдлэгийн сангийн баримт"],
  ["kb_chunks", "Мэдлэгийн сангийн хэсэг (embedding)"],
  ["inv_photos", "Тооллогын зураг"],
  ["inv_sessions", "Тооллого"],
  ["c_products", "Каталогийн хуулбар (sync)"],
  ["c_stock", "Үлдэгдлийн хуулбар (sync)"],
  ["c_sales", "Борлуулалтын хуулбар (sync)"],
  ["c_customers", "ПОС-ын харилцагч (sync)"],
  ["invoices", "Нэхэмжлэх"],
  ["usage", "Хэрэглээний бүртгэл (тоо)"],
] as const;

export const PROCESSORS = [
  { name: "Alibaba Cloud Model Studio (Qwen)", role: "AI дүгнэлт — prompt дамжина, Gerege хадгалахгүй", via: "TokenHub gateway (prompt лог унтраалттай байх шаардлага)" },
  { name: "QPay (sandbox)", role: "Төлбөр — зөвхөн нэхэмжлэхийн дүн", via: "merchant-sandbox.qpay.mn" },
];

export function privacySummary(ctx: TenantContext) {
  const t = ctx.db.one<{ name: string; pos_kind: string; partner_id: string | null; pname: string | null; export_consent_at: number | null; terms_at: number | null }>(
    `SELECT t.name, t.pos_kind, t.partner_id, p.name AS pname, t.export_consent_at, t.terms_at FROM tenants t LEFT JOIN partners p ON p.id = t.partner_id WHERE t.id = :tenant`,
  )!;
  const stored = COUNT_TABLES.map(([table, label]) => {
    let n = 0;
    try {
      n = ctx.db.one<{ n: number }>(`SELECT COUNT(*) AS n FROM ${table} WHERE merchant = :tenant`)?.n ?? 0;
    } catch {
      n = 0;
    }
    return { table, label, count: n };
  });
  const { source, ...retention } = retentionFor(ctx.tenantId);
  const sessions = ctx.db.all<{ via: string | null; n: number }>(`SELECT COALESCE(via, 'login') AS via, COUNT(*) AS n FROM sessions WHERE merchant = :tenant AND expires_at > ? GROUP BY via`, Date.now());
  return {
    tenant: { name: t.name, posKind: t.pos_kind, partner: t.partner_id ? { name: t.pname } : null, termsAcceptedAt: t.terms_at ? new Date(t.terms_at).toISOString() : null },
    mode: t.pos_kind === "live" ? "live" : t.pos_kind === "connector" ? "sync" : "gepos",
    catalogCopied: t.pos_kind === "connector",
    encryption: { perTenantKey: hasTenantKey(ctx.tenantId), algorithm: "AES-256-GCM", kek: "серверийн орчны хувьсагч (DB-д байхгүй)" },
    stored,
    retention,
    retentionSource: source,
    exportToPartner: !!t.export_consent_at,
    processors: PROCESSORS,
    activeSessions: sessions.map((s) => ({ via: s.via?.startsWith("partner:") ? "partner" : s.via, count: s.n })),
    accessLog: tenantAccessLog(ctx, 50).map((a) => ({ ...a, at: new Date(a.at).toISOString() })),
  };
}
