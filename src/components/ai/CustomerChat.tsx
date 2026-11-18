"use client";

/**
 * Харилцагчийн вэб чат (/ai/chat?w=gwt_…) — утсанд тохирсон, Messenger шиг энгийн.
 * widget токеноор (QR, холбоос) зочны токен (gvs_) авч, бүх хүсэлтэд Authorization-оор илгээнэ.
 */
import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/sp/icons";
import { cx, Spinner } from "@/components/sp/ui";
import { Md } from "./Md";

type Info = { brand?: { name?: string; logoUrl?: string; color?: string } | null; store: string; desc: string; color: string; agent: string; greeting: string; hours: string; channels: { web: boolean; voice: boolean } };
type M = { id: string; role: "user" | "assistant" | "staff"; text: string; at: number };

/** Widget токены payload-аас дэлгүүрийн нийтийн id (зөвхөн localStorage түлхүүрт) */
function widgetKey(w: string) {
  try {
    return JSON.parse(atob(w.slice(4).split(".")[0].replace(/-/g, "+").replace(/_/g, "/"))).t as string;
  } catch {
    return "x";
  }
}

/**
 * Зочны токен (POST /api/v1/widget/session). Вэб чатад хадгалж дахин ашиглана (яриа үргэлжилнэ),
 * дуудлагад `fresh` — дуудлага бүр шинэ яриа.
 */
export async function visitorToken(w: string, channel: "web" | "voice", fresh = false): Promise<string> {
  const k = `gvs-${channel}-${widgetKey(w)}`;
  if (!fresh) {
    try {
      const c = JSON.parse(localStorage.getItem(k) || "null") as { token: string; exp: number } | null;
      if (c && c.exp > Date.now() + 3600_000) return c.token;
    } catch {
      /* эвдэрсэн */
    }
  }
  const r = await fetch("/api/v1/widget/session", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ w, channel }) });
  const j = (await r.json().catch(() => ({}))) as { token?: string; exp?: number; error?: string };
  if (!r.ok || !j.token) throw new Error(j.error || "Холбоос хүчингүй");
  if (!fresh) localStorage.setItem(k, JSON.stringify({ token: j.token, exp: j.exp }));
  return j.token;
}

export function CustomerChat() {
  const [w, setW] = useState("");
  const [token, setToken] = useState("");
  const [info, setInfo] = useState<Info | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [msgs, setMsgs] = useState<M[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const end = useRef<HTMLDivElement>(null);

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
    visitorToken(ww, "web")
      .then(setToken)
      .catch((e) => setErr(e instanceof Error ? e.message : "Холбогдож чадсангүй"));
  }, []);

  const load = useRef(async () => {});
  load.current = async () => {
    if (!token) return;
    const r = await fetch(`/api/agent/public/chat`, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
    if (r.ok) setMsgs((await r.json()).messages);
  };
  useEffect(() => {
    if (!token) return;
    void load.current();
    const es = new EventSource(`/api/agent/public/events?token=${encodeURIComponent(token)}`);
    es.onmessage = () => void load.current();
    return () => es.close();
  }, [token]);
  useEffect(() => {
    end.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [msgs.length, busy]);

  async function send() {
    const t = text.trim();
    if (!t || busy || !token) return;
    setText("");
    setBusy(true);
    setMsgs((x) => [...x, { id: `tmp${Date.now()}`, role: "user", text: t, at: Date.now() }]);
    try {
      const r = await fetch("/api/agent/public/chat", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ text: t }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      if (j.status === "no_credits" || j.status === "human") setMsgs((x) => [...x, { id: `sys${Date.now()}`, role: "staff", text: "Таны мессежийг ажилтанд дамжууллаа. Удахгүй хариулна.", at: Date.now() }]);
    } catch (e) {
      setMsgs((x) => [...x, { id: `err${Date.now()}`, role: "staff", text: e instanceof Error ? e.message : "Алдаа гарлаа", at: Date.now() }]);
    }
    setBusy(false);
    void load.current();
  }

  if (err) return <div className="grid h-dvh place-items-center p-6 text-center text-mute">{err}</div>;
  return (
    <div className="mx-auto flex h-dvh max-w-[560px] flex-col bg-stage">
      <header className="flex items-center gap-3 border-b border-[var(--sp-sep)] bg-paper px-4 py-3">
        {info?.brand?.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={info.brand.logoUrl} alt="" className="size-10 rounded-full object-cover" />
        ) : (
          <div className="grid size-10 place-items-center rounded-full text-white" style={{ background: info?.color || "var(--accent)" }}>
            <Icon name="bag" size={20} />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="truncate text-[16px] font-bold">{info?.store ?? "…"}</div>
          <div className="flex items-center gap-1.5 text-[12.5px] text-mute">
            <span className="size-1.5 rounded-full bg-ok" /> {info?.agent} · AI туслах · {info?.hours}
          </div>
        </div>
        {info?.channels.voice && (
          <a href={`/ai/call?w=${encodeURIComponent(w)}`} aria-label="Залгах" className="sp-tap grid size-10 place-items-center rounded-full bg-ok text-white">
            <Icon name="phone" size={19} />
          </a>
        )}
      </header>
      <div className="sp-scroll flex-1 space-y-2.5 overflow-y-auto p-4">
        {info && (
          <div className="flex">
            <div className="max-w-[82%] rounded-[18px] rounded-bl-[6px] bg-paper px-3.5 py-2 text-[15px] shadow-[0_0_0_0.5px_var(--sp-sep)]">{info.greeting}</div>
          </div>
        )}
        {msgs.map((x) => (
          <div key={x.id} className={cx("flex", x.role === "user" && "justify-end")}>
            <div style={x.role === "user" ? { background: info?.color || "var(--accent)" } : undefined} className={cx("max-w-[82%] rounded-[18px] px-3.5 py-2 text-[15px] leading-relaxed", x.role === "user" ? "rounded-br-[6px] text-white" : "rounded-bl-[6px] bg-paper shadow-[0_0_0_0.5px_var(--sp-sep)]")}>
              {x.role === "user" ? x.text : <Md text={x.text} />}
            </div>
          </div>
        ))}
        {busy && (
          <div className="flex">
            <div className="flex items-center gap-1 rounded-[18px] bg-paper px-4 py-3 shadow-[0_0_0_0.5px_var(--sp-sep)]">
              <span className="sp-ai-dot size-1.5 rounded-full bg-mute" />
              <span className="sp-ai-dot size-1.5 rounded-full bg-mute [animation-delay:150ms]" />
              <span className="sp-ai-dot size-1.5 rounded-full bg-mute [animation-delay:300ms]" />
            </div>
          </div>
        )}
        {!msgs.length && info && (
          <div className="flex flex-wrap gap-2 pt-2">
            {["Хүргэлт хэдэн цагт ирэх вэ?", "Өндөг байгаа юу, хэд вэ?", "Захиалга өгмөөр байна", "Гомдол гаргах"].map((q) => (
              <button key={q} type="button" onClick={() => setText(q)} className="sp-tap rounded-full bg-paper px-3 py-1.5 text-[13.5px] shadow-[0_0_0_0.5px_var(--sp-sep)]">
                {q}
              </button>
            ))}
          </div>
        )}
        <div ref={end} />
      </div>
      <div className="flex items-end gap-2 border-t border-[var(--sp-sep)] bg-paper p-3 pb-[max(12px,env(safe-area-inset-bottom))]">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void send();
            }
          }}
          rows={1}
          placeholder="Мессеж бичих…"
          className="sp-field max-h-32 min-h-11 flex-1 resize-none py-2.5"
        />
        <button type="button" onClick={() => void send()} disabled={!text.trim() || busy || !token} aria-label="Илгээх" className="sp-tap grid size-11 place-items-center rounded-full bg-accent text-white disabled:opacity-40">
          {busy ? <Spinner size={18} /> : <Icon name="send" size={19} />}
        </button>
      </div>
      <div className="bg-paper pb-2 text-center text-[11px] text-mute">AI туслах · Qwen (Alibaba Cloud) · {info?.brand?.name || "Gerege POS"}</div>
    </div>
  );
}
