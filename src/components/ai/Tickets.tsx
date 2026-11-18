"use client";

/** Хүсэлт, гомдол — AI яриа дундаас бүртгэсэн тасалбарууд. Гурван баганаар. */
import { useState } from "react";
import { Icon } from "@/components/sp/icons";
import { Badge, Btn, cx, Empty, toast } from "@/components/sp/ui";
import { Head } from "./AiApp";
import { aj, ago, useLive } from "./client";

type Ticket = {
  id: string;
  no: number;
  kind: "complaint" | "request" | "question" | "order";
  title: string;
  body: string | null;
  status: "open" | "in_progress" | "resolved";
  priority: "low" | "normal" | "high";
  resolution: string | null;
  assignee: string | null;
  conv_id: string | null;
  contact_name: string | null;
  contact_phone: string | null;
  created_at: number;
};
const KIND = { complaint: ["Гомдол", "danger"], request: ["Хүсэлт", "accent"], question: ["Асуулт", "gray"], order: ["Захиалга", "ok"] } as const;
const COLS = [
  { id: "open", label: "Шинэ" },
  { id: "in_progress", label: "Шийдвэрлэж байна" },
  { id: "resolved", label: "Шийдсэн" },
] as const;

export function Tickets() {
  const { data, reload } = useLive<{ tickets: Ticket[] }>("/api/agent/tickets", ["tickets"]);
  const [open, setOpen] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const list = data?.tickets ?? [];

  async function move(t: Ticket, status: Ticket["status"]) {
    try {
      await aj(`/api/agent/tickets/${t.id}`, { method: "PATCH", json: { status, resolution: note || undefined } });
      setNote("");
      setOpen(null);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Алдаа", "danger");
    }
    void reload();
  }

  return (
    <div>
      <Head title="Хүсэлт, гомдол" sub="AI харилцагчтай ярихдаа гомдол, хүсэлт, хариулж чадаагүй асуултыг автоматаар бүртгэнэ." />
      {!list.length && data && (
        <div className="px-4 md:px-8">
          <Empty icon="bell" title="Тасалбар алга" body="Харилцагч гомдол гаргах, хүсэлт тавихад AI энд бүртгэнэ." />
        </div>
      )}
      <div className="mx-auto grid max-w-[1320px] gap-4 px-4 pb-10 md:grid-cols-3 md:px-8">
        {COLS.map((col) => {
          const items = list.filter((t) => t.status === col.id);
          return (
            <div key={col.id} className="rounded-[18px] bg-[var(--sp-fill)] p-2">
              <div className="flex items-center justify-between px-2 py-2 text-[14px] font-semibold">
                {col.label}
                <span className="text-mute">{items.length}</span>
              </div>
              <div className="space-y-2">
                {items.map((t) => (
                  <div key={t.id} className="rounded-[14px] bg-paper p-3 shadow-[0_0_0_0.5px_var(--sp-sep)]">
                    <button type="button" className="w-full text-left" onClick={() => setOpen(open === t.id ? null : t.id)}>
                      <div className="flex items-center gap-2">
                        <Badge tone={KIND[t.kind][1]}>{KIND[t.kind][0]}</Badge>
                        {t.priority === "high" && t.status !== "resolved" && <span className="text-[12px] font-semibold text-danger">Яаралтай</span>}
                        <span className="ml-auto text-[12px] text-mute">№{t.no}</span>
                      </div>
                      <div className="mt-1.5 text-[14.5px] font-semibold leading-snug">{t.title}</div>
                      <div className="mt-1 text-[12.5px] text-mute">
                        {[t.contact_name, t.contact_phone].filter(Boolean).join(" · ") || "Харилцагч"} · {ago(t.created_at)}
                      </div>
                    </button>
                    {open === t.id && (
                      <div className="mt-3 space-y-2 border-t border-[var(--sp-sep)] pt-3">
                        {t.body && <p className="whitespace-pre-wrap text-[13.5px] leading-snug">{t.body}</p>}
                        {t.resolution && (
                          <p className="rounded-[10px] bg-ok-soft p-2 text-[13px] text-ok">
                            <Icon name="check" size={14} className="mr-1 inline" />
                            {t.resolution}
                          </p>
                        )}
                        {t.status !== "resolved" && <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Шийдвэр, тэмдэглэл (заавал биш)" className="sp-field h-10 w-full text-[14px]" />}
                        <div className="flex flex-wrap gap-2">
                          {t.status === "open" && (
                            <Btn size="sm" variant="tinted" onClick={() => void move(t, "in_progress")}>
                              Авч шийдэх
                            </Btn>
                          )}
                          {t.status !== "resolved" && (
                            <Btn size="sm" icon="check" onClick={() => void move(t, "resolved")}>
                              Шийдсэн
                            </Btn>
                          )}
                          {t.status === "resolved" && (
                            <Btn size="sm" variant="gray" onClick={() => void move(t, "open")}>
                              Дахин нээх
                            </Btn>
                          )}
                          {t.conv_id && (
                            <a href="#inbox" className={cx("sp-tap inline-flex h-[34px] items-center rounded-full px-3 text-[13px] font-semibold text-accent")}>
                              Яриа харах
                            </a>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
