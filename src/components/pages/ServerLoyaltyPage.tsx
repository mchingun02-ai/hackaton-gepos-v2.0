"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { moneyPlain } from "@/lib/demo";
import { useStore } from "@/lib/store";
import { type LoyaltyAdmin, type LoyaltyMemberRow, type LoyaltyPromo, type LoyaltyTier, type PromoKind, type RedeemSpec, api, newIdempotencyKey } from "@/lib/pos-api";
import { Chip, Empty, Field, PrimaryButton, Sheet, btnGhost } from "@/components/ui";
import { MembershipCard } from "@/components/app/MembershipCard";

/**
 * Урамшуулал (сервер горим, зөвхөн эзэн) — «Гишүүний карт», «Онооны дүрэм», «Онооны урамшуулал», «Гишүүд».
 *
 * Ноорог → Идэвхжүүлэх: ноорог хадгалах нь идэвхтэй загвар/дүрэмд нөлөөлөхгүй; идэвхжүүлэхэд
 * шинэ хувилбар болно (хуучин нь архивт). Бүх өөрчлөлт серверийн audit log-д.
 * Сервер эрхийг дахин шалгана — энд харагдахгүй үйлдлийг API-аар дуудсан ч хориглогдоно.
 */

type Tab = "card" | "rules" | "promos" | "members";
const GEREGE_BLUE = "#4002FF";

export default function ServerLoyaltyPage({ narrow }: { narrow: boolean }) {
  const { auth, reportError } = useStore();
  const [tab, setTab] = useState<Tab>("card");
  const [data, setData] = useState<LoyaltyAdmin | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const a = auth();
    if (!a) return;
    try {
      setData(await api.loyaltyAdmin(a));
      setError(null);
    } catch (e) {
      setError(reportError(e, "Урамшууллын тохиргоо ачаалж чадсангүй."));
    }
  }, [auth, reportError]);

  useEffect(() => {
    const timer = setTimeout(load, 0);
    return () => clearTimeout(timer);
  }, [load]);

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className={`space-y-5 ${narrow ? "px-4 pb-6 pt-4" : ""}`}>
        <div className="flex flex-wrap items-center gap-2">
          <Chip on={tab === "card"} onClick={() => setTab("card")}>
            Гишүүний карт
          </Chip>
          <Chip on={tab === "rules"} onClick={() => setTab("rules")}>
            Онооны дүрэм
          </Chip>
          <Chip on={tab === "promos"} onClick={() => setTab("promos")}>
            Онооны урамшуулал
          </Chip>
          <Chip on={tab === "members"} onClick={() => setTab("members")}>
            Гишүүд{data ? ` · ${data.stats.members}` : ""}
          </Chip>
        </div>

        {error && (
          <p role="alert" className="rounded-xl bg-danger-soft px-3.5 py-2.5 text-[13px] font-semibold text-danger">
            {error}
          </p>
        )}

        {data && tab === "card" && <CardEditor data={data} narrow={narrow} onSaved={load} />}
        {data && tab === "rules" && <RulesEditor data={data} onSaved={load} />}
        {data && tab === "promos" && <Promos data={data} narrow={narrow} />}
        {data && tab === "members" && <Members data={data} />}
      </div>
    </div>
  );
}

/* ───────────────────────── Гишүүний карт ───────────────────────── */

type CardForm = { title: string; description: string; bgColor: string; textColor: string; logoId: string | null; logoUrl: string | null };

function CardEditor({ data, narrow, onSaved }: { data: LoyaltyAdmin; narrow: boolean; onSaved: () => Promise<void> }) {
  const { auth, reportError } = useStore();
  const source = data.card.draft ?? data.card.active;
  const initial: CardForm = {
    title: source?.title ?? data.merchant,
    description: source?.description ?? "",
    bgColor: source?.bgColor ?? GEREGE_BLUE,
    textColor: source?.textColor ?? "#FFFFFF",
    logoId: source?.logoId ?? null,
    logoUrl: source?.logoUrl ?? null,
  };
  const [form, setForm] = useState<CardForm>(initial);
  const [busy, setBusy] = useState<null | "save" | "activate" | "logo">(null);
  const [note, setNote] = useState<{ tone: "ok" | "danger"; text: string } | null>(null);
  const [preview, setPreview] = useState(false);
  const server = auth()?.server ?? "";

  // Ноорог байхгүй бол идэвхтэй загвартай харьцуулна
  const saved = data.card.draft ?? data.card.active;
  const dirty =
    !saved ||
    saved.title !== form.title ||
    (saved.description ?? "") !== form.description ||
    saved.bgColor.toLowerCase() !== form.bgColor.toLowerCase() ||
    saved.textColor.toLowerCase() !== form.textColor.toLowerCase() ||
    (saved.logoId ?? null) !== form.logoId;

  const set = (patch: Partial<CardForm>) => {
    setForm((f) => ({ ...f, ...patch }));
    setNote(null);
  };

  const run = async (kind: "save" | "activate", fn: () => Promise<unknown>, ok: string) => {
    setBusy(kind);
    setNote(null);
    try {
      await fn();
      await onSaved();
      setNote({ tone: "ok", text: ok });
    } catch (e) {
      setNote({ tone: "danger", text: reportError(e, "Хадгалж чадсангүй.") });
    } finally {
      setBusy(null);
    }
  };

  const a = auth();
  const save = () =>
    a && run("save", () => api.saveLoyaltyCard(a, { title: form.title.trim(), description: form.description.trim(), bgColor: form.bgColor, textColor: form.textColor, logoId: form.logoId }), "Ноорог хадгалагдлаа — идэвхтэй карт өөрчлөгдөөгүй.");
  const activate = () => a && run("activate", () => api.activateLoyaltyCard(a), "Идэвхжлээ — хэрэглэгчийн аппад энэ загвар харагдана.");

  /* PNG лого — урьдчилан шалгаад серверт; сервер MIME, хэмжээ, файлын толгойг дахин шалгана */
  const onLogo = async (file: File | undefined) => {
    if (!file || !a) return;
    if (file.type !== "image/png") return setNote({ tone: "danger", text: "Зөвхөн PNG зураг оруулна." });
    if (file.size > 256 * 1024) return setNote({ tone: "danger", text: "Лого 256KB-аас бага байна." });
    setBusy("logo");
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
      });
      const res = await api.uploadLoyaltyLogo(a, base64);
      set({ logoId: res.logo.id, logoUrl: res.logo.url });
      setNote({ tone: "ok", text: `Лого оруулсан (${res.logo.width}×${res.logo.height}). «Ноорог хадгалах» дарж хадгална.` });
    } catch (e) {
      setNote({ tone: "danger", text: reportError(e, "Лого оруулж чадсангүй.") });
    } finally {
      setBusy(null);
    }
  };

  const logoSrc = form.logoUrl ? `${server}${form.logoUrl}` : null;

  return (
    <div className={`grid gap-5 ${narrow ? "" : "grid-cols-[minmax(0,1fr)_minmax(0,420px)]"}`}>
      {/* Тохиргоо */}
      <div className="space-y-4 rounded-[22px] bg-paper p-5 ring-1 ring-inset ring-hair">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-[15px] font-bold text-ink">Картын загвар</h2>
          {data.card.active && <span className="rounded-full bg-ok-soft px-2 py-0.5 text-[11px] font-semibold text-ok">Идэвхтэй · v{data.card.active.version}</span>}
          {data.card.draft && <span className="rounded-full bg-warn-soft px-2 py-0.5 text-[11px] font-semibold text-warn">Ноорог · v{data.card.draft.version}</span>}
          {dirty && <span className="text-[11px] font-semibold text-mute">хадгалаагүй өөрчлөлттэй</span>}
        </div>

        <div>
          <span className="meta mb-1.5 block">Байгууллага</span>
          <p className="text-[14px] font-semibold text-ink">{data.merchant}</p>
        </div>
        <Field label="Картын нэр" value={form.title} onChange={(v) => set({ title: v.slice(0, 40) })} placeholder={data.merchant} />
        <Field label="Тайлбар" value={form.description} onChange={(v) => set({ description: v.slice(0, 160) })} placeholder="Худалдан авалт бүрт оноо цуглуулна" />

        <div>
          <span className="meta mb-1.5 block">Лого (PNG, 256KB хүртэл, 32–1024px)</span>
          <div className="flex items-center gap-3">
            <span className="grid size-14 shrink-0 place-items-center overflow-hidden rounded-xl bg-stage ring-1 ring-inset ring-hair">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {logoSrc ? <img src={logoSrc} alt="Лого" className="size-full object-contain" /> : <span className="text-[11px] text-mute">алга</span>}
            </span>
            <label className={`${btnGhost} cursor-pointer`}>
              {busy === "logo" ? "Оруулж байна…" : "PNG сонгох"}
              <input type="file" accept="image/png" className="sr-only" onChange={(e) => void onLogo(e.target.files?.[0])} disabled={busy !== null} />
            </label>
            {form.logoId && (
              <button type="button" className="text-[12px] font-semibold text-mute hover:text-danger" onClick={() => set({ logoId: null, logoUrl: null })}>
                Хасах
              </button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <ColorField label="Үндсэн өнгө" value={form.bgColor} onChange={(v) => set({ bgColor: v })} />
          <ColorField label="Текстийн өнгө" value={form.textColor} onChange={(v) => set({ textColor: v })} />
        </div>

        {note && (
          <p role="status" className={`rounded-xl px-3.5 py-2.5 text-[13px] font-semibold ${note.tone === "ok" ? "bg-ok-soft text-ok" : "bg-danger-soft text-danger"}`}>
            {note.text}
          </p>
        )}

        <div className="flex flex-wrap gap-2">
          <button type="button" className={btnGhost} onClick={save} disabled={busy !== null || !dirty || form.title.trim().length < 2}>
            {busy === "save" ? "Хадгалж байна…" : "Ноорог хадгалах"}
          </button>
          <button type="button" className={btnGhost} onClick={() => setPreview(true)} disabled={!data.card.draft}>
            Урьдчилан харах
          </button>
        </div>
        <PrimaryButton onClick={activate} disabled={busy !== null || !data.card.draft || dirty} arrow={false}>
          {busy === "activate" ? "Идэвхжүүлж байна…" : "Идэвхжүүлэх"}
        </PrimaryButton>
        <p className="text-[12px] leading-relaxed text-mute">
          Ноорог хадгалах нь идэвхтэй картад нөлөөлөхгүй. «Идэвхжүүлэх» дарахад хэрэглэгчийн аппад шинэ загвар харагдана.
          Apple Wallet / Google Wallet хараахан холбогдоогүй.
        </p>
      </div>

      {/* Урьдчилан харах — одоо бичиж буй утгаар */}
      <div className="space-y-3">
        <span className="meta block">Урьдчилан харах</span>
        <MemberCardPreview title={form.title || data.merchant} description={form.description} bgColor={form.bgColor} textColor={form.textColor} logoSrc={logoSrc} merchant={data.merchant} />
      </div>

      {preview && data.card.draft && (
        <Sheet title={`Ноорог · v${data.card.draft.version}`} onClose={() => setPreview(false)} footer={null}>
          <p className="text-[13px] text-ink-2">Хадгалсан ноорог хэрэглэгчийн аппад ингэж харагдана (идэвхжүүлсний дараа).</p>
          <MemberCardPreview
            title={data.card.draft.title}
            description={data.card.draft.description ?? ""}
            bgColor={data.card.draft.bgColor}
            textColor={data.card.draft.textColor}
            logoSrc={data.card.draft.logoUrl ? `${server}${data.card.draft.logoUrl}` : null}
            merchant={data.merchant}
          />
        </Sheet>
      )}
    </div>
  );
}

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="block">
      <span className="meta mb-1.5 block">{label}</span>
      <span className="flex items-center gap-2 rounded-xl bg-stage px-2.5 py-2">
        <input type="color" value={/^#[0-9a-fA-F]{6}$/.test(value) ? value : "#000000"} onChange={(e) => onChange(e.target.value.toUpperCase())} className="size-8 cursor-pointer rounded-lg border-0 bg-transparent p-0" />
        <input value={value} onChange={(e) => onChange(e.target.value.trim().slice(0, 7))} className="tnum w-full bg-transparent text-[14px] font-semibold text-ink outline-none" aria-label={label} />
      </span>
    </label>
  );
}

/* Жишээ QR — бодит QR зураг, гэхдээ ямар ч гишүүнд хамаарахгүй санамсаргүй токен (касс «олдсонгүй» гэнэ) */
const sampleToken = () => {
  const abc = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
  let t = "gm1.";
  for (let i = 0; i < 22; i++) t += abc[Math.floor(Math.random() * abc.length)];
  return t;
};

export function MemberCardPreview({ title, description, bgColor, textColor, logoSrc, merchant }: { title: string; description: string; bgColor: string; textColor: string; logoSrc: string | null; merchant: string }) {
  const [token] = useState(sampleToken);
  return (
    <div className="space-y-2">
      <MembershipCard title={title} merchant={merchant} description={description} bgColor={bgColor} textColor={textColor} logoSrc={logoSrc} holder="Б. Болд" tierName="Мөнгөн" points={1240} qr={token} />
      {description && (
        <p className="rounded-xl bg-paper px-3.5 py-2.5 text-[12.5px] leading-snug text-ink-2 ring-1 ring-inset ring-hair">
          <span className="block text-[10.5px] font-semibold uppercase tracking-[0.08em] text-mute">Тайлбар · картын дэлгэрэнгүйд</span>
          {description}
        </p>
      )}
      <p className="text-[11.5px] leading-relaxed text-mute">
        <span className="font-semibold text-warn">Жишээ өгөгдөл:</span> нэр, оноо, зэрэглэл, QR нь бодит гишүүнийх биш (касс уншвал «олдсонгүй»).
      </p>
    </div>
  );
}

/* ───────────────────────── Онооны дүрэм ───────────────────────── */

function RulesEditor({ data, onSaved }: { data: LoyaltyAdmin; onSaved: () => Promise<void> }) {
  const { auth, reportError } = useStore();
  const source = data.rule.draft ?? data.rule.active ?? { tiers: data.rule.defaults.tiers, storeBonusBp: data.rule.defaults.storeBonusBp, redeem: data.rule.defaults.redeem };
  const [tiers, setTiers] = useState<LoyaltyTier[]>(source.tiers);
  const [bonus, setBonus] = useState(String(source.storeBonusBp / 100));
  const r0: RedeemSpec = source.redeem ?? { enabled: false, pointValue: 1, minPoints: 100, maxPct: 50 };
  const [redeemOn, setRedeemOn] = useState(r0.enabled);
  const [pointValue, setPointValue] = useState(String(r0.pointValue));
  const [minPoints, setMinPoints] = useState(String(r0.minPoints));
  const [maxPct, setMaxPct] = useState(String(r0.maxPct));
  const redeem: RedeemSpec = { enabled: redeemOn, pointValue: Number(pointValue) || 0, minPoints: Number(minPoints) || 0, maxPct: Number(maxPct) || 0 };
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ tone: "ok" | "danger"; text: string } | null>(null);
  const a = auth();

  const pct = (v: string) => Math.round(Number(v.replace(",", ".")) * 100);
  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true);
    setNote(null);
    try {
      await fn();
      await onSaved();
      setNote({ tone: "ok", text: ok });
    } catch (e) {
      setNote({ tone: "danger", text: reportError(e, "Хадгалж чадсангүй.") });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4 rounded-[22px] bg-paper p-5 ring-1 ring-inset ring-hair">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-[15px] font-bold text-ink">Онооны дүрэм</h2>
        {data.rule.active ? (
          <span className="rounded-full bg-ok-soft px-2 py-0.5 text-[11px] font-semibold text-ok">Идэвхтэй · v{data.rule.active.version}</span>
        ) : (
          <span className="rounded-full bg-stage px-2 py-0.5 text-[11px] font-semibold text-mute">Идэвхжээгүй — оноо олгогдохгүй</span>
        )}
        {data.rule.draft && <span className="rounded-full bg-warn-soft px-2 py-0.5 text-[11px] font-semibold text-warn">Ноорог · v{data.rule.draft.version}</span>}
      </div>

      <ul className="space-y-2">
        {tiers.map((t, i) => (
          <li key={i} className="grid grid-cols-[1fr_1fr_110px_auto] items-end gap-2">
            <Field label={i === 0 ? "Код" : ""} value={t.code} onChange={(v) => setTiers((x) => x.map((y, j) => (j === i ? { ...y, code: v.toLowerCase().replace(/[^a-z0-9_-]/g, "").slice(0, 20) } : y)))} />
            <Field label={i === 0 ? "Зэрэглэл" : ""} value={t.name} onChange={(v) => setTiers((x) => x.map((y, j) => (j === i ? { ...y, name: v.slice(0, 30) } : y)))} />
            <Field label={i === 0 ? "Оноо, %" : ""} value={String(t.earnBp / 100)} onChange={(v) => setTiers((x) => x.map((y, j) => (j === i ? { ...y, earnBp: Number.isFinite(pct(v)) ? pct(v) : 0 } : y)))} />
            <button type="button" className="h-11 px-2 text-[12px] font-semibold text-mute hover:text-danger disabled:opacity-40" disabled={tiers.length <= 1} onClick={() => setTiers((x) => x.filter((_, j) => j !== i))}>
              Хасах
            </button>
          </li>
        ))}
      </ul>
      <button type="button" className={btnGhost} disabled={tiers.length >= 6} onClick={() => setTiers((x) => [...x, { code: `tier${x.length + 1}`, name: "", earnBp: 100 }])}>
        Зэрэглэл нэмэх
      </button>
      <div className="max-w-[220px]">
        <Field label="Дэлгүүрийн нэмэлт, %" value={bonus} onChange={setBonus} />
      </div>

      <div className="space-y-3 rounded-xl bg-stage p-4">
        <label className="flex items-center gap-2.5 text-[14px] font-bold text-ink">
          <input type="checkbox" checked={redeemOn} onChange={(e) => setRedeemOn(e.target.checked)} className="size-4 accent-[color:var(--accent)]" />
          Оноо зарцуулах боломж
        </label>
        {redeemOn && (
          <div className="grid grid-cols-3 gap-3">
            <Field label="1 оноо = ₮" value={pointValue} onChange={(v) => setPointValue(v.replace(/D/g, "").slice(0, 3))} numeric />
            <Field label="Доод оноо" value={minPoints} onChange={(v) => setMinPoints(v.replace(/D/g, "").slice(0, 7))} numeric />
            <Field label="Сагсны дээд %" value={maxPct} onChange={(v) => setMaxPct(v.replace(/D/g, "").slice(0, 2))} numeric />
          </div>
        )}
        <p className="text-[12px] leading-relaxed text-ink-2">
          Касс дээр хэрэглэгчийн апп дээрх <b>Gerege QR</b>-ыг уншуулж, кассчин оноо оруулна → хэрэглэгч <b>апп дээрээ зөвшөөрнө</b>. QR-ын зураг дангаараа
          оноо зарцуулж чадахгүй. Хөнгөлөлт НӨАТ-ын өмнө тооцогдоно; буцаалтад зарцуулсан оноо буцаасан мөнгөний хувиар сэргэнэ. Сагсны дээд хувь 90% хүртэл.
        </p>
      </div>

      <div className="rounded-xl bg-stage px-4 py-3 text-[12.5px] leading-relaxed text-ink-2">
        <p className="font-semibold text-ink">Тооцоо (сервер):</p>
        Оноо = төлсөн дүн (хөнгөлөлтийн дараа, НӨАТ орсон) × (зэрэглэлийн % + дэлгүүрийн нэмэлт %), доош тоймлоно.
        Буцаалтад олгосон оноог буцаасан мөнгөний хувиар хасна. Зэрэглэлийг эзэн гишүүн тус бүрт өгнө; зэрэглэлийн
        хөнгөлөлт хаалттай. Оноо хугацаагүй.
      </div>

      {note && (
        <p role="status" className={`rounded-xl px-3.5 py-2.5 text-[13px] font-semibold ${note.tone === "ok" ? "bg-ok-soft text-ok" : "bg-danger-soft text-danger"}`}>
          {note.text}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <button type="button" className={btnGhost} disabled={busy || !a} onClick={() => a && run(() => api.saveLoyaltyRule(a, { tiers, storeBonusBp: pct(bonus) || 0, redeem }), "Ноорог хадгалагдлаа — идэвхтэй дүрэм өөрчлөгдөөгүй.")}>
          Ноорог хадгалах
        </button>
      </div>
      <PrimaryButton disabled={busy || !a || !data.rule.draft} onClick={() => a && run(() => api.activateLoyaltyRule(a), "Дүрэм идэвхжлээ — дараагийн борлуулалтаас үйлчилнэ.")} arrow={false}>
        Идэвхжүүлэх
      </PrimaryButton>
    </div>
  );
}

/* ───────────────────────── Гишүүд ───────────────────────── */

function Members({ data }: { data: LoyaltyAdmin }) {
  const { auth, reportError } = useStore();
  const [rows, setRows] = useState<LoyaltyMemberRow[] | null>(null);
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const tiers = useMemo(() => data.rule.active?.tiers ?? [], [data]);

  const load = useCallback(async () => {
    const a = auth();
    if (!a) return;
    try {
      setRows((await api.loyaltyMembers(a, query)).members);
      setError(null);
    } catch (e) {
      setError(reportError(e, "Гишүүдийг ачаалж чадсангүй."));
    }
  }, [auth, reportError, query]);

  useEffect(() => {
    const timer = setTimeout(load, 250);
    return () => clearTimeout(timer);
  }, [load]);

  const act = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
      await load();
    } catch (e) {
      setError(reportError(e, "Хадгалж чадсангүй."));
    }
  };

  const adjust = (m: LoyaltyMemberRow) => {
    const a = auth();
    if (!a) return;
    const raw = window.prompt(`${m.name ?? m.phone ?? "Гишүүн"} — залруулах оноо (жишээ нь -50 эсвэл 120)`);
    if (!raw) return;
    const points = Number(raw.replace(/\s/g, ""));
    if (!Number.isInteger(points) || points === 0) return setError("Залруулга 0-ээс ялгаатай бүхэл тоо.");
    const reason = window.prompt("Залруулгын шалтгаан");
    if (!reason || reason.trim().length < 3) return setError("Шалтгаан заавал.");
    void act(() => api.adjustMemberPoints(a, m.id, points, reason.trim(), newIdempotencyKey()));
  };

  return (
    <div className="space-y-3 rounded-[22px] bg-paper p-5 ring-1 ring-inset ring-hair">
      <div className="flex flex-wrap items-end gap-3">
        <h2 className="mr-auto text-[15px] font-bold text-ink">Гишүүд · {moneyPlain(data.stats.points)} оноо нийт</h2>
        <div className="w-[200px]">
          <Field label="Утсаар хайх" value={query} onChange={setQuery} numeric />
        </div>
      </div>
      {error && (
        <p role="alert" className="rounded-xl bg-danger-soft px-3.5 py-2.5 text-[13px] font-semibold text-danger">
          {error}
        </p>
      )}
      {!rows ? null : rows.length === 0 ? (
        <Empty text="Гишүүн алга — хэрэглэгч Gerege аппаас элсэнэ" />
      ) : (
        <ul className="divide-y divide-hair">
          {rows.map((m) => (
            <li key={m.id} className="flex flex-wrap items-center gap-2 py-3">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[14px] font-bold text-ink">{m.name ?? "Нэргүй"}</span>
                <span className="block text-[12px] text-mute">{m.phone ?? "eID"} · {new Date(m.joinedAt).toLocaleDateString("mn-MN")}</span>
              </span>
              <span className="tnum w-24 text-right text-[14px] font-semibold text-ink">{moneyPlain(m.points)}</span>
              <span className="flex flex-wrap gap-1.5">
                {tiers.map((t) => (
                  <Chip key={t.code} on={m.tier === t.code} onClick={() => { const a = auth(); if (a && m.tier !== t.code) void act(() => api.setMemberTier(a, m.id, t.code)); }}>
                    {t.name}
                  </Chip>
                ))}
                <button type="button" className={btnGhost} onClick={() => adjust(m)}>
                  Залруулах
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ───────────────────────── Онооны урамшуулал ───────────────────────── */

const PROMO_STATUS: Record<LoyaltyPromo["status"], { label: string; cls: string }> = {
  live: { label: "Явагдаж байна", cls: "bg-ok-soft text-ok" },
  scheduled: { label: "Товлосон", cls: "bg-warn-soft text-warn" },
  ended: { label: "Дууссан", cls: "bg-stage text-mute" },
  stopped: { label: "Зогсоосон", cls: "bg-stage text-mute" },
};
const pad2 = (n: number) => String(n).padStart(2, "0");
/** <input type="datetime-local"> утга (локал цаг) */
const localInput = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
const fmtWhen = (iso: string) => {
  const d = new Date(iso);
  return `${pad2(d.getMonth() + 1)}/${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
};

type PromoForm = {
  id?: string;
  kind: PromoKind;
  title: string;
  description: string;
  multiplier: number;
  minAmount: string;
  bonusPoints: string;
  tiers: string[];
  startNow: boolean;
  startsAt: string;
  endsAt: string;
};
const blankPromo = (): PromoForm => {
  const now = Date.now();
  return {
    kind: "multiplier",
    title: "",
    description: "",
    multiplier: 2,
    minAmount: "50000",
    bonusPoints: "500",
    tiers: [],
    startNow: true,
    startsAt: localInput(new Date(now + 60 * 60_000)),
    endsAt: localInput(new Date(now + 7 * 86_400_000)),
  };
};

function Promos({ data, narrow }: { data: LoyaltyAdmin; narrow: boolean }) {
  const { auth, reportError } = useStore();
  const [rows, setRows] = useState<LoyaltyPromo[] | null>(null);
  const [form, setForm] = useState<PromoForm>(blankPromo);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ tone: "ok" | "danger"; text: string } | null>(null);
  const tiers = useMemo(() => data.rule.active?.tiers ?? [], [data]);

  const load = useCallback(async () => {
    const a = auth();
    if (!a) return;
    try {
      setRows((await api.loyaltyPromos(a)).promos);
    } catch (e) {
      setNote({ tone: "danger", text: reportError(e, "Урамшууллыг ачаалж чадсангүй.") });
    }
  }, [auth, reportError]);

  useEffect(() => {
    const timer = setTimeout(load, 0);
    return () => clearTimeout(timer);
  }, [load]);

  const set = (patch: Partial<PromoForm>) => {
    setForm((f) => ({ ...f, ...patch }));
    setNote(null);
  };
  const num = (v: string) => Number(v.replace(/[\s,]/g, ""));
  const summary =
    form.kind === "multiplier"
      ? `Хугацаанд ${form.multiplier} дахин оноо (суурь оноо × ${form.multiplier})`
      : `${moneyPlain(num(form.minAmount) || 0)}₮-өөс дээш худалдан авалтад +${moneyPlain(num(form.bonusPoints) || 0)} оноо`;

  const save = async () => {
    const a = auth();
    if (!a) return;
    setBusy(true);
    setNote(null);
    try {
      await api.saveLoyaltyPromo(a, {
        id: form.id,
        kind: form.kind,
        title: form.title.trim(),
        description: form.description.trim() || undefined,
        ...(form.kind === "multiplier" ? { multiplier: form.multiplier } : { minAmount: num(form.minAmount), bonusPoints: num(form.bonusPoints) }),
        tiers: form.tiers.length ? form.tiers : undefined,
        startsAt: (form.startNow ? new Date() : new Date(form.startsAt)).toISOString(),
        endsAt: new Date(form.endsAt).toISOString(),
      });
      setNote({ tone: "ok", text: form.id ? "Урамшуулал шинэчлэгдлээ." : "Урамшуулал хадгалагдлаа — гишүүдийн аппад харагдана." });
      setForm(blankPromo());
      await load();
    } catch (e) {
      setNote({ tone: "danger", text: reportError(e, "Хадгалж чадсангүй.") });
    } finally {
      setBusy(false);
    }
  };

  const stop = async (p: LoyaltyPromo) => {
    const a = auth();
    if (!a || !window.confirm(`«${p.title}» урамшууллыг зогсоох уу? Дахин идэвхжүүлэх боломжгүй.`)) return;
    try {
      await api.stopLoyaltyPromo(a, p.id);
      await load();
    } catch (e) {
      setNote({ tone: "danger", text: reportError(e, "Зогсоож чадсангүй.") });
    }
  };

  const edit = (p: LoyaltyPromo) =>
    setForm({
      id: p.id,
      kind: p.kind,
      title: p.title,
      description: p.description ?? "",
      multiplier: p.multiplier ?? 2,
      minAmount: String(p.minAmount ?? 50000),
      bonusPoints: String(p.bonusPoints ?? 500),
      tiers: p.tiers ?? [],
      startNow: false,
      startsAt: localInput(new Date(p.startsAt)),
      endsAt: localInput(new Date(p.endsAt)),
    });

  if (!data.rule.active) return <Empty text="Эхлээд «Онооны дүрэм»-ээ идэвхжүүлнэ үү — урамшуулал суурь оноон дээр үйлчилнэ." />;

  return (
    <div className={`grid gap-5 ${narrow ? "" : "grid-cols-[minmax(0,1fr)_minmax(0,420px)]"}`}>
      <div className="space-y-4 rounded-[22px] bg-paper p-5 ring-1 ring-inset ring-hair">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-[15px] font-bold text-ink">{form.id ? "Урамшуулал засах" : "Шинэ урамшуулал"}</h2>
          {form.id && (
            <button type="button" className="text-[12px] font-semibold text-mute hover:text-ink" onClick={() => setForm(blankPromo())}>
              Болих
            </button>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <Chip on={form.kind === "multiplier"} onClick={() => set({ kind: "multiplier" })}>
            N× оноо
          </Chip>
          <Chip on={form.kind === "threshold_bonus"} onClick={() => set({ kind: "threshold_bonus" })}>
            X₮-өөс дээш +N оноо
          </Chip>
        </div>
        <Field label="Нэр" value={form.title} onChange={(v) => set({ title: v.slice(0, 40) })} placeholder={form.kind === "multiplier" ? "Амралтын өдрийн 2× оноо" : "50 мянгаас дээш +500"} />
        <Field label="Тайлбар (заавал биш)" value={form.description} onChange={(v) => set({ description: v.slice(0, 160) })} placeholder="Бүх салбарт" />
        {form.kind === "multiplier" ? (
          <div>
            <span className="meta mb-1.5 block">Үржвэр</span>
            <div className="flex gap-2">
              {[2, 3, 4, 5].map((n) => (
                <Chip key={n} on={form.multiplier === n} onClick={() => set({ multiplier: n })}>
                  {n}×
                </Chip>
              ))}
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Доод дүн, ₮" value={form.minAmount} onChange={(v) => set({ minAmount: v.replace(/[^\d]/g, "").slice(0, 9) })} numeric />
            <Field label="Нэмэлт оноо" value={form.bonusPoints} onChange={(v) => set({ bonusPoints: v.replace(/[^\d]/g, "").slice(0, 8) })} numeric />
          </div>
        )}
        <div>
          <span className="meta mb-1.5 block">Хэнд</span>
          <div className="flex flex-wrap gap-2">
            <Chip on={form.tiers.length === 0} onClick={() => set({ tiers: [] })}>
              Бүх гишүүнд
            </Chip>
            {tiers.map((t) => (
              <Chip key={t.code} on={form.tiers.includes(t.code)} onClick={() => set({ tiers: form.tiers.includes(t.code) ? form.tiers.filter((x) => x !== t.code) : [...form.tiers, t.code] })}>
                {t.name}
              </Chip>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="meta mb-1.5 flex items-center gap-2">
              Эхлэх
              <span className="flex items-center gap-1 normal-case tracking-normal">
                <input type="checkbox" checked={form.startNow} onChange={(e) => set({ startNow: e.target.checked })} /> одоо
              </span>
            </span>
            <input type="datetime-local" aria-label="Эхлэх" value={form.startsAt} disabled={form.startNow} onChange={(e) => set({ startsAt: e.target.value })} className="h-11 w-full rounded-xl bg-stage px-3 text-[14px] font-semibold text-ink outline-none disabled:opacity-50" />
          </label>
          <label className="block">
            <span className="meta mb-1.5 block">Дуусах</span>
            <input type="datetime-local" aria-label="Дуусах" value={form.endsAt} onChange={(e) => set({ endsAt: e.target.value })} className="h-11 w-full rounded-xl bg-stage px-3 text-[14px] font-semibold text-ink outline-none" />
          </label>
        </div>
        <p className="rounded-xl bg-stage px-4 py-3 text-[12.5px] leading-relaxed text-ink-2">
          <span className="font-semibold text-ink">{summary}.</span> Касс дээр гишүүний QR уншуулахад сервер автоматаар тооцно (купон хэрэггүй). Нэг төрлийн хэд
          хэд давхцвал хамгийн их нь; нийт оноо төлсөн дүнгийн 20%-иас хэтрэхгүй. Эхэлсэн урамшууллын нөхцөл өөрчлөгдөхгүй — зөвхөн зогсооно.
        </p>
        {note && (
          <p role="status" className={`rounded-xl px-3.5 py-2.5 text-[13px] font-semibold ${note.tone === "ok" ? "bg-ok-soft text-ok" : "bg-danger-soft text-danger"}`}>
            {note.text}
          </p>
        )}
        <PrimaryButton onClick={() => void save()} disabled={busy || form.title.trim().length < 2} arrow={false}>
          {busy ? "Хадгалж байна…" : form.id ? "Шинэчлэх" : "Урамшуулал хадгалах"}
        </PrimaryButton>
      </div>

      <div className="space-y-2">
        <span className="meta block">Урамшууллууд</span>
        {!rows ? null : rows.length === 0 ? (
          <Empty text="Урамшуулал алга" />
        ) : (
          <ul className="space-y-2">
            {rows.map((p) => (
              <li key={p.id} className="rounded-[18px] bg-paper px-4 py-3 ring-1 ring-inset ring-hair">
                <div className="flex items-center gap-2">
                  <span className="rounded-lg bg-accent px-2 py-0.5 text-[12px] font-bold text-[color:var(--accent-ink)]">{p.badge}</span>
                  <span className="min-w-0 flex-1 truncate text-[14px] font-bold text-ink">{p.title}</span>
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${PROMO_STATUS[p.status].cls}`}>{PROMO_STATUS[p.status].label}</span>
                </div>
                <p className="mt-1 text-[12px] text-mute">
                  {fmtWhen(p.startsAt)} – {fmtWhen(p.endsAt)}
                  {p.kind === "threshold_bonus" && p.minAmount !== null && ` · ${moneyPlain(p.minAmount)}₮-өөс дээш`}
                  {p.tiers?.length ? ` · ${p.tiers.map((c) => tiers.find((t) => t.code === c)?.name ?? c).join(", ")}` : " · бүх гишүүнд"}
                </p>
                {(p.status === "live" || p.status === "scheduled") && (
                  <div className="mt-2 flex gap-3">
                    {p.status === "scheduled" && (
                      <button type="button" className="text-[12px] font-semibold text-ink hover:text-accent" onClick={() => edit(p)}>
                        Засах
                      </button>
                    )}
                    <button type="button" className="text-[12px] font-semibold text-mute hover:text-danger" onClick={() => void stop(p)}>
                      Зогсоох
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
