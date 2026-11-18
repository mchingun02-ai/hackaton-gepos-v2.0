"use client";

/** Харилцагчид — AI ярианаас автоматаар цуглуулсан CRM карт. */
import { useState } from "react";
import { Icon } from "@/components/sp/icons";
import { Badge, Empty, SearchField } from "@/components/sp/ui";
import { Head } from "./AiApp";
import { ago, CHANNEL, useLive } from "./client";

type Contact = {
  id: string;
  name: string | null;
  phone: string | null;
  address: string | null;
  summary: string | null;
  interests: string[];
  tags: string[];
  sentiment: string | null;
  channels: Record<string, string>;
  last_at: number;
  conversations: number;
  openTickets: number;
};

export function Contacts() {
  const [q, setQ] = useState("");
  const { data } = useLive<{ contacts: Contact[] }>(`/api/agent/contacts?q=${encodeURIComponent(q)}`, ["contacts"]);
  const list = data?.contacts ?? [];
  const neg = list.filter((c) => c.sentiment === "negative").length;
  return (
    <div>
      <Head title="Харилцагчид" sub="Хүн бүрийн нэр, утас, сонирхол, сэтгэл ханамжийг AI ярианаас өөрөө бөглөнө. Утас давхцвал нэг карт болгоно." />
      <div className="mx-auto max-w-[1320px] space-y-4 px-4 pb-10 md:px-8">
        <div className="flex flex-wrap items-center gap-3">
          <div className="w-full max-w-sm">
            <SearchField value={q} onChange={setQ} placeholder="Нэр, утас, тэмдэглэлээр хайх" />
          </div>
          <span className="text-[13.5px] text-mute">
            {list.length} харилцагч{neg ? ` · ${neg} сэтгэл дундуур` : ""}
          </span>
        </div>
        {!list.length && data && <Empty icon="people" title="Карт алга" body="Харилцагч AI-тай ярихад энд автоматаар үүснэ." />}
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {list.map((c) => (
            <div key={c.id} className="rounded-[18px] bg-paper p-4 shadow-[0_0_0_0.5px_var(--sp-sep)]">
              <div className="flex items-start gap-3">
                <div className="grid size-11 shrink-0 place-items-center rounded-full bg-accent-soft text-[15px] font-bold text-accent">{(c.name || "?").slice(0, 1).toUpperCase()}</div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[15.5px] font-semibold">{c.name || "Нэр тодорхойгүй"}</div>
                  <div className="text-[13px] text-mute">{c.phone ?? "Утас өгөөгүй"}</div>
                </div>
                <div className="flex gap-1">
                  {Object.keys(c.channels).map((ch) => (
                    <span key={ch} title={CHANNEL[ch]?.label} className="grid size-7 place-items-center rounded-full bg-[var(--sp-fill)]">
                      <Icon name={CHANNEL[ch]?.icon ?? "chat"} size={14} />
                    </span>
                  ))}
                </div>
              </div>
              {c.summary && <p className="mt-3 text-[13.5px] leading-snug">{c.summary}</p>}
              {c.address && (
                <p className="mt-1 text-[13px] text-mute">
                  <Icon name="pin" size={13} className="mr-1 inline" />
                  {c.address}
                </p>
              )}
              <div className="mt-3 flex flex-wrap gap-1">
                {c.sentiment === "negative" && <Badge tone="danger">Сэтгэл дундуур</Badge>}
                {c.sentiment === "positive" && <Badge tone="ok">Сэтгэл хангалуун</Badge>}
                {c.openTickets > 0 && <Badge tone="warn">{c.openTickets} нээлттэй тасалбар</Badge>}
                {c.tags.map((t) => (
                  <Badge key={t} tone="accent">
                    {t}
                  </Badge>
                ))}
                {c.interests.slice(0, 5).map((t) => (
                  <Badge key={t}>{t}</Badge>
                ))}
              </div>
              <div className="mt-3 text-[12px] text-mute">
                {c.conversations} яриа · сүүлд {ago(c.last_at)}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
