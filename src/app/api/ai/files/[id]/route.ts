import { legacyGuard } from "@/lib/ai/legacy";
import { readFileSync } from "node:fs";
import { filePath } from "@/lib/ai/qwen";
import { history } from "@/lib/ai/server";
import { fail, handle, merchantOf } from "@/lib/fb/server";

/** Хавсралтыг харуулах/татах (session cookie). Зөвхөн өөрийн чатын файл. */
export const GET = handle(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  legacyGuard();
  const { id } = await params;
  const merchant = merchantOf(req);
  const f = history(merchant, "qwen")
    .flatMap((m) => m.files ?? [])
    .find((x) => x.id === id);
  if (!f) fail(404, "Файл олдсонгүй");
  let buf: Buffer;
  try {
    buf = readFileSync(filePath(id));
  } catch {
    return fail(404, "Файл устсан байна");
  }
  // Зураг, видео, дууг хөтөч дотроо тоглуулна (?dl=1 — татах). Бусдыг зөвхөн татна.
  const media = f!.kind === "image" || f!.kind === "video" || f!.kind === "audio";
  const safe = media ? f!.mime : "application/octet-stream";
  const inline = media && !new URL(req.url).searchParams.has("dl");
  const headers: Record<string, string> = {
    "Content-Type": safe,
    "Content-Disposition": `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(f!.name)}`,
    "Cache-Control": "private, max-age=3600",
    "X-Content-Type-Options": "nosniff",
    "Accept-Ranges": "bytes",
  };
  // Safari видеог Range хүсэлтээр л тоглуулна
  const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.get("range") ?? "");
  if (range && (range[1] || range[2])) {
    const size = buf.length;
    const start = range[1] ? Number(range[1]) : Math.max(0, size - Number(range[2]));
    const end = range[1] && range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
    if (start >= size || start > end) return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } });
    return new Response(new Uint8Array(buf.subarray(start, end + 1)), { status: 206, headers: { ...headers, "Content-Range": `bytes ${start}-${end}/${size}`, "Content-Length": String(end - start + 1) } });
  }
  return new Response(new Uint8Array(buf), { headers });
});
