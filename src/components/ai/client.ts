"use client";

/** AI ажилтны UI-ийн нийтлэг туслахууд: API дуудлага, шууд мэдэгдэл (SSE). */
import { useCallback, useEffect, useRef, useState } from "react";

/** Нэвтрэлт дууссан (401) үед самбар нэвтрэх дэлгэц рүү буцна */
export const AUTH_EVENT = "gp:auth";

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

/** API дуудлага — мерчантыг серверийн session cookie (gp_s) таньна, толгойд tenant илгээхгүй */
export async function aj<T = Record<string, unknown>>(path: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const headers: Record<string, string> = {};
  let body = init?.body;
  if (init?.json !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(init.json);
  }
  const r = await fetch(path, { ...init, body, headers: { ...headers, ...(init?.headers as Record<string, string>) }, cache: "no-store" });
  const j = await r.json().catch(() => ({}));
  if (r.status === 401 && typeof window !== "undefined") window.dispatchEvent(new Event(AUTH_EVENT));
  if (!r.ok) throw new ApiError((j as { error?: string }).error || `Алдаа (${r.status})`, r.status);
  return j as T;
}

export type AiEvent = { kind?: string; conv?: string; id?: string; status?: string; rev?: number };

/*
 * /api/agent/events — нэг EventSource-ийг бүх захиалагч хуваалцана (useLive бүр тусдаа холболт нээвэл
 * хөтчийн нэг хост руу 6 холболтын хязгаар дүүрч бусад таб, хүсэлт гацна).
 */
const aiSubs = new Set<(e: AiEvent) => void>();
let aiEs: EventSource | null = null;
function aiSubscribe(f: (e: AiEvent) => void) {
  aiSubs.add(f);
  if (!aiEs) {
    aiEs = new EventSource(`/api/agent/events`);
    aiEs.onmessage = (e) => {
      let ev: AiEvent;
      try {
        ev = JSON.parse(e.data);
      } catch {
        return; // ping
      }
      aiSubs.forEach((g) => g(ev));
    };
  }
  return () => {
    aiSubs.delete(f);
    if (!aiSubs.size) {
      aiEs?.close();
      aiEs = null;
    }
  };
}

/** AI-ийн шинэ мессеж, үйлдэл, тасалбар, кредит */
export function useAiEvents(onEvent: (e: AiEvent) => void) {
  const ref = useRef(onEvent);
  useEffect(() => {
    ref.current = onEvent;
  });
  useEffect(() => aiSubscribe((e) => ref.current(e)), []);
}

/** API-аас өгөгдөл татаж, AI үйл явдал ирэхэд дахин татна */
export function useLive<T>(path: string | null, kinds: string[] | "all" = "all") {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    if (!path) return;
    try {
      setData(await aj<T>(path));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Алдаа");
    }
  }, [path]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- серверээс татах (гадаад систем)
    void load();
  }, [load]);
  const t = useRef<ReturnType<typeof setTimeout> | null>(null);
  useAiEvents((e) => {
    if (kinds !== "all" && !kinds.includes(e.kind ?? "")) return;
    if (t.current) clearTimeout(t.current);
    t.current = setTimeout(() => void load(), 250);
  });
  return { data, error, reload: load, setData };
}

export const mnt = (n: number) => `${Math.round(n).toLocaleString("en-US")}₮`;
export const ago = (ms: number) => {
  const s = Math.round((Date.now() - ms) / 1000);
  if (s < 45) return "дөнгөж сая";
  if (s < 3600) return `${Math.round(s / 60)} мин өмнө`;
  if (s < 86400) return `${Math.round(s / 3600)} цагийн өмнө`;
  return new Date(ms).toLocaleDateString("mn-MN", { month: "short", day: "numeric" });
};
export const hm = (ms: number) => new Date(ms).toLocaleTimeString("mn-MN", { hour: "2-digit", minute: "2-digit", hour12: false });

export const CHANNEL: Record<string, { label: string; icon: "chat" | "globe" | "phone" | "sparkle" | "link" }> = {
  fb: { label: "Messenger", icon: "chat" },
  web: { label: "Вэб чат", icon: "globe" },
  voice: { label: "Дуудлага", icon: "phone" },
  director: { label: "Захирал", icon: "sparkle" },
  mcp: { label: "MCP", icon: "link" },
};

/* ───────── дуу бичих (16kHz mono WAV, яриа дуусахыг автоматаар таних) ───────── */

export function encodeWav(samples: Float32Array, rate: number) {
  const buf = new ArrayBuffer(44 + samples.length * 2);
  const v = new DataView(buf);
  const w = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  w(0, "RIFF");
  v.setUint32(4, 36 + samples.length * 2, true);
  w(8, "WAVE");
  w(12, "fmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, rate, true);
  v.setUint32(28, rate * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  w(36, "data");
  v.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    v.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return new Blob([buf], { type: "audio/wav" });
}

function downsample(input: Float32Array, from: number, to: number) {
  if (from === to) return input;
  const ratio = from / to;
  const out = new Float32Array(Math.floor(input.length / ratio));
  for (let i = 0; i < out.length; i++) {
    const a = Math.floor(i * ratio);
    const b = Math.min(input.length, Math.floor((i + 1) * ratio));
    let sum = 0;
    for (let j = a; j < b; j++) sum += input[j];
    out[i] = sum / Math.max(1, b - a);
  }
  return out;
}

export type Recorder = { stop: () => void; level: () => number; setPaused: (p: boolean) => void };

/**
 * Микрофоноос сонсож, яриа эхэлж дуусахыг (чимээгүй 900 мс) таниад нэг хэллэг бүрийг WAV болгож өгнө.
 * paused үед (AI ярьж байхад) сонсохгүй.
 */
export async function listen(onUtterance: (wav: Blob, seconds: number) => void, opts: { silenceMs?: number; threshold?: number } = {}): Promise<Recorder> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 } });
  const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new AC();
  const src = ctx.createMediaStreamSource(stream);
  const proc = ctx.createScriptProcessor(4096, 1, 1);
  const rate = ctx.sampleRate;
  const silenceMs = opts.silenceMs ?? 900;
  const threshold = opts.threshold ?? 0.018;
  let chunks: Float32Array[] = [];
  let speaking = false;
  let lastVoice = 0;
  let started = 0;
  let level = 0;
  let paused = false;
  let pre: Float32Array[] = [];
  proc.onaudioprocess = (e) => {
    const d = new Float32Array(e.inputBuffer.getChannelData(0));
    let sum = 0;
    for (let i = 0; i < d.length; i++) sum += d[i] * d[i];
    const rms = Math.sqrt(sum / d.length);
    level = rms;
    if (paused) {
      speaking = false;
      chunks = [];
      return;
    }
    const now = performance.now();
    if (rms > threshold) {
      if (!speaking) {
        speaking = true;
        started = now;
        chunks = [...pre];
      }
      lastVoice = now;
    }
    if (speaking) {
      chunks.push(d);
      if (now - lastVoice > silenceMs || now - started > 30_000) {
        speaking = false;
        const len = chunks.reduce((a, c) => a + c.length, 0);
        const all = new Float32Array(len);
        let o = 0;
        for (const c of chunks) {
          all.set(c, o);
          o += c.length;
        }
        chunks = [];
        const seconds = len / rate;
        if (now - started > 450) onUtterance(encodeWav(downsample(all, rate, 16000), 16000), seconds);
      }
    } else {
      pre = [...pre, d].slice(-3); // яриа эхлэхээс өмнөх ~0.25 сек
    }
  };
  src.connect(proc);
  proc.connect(ctx.destination);
  return {
    stop() {
      proc.disconnect();
      src.disconnect();
      stream.getTracks().forEach((t) => t.stop());
      void ctx.close();
    },
    level: () => level,
    setPaused(p) {
      paused = p;
    },
  };
}
