"use client";

/**
 * Нүүр: ганц том «Тоолж эхлэх» — дармагц камер нээгдэнэ (идэвхтэй тооллогыг үргэлжлүүлнэ, байхгүй бол үүсгэнэ).
 * Баркод/гараар, шинэ бараа — туслах үйлдэл. Менежерт хянах тооллого.
 */
import { useCallback, useEffect, useState } from "react";
import { Icon } from "@/components/sp/icons";
import { cx, toast } from "@/components/sp/ui";
import { ApiError, call } from "./api";
import type { Nav } from "./CountApp";
import { ensureSession, shootShelf } from "./shoot";
import type { Me, SessionSummary } from "./types";
import { CamIcon, CameraInput, ErrorNote, InfoNote, SessionChip } from "./ui";

const ROLE: Record<string, string> = { owner: "Эзэмшигч", manager: "Менежер", staff: "Ажилтан" };

export function Home({ me, nav, pending, onLogout }: { me: Me; nav: Nav; pending: number; onLogout: () => void }) {
  const [list, setList] = useState<SessionSummary[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const mgr = me.user.role === "owner" || me.user.role === "manager";

  const load = useCallback(async () => {
    try {
      setList((await call<{ sessions: SessionSummary[] }>("/api/v1/inventory/sessions")).sessions);
      setErr(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Ачаалж чадсангүй");
    }
  }, []);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- серверээс татах
    void load();
  }, [load]);

  async function ensure() {
    const s = await ensureSession();
    if (s.session.status !== "counting") {
      toast("Тооллого менежерт илгээгдсэн — хянаж дуусахыг хүлээнэ үү", "ink");
      void load();
      return null;
    }
    return s;
  }
  async function start(f: File) {
    setBusy(true);
    try {
      const s = await ensure();
      if (s) nav.go({ k: "photo", sid: s.session.id, shot: await shootShelf(s.session.id, f, { place: s.nextPlace }) });
    } catch (e) {
      toast(e instanceof ApiError && e.status === 402 ? "AI кредит дууссан. «Баркод, гараар» тоолно уу." : e instanceof Error ? e.message : "Алдаа", "danger");
    } finally {
      setBusy(false);
    }
  }
  /** Олон зураг: эхнийхийг илгээж, үлдсэнийг дараалалд — батлах бүрт дараагийн тавиур */
  async function startMany(fs: File[]) {
    if (fs.length === 1) return start(fs[0]);
    setBusy(true);
    try {
      const s = await ensure();
      if (s) nav.go({ k: "photo", sid: s.session.id, shot: { ...(await shootShelf(s.session.id, fs[0], { place: s.nextPlace })), queue: fs.slice(1) } });
    } catch (e) {
      toast(e instanceof ApiError && e.status === 402 ? "AI кредит дууссан." : e instanceof Error ? e.message : "Алдаа", "danger");
    } finally {
      setBusy(false);
    }
  }
  async function manual() {
    try {
      const s = await ensure();
      if (s) nav.go({ k: "count", sid: s.session.id });
    } catch (e) {
      toast(e instanceof Error ? e.message : "Алдаа", "danger");
    }
  }

  const active = (list ?? []).filter((s) => s.status === "counting" || s.status === "review");
  const counting = active.find((s) => s.status === "counting" && s.scope === "all") ?? active.find((s) => s.status === "counting");
  const reviews = active.filter((s) => s.status === "review");
  const past = (list ?? []).filter((s) => s.status !== "counting" && s.status !== "review").slice(0, 5);

  return (
    <div className="pb-10">
      <header className="flex items-center gap-3 px-4 pb-2 pt-[max(env(safe-area-inset-top),16px)]">
        <div className="grid size-11 shrink-0 place-items-center rounded-[14px] bg-accent text-white">
          <Icon name="box" size={24} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[19px] font-bold text-ink">{me.tenant.name || "Тооллого"}</div>
          <div className="truncate text-[13.5px] text-mute">
            {me.user.name} · {ROLE[me.user.role] ?? me.user.role}
          </div>
        </div>
        <button type="button" onClick={() => nav.go({ k: "who" })} className="sp-tap h-[44px] rounded-full bg-[var(--sp-fill)] px-4 text-[14px] font-semibold text-ink">
          Солих
        </button>
      </header>

      <main className="space-y-4 px-4 pt-3">
        {pending > 0 && <InfoNote tone="warn">{pending} тоо илгээгдээгүй байна. Интернэт сэргэхэд автоматаар илгээнэ.</InfoNote>}
        {err && <ErrorNote>{err}</ErrorNote>}

        <label
          htmlFor="start-cam"
          className={cx("sp-tap flex min-h-[168px] cursor-pointer flex-col items-center justify-center gap-2 rounded-[26px] bg-accent px-6 text-center text-white shadow-[0_16px_36px_-18px_rgba(0,70,226,0.8)]", (busy || !list) && "pointer-events-none opacity-60")}
        >
          <CamIcon size={44} />
          <span className="text-[24px] font-bold">Тоолж эхлэх</span>
          <span className="text-[14.5px] text-white/85">{counting ? `${counting.name} · ${counting.done}/${counting.total}` : "Тавиурын зургийг аваарай — AI нүүрийг тоолно"}</span>
        </label>
        <CameraInput id="start-cam" onFile={(f) => void start(f)} />
        <label htmlFor="many-cam" className={cx("sp-tap -mt-1 flex h-[44px] cursor-pointer items-center justify-center gap-1.5 text-[14.5px] font-semibold text-accent", (busy || !list) && "pointer-events-none opacity-60")}>
          <Icon name="grid" size={18} /> Олон зураг нэг дор сонгох
        </label>
        <CameraInput id="many-cam" gallery onFiles={(fs) => void startMany(fs)} />

        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={() => void manual()} className="sp-tap flex min-h-[64px] items-center justify-center gap-2 rounded-[18px] bg-paper text-[15.5px] font-semibold text-ink shadow-[0_0_0_0.5px_var(--sp-sep)]">
            <Icon name="list" size={22} className="text-accent" /> Жагсаалт, гараар
          </button>
          <button type="button" onClick={() => nav.go({ k: "new", sid: counting?.id })} className="sp-tap flex min-h-[64px] items-center justify-center gap-2 rounded-[18px] bg-paper text-[15.5px] font-semibold text-ink shadow-[0_0_0_0.5px_var(--sp-sep)]">
            <Icon name="plus" size={22} className="text-accent" /> Шинэ бараа
          </button>
        </div>

        {counting && (
          <button type="button" onClick={() => nav.go({ k: "submit", sid: counting.id })} className="sp-tap flex min-h-[56px] w-full items-center justify-center gap-2 rounded-[18px] bg-[var(--sp-fill)] text-[16px] font-semibold text-ink">
            <Icon name="send" size={20} /> Тоолж дууслаа — илгээх
          </button>
        )}

        {mgr && reviews.length > 0 && (
          <section className="space-y-2">
            <h2 className="px-1 text-[15px] font-semibold text-mute">Хянах</h2>
            {reviews.map((s) => (
              <button key={s.id} type="button" onClick={() => nav.go({ k: "review", sid: s.id })} className="sp-tap flex min-h-[64px] w-full items-center gap-3 rounded-[18px] bg-paper px-4 text-left shadow-[0_0_0_0.5px_var(--sp-sep)]">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[16px] font-bold text-ink">{s.name}</div>
                  <div className="text-[13.5px] text-mute tnum">
                    {s.done}/{s.total} тоолсон{s.critical ? ` · ${s.critical} дахин тоолох` : ""}
                  </div>
                </div>
                <span className="text-[14.5px] font-semibold text-accent">Хянаж батлах →</span>
              </button>
            ))}
          </section>
        )}
        {!mgr && reviews.length > 0 && <InfoNote tone="warn">Илгээсэн тооллогыг менежер хянаж байна.</InfoNote>}

        {past.length > 0 && (
          <section>
            <h2 className="mb-2 px-1 text-[15px] font-semibold text-mute">Сүүлийн тооллогууд</h2>
            <div className="divide-y divide-[var(--sp-sep)] overflow-hidden rounded-[20px] bg-paper shadow-[0_0_0_0.5px_var(--sp-sep)]">
              {past.map((s) => (
                <button key={s.id} type="button" disabled={!mgr} onClick={() => nav.go({ k: "review", sid: s.id })} className={cx("flex min-h-[56px] w-full items-center gap-3 px-4 py-2 text-left", mgr && "sp-tap")}>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[15px] font-semibold text-ink">{s.name}</div>
                    <div className="text-[13px] text-mute tnum">
                      {s.done}/{s.total} · {s.decidedBy ?? s.createdBy}
                    </div>
                  </div>
                  <SessionChip status={s.status} />
                </button>
              ))}
            </div>
          </section>
        )}
        <button type="button" onClick={onLogout} className="sp-tap mx-auto block h-[48px] px-4 text-[14.5px] font-semibold text-danger">
          Гарах
        </button>
      </main>
      {busy && (
        <div className="fixed inset-0 z-[60] grid place-items-center bg-black/45 px-8" role="status" aria-live="polite">
          <div className="w-full max-w-[320px] rounded-[22px] bg-paper p-6 text-center">
            <div className="mx-auto size-10 animate-spin rounded-full border-[3px] border-accent-soft border-t-accent" />
            <div className="mt-4 text-[17px] font-semibold text-ink">AI тавиурыг тоолж байна…</div>
            <div className="mt-1 text-[14px] text-mute">10–30 секунд</div>
          </div>
        </div>
      )}
    </div>
  );
}
