/**
 * Түншийн брэнд (white-label, §4A) — tenant-ын түншийн нэр, лого, өнгө.
 * Зөвхөн харагдах мэдээлэл; tenant-ын өгөгдөлд хамааралгүй тул raw хайлтаар tenants.partner_id → partners.brand.
 */
import { rawOne } from "./raw";

export type TenantBrand = { name?: string; logoUrl?: string; color?: string } | null;

export function tenantBrand(tenantId: string): TenantBrand {
  const r = rawOne<{ brand: string | null }>(`SELECT p.brand FROM tenants t JOIN partners p ON p.id = t.partner_id WHERE t.id = ?`, tenantId);
  if (!r?.brand) return null;
  try {
    const b = JSON.parse(r.brand) as { name?: string; logoUrl?: string; color?: string };
    const color = typeof b.color === "string" && /^#[0-9a-f]{6}$/i.test(b.color) ? b.color : undefined;
    const logoUrl = typeof b.logoUrl === "string" && /^https:\/\//.test(b.logoUrl) ? b.logoUrl : undefined;
    return { name: b.name?.slice(0, 60), logoUrl, color };
  } catch {
    return null;
  }
}
