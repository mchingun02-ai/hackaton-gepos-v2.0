"use client";

/* Маркетинг SMS — сегмент, текст, тооцоолсон зардал, илгээх, үр дүн (BR07, 6.2.6, US13).
   Төлбөрийн алхмыг түр хассан — зардал зөвхөн мэдээллийн чанартай. */

import { useState } from "react";
import { dateShort, money, num, OPT_OUT, segment, SMS_PRICE, smsParts } from "@/lib/sp/logic";
import { getSp, sendSmsCampaign, useSp } from "@/lib/sp/store";
import type { SmsCampaign } from "@/lib/sp/types";
import { Btn, Group, NavBar, Notice, Row, Sheet, useConfirm } from "@/components/sp/ui";
import { Icon } from "@/components/sp/icons";
import { Screen, useM } from "./core";

const SPEND = [0, 20000, 50000, 100000, 200000, 500000];
const COUNT = [0, 1, 2, 3, 5, 10];

export function Marketing() {
  const s = useSp();
  const m = useM();
  const d = m.draft;
  const [pick, setPick] = useState<null | "spend" | "count">(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<SmsCampaign | null>(null);
  const { confirm, node } = useConfirm();
  const seg = segment(s, d.minSpend, d.minOrders);
  const full = d.text.trim() + OPT_OUT;
  const sp = smsParts(full);
  const n = seg.recipients.length;
  const cost = n * sp.parts * SMS_PRICE;
  const canSend = n > 0 && d.text.trim().length > 0;
  const send = () =>
    confirm({
      title: `${num(n)} дугаар руу илгээх үү?`,
      message: `${sp.parts} хэсэгтэй SMS · тооцоолсон зардал ${money(cost)}. Илгээсний дараа буцаах боломжгүй.`,
      ok: "Илгээх",
      run: () => {
        setBusy(true);
        setTimeout(() => {
          sendSmsCampaign(
            m.actor,
            { text: full, minSpend: d.minSpend, minOrders: d.minOrders, recipients: n, excluded: seg.excluded, parts: sp.parts, cost, payer: { kind: "org" } },
            seg.recipients.map((c) => c.phone),
          );
          setResult(getSp().sms[0] ?? null);
          m.setDraft({ ...d, text: "" });
          setBusy(false);
        }, 900);
      },
    });
  const nextBreak = sp.parts <= 1 ? sp.perPart : sp.parts * (sp.unicode ? 67 : 153);

  return (
    <Screen
      nav={<NavBar onBack={m.pop} backLabel="Буцах" title="Маркетинг SMS" />}
      footer={
        <Btn block icon="sms" disabled={!canSend} loading={busy} onClick={send}>
          Илгээх{n ? ` · ${num(n)} дугаар` : ""}
        </Btn>
      }
    >
      <Group header="Хэнд илгээх" className="pt-1">
        <Row title="Нийт худалдан авалт" value={<span className="text-accent">{d.minSpend ? `≥ ${money(d.minSpend)}` : "Бүгд"}</span>} chevron onClick={() => setPick("spend")} />
        <Row title="Худалдан авалтын тоо" value={<span className="text-accent">{d.minOrders ? `≥ ${d.minOrders} удаа` : "Бүгд"}</span>} chevron onClick={() => setPick("count")} />
      </Group>
      <p className="px-8 pt-2 text-[14px] text-mute">
        <b className="font-semibold text-ink tnum">{num(n)} харилцагч</b>
        {seg.excluded ? ` · татгалзсан ${seg.excluded} дугаар хасагдсан` : ""}
      </p>
      {n === 0 && (
        <div className="px-4 pt-2">
          <Notice tone="warn">{seg.excluded ? "Энэ сегментийн бүх дугаар SMS-ээс татгалзсан. Шалгуураа сулруулна уу." : "Шалгуурт тохирох харилцагч алга. Шалгуураа сулруулна уу."}</Notice>
        </div>
      )}

      <Group header="Мессеж">
        <div className="px-4 pb-3 pt-3">
          <textarea
            className="block min-h-[96px] w-full resize-none bg-transparent text-[16px] leading-snug text-ink outline-none placeholder:text-mute"
            placeholder={`${s.delivery.page.name}: Бямба, Ням гарагт бүх ундаа 10% хямд!`}
            value={d.text}
            maxLength={600}
            onChange={(e) => m.setDraft({ ...d, text: e.target.value })}
            name="smstext"
          />
          <p className="mt-2 text-[13px] leading-snug text-mute">Төгсгөлд нь автоматаар нэмэгдэнэ: «{OPT_OUT.trim()}»</p>
          <div className="mt-2 flex justify-between text-[13px] text-mute tnum">
            <span>
              {sp.len} / {nextBreak} тэмдэгт
            </span>
            <span className={sp.parts > 1 ? "font-semibold text-warn" : ""}>
              {sp.parts} хэсэг · {sp.unicode ? "кирилл" : "латин"}
            </span>
          </div>
        </div>
      </Group>

      <div className="mx-4 mt-3 flex items-center justify-between px-4 text-[14px] text-mute">
        <span>
          Тооцоолсон зардал <span className="tnum">({num(n)} × {sp.parts} хэсэг × {SMS_PRICE}₮)</span>
        </span>
        <span className="font-semibold text-ink tnum">{money(cost)}</span>
      </div>

      <Group header="Өмнөх илгээлтүүд">
        {s.sms.length === 0 ? (
          <Row icon="sms" title="Илгээлт алга" sub="Эхний SMS-ээ дээрээс бэлдэнэ үү" />
        ) : (
          s.sms.slice(0, 8).map((c) => (
            <Row
              key={c.id}
              title={<span className="line-clamp-1">{c.text}</span>}
              sub={`${dateShort(c.at)} · ${num(c.sent)} илгээсэн · ${num(c.delivered)} хүрсэн · ${num(c.failed)} амжилтгүй`}
              value={money(c.cost)}
            />
          ))
        )}
      </Group>

      <Sheet open={!!pick} onClose={() => setPick(null)} title={pick === "spend" ? "Нийт худалдан авалт" : "Худалдан авалтын тоо"}>
        <Group className="pb-5 pt-2">
          {(pick === "spend" ? SPEND : COUNT).map((v) => {
            const cur = pick === "spend" ? d.minSpend === v : d.minOrders === v;
            const n2 = segment(s, pick === "spend" ? v : d.minSpend, pick === "count" ? v : d.minOrders).recipients.length;
            return (
              <Row
                key={v}
                title={v === 0 ? "Бүгд" : pick === "spend" ? `≥ ${money(v)}` : `≥ ${v} удаа`}
                value={`${n2} хүн`}
                trailing={cur ? <Icon name="check" size={20} stroke={2.4} className="text-accent" /> : <span className="w-5" />}
                onClick={() => {
                  m.setDraft(pick === "spend" ? { ...d, minSpend: v } : { ...d, minOrders: v });
                  setPick(null);
                }}
              />
            );
          })}
        </Group>
      </Sheet>

      <Sheet
        open={!!result}
        onClose={() => setResult(null)}
        title="Үр дүн"
        footer={
          <Btn block onClick={() => setResult(null)}>
            Болсон
          </Btn>
        }
      >
        {result && (
          <div className="pb-2">
            <div className="flex flex-col items-center px-6 pt-3 text-center">
              <span className="grid size-16 place-items-center rounded-full bg-ok text-white">
                <Icon name="check" size={32} stroke={2.6} />
              </span>
              <h2 className="mt-3 text-[20px] font-bold text-ink">SMS илгээгдлээ</h2>
              <p className="mt-1 text-[14px] text-mute">Тооцоолсон зардал {money(result.cost)} · тайланд бичигдлээ</p>
            </div>
            <Group className="mt-4">
              <Row icon="sms" title="Илгээсэн" value={num(result.sent)} />
              <Row icon="check" iconTone="ok" title="Хүрсэн" value={num(result.delivered)} />
              <Row icon="warn" iconTone="danger" title="Амжилтгүй" value={num(result.failed)} />
            </Group>
          </div>
        )}
      </Sheet>
      {node}
    </Screen>
  );
}
