/**
 * PII цэвэрлэгээ (docs/ARCHITECTURE.md §8) — FAQ олборлолтод LLM-ээс ӨМНӨ ба ДАРАА.
 * Утас, имэйл, РД, картын/дансны 9+ оронтой тоо, харилцагчийн картад байгаа нэрс → «[…]».
 * Цэвэр функц (сервергүй нэгж тест: tests/kb-auto.test.mjs).
 */
const MASK = "[…]";

const PATTERNS: RegExp[] = [
  // имэйл
  /[\p{L}\p{N}._%+-]+@[\p{L}\p{N}.-]+\.[\p{L}]{2,}/gu,
  // РД: 2 кирилл үсэг + 8 орон
  /[А-ЯӨҮЁ]{2}\s?\d{8}/giu,
  // карт / данс: 9+ орон (зай, зураасаар бүлэглэсэн ч)
  /(?<!\d)\d(?:[\s-]?\d){8,}(?!\d)/g,
  // монгол утас: 8 орон, 5–9-өөр эхэлнэ (1234-5678, 9911 2233)
  /(?<!\d)(?:\+?976[\s-]?)?[5-9]\d{3}[\s-]?\d{4}(?!\d)/g,
];

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Нэрсийн жагсаалтаас хайх загвар (2+ үсэгтэй үг бүр; «Б.Болд» → «Болд») */
function nameRe(names: string[]) {
  const words = new Set<string>();
  for (const n of names) for (const w of String(n ?? "").split(/[^\p{L}]+/u)) if (w.length >= 3) words.add(w);
  if (!words.size) return null;
  return new RegExp(`(?<![\\p{L}])(?:${[...words].map(escapeRe).join("|")})(?![\\p{L}])`, "giu");
}

export function stripPii(text: string, names: string[] = []): string {
  let out = String(text ?? "");
  for (const re of PATTERNS) out = out.replace(re, MASK);
  const nr = nameRe(names);
  if (nr) out = out.replace(nr, MASK);
  return out.replace(/(?:\[…\]\s*){2,}/g, `${MASK} `);
}

/** PII үлдсэн эсэх (LLM-ийн гаралтыг шалгах — үлдсэн бол ноорог хаягдана) */
export function hasPii(text: string, names: string[] = []): boolean {
  const s = String(text ?? "");
  if (PATTERNS.some((re) => new RegExp(re.source, re.flags.replace("g", "")).test(s))) return true;
  const nr = nameRe(names);
  return !!nr && new RegExp(nr.source, nr.flags.replace("g", "")).test(s);
}
