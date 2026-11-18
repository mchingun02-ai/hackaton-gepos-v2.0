"use client";

/*
 * Түншийн ПОС-оос нээгдэх hosted onboarding (docs/ARCHITECTURE.md §4A.4): /connect?e=<get_ токен>
 *   ① Нөхцөл + өгөгдөл боловсруулах зөвшөөрөл (зөвхөн owner) ② Багц → QPay QR (sandbox-д «Sandbox төлбөр баталгаажуулах»)
 *   ③ Самбар — хэрэглээ, кассын системийн холболт (N бараа), өгөгдөл ба нууцлал. Түншийн нэр, лого, өнгөөр.
 * Токен 5 мин, нэг удаа → session cookie; дараа нь URL-аас арилгана.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Usage } from "@/components/ai/Usage";
import { Privacy } from "@/components/ai/Privacy";
import { aj, mnt } from "@/components/ai/client";
import { Icon } from "@/components/sp/icons";
import { Badge, Btn, cx, toast, Toaster } from "@/components/sp/ui";

type Brand = { partner: boolean; name: string | null; logoUrl: string | null; color: string; poweredBy: string };
type Exchange = { tenant: { name: string; status: string; posKind: string }; user: { name: string; role: "owner" | "manager" | "staff" }; view: string; brand: Brand };
type Plan = { id: string; name: string; price: number; credits: number; days: number; note: string; popular?: boolean };
type Invoice = { id: string; plan: string; amount: number; credits: number; qr_image: string | null; short_url: string | null; status: "pending" | "paid" | "cancelled" };
type BillingData = { wallet: { credits: number; plan: string | null; expires_at: number | null }; plans: Plan[]; sandbox: boolean; sandboxConfirm: boolean };
type Step = "loading" | "error" | "terms" | "plan" | "pay" | "dashboard";

const SS_KEY = "gp_connect";

export default function Connect({ token }: { token: string }) {
  const [step, setStep] = useState<Step>("loading");
  const [err, setErr] = useState("");
  const [ex, setEx] = useState<Exchange | null>(null);
  const [bill, setBill] = useState<BillingData | null>(null);
  const [inv, setInv] = useState<Invoice | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const once = useRef(false);

  const loadBilling = useCallback(async (e: Exchange) => {
    if (e.user.role === "staff") return setStep("dashboard");
    const b = await aj<BillingData>("/api/agent/billing");
    setBill(b);
    setStep(b.wallet.credits > 0 && e.view !== "billing" ? "dashboard" : "plan");
  }, []);

  useEffect(() => {
    if (once.current) return;
    once.current = true;
    (async () => {
      try {
        let e: Exchange;
        if (token) {
          e = await aj<Exchange>("/api/v1/embed/exchange", { method: "POST", json: { token } });
          sessionStorage.setItem(SS_KEY, JSON.stringify(e));
          window.history.replaceState(null, "", "/connect");
        } else {
          const saved = sessionStorage.getItem(SS_KEY);
          if (!saved) throw new Error("Холбох холбоос хүчингүй. Кассын программаасаа «AI холбох»-ыг дахин дарна уу.");
          e = JSON.parse(saved) as Exchange;
        }
        setEx(e);
        if (e.tenant.status === "pending_terms") setStep("terms");
        else await loadBilling(e);
      } catch (x) {
        setErr(x instanceof Error ? x.message : "Алдаа");
        setStep("error");
      }
    })();
  }, [token, loadBilling]);

  const run = async (k: string, f: () => Promise<void>) => {
    setBusy(k);
    try {
      await f();
    } catch (x) {
      toast(x instanceof Error ? x.message : "Алдаа", "danger");
    }
    setBusy(null);
  };

  const brand = ex?.brand;
  const style = brand ? ({ "--accent": brand.color, "--b500": brand.color, "--accent-soft": `color-mix(in oklab, ${brand.color} 10%, white)` } as React.CSSProperties) : undefined;
  const steps = [
    { id: "terms", label: "Нөхцөл" },
    { id: "plan", label: "Багц, төлбөр" },
    { id: "dashboard", label: "Бэлэн" },
  ];
  const cur = step === "pay" ? "plan" : step;
  const idx = steps.findIndex((s) => s.id === cur);

  return (
    <div className="min-h-dvh bg-stage text-ink" style={style}>
      <header className="flex items-center gap-3 border-b border-[var(--sp-sep)] bg-paper px-4 py-3 md:px-8">
        {brand?.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={brand.logoUrl} alt="" className="size-9 rounded-[10px] object-contain" />
        ) : (
          <div className="grid size-9 place-items-center rounded-[10px] bg-accent text-white">
            <Icon name="sparkle" size={20} />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="truncate text-[15px] font-bold">{brand?.name ? `${brand.name} · AI ажилтан` : "AI ажилтан"}</div>
          <div className="truncate text-[12px] text-mute">{ex ? `${ex.tenant.name} · ${ex.user.name}` : "Холбож байна…"}</div>
        </div>
        <span className="hidden text-[12px] text-mute sm:block">{brand?.poweredBy ?? "Gerege AI"}</span>
      </header>

      {step !== "error" && step !== "loading" && step !== "dashboard" && (
        <ol className="mx-auto flex max-w-[720px] items-center gap-2 px-4 pt-6 text-[13px]" aria-label="Алхам">
          {steps.map((s, i) => (
            <li key={s.id} className="flex flex-1 items-center gap-2">
              <span className={cx("grid size-7 shrink-0 place-items-center rounded-full font-bold", i < idx ? "bg-ok text-white" : i === idx ? "bg-accent text-white" : "bg-[var(--sp-fill)] text-mute")}>{i < idx ? "✓" : i + 1}</span>
              <span className={cx("truncate", i === idx ? "font-semibold" : "text-mute")}>{s.label}</span>
              {i < steps.length - 1 && <span className="h-px flex-1 bg-[var(--sp-sep)]" />}
            </li>
          ))}
        </ol>
      )}

      <main className="mx-auto max-w-[1180px] px-4 py-6 md:px-8">
        {step === "loading" && <div className="py-20 text-center text-mute">Холбож байна…</div>}
        {step === "error" && (
          <div className="mx-auto max-w-[480px] rounded-[20px] bg-paper p-6 text-center shadow-[0_0_0_0.5px_var(--sp-sep)]">
            <div className="mx-auto grid size-12 place-items-center rounded-full bg-danger-soft text-danger">
              <Icon name="warn" size={24} />
            </div>
            <div className="mt-3 text-[17px] font-bold">Холбогдож чадсангүй</div>
            <p className="mt-1 text-[14px] text-mute">{err}</p>
          </div>
        )}

        {step === "terms" && ex && (
          <section className="mx-auto max-w-[720px] rounded-[20px] bg-paper p-6 shadow-[0_0_0_0.5px_var(--sp-sep)]">
            <h1 className="text-[22px] font-bold tracking-[-0.02em]">Үйлчилгээний нөхцөл ба өгөгдөл боловсруулах зөвшөөрөл</h1>
            <ul className="mt-3 list-disc space-y-1.5 pl-5 text-[14px] leading-relaxed">
              <li>Бараа, үнэ, үлдэгдэл, борлуулалтыг таны кассын системээс асуулт бүрт шууд уншина — Gerege хуулбарлаж хадгалахгүй (Live горим).</li>
              <li>Яриа, харилцагчийн карт, мэдлэгийн сан нь таны дэлгүүрийн тусдаа түлхүүрээр шифрлэгдэж, хадгалах хугацаа дуусмагц устна.</li>
              <li>Таны өгөгдлөөр загвар сургахгүй, бусад дэлгүүрт ашиглахгүй. AI дүгнэлтэд Alibaba Cloud Model Studio (Qwen) ашиглана.</li>
              <li>Төлбөр урьдчилсан: багц авсны дараа AI ажиллана. Кредит дуусвал AI зогсож, яриа ажилтанд шилжинэ.</li>
              <li>«Өгөгдөл ба нууцлал» хэсгээс хүссэн үедээ экспортлох, бүрмөсөн устгах боломжтой.</li>
            </ul>
            {ex.user.role === "owner" ? (
              <Btn
                size="lg"
                className="mt-5"
                block
                loading={busy === "terms"}
                onClick={() =>
                  void run("terms", async () => {
                    await aj("/api/v1/onboarding/terms", { method: "POST", json: { accept: true } });
                    const e = { ...ex, tenant: { ...ex.tenant, status: "active" } };
                    setEx(e);
                    sessionStorage.setItem(SS_KEY, JSON.stringify(e));
                    await loadBilling(e);
                  })
                }
              >
                Зөвшөөрч, үргэлжлүүлэх
              </Btn>
            ) : (
              <div className="mt-5 rounded-[12px] bg-warn-soft p-3 text-[14px] text-warn">Нөхцөлийг зөвхөн дэлгүүрийн эзэмшигч зөвшөөрнө.</div>
            )}
          </section>
        )}

        {step === "plan" && bill && ex && (
          <section>
            <h1 className="text-[22px] font-bold tracking-[-0.02em]">Багц сонгох</h1>
            <p className="mt-0.5 text-[14px] text-mute">Урьдчилсан төлбөр, QPay-ээр. {bill.sandbox ? "Sandbox орчин — бодит мөнгө шилжихгүй." : ""}</p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {bill.plans.map((p) => (
                <div key={p.id} className={cx("flex flex-col rounded-[20px] bg-paper p-4 shadow-[0_0_0_0.5px_var(--sp-sep)]", p.popular && "shadow-[0_0_0_2px_var(--accent)]")}>
                  <div className="flex items-center gap-2">
                    <div className="text-[16px] font-bold">{p.name}</div>
                    {p.popular && <Badge tone="accent">Санал болгох</Badge>}
                  </div>
                  <div className="mt-2 text-[26px] font-bold tnum">{mnt(p.price)}</div>
                  <div className="text-[13px] text-mute">
                    {p.credits.toLocaleString("en-US")} кредит{p.days ? ` · ${p.days} хоног` : ""}
                  </div>
                  <p className="mt-2 flex-1 text-[13px] leading-snug">{p.note}</p>
                  <Btn
                    size="md"
                    className="mt-3"
                    variant={p.popular ? "filled" : "tinted"}
                    icon="qr"
                    disabled={ex.user.role !== "owner" && ex.user.role !== "manager"}
                    loading={busy === p.id}
                    onClick={() =>
                      void run(p.id, async () => {
                        setInv(await aj<Invoice>("/api/agent/billing", { method: "POST", json: { plan: p.id } }));
                        setStep("pay");
                      })
                    }
                  >
                    QPay-ээр авах
                  </Btn>
                </div>
              ))}
            </div>
            {bill.wallet.credits > 0 && (
              <button type="button" className="mt-4 text-[14px] font-semibold text-accent" onClick={() => setStep("dashboard")}>
                Самбар руу буцах →
              </button>
            )}
          </section>
        )}

        {step === "pay" && inv && bill && (
          <section className="mx-auto max-w-[440px] rounded-[24px] bg-paper p-6 shadow-[0_0_0_0.5px_var(--sp-sep)]">
            <div className="text-[18px] font-bold">QPay-ээр төлөх</div>
            <div className="mt-1 text-[14px] text-mute">
              {bill.plans.find((p) => p.id === inv.plan)?.name} багц · {inv.credits.toLocaleString("en-US")} кредит
            </div>
            <div className="mt-1 text-[30px] font-bold tnum">{mnt(inv.amount)}</div>
            {inv.qr_image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={`data:image/png;base64,${inv.qr_image}`} alt="QPay QR код" className="mx-auto mt-3 size-56 rounded-[12px] bg-white p-2" />
            ) : (
              <div className="mx-auto mt-3 grid size-40 place-items-center rounded-[12px] bg-[var(--sp-fill)] text-mute">
                <Icon name="qr" size={48} />
              </div>
            )}
            {bill.sandbox && <p className="mt-3 rounded-[10px] bg-warn-soft p-2 text-center text-[12.5px] text-warn">QPay sandbox — бодит мөнгө шилжихгүй.</p>}
            <div className="mt-4 grid gap-2">
              <Btn
                size="md"
                variant="tinted"
                loading={busy === "check"}
                onClick={() =>
                  void run("check", async () => {
                    const r = await aj<Invoice>(`/api/agent/billing/${inv.id}`);
                    setInv(r);
                    if (r.status === "paid") {
                      toast("Төлбөр баталгаажлаа", "ok");
                      await loadBilling(ex!);
                      setStep("dashboard");
                    } else toast("Төлбөр хараахан ороогүй байна", "ink");
                  })
                }
              >
                Төлбөр шалгах
              </Btn>
              {bill.sandboxConfirm && (
                <Btn
                  size="md"
                  loading={busy === "confirm"}
                  onClick={() =>
                    void run("confirm", async () => {
                      const r = await aj<Invoice>(`/api/agent/billing/${inv.id}`, { method: "POST" });
                      setInv(r);
                      toast(`Sandbox төлбөр баталгаажлаа · ${r.credits.toLocaleString("en-US")} кредит`, "ok");
                      await loadBilling(ex!);
                      setStep("dashboard");
                    })
                  }
                >
                  Sandbox төлбөр баталгаажуулах
                </Btn>
              )}
            </div>
          </section>
        )}

        {step === "dashboard" && ex && <Dashboard ex={ex} onBuy={() => void loadBilling({ ...ex, view: "billing" })} />}
      </main>
      <Toaster bottom={24} />
    </div>
  );
}

function Dashboard({ ex, onBuy }: { ex: Exchange; onBuy: () => void }) {
  const [tab, setTab] = useState<"usage" | "privacy">("usage");
  const [pos, setPos] = useState<{ n: number; sample: string[] } | { error: string } | null>(null);
  const canSee = ex.user.role !== "staff";
  useEffect(() => {
    if (!canSee) return;
    aj<{ items: { name: string }[] }>("/api/v1/products?limit=200")
      .then((j) => setPos({ n: j.items.length, sample: j.items.slice(0, 3).map((x) => x.name) }))
      .catch((e: unknown) => setPos({ error: e instanceof Error ? e.message : "Алдаа" }));
  }, [canSee]);
  if (!canSee) return <div className="rounded-[20px] bg-paper p-6 text-[14px] shadow-[0_0_0_0.5px_var(--sp-sep)]">AI ажилтан идэвхтэй. Тооллого, тохиргоог эзэмшигч эсвэл менежер удирдана.</div>;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="flex-1 text-[24px] font-bold tracking-[-0.02em]">Бэлэн боллоо</h1>
        <div className="flex gap-1 rounded-full bg-[var(--sp-fill)] p-1 text-[13.5px] font-semibold" role="tablist">
          {(
            [
              ["usage", "Хэрэглээ"],
              ["privacy", "Өгөгдөл ба нууцлал"],
            ] as const
          ).map(([id, label]) => (
            <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)} className={cx("rounded-full px-3 py-1.5", tab === id ? "bg-paper text-ink shadow-sm" : "text-mute")}>
              {label}
            </button>
          ))}
        </div>
        <Btn size="sm" variant="tinted" icon="wallet" onClick={onBuy}>
          Цэнэглэх
        </Btn>
      </div>
      <section className="flex flex-wrap items-center gap-3 rounded-[20px] bg-paper p-4 shadow-[0_0_0_0.5px_var(--sp-sep)]">
        <div className={cx("grid size-10 place-items-center rounded-full", pos && "n" in pos ? "bg-ok-soft text-ok" : pos ? "bg-danger-soft text-danger" : "bg-[var(--sp-fill)] text-mute")}>
          <Icon name={pos && "error" in pos ? "warn" : "link"} size={20} />
        </div>
        <div className="min-w-0 flex-1 text-[14px]">
          <div className="font-semibold">Кассын системийн холболт {ex.tenant.posKind === "live" ? "(Live — хадгалахгүй)" : ""}</div>
          <div className="truncate text-mute">
            {!pos ? "Шалгаж байна…" : "error" in pos ? pos.error : `${pos.n} бараа шууд уншигдлаа${pos.sample.length ? ` · ${pos.sample.join(", ")}…` : ""}`}
          </div>
        </div>
      </section>
      {tab === "usage" ? <Usage /> : <Privacy role={ex.user.role} />}
    </div>
  );
}
