"use client";

/** 5-р дэлгэц «Илгээх»: тоолоогүй барааны жагсаалт → менежерт илгээх. */
import { useEffect, useState } from "react";
import { Icon } from "@/components/sp/icons";
import { Btn, toast } from "@/components/sp/ui";
import { call, flushQueue } from "./api";
import type { Nav } from "./CountApp";
import type { SessionFull } from "./types";
import { BottomBar, ErrorNote, InfoNote, TopBar } from "./ui";

export function Submit({ sid, nav, onDone, pending }: { sid: string; nav: Nav; onDone: () => void; pending: number }) {
  const [data, setData] = useState<SessionFull | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    call<SessionFull>(`/api/v1/inventory/sessions/${encodeURIComponent(sid)}`)
      .then(setData)
      .catch((e) => setErr(e instanceof Error ? e.message : "Алдаа"));
  }, [sid]);

  const open = (data?.lines ?? []).filter((l) => l.status === "pending" || l.status === "recount");
  async function submit() {
    setBusy(true);
    setErr(null);
    try {
      if (pending) await flushQueue();
      await call(`/api/v1/inventory/sessions/${encodeURIComponent(sid)}`, { method: "PATCH", json: { action: "submit" } });
      toast("Менежерт илгээлээ", "ok");
      onDone();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Илгээж чадсангүй");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="pb-[120px]">
      <TopBar title="Илгээх" sub={data?.session.name} onBack={nav.back} />
      <div className="space-y-4 px-4 pt-4">
        {!data && !err && <div className="py-10 text-center text-[15px] text-mute">Ачаалж байна…</div>}
        {pending > 0 && <InfoNote tone="warn">{pending} тоо илгээгдээгүй байна — эхлээд интернэтэд холбогдоно уу.</InfoNote>}
        {data && (
          <>
            <div className="rounded-[20px] bg-paper p-5 text-center shadow-[0_0_0_0.5px_var(--sp-sep)]">
              <div className="text-[44px] font-bold leading-none text-ink tnum">
                {data.progress.done}
                <span className="text-[24px] text-mute">/{data.progress.total}</span>
              </div>
              <div className="mt-2 text-[15px] text-mute">бараа тоолсон</div>
            </div>
            {open.length === 0 ? (
              <InfoNote tone="ok">Бүх барааг тооллоо. Илгээхэд бэлэн.</InfoNote>
            ) : (
              <>
                <InfoNote tone="warn">{open.length} бараа тоолоогүй. Тэдгээрийн үлдэгдэл өөрчлөгдөхгүй. Тоолох бол «Буцах» дарна уу.</InfoNote>
                <ul className="divide-y divide-[var(--sp-sep)] overflow-hidden rounded-[20px] bg-paper shadow-[0_0_0_0.5px_var(--sp-sep)]">
                  {open.slice(0, 50).map((l) => (
                    <li key={l.productId} className="flex min-h-[52px] items-center gap-3 px-4 py-2">
                      <Icon name="clock" size={18} className="text-mute" />
                      <span className="min-w-0 flex-1 truncate text-[15.5px] text-ink">{l.name}</span>
                      {l.status === "recount" && <span className="text-[13px] font-semibold text-danger">Дахин тоолох</span>}
                    </li>
                  ))}
                  {open.length > 50 && <li className="px-4 py-3 text-[14px] text-mute">… бас {open.length - 50}</li>}
                </ul>
              </>
            )}
          </>
        )}
        {err && <ErrorNote>{err}</ErrorNote>}
      </div>
      <BottomBar>
        <Btn size="xl" block loading={busy} disabled={!data || data.progress.done === 0 || data.session.status !== "counting"} onClick={() => void submit()}>
          Менежерт илгээх
        </Btn>
      </BottomBar>
    </div>
  );
}
