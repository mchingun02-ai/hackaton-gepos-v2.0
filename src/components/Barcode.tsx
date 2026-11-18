import { encodeEan13 } from "@/lib/ean13";

/**
 * EAN-13 бар код — SVG.
 *
 * Камер болон USB уншигч хоёулаа уншина: зураас хар, дэвсгэр үргэлж
 * цагаан (харанхуй сэдэвт ч), хоёр талдаа «чимээгүй бүс» үлдээнэ —
 * түүнгүйгээр уншигч кодын эхлэлийг олдоггүй.
 *
 * EAN-13 биш код (дотоод SKU гэх мэт) ирвэл зүгээр цифрээр нь бичнэ.
 */
export function Barcode({
  code,
  height = 44,
  module = 2,
  className = "",
}: {
  code: string;
  /** Зураасны өндөр, px — цифрийн мөр нэмэгдэнэ */
  height?: number;
  /** Нэг модулийн (хамгийн нарийн зураас) өргөн, px. Бүхэл тоо байх ёстой — 1.4 гэх мэт бутархай нь зураасыг тэгш бус болгож уншигдахгүй. */
  module?: number;
  className?: string;
}) {
  const enc = encodeEan13(code);
  if (!enc) {
    return <span className={`tnum text-[11px] text-mute ${className}`}>{code}</span>;
  }

  const quiet = 11; // модуль — зүүн талд эхний цифр багтана; EAN-13 хамгийн багадаа 11
  const width = quiet + 95 + 9;
  const digitRow = 9;
  const bars: { x: number; w: number; guard: boolean }[] = [];
  for (let i = 0; i < 95; i++) {
    if (enc.bits[i] !== "1") continue;
    const prev = bars[bars.length - 1];
    const guard = enc.guards.has(i);
    // Залгаа модулиудыг нэг тэгш өнцөгт болгоно — SVG цэвэр, зураас хооронд завсаргүй
    if (prev && prev.x + prev.w === quiet + i && prev.guard === guard) prev.w += 1;
    else bars.push({ x: quiet + i, w: 1, guard });
  }

  const unit = module;
  const barH = Math.round(height / module);
  const guardH = barH + 5;
  const text = (x: number, s: string, anchor: "start" | "middle" = "middle") => (
    <text x={x} y={guardH + digitRow - 1} fontSize={9} textAnchor={anchor} fill="#000" fontFamily="ui-monospace, Menlo, Consolas, monospace">
      {s}
    </text>
  );

  return (
    <svg
      viewBox={`0 0 ${width} ${guardH + digitRow + 1}`}
      width={width * unit}
      height={(guardH + digitRow + 1) * unit}
      className={`block rounded-[3px] bg-white ${className}`}
      role="img"
      aria-label={`Бар код ${code}`}
    >
      {bars.map((bar) => (
        <rect key={bar.x} x={bar.x} y={1} width={bar.w} height={bar.guard ? guardH - 1 : barH - 1} fill="#000" />
      ))}
      {text(1, code[0], "start")}
      {text(quiet + 3 + 21, code.slice(1, 7))}
      {text(quiet + 50 + 21, code.slice(7))}
    </svg>
  );
}
