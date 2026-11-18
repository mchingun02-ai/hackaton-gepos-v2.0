/**
 * Барааны зураг бэлтгэх.
 *
 * Утасны камер 3000–4000px зураг өгдөг (3–8 МБ). Кассын хавтанд 220px-ээр
 * харагддаг зургийг тэр чигээр нь хадгалах нь утгагүй: сан хавдаж,
 * жагсаалт удаашарч, дараа нь сервер рүү синк хийхэд траффик иднэ.
 *
 * Тиймээс хадгалахаасаа өмнө canvas дээр дүрсэлж жижигрүүлнэ. 640px нь
 * хамгийн том харагдах хэмжээнээсээ (хавтан дээр ~280px, Retina дээр 560px)
 * бага зэрэг том — хангалттай.
 */

const MAX_EDGE = 640;
const QUALITY = 0.82;

export type PreparedImage = {
  dataUrl: string;
  width: number;
  height: number;
  /** ойролцоо байт — хэрэглэгчид харуулахад */
  bytes: number;
};

export async function prepareProductImage(file: File): Promise<PreparedImage> {
  if (!file.type.startsWith("image/")) {
    throw new Error("Зургийн файл биш байна");
  }

  const bitmap = await loadBitmap(file);
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext("2d");
  if (!context) throw new Error("Зураг боловсруулах боломжгүй байна");

  // Ил тод дэвсгэртэй PNG-г JPEG болгоход хар болдог тул цагаанаар дүүргэнэ
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, width, height);
  context.drawImage(bitmap, 0, 0, width, height);

  if ("close" in bitmap && typeof bitmap.close === "function") bitmap.close();

  const dataUrl = canvas.toDataURL("image/jpeg", QUALITY);
  return {
    dataUrl,
    width,
    height,
    bytes: Math.round((dataUrl.length - "data:image/jpeg;base64,".length) * 0.75),
  };
}

async function loadBitmap(file: File): Promise<ImageBitmap | HTMLImageElement> {
  // createImageBitmap нь EXIF эргэлтийг зөв боловсруулдаг
  if (typeof createImageBitmap === "function") {
    try {
      return await createImageBitmap(file, { imageOrientation: "from-image" });
    } catch {
      /* дэмжихгүй браузерт доорх арга руу шилжинэ */
    }
  }

  const url = URL.createObjectURL(file);
  try {
    return await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error("Зургийг уншиж чадсангүй"));
      image.src = url;
    });
  } finally {
    // Зураг ачаалагдсаны дараа л чөлөөлнө
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

export const formatBytes = (bytes: number): string =>
  bytes >= 1_000_000
    ? (bytes / 1_048_576).toFixed(1) + " МБ"
    : Math.max(1, Math.round(bytes / 1024)) + " КБ";
