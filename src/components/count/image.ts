"use client";

/**
 * Утасны камерын бүтэн зураг → урт тал ≤ 1600px, JPEG q≈0.82 (тавиурын фэйсинг харагдахуйц, 4 МБ-аас бага).
 * EXIF эргэлтийг createImageBitmap (imageOrientation) эсвэл <img> (Safari автоматаар) зөв болгоно.
 */
const MAX_EDGE = 1600;
const QUALITY = 0.82;

export type Shot = { blob: Blob; url: string; w: number; h: number };

async function load(file: Blob): Promise<{ src: CanvasImageSource; w: number; h: number; close?: () => void }> {
  if (typeof createImageBitmap === "function") {
    try {
      const b = await createImageBitmap(file, { imageOrientation: "from-image" });
      return { src: b, w: b.width, h: b.height, close: () => b.close() };
    } catch {
      /* Safari-ийн хуучин хувилбар — доорх арга */
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = () => rej(new Error("Зургийг уншиж чадсангүй"));
      i.src = url;
    });
    return { src: img, w: img.naturalWidth, h: img.naturalHeight };
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }
}

export async function prepareShot(file: File): Promise<Shot> {
  if (file.type && !file.type.startsWith("image/")) throw new Error("Зургийн файл сонгоно уу");
  const im = await load(file);
  const k = Math.min(1, MAX_EDGE / Math.max(im.w, im.h));
  const w = Math.max(1, Math.round(im.w * k));
  const h = Math.max(1, Math.round(im.h * k));
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const g = c.getContext("2d");
  if (!g) throw new Error("Зураг боловсруулах боломжгүй");
  g.fillStyle = "#fff";
  g.fillRect(0, 0, w, h);
  g.drawImage(im.src, 0, 0, w, h);
  im.close?.();
  let q = QUALITY;
  let blob: Blob | null = null;
  for (let i = 0; i < 3; i++) {
    blob = await new Promise<Blob | null>((res) => c.toBlob(res, "image/jpeg", q));
    if (blob && blob.size < 3.8 * 1024 * 1024) break;
    q -= 0.15;
  }
  if (!blob) throw new Error("Зураг хадгалж чадсангүй");
  return { blob, url: URL.createObjectURL(blob), w, h };
}
