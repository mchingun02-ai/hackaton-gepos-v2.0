/** Tenant-ын харагдах брэнд (§4A.4): түншийн нэр, лого, өнгө — тодролын харьцаа < 4.5 бол анхдагч #0046E2. */
import { brandOfPartnerRow } from "@/lib/partner/settings";
import type { TenantContext } from "@/lib/tenant/context";

export type TenantBrand = { partner: boolean; name: string | null; logoUrl: string | null; color: string; poweredBy: string };

export function brandOf(ctx: Pick<TenantContext, "db">): TenantBrand {
  const r = ctx.db.one<{ brand: string | null; pname: string | null; pid: string | null }>(
    `SELECT p.brand AS brand, p.name AS pname, p.id AS pid FROM tenants t LEFT JOIN partners p ON p.id = t.partner_id WHERE t.id = :tenant`,
  );
  if (!r?.pid) return { partner: false, name: null, logoUrl: null, color: "#0046E2", poweredBy: "Gerege AI" };
  return { partner: true, ...brandOfPartnerRow(r.brand, r.pname), poweredBy: "Gerege AI-аар ажилладаг" };
}
