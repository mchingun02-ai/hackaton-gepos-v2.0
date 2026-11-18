/**
 * HTTP-ийн нийтлэг туслахууд (route handler, tenant/auth): алдааны класс, хязгаарлалт, IP.
 * Энд бусад модулиас импорт хийхгүй — хүрээлсэн импорт (cycle) үүсэхгүй.
 */

export class HttpError extends Error {
  status: number;
  /** машинд уншигдах код (ж: "puk") — клиент UI-г сонгоно */
  code?: string;
  constructor(status: number, message: string, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export const fail = (status: number, message: string, code?: string): never => {
  throw new HttpError(status, message, code);
};

/** HttpError → JSON хариу */
export const errorResponse = (e: HttpError) => Response.json(e.code ? { error: e.message, code: e.code } : { error: e.message }, { status: e.status });

/** Энгийн хязгаарлалт: түлхүүр бүрт windowMs-д n удаа (процессын санах ойд — нэг инстанс) */
const gl = globalThis as unknown as { __aiRate?: Map<string, number[]> };
export function rate(key: string, n = 20, windowMs = 60_000) {
  const m = (gl.__aiRate ??= new Map<string, number[]>());
  const now = Date.now();
  const l = (m.get(key) ?? []).filter((t: number) => now - t < windowMs);
  if (l.length >= n) fail(429, "Хэт олон хүсэлт. Түр хүлээгээд дахин оролдоно уу.");
  l.push(now);
  m.set(key, l);
}

export const ipOf = (req: Request) => req.headers.get("x-forwarded-for")?.split(",")[0].trim() || req.headers.get("x-real-ip") || "local";

/** HTTPS-ээр ирсэн эсэх (reverse proxy-ийн ард ч) — cookie-ийн Secure тугт */
export const isHttps = (req: Request) => {
  try {
    if (new URL(req.url).protocol === "https:") return true;
  } catch {
    /* харьцангуй url */
  }
  return (req.headers.get("x-forwarded-proto") || "").split(",")[0].trim() === "https";
};

/** Cookie толгойноос нэг утга */
export function cookieOf(req: Request, name: string): string | null {
  const h = req.headers.get("cookie");
  if (!h) return null;
  for (const part of h.split(";")) {
    const i = part.indexOf("=");
    if (i < 0) continue;
    if (part.slice(0, i).trim() === name) {
      try {
        return decodeURIComponent(part.slice(i + 1).trim());
      } catch {
        return null;
      }
    }
  }
  return null;
}
