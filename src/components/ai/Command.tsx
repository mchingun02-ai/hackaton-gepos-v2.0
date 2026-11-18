"use client";

/*
 * Тушаал — захирал энгийн үгээр (бичих эсвэл ярих) ажил өгнө, AI гүйцэтгэнэ.
 * Алхам бүр (ямар хэрэгсэл, юу өөрчлөгдсөн) шууд харагдана. Эрсдэлтэй үйлдэл «Батлах» хүлээнэ.
 */
import { useContext, useEffect, useRef, useState } from "react";
import { Icon } from "@/components/sp/icons";
import { ASSISTANTS, DIRECTOR_ASSISTANTS, type AssistantId } from "@/lib/assistants/registry";
import { Btn, cx, Spinner, toast } from "@/components/sp/ui";
import type { Section, Stats } from "./AiApp";
import { aj, ago, CHANNEL, hm, listen, useAiEvents, useLive, type Recorder } from "./client";
import { EmbedCtx } from "./embed";
import { Md } from "./Md";

type Step = { tool: string; title: string; args: Record<string, unknown>; ok: boolean; summary: string; status: "done" | "pending" | "error"; action_id: string };
type Tag = { id: AssistantId; name: string; via: "manual" | "keyword" | "llm" | "default" };
type Msg = { id: string; role: "user" | "assistant" | "system" | "staff"; text: string; meta: { steps?: Step[]; by?: string; assistant?: Tag } | null; at: number };
const VIA: Record<Tag["via"], string> = { manual: "гараар сонгосон", keyword: "автомат", llm: "автомат", default: "автомат" };
type Action = { id: string; tool: string; args: Record<string, unknown>; status: string; summary: string | null; actor: string; at: number; conv_id: string | null };

const SUGGEST = [
  "Өнөөдрийн борлуулалт ямар байна? Өчигдөртэй харьцуул.",
  "Дуусаж буй барааг харуулаад, өндөгний үлдэгдлийг 60 болго.",
  "Энэ 7 хоногт харилцагчид юуг хамгийн их асуусан, ямар гомдол гарсан бэ? Юуг сайжруулах вэ?",
  "Гомдол гаргасан харилцагчдад уучлал гуйж, жүүсэнд 7 хоногийн 10% хямдрал зарлаад мэдэгдэл илгээ.",
  "Кофе 3-in-1-ийн үнийг 500₮-өөр нэм.",
  "Мэдлэгийн санд нэм: Бараа буцаалтыг 14 хоногийн дотор, баримттай, савлагаа гэмтээгүй бол хүлээн авна.",
];

export function Command({ stats, go }: { stats: Stats | null; go: (s: Section) => void }) {
  const { data, reload } = useLive<{ messages: Msg[]; pending: Action[] }>("/api/agent/command", ["message", "action"]);
  const [text, setText] = useState("");
  const [pick, setPick] = useState<AssistantId | "auto">("auto");
  const [busy, setBusy] = useState(false);
  const [live, setLive] = useState<Action[]>([]);
  const sentAt = useRef(0);
  const [rec, setRec] = useState<Recorder | null>(null);
  const [hearing, setHearing] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  const msgs = data?.messages ?? [];
  // Портал дотор хуудасны гарчиг (h1) порталын толгойд байгаа тул энд h2
  const Title = useContext(EmbedCtx) ? "h2" : "h1";

  useEffect(() => {
    end.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [msgs.length, live.length, busy]);

  // Ажиллаж байх үед AI-ийн алхмуудыг шууд харуулна
  useAiEvents((e) => {
    if (!busy || e.kind !== "action") return;
    void aj<{ actions: Action[] }>("/api/agent/actions").then((r) => setLive(r.actions.filter((a) => a.at >= sentAt.current && a.actor.startsWith("AI")).reverse()));
  });

  async function send(t = text) {
    const body = t.trim();
    if (!body || busy) return;
    setText("");
    setBusy(true);
    setLive([]);
    // товч дарах үед л ажиллана (render-ийн үед биш)
    // eslint-disable-next-line react-hooks/purity
    sentAt.current = Date.now() - 500;
    try {
      await aj("/api/agent/command", { method: "POST", json: { text: body, ...(pick !== "auto" ? { assistant: pick } : {}) } });
    } catch (e) {
      toast(e instanceof Error ? e.message : "Алдаа", "danger");
      setText(body);
    } finally {
      setBusy(false);
      setLive([]);
      void reload();
    }
  }

  async function decide(id: string, approve: boolean) {
    try {
      await aj(`/api/agent/actions/${id}`, { method: "POST", json: { approve } });
      toast(approve ? "Гүйцэтгэлээ" : "Татгалзлаа", approve ? "ok" : "ink");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Алдаа", "danger");
    }
    void reload();
  }

  async function mic() {
    if (rec) {
      rec.stop();
      setRec(null);
      return;
    }
    try {
      const r = await listen(async (wav) => {
        r.stop();
        setRec(null);
        setHearing(true);
        try {
          const fd = new FormData();
          fd.append("audio", wav, "cmd.wav");
          const j = await aj<{ text: string }>("/api/agent/transcribe", { method: "POST", body: fd });
          if (j.text) setText((x) => (x ? `${x} ${j.text}` : j.text));
          else toast("Яриа сонсогдсонгүй", "danger");
        } catch (e) {
          toast(e instanceof Error ? e.message : "Алдаа", "danger");
        } finally {
          setHearing(false);
        }
      });
      setRec(r);
    } catch {
      toast("Микрофон нээгдсэнгүй", "danger");
    }
  }

  const pending = new Map((data?.pending ?? []).map((a) => [a.id, a]));

  return (
    <div className="mx-auto grid max-w-[1320px] gap-6 px-4 py-6 md:px-8 xl:grid-cols-[minmax(0,1fr)_340px]">
      <section className="flex min-h-[calc(100dvh-120px)] flex-col">
        <div className="mb-4">
          <Title className="text-[28px] font-bold tracking-[-0.02em]">Юу хийлгэх вэ?</Title>
          <p className="text-[14.5px] text-mute">Энгийнээр бичээд эсвэл хэлээд өгөөрэй. AI ажилтан ПОС, харилцагч, урамшуулал, мэдлэгийн сан дээр өөрөө хийнэ.</p>
        </div>

        <div className="flex-1 space-y-4">
          {!msgs.length && !busy && (
            <div className="grid gap-2 sm:grid-cols-2">
              {SUGGEST.map((s) => (
                <button key={s} type="button" onClick={() => void send(s)} className="sp-tap rounded-[16px] bg-paper p-4 text-left text-[14.5px] leading-snug shadow-[0_0_0_0.5px_var(--sp-sep)] hover:shadow-[0_0_0_1.5px_var(--accent)]">
                  <Icon name="sparkle" size={16} className="mb-1.5 text-accent" />
                  {s}
                </button>
              ))}
            </div>
          )}
          {msgs.map((m) =>
            m.role === "user" ? (
              <div key={m.id} className="flex justify-end">
                <div className="max-w-[80%] rounded-[20px] rounded-br-[6px] bg-ink px-4 py-2.5 text-[15px] text-paper">{m.text}</div>
              </div>
            ) : m.role === "system" ? (
              <div key={m.id} className="text-center text-[13px] font-medium text-mute">
                {m.text} · {hm(m.at)}
              </div>
            ) : (
              <div key={m.id} className="flex gap-3">
                <div className="grid size-8 shrink-0 place-items-center rounded-full bg-accent text-white">
                  <Icon name="sparkle" size={16} />
                </div>
                <div className="min-w-0 flex-1 space-y-2">
                  {m.meta?.assistant && <AssistantChip tag={m.meta.assistant} />}
                  {!!m.meta?.steps?.length && <Steps steps={m.meta.steps} pending={pending} decide={decide} />}
                  <div className="rounded-[18px] rounded-tl-[6px] bg-paper px-4 py-3 text-[15px] leading-relaxed shadow-[0_0_0_0.5px_var(--sp-sep)]">
                    <Md text={m.text} />
                  </div>
                  <div className="text-[12px] text-mute">{hm(m.at)}</div>
                </div>
              </div>
            ),
          )}
          {busy && (
            <div className="flex gap-3">
              <div className="grid size-8 shrink-0 place-items-center rounded-full bg-accent text-white">
                <Spinner size={16} />
              </div>
              <div className="min-w-0 flex-1 space-y-2">
                {live.length > 0 && (
                  <div className="space-y-1.5 rounded-[16px] bg-paper p-3 shadow-[0_0_0_0.5px_var(--sp-sep)]">
                    {live.map((a) => (
                      <div key={a.id} className="sp-ai-in flex items-center gap-2 text-[13.5px]">
                        <StatusDot s={a.status} />
                        <span className="font-medium">{a.summary}</span>
                      </div>
                    ))}
                  </div>
                )}
                <div className="text-[14px] text-mute">AI ажиллаж байна…</div>
              </div>
            </div>
          )}
          <div ref={end} />
        </div>

        <div className="sticky bottom-0 mt-4 bg-gradient-to-t from-stage via-stage pb-2 pt-3">
          {msgs.length > 0 && !busy && (
            <div className="sp-scroll mb-2 flex gap-2 overflow-x-auto pb-1">
              {SUGGEST.slice(0, 4).map((s) => (
                <button key={s} type="button" onClick={() => void send(s)} className="sp-tap shrink-0 rounded-full bg-paper px-3 py-1.5 text-[13px] shadow-[0_0_0_0.5px_var(--sp-sep)]">
                  {s.length > 46 ? `${s.slice(0, 44)}…` : s}
                </button>
              ))}
            </div>
          )}
          <div className="sp-scroll mb-2 flex items-center gap-1.5 overflow-x-auto pb-1" role="radiogroup" aria-label="Туслах сонгох">
            <span className="shrink-0 text-[12.5px] font-semibold text-mute">Туслах:</span>
            {(["auto", ...DIRECTOR_ASSISTANTS] as const).map((id) => (
              <button
                key={id}
                type="button"
                role="radio"
                aria-checked={pick === id}
                onClick={() => setPick(id)}
                className={cx("sp-tap shrink-0 rounded-full px-3 py-1 text-[12.5px] font-semibold", pick === id ? "bg-ink text-paper" : "bg-paper text-ink shadow-[0_0_0_0.5px_var(--sp-sep)]")}
              >
                {id === "auto" ? "Автомат" : ASSISTANTS[id].name}
              </button>
            ))}
          </div>
          <div className="flex items-end gap-2 rounded-[22px] bg-paper p-2 shadow-[0_0_0_0.5px_var(--sp-sep),0_10px_30px_-18px_rgb(0_0_0/0.35)]">
            <button
              type="button"
              onClick={() => void mic()}
              aria-label={rec ? "Бичлэг зогсоох" : "Ярьж тушаах"}
              className={cx("sp-tap grid size-11 shrink-0 place-items-center rounded-full", rec ? "sp-pulse bg-danger text-white" : "bg-[var(--sp-fill)] text-ink")}
            >
              {hearing ? <Spinner size={18} /> : <Icon name="mic" size={20} />}
            </button>
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
              placeholder={rec ? "Сонсож байна… ярьж дуусахад автоматаар бичигдэнэ" : "Жишээ: Талхны үнийг 2000 болгоод, өнөөдрийн тайланг гарга"}
              className="max-h-40 min-h-11 flex-1 resize-none bg-transparent px-2 py-2.5 text-[16px] outline-none placeholder:text-mute"
            />
            <Btn size="md" icon="send" onClick={() => void send()} loading={busy} disabled={!text.trim()} className="rounded-full">
              Гүйцэтгэ
            </Btn>
          </div>
        </div>
      </section>

      <aside className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Mini label="Өнөөдөр AI хариулсан" value={stats?.today.aiReplies ?? "—"} onClick={() => go("inbox")} />
          <Mini label="AI-ийн үйлдэл" value={stats?.today.actions ?? "—"} />
          <Mini label="Нээлттэй гомдол" value={stats?.complaints ?? "—"} tone={stats?.complaints ? "danger" : undefined} onClick={() => go("tickets")} />
          <Mini label="Ажилтан хүлээж буй" value={stats?.humanQueue ?? "—"} tone={stats?.humanQueue ? "warn" : undefined} onClick={() => go("inbox")} />
          <Mini label="Өнөөдрийн борлуулалт" value={stats?.today.sales?.total ?? "—"} wide />
        </div>
        {!!stats?.lowStock.length && (
          <div className="rounded-[18px] bg-paper p-4 shadow-[0_0_0_0.5px_var(--sp-sep)]">
            <div className="mb-2 text-[13px] font-semibold text-mute">Дуусаж буй бараа</div>
            {stats.lowStock.slice(0, 5).map((p) => (
              <div key={p.name} className="flex justify-between py-1 text-[14px]">
                <span className="truncate">{p.name}</span>
                <span className={cx("tnum font-semibold", p.stock === 0 ? "text-danger" : "text-warn")}>{p.stock}</span>
              </div>
            ))}
          </div>
        )}
        <div className="rounded-[18px] bg-paper p-4 shadow-[0_0_0_0.5px_var(--sp-sep)]">
          <div className="mb-2 flex items-center justify-between text-[13px] font-semibold text-mute">
            <span>AI-ийн сүүлийн ажил</span>
            <span className="flex items-center gap-1.5 text-ok">
              <span className="sp-pulse size-1.5 rounded-full bg-ok" /> шууд
            </span>
          </div>
          {!stats?.recentActions.length && <div className="py-2 text-[13.5px] text-mute">Одоохондоо алга</div>}
          {stats?.recentActions.map((a, i) => (
            <div key={i} className="flex gap-2 border-t border-[var(--sp-sep)] py-2 first:border-0">
              <StatusDot s={a.status} />
              <div className="min-w-0 flex-1">
                <div className="text-[13.5px] leading-snug">{a.summary}</div>
                <div className="text-[12px] text-mute">
                  {a.actor.includes("MCP") ? CHANNEL.mcp.label : a.actor.includes("захирл") ? "Захирлын тушаал" : "Харилцагчийн яриа"} · {ago(a.at)}
                </div>
              </div>
            </div>
          ))}
        </div>
      </aside>
    </div>
  );
}

/** Хариу бүрт аль туслах ажилласан (§10) */
function AssistantChip({ tag }: { tag: Tag }) {
  return (
    <div className="inline-flex items-center gap-1.5 rounded-full bg-accent-soft px-2.5 py-1 text-[12px] font-semibold text-accent" data-assistant={tag.id}>
      <Icon name="sparkle" size={12} />
      {tag.name}
      <span className="font-normal opacity-70">· {VIA[tag.via] ?? "автомат"}</span>
    </div>
  );
}

function StatusDot({ s }: { s: string }) {
  return <span className={cx("mt-1.5 size-2 shrink-0 rounded-full", s === "done" ? "bg-ok" : s === "pending" ? "bg-warn" : s === "rejected" ? "bg-mute" : "bg-danger")} />;
}

function Mini({ label, value, tone, onClick, wide }: { label: string; value: React.ReactNode; tone?: "danger" | "warn"; onClick?: () => void; wide?: boolean }) {
  return (
    <button type="button" disabled={!onClick} onClick={onClick} className={cx("rounded-[16px] bg-paper p-3.5 text-left shadow-[0_0_0_0.5px_var(--sp-sep)]", onClick && "sp-tap", wide && "col-span-2")}>
      <div className="text-[12px] text-mute">{label}</div>
      <div className={cx("mt-1 text-[22px] font-bold tnum leading-none", tone === "danger" ? "text-danger" : tone === "warn" ? "text-warn" : "text-ink")}>{value}</div>
    </button>
  );
}

const ARG_LABEL: Record<string, string> = { text: "Мессеж", segment: "Хэнд", order_no: "Захиалга", sale_no: "Гүйлгээ", reason: "Шалтгаан", contact_ids: "Харилцагч" };

function Steps({ steps, pending, decide }: { steps: Step[]; pending: Map<string, Action>; decide: (id: string, ok: boolean) => void }) {
  return (
    <div className="space-y-1.5 rounded-[16px] bg-paper p-3 shadow-[0_0_0_0.5px_var(--sp-sep)]">
      {steps.map((s, i) => {
        const wait = s.status === "pending" && pending.has(s.action_id);
        return (
          <div key={i} className={cx(wait && "rounded-[12px] bg-warn-soft p-3")}>
            <div className="flex items-start gap-2 text-[13.5px]">
              {s.status === "pending" ? <Icon name="clock" size={16} className="mt-0.5 text-warn" /> : s.ok ? <Icon name="check" size={16} className="mt-0.5 text-ok" /> : <Icon name="close" size={16} className="mt-0.5 text-danger" />}
              <div className="min-w-0 flex-1">
                <span className="font-semibold">{s.title}</span>
                <span className="text-mute"> — {wait ? "таны батламж хүлээж байна" : s.status === "pending" ? "шийдвэрлэгдсэн" : s.summary}</span>
              </div>
            </div>
            {wait && (
              <div className="mt-2 space-y-2 pl-6">
                {Object.entries(s.args)
                  .filter(([k]) => ARG_LABEL[k])
                  .map(([k, v]) => (
                    <div key={k} className="text-[13.5px]">
                      <span className="text-mute">{ARG_LABEL[k]}: </span>
                      {Array.isArray(v) ? `${v.length} харилцагч` : String(v)}
                    </div>
                  ))}
                <div className="flex gap-2">
                  <Btn size="sm" icon="check" onClick={() => decide(s.action_id, true)}>
                    Батлах
                  </Btn>
                  <Btn size="sm" variant="gray" onClick={() => decide(s.action_id, false)}>
                    Татгалзах
                  </Btn>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
