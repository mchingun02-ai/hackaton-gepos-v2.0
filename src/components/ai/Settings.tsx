"use client";

/** Тохиргоо — AI-ийн зан төлөв, сувгууд, харилцагчийн хуудас, MCP түлхүүр, загварууд. */
import qrcode from "qrcode-generator";
import { useEffect, useMemo, useState } from "react";
import { Icon } from "@/components/sp/icons";
import { Badge, Btn, cx, Switch, toast } from "@/components/sp/ui";
import { Head } from "./AiApp";
import { aj, useLive } from "./client";

type S = {
  agentName: string;
  businessName: string;
  businessAbout: string;
  greeting: string;
  instructions: string;
  hours: string;
  channels: { web: boolean; voice: boolean; fb: boolean };
  confirmRisky: boolean;
  fbMode: "off" | "testers" | "all";
  fbTesters: { psid: string; name: string }[];
  fbTesterRequests: { psid: string; name: string; at: number }[];
};
type FbInfo = { judgeRef: string; allowAll: boolean };
type AiInfo = { ready: boolean; host: string; model: string; fast: string; embed: string; omni: string; tts: string };
type Key = { prefix: string; label: string; created_at: number; last_used: number | null };
type Fb = {
  demo: boolean;
  page: { id: string; name: string; demo: boolean } | null;
  scopes: { granted: string[] | null; required: string[]; missing: string[]; comments: string[]; commentsMissing: string[] | null } | null;
};
const SCOPE_LABEL: Record<string, string> = {
  pages_show_list: "Page-ийн жагсаалт",
  pages_messaging: "Messenger мессеж",
  pages_manage_metadata: "Webhook захиалах",
  pages_read_engagement: "Нэр, зураг унших",
  pages_read_user_content: "Comment унших",
  pages_manage_engagement: "Comment-д хариулах",
};

function Qr({ text }: { text: string }) {
  const svg = useMemo(() => {
    const q = qrcode(0, "M");
    q.addData(text);
    q.make();
    return q.createSvgTag({ cellSize: 3, margin: 2, scalable: true });
  }, [text]);
  return <div className="size-28 shrink-0 rounded-[10px] bg-white p-1 [&>svg]:size-full" dangerouslySetInnerHTML={{ __html: svg }} />;
}

export function Settings() {
  const { data, reload } = useLive<{ settings: S; ai: AiInfo; fb?: FbInfo }>("/api/agent/settings", ["settings"]);
  const keys = useLive<{ keys: Key[] }>("/api/agent/keys", []);
  const [draft, setS] = useState<S | null>(null);
  const s = draft ?? data?.settings ?? null;
  const [fb, setFb] = useState<Fb | null>(null);
  const [newKey, setNewKey] = useState<string | null>(null);
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  // Нийтийн холбоос, QR — гарын үсэгтэй widget токен (РД URL-д гарахгүй)
  const widget = useLive<{ token: string }>("/api/agent/widget", []);
  const w = widget.data?.token ?? "";
  useEffect(() => {
    void aj<Fb>("/api/fb/status").then(setFb).catch(() => setFb(null));
  }, []);
  async function rotate() {
    if (!confirm("Хуучин QR код, холбоос ажиллахаа болино. Шинэ холбоос үүсгэх үү?")) return;
    try {
      widget.setData(await aj<{ token: string }>("/api/agent/widget", { method: "POST" }));
      toast("Шинэ холбоос үүсгэлээ. Хуучин QR-ийг солиорой.", "ok");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Алдаа", "danger");
    }
  }

  async function save(patch: Partial<S>) {
    try {
      const r = await aj<{ settings: S }>("/api/agent/settings", { method: "PUT", json: patch });
      setS(r.settings);
      toast("Хадгаллаа", "ok");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Алдаа", "danger");
    }
    void reload();
  }
  async function makeKey() {
    const r = await aj<{ key: string }>("/api/agent/keys", { method: "POST", json: { label: "MCP клиент" } });
    setNewKey(r.key);
    void keys.reload();
  }
  async function dropKey(prefix: string) {
    await aj(`/api/agent/keys?prefix=${encodeURIComponent(prefix)}`, { method: "DELETE" });
    void keys.reload();
  }

  if (!s || !data || !w) return <Head title="Тохиргоо" sub="Ачаалж байна…" />;
  const chat = `${origin}/ai/chat?w=${encodeURIComponent(w)}`;
  const call = `${origin}/ai/call?w=${encodeURIComponent(w)}`;
  const mcpUrl = `${origin}/api/mcp`;

  return (
    <div>
      <Head title="Тохиргоо" sub="AI-ийн нэр, зан төлөв, сувгууд, гаднын AI холболт (MCP)." />
      <div className="mx-auto grid max-w-[1320px] gap-4 px-4 pb-12 md:px-8 lg:grid-cols-2">
        <section className="space-y-3 rounded-[20px] bg-paper p-5 shadow-[0_0_0_0.5px_var(--sp-sep)]">
          <div className="text-[16px] font-bold">AI ажилтан</div>
          <label className="block">
            <span className="text-[13px] text-mute">Нэр (харилцагчид харагдана)</span>
            <input className="sp-field mt-1 h-11 w-full" value={s.agentName} onChange={(e) => setS({ ...s, agentName: e.target.value })} />
          </label>
          <label className="block">
            <span className="text-[13px] text-mute">Байгууллагын нэр (хоосон бол ПОС-ын дэлгүүрийн нэр)</span>
            <input className="sp-field mt-1 h-11 w-full" value={s.businessName} placeholder="Ж: Гэрэгэ ПОС" onChange={(e) => setS({ ...s, businessName: e.target.value })} />
          </label>
          <label className="block">
            <span className="text-[13px] text-mute">Байгууллагын товч танилцуулга</span>
            <textarea className="sp-field mt-1 w-full resize-y py-2.5" rows={2} value={s.businessAbout} placeholder="Ж: ПОС төхөөрөмж, касс, и-баримтын шийдэл нийлүүлдэг" onChange={(e) => setS({ ...s, businessAbout: e.target.value })} />
          </label>
          <label className="block">
            <span className="text-[13px] text-mute">Мэндчилгээ</span>
            <input className="sp-field mt-1 h-11 w-full" value={s.greeting} onChange={(e) => setS({ ...s, greeting: e.target.value })} />
          </label>
          <label className="block">
            <span className="text-[13px] text-mute">Ажлын цаг</span>
            <input className="sp-field mt-1 h-11 w-full" value={s.hours} onChange={(e) => setS({ ...s, hours: e.target.value })} />
          </label>
          <label className="block">
            <span className="text-[13px] text-mute">Нэмэлт дүрэм (AI заавал дагана)</span>
            <textarea
              className="sp-field mt-1 w-full resize-y py-2.5"
              rows={4}
              value={s.instructions}
              placeholder="Ж: Хямдралыг өөрөө амлахгүй. Гомдол гаргасан хүнд уучлал гуйж, менежер 1 цагт залгана гэж хэл."
              onChange={(e) => setS({ ...s, instructions: e.target.value })}
            />
          </label>
          <div className="flex items-center justify-between gap-3 rounded-[12px] bg-stage p-3">
            <div>
              <div className="text-[14.5px] font-semibold">Эрсдэлтэй үйлдлийг батлуулах</div>
              <div className="text-[12.5px] text-mute">Буцаалт, захиалга цуцлах, олон хүнд мессеж илгээхээс өмнө</div>
            </div>
            <Switch label="Батлуулах" checked={s.confirmRisky} onChange={(v) => setS({ ...s, confirmRisky: v })} />
          </div>
          <Btn size="md" onClick={() => void save({ agentName: s.agentName, businessName: s.businessName, businessAbout: s.businessAbout, greeting: s.greeting, hours: s.hours, instructions: s.instructions, confirmRisky: s.confirmRisky })}>
            Хадгалах
          </Btn>
        </section>

        <section className="space-y-3 rounded-[20px] bg-paper p-5 shadow-[0_0_0_0.5px_var(--sp-sep)]">
          <div className="text-[16px] font-bold">Сувгууд</div>
          <div className="flex gap-3 rounded-[14px] bg-stage p-3">
            <Qr text={chat} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between">
                <div className="text-[14.5px] font-semibold">Вэб чат</div>
                <Switch label="Вэб чат" checked={s.channels.web} onChange={(v) => void save({ channels: { ...s.channels, web: v } })} />
              </div>
              <div className="text-[12.5px] text-mute">Сайт, Instagram bio, ширээн дээрх QR-д байрлуулна</div>
              <a href={chat} target="_blank" rel="noreferrer" className="mt-1 block truncate text-[13px] text-accent">
                {chat}
              </a>
            </div>
          </div>
          <div className="flex gap-3 rounded-[14px] bg-stage p-3">
            <Qr text={call} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between">
                <div className="text-[14.5px] font-semibold">AI дуудлагын төв</div>
                <Switch label="Дуудлага" checked={s.channels.voice} onChange={(v) => void save({ channels: { ...s.channels, voice: v } })} />
              </div>
              <div className="text-[12.5px] text-mute">Харилцагч утсаараа QR уншуулж монголоор ярина</div>
              <a href={call} target="_blank" rel="noreferrer" className="mt-1 block truncate text-[13px] text-accent">
                {call}
              </a>
            </div>
          </div>
          <div className="flex items-center gap-3 rounded-[14px] bg-stage p-3">
            <Icon name="lock" size={18} className="shrink-0 text-mute" />
            <div className="min-w-0 flex-1 text-[12.5px] text-mute">Холбоос алдагдсан эсвэл хуучин QR-ийг хаах бол шинэ холбоос үүсгэнэ.</div>
            <Btn size="sm" variant="tinted" icon="undo" onClick={() => void rotate()}>
              Холбоос шинэчлэх
            </Btn>
          </div>
          <FbCard fb={fb} s={s} save={save} info={data?.fb ?? null} requests={data?.settings.fbTesterRequests ?? []} />
        </section>

        <section className="space-y-3 rounded-[20px] bg-paper p-5 shadow-[0_0_0_0.5px_var(--sp-sep)]">
          <div className="flex items-center gap-2 text-[16px] font-bold">
            MCP сервер <Badge tone="accent">Model Context Protocol</Badge>
          </div>
          <p className="text-[13.5px] leading-snug text-mute">
            Гаднын AI клиент (Qwen-Agent, Model Studio-ийн MCP, Cursor г.м) энэ түлхүүрээр холбогдож AI ажилтны бүх хэрэгслийг ({"бараа, тайлан, захиалга, урамшуулал, CRM, мэдлэгийн сан"}) ашиглана.
          </p>
          <div className="rounded-[12px] bg-stage p-3 font-mono text-[12px] leading-relaxed">
            <div>URL: {mcpUrl}</div>
            <div>Transport: Streamable HTTP · Authorization: Bearer gai_…</div>
          </div>
          {newKey && (
            <div className="rounded-[12px] bg-ok-soft p-3 text-[13px]">
              <div className="font-semibold text-ok">Шинэ түлхүүр — одоо хуулж аваарай, дахин харагдахгүй</div>
              <div className="mt-1 break-all font-mono text-[12px]">{newKey}</div>
              <button type="button" className="mt-1 text-[12.5px] font-semibold text-accent" onClick={() => void navigator.clipboard.writeText(newKey).then(() => toast("Хууллаа", "ok"))}>
                Хуулах
              </button>
            </div>
          )}
          {(keys.data?.keys ?? []).map((k) => (
            <div key={k.prefix} className="flex items-center gap-2 border-t border-[var(--sp-sep)] pt-2 text-[13.5px]">
              <Icon name="key" size={16} className="text-mute" />
              <span className="font-mono">{k.prefix}…</span>
              <span className="flex-1 text-mute">{k.last_used ? `сүүлд ${new Date(k.last_used).toLocaleString("mn-MN", { dateStyle: "short", timeStyle: "short" })}` : "ашиглаагүй"}</span>
              <button type="button" onClick={() => void dropKey(k.prefix)} className="text-[12.5px] font-semibold text-danger">
                Устгах
              </button>
            </div>
          ))}
          <Btn size="md" variant="tinted" icon="key" onClick={() => void makeKey()}>
            Түлхүүр үүсгэх
          </Btn>
        </section>

        <section className="space-y-2 rounded-[20px] bg-paper p-5 shadow-[0_0_0_0.5px_var(--sp-sep)]">
          <div className="flex items-center gap-2 text-[16px] font-bold">
            AI загварууд
            <Badge tone={data.ai.ready ? "ok" : "danger"}>{data.ai.ready ? "Холбогдсон" : "Түлхүүр алга"}</Badge>
          </div>
          <p className="text-[13px] text-mute">Бүх inference — Alibaba Cloud Model Studio ({data.ai.host.replace("https://", "")})</p>
          {[
            ["Агент, tool calling", data.ai.model],
            ["Харилцагчийн карт", data.ai.fast],
            ["Мэдлэгийн сан (embedding)", data.ai.embed],
            ["Яриа сонсох", data.ai.omni],
            ["Дуугаар хариулах", data.ai.tts],
          ].map(([k, v]) => (
            <div key={k} className="flex justify-between border-t border-[var(--sp-sep)] py-2 text-[14px]">
              <span>{k}</span>
              <span className="font-mono text-[13px]">{v}</span>
            </div>
          ))}
        </section>
      </div>
    </div>
  );
}

type Thread = { psid: string; name: string; lastAt: number; lastText: string };

/** Messenger: унтраах / зөвхөн тестер / бүх харилцагч. Бодит Page дээр «зөвхөн тестер»-ээр туршина. */
function FbCard({ fb, s, save, info, requests }: { fb: Fb | null; s: S; save: (p: Partial<S>) => Promise<void>; info: FbInfo | null; requests: S["fbTesterRequests"] }) {
  const [threads, setThreads] = useState<Thread[] | null>(null);
  const [q, setQ] = useState("");
  const ready = !!fb?.page && !fb.page.demo;
  async function loadThreads() {
    try {
      setThreads((await aj<{ threads: Thread[] }>(`/api/fb/threads?state=all&q=${encodeURIComponent(q)}`)).threads.slice(0, 30));
    } catch (e) {
      toast(e instanceof Error ? e.message : "Алдаа", "danger");
    }
  }
  const has = (psid: string) => s.fbTesters.some((t) => t.psid === psid);
  const toggle = (t: Thread) => void save({ fbTesters: has(t.psid) ? s.fbTesters.filter((x) => x.psid !== t.psid) : [...s.fbTesters, { psid: t.psid, name: t.name }] });
  const modes = [
    { id: "off", label: "Унтраах" },
    { id: "testers", label: "Зөвхөн тестер" },
    { id: "all", label: "Бүх харилцагч" },
  ] as const;
  return (
    <div className="space-y-2 rounded-[14px] bg-stage p-3">
      <div className="text-[14.5px] font-semibold">Facebook Messenger</div>
      <div className="text-[12.5px] text-mute">
        {fb?.page ? (fb.page.demo ? "Демо Page холбогдсон — жинхэнэ Page холбоно уу." : `Холбогдсон: ${fb.page.name}`) : "Page холбогдоогүй — Портал → Facebook чат хэсгээс холбоно."}
      </div>
      <div className="flex gap-1 rounded-[12px] bg-[var(--sp-fill)] p-1">
        {modes.map((m) => (
          <button
            key={m.id}
            type="button"
            disabled={(!ready && m.id !== "off") || (m.id === "all" && !info?.allowAll && s.fbMode !== "all")}
            title={m.id === "all" && !info?.allowAll ? "Хакатоны орчинд хаалттай — «Зөвхөн тестер» ашиглана" : undefined}
            onClick={() => {
              if (m.id === "all" && !confirm(`«${fb?.page?.name}» Page-д бичсэн БҮХ бодит харилцагчид AI автоматаар хариулна. Итгэлтэй байна уу?`)) return;
              void save({ fbMode: m.id });
            }}
            className={cx("sp-tap flex-1 rounded-[9px] py-1.5 text-[13px] font-semibold disabled:opacity-40", s.fbMode === m.id ? "bg-paper shadow-sm" : "text-mute")}
          >
            {m.label}
          </button>
        ))}
      </div>
      {s.fbMode === "all" && <div className="text-[12.5px] font-semibold text-danger">AI бодит харилцагчдад хариулж байна.</div>}
      {ready && <FbScopes fb={fb!} />}
      {s.fbMode === "testers" && (
        <div className="space-y-2">
          <div className="text-[12.5px] text-mute">AI зөвхөн доорх хүмүүст хариулна. Бусад бүх мессеж зөвхөн порталд харагдана.</div>
          {ready && info && <JudgeLink link={`https://m.me/${fb!.page!.id}?ref=${info.judgeRef}`} />}
          {requests.map((r) => (
            <div key={r.psid} className="flex items-center gap-2 rounded-[10px] bg-warn-soft px-3 py-2 text-[13.5px]">
              <Icon name="person" size={16} className="text-warn" />
              <span className="min-w-0 flex-1 truncate">
                <b>{r.name}</b> — туршигчаар нэмэх үү?
              </span>
              <button
                type="button"
                className="text-[12.5px] font-semibold text-ok"
                onClick={() => void save({ fbTesters: [...s.fbTesters, { psid: r.psid, name: r.name }], fbTesterRequests: requests.filter((x) => x.psid !== r.psid) })}
              >
                Нэмэх
              </button>
              <button type="button" className="text-[12.5px] font-semibold text-mute" onClick={() => void save({ fbTesterRequests: requests.filter((x) => x.psid !== r.psid) })}>
                Үл тоох
              </button>
            </div>
          ))}
          {s.fbTesters.map((t) => (
            <div key={t.psid} className="flex items-center gap-2 rounded-[10px] bg-paper px-3 py-2 text-[13.5px]">
              <Icon name="person" size={16} className="text-ok" />
              <span className="flex-1">{t.name || t.psid}</span>
              <button type="button" className="text-[12.5px] font-semibold text-danger" onClick={() => void save({ fbTesters: s.fbTesters.filter((x) => x.psid !== t.psid) })}>
                Хасах
              </button>
            </div>
          ))}
          <div className="flex gap-2">
            <input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && void loadThreads()} placeholder="Нэрээр хайх" className="sp-field h-10 flex-1 text-[14px]" />
            <Btn size="sm" variant="tinted" onClick={() => void loadThreads()}>
              Тестер нэмэх
            </Btn>
          </div>
          {threads && (
            <div className="max-h-56 overflow-y-auto rounded-[10px] bg-paper">
              {!threads.length && <div className="p-3 text-[13px] text-mute">Олдсонгүй</div>}
              {threads.map((t) => (
                <button key={t.psid} type="button" onClick={() => toggle(t)} className="sp-row flex w-full items-center gap-2 border-b border-[var(--sp-sep)] px-3 py-2 text-left text-[13.5px] last:border-0">
                  <span className={cx("grid size-5 place-items-center rounded-full", has(t.psid) ? "bg-ok text-white" : "bg-[var(--sp-fill)]")}>{has(t.psid) && <Icon name="check" size={12} />}</span>
                  <span className="flex-1 truncate">{t.name}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** Олгосон эрх vs шаардлагатай; comment-ийн эрх дутуу бол «Facebook-ийг дахин холбох» (одоогийн /api/fb/connect урсгал) */
function FbScopes({ fb }: { fb: Fb }) {
  const sc = fb.scopes;
  if (!sc) return null;
  const granted = sc.granted;
  const missingComments = sc.commentsMissing ?? [];
  return (
    <div className="space-y-2 rounded-[10px] bg-paper p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="text-[13px] font-semibold">Facebook-ийн эрх</div>
        {granted === null && <span className="text-[12px] text-mute">Facebook-аас шалгаж чадсангүй</span>}
      </div>
      <div className="grid gap-1">
        {sc.required.map((x) => {
          const ok = granted ? granted.includes(x) : null;
          return (
            <div key={x} className="flex items-center gap-1.5 text-[12.5px]" title={x}>
              <span className={cx("grid size-4 shrink-0 place-items-center rounded-full", ok === null ? "bg-[var(--sp-fill)]" : ok ? "bg-ok text-white" : "bg-danger text-white")}>
                {ok !== null && <Icon name={ok ? "check" : "close"} size={10} />}
              </span>
              <span className="truncate">{SCOPE_LABEL[x] ?? x}</span>
              <span className="truncate font-mono text-[10.5px] text-mute">{x}</span>
            </div>
          );
        })}
      </div>
      {missingComments.length > 0 && (
        <div className="space-y-2 rounded-[10px] bg-warn-soft p-2.5 text-[12.5px] text-warn">
          <div>
            Comment унших/хариулах эрх алга ({missingComments.join(", ")}). Page-ийн админ хаягаар дахин холбож эрхийг зөвшөөрнө үү. Messenger үргэлжлэн ажиллана.
          </div>
          <a href="/api/fb/connect" className="inline-flex h-8 items-center gap-1.5 rounded-full bg-paper px-3 text-[13px] font-semibold text-accent">
            <Icon name="link" size={14} />
            Facebook-ийг дахин холбох
          </a>
        </div>
      )}
    </div>
  );
}

/** Шүүгч/туршигч нэмэх холбоос (§9.4): нээгээд Page руу бичихэд энд «Туршигчаар нэмэх үү?» гарна */
function JudgeLink({ link }: { link: string }) {
  return (
    <div className="flex items-center gap-3 rounded-[10px] bg-paper p-2.5">
      <Qr text={link} />
      <div className="min-w-0 flex-1 space-y-1">
        <div className="text-[13px] font-semibold">Туршигч нэмэх холбоос</div>
        <div className="break-all font-mono text-[11.5px] text-mute">{link}</div>
        <Btn
          size="sm"
          variant="tinted"
          icon="link"
          onClick={() =>
            void navigator.clipboard
              .writeText(link)
              .then(() => toast("Хууллаа", "ok"))
              .catch(() => toast("Хуулж чадсангүй", "danger"))
          }
        >
          Хуулах
        </Btn>
      </div>
    </div>
  );
}
