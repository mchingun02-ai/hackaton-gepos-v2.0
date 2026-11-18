/**
 * Каталогтой тааруулах (docs/ARCHITECTURE.md §5.3) — цэвэр функц.
 *  1. ≤ 80 бараатай хүрээнд нэр дэвшигчдийг `k` алиасаар prompt-д өгнө; сервер k → product_id буулгана.
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

/** ≤ 80 бараа бол алиас жагсаалт (prompt-д), үгүй бол хоосон */
export function aliasList(products: { id: string; name: string }[], max = 80) {
  const alias = new Map<string, string>();
  if (products.length > max) return { cands: [] as { k: string; name: string }[], alias };
  const cands = products.map((p, i) => {
    const k = `a${i + 1}`;
    alias.set(k, p.id);
    return { k, name: p.name };
  });
  return { cands, alias };
}
