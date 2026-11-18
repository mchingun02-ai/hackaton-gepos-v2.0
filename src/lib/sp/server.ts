/**
 * Store Plus-ын төлөв сервер дээр (SQLite). AI ажилтан, MCP сервер, API энэ замаар
 * бараа, захиалга, харилцагч, урамшууллыг бодитоор өөрчилнө. Өөрчлөлт бүр rev-ийг нэмж,
 * нээлттэй бүх дэлгэц рүү (SSE) түгнэ. Бүх функц түрээслэгчийн контекстээр (`ctx.db`, `:tenant`).
 */
import { emit } from "@/lib/agent/db";
import type { TenantContext } from "@/lib/tenant/context";
import { freshState, getSpBackend, normalize, setSpBackend } from "./core";
import type { SpState } from "./types";

/** Store Plus-д хэрэгтэй хэсэг (адаптер бүтэн ctx-гүйгээр дуудна) */
export type SpCtx = Pick<TenantContext, "tenantId" | "db">;

export function readSp(ctx: SpCtx): { rev: number; state: SpState } | null {
  const r = ctx.db.one<{ rev: number; json: string }>(`SELECT rev, json FROM sp_state WHERE merchant = :tenant`);
  return r ? { rev: r.rev, state: JSON.parse(r.json) as SpState } : null;
}

function save(ctx: SpCtx, rev: number, state: SpState) {
  ctx.db.run(
    `INSERT INTO sp_state (merchant, rev, json, updated_at) VALUES (:tenant, ?, ?, ?)
     ON CONFLICT(merchant) DO UPDATE SET rev = excluded.rev, json = excluded.json, updated_at = excluded.updated_at`,
    rev,
    JSON.stringify(state),
    Date.now(),
  );
  emit(ctx.tenantId, { type: "sp", rev });
}

/** Клиентээс ирсэн бүтэн төлөв. base нь серверийнхтэй таарахгүй бол null (409). */
export function writeSp(ctx: SpCtx, base: number, state: SpState): number | null {
  const cur = readSp(ctx);
  if (cur && cur.rev !== base) return null;
  const rev = (cur?.rev ?? 0) + 1;
  save(ctx, rev, state);
  return rev;
}

/**
 * Серверийн тал дээр Store Plus-ын үйлдэл (core.ts) ажиллуулна. fn СИНХРОН байх ёстой —
 * Node нэг урсгалтай тул хооронд нь өөр хүсэлт орохгүй. Promise буцаавал шиднэ (хүсэлтүүд холилдохоос
 * сэргийлнэ). Дууссаны дараа backend-ийг сэргээнэ — `withSp`-ээс гадуур core дуудвал SpError.
 */
export function withSp<T>(ctx: SpCtx, fn: (get: () => SpState) => T): T {
  const cur = readSp(ctx);
  let s = cur ? normalize(cur.state) : freshState();
  let changed = !cur;
  const prev = getSpBackend();
  setSpBackend({
    get: () => s,
    set: (next) => {
      s = next;
      changed = true;
    },
  });
  try {
    const out = fn(() => s);
    if (out && typeof (out as { then?: unknown }).then === "function") throw new Error("withSp: callback синхрон байх ёстой (Promise буцаалаа)");
    if (changed) save(ctx, (cur?.rev ?? 0) + 1, s);
    return out;
  } finally {
    setSpBackend(prev);
  }
}

/** Зөвхөн унших */
export const spNow = (ctx: SpCtx): SpState => {
  const cur = readSp(ctx);
  return cur ? normalize(cur.state) : withSp(ctx, (g) => g());
};
