"use client";

/**
 * 6-р дэлгэц «Хянах» (менежер): зөрүүгээр эрэмбэлсэн, түвшин өнгө+үгээр, «Дахин тоолуулах» / «Батлах».
 * Батлахад ПОС-ын үлдэгдэл зөвхөн зөрүүгээр (delta) засагдана.
 */
import { useCallback, useEffect, useState } from "react";
import { Btn, cx, Sheet, toast } from "@/components/sp/ui";
import { ApiError, call } from "./api";
import type { Nav } from "./CountApp";
import type { Me, Variance } from "./types";
import { BottomBar, ErrorNote, fmt, InfoNote, LevelChip, LineChip, money, SessionChip, TopBar } from "./ui";

export function Review({ sid, me, nav, onDone }: { sid: string; me: Me; nav: Nav; onDone: () => void }) {
  const [v, setV] = useState<Variance | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<"approve" | "reject" | null>(null);
  const [reason, setReason] = useState<null | string>(null);
  const [rej, setRej] = useState(false);
  const mgr = me.user.role === "owner" || me.user.role === "manager";

  const load = useCallback(async () => {
    try {
      setV(await call<Variance>(`/api/v1/inventory/sessions/${encodeURIComponent(sid)}/variance`));
      setErr(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Алдаа");
    }
  }, [sid]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- серверээс татах
    void load();
  }, [load]);

  const crit = (v?.lines ?? []).filter((l) => l.level === "critical" && l.status === "counted");
  async function approve(override?: string) {
    setBusy("approve");
    setErr(null);
    try {
      const r = await call<{ summary: string }>(`/api/v1/inventory/sessions/${encodeURIComponent(sid)}/approve`, { method: "POST", json: override ? { override_reason: override } : {} });
      toast(r.summary, "ok");
      setReason(null);
      onDone();
    } catch (e) {
      if (e instanceof ApiError && e.code === "critical") setReason("");
      else setErr(e instanceof ApiError && e.code === "same_person" ? "Өөрийн илгээсэн тооллогыг өөр менежер батална. «Солих» дарж өөр менежерээр нэвтэрнэ үү." : e instanceof Error ? e.message : "Батлаж чадсангүй");
      void load();
    } finally {
      setBusy(null);
    }
  }
  async function reject(note: string) {
    setBusy("reject");
    try {
      const r = await call<{ recount: number }>(`/api/v1/inventory/sessions/${encodeURIComponent(sid)}/reject`, { method: "POST", json: { reason: note } });
      toast(`${r.recount} барааг дахин тоолуулахаар буцаалаа`, "ok");
      setRej(false);
      onDone();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Алдаа");
    } finally {
      setBusy(null);
    }
  }

  const review = v?.session.status === "review";
  return (
    <div className="pb-[130px]">
      <TopBar title="Хянах" sub={v?.session.name} onBack={nav.back} right={v && <span className="pr-2"><SessionChip status={v.session.status} /></span>} />
      <div className="space-y-4 px-4 pt-4">
        {!v && !err && <div className="py-10 text-center text-[15px] text-mute">Ачаалж байна…</div>}
        {err && <ErrorNote>{err}</ErrorNote>}
        {v && (
          <>
            <div className="grid grid-cols-2 gap-2">
              <Stat label="Дутагдал" value={money(-v.shortage)} tone="danger" />
              <Stat label="Илүүдэл" value={money(v.surplus)} tone="ok" />
              <div className="col-span-2">
                <Stat label="Цэвэр зөрүү" value={money(v.net)} tone={v.net < 0 ? "danger" : "ink"} />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2 text-center">
              <Count n={v.levels.ok} label="Таарсан" cls="bg-ok-soft text-ok" />
              <Count n={v.levels.warn} label="Шалгах" cls="bg-warn-soft text-warn" />
              <Count n={v.levels.critical} label="Дахин тоолох" cls="bg-danger-soft text-danger" />
            </div>
            <div className="text-[14px] text-mute">
              {v.counted}/{v.total} тоолсон{v.uncounted ? ` · ${v.uncounted} тоолоогүй (өөрчлөгдөхгүй)` : ""}
              {v.session.submittedBy ? ` · илгээсэн: ${v.session.submittedBy}` : ""}
            </div>
            {crit.length > 0 && review && <InfoNote tone="warn">{crit.length} бараа «Дахин тоолох» түвшинд байна. Дахин тоолуулах эсвэл шалтгаан бичиж батална уу.</InfoNote>}
            <ul className="divide-y divide-[var(--sp-sep)] overflow-hidden rounded-[20px] bg-paper shadow-[0_0_0_0.5px_var(--sp-sep)]">
              {v.lines.map((l) => (
                <li key={l.productId} className="px-4 py-3">
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1 text-[15.5px] font-semibold text-ink">{l.name}</div>
                    {l.level && (l.status === "counted" || l.status === "recounted") ? <LevelChip level={l.level} /> : <LineChip status={l.status} />}
                  </div>
                  {l.counted != null && (
                    <div className="mt-1 flex flex-wrap gap-x-3 text-[14px] text-mute tnum">
                      {l.byPlace && l.byPlace.length > 1 && <span className="w-full">{l.byPlace.map((x) => `${x.place}: ${fmt(x.qty)}`).join(" · ")}</span>}
                      <span>Систем {fmt(l.system)}</span>
                      <span>→ Тоолсон {fmt(l.counted)}</span>
                      <span className={cx("font-semibold", (l.variance ?? 0) < 0 ? "text-danger" : (l.variance ?? 0) > 0 ? "text-ok" : "text-ink")}>
                        {(l.variance ?? 0) > 0 ? "+" : ""}
                        {fmt(l.variance)} · {money(l.value)}
                      </span>
                    </div>
                  )}
                </li>
              ))}
            </ul>
            {v.methods.length > 0 && <div className="text-[13px] text-mute">Арга: {v.methods.map((m) => `${m.label} ${m.pct}%`).join(" · ")}</div>}
          </>
        )}
      </div>

      {v && review && mgr && (
        <BottomBar>
          <div className="grid grid-cols-[auto_1fr] gap-2">
            <Btn size="xl" variant="gray" disabled={!!busy} onClick={() => setRej(true)}>
              Дахин тоолуулах
            </Btn>
            <Btn size="xl" loading={busy === "approve"} disabled={!!busy} onClick={() => (crit.length ? setReason("") : void approve())}>
              Батлах
            </Btn>
          </div>
        </BottomBar>
      )}

      <Sheet open={reason !== null} onClose={() => setReason(null)} title="Шалтгаантай батлах">
        <div className="space-y-3 px-4 pb-6 pt-2">
          <p className="text-[15px] text-mute">«Дахин тоолох» түвшний барааг дахин тоолуулалгүй батлах шалтгаан (жишээ: «Гэмтэлтэй бараа хассан»).</p>
          <textarea value={reason ?? ""} onChange={(e) => setReason(e.target.value.slice(0, 300))} rows={3} className="sp-field w-full py-3 text-[16px]" aria-label="Шалтгаан" />
          <Btn size="xl" block loading={busy === "approve"} disabled={(reason ?? "").trim().length < 3} onClick={() => void approve((reason ?? "").trim())}>
            Шалтгаантай батлах
          </Btn>
        </div>
      </Sheet>
      <RejectSheet open={rej} onClose={() => setRej(false)} count={crit.length} busy={busy === "reject"} onSend={reject} />
    </div>
  );
}

function RejectSheet({ open, onClose, count, busy, onSend }: { open: boolean; onClose: () => void; count: number; busy: boolean; onSend: (n: string) => void }) {
  const [note, setNote] = useState("");
  return (
    <Sheet open={open} onClose={onClose} title="Дахин тоолуулах">
      <div className="space-y-3 px-4 pb-6 pt-2">
        <p className="text-[15px] text-mute">{count ? `${count} «Дахин тоолох» бараа ажилтанд буцаж очно.` : "Тооллогыг ажилтанд буцаана (тоонууд хэвээр)."}</p>
        <textarea value={note} onChange={(e) => setNote(e.target.value.slice(0, 300))} rows={2} placeholder="Ажилтанд хэлэх үг (заавал биш)" className="sp-field w-full py-3 text-[16px]" aria-label="Тэмдэглэл" />
        <Btn size="xl" block loading={busy} onClick={() => onSend(note.trim())}>
          Буцааж илгээх
        </Btn>
      </div>
    </Sheet>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone: "danger" | "ok" | "ink" }) {
  return (
    <div className="rounded-[16px] bg-paper p-3 shadow-[0_0_0_0.5px_var(--sp-sep)]">
      <div className="text-[12.5px] text-mute">{label}</div>
      <div className={cx("mt-0.5 whitespace-nowrap text-[18px] font-bold tnum", tone === "danger" ? "text-danger" : tone === "ok" ? "text-ok" : "text-ink")}>{value}</div>
    </div>
  );
}
function Count({ n, label, cls }: { n: number; label: string; cls: string }) {
  return (
    <div className={cx("rounded-[16px] px-2 py-2.5", cls)}>
      <div className="text-[22px] font-bold leading-none tnum">{n}</div>
      <div className="mt-1 text-[12.5px] font-semibold">{label}</div>
    </div>
  );
}
