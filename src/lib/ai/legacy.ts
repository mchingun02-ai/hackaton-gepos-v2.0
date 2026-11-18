/**
 * Хуучин Gemini/Google туслах (`/api/ai/*`, портал «AI туслах») — хакатоны үзүүлэнд УНТРААЛТТАЙ (docs/ARCHITECTURE.md §12:
 * realtime inference зөвхөн Qwen). `AI_LEGACY_ASSISTANT=on` үед л ажиллана; бусад үед route-ууд 404.
 * Порталын цэс: `NEXT_PUBLIC_AI_LEGACY_ASSISTANT=on` (клиентэд build үед орно).
 */
import { HttpError } from "@/lib/tenant/http";

export const legacyOn = () => process.env.AI_LEGACY_ASSISTANT === "on";

/** Route handler-ийн эхэнд: унтраалттай бол 404 (оршин байгааг ч хэлэхгүй) */
export function legacyGuard() {
  if (!legacyOn()) throw new HttpError(404, "Not found");
}

export const legacyNotFound = () => new Response("Not found", { status: 404 });
