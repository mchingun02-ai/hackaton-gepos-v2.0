"use client";

/*
 * admin.geregepos.mn › Хэрэглэгч бүртгэх › Татвар
 * Gerege-ийн ажилтан хэрэглэгч бүртгэх үед:
 *  1) РД-ээр и-Баримтаас НӨАТ, НХАТ төлөгч эсэхийг татна (getTinInfo → getInfo, бодит).
 *  2) Салбарын үйл ажиллагаа, үйлдвэрлэгч эсэхийг сонгоно.
 * Хадгалахад нэг төлөв (SpState) шинэчлэгдэж Пос, утасны апп, портал шууд хэрэглэнэ.
 */

import { useState } from "react";
import { SpGate, setTaxProfile, useSp } from "@/lib/sp/store";
import { ACTIVITY_LABEL, PRODUCER_LABEL, modeOf, splitTax, taxText } from "@/lib/sp/tax";
import type { TaxProfile } from "@/lib/sp/types";
import { Spinner, Toaster, cx, toast } from "@/components/sp/ui";
import { money } from "@/lib/sp/logic";

const IND = "#3949d4";

type Lookup =
  | { found: true; tin: string; name: string; vatPayer: boolean; cityPayer: boolean; freeProject: boolean; vatSince: string | null; checkedAt: string }
  | { found: false; msg?: string };

export default function TaxSetup() {
  return (
    <SpGate>
      <Inner />
      <Toaster bottom={24} />
    </SpGate>
  );
}

const EXAMPLES: { name: string; bunaCode: string; price: number }[] = [
  { name: "Талх", bunaCode: "2349011", price: 2500 },
  { name: "Сүү 1 л", bunaCode: "6252211", price: 3900 },
  { name: "Пиво 0.5 л", bunaCode: "2431000", price: 5600 },
  { name: "Бууз (ресторан)", bunaCode: "6331041", price: 10000 },
];

function Inner() {
  const s = useSp();
  const cur = s.merchant.tax;
  const [reg, setReg] = useState(s.merchant.regNo);
  const [busy, setBusy] = useState(false);
  const [lk, setLk] = useState<Lookup | null>(cur?.checkedAt ? { found: true, tin: cur.tin ?? "", name: cur.ebarimtName ?? "", vatPayer: cur.vatPayer, cityPayer: cur.cityTaxPayer, freeProject: cur.freeProject, vatSince: null, checkedAt: cur.checkedAt } : null);
  const [activity, setActivity] = useState<TaxProfile["activity"]>(cur?.activity ?? "retail");
  const [producer, setProducer] = useState<TaxProfile["producer"]>(cur?.producer ?? []);

  const check = async () => {
    setBusy(true);
    try {
      const r = await fetch(`/api/catalog/taxpayer?reg=${encodeURIComponent(reg.trim())}`);
      const j = await r.json();
      if (r.status !== 200) throw new Error(j.message || j.error);
      setLk(j);
      if (!j.found) toast("и-Баримтад олдсонгүй", "danger");
    } catch (e) {
      toast(`и-Баримттай холбогдож чадсангүй ${e instanceof Error ? e.message : ""}`, "danger");
    } finally {
      setBusy(false);
    }
  };

  const draft: TaxProfile | null =
    lk && lk.found
      ? { tin: lk.tin, vatPayer: lk.vatPayer, cityTaxPayer: lk.cityPayer, freeProject: lk.freeProject, activity, producer, checkedAt: lk.checkedAt, ebarimtName: lk.name }
      : null;
  const mode = draft ? modeOf(draft) : null;

  const save = () => {
    if (!draft) return;
    setTaxProfile({ id: "gerege-staff", name: "Gerege ажилтан" }, draft);
    toast("Хадгаллаа. Пос, утасны апп, портал шууд шинэ тохиргоог хэрэглэнэ.", "ok");
  };

  const chip = (on: boolean) =>
    cx("h-9 rounded-full px-3.5 text-[13.5px] transition", on ? "text-white" : "bg-[#eef0f6] text-[#384056] hover:bg-[#e4e7f1]");

  return (
    <div className="min-h-dvh bg-[#f5f6fa] font-sans text-[#1b2033]" style={{ fontFamily: "Onest, Geist, system-ui, sans-serif" }}>
      <header className="flex h-14 items-center gap-3 border-b border-[#e3e6ef] bg-white px-6">
        <span className="grid size-8 place-items-center rounded-[9px] text-[15px] font-bold text-white" style={{ background: IND }}>G</span>
        <span className="font-semibold">Gerege Nexus</span>
        <span className="text-[13px] text-[#7a8199]">admin.geregepos.mn</span>
        <span className="ml-auto text-[13px] text-[#7a8199]">Ажилтан · Бүртгэлийн мэргэжилтэн</span>
      </header>
      <div className="mx-auto max-w-[1080px] px-6 py-6">
        <div className="text-[13px] text-[#7a8199]">Хэрэглэгч › Хэрэглэгч бүртгэх › <b className="text-[#1b2033]">4. Татвар</b></div>
        <div className="mt-3 flex gap-1.5">
          {["Байгууллага", "eID", "Гэрээ", "Татвар", "Төхөөрөмж", "Апп ба багц", "Данс"].map((x, i) => (
            <div key={x} className="flex-1">
              <div className="h-1.5 rounded-full" style={{ background: i <= 3 ? IND : "#dfe3ee" }} />
              <div className={cx("mt-1 text-[11.5px]", i === 3 ? "font-semibold" : "text-[#7a8199]")}>{i + 1}. {x}</div>
            </div>
          ))}
        </div>

        <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-[1fr_340px]">
          <div className="space-y-5">
            <section className="rounded-[16px] bg-white p-5 shadow-[0_1px_0_#e3e6ef]">
              <h2 className="text-[16px] font-semibold">1. и-Баримтаас шалгах</h2>
              <p className="mt-1 text-[13px] text-[#7a8199]">Регистрийн дугаараар ТТД-ыг олж, НӨАТ, НХАТ төлөгч эсэхийг татна. Гараар оруулахгүй, засах боломжгүй.</p>
              <div className="mt-3 flex gap-2">
                <input value={reg} onChange={(e) => setReg(e.target.value)} className="h-11 w-[220px] rounded-[10px] border border-[#d9deea] px-3 text-[15px] outline-none focus:border-[#3949d4]" placeholder="Регистрийн дугаар" />
                <button type="button" onClick={check} disabled={busy} className="flex h-11 items-center gap-2 rounded-[10px] px-4 text-[14px] font-semibold text-white disabled:opacity-60" style={{ background: IND }}>
                  {busy && <Spinner size={16} />} и-Баримтаас шалгах
                </button>
              </div>
              {lk && !lk.found && <p className="mt-3 text-[13.5px] text-[#c0392b]">и-Баримтад олдсонгүй. Регистрийн дугаараа шалгана уу (туршилтын мерчантын РД 6543210 бодит биш — жишээ нь 6537359 оруулж үзнэ үү).</p>}
              {lk && lk.found && (
                <div className="mt-4 divide-y divide-[#eef0f6] rounded-[12px] border border-[#eef0f6] text-[14px]">
                  {[
                    ["Нэр (и-Баримт)", lk.name],
                    ["ТТД", lk.tin],
                    ["НӨАТ төлөгч", lk.vatPayer ? `Тийм${lk.vatSince ? ` · ${lk.vatSince}-аас` : ""}` : "Үгүй"],
                    ["НХАТ төлөгч", lk.cityPayer ? "Тийм" : "Үгүй"],
                    ["НӨАТ-аас чөлөөлөгдсөн төсөл", lk.freeProject ? "Тийм" : "Үгүй"],
                    ["Шалгасан", lk.checkedAt.slice(0, 16).replace("T", " ")],
                  ].map(([k, v]) => (
                    <div key={k} className="flex justify-between px-3.5 py-2">
                      <span className="text-[#7a8199]">{k}</span>
                      <span className="font-medium">{v}</span>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className={cx("rounded-[16px] bg-white p-5 shadow-[0_1px_0_#e3e6ef]", !draft && "pointer-events-none opacity-50")}>
              <h2 className="text-[16px] font-semibold">2. Ажилтан сонгоно</h2>
              <div className="mt-3 text-[13px] font-medium text-[#384056]">Салбарын үйл ажиллагаа</div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {(Object.keys(ACTIVITY_LABEL) as TaxProfile["activity"][]).map((a) => (
                  <button key={a} type="button" onClick={() => setActivity(a)} className={chip(activity === a)} style={activity === a ? { background: IND } : undefined}>
                    {ACTIVITY_LABEL[a]}
                  </button>
                ))}
              </div>
              <p className="mt-1.5 text-[12.5px] text-[#7a8199]">Ресторан, баар, зочид буудал, авто угаалгад НХАТ бүх борлуулалтад ногдоно. Эмнэлэг, сургалтын үйлчилгээ НӨАТ-аас чөлөөлөгдөнө (13.5).</p>
              <div className="mt-4 text-[13px] font-medium text-[#384056]">Өөрөө үйлдвэрлэдэг үү? (дотоодын түүхий эдээр)</div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <button type="button" onClick={() => setProducer([])} className={chip(!producer.length)} style={!producer.length ? { background: IND } : undefined}>
                  Үгүй
                </button>
                {(Object.keys(PRODUCER_LABEL) as TaxProfile["producer"]).map((p) => {
                  const on = producer.includes(p);
                  return (
                    <button key={p} type="button" onClick={() => setProducer(on ? producer.filter((x) => x !== p) : [...producer, p])} className={chip(on)} style={on ? { background: IND } : undefined}>
                      {PRODUCER_LABEL[p]}
                    </button>
                  );
                })}
              </div>
              <p className="mt-1.5 text-[12.5px] text-[#7a8199]">Сүү, мах, гурил, ногооны чөлөөлөлт зөвхөн үйлдвэрлэгчид хамаарна. Дамжуулан зардаг дэлгүүрт хамаарахгүй (НӨАТ-ын хууль 13.10).</p>
            </section>
          </div>

          <aside className="space-y-4">
            <div className="rounded-[16px] border border-[#d9dcf5] bg-[#f3f4fe] p-5">
              <div className="text-[13px] font-semibold" style={{ color: IND }}>Татварын горим</div>
              {mode ? (
                <>
                  <div className="mt-1 text-[20px] font-bold">
                    {mode.code}. {mode.title}
                  </div>
                  <p className="mt-1 text-[13.5px] leading-snug text-[#384056]">{mode.body}</p>
                  <div className="mt-4 text-[12.5px] font-semibold text-[#7a8199]">Бараа бүртгэхэд харагдах нь:</div>
                  <div className="mt-1.5 divide-y divide-[#e3e6f7] rounded-[12px] bg-white text-[13px]">
                    {EXAMPLES.map((e) => {
                      const t = splitTax(e.price, draft!, e);
                      return (
                        <div key={e.name} className="px-3 py-2">
                          <div className="flex justify-between">
                            <span>{e.name}</span>
                            <span className="font-medium">{money(e.price)}</span>
                          </div>
                          <div className="text-[12px] text-[#7a8199]">
                            {taxText(draft!, e)}
                            {t.vat ? ` · НӨАТ ${t.vat.toFixed(2)}` : ""}
                            {t.city ? ` · НХАТ ${t.city.toFixed(2)}` : ""}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              ) : (
                <p className="mt-1 text-[13.5px] text-[#7a8199]">и-Баримтаас шалгасны дараа гарна.</p>
              )}
            </div>
            <button type="button" onClick={save} disabled={!draft} className="h-12 w-full rounded-[12px] text-[15px] font-semibold text-white disabled:opacity-40" style={{ background: IND }}>
              Хадгалах
            </button>
            <div className="rounded-[12px] bg-white p-3.5 text-[12.5px] leading-snug text-[#7a8199] shadow-[0_1px_0_#e3e6ef]">
              Одоогийн тохиргоо: <b className="text-[#1b2033]">{cur ? `${modeOf(cur).code}. ${modeOf(cur).title}` : "—"}</b>
              <br />
              {cur?.setBy ?? ""}
              <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
                <a className="font-semibold" style={{ color: IND }} href="/" target="_blank">Пос апп ↗</a>
                <a className="font-semibold" style={{ color: IND }} href="/merchant" target="_blank">Утасны апп ↗</a>
                <a className="font-semibold" style={{ color: IND }} href="/portal" target="_blank">Merchant portal ↗</a>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
