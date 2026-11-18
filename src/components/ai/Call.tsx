"use client";

/*
 * AI дуудлагын төв (/ai/call?w=gwt_…). Харилцагч «Залгах» дарж монголоор ярина:
 * яриа дуусахыг автоматаар таниад → Qwen Omni (сонсох) → AI ажилтан → Qwen TTS (дуугаар хариулах).
 * AI ярьж байх үед микрофон түр унтарна (цуурай давтагдахгүй).
 */
import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/sp/icons";
import { cx } from "@/components/sp/ui";
import { listen, type Recorder } from "./client";
import { visitorToken } from "./CustomerChat";

type Info = { store: string; agent: string; greeting: string; color: string; channels: { voice: boolean } };
type Line = { who: "me" | "ai" | "sys"; text: string; steps?: { title: string; summary: string; ok: boolean }[] };

export function Call() {
  const [w, setW] = useState("");
  const [info, setInfo] = useState<Info | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [state, setState] = useState<"idle" | "listening" | "thinking" | "speaking">("idle");
  const [lines, setLines] = useState<Line[]>([]);
  const [secs, setSecs] = useState(0);
  const [level, setLevel] = useState(0);
  const [caption, setCaption] = useState("");
  const [voiceOut, setVoiceOut] = useState(true);
  const rec = useRef<Recorder | null>(null);
  const audio = useRef<HTMLAudioElement | null>(null);
  const token = useRef("");
  const t0 = useRef(0);
  const end = useRef<HTMLDivElement>(null);
  const queue = useRef(Promise.resolve());

  useEffect(() => {
    const q = new URLSearchParams(location.search);
    const ww = q.get("w") || "";
    if (!ww) {
      setErr(q.get("m") ? "Энэ холбоос хуучирсан. Дэлгүүрээс шинэ QR код авна уу." : "Холбоос буруу байна.");
      return;
    }
    setW(ww);
    fetch(`/api/agent/public/info?w=${encodeURIComponent(ww)}`)
      .then(async (r) => (r.ok ? setInfo(await r.json()) : setErr((await r.json()).error)))
      .catch(() => setErr("Холбогдож чадсангүй"));
    return () => rec.current?.stop();
  }, []);
  useEffect(() => {
    end.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [lines.length]);
  useEffect(() => {
    if (state === "idle") return;
    const t = setInterval(() => {
      setSecs(Math.round((Date.now() - t0.current) / 1000));
      setLevel(rec.current?.level() ?? 0);
    }, 120);
    return () => clearInterval(t);
  }, [state]);

  function play(url: string | null) {
    return new Promise<void>((res) => {
      if (!url) return res();
      const a = audio.current ?? new Audio();
      audio.current = a;
      // <audio> толгой илгээж чадахгүй — зочны токенийг ?token=-оор
      a.src = `${url}?token=${encodeURIComponent(token.current)}`;
      a.onended = () => res();
      a.onerror = () => res();
      void a.play().catch(() => res());
    });
  }

  async function turn(wav: Blob, seconds: number) {
    rec.current?.setPaused(true);
    setState("thinking");
    try {
      const fd = new FormData();
      fd.append("audio", wav, "turn.wav");
      fd.append("seconds", String(seconds));
      const r = await fetch("/api/agent/public/voice", { method: "POST", headers: { Authorization: `Bearer ${token.current}` }, body: fd });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      if (!j.heard) {
        setState("listening");
        rec.current?.setPaused(false);
        return;
      }
      setCaption(j.reply ?? "");
      if (j.reply && !j.audio) setVoiceOut(false);
      setLines((x) => [...x, { who: "me", text: j.heard }, ...(j.reply ? [{ who: "ai" as const, text: j.reply, steps: j.steps }] : [{ who: "sys" as const, text: "Ажилтанд дамжууллаа. Удахгүй холбогдоно." }])]);
      if (j.audio) {
        setState("speaking");
        await play(j.audio);
      }
    } catch (e) {
      setLines((x) => [...x, { who: "sys", text: e instanceof Error ? e.message : "Алдаа" }]);
    }
    if (rec.current) {
      setState("listening");
      rec.current.setPaused(false);
    }
  }

  async function start() {
    try {
      // дуудлага бүр шинэ яриа — шинэ зочны токен
      token.current = await visitorToken(w, "voice", true);
      // iOS: дуу тоглуулах эрхийг хэрэглэгчийн товшилтоор нээнэ
      audio.current = new Audio();
      void audio.current.play().catch(() => {});
      t0.current = Date.now();
      setLines([{ who: "ai", text: info?.greeting ?? "Сайн байна уу!" }]);
      setCaption(info?.greeting ?? "Сайн байна уу!");
      const r = await listen((wav, sec) => {
        queue.current = queue.current.then(() => turn(wav, sec));
      });
      rec.current = r;
      setState("listening");
    } catch {
      setErr("Микрофон нээгдсэнгүй. Хөтчийн тохиргооноос зөвшөөрнө үү.");
    }
  }
  function hang() {
    rec.current?.stop();
    rec.current = null;
    audio.current?.pause();
    setState("idle");
  }

  const label = { idle: "", listening: "Сонсож байна…", thinking: "Бодож байна…", speaking: `${info?.agent ?? "AI"} ярьж байна` }[state];
  if (err) return <div className="grid h-dvh place-items-center p-6 text-center text-mute">{err}</div>;
  return (
    <div className="mx-auto flex h-dvh max-w-[480px] flex-col bg-[#0b0b0d] text-white">
      <div className="px-6 pt-10 text-center">
        <div className="text-[14px] opacity-60">{state === "idle" ? "AI дуудлагын төв" : `${String(Math.floor(secs / 60)).padStart(2, "0")}:${String(secs % 60).padStart(2, "0")}`}</div>
        <div className="mt-1 text-[26px] font-bold">{info?.store ?? "…"}</div>
        <div className="text-[14px] opacity-70">{info?.agent} · монгол хэлээр</div>
      </div>
      <div className="grid flex-1 place-items-center">
        <div className="relative grid size-40 place-items-center">
          <div
            className={cx("absolute inset-0 rounded-full transition-transform duration-100", state === "speaking" && "sp-pulse")}
            style={{ background: info?.color || "#ff6a00", opacity: 0.18, transform: `scale(${1 + (state === "listening" ? Math.min(level * 8, 0.5) : 0)})` }}
          />
          <div className="relative grid size-28 place-items-center rounded-full" style={{ background: info?.color || "#ff6a00" }}>
            <Icon name={state === "thinking" ? "sparkle" : "phone"} size={44} className={cx(state === "thinking" && "sp-ai-star")} />
          </div>
        </div>
        <div className="h-6 text-[15px] opacity-80">{label}</div>
        {state !== "idle" && caption && (
          <div className="mx-6 mt-2 max-h-[22dvh] overflow-y-auto rounded-[18px] bg-white/10 px-4 py-3 text-center text-[18px] font-medium leading-snug">{caption}</div>
        )}
      </div>
      <div className="sp-scroll max-h-[34dvh] space-y-2 overflow-y-auto px-5">
        {lines.map((l, i) => (
          <div key={i} className={cx("text-[14.5px] leading-snug", l.who === "me" ? "text-right opacity-90" : l.who === "sys" ? "text-center text-[13px] opacity-60" : "")}>
            {l.who !== "sys" && <span className="mr-1 text-[11px] uppercase opacity-50">{l.who === "me" ? "Та" : info?.agent}</span>}
            {l.text}
            {!!l.steps?.length && (
              <div className="mt-1 flex flex-wrap gap-1">
                {l.steps.map((s, j) => (
                  <span key={j} className="rounded-full bg-white/10 px-2 py-0.5 text-[11px]">
                    {s.title}: {s.summary}
                  </span>
                ))}
              </div>
            )}
          </div>
        ))}
        <div ref={end} />
      </div>
      <div className="grid place-items-center pb-[max(32px,env(safe-area-inset-bottom))] pt-6">
        {state === "idle" ? (
          <button type="button" onClick={() => void start()} disabled={!info?.channels.voice} className="sp-tap grid size-20 place-items-center rounded-full bg-[#22c55e] disabled:opacity-40" aria-label="Залгах">
            <Icon name="phone" size={34} />
          </button>
        ) : (
          <button type="button" onClick={hang} className="sp-tap grid size-20 place-items-center rounded-full bg-[#ef4444]" aria-label="Таслах">
            <Icon name="phone" size={34} className="rotate-[135deg]" />
          </button>
        )}
        <div className="mt-3 text-[12px] opacity-50">{info && !info.channels.voice ? "Дуудлага одоогоор хаалттай" : voiceOut ? "Qwen Omni · Alibaba Cloud" : "Qwen Omni сонсоно · хариу дэлгэц дээр текстээр"}</div>
      </div>
    </div>
  );
}
