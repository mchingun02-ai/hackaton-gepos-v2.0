/**
 * Агуулгын шифрлэлтийн нимгэн давхарга (docs/ARCHITECTURE.md §4B.3) — kb.ts, crm.ts энэ хоёрыг л дуудна.
 * Жинхэнэ шифрлэлт: src/lib/tenant/crypto.ts (tenant DEK, AES-256-GCM, AAD = tenant|ref).
 * ref = "table|column|row_id" — шифр текстийг өөр мөр/tenant руу зөөвөл тайлагдахгүй.
 * Шифрлээгүй хуучин утгыг уншихад өөрчлөлтгүй буцаана (шилжилтийн үе) — migrateContent() дараа нь шифрлэнэ.
 */
import { decS, encS } from "@/lib/tenant/crypto";
import type { TenantContext } from "@/lib/tenant/context";

type Cx = Pick<TenantContext, "tenantId" | "db">;

export const isSealedText = (s: unknown): s is string => typeof s === "string" && s.startsWith("e1.");

/** Текст → "e1.…" (null/undefined → null) */
export function sealT(ctx: Cx, text: string, ref: string): string;
export function sealT(ctx: Cx, text: string | null | undefined, ref: string): string | null;
export function sealT(ctx: Cx, text: string | null | undefined, ref: string): string | null {
  if (text == null) return null;
  return encS(ctx, String(text), ref);
}

/** "e1.…" → текст. Шифрлээгүй (хуучин) утга хэвээр; тайлж чадахгүй бол хоосон мөр (өөр мөрийн шифр г.м). */
export function openT(ctx: Cx, box: unknown, ref: string): string;
export function openT(ctx: Cx, box: unknown, ref: string, keepNull: true): string | null;
export function openT(ctx: Cx, box: unknown, ref: string, keepNull?: boolean): string | null {
  if (box == null) return keepNull ? null : "";
  const s = typeof box === "string" ? box : String(box);
  if (!isSealedText(s)) return s;
  try {
    return decS(ctx, s, ref);
  } catch {
    return "";
  }
}

/** ref угсрах */
export const ref = (table: string, column: string, id: string) => `${table}|${column}|${id}`;
