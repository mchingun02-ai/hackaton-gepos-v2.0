"use client";

/*
 * Багц, төлбөр — урьдчилсан төлбөр: эхлээд QPay-ээр багц авна, дараа нь AI ажиллана.
 * Нэхэмжлэх QPay API-аар үүсч, төлөгдсөнийг QPay-ээс шалгаж баталгаажуулсны дараа л кредит нэмэгдэнэ.
 */
import { useEffect, useState } from "react";
import { Icon } from "@/components/sp/icons";
import { Badge, Btn, cx, toast } from "@/components/sp/ui";
import { Head } from "./AiApp";
import { aj, mnt, useLive } from "./client";
import { Usage } from "./Usage";

type Plan = { id: string; name: string; price: number; credits: number; days: number; note: string; popular?: boolean };
type Invoice = { id: string; payment_id?: string | null; plan: string; amount: number; credits: number; qr_image: string | null; short_url: string | null; urls: string | null; status: "pending" | "paid" | "cancelled"; created_at: number; paid_at: number | null };
type BillingData = {
  wallet: { credits: number; plan: string | null; expires_at: number | null };
  plans: Plan[];
  cost: { chat: number; command: number; voiceMinute: number };
  invoices: Invoice[];
  usage: { byKind: { kind: string; credits: number; n: number; tin: number; tout: number }[] };
  sandbox: boolean;
  sandboxConfirm: boolean;
};

const KIND: Record<string, string> = { chat: "Чат хариулт", voice: "Дуудлага", command: "Захирлын тушаал", topup: "Цэнэглэлт" };

/**
 * Зах зээлийн харьцуулалт — нийтэд зарласан үнэ, 2026-11-17-нд шалгасан.
 * 1 USD ≈ 3,603₮ (Монголбанкны 2026-11-13-ны албан ханш).
 */
const COMPARE: { name: string; monthly: string; perConv: string; mn: string; voice: string; src: string; ours?: boolean }[] = [
  { name: "Gerege AI ажилтан (Бизнес)", monthly: "129,000₮", perConv: "≈170₮ (4 хариулт)", mn: "Тийм", voice: "Тийм · ≈215₮/мин", src: "Энэ үйлчилгээ", ours: true },
  { name: "Intercom Fin", monthly: "≈178,000₮-аас ($49.50)", perConv: "≈3,567₮ ($0.99/шийдэл)", mn: "Зарлаагүй", voice: "Тусгай үнээр", src: "fin.ai/pricing" },
  { name: "Tidio Starter + Lyro AI", monthly: "≈204,000₮ ($56.67)", perConv: "≈2,342₮ ($0.65)", mn: "Баталгаажаагүй", voice: "Үгүй", src: "tidio.com/pricing" },
  { name: "Zendesk Suite Team", monthly: "≈198–249,000₮/ажилтан", perConv: "≈5,400–7,200₮", mn: "Кирилл", voice: "Тусдаа бүтээгдэхүүн", src: "eesel.ai (гуравдагч эх)" },
  { name: "MongolGPT + TelcoCom AI оператор", monthly: "—", perConv: "—", mn: "Тийм", voice: "≈350₮/мин", src: "ikon.mn/n/3rgt" },
  { name: "Хүн оператор (УБ)", monthly: "≈1.5–3.6 сая₮", perConv: "—", mn: "Тийм", voice: "≈583₮/мин", src: "paylab.com, ikon.mn" },
];

export function Billing() {
  const { data, reload } = useLive<BillingData>("/api/agent/billing", ["wallet"]);
  const [inv, setInv] = useState<Invoice | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  async function buy(p: Plan) {
    setBusy(p.id);
    try {
      setInv(await aj<Invoice>("/api/agent/billing", { method: "POST", json: { plan: p.id } }));
    } catch (e) {
      toast(e instanceof Error ? e.message : "Алдаа", "danger");
    }
    setBusy(null);
  }

  if (!data) return <Head title="Багц, төлбөр" sub="Ачаалж байна…" />;
  const w = data.wallet;
  const exp = w.expires_at ? new Date(w.expires_at).toLocaleDateString("mn-MN") : null;
  return (
    <div>
      <Head title="Багц, төлбөр" sub="Урьдчилсан төлбөртэй: эхлээд QPay-ээр төлнө, дараа нь ашиглана. Кредит дуусвал AI зогсож, яриаг ажилтанд шилжүүлнэ." />
      <div className="mx-auto max-w-[1320px] space-y-6 px-4 pb-12 md:px-8">
        <Usage />
        <div className="grid gap-4 md:grid-cols-[320px_minmax(0,1fr)]">
          <div className="rounded-[20px] bg-ink p-5 text-paper">
            <div className="text-[13px] opacity-70">Үлдэгдэл кредит</div>
            <div className="mt-1 text-[44px] font-bold leading-none tracking-[-0.03em] tnum">{w.credits.toLocaleString("en-US")}</div>
            <div className="mt-3 text-[13.5px] opacity-80">{w.plan ? `${data.plans.find((p) => p.id === w.plan)?.name ?? w.plan} багц · ${exp} хүртэл` : "Багц аваагүй"}</div>
            <div className="mt-4 space-y-1 border-t border-white/15 pt-3 text-[13px] opacity-80">
              <div>Чат хариулт = {data.cost.chat} кредит</div>
              <div>Захирлын тушаал = {data.cost.command} кредит</div>
              <div>Дуудлагын 1 минут = {data.cost.voiceMinute} кредит</div>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {data.plans.map((p) => (
              <div key={p.id} className={cx("flex flex-col rounded-[20px] bg-paper p-4 shadow-[0_0_0_0.5px_var(--sp-sep)]", p.popular && "shadow-[0_0_0_2px_var(--accent)]")}>
                <div className="flex items-center gap-2">
                  <div className="text-[16px] font-bold">{p.name}</div>
                  {p.popular && <Badge tone="accent">Санал болгох</Badge>}
                </div>
                <div className="mt-2 text-[28px] font-bold tracking-[-0.02em] tnum">{mnt(p.price)}</div>
                <div className="text-[13px] text-mute">
                  {p.credits.toLocaleString("en-US")} кредит{p.days ? ` · ${p.days} хоног` : ""} · {Math.round(p.price / p.credits)}₮/кредит
                </div>
                <p className="mt-2 flex-1 text-[13px] leading-snug">{p.note}</p>
                <Btn size="md" className="mt-3" variant={p.popular ? "filled" : "tinted"} loading={busy === p.id} onClick={() => void buy(p)} icon="qr">
                  QPay-ээр авах
                </Btn>
              </div>
            ))}
          </div>
        </div>

        <section className="rounded-[20px] bg-paper p-5 shadow-[0_0_0_0.5px_var(--sp-sep)]">
          <div className="text-[17px] font-bold">Зах зээлийн үнэтэй харьцуулалт</div>
          <p className="mt-0.5 text-[13px] text-mute">Нийтэд зарласан үнэ, 2026-11-17-нд шалгасан · 1 USD ≈ 3,603₮ (Монголбанк, 11-13). Нэг харилцагчийн яриа ≈ 4 AI хариулт гэж тооцов.</p>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[760px] text-[13.5px]">
              <thead>
                <tr className="text-left text-[12px] text-mute">
                  <th className="py-2 pr-3">Үйлчилгээ</th>
                  <th className="py-2 pr-3">Сарын үнэ</th>
                  <th className="py-2 pr-3">Нэг ярианы үнэ</th>
                  <th className="py-2 pr-3">Монгол хэл</th>
                  <th className="py-2 pr-3">Дуудлага</th>
                  <th className="py-2">Эх сурвалж</th>
                </tr>
              </thead>
              <tbody>
                {COMPARE.map((r) => (
                  <tr key={r.name} className={cx("border-t border-[var(--sp-sep)]", r.ours && "bg-accent-soft font-semibold")}>
                    <td className="py-2.5 pr-3">{r.name}</td>
                    <td className="py-2.5 pr-3 tnum">{r.monthly}</td>
                    <td className="py-2.5 pr-3 tnum">{r.perConv}</td>
                    <td className="py-2.5 pr-3">{r.mn}</td>
                    <td className="py-2.5 pr-3">{r.voice}</td>
                    <td className="py-2.5 text-mute">{r.src}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-[12.5px] text-mute">
            Манай өртөг: Qwen-plus (Model Studio, $0.40/$1.20 нэг сая токенд) дээр нэг хариулт ≈ 3 алхам ≈ 15–20₮; text-embedding-v4 $0.07. Zendesk, ManyChat-ийн үнийг гуравдагч эх сурвалжаас авсан тул баталгаажаагүй.
          </p>
        </section>

        <div className="grid gap-4 lg:grid-cols-2">
          <section className="rounded-[20px] bg-paper p-5 shadow-[0_0_0_0.5px_var(--sp-sep)]">
            <div className="text-[15px] font-bold">Сүүлийн 30 хоногийн хэрэглээ</div>
            {!data.usage.byKind.length && <div className="mt-2 text-[13.5px] text-mute">Хэрэглээ алга</div>}
            {data.usage.byKind
              .filter((u) => KIND[u.kind] && u.credits)
              .map((u) => (
                <div key={u.kind} className="flex justify-between border-t border-[var(--sp-sep)] py-2 text-[14px] first:border-0">
                  <span>{KIND[u.kind]}</span>
                  <span className="tnum">
                    {u.n} удаа · {Math.abs(u.credits).toLocaleString("en-US")} кредит {u.credits < 0 ? "нэмэгдсэн" : "зарцуулсан"}
                  </span>
                </div>
              ))}
            {data.usage.byKind.some((u) => u.tin) && (
              <div className="mt-2 text-[12.5px] text-mute">
                Qwen токен: {data.usage.byKind.reduce((a, u) => a + u.tin, 0).toLocaleString("en-US")} оролт · {data.usage.byKind.reduce((a, u) => a + u.tout, 0).toLocaleString("en-US")} гаралт
              </div>
            )}
          </section>
          <section className="rounded-[20px] bg-paper p-5 shadow-[0_0_0_0.5px_var(--sp-sep)]">
            <div className="text-[15px] font-bold">Нэхэмжлэх</div>
            {!data.invoices.length && <div className="mt-2 text-[13.5px] text-mute">Нэхэмжлэх алга</div>}
            {data.invoices.map((i) => (
              <div key={i.id} className="flex items-center gap-2 border-t border-[var(--sp-sep)] py-2 text-[14px] first:border-0">
                <span className="flex-1">
                  {data.plans.find((p) => p.id === i.plan)?.name} · {mnt(i.amount)}
                </span>
                <span className="text-[12.5px] text-mute">{new Date(i.created_at).toLocaleString("mn-MN", { dateStyle: "short", timeStyle: "short" })}</span>
                {i.status === "paid" ? (
                  <Badge tone={i.payment_id === "sandbox-manual" ? "warn" : "ok"}>{i.payment_id === "sandbox-manual" ? "Sandbox" : "Төлөгдсөн"}</Badge>
                ) : (
                  <button type="button" className="text-[13px] font-semibold text-accent" onClick={() => void aj<Invoice>(`/api/agent/billing/${i.id}`).then((x) => setInv(x))}>
                    Төлөх / шалгах
                  </button>
                )}
              </div>
            ))}
          </section>
        </div>
      </div>
      {inv && (
        <PayDialog
          inv={inv}
          plan={data.plans.find((p) => p.id === inv.plan)}
          sandbox={data.sandbox}
          manual={data.sandboxConfirm}
          close={() => {
            setInv(null);
            void reload();
          }}
        />
      )}
    </div>
  );
}

function PayDialog({ inv: first, plan, sandbox, manual, close }: { inv: Invoice; plan?: Plan; sandbox: boolean; manual: boolean; close: () => void }) {
  const [inv, setInv] = useState(first);
  const [checking, setChecking] = useState(false);
  const urls = (() => {
    try {
      return JSON.parse(first.urls ?? "[]") as { name: string; logo: string; link: string }[];
    } catch {
      return [];
    }
  })();
  const qr = first.qr_image;

  const sandboxOk = manual;
  async function check(isManual = false) {
    setChecking(true);
    try {
      const r = await aj<Invoice>(`/api/agent/billing/${first.id}`);
      setInv(r);
      if (r.status === "paid") toast(`Төлбөр баталгаажлаа · ${r.credits.toLocaleString("en-US")} кредит нэмэгдэв`, "ok");
      else if (isManual && sandboxOk) {
        // QPay sandbox-д төлөх хэтэвч байхгүй — туршилтаар төлсөнд тооцох эсэхийг асууна
        if (confirm("QPay sandbox-д төлбөр ороогүй байна (sandbox-д бодит хэтэвч байхгүй).\n\nТуршилтаар төлсөнд тооцож кредит нэмэх үү?")) {
          setChecking(false);
          return void confirmSandbox();
        }
      } else if (isManual) toast("Төлбөр хараахан ороогүй байна", "ink");
    } catch (e) {
      if (isManual) toast(e instanceof Error ? e.message : "Алдаа", "danger");
    }
    setChecking(false);
  }
  async function confirmSandbox() {
    setChecking(true);
    try {
      const r = await aj<Invoice>(`/api/agent/billing/${first.id}`, { method: "POST" });
      setInv(r);
      toast(`Sandbox төлбөр баталгаажлаа · ${r.credits.toLocaleString("en-US")} кредит`, "ok");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Алдаа", "danger");
    }
    setChecking(false);
  }
  useEffect(() => {
    if (inv.status === "paid") return;
    const t = setInterval(() => void check(), 4000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inv.status]);

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onClick={close}>
      <div className="w-full max-w-[420px] rounded-[24px] bg-paper p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <div className="text-[18px] font-bold">QPay-ээр төлөх</div>
          <button type="button" aria-label="Хаах" onClick={close} className="sp-tap grid size-9 place-items-center rounded-full bg-[var(--sp-fill)]">
            <Icon name="close" size={18} />
          </button>
        </div>
        <div className="mt-1 text-[14px] text-mute">
          {plan?.name} багц · {inv.credits.toLocaleString("en-US")} кредит
        </div>
        <div className="mt-1 text-[30px] font-bold tnum">{mnt(inv.amount)}</div>
        {inv.status === "paid" ? (
          <div className="mt-4 grid place-items-center rounded-[18px] bg-ok-soft p-6 text-center text-ok">
            <Icon name="check" size={40} />
            <div className="mt-2 text-[16px] font-semibold">Төлбөр баталгаажлаа</div>
            <div className="text-[13.5px]">AI ажилтан ажиллахад бэлэн</div>
            <Btn size="md" className="mt-3" onClick={close}>
              Болсон
            </Btn>
          </div>
        ) : (
          <>
            {qr && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={`data:image/png;base64,${qr}`} alt="QPay QR код" className="mx-auto mt-3 size-56 rounded-[12px] bg-white p-2" />
            )}
            <p className="mt-2 text-center text-[13px] text-mute">Банкны аппаараа QR уншуулна уу. Төлбөр орсныг QPay-ээс автоматаар шалгана.</p>
            {sandbox && <p className="mt-2 rounded-[10px] bg-warn-soft p-2 text-center text-[12.5px] text-warn">QPay sandbox орчин — бодит мөнгө шилжихгүй. «Төлбөр шалгах» дарвал туршилтаар баталгаажуулна.</p>}
            {urls.length > 0 && (
              <div className="mt-3 grid grid-cols-4 gap-2 md:hidden">
                {urls.slice(0, 8).map((u) => (
                  <a key={u.name} href={u.link} className="flex flex-col items-center gap-1 text-center text-[10.5px]">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={u.logo} alt="" className="size-10 rounded-[10px]" />
                    <span className="line-clamp-1">{u.name}</span>
                  </a>
                ))}
              </div>
            )}
            <div className="mt-4 flex gap-2">
              {inv.short_url && (
                <a href={inv.short_url} target="_blank" rel="noreferrer" className="sp-tap inline-flex h-11 flex-1 items-center justify-center rounded-[12px] bg-[var(--sp-fill)] text-[15px] font-semibold">
                  QPay холбоос
                </a>
              )}
              <Btn size="md" className="flex-1" loading={checking} onClick={() => void check(true)}>
                Төлбөр шалгах
              </Btn>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
