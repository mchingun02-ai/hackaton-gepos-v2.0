"use client";

/*
 * Харилцаа → Facebook: Page-ийн бүх Messenger чат (/api/fb/threads) ба пост дээрх comment (/api/fb/comments).
 * Ажилтан гараар хариулна (origin "human", 24ц / HUMAN_AGENT дүрэм серверт). Comment-д AI автоматаар хариулахгүй.
 */
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Icon } from "@/components/sp/icons";
import { Badge, Btn, cx, Empty, Notice, toast } from "@/components/sp/ui";
import { aj, ago, ApiError, hm } from "./client";

export type FbWindow = { state: "open" | "human" | "closed"; until?: number };
export type FbThread = { psid: string; name: string; pic?: string; lastAt: number; lastText: string; unread: number; status: "open" | "done"; window: FbWindow };
type FbAtt = { type: string; url?: string; title?: string };
type FbMsg = { mid: string; dir: "in" | "out"; text: string; attachments?: FbAtt[]; staff?: string; tag?: string; status: string; error?: string; at: number };
export type FbStatus = { demo: boolean; page: { id: string; name: string; demo: boolean } | null };
export type AiSettings = { settings: { fbMode: "off" | "testers" | "all"; fbTesters: { psid: string; name: string }[] }; fb?: { allowAll: boolean } };
type ConvRef = { id: string; status: "ai" | "human" | "closed" };
type Mode = { mode: "off" | "testers" | "all"; testers: { psid: string }[]; allowAll: boolean } | null;

/** Тогтмол давтамжтай татах (зөвхөн таб харагдаж байхад). path = null бол татахгүй. */
export function usePoll<T>(path: string | null, ms = 8000) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState(0);
  const load = useCallback(async () => {
    if (!path) return;
    try {
      setData(await aj<T>(path));
      setError(null);
      setStatus(200);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Алдаа");
      setStatus(e instanceof ApiError ? e.status : 0);
    }
  }, [path]);
  useEffect(() => {
    if (!path) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- серверээс татах (гадаад систем)
    void load();
    const t = setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, ms);
    return () => clearInterval(t);
  }, [load, path, ms]);
  return { data, error, status, reload: load };
}

const ATT: Record<string, string> = { image: "Зураг", video: "Видео", audio: "Дуу", file: "Файл", location: "Байршил", fallback: "Холбоос", template: "Карт", sticker: "Стикер" };
const STAFF_AI = "AI ажилтан";
const until = (ms?: number) => (ms ? new Date(ms).toLocaleString("mn-MN", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }) : "");

function Avatar({ pic, name, size = 40 }: { pic?: string; name: string; size?: number }) {
  const [bad, setBad] = useState(false);
  if (pic && !bad)
    // eslint-disable-next-line @next/next/no-img-element -- Facebook CDN-ийн профайл зураг (гадаад, хугацаатай URL)
    return <img src={pic} alt="" onError={() => setBad(true)} referrerPolicy="no-referrer" className="shrink-0 rounded-full object-cover" style={{ width: size, height: size }} />;
  const ini = name
    .split(/\s+/)
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
  return (
    <div className="grid shrink-0 place-items-center rounded-full bg-[var(--sp-fill)] text-[13px] font-semibold text-mute" style={{ width: size, height: size }}>
      {ini || <Icon name="person" size={18} />}
    </div>
  );
}

const WIN = {
  open: { label: "24ц нээлттэй", cls: "bg-ok-soft text-ok" },
  human: { label: "Зөвхөн ажилтан", cls: "bg-warn-soft text-warn" },
  closed: { label: "Хаалттай", cls: "bg-[var(--sp-fill)] text-mute" },
};

export function FbRow({ t, conv, active, onClick }: { t: FbThread; conv?: ConvRef; active: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className={cx("sp-row flex w-full gap-3 border-t border-[var(--sp-sep)] px-4 py-3 text-left", active && "bg-accent-soft")}>
      <div className="relative">
        <Avatar pic={t.pic} name={t.name} />
        <span className="absolute -bottom-0.5 -right-0.5 grid size-[18px] place-items-center rounded-full bg-[#0866FF] text-white ring-2 ring-paper">
          <Icon name="chat" size={10} />
        </span>
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className={cx("truncate text-[14.5px]", t.unread ? "font-bold" : "font-semibold")}>{t.name}</span>
          <span className="ml-auto shrink-0 text-[12px] text-mute">{ago(t.lastAt)}</span>
        </div>
        <div className={cx("flex items-center gap-2 text-[13px]", t.unread ? "text-ink" : "text-mute")}>
          <span className="min-w-0 flex-1 truncate">{t.lastText || "—"}</span>
          {t.unread > 0 && <span className="grid h-[18px] min-w-[18px] shrink-0 place-items-center rounded-full bg-accent px-1 text-[11px] font-bold text-white">{t.unread}</span>}
        </div>
        <div className="mt-1 flex items-center gap-1.5 text-[11.5px]">
          <span className="text-mute">Messenger</span>
          <span className={cx("rounded-full px-1.5 py-px font-semibold", WIN[t.window.state].cls)}>{WIN[t.window.state].label}</span>
          {conv?.status === "human" && <span className="rounded-full bg-warn-soft px-1.5 py-px font-semibold text-warn">Ажилтан</span>}
        </div>
      </div>
    </button>
  );
}

/** Энэ харилцагчид AI хариулах эсэх (Тохиргоо → Facebook Messenger-ийн горим, §9.2) */
function aiState(mode: Mode, psid: string, conv?: ConvRef): { label: string; tone: "ok" | "warn" | "gray" } {
  if (!mode) return { label: "AI горим…", tone: "gray" };
  const on = mode.mode === "all" ? mode.allowAll : mode.mode === "testers" ? mode.testers.some((t) => t.psid === psid) : false;
  if (!on)
    return {
      label: mode.mode === "off" ? "AI унтраалттай — зөвхөн ажилтан" : mode.mode === "testers" ? "AI хариулахгүй — туршигч биш" : "AI хаалттай (орчны тохиргоо)",
      tone: "gray",
    };
  if (conv?.status === "human") return { label: "Ажилтан авсан — AI түр зогссон", tone: "warn" };
  if (conv?.status === "closed") return { label: "Яриа хаагдсан — шинэ мессежид AI хариулна", tone: "gray" };
  return { label: mode.mode === "testers" ? "AI хариулна (туршигч)" : "AI хариулна", tone: "ok" };
}

export function FbThreadView({ psid, conv, mode, back, onChange }: { psid: string; conv?: ConvRef; mode: Mode; back: () => void; onChange: () => void }) {
  const { data, error, reload } = usePoll<{ thread: FbThread; messages: FbMsg[] }>(`/api/fb/threads/${encodeURIComponent(psid)}`, 8000);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  const marked = useRef(false);
  const unread = data?.thread.unread ?? 0;
  useEffect(() => {
    end.current?.scrollIntoView({ block: "end" });
  }, [data?.messages.length]);
  // Нээхэд уншсан болгоно (дахин шинэ мессеж ирвэл дахин)
  useEffect(() => {
    if (!unread) {
      marked.current = false;
      return;
    }
    if (marked.current) return;
    marked.current = true;
    void aj(`/api/fb/threads/${encodeURIComponent(psid)}/read`, { method: "POST" })
      .then(() => {
        onChange();
        void reload();
      })
      .catch(() => {});
  }, [unread, psid, onChange, reload]);

  if (error && !data) return <div className="rounded-[18px] bg-paper p-6 text-danger">{error}</div>;
  if (!data) return <div className="rounded-[18px] bg-paper p-6 text-mute">Ачаалж байна…</div>;
  const t = data.thread;
  const w = t.window;
  const ai = aiState(mode, psid, conv);
  const blocked = w.state === "closed";

  async function setConv(status: "ai" | "human") {
    if (!conv) return;
    await aj(`/api/agent/conversations/${conv.id}`, { method: "PATCH", json: { status } }).catch((e) => toast(e.message, "danger"));
    onChange();
  }
  async function send() {
    if (!text.trim() || blocked) return;
    setBusy(true);
    try {
      await aj(`/api/fb/threads/${encodeURIComponent(psid)}/send`, { method: "POST", json: { text } });
      setText("");
      toast("Илгээлээ", "ok");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Алдаа", "danger");
    }
    setBusy(false);
    void reload();
    onChange();
  }

  return (
    <div className="flex min-h-[60dvh] flex-col rounded-[18px] bg-paper shadow-[0_0_0_0.5px_var(--sp-sep)]">
      <div className="flex flex-wrap items-center gap-2 border-b border-[var(--sp-sep)] p-3">
        <button type="button" onClick={back} className="sp-tap grid size-9 place-items-center rounded-full lg:hidden" aria-label="Буцах">
          <Icon name="back" size={20} />
        </button>
        <Avatar pic={t.pic} name={t.name} size={36} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[15px] font-semibold">{t.name}</div>
          <div className="flex flex-wrap items-center gap-1.5 text-[12px]">
            <span className="text-mute">Messenger</span>
            <Badge tone={ai.tone}>{ai.label}</Badge>
          </div>
        </div>
        {conv && conv.status === "ai" && (
          <Btn size="sm" variant="tinted" icon="person" onClick={() => void setConv("human")}>
            Ажилтан авах
          </Btn>
        )}
        {conv && conv.status !== "ai" && (
          <Btn size="sm" variant="tinted" icon="sparkle" onClick={() => void setConv("ai")}>
            AI-д өгөх
          </Btn>
        )}
      </div>
      <div className="flex-1 space-y-3 overflow-y-auto p-4" style={{ maxHeight: "calc(100dvh - 330px)" }}>
        {!data.messages.length && <div className="text-center text-[13px] text-mute">Мессеж алга</div>}
        {data.messages.map((m) => (
          <div key={m.mid} className={cx("flex", m.dir === "in" ? "justify-start" : "justify-end")}>
            <div className="max-w-[78%] space-y-1">
              <div
                className={cx(
                  "whitespace-pre-wrap break-words rounded-[18px] px-3.5 py-2 text-[14.5px] leading-relaxed",
                  m.dir === "in" ? "rounded-bl-[6px] bg-[var(--sp-fill)]" : m.staff === STAFF_AI ? "rounded-br-[6px] bg-accent-soft text-ink" : "rounded-br-[6px] bg-ink text-paper",
                  m.status === "failed" && "opacity-60",
                )}
              >
                {m.text || (!m.attachments?.length && <span className="italic opacity-70">Текстгүй мессеж (карт, товч эсвэл дэмжигдээгүй төрөл)</span>)}
                {!!m.attachments?.length && (
                  <div className={cx("flex flex-wrap gap-1.5", m.text && "mt-1.5")}>
                    {m.attachments.map((a, i) =>
                      a.url ? (
                        <a key={i} href={a.url} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 rounded-full bg-black/10 px-2 py-0.5 text-[12.5px] font-semibold underline-offset-2 hover:underline">
                          <Icon name="paperclip" size={12} />
                          {a.title || ATT[a.type] || "Файл"}
                        </a>
                      ) : (
                        <span key={i} className="rounded-full bg-black/10 px-2 py-0.5 text-[12.5px]">
                          {ATT[a.type] || "Файл"}
                        </span>
                      ),
                    )}
                  </div>
                )}
              </div>
              {m.error && <div className="text-right text-[12px] text-danger">{m.error}</div>}
              <div className={cx("text-[11.5px] text-mute", m.dir === "out" && "text-right")}>
                {m.dir === "in" ? "Харилцагч" : m.staff === STAFF_AI ? "AI ажилтан" : m.staff ? `Ажилтан · ${m.staff}` : "Page (Meta Inbox / өөр апп)"}
                {m.tag === "HUMAN_AGENT" && " · HUMAN_AGENT"} · {hm(m.at)}
                {m.dir === "out" && m.status === "read" && " · Уншсан"}
              </div>
            </div>
          </div>
        ))}
        <div ref={end} />
      </div>
      <div className="space-y-2 border-t border-[var(--sp-sep)] p-3">
        <div className={cx("text-[12.5px]", w.state === "open" ? "text-mute" : w.state === "human" ? "text-warn" : "text-danger")}>
          {w.state === "open" && `24 цагийн цонх нээлттэй (${until(w.until)} хүртэл) — чөлөөтэй хариулна.`}
          {w.state === "human" && `24 цаг өнгөрсөн — зөвхөн ажилтны гараар бичсэн хариу HUMAN_AGENT шошготой (${until(w.until)} хүртэл). AI илгээхгүй.`}
          {w.state === "closed" && "Харилцагчийн сүүлийн мессежээс 7 хоног өнгөрсөн (эсвэл харилцагч бичээгүй) тул Facebook хариу илгээхийг зөвшөөрөхгүй. Харилцагч дахин бичихийг хүлээнэ үү."}
        </div>
        <div className="flex gap-2">
          <input
            value={text}
            disabled={blocked}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !e.nativeEvent.isComposing && void send()}
            placeholder={blocked ? "Илгээх боломжгүй" : conv?.status === "ai" ? "Бичвэл яриаг ажилтан авна…" : "Ажилтны хариу…"}
            maxLength={2000}
            className="sp-field h-11 flex-1 disabled:opacity-50"
          />
          <Btn size="md" icon="send" loading={busy} onClick={() => void send()} disabled={!text.trim() || blocked}>
            Илгээх
          </Btn>
        </div>
      </div>
    </div>
  );
}

/* ───────── Comment ───────── */

type CView = { id: string; parentId: string | null; from: { id: string | null; name: string }; fromPage: boolean; message: string; at: number; staff?: string; removed: boolean; replies: CView[] };
type Post = { id: string; message: string; permalink: string | null; at: number; lastAt: number; comments: CView[]; count: number };
type CommentsResp = {
  posts: Post[];
  permission: { read: boolean | null; reply: boolean | null; needsPermission: boolean; message: string | null; missing: string[]; error: string | null };
  feedSubscribed: boolean | null;
};

export function Comments({ connected, loading }: { connected: boolean; loading: boolean }) {
  const { data, error, status, reload } = usePoll<CommentsResp>(connected ? "/api/fb/comments" : null, 15000);
  const wrap = (c: ReactNode) => <div className="mx-auto max-w-[920px] space-y-3 px-4 pb-10 md:px-8">{c}</div>;
  if (loading) return wrap(<div className="rounded-[18px] bg-paper p-6 text-mute">Ачаалж байна…</div>);
  if (!connected || status === 409) return wrap(<Empty icon="chat" title="Facebook Page холбогдоогүй" body="Тохиргоо → Facebook хэсгээс Page-ээ холбоход пост дээрх comment энд харагдана." />);
  if (error && !data) return wrap(<Notice tone="danger">{error}</Notice>);
  if (!data) return wrap(<div className="rounded-[18px] bg-paper p-6 text-mute">Ачаалж байна…</div>);
  const p = data.permission;
  return wrap(
    <>
      {p.message && (
        <Notice
          tone={p.needsPermission ? "warn" : "gray"}
          icon="lock"
          action={
            <a href="/api/fb/connect" className="shrink-0 rounded-full bg-paper px-3 py-1 text-[13px] font-semibold text-accent">
              Дахин холбох
            </a>
          }
        >
          {p.message}
        </Notice>
      )}
      <div className="flex items-center gap-2 text-[12.5px] text-mute">
        <Icon name="info" size={14} />
        <span>Comment-д AI автоматаар хариулахгүй — зөвхөн ажилтан гараар. 15 сек тутам шинэчилнэ.</span>
      </div>
      {!data.posts.length && !p.needsPermission && <Empty icon="chat" title="Comment алга" body="Page-ийн пост дээр comment бичигдэхэд энд харагдана." />}
      {data.posts.map((post) => (
        <PostCard key={post.id} post={post} canReply={p.reply !== false && !p.needsPermission} reload={reload} />
      ))}
    </>,
  );
}

function PostCard({ post, canReply, reload }: { post: Post; canReply: boolean; reload: () => Promise<void> }) {
  return (
    <section className="rounded-[18px] bg-paper shadow-[0_0_0_0.5px_var(--sp-sep)]">
      <div className="flex items-start gap-3 border-b border-[var(--sp-sep)] p-4">
        <div className="min-w-0 flex-1">
          <div className="text-[12px] text-mute">
            Пост · {ago(post.at)} · {post.count} comment
          </div>
          <p className="mt-1 line-clamp-3 whitespace-pre-wrap text-[14.5px] leading-snug">{post.message || <span className="italic text-mute">Текстгүй пост (зураг/видео)</span>}</p>
        </div>
        {post.permalink && (
          <a href={post.permalink} target="_blank" rel="noreferrer noopener" className="shrink-0 text-[12.5px] font-semibold text-accent">
            Facebook-д нээх
          </a>
        )}
      </div>
      <div className="space-y-3 p-4">
        {!post.comments.length && <div className="text-[13px] text-mute">Comment алга</div>}
        {post.comments.map((c) => (
          <CommentItem key={c.id} c={c} canReply={canReply} reload={reload} />
        ))}
      </div>
    </section>
  );
}

function CommentItem({ c, canReply, reload, depth = 0 }: { c: CView; canReply: boolean; reload: () => Promise<void>; depth?: number }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  async function reply() {
    if (!text.trim()) return;
    setBusy(true);
    try {
      await aj(`/api/fb/comments/${encodeURIComponent(c.id)}/reply`, { method: "POST", json: { text } });
      setText("");
      setOpen(false);
      toast("Хариулав", "ok");
      await reload();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Алдаа", "danger");
    }
    setBusy(false);
  }
  return (
    <div className={cx(depth > 0 && "ml-8")}>
      <div className="flex gap-2.5">
        <Avatar name={c.from.name} size={depth ? 28 : 34} />
        <div className="min-w-0 flex-1">
          <div className={cx("inline-block max-w-full rounded-[16px] px-3 py-2", c.fromPage ? "bg-accent-soft" : "bg-[var(--sp-fill)]")}>
            <div className="text-[13px] font-semibold">
              {c.from.name}
              {c.fromPage && <span className="ml-1 font-normal text-mute">· Page{c.staff ? ` · ${c.staff}` : ""}</span>}
            </div>
            <div className="whitespace-pre-wrap break-words text-[14px] leading-snug">{c.removed ? <span className="italic text-mute">Устгагдсан</span> : c.message || <span className="italic text-mute">Зураг/стикер</span>}</div>
          </div>
          <div className="mt-0.5 flex gap-3 pl-2 text-[12px] text-mute">
            <span>{ago(c.at)}</span>
            {canReply && !c.removed && depth === 0 && (
              <button type="button" className="font-semibold text-accent" onClick={() => setOpen((v) => !v)}>
                Хариулах
              </button>
            )}
          </div>
          {open && (
            <div className="mt-2 flex gap-2">
              <input
                autoFocus
                value={text}
                maxLength={2000}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && !e.nativeEvent.isComposing && void reply()}
                placeholder={`${c.from.name}-д хариулах…`}
                className="sp-field h-10 flex-1 text-[14px]"
              />
              <Btn size="sm" icon="send" loading={busy} disabled={!text.trim()} onClick={() => void reply()}>
                Илгээх
              </Btn>
            </div>
          )}
        </div>
      </div>
      {!!c.replies.length && (
        <div className="mt-2 space-y-2">
          {c.replies.map((r) => (
            <CommentItem key={r.id} c={r} canReply={canReply} reload={reload} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
}
