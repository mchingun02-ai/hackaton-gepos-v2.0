/**
 * EAN-13 — барааны бар кодыг зурах.
 *
 * Код бүр 95 модуль: эхлэх хамгаалалт (101), зүүн 6 цифр, дунд
 * хамгаалалт (01010), баруун 6 цифр, төгсгөл (101). Зүүн талын
 * цифрүүд L эсвэл G хэвээр бичигдэх бөгөөд аль нь болохыг эхний
 * (13 дахь) цифр шийднэ — тэр цифр өөрөө зурагддаггүй.
 *
 * Гадны сан хэрэггүй: хэдэн хүснэгт л байна.
 */

const L = ["0001101", "0011001", "0010011", "0111101", "0100011", "0110001", "0101111", "0111011", "0110111", "0001011"];
const G = ["0100111", "0110011", "0011011", "0100001", "0011101", "0111001", "0000101", "0010001", "0001001", "0010111"];
const R = ["1110010", "1100110", "1101100", "1000010", "1011100", "1001110", "1010000", "1000100", "1001000", "1110100"];
const PARITY = ["LLLLLL", "LLGLGG", "LLGGLG", "LLGGGL", "LGLLGG", "LGGLLG", "LGGGLL", "LGLGLG", "LGLGGL", "LGGLGL"];

/** Шалгах орон зөв эсэх (12 цифрийн жигнэсэн нийлбэр) */
export function isValidEan13(code: string): boolean {
  if (!/^\d{13}$/.test(code)) return false;
  const sum = code
    .slice(0, 12)
    .split("")
    .reduce((acc, ch, i) => acc + Number(ch) * (i % 2 === 0 ? 1 : 3), 0);
  return (10 - (sum % 10)) % 10 === Number(code[12]);
}

/**
 * 95 тэмдэгт «1/0» мөр. Хамгаалалтын зураасууд (уртасдаг) тусад нь
 * буцна — шошгон дээр тэд цифрүүдээс доош сунаж харагддаг.
 */
export function encodeEan13(code: string): { bits: string; guards: Set<number> } | null {
  if (!isValidEan13(code)) return null;
  const d = code.split("").map(Number);
  const parity = PARITY[d[0]];
  let bits = "101";
  for (let i = 1; i <= 6; i++) bits += (parity[i - 1] === "L" ? L : G)[d[i]];
  bits += "01010";
  for (let i = 7; i <= 12; i++) bits += R[d[i]];
  bits += "101";

  const guards = new Set<number>([0, 1, 2, 45, 46, 47, 48, 49, 92, 93, 94]);
  return { bits, guards };
}
