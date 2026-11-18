/**
 * Тоолох аргууд (docs/ARCHITECTURE.md §5.4) — цэвэр функц, нэгж тесттэй.
 *
 *   facings  q = f × d × r + l     (f нүүрэн тал, d гүн, r давхар, l сул)
 *   boxes    q = b × pack + l
 *   weight   ширхэг: q = round((g − tare) / unit_g) · кг: q = (g − tare) / 1000
 *   stack    q = floor(h / thickness) × s
 *   manual   q
 */

export type Method = "facings" | "boxes" | "weight" | "stack" | "manual";
export const METHODS: readonly Method[] = ["facings", "boxes", "weight", "stack", "manual"];
export const METHOD_LABEL: Record<Method, string> = {
  facings: "Тавиур (нүүр × гүн)",
  boxes: "Хайрцгаар",
  weight: "Жингээр",
  stack: "Өрөгөөр",
  manual: "Тоогоор",
};

export type Profile = {
  method?: Method;
  depth?: number | null;
  packSize?: number | null;
  unitWeightG?: number | null;
  tareG?: number | null;
  unitThicknessMm?: number | null;
  leadDays?: number | null;
};

/** Оролт: f нүүр, d гүн, r давхар, l сул, b хайрцаг, g грамм, h өндөр мм, s багана, q тоо */
export type Inputs = Partial<Record<"f" | "d" | "r" | "l" | "b" | "g" | "h" | "s" | "q", number>>;

export type Computed = { qty: number; confidence?: number; warning?: string; used: Inputs };

export class MethodError extends Error {}

const MAX = 1_000_000;
function val(x: unknown, name: string, opt: { int?: boolean; min?: number; def?: number } = {}): number {
  if (x === undefined || x === null || x === "") {
    if (opt.def !== undefined) return opt.def;
    throw new MethodError(`«${name}» утга оруулна уу`);
  }
  const n = typeof x === "number" ? x : Number(x);
  if (!Number.isFinite(n)) throw new MethodError(`«${name}» тоо байх ёстой`);
  if (n < (opt.min ?? 0)) throw new MethodError(`«${name}» ${opt.min ?? 0}-ээс бага байж болохгүй`);
  if (n > MAX) throw new MethodError(`«${name}» хэт их байна`);
  if (opt.int && !Number.isInteger(n)) throw new MethodError(`«${name}» бүхэл тоо байна`);
  return n;
}
const r3 = (x: number) => Math.round(x * 1000) / 1000;

/**
 * Оролт + профайлаас тоо хэмжээ. Бүх оролт ≥ 0.
 * `unit` = "kg" | "l" бол жингийн арга бутархай кг буцаана.
 */
export function computeQty(method: Method, inp: Inputs, prof: Profile = {}, unit: string = "pcs"): Computed {
  switch (method) {
    case "facings": {
      const f = val(inp.f, "Нүүрэн тал", { int: true });
      const d = val(inp.d ?? prof.depth ?? undefined, "Гүн", { int: true, min: 1, def: 1 });
      const r = val(inp.r, "Давхар", { int: true, min: 1, def: 1 });
      const l = val(inp.l, "Сул", { def: 0 });
      return { qty: r3(f * d * r + l), used: { f, d, r, l } };
    }
    case "boxes": {
      const b = val(inp.b, "Хайрцаг", { int: true });
      const pack = val(prof.packSize ?? undefined, "Хайрцаг дахь тоо", { min: 1 });
      const l = val(inp.l, "Сул", { def: 0 });
      return { qty: r3(b * pack + l), used: { b, l } };
    }
    case "weight": {
      const g = val(inp.g, "Нийт жин (г)");
      const tare = val(prof.tareG ?? undefined, "Савны жин", { def: 0 });
      if (g < tare) throw new MethodError("Нийт жин савны жингээс бага байна");
      if (unit === "kg" || unit === "l") return { qty: r3((g - tare) / 1000), used: { g } };
      const uw = val(prof.unitWeightG ?? undefined, "Нэгжийн жин (г)");
      if (uw <= 0) throw new MethodError("Нэгжийн жин 0-ээс их байна");
      const x = (g - tare) / uw;
      const q = Math.round(x);
      const off = Math.abs(x - q) > 0.25;
      return { qty: q, used: { g }, ...(off ? { confidence: 0.5, warning: "Нэгжийн жинг шалгана уу" } : {}) };
    }
    case "stack": {
      const h = val(inp.h, "Өндөр (мм)");
      const t = val(prof.unitThicknessMm ?? undefined, "Нэгжийн зузаан (мм)");
      if (t <= 0) throw new MethodError("Нэгжийн зузаан 0-ээс их байна");
      const s = val(inp.s, "Багана", { int: true, min: 1, def: 1 });
      return { qty: Math.floor(h / t + 1e-9) * s, used: { h, s } };
    }
    case "manual": {
      const q = val(inp.q, "Тоо");
      return { qty: r3(q), used: { q } };
    }
    default:
      throw new MethodError("Тоолох арга буруу");
  }
}

/** Хэт их тоо — баталгаажуулах асуулт (§5.4) */
export const needsConfirm = (qty: number, expected: number) => qty > 10 * Math.max(expected, 20);

export const isMethod = (m: unknown): m is Method => typeof m === "string" && (METHODS as string[]).includes(m);
