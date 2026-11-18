import { legacyGuard } from "@/lib/ai/legacy";
import { accountOr409, autoProject, createProject, gError, listProjects, selectProject } from "@/lib/ai/server";
import { fail, handle, merchantOf } from "@/lib/fb/server";

export const GET = handle(async (req: Request) => {
  legacyGuard();
  const acc = accountOr409(merchantOf(req));
  try {
    return Response.json({ projects: await listProjects(acc) });
  } catch (e) {
    console.warn("[ai] projects", e instanceof Error ? e.message : e);
    return fail(502, gError(e));
  }
});

/** { projectId } — тэр project-ийг ашиглана; { create: true } — шинээр үүсгэнэ. Аль алинд нь Gemini API-г асаана. */
export const POST = handle(async (req: Request) => {
  legacyGuard();
  const acc = accountOr409(merchantOf(req));
  const b = (await req.json().catch(() => ({}))) as { projectId?: string; create?: boolean; auto?: boolean };
  try {
    if (b.auto) return Response.json({ ok: true, project: await autoProject(acc) });
    const id = b.create ? (await createProject(acc)).id : String(b.projectId || "");
    await selectProject(acc, id);
    return Response.json({ ok: true, project: id });
  } catch (e) {
    console.warn("[ai] projects", e instanceof Error ? e.message : e);
    return fail(502, gError(e));
  }
});
