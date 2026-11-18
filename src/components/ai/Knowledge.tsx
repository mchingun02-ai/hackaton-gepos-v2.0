"use client";

/** Мэдлэгийн сан — AI юуг мэдэж хариулахыг энд тодорхойлно. Файл оруулах, тэмдэглэл бичих, шалгах. */
import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/sp/icons";
import { Badge, Btn, cx, Empty, toast } from "@/components/sp/ui";
import { Head } from "./AiApp";
import { aj, ago, useLive } from "./client";

type Prov = { source: string; label?: string; ids?: string[]; window?: string; generated_at: number; model?: string | null; question?: string };
type Doc = {
  id: string;
  title: string;
  kind: string;
  source: string | null;
  chars: number;
  chunks: number;
  created_at: number;
  status: "published" | "pending" | "rejected" | "archived";
  audience: "customer" | "internal";
  auto_key: string | null;
  refreshed_at: number | null;
  valid_until: number | null;
  provenance: Prov | null;
};
type Hit = { doc: string; text: string; score: number; label?: string };
type Refresh = { docs: { key: string; title: string; result: string }[]; faq?: { proposed: number; sources: number; skipped?: string } };
const RESULT: Record<string, string> = { created: "үүслээ", updated: "шинэчлэгдлээ", unchanged: "өөрчлөлтгүй", archived: "архивлагдлаа", skipped: "алгаслаа" };
const FAQ_SKIP: Record<string, string> = { no_items: "шийдэгдсэн тасалбар, ажилтны хариу алга", no_credits: "кредит хүрэлцэхгүй", ai_error: "AI алдаа" };

export function Knowledge() {
  const { data, reload } = useLive<{ docs: Doc[] }>("/api/agent/kb", ["kb"]);
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState(false);
  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[] | null>(null);
  const [open, setOpen] = useState<{ id: string; chunks: string[] } | null>(null);
  const file = useRef<HTMLInputElement>(null);
  const [refreshing, setRefreshing] = useState<"" | "tpl" | "faq">("");

  async function refresh(faq: boolean) {
    setRefreshing(faq ? "faq" : "tpl");
    try {
      const r = await aj<Refresh>("/api/agent/kb/auto", { method: "POST", json: { faq } });
      const changed = r.docs.filter((d) => d.result === "created" || d.result === "updated").length;
      if (faq) toast(r.faq?.skipped ? `FAQ: ${FAQ_SKIP[r.faq.skipped] ?? r.faq.skipped}` : `${r.faq?.proposed ?? 0} FAQ санал батлах дараалалд нэмэгдлээ`, r.faq?.skipped ? "ink" : "ok");
      else toast(`Автомат баримт: ${r.docs.map((d) => `${d.title} ${RESULT[d.result] ?? d.result}`).join(" · ")}`, changed ? "ok" : "ink");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Алдаа", "danger");
    }
    setRefreshing("");
    void reload();
  }

  async function upload(files: FileList | File[]) {
    const list = [...files];
    if (!list.length) return;
    setBusy(true);
    try {
      const fd = new FormData();
      list.forEach((f) => fd.append("files", f));
      const r = await aj<{ added: { name: string; chunks: number }[] }>("/api/agent/kb", { method: "POST", body: fd });
      toast(`${r.added.length} баримт нэмэгдэж, ${r.added.reduce((a, x) => a + x.chunks, 0)} хэсэг болгон ойлгуулав`, "ok");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Алдаа", "danger");
    }
    setBusy(false);
    void reload();
  }
  async function addNote() {
    if (!note.trim()) return;
    setBusy(true);
    try {
      await aj("/api/agent/kb", { method: "POST", json: { title: title || "Тэмдэглэл", text: note } });
      setTitle("");
      setNote("");
      toast("Нэмэгдлээ", "ok");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Алдаа", "danger");
    }
    setBusy(false);
    void reload();
  }
  async function test() {
    if (!q.trim()) return;
    try {
      setHits((await aj<{ hits: Hit[] }>(`/api/agent/kb?q=${encodeURIComponent(q)}`)).hits);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Алдаа", "danger");
    }
  }
  async function del(d: Doc) {
    if (!confirm(`«${d.title}»-ийг устгах уу? AI цаашид энэ мэдээллийг ашиглахгүй.`)) return;
    await aj(`/api/agent/kb/${d.id}`, { method: "DELETE" }).catch((e) => toast(e.message, "danger"));
    void reload();
  }
  async function view(d: Doc) {
    if (open?.id === d.id) return setOpen(null);
    const r = await aj<{ chunks: string[] }>(`/api/agent/kb/${d.id}`);
    setOpen({ id: d.id, chunks: r.chunks });
  }

  const all = data?.docs ?? [];
  const pending = all.filter((d) => d.status === "pending");
  const docs = all.filter((d) => d.status !== "pending");
  return (
    <div>
      <Head title="Мэдлэгийн сан" sub="Журам, түгээмэл асуулт, буцаалт, баталгаа, үнийн жагсаалт… AI харилцагчид зөвхөн эндээс болон ПОС-ын бодит өгөгдлөөс хариулна." />
      <div className="mx-auto grid max-w-[1320px] gap-4 px-4 pb-10 md:px-8 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3 rounded-[18px] bg-paper p-4 shadow-[0_0_0_0.5px_var(--sp-sep)]">
            <Icon name="sparkle" size={22} className="text-accent" />
            <div className="min-w-0 flex-1">
              <div className="text-[15px] font-semibold">Автомат баяжуулалт</div>
              <div className="text-[13px] text-mute">Бараа, үнэ, дэлгүүрийн мэдээлэл, урамшууллыг ПОС-оос автоматаар баримт болгоно (үлдэгдэл, өртөг, харилцагчийн нэр орохгүй).</div>
            </div>
            <Btn size="md" variant="tinted" icon="undo" loading={refreshing === "tpl"} disabled={!!refreshing} onClick={() => void refresh(false)}>
              Одоо сэргээх
            </Btn>
            <Btn size="md" variant="gray" icon="chat" loading={refreshing === "faq"} disabled={!!refreshing} onClick={() => void refresh(true)}>
              FAQ санал гаргах
            </Btn>
          </div>

          {pending.length > 0 && <Queue docs={pending} reload={reload} />}

          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDrag(true);
            }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDrag(false);
              void upload(e.dataTransfer.files);
            }}
            className={cx("grid place-items-center rounded-[18px] border-2 border-dashed p-8 text-center", drag ? "border-accent bg-accent-soft" : "border-line bg-paper")}
          >
            <Icon name="upload" size={30} className="text-accent" />
            <div className="mt-2 text-[16px] font-semibold">Файлаа энд чирж оруулна уу</div>
            <div className="text-[13.5px] text-mute">PDF, TXT, MD, CSV · Qwen embedding-ээр хэсэгчилж ойлгоно</div>
            <Btn size="md" className="mt-3" icon="paperclip" loading={busy} onClick={() => file.current?.click()}>
              Файл сонгох
            </Btn>
            <input ref={file} type="file" multiple accept=".pdf,.txt,.md,.csv,text/plain,application/pdf" className="hidden" onChange={(e) => e.target.files && void upload(e.target.files)} />
          </div>

          <div className="rounded-[18px] bg-paper shadow-[0_0_0_0.5px_var(--sp-sep)]">
            <div className="px-5 pt-4 text-[15px] font-semibold">Баримтууд ({docs.length})</div>
            {!docs.length && data && <Empty icon="file" title="Мэдлэгийн сан хоосон" body="Дэлгүүрийн журам, FAQ-аа оруулбал AI түүгээр хариулна." />}
            <div className="p-2">
              {docs.map((d) => (
                <div key={d.id} className="rounded-[12px] px-3 py-2.5 hover:bg-[var(--sp-fill)]">
                  <div className="flex items-center gap-3">
                    <Icon name="file" size={20} className="text-mute" />
                    <button type="button" onClick={() => void view(d)} className="min-w-0 flex-1 text-left">
                      <div className="truncate text-[14.5px] font-semibold">{d.title}</div>
                      <div className="text-[12.5px] text-mute">
                        {d.chunks} хэсэг · {d.chars.toLocaleString("en-US")} тэмдэгт · {d.kind === "auto" ? `шинэчилсэн ${ago(d.refreshed_at ?? d.created_at)}` : ago(d.created_at)}
                        {d.kind === "auto" && d.provenance?.label ? ` · эх сурвалж: ${d.provenance.label}` : ""}
                      </div>
                    </button>
                    {d.audience === "internal" && <Badge tone="ink">Дотоод</Badge>}
                    {d.status === "archived" && <Badge tone="gray">Архив</Badge>}
                    <Badge tone={d.kind === "file" ? "gray" : d.kind === "sample" ? "warn" : d.kind === "auto" ? "ok" : "accent"}>
                      {d.kind === "file" ? "Файл" : d.kind === "sample" ? "Жишээ" : d.kind === "auto" ? "Автомат" : "Тэмдэглэл"}
                    </Badge>
                    <button type="button" aria-label="Устгах" onClick={() => void del(d)} className="sp-tap grid size-8 place-items-center rounded-full text-mute hover:text-danger">
                      <Icon name="trash" size={17} />
                    </button>
                  </div>
                  {open?.id === d.id && (
                    <div className="mt-2 max-h-72 space-y-2 overflow-y-auto pl-8">
                      {open.chunks.map((c, i) => (
                        <p key={i} className="whitespace-pre-wrap rounded-[10px] bg-stage p-2 text-[12.5px] leading-snug">
                          {c}
                        </p>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="space-y-2 rounded-[18px] bg-paper p-4 shadow-[0_0_0_0.5px_var(--sp-sep)]">
            <div className="text-[15px] font-semibold">Шууд бичиж нэмэх</div>
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Гарчиг (ж: Хүргэлтийн нөхцөл)" className="sp-field h-11 w-full" />
            <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={6} placeholder="Ж: Хүргэлт 10:00–21:00 цагт. 50,000₮-өөс дээш захиалгад хүргэлт үнэгүй…" className="sp-field w-full resize-y py-2.5" />
            <Btn size="md" block loading={busy} disabled={!note.trim()} onClick={() => void addNote()}>
              Нэмэх
            </Btn>
          </div>
          <div className="space-y-2 rounded-[18px] bg-paper p-4 shadow-[0_0_0_0.5px_var(--sp-sep)]">
            <div className="text-[15px] font-semibold">AI юу олохыг шалгах</div>
            <div className="flex gap-2">
              <input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && void test()} placeholder="Харилцагчийн асуулт" className="sp-field h-11 flex-1" />
              <Btn size="md" variant="tinted" icon="search" onClick={() => void test()}>
                Хайх
              </Btn>
            </div>
            {hits && !hits.length && <div className="text-[13.5px] text-mute">Тохирох мэдээлэл олдсонгүй — AI «ажилтан холбогдоно» гэж хариулна.</div>}
            {hits?.map((h, i) => (
              <div key={i} className="rounded-[12px] bg-stage p-2.5">
                <div className="flex justify-between gap-2 text-[12px] text-mute">
                  <span className="truncate">{h.label ? h.doc.replace(` [${h.label}]`, "") : h.doc}</span>
                  <span className={cx("tnum font-semibold", h.score > 0.55 ? "text-ok" : h.score > 0.42 ? "text-warn" : "text-mute")}>{Math.round(h.score * 100)}%</span>
                </div>
                {h.label && <div className="mt-0.5 text-[11.5px] font-semibold text-ok">[{h.label}]</div>}
                <p className="mt-1 line-clamp-4 text-[13px] leading-snug">{h.text}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/** Батлах хүлээж буй (§8): асуулт, хариу, эх сурвалж — Нийтлэх / Засаад нийтлэх / Татгалзах */
function Queue({ docs, reload }: { docs: Doc[]; reload: () => Promise<void> | void }) {
  return (
    <div className="rounded-[18px] bg-paper shadow-[0_0_0_1.5px_var(--warn)]" data-testid="kb-queue">
      <div className="flex items-center gap-2 px-5 pt-4 text-[15px] font-semibold">
        <Icon name="clock" size={18} className="text-warn" />
        Батлах хүлээж буй ({docs.length})
      </div>
      <div className="text-[13px] text-mute px-5">Шийдэгдсэн яриа, тасалбараас AI санал болгосон түгээмэл асуулт. Батлах хүртэл харилцагчид харагдахгүй.</div>
      <div className="space-y-2 p-3">
        {docs.map((d) => (
          <QueueItem key={d.id} d={d} reload={reload} />
        ))}
      </div>
    </div>
  );
}

function QueueItem({ d, reload }: { d: Doc; reload: () => Promise<void> | void }) {
  const [text, setText] = useState<string | null>(null);
  const [edit, setEdit] = useState(false);
  const [title, setTitle] = useState(d.title);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let live = true;
    void aj<{ chunks: string[] }>(`/api/agent/kb/${d.id}`)
      .then((r) => {
        // хэсэг бүр гарчгаа (асуултаа) эхэндээ давтдаг — хариултыг л харуулна
        const lines = r.chunks.join("\n").split("\n");
        if (live) setText((lines[0]?.replace(/^#+\s*/, "").trim() === d.title.trim() ? lines.slice(1) : lines).join("\n"));
      })
      .catch(() => live && setText(""));
    return () => {
      live = false;
    };
  }, [d.id, d.title]);
  async function act(action: "publish" | "reject") {
    setBusy(true);
    try {
      await aj(`/api/agent/kb/${d.id}`, { method: "PATCH", json: edit && action === "publish" ? { action, title, text: `# ${title}\n${text ?? ""}` } : { action } });
      toast(action === "publish" ? "Нийтэллээ" : "Татгалзлаа", action === "publish" ? "ok" : "ink");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Алдаа", "danger");
    }
    setBusy(false);
    void reload();
  }
  const src = d.provenance?.ids ?? [];
  return (
    <div className="rounded-[12px] bg-stage p-3">
      {edit ? (
        <input value={title} onChange={(e) => setTitle(e.target.value)} className="sp-field mb-2 h-10 w-full text-[14px] font-semibold" aria-label="Асуулт" />
      ) : (
        <div className="text-[14.5px] font-semibold">{d.title}</div>
      )}
      {edit ? (
        <textarea value={text ?? ""} onChange={(e) => setText(e.target.value)} rows={4} className="sp-field w-full resize-y py-2 text-[13.5px]" aria-label="Хариулт" />
      ) : (
        <p className="mt-1 whitespace-pre-wrap text-[13.5px] leading-snug">{text ?? "…"}</p>
      )}
      <div className="mt-1.5 text-[12px] text-mute">
        Эх сурвалж: {src.length ? src.map((x) => x.replace(/^ticket:/, "тасалбар №").replace(/^conv:/, "яриа ")).join(", ") : d.provenance?.source ?? "—"}
        {d.provenance?.window ? ` · ${d.provenance.window}` : ""}
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        <Btn size="sm" icon="check" loading={busy} onClick={() => void act("publish")}>
          {edit ? "Засаад нийтлэх" : "Нийтлэх"}
        </Btn>
        {!edit && (
          <Btn size="sm" variant="tinted" icon="edit" onClick={() => setEdit(true)}>
            Засах
          </Btn>
        )}
        <Btn size="sm" variant="gray" disabled={busy} onClick={() => void act("reject")}>
          Татгалзах
        </Btn>
      </div>
    </div>
  );
}
