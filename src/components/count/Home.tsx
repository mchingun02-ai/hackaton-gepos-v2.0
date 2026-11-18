"use client";

/** 2-р дэлгэц «Нүүр»: идэвхтэй тооллого (явц %), «Шинэ тооллого» (бүгд / ангилал), сүүлийн тооллогууд. */
import { useCallback, useEffect, useState } from "react";
import { Icon } from "@/components/sp/icons";
import { Btn, cx, Sheet, toast } from "@/components/sp/ui";
import { ApiError, call } from "./api";
import type { Nav } from "./CountApp";
import type { Me, SessionSummary } from "./types";
import { CamIcon, ErrorNote, InfoNote, SessionChip } from "./ui";

const ROLE: Record<string, string> = { owner: "Эзэмшигч", manager: "Менежер", staff: "Ажилтан" };

export function Home({ me, nav, pending, onLogout }: { me: Me; nav: Nav; pending: number; onLogout: () => void }) {
  const [list, setList] = useState<SessionSummary[] | null>(null);
  const [cats, setCats] = useState<string[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [pick, setPick] = useState(false);
  const [busy, setBusy] = useState(false);
  const mgr = me.user.role === "owner" || me.user.role === "manager";

  const load = useCallback(async () => {
    try {
      const j = await call<{ sessions: SessionSummary[]; categories: string[] }>("/api/v1/inventory/sessions");
      setList(j.sessions);
      setCats(j.categories);
      setErr(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Ачаалж чадсангүй");
    }
  }, []);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- серверээс татах
    void load();
  }, [load]);

  async function start(scopeRef?: string) {
    setBusy(true);
    try {
      const r = await call<{ session: { id: string } }>("/api/v1/inventory/sessions", { method: "POST", json: scopeRef ? { scope: "category", scopeRef } : { scope: "all" } });
      setPick(false);
      nav.go({ k: "count", sid: r.session.id });
    } catch (e) {
      if (e instanceof ApiError && e.code === "active_exists") {
        setPick(false);
        toast("Энэ хүрээнд дуусаагүй тооллого байна — үргэлжлүүлнэ үү", "ink");
        void load();
      } else toast(e instanceof Error ? e.message : "Алдаа", "danger");
    } finally {
      setBusy(false);
    }
  }

  const active = (list ?? []).filter((s) => s.status === "counting" || s.status === "review");
  const past = (list ?? []).filter((s) => s.status !== "counting" && s.status !== "review").slice(0, 8);
  const open = (s: SessionSummary) => (s.status === "review" && mgr ? nav.go({ k: "review", sid: s.id }) : s.status === "counting" ? nav.go({ k: "count", sid: s.id }) : mgr ? nav.go({ k: "review", sid: s.id }) : null);

  return (
    <div className="pb-[130px]">
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

      <main className="space-y-5 px-4 pt-3">
        {pending > 0 && <InfoNote tone="warn">{pending} тоо илгээгдээгүй байна. Интернэт сэргэхэд автоматаар илгээнэ.</InfoNote>}
        {err && <ErrorNote>{err}</ErrorNote>}
        {!list && !err && <div className="py-10 text-center text-[15px] text-mute">Ачаалж байна…</div>}

        {list && (
          <section>
            <h2 className="mb-2 px-1 text-[15px] font-semibold text-mute">Идэвхтэй тооллого</h2>
            {active.length === 0 ? (
              <div className="rounded-[20px] bg-paper p-5 text-center shadow-[0_0_0_0.5px_var(--sp-sep)]">
                <div className="mx-auto grid size-12 place-items-center rounded-full bg-accent-soft text-accent">
                  <Icon name="box" size={24} />
                </div>
                <div className="mt-3 text-[17px] font-semibold text-ink">Одоогоор тооллого алга</div>
                <div className="mt-1 text-[14.5px] text-mute">Доорх «Шинэ тооллого» товчийг дарж эхлүүлнэ үү.</div>
              </div>
            ) : (
              <div className="space-y-3">
                {active.map((s) => {
                  const pct = s.total ? Math.round((s.done / s.total) * 100) : 0;
                  return (
                    <button key={s.id} type="button" onClick={() => open(s)} className="sp-tap block w-full rounded-[20px] bg-paper p-4 text-left shadow-[0_0_0_0.5px_var(--sp-sep)]">
                      <div className="flex items-start gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-[17px] font-bold text-ink">{s.name}</div>
                          <div className="mt-0.5 text-[13.5px] text-mute">{s.createdBy}</div>
                        </div>
                        <SessionChip status={s.status} />
                      </div>
                      <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-[var(--sp-fill)]">
                        <div className="h-full rounded-full bg-accent transition-[width]" style={{ width: `${pct}%` }} />
                      </div>
                      <div className="mt-1.5 flex justify-between text-[14px]">
                        <span className="font-semibold text-ink tnum">
                          {s.done}/{s.total} тоолсон
                        </span>
                        <span className="text-mute tnum">{pct}%</span>
                      </div>
                      {s.status === "review" && !mgr && <div className="mt-2 text-[14px] text-warn">Менежер хянаж байна</div>}
                      {s.status === "review" && mgr && <div className="mt-2 text-[14px] font-semibold text-accent">Хянаж батлах →</div>}
                    </button>
                  );
                })}
              </div>
            )}
          </section>
        )}

        {past.length > 0 && (
          <section>
            <h2 className="mb-2 px-1 text-[15px] font-semibold text-mute">Сүүлийн тооллогууд</h2>
            <div className="divide-y divide-[var(--sp-sep)] overflow-hidden rounded-[20px] bg-paper shadow-[0_0_0_0.5px_var(--sp-sep)]">
              {past.map((s) => (
                <button key={s.id} type="button" disabled={!mgr} onClick={() => open(s)} className={cx("flex min-h-[60px] w-full items-center gap-3 px-4 py-2 text-left", mgr && "sp-tap")}>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[15.5px] font-semibold text-ink">{s.name}</div>
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

        <button type="button" onClick={() => nav.go({ k: "new" })} className="sp-tap flex min-h-[56px] w-full items-center gap-3 rounded-[18px] bg-paper px-4 text-left shadow-[0_0_0_0.5px_var(--sp-sep)]">
          <span className="grid size-10 place-items-center rounded-full bg-accent-soft text-accent">
            <CamIcon size={22} />
          </span>
          <span className="flex-1">
            <span className="block text-[16px] font-semibold text-ink">Шинэ бараа бүртгэх</span>
            <span className="block text-[13.5px] text-mute">Савлагааны зургаас</span>
          </span>
          <Icon name="chevron" size={20} className="text-mute" />
        </button>
        <button type="button" onClick={onLogout} className="sp-tap mx-auto block h-[48px] px-4 text-[14.5px] font-semibold text-danger">
          Гарах
        </button>
      </main>

      <div className="sp-material fixed inset-x-0 bottom-0 z-30 border-t border-[var(--sp-sep)] px-4 pb-[max(env(safe-area-inset-bottom),14px)] pt-3">
        <Btn size="xl" block icon="plus" onClick={() => setPick(true)} disabled={!list}>
          Шинэ тооллого
        </Btn>
      </div>

      <Sheet open={pick} onClose={() => setPick(false)} title="Юуг тоолох вэ?">
        <div className="space-y-2 px-4 pb-6 pt-2">
          <button type="button" disabled={busy} onClick={() => void start()} className="sp-tap flex min-h-[64px] w-full items-center gap-3 rounded-[18px] bg-accent px-4 text-left text-white disabled:opacity-50">
            <Icon name="grid" size={22} />
            <span className="flex-1">
              <span className="block text-[17px] font-bold">Бүх бараа</span>
              <span className="block text-[13.5px] text-white/85">Дэлгүүрийн бүх идэвхтэй бараа</span>
            </span>
          </button>
          {cats.length > 0 && <div className="px-1 pt-3 text-[14px] font-semibold text-mute">Эсвэл нэг ангилал</div>}
          {cats.map((c) => (
            <button key={c} type="button" disabled={busy} onClick={() => void start(c)} className="sp-tap flex min-h-[56px] w-full items-center gap-3 rounded-[16px] bg-paper px-4 text-left shadow-[0_0_0_0.5px_var(--sp-sep)] disabled:opacity-50">
              <Icon name="tag" size={20} className="text-accent" />
              <span className="flex-1 text-[16px] font-semibold text-ink">{c}</span>
              <Icon name="chevron" size={18} className="text-mute" />
            </button>
          ))}
        </div>
      </Sheet>
    </div>
  );
}
