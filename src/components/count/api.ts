"use client";

/**
 * Тооллогын PWA-ийн API дуудлага + офлайн дараалал.
 * Тоо илгээх үед сүлжээ тасарвал localStorage-д хадгалж, сэргэхэд дахин илгээнэ.
 * Давхардлаас клиентийн uuid (clientId = Idempotency-Key) хамгаална.
 */

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string,
  ) {
    super(message);
  }
}

export const AUTH_LOST = "gp:count-auth";

export async function call<T = Record<string, unknown>>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const headers: Record<string, string> = { ...(init.headers as Record<string, string>) };
  let body = init.body;
  if (init.json !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(init.json);
  }
  let r: Response;
  try {
    r = await fetch(path, { ...init, body, headers, cache: "no-store", credentials: "same-origin" });
  } catch {
    throw new ApiError("Сүлжээ тасарсан байна. Интернэтээ шалгаад дахин оролдоно уу.", 0, "offline");
  }
  const j = (await r.json().catch(() => ({}))) as { error?: string; code?: string };
  if (r.status === 401 && typeof window !== "undefined") window.dispatchEvent(new Event(AUTH_LOST));
  if (!r.ok) throw new ApiError(j.error || `Алдаа гарлаа (${r.status})`, r.status, j.code);
  return j as T;
}

/** HTTPS биш (LAN) орчинд crypto.randomUUID байхгүй тул нөөц арга */
export function uuid(): string {
  const c = typeof crypto !== "undefined" ? crypto : undefined;
  if (c?.randomUUID) return c.randomUUID();
  const b = new Uint8Array(16);
  if (c?.getRandomValues) c.getRandomValues(b);
  else for (let i = 0; i < 16; i++) b[i] = Math.floor(Math.random() * 256);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/* ───────── офлайн дараалал ───────── */

const QKEY = "gp-count-queue-v1";
export const QUEUE_EVENT = "gp:count-queue";
export type QueuedCount = { sid: string; body: Record<string, unknown> & { clientId: string }; at: number; tries: number; label?: string };

function readQ(): QueuedCount[] {
  try {
    const v = JSON.parse(localStorage.getItem(QKEY) || "[]") as unknown;
    return Array.isArray(v) ? (v as QueuedCount[]) : [];
  } catch {
    return [];
  }
}
function writeQ(q: QueuedCount[]) {
  try {
    localStorage.setItem(QKEY, JSON.stringify(q.slice(-500)));
  } catch {
    /* дүүрсэн */
  }
  window.dispatchEvent(new Event(QUEUE_EVENT));
}
export const queued = () => (typeof window === "undefined" ? [] : readQ());

export type CountResp = { duplicate: boolean; count: { id: string; qty: number; warning?: string | null }; line: unknown };

/**
 * Тоо илгээх. Сүлжээ/сервер (5xx) алдаанд дараалалд хийж { queued: true } буцаана.
 * 4xx (буруу оролт, хаагдсан тооллого) — шууд алдаа.
 */
export async function sendCount(sid: string, body: Record<string, unknown> & { clientId: string }, label?: string): Promise<{ queued: true } | { queued: false; data: CountResp }> {
  try {
    const data = await call<CountResp>(`/api/v1/inventory/sessions/${encodeURIComponent(sid)}/counts`, { method: "POST", json: body, headers: { "Idempotency-Key": body.clientId } });
    return { queued: false, data };
  } catch (e) {
    if (e instanceof ApiError && (e.status === 0 || e.status >= 500 || e.status === 429)) {
      const q = readQ().filter((x) => x.body.clientId !== body.clientId);
      q.push({ sid, body, at: Date.now(), tries: 0, label });
      writeQ(q);
      return { queued: true };
    }
    throw e;
  }
}

let flushing = false;
/** Дарааллыг дарааллаар нь илгээнэ. Буцаах: { sent, failed: [мессеж] } */
export async function flushQueue(): Promise<{ sent: number; failed: string[] }> {
  if (flushing || typeof window === "undefined") return { sent: 0, failed: [] };
  flushing = true;
  let sent = 0;
  const failed: string[] = [];
  try {
    for (const item of readQ()) {
      try {
        await call(`/api/v1/inventory/sessions/${encodeURIComponent(item.sid)}/counts`, { method: "POST", json: item.body, headers: { "Idempotency-Key": item.body.clientId } });
        writeQ(readQ().filter((x) => x.body.clientId !== item.body.clientId));
        sent++;
      } catch (e) {
        if (e instanceof ApiError && (e.status === 0 || e.status >= 500 || e.status === 429)) {
          writeQ(readQ().map((x) => (x.body.clientId === item.body.clientId ? { ...x, tries: x.tries + 1 } : x)));
          break; // сүлжээ сэргээгүй — дараа
        }
        if (e instanceof ApiError && e.status === 401) break;
        // буцаах боломжгүй алдаа (хаагдсан тооллого г.м) — хаяж, хэрэглэгчид мэдэгдэнэ
        writeQ(readQ().filter((x) => x.body.clientId !== item.body.clientId));
        failed.push(`${item.label ?? "Тоо"}: ${e instanceof Error ? e.message : "алдаа"}`);
      }
    }
  } finally {
    flushing = false;
  }
  return { sent, failed };
}
