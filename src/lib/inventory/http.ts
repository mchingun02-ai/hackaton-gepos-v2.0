/** Тооллогын route-уудын оролт: JSON (≤ 1 МБ), multipart зураг (файл тутам ≤ 4 МБ). */
import { fail } from "@/lib/tenant/http";
import { MAX_IMAGE } from "./photos";

export async function readJson<T = Record<string, unknown>>(req: Request, max = 1_000_000): Promise<T> {
  const raw = await req.text();
  if (raw.length > max) fail(413, "Хүсэлт хэт том");
  if (!raw.trim()) return {} as T;
  try {
    const j = JSON.parse(raw) as unknown;
    if (!j || typeof j !== "object" || Array.isArray(j)) fail(400, "JSON объект илгээнэ үү");
    return j as T;
  } catch {
    return fail(400, "JSON буруу");
  }
}

/** multipart/form-data → зураг(ууд) ("image" талбар) + бусад текст талбар */
export async function readImages(req: Request, maxFiles = 1): Promise<{ images: Buffer[]; fields: Record<string, string> }> {
  const len = Number(req.headers.get("content-length") || 0);
  if (len > maxFiles * MAX_IMAGE + 64_000) fail(413, "Зураг 4 МБ-аас их байна");
  const ct = req.headers.get("content-type") || "";
  if (!ct.includes("multipart/form-data")) fail(400, "Зургийг multipart/form-data-аар илгээнэ үү");
  let fd: FormData;
  try {
    fd = await req.formData();
  } catch {
    return fail(400, "Зураг уншиж чадсангүй");
  }
  const images: Buffer[] = [];
  const fields: Record<string, string> = {};
  for (const [k, v] of fd.entries()) {
    if (typeof v === "string") fields[k] = v.slice(0, 200);
    else if (k === "image" || k === "file" || k === "images") {
      if (v.size > MAX_IMAGE) fail(413, "Зураг 4 МБ-аас их байна");
      if (images.length < maxFiles) images.push(Buffer.from(await v.arrayBuffer()));
    }
  }
  if (!images.length) fail(400, "Зураг алга (талбар: image)");
  return { images, fields };
}
