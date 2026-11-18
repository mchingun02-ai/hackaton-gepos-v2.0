"use client";

import { useEffect, useState } from "react";
import { defaultServer, useHq } from "@/lib/hq";
import { useStore } from "@/lib/store";
import { IconLock } from "@/components/icons";
import { PrimaryButton } from "@/components/ui";

/**
 * Төв системийн хоёр харагдац:
 *  - HqOverlay — төвөөс түгжвэл бүх дэлгэцийг хаана; мессеж ирвэл мэдэгдэл.
 *  - HqSettings — «Тохиргоо» хуудсанд холбох / төлөв.
 */

export function HqOverlay() {
  const hq = useHq();

  return (
    <>
      {hq.locked && (
        <div className="fixed inset-0 z-[100] grid place-items-center bg-[#0b0b0d]/95 p-6 text-center text-white backdrop-blur" role="alertdialog" aria-modal="true" aria-labelledby="hq-lock-title">
          <div className="max-w-[420px]">
            <span className="mx-auto grid size-16 place-items-center rounded-2xl bg-white/10 text-white [&_svg]:size-7">
              <IconLock />
            </span>
            <h2 id="hq-lock-title" className="mt-6 text-[30px] font-extrabold leading-tight tracking-[-0.04em]">
              Касс түр хаагдсан<span className="text-accent">.</span>
            </h2>
            <p className="mt-3 text-[15px] leading-relaxed text-white/70">
              {hq.reason ?? "Төвөөс түгжсэн"}. Gerege Systems-тэй холбогдоно уу — <span className="tnum font-semibold text-white">7777-3773</span>
            </p>
            {hq.device && (
              <p className="tnum mt-6 text-[12px] tracking-[0.08em] text-white/40">
                {hq.device.serial} · {hq.device.merchant ?? ""} {hq.device.branch ? `· ${hq.device.branch}` : ""}
              </p>
            )}
            <button type="button" onClick={hq.syncNow} className="press mt-6 h-11 rounded-xl bg-white/10 px-5 text-[14px] font-semibold text-white hover:bg-white/15">
              Дахин шалгах
            </button>
          </div>
        </div>
      )}

      {hq.message && !hq.locked && (
        <div className="fixed inset-x-0 top-3 z-[90] flex justify-center px-3" role="status">
          <div className="flex max-w-[560px] items-start gap-3 rounded-2xl bg-ink px-4 py-3 text-paper shadow-[0_18px_40px_-18px_rgb(0_0_0/0.6)]">
            <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-full bg-accent text-[13px] font-bold text-[color:var(--accent-ink)]">✉</span>
            <span className="min-w-0 flex-1">
              <span className="block text-[11px] font-semibold uppercase tracking-[0.12em] text-paper/60">Төвөөс мессеж</span>
              <span className="block text-[14px] font-semibold leading-snug">{hq.message}</span>
            </span>
            <button type="button" onClick={hq.dismissMessage} className="press shrink-0 rounded-lg px-2 py-1 text-[12px] font-bold text-paper/70 hover:text-paper">
              Ойлголоо
            </button>
          </div>
        </div>
      )}
    </>
  );
}

const agoText = (t: number) => {
  const s = Math.round((Date.now() - t) / 1000);
  return s < 60 ? `${s} сек өмнө` : `${Math.round(s / 60)} мин өмнө`;
};

export function HqSettings() {
  const hq = useHq();
  // Төвөөс салгах — серверийн горимд зөвхөн эзэн
  const { mode, perms } = useStore();
  const canUnpair = mode === "demo" || perms.manageStaff;
  // Холбох маягт зөвхөн нэвтэрсний дараа (клиентэд) харагдана
  const [server, setServer] = useState(() => hq.server || defaultServer());
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [, tick] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => tick((n) => n + 1), 5_000);
    return () => clearInterval(timer);
  }, []);

  const submit = async () => {
    setBusy(true);
    setError((await hq.pair(server, code)) ?? "");
    setBusy(false);
    setCode("");
  };

  const dot = hq.status === "online" ? "bg-[#22c55e]" : hq.status === "offline" ? "bg-warn" : "bg-hair";

  return (
    <div className="rounded-[18px] bg-paper p-5 ring-1 ring-inset ring-hair">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-[15px] font-bold tracking-[-0.02em] text-ink">Gerege төв систем</h2>
        <span className="flex items-center gap-2 text-[13px] font-semibold text-ink-2">
          <span className={`size-2 rounded-full ${dot}`} />
          {hq.status === "online" ? "Холбогдсон" : hq.status === "offline" ? "Офлайн" : "Холбогдоогүй"}
        </span>
      </div>

      {hq.paired ? (
        <>
          <ul className="mt-2 divide-y divide-hair text-[14px]">
            {[
              ["Сериал", hq.device?.serial ?? "—"],
              ["Байгууллага", hq.device?.merchant ?? "—"],
              ["Салбар", hq.device?.branch ?? "—"],
              ["Е-баримтын POS", hq.device?.posNo ?? "—"],
              ["Сүүлд мэдээлсэн", hq.lastSync ? agoText(hq.lastSync) : "—"],
              ["Сервер", hq.server],
            ].map(([label, value]) => (
              <li key={label} className="flex min-h-11 items-center justify-between gap-3 py-2">
                <span className="text-ink-2">{label}</span>
                <span className="tnum truncate font-semibold text-ink">{value}</span>
              </li>
            ))}
          </ul>
          {hq.lastError && <p className="mt-2 text-[13px] font-semibold text-warn">{hq.lastError}</p>}
          <div className="mt-3 flex gap-2">
            <button type="button" onClick={hq.syncNow} className="press h-11 flex-1 rounded-xl bg-stage text-[14px] font-semibold text-ink hover:bg-hair">
              Одоо мэдээлэх
            </button>
            {canUnpair && (
            <button
              type="button"
              onClick={() => window.confirm("Төв системээс салгах уу? Дахин холбоход шинэ код хэрэгтэй.") && hq.unpair()}
              className="press h-11 rounded-xl px-4 text-[14px] font-semibold text-mute hover:bg-stage hover:text-danger"
            >
              Салгах
            </button>
            )}
          </div>
        </>
      ) : (
        <div className="mt-3 space-y-3">
          <p className="text-[13px] leading-relaxed text-mute">
            Gerege Systems-ийн ажилтан «Төхөөрөмжийн төв»-өөс 6 оронтой холбох код өгнө. Холбогдсоны дараа энэ касс
            ажиллаж байгаа эсэх, борлуулалт нь төвд харагдана.
          </p>
          <label className="block">
            <span className="meta mb-1.5 block">Төв системийн хаяг</span>
            <input
              value={server}
              onChange={(e) => setServer(e.target.value)}
              className="h-12 w-full rounded-xl bg-stage px-3.5 text-[15px] text-ink ring-1 ring-inset ring-transparent focus:bg-paper focus:outline-none focus:ring-accent"
            />
          </label>
          <label className="block">
            <span className="meta mb-1.5 block">Холбох код</span>
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              inputMode="numeric"
              placeholder="000000"
              className="tnum h-14 w-full rounded-xl bg-stage px-3.5 text-center text-[24px] font-bold tracking-[0.3em] text-ink ring-1 ring-inset ring-transparent placeholder:text-mute focus:bg-paper focus:outline-none focus:ring-accent"
            />
          </label>
          {(error || hq.lastError) && <p className="text-[13px] font-semibold text-warn">{error || hq.lastError}</p>}
          <PrimaryButton onClick={submit} disabled={code.length !== 6 || busy}>
            {busy ? "Холбож байна…" : "Холбох"}
          </PrimaryButton>
        </div>
      )}
    </div>
  );
}
