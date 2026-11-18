/**
 * Зөрүү, босго, delta засвар (docs/ARCHITECTURE.md §5.5, D6) — цэвэр функц.
 *
 * variance = counted − system_qty_at_count  (тоолсон агшны системийн үлдэгдэлтэй харьцуулна)
 * Батлахад: stock += variance  → тоолох хооронд борлуулалт явсан ч эцсийн үлдэгдэл зөв.
 */

export type Level = "ok" | "warn" | "critical";
export const LEVEL_LABEL: Record<Level, string> = { ok: "Таарсан", warn: "Шалгах", critical: "Дахин тоолох" };

export type Thresholds = {
  /** |Δ| ≤ okUnits → ok */
  okUnits: number;
  okPct: number;
  okValue: number;
  warnPct: number;
  warnValue: number;
  /** зургийн итгэл үүнээс бага бол critical */
  minConfidence: number;
};
export const DEFAULT_THRESHOLDS: Thresholds = { okUnits: 1, okPct: 0.02, okValue: 5_000, warnPct: 0.1, warnValue: 50_000, minConfidence: 0.6 };

/** Хэрэглэгчийн оруулсан босгыг хязгаарт оруулна */
export function cleanThresholds(x: Partial<Record<keyof Thresholds, unknown>> | null | undefined): Thresholds {
  const d = DEFAULT_THRESHOLDS;
  const n = (v: unknown, def: number, lo: number, hi: number) => {
    const k = typeof v === "number" ? v : Number(v);
    return Number.isFinite(k) ? Math.min(hi, Math.max(lo, k)) : def;
  };
  const okPct = n(x?.okPct, d.okPct, 0, 1);
  const okValue = Math.round(n(x?.okValue, d.okValue, 0, 100_000_000));
  return {
    okUnits: n(x?.okUnits, d.okUnits, 0, 1000),
    okPct,
    okValue,
    warnPct: Math.max(okPct, n(x?.warnPct, d.warnPct, 0, 1)),
    warnValue: Math.max(okValue, Math.round(n(x?.warnValue, d.warnValue, 0, 1_000_000_000))),
    minConfidence: n(x?.minConfidence, d.minConfidence, 0, 1),
  };
}

export type LevelInput = { system: number; counted: number; unitValue: number; minConfidence?: number | null };

/** Түвшин: critical дүрэм эхэлж (0 тоолсон, зургийн итгэл бага), дараа нь ok, warn */
export function classify(x: LevelInput, th: Thresholds = DEFAULT_THRESHOLDS): Level {
  const delta = x.counted - x.system;
  const abs = Math.abs(delta);
  if (x.system > 0 && x.counted === 0) return "critical";
  if (x.minConfidence != null && x.minConfidence < th.minConfidence) return "critical";
  const pct = abs / Math.max(1, x.system);
  const value = abs * Math.max(0, x.unitValue);
  if (abs <= th.okUnits || (pct <= th.okPct && value <= th.okValue)) return "ok";
  if (pct <= th.warnPct && value <= th.warnValue) return "warn";
  return "critical";
}

export const varianceOf = (counted: number, systemAtCount: number) => Math.round((counted - systemAtCount) * 1000) / 1000;

/** Батлах агшны засвар: одоогийн үлдэгдэл + зөрүү (сөрөг болохгүй) */
export function applyDelta(current: number, variance: number) {
  const after = Math.max(0, Math.round((current + variance) * 1000) / 1000);
  return { before: current, delta: variance, after };
}

export type ReportLine = {
  productId: string;
  name: string;
  status: string;
  counted: number | null;
  system: number | null;
  variance: number | null;
  level: Level | null;
  unitValue: number;
};
export type MethodShare = { method: string; count: number; pct: number };

/** Зөрүүний тайлан (§5.5) */
export function report(lines: ReportLine[], methods: { method: string; n: number }[] = []) {
  const counted = lines.filter((l) => l.counted != null && l.status !== "pending" && l.status !== "recount");
  const by = { ok: 0, warn: 0, critical: 0 } as Record<Level, number>;
  let shortage = 0;
  let surplus = 0;
  for (const l of counted) {
    if (l.level) by[l.level]++;
    const v = (l.variance ?? 0) * l.unitValue;
    if (v < 0) shortage += -v;
    else surplus += v;
  }
  const top = counted
    .filter((l) => (l.variance ?? 0) !== 0)
    .map((l) => ({ ...l, value: Math.round((l.variance ?? 0) * l.unitValue) }))
    .sort((a, b) => Math.abs(b.value) - Math.abs(a.value) || Math.abs(b.variance ?? 0) - Math.abs(a.variance ?? 0))
    .slice(0, 10);
  const totalCounts = methods.reduce((a, m) => a + m.n, 0);
  return {
    total: lines.length,
    counted: counted.length,
    uncounted: lines.length - counted.length,
    levels: by,
    shortage: Math.round(shortage),
    surplus: Math.round(surplus),
    net: Math.round(surplus - shortage),
    top,
    methods: methods.map((m): MethodShare => ({ method: m.method, count: m.n, pct: totalCounts ? Math.round((m.n / totalCounts) * 100) : 0 })),
  };
}
