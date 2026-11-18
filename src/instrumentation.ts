/** Сервер асахад нэг удаа (Next.js instrumentation) — процессын дотоод ажлууд (webhook түгээгч, хадгалах хугацаа). */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { ensureJobs } = await import("@/lib/tenant/jobs");
    ensureJobs();
  }
}
