"use client";

/*
 * Харилцаа — Messenger, вэб чат, дуудлагын бүх яриа нэг дор. AI өөрөө хариулна;
 * ажилтан хүссэн үедээ авч гараар хариулж, дараа нь AI-д буцааж өгнө.
 */
import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/sp/icons";
import { Badge, Btn, cx, Empty, toast } from "@/components/sp/ui";
import { Head } from "./AiApp";
import { aj, ago, CHANNEL, hm, useLive } from "./client";
import { Md } from "./Md";

type Conv = { id: string; channel: string; status: "ai" | "human" | "closed"; title: string | null; last_text: string | null; last_at: number; contact_name: string | null; contact_phone: string | null };
type Step = { title: string; summary: string; ok: boolean; status: string };
type Msg = { id: string; role: "user" | "assistant" | "staff" | "system"; text: string; meta: { steps?: Step[]; seconds?: number; by?: string; broadcast?: boolean } | null; at: number };
type Contact = { id: string; name: string | null; phone: string | null; address: string | null; summary: string | null; interests: string[]; tags: string[]; sentiment: string | null };

const STATUS = { ai: { label: "AI хариулж байна", tone: "ok" as const }, human: { label: "Ажилтан хүлээж байна", tone: "warn" as const }, closed: { label: "Хаагдсан", tone: "gray" as const } };

export function Inbox() {
  const [ch, setCh] = useState("");
  const { data } = useLive<{ conversations: Conv[] }>(`/api/agent/conversations${ch ? `?channel=${ch}` : ""}`, ["message", "conv", "contacts"]);
  const [sel, setSel] = useState<string | null>(null);
  const list = data?.conversations ?? [];
  // том дэлгэц дээр эхний яриаг шууд харуулна (утсан дээр жагсаалт)
  const shown = sel ?? list[0]?.id ?? null;

  return (
    <div>
      <Head title="Харилцаа" sub="Харилцагч бүрт AI мэдлэгийн сан дээр тулгуурлаж хариулна. Хүссэн үедээ ярианд орж болно." />
      <div className="mx-auto grid max-w-[1320px] gap-4 px-4 pb-8 md:px-8 lg:grid-cols-[360px_minmax(0,1fr)]">
        <div className={cx("rounded-[18px] bg-paper shadow-[0_0_0_0.5px_var(--sp-sep)]", sel && "hidden lg:block")}>
          <div className="flex gap-1.5 overflow-x-auto p-3">
            {[["", "Бүгд"], ["fb", "Messenger"], ["web", "Вэб чат"], ["voice", "Дуудлага"]].map(([id, l]) => (
              <button key={id} type="button" onClick={() => setCh(id)} className={cx("sp-tap shrink-0 rounded-full px-3 py-1.5 text-[13px] font-semibold", ch === id ? "bg-ink text-paper" : "bg-[var(--sp-fill)]")}>
                {l}
              </button>
            ))}
          </div>
          {!list.length && <Empty icon="chat" title="Яриа алга" body="Харилцагч вэб чат, дуудлага эсвэл Messenger-ээр бичихэд энд харагдана." />}
          <div className="max-h-[calc(100dvh-230px)] overflow-y-auto">
            {list.map((c) => (
              <button key={c.id} type="button" onClick={() => setSel(c.id)} className={cx("sp-row flex w-full gap-3 border-t border-[var(--sp-sep)] px-4 py-3 text-left", shown === c.id && "bg-accent-soft")}>
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
            ))}
          </div>
        </div>
        {shown ? (
          <div className={cx(!sel && "hidden lg:block")}>
            <Thread key={shown} id={shown} back={() => setSel(null)} />
          </div>
        ) : (
          <div className="hidden rounded-[18px] bg-paper lg:block" />
        )}
      </div>
    </div>
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
