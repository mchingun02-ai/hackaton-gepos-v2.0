"use client";

/* Маркетинг SMS — BR07: сегмент → текст → тооцоолсон зардал → илгээх → үр дүн (төлбөрийн алхам дараа) */

import { useMemo, useState } from "react";
import { Icon } from "@/components/sp/icons";
import { Btn, Empty, Field, Notice, toast, useConfirm } from "@/components/sp/ui";
import { money, num, OPT_OUT, segment, SMS_PRICE, smsParts } from "@/lib/sp/logic";
import { getSp, sendSmsCampaign } from "@/lib/sp/store";
import type { SmsCampaign } from "@/lib/sp/types";
import { Card, Dialog, KV, Page, SectionTitle, Table, dateTime, usePortal } from "./kit";

export default function Marketing() {
  const { s, actor } = usePortal();
  const [minSpend, setMinSpend] = useState("0");
  const [minOrders, setMinOrders] = useState("1");
  const [text, setText] = useState(`${s.delivery.page.name}: `);
  const [result, setResult] = useState<SmsCampaign | null>(null);

  const seg = useMemo(() => segment(s, Number(minSpend) || 0, Number(minOrders) || 0), [s, minSpend, minOrders]);
  const full = text.trim() + OPT_OUT;
  const sp = smsParts(full);
  const recipients = seg.recipients.length;
  const cost = recipients * sp.parts * SMS_PRICE;
  const ready = text.trim().length > 3 && recipients > 0;
  const { confirm, node } = useConfirm();

  const send = () => {
    const phones = seg.recipients.map((c) => c.phone);
    // Төлбөрийн алхам дараа нэмэгдэнэ — одоохондоо мерчантын нэрээр тооцоолсон зардал бичигдэнэ
    sendSmsCampaign(
      actor,
      { text: full, minSpend: Number(minSpend) || 0, minOrders: Number(minOrders) || 0, recipients, excluded: seg.excluded, parts: sp.parts, cost, payer: { kind: "org", orgReg: s.merchant.regNo, orgName: s.merchant.name } },
      phones,
    );
    toast("SMS илгээгдлээ", "ok");
    setResult(getSp().sms[0] ?? null);
  };
  const ask = () =>
    confirm({
      title: `${num(recipients)} дугаар руу илгээх үү?`,
      message: `${sp.parts} хэсэгтэй мессеж · тооцоолсон зардал ${money(cost)}. Илгээсний дараа буцаах боломжгүй.`,
      ok: "Илгээх",
      run: send,
    });

  return (
    <Page
      title="Маркетинг"
      sub="Зөвшөөрсөн харилцагчдад SMS илгээх"
      actions={
        <Btn size="md" icon="sms" disabled={!ready} onClick={ask}>
          Илгээх
        </Btn>
      }
    >
      <div className="grid gap-5 xl:grid-cols-[1fr_380px]">
        <div className="space-y-5">
          <Card title="1. Хэнд илгээх вэ">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Нийт худалдан авалт, доод тал ₮">
                <input className="sp-field tnum" inputMode="numeric" value={minSpend} onChange={(e) => setMinSpend(e.target.value.replace(/\D/g, ""))} />
              </Field>
              <Field label="Худалдан авсан тоо, доод тал">
                <input className="sp-field tnum" inputMode="numeric" value={minOrders} onChange={(e) => setMinOrders(e.target.value.replace(/\D/g, ""))} />
              </Field>
            </div>
            <div className="mt-4 flex flex-wrap items-baseline gap-x-6 gap-y-1">
              <span className="text-[15px] text-ink">
                <b className="text-[22px] tnum">{num(recipients)}</b> дугаар руу явна
              </span>
              <span className="text-[13px] text-mute">{seg.excluded} дугаар татгалзсан тул хасагдсан</span>
            </div>
          </Card>

          <Card title="2. Мессеж">
            <textarea className="sp-field" rows={4} maxLength={600} value={text} onChange={(e) => setText(e.target.value)} aria-label="SMS текст" placeholder="Жишээ: Энэ 7 хоногт Кока-Кола 3+1!" />
            <div className="mt-2 flex flex-wrap justify-between gap-2 text-[13px] text-mute">
              <span>
                Төгсгөлд автоматаар: <span className="text-ink-2">«{OPT_OUT.trim()}»</span>
              </span>
              <span className="tnum">
                {sp.len} тэмдэгт · {sp.parts} хэсэг · {sp.unicode ? "кирилл (70/67)" : "латин (160/153)"}
              </span>
            </div>
            {sp.parts > 1 && (
              <div className="mt-3">
                <Notice tone="warn">Урт мессеж {sp.parts} SMS болж тооцогдоно. Богиносгоод зардлаа бууруулж болно.</Notice>
              </div>
            )}
          </Card>
        </div>

        <div className="space-y-5">
          <Card title="Урьдчилан харах">
            <div className="rounded-[18px] bg-stage p-4">
              <div className="max-w-[280px] whitespace-pre-wrap break-words rounded-[18px] rounded-bl-[6px] bg-[var(--sp-fill-2)] px-3.5 py-2.5 text-[14px] leading-snug text-ink">{full}</div>
            </div>
          </Card>
          <Card title="Тооцоолсон зардал">
            <KV
              rows={[
                ["Хүлээн авагч", num(recipients)],
                ["Хэсэг / мессеж", sp.parts],
                ["Нэг хэсгийн үнэ", money(SMS_PRICE)],
                ["Нийт", <b key="t" className="text-[17px] tnum">{money(cost)}</b>],
              ]}
            />
            <p className="mt-3 text-[13px] leading-snug text-mute">Урьдчилсан тооцоо. «Тайлан → Маркетинг SMS зардал»-д бичигдэнэ.</p>
          </Card>
        </div>
      </div>

      <SectionTitle>Өмнөх илгээлтүүд</SectionTitle>
      <Table<SmsCampaign>
        rows={s.sms}
        rowKey={(r) => r.id}
        maxH="520px"
        empty={<Empty icon="megaphone" title="Илгээлт алга" body="Дээрх шалгуураар анхны SMS-ээ илгээнэ үү." />}
        cols={[
          { key: "at", label: "Огноо", w: "150px", render: (r) => <span className="tnum">{dateTime(r.at)}</span> },
          { key: "text", label: "Текст", render: (r) => <span className="line-clamp-1 max-w-[420px] text-ink-2">{r.text}</span> },
          { key: "sent", label: "Илгээсэн", align: "right", render: (r) => num(r.sent) },
          { key: "del", label: "Хүрсэн", align: "right", render: (r) => <span className="text-ok">{num(r.delivered)}</span> },
          { key: "fail", label: "Амжилтгүй", align: "right", render: (r) => (r.failed ? <span className="text-danger">{num(r.failed)}</span> : "0") },
          { key: "cost", label: "Зардал", align: "right", render: (r) => money(r.cost) },
        ]}
      />

      <Dialog
        open={!!result}
        onClose={() => setResult(null)}
        title="Илгээлтийн үр дүн"
        width={420}
        footer={
          <Btn size="md" onClick={() => setResult(null)}>
            Болсон
          </Btn>
        }
      >
        {result && (
          <>
            <div className="mb-4 flex flex-col items-center text-center">
              <span className="grid size-14 place-items-center rounded-full bg-ok-soft text-ok">
                <Icon name="check" size={28} stroke={2.4} />
              </span>
              <div className="mt-3 text-[17px] font-semibold text-ink">{num(result.sent)} SMS илгээгдлээ</div>
            </div>
            <KV
              rows={[
                ["Илгээсэн", num(result.sent)],
                ["Хүрсэн", <span key="d" className="text-ok">{num(result.delivered)}</span>],
                ["Амжилтгүй", <span key="f" className={result.failed ? "text-danger" : ""}>{num(result.failed)}</span>],
                ["Зардал", money(result.cost)],
              ]}
            />
            <p className="mt-3 text-[13px] text-mute">«Тайлан → Маркетинг SMS» хэсэгт бичигдлээ.</p>
          </>
        )}
      </Dialog>
      {node}
    </Page>
  );
}
