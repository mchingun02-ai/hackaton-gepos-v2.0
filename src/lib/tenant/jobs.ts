/**
 * Процессын дотоод үе үеийн ажлууд (нэг инстанс — §13): outbox webhook түгээгч (15 сек), хадгалах хугацааны цэвэрлэгч (цаг тутам).
 * `ensureJobs()` олон удаа дуудагдсан ч нэг л удаа асна (instrumentation.ts + /api/v1 route-ууд).
 * JOBS=off бол асахгүй (тест нь ажлыг шууд дуудна).
 */
import { logError } from "@/lib/log";
import { deliverDue } from "./outbox";
import { runRetention } from "./retention";

const g = globalThis as unknown as { __geregeJobs?: boolean };

export function ensureJobs() {
  if (g.__geregeJobs || process.env.JOBS === "off" || process.env.NEXT_PHASE === "phase-production-build") return;
  g.__geregeJobs = true;
  let busy = false;
  const tick = async () => {
    if (busy) return;
    busy = true;
    try {
      await deliverDue();
    } catch (e) {
      logError("jobs.outbox", e);
    } finally {
      busy = false;
    }
  };
  setInterval(() => void tick(), 15_000).unref?.();
  setInterval(() => {
    try {
      runRetention();
    } catch (e) {
      logError("jobs.retention", e);
    }
  }, 3_600_000).unref?.();
}
