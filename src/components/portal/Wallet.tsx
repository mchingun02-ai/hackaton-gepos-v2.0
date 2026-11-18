"use client";

/*
 * Wallet pass (Premium, 6.2.7): загвар, Apple/Google урьдчилан харагдац,
 * нийтлэх, олгосон тоо, тараах суваг. C22: албан ёсны товч/лого зурахгүй.
 * C23: pass дээр зөвхөн нэр, оноо, түвшин, лого — KYC мэдээлэл гарахгүй.
 */

import { useEffect, useState } from "react";
import { QrCode } from "@/components/QrCode";
import { Icon } from "@/components/sp/icons";
import { Badge, Btn, cx, Field, Notice, Segmented, toast } from "@/components/sp/ui";
import { activePointCampaign, fmtPhone, num, SMS_PRICE, smsParts, tierOf } from "@/lib/sp/logic";
import { mutate, updatePass, uid } from "@/lib/sp/store";
import type { WalletPass } from "@/lib/sp/types";
import { Card, ColorField, contrast, Dialog, Page, readImage, Stat, usePortal } from "./kit";

export default function Wallet() {
  const { s, actor } = usePortal();
  const [p, setP] = useState<WalletPass>(s.pass);
  const [sms, setSms] = useState(false);
  const [origin, setOrigin] = useState("");
  useEffect(() => setOrigin(window.location.origin), []);
  const dirty = JSON.stringify(p) !== JSON.stringify(s.pass);
  const set = (x: Partial<WalletPass>) => setP((o) => ({ ...o, ...x }));
  const ratio = contrast(p.bg, p.fg);

  // Жишээ харилцагч — хамгийн их оноотой, pass-тай
  const sample = [...s.customers].filter((c) => !c.erased).sort((a, b) => b.points - a.points)[0];
  const camp = activePointCampaign(s);
  const tier = tierOf(s, sample?.id, camp)?.tier.name ?? "—";
  const issued = s.customers.filter((c) => c.passSerial && !c.erased).length;
  const link = `${origin}/shop?pass=1`;

  const publish = () => {
    if (ratio < 3) return toast("Өнгөний ялгаа хэт бага — бичиг уншигдахгүй.", "danger");
    updatePass(actor, { ...p, published: true });
    setP({ ...p, published: true });
    toast(s.pass.published ? "Карт шинэчлэгдлээ — харилцагчдын утсанд автоматаар" : "Wallet pass нийтлэгдлээ", "ok");
  };

  const sampleData = { name: s.delivery.page.name || s.merchant.name, holder: sample?.name ?? "Харилцагч", points: sample?.points ?? 0, tier, serial: sample?.passSerial ?? "GP-DEMO01" };

  return (
    <Page
      title="Wallet pass"
      sub={s.pass.published ? `Нийтлэгдсэн · ${num(issued)} карт олгосон` : "Нийтлээгүй — харилцагчид карт авах боломжгүй"}
      actions={
        <Btn size="md" disabled={s.pass.published && !dirty} onClick={publish}>
          {s.pass.published ? (dirty ? "Шинэчлэх" : "Нийтлэгдсэн") : "Нийтлэх"}
        </Btn>
      }
    >
      {!camp && (
        <div className="mb-5">
          <Notice tone="warn">Идэвхтэй оноо урамшуулал алга — карт дээрх оноо өсөхгүй. «Урамшуулал» хэсэгт Point based урамшуулал үүсгэнэ үү.</Notice>
        </div>
      )}
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Card title="Картын загвар">
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <span className="grid size-16 shrink-0 place-items-center overflow-hidden rounded-[16px] bg-[var(--sp-fill)] text-mute">
                {p.logo ? <img src={p.logo} alt="Лого" className="size-full object-cover" /> : <Icon name="building" size={26} />}
              </span>
              <div>
                <div className="flex flex-wrap gap-2">
                  <label className="sp-tap inline-flex h-[34px] cursor-pointer items-center gap-2 rounded-full bg-[var(--sp-fill)] px-3 text-[13px] font-semibold text-ink">
                    <Icon name="upload" size={16} />
                    Лого оруулах
                    <input
                      type="file"
                      accept="image/*"
                      className="sr-only"
                      onChange={async (e) => {
                        const f = e.target.files?.[0];
                        if (f) set({ logo: await readImage(f, 256) });
                        e.target.value = "";
                      }}
                    />
                  </label>
                  {p.logo && (
                    <Btn size="sm" variant="plain" onClick={() => set({ logo: undefined })}>
                      Арилгах
                    </Btn>
                  )}
                </div>
                <p className="mt-1 text-[12px] text-mute">PNG, дөрвөлжин, тунгалаг дэвсгэртэй.</p>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Дэвсгэр өнгө">
                <ColorField label="Дэвсгэр өнгө" value={p.bg} onChange={(v) => set({ bg: v })} />
              </Field>
              <Field label="Бичгийн өнгө">
                <ColorField label="Бичгийн өнгө" value={p.fg} onChange={(v) => set({ fg: v })} />
              </Field>
            </div>
            <p className={cx("-mt-1 text-[13px]", ratio < 4.5 ? "text-warn" : "text-mute")}>
              Контраст {ratio.toFixed(1)}:1 {ratio < 4.5 ? "— 4.5:1-ээс багагүй байвал уншихад амар." : "— уншигдахад сайн."}
            </p>
            <Field label="Онооны талбарын нэр">
              <input className="sp-field" value={p.label} maxLength={14} onChange={(e) => set({ label: e.target.value })} />
            </Field>
            <Field label="Ар талын тайлбар" hint={`${p.back.length}/200`}>
              <textarea className="sp-field" rows={3} maxLength={200} value={p.back} onChange={(e) => set({ back: e.target.value })} />
            </Field>
            <Notice tone="gray" icon="info">
              Карт дээр зөвхөн нэр, оноо, түвшин, лого харагдана. Регистр, хаяг зэрэг KYC мэдээлэл гарахгүй.
            </Notice>
          </div>
        </Card>

        <Card title="Урьдчилан харах">
          <Previews p={p} d={sampleData} />
        </Card>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <div className="grid content-start gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
          <Stat label="Олгосон карт" value={num(issued)} sub={`${s.customers.filter((c) => !c.erased).length} харилцагчаас`} />
          <Stat label="Төлөв" value={<Badge tone={s.pass.published ? "ok" : "gray"}>{s.pass.published ? "Нийтлэгдсэн" : "Нийтлээгүй"}</Badge>} sub="Өөрчлөлт картад автоматаар" />
        </div>
        <Card title="Харилцагчид хүргэх">
          <div className={cx("flex flex-col gap-5 sm:flex-row", !s.pass.published && "pointer-events-none opacity-50")}>
            <div className="shrink-0 self-center rounded-[16px] bg-white p-2 shadow-[0_0_0_0.5px_var(--sp-sep)]">{origin && <QrCode value={link} size={148} label="Wallet pass авах QR" />}</div>
            <div className="min-w-0 flex-1 space-y-3">
              <p className="text-[14px] leading-snug text-ink-2">Касс дээр энэ QR-ыг үзүүлнэ, эсвэл холбоосыг илгээнэ. Харилцагч утасны дугаараа оруулаад картаа хадгална.</p>
              <div className="flex gap-2">
                <input readOnly className="sp-field !h-10 min-w-0 flex-1 !text-[13px]" value={link} aria-label="Холбоос" onFocus={(e) => e.target.select()} />
                <Btn
                  size="md"
                  variant="gray"
                  icon="link"
                  className="!h-10"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(link);
                      toast("Холбоос хуулагдлаа");
                    } catch {
                      toast("Хуулж чадсангүй — гараар сонгоно уу", "danger");
                    }
                  }}
                >
                  Хуулах
                </Btn>
              </div>
              <Btn size="md" variant="tinted" icon="sms" onClick={() => setSms(true)}>
                SMS-ээр илгээх
              </Btn>
            </div>
          </div>
          {!s.pass.published && <p className="mt-3 text-[13px] text-mute">Эхлээд картаа нийтэлнэ үү.</p>}
          <p className="mt-4 text-[12px] leading-snug text-mute">Харилцагчийн утсан дээр Apple, Google-ийн албан ёсны «Wallet-д нэмэх» товч гарна.</p>
        </Card>
      </div>
      <SmsDialog open={sms} onClose={() => setSms(false)} link={link} />
    </Page>
  );
}

type Sample = { name: string; holder: string; points: number; tier: string; serial: string };

function Previews({ p, d }: { p: WalletPass; d: Sample }) {
  const [view, setView] = useState<"both" | "back">("both");
  return (
    <div>
      <Segmented<"both" | "back"> className="mb-4 w-[240px]" value={view} onChange={setView} options={[{ id: "both", label: "Нүүр" }, { id: "back", label: "Ар тал" }]} />
      {view === "back" ? (
        <div className="mx-auto max-w-[340px] rounded-[18px] bg-paper p-5 text-[14px] shadow-[0_0_0_0.5px_var(--sp-sep)]">
          <div className="text-[12px] font-semibold uppercase text-mute">Мэдээлэл</div>
          <p className="mt-1 whitespace-pre-wrap text-ink">{p.back || "—"}</p>
          <div className="mt-4 text-[12px] font-semibold uppercase text-mute">Картын дугаар</div>
          <p className="mt-1 font-mono text-ink">{d.serial}</p>
        </div>
      ) : (
        <div className="grid justify-items-center gap-6 2xl:grid-cols-2">
          {/* Apple Wallet · Store card маягийн */}
          <figure className="w-full max-w-[320px]">
            <div className="overflow-hidden rounded-[14px] shadow-[0_14px_34px_-14px_rgb(0_0_0/0.45)]" style={{ background: p.bg, color: p.fg }}>
              <div className="flex items-center gap-2.5 px-4 pt-3.5">
                <Logo p={p} name={d.name} size={30} />
                <span className="min-w-0 flex-1 truncate text-[15px] font-semibold">{d.name}</span>
                <span className="text-right">
                  <span className="block text-[10px] font-semibold uppercase tracking-wide opacity-75">{p.label || "Оноо"}</span>
                  <span className="block text-[20px] font-semibold leading-none tnum">{num(d.points)}</span>
                </span>
              </div>
              <div className="mx-0 mt-3 h-[84px] opacity-90" style={{ background: `color-mix(in oklab, ${p.fg} 14%, ${p.bg})` }} />
              <div className="flex gap-6 px-4 pt-3">
                <span>
                  <span className="block text-[10px] font-semibold uppercase tracking-wide opacity-75">Түвшин</span>
                  <span className="block text-[15px] font-semibold">{d.tier}</span>
                </span>
                <span className="min-w-0">
                  <span className="block text-[10px] font-semibold uppercase tracking-wide opacity-75">Гишүүн</span>
                  <span className="block truncate text-[15px] font-semibold">{d.holder}</span>
                </span>
              </div>
              <div className="flex justify-center px-4 pb-4 pt-4">
                <span className="rounded-[8px] bg-white p-1.5">
                  <QrCode value={d.serial} size={116} label="Картын QR" />
                </span>
              </div>
            </div>
            <figcaption className="mt-2 text-center text-[12px] text-mute">Apple Wallet · Store card</figcaption>
          </figure>
          {/* Google Wallet · Loyalty маягийн */}
          <figure className="w-full max-w-[320px]">
            <div className="overflow-hidden rounded-[22px] shadow-[0_14px_34px_-14px_rgb(0_0_0/0.45)]" style={{ background: p.bg, color: p.fg }}>
              <div className="flex items-center gap-2.5 px-4 pt-4">
                <Logo p={p} name={d.name} size={34} round />
                <span className="min-w-0 truncate text-[15px] font-medium">{d.name}</span>
              </div>
              <div className="px-4 pt-4">
                <div className="text-[13px] opacity-80">{p.label || "Оноо"}</div>
                <div className="text-[34px] font-semibold leading-tight tnum">{num(d.points)}</div>
                <div className="text-[13px] opacity-80">{d.tier} түвшин</div>
              </div>
              <div className="flex justify-center px-4 pb-5 pt-4">
                <span className="rounded-[12px] bg-white p-2">
                  <QrCode value={d.serial} size={116} label="Картын QR" />
                </span>
              </div>
            </div>
            <figcaption className="mt-2 text-center text-[12px] text-mute">Google Wallet · Loyalty</figcaption>
          </figure>
        </div>
      )}
      <p className="mt-4 flex items-start gap-2 text-[12px] leading-snug text-mute">
        <Icon name="info" size={15} className="mt-px" />
        Phase 1-д картыг касс дээр QR эсвэл баркодоор уншуулна. Утсаа ойртуулж (NFC) уншуулах нь дараагийн шатанд.
      </p>
    </div>
  );
}

function Logo({ p, name, size, round }: { p: WalletPass; name: string; size: number; round?: boolean }) {
  const ini = name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
  return (
    <span
      className={cx("grid shrink-0 place-items-center overflow-hidden text-[12px] font-bold", round ? "rounded-full" : "rounded-[8px]")}
      style={{ width: size, height: size, background: p.logo ? "transparent" : p.fg, color: p.bg }}
    >
      {p.logo ? <img src={p.logo} alt="" className="size-full object-contain" /> : ini}
    </span>
  );
}

function SmsDialog({ open, onClose, link }: { open: boolean; onClose: () => void; link: string }) {
  const { s, actor } = usePortal();
  const [phone, setPhone] = useState("");
  const name = s.delivery.page.name || s.merchant.name;
  const text = `${name}: Урамшууллын картаа энд аваарай ${link}`;
  const { parts } = smsParts(text);
  const known = s.customers.find((c) => c.phone === phone && !c.erased);
  const send = () => {
    mutate(
      (st) => ({
        ...st,
        smsLog: [{ id: uid("sm"), at: new Date().toISOString(), kind: "marketing" as const, phone, text, cost: parts * SMS_PRICE }, ...st.smsLog],
      }),
      { who: actor, action: "Wallet pass холбоос илгээв", target: fmtPhone(phone) },
    );
    toast(`${fmtPhone(phone)} руу илгээгдлээ`, "ok");
    setPhone("");
    onClose();
  };
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="SMS-ээр илгээх"
      width={440}
      footer={
        <Btn size="md" icon="sms" disabled={phone.length !== 8} onClick={send}>
          Илгээх
        </Btn>
      }
    >
      <div className="space-y-4">
        <Field label="Утасны дугаар" hint={known ? `${known.name ?? "Бүртгэлтэй харилцагч"} · ${num(known.points)} оноо` : "8 оронтой"}>
          <input className="sp-field tnum" inputMode="numeric" maxLength={8} autoFocus value={phone} onChange={(e) => setPhone(e.target.value.replace(/\D/g, ""))} />
        </Field>
        <div className="rounded-[14px] bg-paper p-3 text-[14px] leading-snug text-ink-2">{text}</div>
        <p className="text-[12px] text-mute">
          {parts} хэсэг · {parts * SMS_PRICE}₮. Харилцагчийн хүсэлтээр илгээнэ.
        </p>
      </div>
    </Dialog>
  );
}
