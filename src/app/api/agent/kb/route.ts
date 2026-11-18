import { api, bad } from "@/lib/agent/api";
import { addDoc, fileToText, listDocs, search } from "@/lib/agent/kb";
import { ensureKbRunner } from "@/lib/kb-auto/jobs";
import { requireTenant } from "@/lib/tenant/auth";

export const maxDuration = 120;

/** Баримтуудын жагсаалт; ?q= өгвөл мэдлэгийн сангаас хайна (AI юу олохыг шалгах) */
export const GET = api(async (req: Request) => {
  const ctx = requireTenant(req, "kb");
  ensureKbRunner();
  const q = new URL(req.url).searchParams.get("q");
  // эзэн шалгахдаа дотоод баримтыг ч харна
  if (q) return Response.json({ hits: await search(ctx, q.slice(0, 500), 5, 0, { audience: ["customer", "internal"] }) });
  return Response.json({ docs: listDocs(ctx) });
});

/** multipart: files[] (PDF, TXT, MD, CSV) эсвэл JSON { title, text } */
export const POST = api(async (req: Request) => {
  const ctx = requireTenant(req, "kb");
  const out = [];
  if ((req.headers.get("content-type") || "").includes("multipart/form-data")) {
    const form = await req.formData();
    const files = form.getAll("files").filter((x): x is File => typeof x === "object" && x !== null && "arrayBuffer" in x);
    if (!files.length) bad("Файл сонгоогүй");
    for (const f of files.slice(0, 10)) {
      if (f.size > 15 * 1024 * 1024) bad(`«${f.name}» 15 MB-аас том`);
      const text = await fileToText(f).catch((e) => bad(`«${f.name}»: ${e instanceof Error ? e.message : "уншиж чадсангүй"}`));
      out.push({ name: f.name, ...(await addDoc(ctx, f.name.replace(/\.[a-z0-9]+$/i, ""), text, "file", f.name)) });
    }
  } else {
    const b = (await req.json().catch(() => ({}))) as { title?: string; text?: string };
    if (!b.text?.trim()) bad("Текст хоосон");
    out.push(await addDoc(ctx, String(b.title || "Тэмдэглэл"), String(b.text), "note"));
  }
  return Response.json({ added: out });
});
