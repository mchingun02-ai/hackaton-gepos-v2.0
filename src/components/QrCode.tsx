import qrcode from "qrcode-generator";

/**
 * Уншигддаг QR код — SVG.
 *
 * `qrcode-generator` нь хамааралгүй жижиг сан: зөвхөн модулийн торыг
 * тооцоолно, зурахыг энд SVG-ээр хийнэ. Дэвсгэр үргэлж цагаан, эргэн
 * тойронд 4 модуль чимээгүй бүс — харанхуй сэдэвт ч камер уншина.
 */
export function QrCode({
  value,
  size = 200,
  className = "",
  label = "QR код",
}: {
  value: string;
  /** Нийт өргөн, px */
  size?: number;
  className?: string;
  label?: string;
}) {
  const qr = qrcode(0, "M");
  qr.addData(value);
  qr.make();
  const count = qr.getModuleCount();
  const quiet = 4;
  const total = count + quiet * 2;

  // Мөр бүрийн хар модулиудыг нэг path болгоно — 1000+ rect-ээс хөнгөн
  let d = "";
  for (let row = 0; row < count; row++) {
    for (let col = 0; col < count; col++) {
      if (qr.isDark(row, col)) d += `M${col + quiet} ${row + quiet}h1v1h-1z`;
    }
  }

  return (
    <svg
      viewBox={`0 0 ${total} ${total}`}
      width={size}
      height={size}
      className={`block rounded-[10px] bg-white ${className}`}
      role="img"
      aria-label={label}
      shapeRendering="crispEdges"
    >
      <path d={d} fill="#000" />
    </svg>
  );
}
