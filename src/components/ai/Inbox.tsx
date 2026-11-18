"use client";

/*
 * Харилцаа — Messenger, вэб чат, дуудлагын бүх яриа нэг дор. AI өөрөө хариулна;
 * ажилтан хүссэн үедээ авч гараар хариулж, дараа нь AI-д буцааж өгнө.
 */
import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/sp/icons";
import { Badge, Btn, cx, Empty, Notice, toast } from "@/components/sp/ui";
import { Head } from "./AiApp";
import { aj, ago, CHANNEL, hm, useLive } from "./client";
import { Comments, FbRow, FbThreadView, usePoll, type AiSettings, type FbStatus, type FbThread } from "./InboxFb";
import { Md } from "./Md";

type Conv = { id: string; channel: string; ext_id?: string | null; status: "ai" | "human" | "closed"; title: string | null; last_text: string | null; last_at: number; contact_name: string | null; contact_phone: string | null };
type Step = { title: string; summary: string; ok: boolean; status: string };
type Msg = { id: string; role: "user" | "assistant" | "staff" | "system"; text: string; meta: { steps?: Step[]; seconds?: number; by?: string; broadcast?: boolean } | null; at: number };
type Contact = { id: string; name: string | null; phone: string | null; address: string | null; summary: string | null; interests: string[]; tags: string[]; sentiment: string | null };

const STATUS = { ai: { label: "AI хариулж байна", tone: "ok" as const }, human: { label: "Ажилтан хүлээж байна", tone: "warn" as const }, closed: { label: "Хаагдсан", tone: "gray" as const } };

type Tab = "all" | "fb" | "comment" | "web" | "voice";
const TABS: [Tab, string][] = [
  ["all", "Бүгд"],
  ["fb", "Messenger"],
  ["comment", "Comment"],
  ["web", "Вэб чат"],
  ["voice", "Дуудлага"],
];
type Item = { key: string; at: number; kind: "ai"; conv: Conv } | { key: string; at: number; kind: "fb"; t: FbThread; conv?: Conv };

export function Inbox() {
  const [tab, setTab] = useState<Tab>("all");
  const { data } = useLive<{ conversations: Conv[] }>(`/api/agent/conversations`, ["message", "conv", "contacts"]);
  const fbs = useLive<FbStatus>("/api/fb/status", []);
  const connected = !!fbs.data?.page;
  // Page-ийн бүх Messenger чат — 8 сек тутам (сервер syncIfDue-ээр Facebook-аас хурдны хязгаартай татна)
  const fbt = usePoll<{ threads: FbThread[] }>(connected && (tab === "all" || tab === "fb") ? "/api/fb/threads?state=all" : null, 8000);
  const st = useLive<AiSettings>("/api/agent/settings", ["settings"]);
  const [sel, setSel] = useState<string | null>(null);

  const convs = data?.conversations ?? [];
  const fbConv = new Map(convs.filter((c) => c.channel === "fb" && c.ext_id).map((c) => [c.ext_id!, c]));
  const fbItems: Item[] = connected ? (fbt.data?.threads ?? []).map((t) => ({ key: `fb:${t.psid}`, at: t.lastAt, kind: "fb", t, conv: fbConv.get(t.psid) })) : [];
  const aiItems = (pred: (c: Conv) => boolean): Item[] => convs.filter(pred).map((c) => ({ key: `ai:${c.id}`, at: c.last_at, kind: "ai", conv: c }));
  const list: Item[] =
    tab === "all"
      ? [...fbItems, ...aiItems((c) => c.channel !== "fb" || !connected)].sort((a, b) => b.at - a.at)
      : tab === "fb"
        ? connected
          ? fbItems
          : aiItems((c) => c.channel === "fb")
        : tab === "comment"
          ? []
          : aiItems((c) => c.channel === tab);
  // том дэлгэц дээр эхний яриаг шууд харуулна (утсан дээр жагсаалт)
  const shown = sel && list.some((i) => i.key === sel) ? sel : (list[0]?.key ?? null);
  const item = list.find((i) => i.key === shown);
  const mode = st.data ? { mode: st.data.settings.fbMode, testers: st.data.settings.fbTesters, allowAll: !!st.data.fb?.allowAll } : null;

  return (
    <div>
      <Head title="Харилцаа" sub="Харилцагч бүрт AI мэдлэгийн сан дээр тулгуурлаж хариулна. Хүссэн үедээ ярианд орж болно." />
      <div className="mx-auto max-w-[1320px] px-4 md:px-8">
        <div className="flex gap-1.5 overflow-x-auto pb-3" role="tablist">
          {TABS.map(([id, l]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              onClick={() => {
                setTab(id);
                setSel(null);
              }}
              className={cx("sp-tap shrink-0 rounded-full px-3.5 py-1.5 text-[13.5px] font-semibold", tab === id ? "bg-ink text-paper" : "bg-[var(--sp-fill)]")}
            >
              {l}
            </button>
          ))}
        </div>
      </div>
      {tab === "comment" ? (
        <Comments connected={connected} loading={!fbs.data && !fbs.error} />
      ) : (
        <div className="mx-auto grid max-w-[1320px] gap-4 px-4 pb-8 md:px-8 lg:grid-cols-[360px_minmax(0,1fr)]">
          <div className={cx("rounded-[18px] bg-paper shadow-[0_0_0_0.5px_var(--sp-sep)]", sel && "hidden lg:block")}>
            {tab === "fb" && !connected && fbs.data && (
              <div className="p-3">
                <Notice tone="gray">Facebook Page холбогдоогүй — Тохиргоо → Facebook-аас холбоно. Доор AI-ийн хариулсан Messenger яриа л харагдана.</Notice>
              </div>
            )}
            {fbt.error && (tab === "fb" || tab === "all") && (
              <div className="p-3">
                <Notice tone="danger">Messenger: {fbt.error}</Notice>
              </div>
            )}
            {!list.length && <Empty icon="chat" title="Яриа алга" body="Харилцагч вэб чат, дуудлага эсвэл Messenger-ээр бичихэд энд харагдана." />}
            <div className="max-h-[calc(100dvh-260px)] overflow-y-auto">
              {list.map((i) => (i.kind === "fb" ? <FbRow key={i.key} t={i.t} conv={i.conv} active={shown === i.key} onClick={() => setSel(i.key)} /> : <AiRow key={i.key} c={i.conv} active={shown === i.key} onClick={() => setSel(i.key)} />))}
            </div>
          </div>
          {item ? (
            <div className={cx(!sel && "hidden lg:block")}>
              {item.kind === "fb" ? (
                <FbThreadView key={item.key} psid={item.t.psid} conv={item.conv} mode={mode} back={() => setSel(null)} onChange={() => void fbt.reload()} />
              ) : (
                <Thread key={item.key} id={item.conv.id} back={() => setSel(null)} />
              )}
            </div>
          ) : (
            <div className="hidden rounded-[18px] bg-paper lg:block" />
          )}
        </div>
      )}
    </div>
  );
}

function AiRow({ c, active, onClick }: { c: Conv; active: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className={cx("sp-row flex w-full gap-3 border-t border-[var(--sp-sep)] px-4 py-3 text-left", active && "bg-accent-soft")}>
      <div className="grid size-10 shrink-0 place-items-center rounded-full bg-[var(--sp-fill)]">
        <Icon name={CHANNEL[c.channel]?.icon ?? "chat"} size={18} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-[14.5px] font-semibold">{c.contact_name || c.title || (c.contact_phone ?? "Шинэ харилцагч")}</span>
          <span className="ml-auto shrink-0 text-[12px] text-mute">{ago(c.last_at)}</span>
        </div>
        <div className="truncate text-[13px] text-mute">{c.last_text}</div>
        <div className="mt-1 flex items-center gap-1.5 text-[11.5px]">
          <span className="text-mute">{CHANNEL[c.channel]?.label}</span>
          <span className={cx("rounded-full px-1.5 py-px font-semibold", c.status === "ai" ? "bg-ok-soft text-ok" : c.status === "human" ? "bg-warn-soft text-warn" : "bg-[var(--sp-fill)] text-mute")}>{STATUS[c.status].label}</span>
        </div>
      </div>
    </button>
  );
}

function Thread({ id, back }: { id: string; back: () => void }) {
  const { data, reload } = useLive<{ conversation: Conv; contact: Contact | null; messages: Msg[] }>(`/api/agent/conversations/${id}`, ["message", "conv", "contacts", "action"]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => {
    end.current?.scrollIntoView({ block: "end" });
  }, [data?.messages.length]);
  if (!data) return <div className="rounded-[18px] bg-paper p-6 text-mute">Ачаалж байна…</div>;
  const c = data.conversation;
  const ct = data.contact;

  async function setStatus(status: string) {
    await aj(`/api/agent/conversations/${id}`, { method: "PATCH", json: { status } }).catch((e) => toast(e.message, "danger"));
    void reload();
  }
  async function reply() {
    if (!text.trim()) return;
    setBusy(true);
    try {
      await aj(`/api/agent/conversations/${id}`, { method: "POST", json: { text, staff: "Ажилтан" } });
      setText("");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Алдаа", "danger");
    }
    setBusy(false);
    void reload();
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_280px]">
      <div className="flex min-h-[60dvh] flex-col rounded-[18px] bg-paper shadow-[0_0_0_0.5px_var(--sp-sep)]">
        <div className="flex flex-wrap items-center gap-2 border-b border-[var(--sp-sep)] p-3">
          <button type="button" onClick={back} className="sp-tap grid size-9 place-items-center rounded-full lg:hidden" aria-label="Буцах">
            <Icon name="back" size={20} />
          </button>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[15px] font-semibold">{ct?.name || c.title || "Шинэ харилцагч"}</div>
            <div className="text-[12.5px] text-mute">
              {CHANNEL[c.channel]?.label} · {STATUS[c.status].label}
            </div>
          </div>
          {c.status === "ai" && (
            <Btn size="sm" variant="tinted" icon="person" onClick={() => void setStatus("human")}>
              Ажилтан авах
            </Btn>
          )}
          {c.status !== "ai" && (
            <Btn size="sm" variant="tinted" icon="sparkle" onClick={() => void setStatus("ai")}>
              AI-д өгөх
            </Btn>
          )}
          {c.status !== "closed" && (
            <Btn size="sm" variant="gray" onClick={() => void setStatus("closed")}>
              Хаах
            </Btn>
          )}
        </div>
        <div className="flex-1 space-y-3 overflow-y-auto p-4" style={{ maxHeight: "calc(100dvh - 300px)" }}>
          {data.messages.map((m) =>
            m.role === "system" ? (
              <div key={m.id} className="text-center text-[12.5px] text-mute">
                {m.text}
              </div>
            ) : (
              <div key={m.id} className={cx("flex", m.role === "user" ? "justify-start" : "justify-end")}>
                <div className="max-w-[78%] space-y-1">
                  <div
                    className={cx(
                      "rounded-[18px] px-3.5 py-2 text-[14.5px] leading-relaxed",
                      m.role === "user" ? "rounded-bl-[6px] bg-[var(--sp-fill)]" : m.role === "staff" ? "rounded-br-[6px] bg-ink text-paper" : "rounded-br-[6px] bg-accent-soft text-ink",
                    )}
                  >
                    {m.role === "user" ? m.text : <Md text={m.text} />}
                  </div>
                  {!!m.meta?.steps?.length && (
                    <div className="flex flex-wrap justify-end gap-1">
                      {m.meta.steps.map((s, i) => (
                        <span key={i} className={cx("rounded-full px-2 py-0.5 text-[11.5px] font-medium", s.ok ? "bg-ok-soft text-ok" : "bg-danger-soft text-danger")}>
                          {s.title}: {s.summary}
                        </span>
                      ))}
                    </div>
                  )}
                  <div className={cx("text-[11.5px] text-mute", m.role !== "user" && "text-right")}>
                    {m.role === "assistant" ? (m.meta?.broadcast ? "AI · захирлын мэдэгдэл" : "AI ажилтан") : m.role === "staff" ? (m.meta?.by ?? "Ажилтан") : m.meta?.seconds ? `🎙 ${Math.round(m.meta.seconds)} сек` : ""} · {hm(m.at)}
                  </div>
                </div>
              </div>
            ),
          )}
          <div ref={end} />
        </div>
        {c.channel !== "voice" && (
          <div className="flex gap-2 border-t border-[var(--sp-sep)] p-3">
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && void reply()}
              placeholder={c.status === "ai" ? "Бичвэл яриаг ажилтан авна…" : "Ажилтны хариу…"}
              className="sp-field h-11 flex-1"
            />
            <Btn size="md" icon="send" loading={busy} onClick={() => void reply()} disabled={!text.trim()}>
              Илгээх
            </Btn>
          </div>
        )}
      </div>
      <ContactCard ct={ct} />
    </div>
  );
}

export function ContactCard({ ct }: { ct: Contact | null }) {
  if (!ct) return null;
  return (
    <div className="h-fit space-y-3 rounded-[18px] bg-paper p-4 shadow-[0_0_0_0.5px_var(--sp-sep)]">
      <div className="text-[13px] font-semibold text-mute">AI-ийн цуглуулсан карт</div>
      <div>
        <div className="text-[17px] font-bold">{ct.name || "Нэр тодорхойгүй"}</div>
        <div className="text-[14px] text-mute">{ct.phone ?? "Утас алга"}</div>
        {ct.address && <div className="mt-1 text-[13.5px]">{ct.address}</div>}
      </div>
      {ct.summary && <p className="text-[13.5px] leading-snug">{ct.summary}</p>}
      {!!ct.interests.length && (
        <div>
          <div className="mb-1 text-[12px] text-mute">Сонирхол</div>
          <div className="flex flex-wrap gap-1">
            {ct.interests.map((x) => (
              <Badge key={x}>{x}</Badge>
            ))}
          </div>
        </div>
      )}
      <div className="flex flex-wrap gap-1">
        {ct.sentiment && <Badge tone={ct.sentiment === "negative" ? "danger" : ct.sentiment === "positive" ? "ok" : "gray"}>{ct.sentiment === "negative" ? "Сэтгэл дундуур" : ct.sentiment === "positive" ? "Сэтгэл хангалуун" : "Төвийг сахисан"}</Badge>}
        {ct.tags.map((t) => (
          <Badge key={t} tone="accent">
            {t}
          </Badge>
        ))}
      </div>
    </div>
  );
}
