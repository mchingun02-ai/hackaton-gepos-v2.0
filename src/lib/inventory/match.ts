/**
 * Каталогтой тааруулах (docs/ARCHITECTURE.md §5.3) — цэвэр функц.
 *  1. ≤ 200 бараатай бол каталогийг `k` алиасаар (нэр, баркод, үнэ) prompt-д өгнө; сервер k → product_id буулгана.
 *  2. Бусад үед: баркод яг таарах → эс бөгөөс нэрийн үгээр (IDF жинтэй хамралт) эхний 3.
 *     Оноо ≥ 0.6 ба 2-р байрнаас ≥ 0.15 зөрүүтэй бол автоматаар холбоно, бусад үед ажилтан сонгоно.
 */

/** GTIN (EAN-8, UPC-A, EAN-13, GTIN-14) шалгах цифр — mod 10, баруунаас 3,1 жинтэй */
export function checkDigitOk(code: string): boolean {
  if (!/^(\d{8}|\d{12}|\d{13}|\d{14})$/.test(code)) return false;
  const d = code.split("").map(Number);
  const check = d.pop()!;
  let sum = 0;
  for (let i = d.length - 1, w = 3; i >= 0; i--, w = w === 3 ? 1 : 3) sum += d[i] * w;
  return (10 - (sum % 10)) % 10 === check;
}
export const isEan8 = (c: string) => /^\d{8}$/.test(c) && checkDigitOk(c);
export const isEan13 = (c: string) => /^\d{13}$/.test(c) && checkDigitOk(c);

/** Үг задлах: жижиг үсэг, тэмдэгт хасна; хэмжээ (0.5 л, 500ml) нэг үг болно */
export function terms(s: string): string[] {
  const t = String(s ?? "")
    .toLocaleLowerCase("mn")
    .replace(/[«»"'()[\],]/g, " ")
    .replace(/(\d)[.,](\d)/g, "$1.$2")
    .replace(/(\d)\s*(мл|ml|л|l|г|g|гр|кг|kg|ш)\b/gu, "$1$2");
  return t.split(/[^\p{L}\p{N}.%-]+/u).map((w) => w.replace(/^[.-]+|[.-]+$/g, "")).filter((w) => w.length > 1 || /\d/.test(w));
}

/** Хоёр үг ижил гэж үзэх (монгол нөхцөл залгаварт — 4+ тэмдэгтийн угтвар) */
function same(a: string, b: string) {
  if (a === b) return true;
  if (/\d/.test(a) || /\d/.test(b)) return false;
  const n = Math.min(a.length, b.length);
  return n >= 4 && a.slice(0, n) === b.slice(0, n);
}

export type MatchProduct = { id: string; name: string; barcodes?: string[]; brand?: string | null };
export type Scored = { id: string; name: string; score: number };

/** Нэрээр хайж эхний 3-ыг онооны дагуу (0..1) */
export function rankByName(query: string, products: MatchProduct[], top = 3): Scored[] {
  const q = [...new Set(terms(query))];
  if (!q.length || !products.length) return [];
  const docs = products.map((p) => ({ p, t: [...new Set(terms(`${p.name} ${p.brand ?? ""}`))] }));
  const N = docs.length;
  const idf = (w: string) => {
    const df = docs.filter((d) => d.t.some((x) => same(x, w))).length;
    return Math.log(1 + (N - df + 0.5) / (df + 0.5)) + 0.05;
  };
  const wq = q.map((w) => ({ w, idf: idf(w) }));
  const qTotal = wq.reduce((a, x) => a + x.idf, 0);
  const out = docs.map(({ p, t }) => {
    const hit = wq.filter((x) => t.some((y) => same(y, x.w))).reduce((a, x) => a + x.idf, 0);
    // Барааны нэрийн хэдэн хувь нь хайлтад орсон (урт нэрт шийтгэл)
    const cover = t.length ? t.filter((y) => q.some((w) => same(y, w))).length / t.length : 0;
    return { id: p.id, name: p.name, score: Math.round((0.8 * (hit / qTotal) + 0.2 * cover) * 1000) / 1000 };
  });
  return out
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, top);
}

export type MatchResult = { productId: string | null; via: "alias" | "barcode" | "name" | null; score: number; suggestions: Scored[] };

/** Нэг илрүүлэлтийг каталогтой тааруулна */
export function matchOne(
  det: { k?: string | null; label: string; brand?: string | null; size?: string | null; barcode?: string | null },
  products: MatchProduct[],
  alias: ReadonlyMap<string, string>,
): MatchResult {
  if (det.k && alias.has(det.k)) {
    const id = alias.get(det.k)!;
    const p = products.find((x) => x.id === id);
    return { productId: id, via: "alias", score: 1, suggestions: p ? [{ id, name: p.name, score: 1 }] : [] };
  }
  if (det.barcode) {
    const p = products.find((x) => x.barcodes?.includes(det.barcode!));
    if (p) return { productId: p.id, via: "barcode", score: 1, suggestions: [{ id: p.id, name: p.name, score: 1 }] };
  }
  const s = rankByName([det.brand, det.label, det.size].filter(Boolean).join(" "), products);
  const auto = s.length > 0 && s[0].score >= 0.6 && (s.length < 2 || s[0].score - s[1].score >= 0.15);
  return { productId: auto ? s[0].id : null, via: auto ? "name" : null, score: s[0]?.score ?? 0, suggestions: s };
}

/** ≤ 200 бараа бол компакт алиас жагсаалт (prompt-д: k, n нэр, b баркод, p үнэ), их бол хоосон */
export function aliasList(products: { id: string; name: string; barcodes?: string[]; price?: number | null }[], max = 200) {
  const alias = new Map<string, string>();
  if (products.length > max) return { cands: [] as { k: string; n: string; b?: string; p?: number }[], alias };
  const cands = products.map((p, i) => {
    const k = `a${i + 1}`;
    alias.set(k, p.id);
    return { k, n: p.name, ...(p.barcodes?.[0] ? { b: p.barcodes[0] } : {}), ...(p.price ? { p: Math.round(p.price) } : {}) };
  });
  return { cands, alias };
}

export type Resolved = {
  status: "matched" | "ambiguous" | "unknown";
  productId: string | null;
  via: "alias" | "barcode" | "name" | "price" | null;
  score: number;
  /** ambiguous/unknown үед ажилтанд санал болгох 2–3 бараа */
  candidates: { id: string; name: string; score: number }[];
};

/**
 * Загварын k + баркод + үнийн шошго + нэрийн оноог нэгтгэж шийднэ (§5.3, «сонгохгүйгээр»):
 *  · k (жагсаалтаас) → таарсан, гэхдээ нэр нь өөр бараатай хүчтэй (≥ 0.6) таарч, k-ийнх сул бол → эргэлзээтэй
 *  · баркод яг → таарсан · нэрээр ≥ 0.6 ба 2-р байрнаас ≥ 0.15 → таарсан
 *  · ойролцоо хоёр нэр дэвшигчээс зөвхөн нэгнийх нь үнэ шошготой таарвал → таарсан
 *  · бусад: нэр ≥ 0.3 бол эргэлзээтэй (2–3 сонголт), эс бөгөөс танихгүй
 */
export function resolveDetection(
  det: { k?: string | null; label: string; brand?: string | null; size?: string | null; barcode?: string | null; price_tag?: number | null },
  products: (MatchProduct & { price?: number | null })[],
  alias: ReadonlyMap<string, string>,
): Resolved {
  const ranked = rankByName([det.brand, det.label, det.size].filter(Boolean).join(" "), products, 3);
  const byId = (id: string) => products.find((x) => x.id === id);
  if (det.k && alias.has(det.k)) {
    const id = alias.get(det.k)!;
    const p = byId(id);
    const own = ranked.find((r) => r.id === id)?.score ?? 0;
    const other = ranked[0] && ranked[0].id !== id && ranked[0].score >= 0.6 && own < 0.2 ? ranked[0] : null;
    const priceOk = det.price_tag != null && p?.price != null && Math.round(p.price) === Math.round(det.price_tag);
    if (p && (!other || priceOk)) return { status: "matched", productId: id, via: "alias", score: 1, candidates: [{ id, name: p.name, score: 1 }] };
    if (p && other) return { status: "ambiguous", productId: null, via: null, score: own, candidates: [{ id, name: p.name, score: own }, other] };
  }
  if (det.barcode) {
    const p = products.find((x) => x.barcodes?.includes(det.barcode!));
    if (p) return { status: "matched", productId: p.id, via: "barcode", score: 1, candidates: [{ id: p.id, name: p.name, score: 1 }] };
  }
  if (ranked.length && ranked[0].score >= 0.6 && (ranked.length < 2 || ranked[0].score - ranked[1].score >= 0.15))
    return { status: "matched", productId: ranked[0].id, via: "name", score: ranked[0].score, candidates: ranked };
  const close = ranked.filter((r) => r.score >= 0.3);
  if (det.price_tag != null && close.length) {
    const hit = close.filter((r) => Math.round(byId(r.id)?.price ?? -1) === Math.round(det.price_tag!));
    if (hit.length === 1) return { status: "matched", productId: hit[0].id, via: "price", score: hit[0].score, candidates: close };
  }
  if (close.length) return { status: "ambiguous", productId: null, via: null, score: close[0].score, candidates: close.slice(0, 3) };
  return { status: "unknown", productId: null, via: null, score: ranked[0]?.score ?? 0, candidates: ranked.slice(0, 3) };
}

/* ───────── ойролцоо зураг (dHash) ───────── */

/** dHash: 9×8 саарал (мөрөөр) пикселээс 64 бит → 16 hex. `gray` урт = 72. */
export function dhash(gray: ArrayLike<number>): string {
  if (gray.length !== 72) throw new Error("dhash: 9×8 саарал пиксел хэрэгтэй");
  let hex = "";
  for (let y = 0; y < 8; y++) {
    let byte = 0;
    for (let x = 0; x < 8; x++) byte = (byte << 1) | (gray[y * 9 + x] > gray[y * 9 + x + 1] ? 1 : 0);
    hex += byte.toString(16).padStart(2, "0");
  }
  return hex;
}
export const isHash = (h: unknown): h is string => typeof h === "string" && /^[0-9a-f]{16}$/.test(h);
/** Хоёр dHash-ийн ялгаатай битийн тоо (0 = ижил, ≤ 10 ≈ бараг ижил зураг) */
export function hamming(a: string, b: string): number {
  let n = 0;
  for (let i = 0; i < 16; i += 4) {
    let x = parseInt(a.slice(i, i + 4), 16) ^ parseInt(b.slice(i, i + 4), 16);
    while (x) {
      n += x & 1;
      x >>>= 1;
    }
  }
  return n;
}
export const SIMILAR_BITS = 10;

/** Хүрээ зургийн ирмэгт хүрч байгаа эсэх (хоёр зурагт давхар орсон байж болох) */
export const touchesEdge = (b: readonly number[] | null | undefined, m = 0.04) => !!b && (b[0] <= m || b[0] + b[2] >= 1 - m);
