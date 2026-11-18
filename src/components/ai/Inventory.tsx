"use client";

/**
 * Самбарын «Тооллого» таб (docs/ARCHITECTURE.md §5.6): тооллогууд, зөрүүний тайлан, батлах/дахин тоолуулах,
 * утас холбох QR (10 мин, нэг удаагийн), босго, захиалах санал, тавиурын цоорхой.
 */
import { useEffect, useState } from "react";
import { QrCode } from "@/components/QrCode";
import { Icon } from "@/components/sp/icons";
import { Btn, cx, Empty, Sheet, toast } from "@/components/sp/ui";
import { LevelChip, LineChip, money, SessionChip } from "@/components/count/ui";
import type { SessionSummary, Variance } from "@/components/count/types";
import type { Thresholds } from "@/lib/inventory/reconcile";
import { Head } from "./AiApp";
import { aj, ago, ApiError, useLive } from "./client";

type Reorder = { items: { productId: string; name: string; qty: number; minQty: number; sold14: number; velocity: number; daysCover: number | null; suggest: number }[]; estimatedCost: number; windowDays: number };
type Gaps = { session: { id: string; no: number; name: string } | null; photos: number; gaps: { photoId: string; nearLabel: string; priceTagText: string | null }[]; missing: { productId: string; name: string; category: string; stock: number }[] };

const card = "rounded-[20px] bg-paper p-5 shadow-[0_0_0_0.5px_var(--sp-sep)]";

export function Inventory() {
  const { data, reload } = useLive<{ sessions: SessionSummary[]; categories: string[] }>("/api/v1/inventory/sessions", ["inventory"]);
  const [sel, setSel] = useState<string | null>(null);
  const [pair, setPair] = useState<{ code: string; expiresAt: number } | null>(null);
  const list = data?.sessions ?? [];
  const current = sel ?? list.find((s) => s.status === "review")?.id ?? list[0]?.id ?? null;

  async function newPair() {
    try {
      setPair(await aj<{ code: string; expiresAt: number }>("/api/auth/pair", { method: "PUT" }));
    } catch (e) {
      toast(e instanceof Error ? e.message : "Алдаа", "danger");
    }
  }
  async function start() {
    try {
      const r = await aj<{ session: { id: string } }>("/api/v1/inventory/sessions", { method: "POST", json: { scope: "all" } });
      setSel(r.session.id);
      void reload();
      toast("Тооллого эхэллээ — ажилтан утсаараа тоолно", "ok");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Алдаа", "danger");
    }
  }

  return (
    <div>
      <Head
        title="Тооллого"
        sub="Ажилтан утсаараа (зураг, баркод, гараар) тоолно — та энд зөрүүг хянаж батална. Үлдэгдэл зөвхөн зөрүүгээр засагдана."
        actions={
          <div className="flex flex-wrap gap-2">
            <Btn size="md" variant="tinted" icon="qr" onClick={() => void newPair()}>
              Утас холбох
            </Btn>
            <Btn size="md" icon="plus" onClick={() => void start()}>
              Шинэ тооллого
            </Btn>
          </div>
        }
      />
      <div className="mx-auto grid max-w-[1320px] gap-4 px-4 pb-10 md:px-8 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-w-0 space-y-4">
          {data && !list.length ? (
            <div className={card}>
              <Empty icon="box" title="Тооллого алга" body="«Утас холбох» дарж ажилтны утсыг холбоод, «Шинэ тооллого» эхлүүлнэ үү. Утсан дээр /count хаягаар нээгдэнэ." />
            </div>
          ) : (
            <div className={cx(card, "!p-0 overflow-hidden")}>
              <div className="flex items-center justify-between px-5 pb-2 pt-4">
                <h2 className="text-[16px] font-bold text-ink">Тооллогууд</h2>
                <a href="/count" target="_blank" rel="noreferrer" className="text-[13.5px] font-semibold text-accent">
                  Утасны хуудас нээх ↗
                </a>
              </div>
              <ul className="divide-y divide-[var(--sp-sep)]">
                {list.map((s) => (
                  <li key={s.id}>
                    <button type="button" onClick={() => setSel(s.id)} className={cx("flex w-full items-center gap-3 px-5 py-3 text-left hover:bg-[var(--sp-fill)]", current === s.id && "bg-accent-soft/60")}>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[15px] font-semibold text-ink">{s.name}</div>
                        <div className="text-[12.5px] text-mute tnum">
                          {s.done}/{s.total} тоолсон · {s.createdBy} · {ago(s.createdAt)}
                          {s.critical ? ` · ${s.critical} дахин тоолох` : ""}
                        </div>
                      </div>
                      <SessionChip status={s.status} />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {current && <Detail key={current} sid={current} onChanged={() => void reload()} />}
        </div>
        <div className="space-y-4">
          <ThresholdsCard />
          <ReorderCard />
          <GapsCard />
        </div>
      </div>

      <Sheet open={!!pair} onClose={() => setPair(null)} title="Утас холбох">
        {pair && <PairBody pair={pair} onNew={() => void newPair()} />}
      </Sheet>
    </div>
  );
}

function PairBody({ pair, onNew }: { pair: { code: string; expiresAt: number }; onNew: () => void }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const url = `${typeof window !== "undefined" ? window.location.origin : ""}/count?pair=${pair.code}`;
  const left = Math.max(0, Math.round((pair.expiresAt - now) / 1000));
  return (
    <div className="space-y-4 px-5 pb-8 pt-2 text-center">
      <p className="text-[14.5px] text-mute">Ажилтны утасны камераар QR-ыг уншуулна → ажилтан PIN-ээ оруулна. Нэг удаагийн, 10 минут хүчинтэй.</p>
      <div className={cx("mx-auto w-fit rounded-[16px] bg-white p-2", !left && "opacity-30")}>
        <QrCode value={url} size={220} label="Утас холбох QR" />
      </div>
      <div className="text-[28px] font-bold tracking-[0.2em] text-ink tnum">{pair.code}</div>
      <div className={cx("text-[14px]", left ? "text-mute" : "text-danger")}>{left ? `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")} хүчинтэй` : "Хугацаа дууссан"}</div>
      {!left && (
        <Btn size="lg" block onClick={onNew}>
          Шинэ код
        </Btn>
      )}
      <p className="break-all text-[12px] text-mute">{url}</p>
    </div>
  );
}

function Detail({ sid, onChanged }: { sid: string; onChanged: () => void }) {
  const { data: v, error, reload } = useLive<Variance>(`/api/v1/inventory/sessions/${sid}/variance`, ["inventory"]);
  const [busy, setBusy] = useState(false);
  const [reason, setReason] = useState("");
  const [ask, setAsk] = useState(false);
  if (error) return <div className={cx(card, "text-[14px] text-danger")}>{error}</div>;
  if (!v) return <div className={cx(card, "text-[14px] text-mute")}>Ачаалж байна…</div>;
  const crit = v.lines.filter((l) => l.level === "critical" && l.status === "counted");
  const review = v.session.status === "review";

  async function act(kind: "approve" | "reject", body: Record<string, unknown> = {}) {
    setBusy(true);
    try {
      const r = await aj<{ summary?: string; recount?: number }>(`/api/v1/inventory/sessions/${sid}/${kind}`, { method: "POST", json: body });
      toast(kind === "approve" ? (r.summary ?? "Батлагдлаа") : `${r.recount ?? 0} барааг дахин тоолуулахаар буцаалаа`, "ok");
      setAsk(false);
      onChanged();
      void reload();
    } catch (e) {
      if (e instanceof ApiError && e.status === 409 && kind === "approve" && crit.length) setAsk(true);
      toast(e instanceof Error ? e.message : "Алдаа", "danger");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={card}>
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="text-[18px] font-bold text-ink">{v.session.name}</h2>
          <div className="mt-0.5 text-[13px] text-mute">
            {v.counted}/{v.total} тоолсон{v.uncounted ? ` · ${v.uncounted} тоолоогүй (өөрчлөгдөхгүй)` : ""}
            {v.session.submittedBy ? ` · илгээсэн ${v.session.submittedBy}` : ""}
            {v.session.decidedBy ? ` · шийдвэрлэсэн ${v.session.decidedBy}` : ""}
          </div>
        </div>
        <SessionChip status={v.session.status} />
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Kpi label="Дутагдал" value={money(-v.shortage)} cls="text-danger" />
        <Kpi label="Илүүдэл" value={money(v.surplus)} cls="text-ok" />
        <Kpi label="Цэвэр" value={money(v.net)} cls={v.net < 0 ? "text-danger" : "text-ink"} />
        <Kpi label="Түвшин" value={`${v.levels.ok} · ${v.levels.warn} · ${v.levels.critical}`} cls="text-ink" sub="Таарсан · Шалгах · Дахин" />
      </div>
      {review && crit.length > 0 && (
        <div className="mt-4 rounded-[14px] bg-warn-soft px-4 py-3 text-[14px] text-warn">{crit.length} бараа «Дахин тоолох» түвшинд. Дахин тоолуулах эсвэл шалтгаан бичиж батлана.</div>
      )}
      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[560px] text-[14px]">
          <thead>
            <tr className="text-left text-[12.5px] text-mute">
              <th className="py-2 pr-2 font-medium">Бараа</th>
              <th className="py-2 pr-2 text-right font-medium">Систем</th>
              <th className="py-2 pr-2 text-right font-medium">Тоолсон</th>
              <th className="py-2 pr-2 text-right font-medium">Зөрүү</th>
              <th className="py-2 pr-2 text-right font-medium">₮</th>
              <th className="py-2 font-medium">Төлөв</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--sp-sep)]">
            {v.lines.slice(0, 200).map((l) => (
              <tr key={l.productId}>
                <td className="max-w-[260px] truncate py-2 pr-2 font-medium text-ink">{l.name}</td>
                <td className="py-2 pr-2 text-right tnum text-mute">{l.counted != null ? (l.system ?? "—") : (l.expected ?? "—")}</td>
                <td className="py-2 pr-2 text-right tnum">{l.counted ?? "—"}</td>
                <td className={cx("py-2 pr-2 text-right font-semibold tnum", (l.variance ?? 0) < 0 ? "text-danger" : (l.variance ?? 0) > 0 ? "text-ok" : "text-mute")}>
                  {l.variance == null ? "—" : `${l.variance > 0 ? "+" : ""}${l.variance}`}
                </td>
                <td className="py-2 pr-2 text-right tnum text-mute">{l.value == null ? "—" : money(l.value)}</td>
                <td className="py-2">{l.level && (l.status === "counted" || l.status === "recounted") ? <LevelChip level={l.level} /> : <LineChip status={l.status} />}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {v.methods.length > 0 && <div className="mt-3 text-[12.5px] text-mute">Арга: {v.methods.map((m) => `${m.label} ${m.pct}%`).join(" · ")}</div>}
      {review && (
        <div className="mt-5 space-y-3">
          {ask && (
            <textarea value={reason} onChange={(e) => setReason(e.target.value.slice(0, 300))} rows={2} placeholder="Дахин тоолуулалгүй батлах шалтгаан" className="sp-field w-full py-2.5 text-[15px]" aria-label="Шалтгаан" />
          )}
          <div className="flex flex-wrap justify-end gap-2">
            <Btn size="md" variant="gray" disabled={busy} onClick={() => void act("reject", { reason: "" })}>
              Дахин тоолуулах
            </Btn>
            <Btn size="md" loading={busy} disabled={ask && reason.trim().length < 3} onClick={() => (crit.length && !ask ? setAsk(true) : void act("approve", ask ? { override_reason: reason.trim() } : {}))}>
              {ask ? "Шалтгаантай батлах" : "Батлах"}
            </Btn>
          </div>
        </div>
      )}
    </div>
  );
}

function Kpi({ label, value, cls, sub }: { label: string; value: string; cls: string; sub?: string }) {
  return (
    <div className="rounded-[14px] bg-stage px-3 py-2.5">
      <div className="text-[12px] text-mute">{label}</div>
      <div className={cx("text-[17px] font-bold tnum", cls)}>{value}</div>
      {sub && <div className="text-[11px] text-mute">{sub}</div>}
    </div>
  );
}

function ThresholdsCard() {
  const { data, reload } = useLive<{ thresholds: Thresholds }>("/api/v1/inventory/settings", ["inventory"]);
  const [f, setF] = useState<Record<string, string> | null>(null);
  const t = data?.thresholds;
  const v = f ?? (t ? { okPct: String(t.okPct * 100), okValue: String(t.okValue), warnPct: String(t.warnPct * 100), warnValue: String(t.warnValue) } : null);
  async function save() {
    if (!v) return;
    try {
      await aj("/api/v1/inventory/settings", { method: "PUT", json: { thresholds: { okPct: Number(v.okPct) / 100, okValue: Number(v.okValue), warnPct: Number(v.warnPct) / 100, warnValue: Number(v.warnValue) } } });
      setF(null);
      void reload();
      toast("Босго хадгалагдлаа", "ok");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Алдаа", "danger");
    }
  }
  const field = (k: string, label: string, suf: string) => (
    <label className="block">
      <span className="text-[12.5px] text-mute">{label}</span>
      <div className="mt-1 flex items-center gap-1.5">
        <input inputMode="decimal" value={v?.[k] ?? ""} onChange={(e) => setF({ ...(v ?? {}), [k]: e.target.value.replace(/[^\d.]/g, "") })} className="sp-field h-10 w-full text-[15px] tnum" />
        <span className="text-[13px] text-mute">{suf}</span>
      </div>
    </label>
  );
  return (
    <div className={card}>
      <h2 className="text-[16px] font-bold text-ink">Зөрүүний босго</h2>
      <p className="mt-0.5 text-[13px] text-mute">±1 ширхэг үргэлж «Таарсан». Үүнээс их бол хувь ба ₮-өөр.</p>
      {v && (
        <div className="mt-3 grid grid-cols-2 gap-3">
          {field("okPct", "Таарсан ≤", "%")}
          {field("okValue", "ба ≤", "₮")}
          {field("warnPct", "Шалгах ≤", "%")}
          {field("warnValue", "ба ≤", "₮")}
        </div>
      )}
      {f && (
        <Btn size="md" block className="mt-3" onClick={() => void save()}>
          Хадгалах
        </Btn>
      )}
    </div>
  );
}

function ReorderCard() {
  const { data, error } = useLive<Reorder>("/api/v1/inventory/reorder?limit=12", ["inventory", "sp"]);
  return (
    <div className={card}>
      <h2 className="text-[16px] font-bold text-ink">Захиалах санал</h2>
      <p className="mt-0.5 text-[13px] text-mute">Сүүлийн 14 хоногийн борлуулалт + үлдэгдэл (3 хоногийн нийлүүлэлт)</p>
      {error && <div className="mt-2 text-[13px] text-danger">{error}</div>}
      {data && !data.items.length && <div className="mt-3 text-[14px] text-mute">Одоогоор захиалах бараа алга.</div>}
      {data && data.items.length > 0 && (
        <ul className="mt-2 divide-y divide-[var(--sp-sep)]">
          {data.items.map((x) => (
            <li key={x.productId} className="flex items-center gap-2 py-2">
              <div className="min-w-0 flex-1">
                <div className="truncate text-[14px] font-semibold text-ink">{x.name}</div>
                <div className="text-[12px] text-mute tnum">
                  Үлдэгдэл {x.qty} · өдөрт {x.velocity}
                  {x.daysCover != null ? ` · ${x.daysCover} хоног хүрнэ` : ""}
                </div>
              </div>
              <span className="rounded-full bg-accent-soft px-2.5 py-1 text-[13px] font-bold text-accent tnum">+{x.suggest}</span>
            </li>
          ))}
        </ul>
      )}
      {data && data.estimatedCost > 0 && <div className="mt-2 text-[12.5px] text-mute">Өртгөөр ойролцоогоор {money(data.estimatedCost)}</div>}
    </div>
  );
}

function GapsCard() {
  const { data } = useLive<Gaps>("/api/v1/inventory/gaps", ["inventory"]);
  return (
    <div className={card}>
      <h2 className="text-[16px] font-bold text-ink">Тавиурын цоорхой</h2>
      <p className="mt-0.5 text-[13px] text-mute">Тавиурын зургаас: хоосон зай, тавиурт алга ч агуулахад байгаа бараа</p>
      {!data?.session || !data.photos ? (
        <div className="mt-3 flex items-center gap-2 text-[14px] text-mute">
          <Icon name="info" size={16} /> Тавиурын зураг авсан тооллого алга.
        </div>
      ) : (
        <div className="mt-2 space-y-2 text-[14px]">
          <div className="text-[12.5px] text-mute">
            {data.session.name} · {data.photos} зураг
          </div>
          {data.missing.length > 0 && (
            <div>
              <div className="font-semibold text-ink">Агуулахаас гаргах</div>
              <ul className="mt-1 space-y-0.5 text-mute">
                {data.missing.slice(0, 10).map((m) => (
                  <li key={m.productId}>
                    {m.name} <span className="tnum">({m.stock})</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {data.gaps.length > 0 && (
            <div>
              <div className="font-semibold text-ink">Хоосон зай</div>
              <ul className="mt-1 space-y-0.5 text-mute">
                {data.gaps.slice(0, 10).map((g, i) => (
                  <li key={i}>{g.nearLabel || "Тодорхойгүй"}{g.priceTagText ? ` · ${g.priceTagText}` : ""}</li>
                ))}
              </ul>
            </div>
          )}
          {!data.missing.length && !data.gaps.length && <div className="text-mute">Цоорхой илрээгүй.</div>}
        </div>
      )}
    </div>
  );
}
