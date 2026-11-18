"use client";

/*
 * «Өгөгдөл ба нууцлал» (docs/ARCHITECTURE.md §4B.5): холболтын горим (Live/Sync), юу хадгалагдаж буй (ангилал тус бүрийн тоо),
 * хадгалах хугацаа (богиносгох), шифрлэлт, гуравдагч боловсруулагч, хандалтын түүх (агуулгагүй), экспорт, бүгдийг устгах.
 */
import { useState } from "react";
import { Icon } from "@/components/sp/icons";
import { Badge, Btn, cx, Switch, toast } from "@/components/sp/ui";
import { aj, useLive } from "./client";

type Retention = { transcriptsDays: number; contactsDays: number; actionsDays: number; photos: "on_approve" | number };
type PrivacyData = {
  tenant: { name: string; posKind: string; partner: { name: string | null } | null; termsAcceptedAt: string | null };
  mode: "live" | "sync" | "gepos";
  catalogCopied: boolean;
  encryption: { perTenantKey: boolean; algorithm: string; kek: string };
  stored: { table: string; label: string; count: number }[];
  retention: Retention;
  exportToPartner: boolean;
  processors: { name: string; role: string; via: string }[];
  activeSessions: { via: string | null; count: number }[];
  accessLog: { id: number; at: string; actor_kind: string; actor_id: string | null; action: string; resource: string | null; count: number | null }[];
};

const MODE: Record<PrivacyData["mode"], { title: string; body: string; tone: "ok" | "warn" | "accent" }> = {
  live: { title: "Live — хадгалахгүй", body: "Бараа, үнэ, үлдэгдэл, борлуулалтыг таны кассын системээс асуулт бүрт шууд уншина. Gerege-д хуулбар, кэш, лог үүсэхгүй.", tone: "ok" },
  sync: { title: "Sync — каталогийн хуулбар Gerege-д хадгалагдаж байна", body: "Кассын систем бараа, үлдэгдэл, борлуулалтаа Gerege руу түлхдэг. Хуулбар таны tenant-д тусгаарлагдсан.", tone: "warn" },
  gepos: { title: "GePOS", body: "Gerege-ийн өөрийн ПОС — өгөгдөл таны tenant-д тусгаарлагдсан.", tone: "accent" },
};
const ACTION: Record<string, string> = {
  "session.embed": "Түншийн ПОС-оос нэвтэрсэн",
  "connector.fetch": "Кассын системээс уншсан",
  "connector.write": "Кассын системд бичсэн",
  export: "Экспорт",
  delete: "Устгалт",
  "key.issue": "Түлхүүр гаргасан",
  "retention.purge": "Хугацаа дууссан мөр цэвэрлэсэн",
  "retention.set": "Хадгалах хугацаа өөрчилсөн",
  "terms.accept": "Нөхцөл зөвшөөрсөн",
  "consent.export.grant": "Түншид экспорт зөвшөөрсөн",
  "consent.export.revoke": "Түншийн экспортын зөвшөөрөл цуцалсан",
};
const ACTOR: Record<string, string> = { session: "Ажилтан", api_key: "API түлхүүр", visitor: "Харилцагч", webhook: "Webhook", system: "Систем", partner: "Түнш", partner_user: "Түншийн хэрэглэгч" };

function Card({ title, children, right }: { title: string; children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <section className="rounded-[20px] bg-paper p-5 shadow-[0_0_0_0.5px_var(--sp-sep)]">
      <div className="mb-3 flex items-center gap-2">
        <div className="text-[16px] font-bold">{title}</div>
        <div className="ml-auto">{right}</div>
      </div>
      {children}
    </section>
  );
}

export function Privacy({ role, head }: { role: string; head?: React.ReactNode }) {
  const { data, reload, error } = useLive<PrivacyData>("/api/v1/privacy", []);
  const [ret, setRet] = useState<Retention | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const owner = role === "owner";
  if (error) return <div className="px-4 py-6 text-[14px] text-mute md:px-8">{error}</div>;
  if (!data) return <div className="px-4 py-6 text-[14px] text-mute md:px-8">Ачаалж байна…</div>;
  const r = ret ?? data.retention;
  const m = MODE[data.mode];

  const run = async (k: string, f: () => Promise<void>) => {
    setBusy(k);
    try {
      await f();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Алдаа", "danger");
    }
    setBusy(null);
  };
  const saveRetention = () =>
    run("ret", async () => {
      await aj("/api/v1/privacy/retention", { method: "PUT", json: { transcriptsDays: r.transcriptsDays, contactsDays: r.contactsDays, actionsDays: r.actionsDays } });
      setRet(null);
      toast("Хадгалах хугацаа хадгалагдлаа", "ok");
      await reload();
    });
  const doExport = () =>
    run("exp", async () => {
      const j = await aj<{ url: string; rows: number }>("/api/v1/privacy/export", { method: "POST" });
      const a = document.createElement("a");
      a.href = j.url;
      a.download = "";
      document.body.appendChild(a);
      a.click();
      a.remove();
      toast(`Экспорт бэлэн · ${j.rows.toLocaleString("en-US")} мөр`, "ok");
      await reload();
    });
  const consent = (v: boolean) =>
    run("consent", async () => {
      await aj("/api/v1/privacy/consent", { method: "PUT", json: { exportToPartner: v } });
      await reload();
    });
  const eraseAll = () =>
    run("del", async () => {
      const name = prompt(`Бүх өгөгдлийг БҮРМӨСӨН устгана (буцаах боломжгүй).\nБаталгаажуулахын тулд дэлгүүрийн нэрийг яг бичнэ үү:\n\n${data.tenant.name}`);
      if (name === null) return;
      await aj("/api/v1/privacy/delete", { method: "POST", json: { confirm: name } });
      toast("Өгөгдөл устгагдлаа", "ok");
      setTimeout(() => location.reload(), 800);
    });
  const num = (k: keyof Omit<Retention, "photos">, label: string, max: number) => (
    <label className="flex items-center justify-between gap-3 border-t border-[var(--sp-sep)] py-2 text-[14px] first:border-0">
      <span>{label}</span>
      <span className="flex items-center gap-2">
        <input
          type="number"
          min={1}
          max={max}
          value={r[k]}
          disabled={!owner && role !== "manager"}
          onChange={(e) => setRet({ ...r, [k]: Math.max(1, Math.min(max, Number(e.target.value) || 1)) })}
          className="w-20 rounded-[10px] bg-[var(--sp-fill)] px-2 py-1 text-right tnum outline-none"
          aria-label={label}
        />
        <span className="text-mute">хоног</span>
      </span>
    </label>
  );
  const shown = data.stored.filter((s) => s.count > 0 || ["conversations", "messages", "contacts", "kb_docs", "c_products"].includes(s.table));

  return (
    <div>
      {head}
      <div className="mx-auto max-w-[1100px] space-y-4 px-4 pb-12 md:px-8">
        <section className={cx("flex items-start gap-3 rounded-[20px] p-5", m.tone === "ok" ? "bg-ok-soft" : m.tone === "warn" ? "bg-warn-soft" : "bg-accent-soft")}>
          <Icon name={m.tone === "warn" ? "warn" : "lock"} size={24} />
          <div className="min-w-0">
            <div className="text-[16px] font-bold">Холболтын горим: {m.title}</div>
            <p className="mt-0.5 text-[13.5px]">{m.body}</p>
            {data.tenant.partner && <p className="mt-1 text-[13px] opacity-80">Кассын систем: {data.tenant.partner.name} · Gerege нь зөвхөн таны зааврын дагуу боловсруулагч.</p>}
          </div>
        </section>

        <div className="grid gap-4 lg:grid-cols-2">
          <Card title="Юу хадгалагдаж байна" right={<Badge tone={data.encryption.perTenantKey ? "ok" : "gray"} icon="lock">{data.encryption.perTenantKey ? "Таны түлхүүрээр шифрлэгдсэн" : "Түлхүүр үүсээгүй"}</Badge>}>
            <div className="text-[13px] text-mute">Яриа, харилцагчийн карт, мэдлэгийн сан, тооллогын зураг — {data.encryption.algorithm}, tenant бүрт тусдаа түлхүүр ({data.encryption.kek}).</div>
            <div className="mt-2">
              {shown.map((s) => (
                <div key={s.table} className="flex justify-between border-t border-[var(--sp-sep)] py-1.5 text-[14px] first:border-0">
                  <span>{s.label}</span>
                  <span className="tnum text-mute">{s.count.toLocaleString("en-US")}</span>
                </div>
              ))}
            </div>
          </Card>

          <Card title="Хадгалах хугацаа" right={ret && <Btn size="sm" loading={busy === "ret"} onClick={() => void saveRetention()}>Хадгалах</Btn>}>
            <div className="mb-1 text-[13px] text-mute">Хугацаа хэтэрсэн мөрийг цаг тутам устгана. Зөвхөн богиносгож болно (түншийн бодлогоос урт болохгүй).</div>
            {num("transcriptsDays", "Ярианы бичлэг", 3650)}
            {num("contactsDays", "Харилцагчийн карт", 3650)}
            {num("actionsDays", "AI-ийн үйлдлийн аудит", 3650)}
            <div className="flex justify-between border-t border-[var(--sp-sep)] py-2 text-[14px]">
              <span>Тооллогын зураг</span>
              <span className="text-mute">{r.photos === "on_approve" ? "Тооллого батлагдмагц" : `${r.photos} хоног`}</span>
            </div>
          </Card>
        </div>

        <Card title="Гуравдагч боловсруулагчид">
          {data.processors.map((p) => (
            <div key={p.name} className="border-t border-[var(--sp-sep)] py-2 text-[14px] first:border-0">
              <div className="font-semibold">{p.name}</div>
              <div className="text-[13px] text-mute">
                {p.role} · {p.via}
              </div>
            </div>
          ))}
          <div className="mt-2 text-[12.5px] text-mute">Таны өгөгдлөөр аналитик, жишиг үнэлгээ, загвар сургалт хийхгүй; бусад дэлгүүрт ашиглахгүй.</div>
        </Card>

        <Card title="Хандалтын түүх" right={<span className="text-[12.5px] text-mute">Сүүлийн {data.accessLog.length} · агуулгагүй</span>}>
          {!data.accessLog.length && <div className="text-[13.5px] text-mute">Бүртгэл алга</div>}
          {data.accessLog.length > 0 && (
            <div className="max-h-[320px] overflow-y-auto">
              <table className="w-full text-[13.5px]">
                <thead>
                  <tr className="text-left text-[12px] text-mute">
                    <th className="py-1.5 pr-3 font-medium">Хэзээ</th>
                    <th className="py-1.5 pr-3 font-medium">Хэн</th>
                    <th className="py-1.5 pr-3 font-medium">Үйлдэл</th>
                    <th className="py-1.5 text-right font-medium">Тоо</th>
                  </tr>
                </thead>
                <tbody>
                  {data.accessLog.map((a) => (
                    <tr key={a.id} className="border-t border-[var(--sp-sep)]">
                      <td className="py-1.5 pr-3 text-mute tnum">{new Date(a.at).toLocaleString("mn-MN", { dateStyle: "short", timeStyle: "short" })}</td>
                      <td className="py-1.5 pr-3">{ACTOR[a.actor_kind] ?? a.actor_kind}</td>
                      <td className="py-1.5 pr-3">
                        {ACTION[a.action] ?? a.action}
                        {a.resource ? <span className="text-mute"> · {a.resource}</span> : null}
                      </td>
                      <td className="py-1.5 text-right tnum">{a.count ?? ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card title="Экспорт ба устгалт">
          <div className="flex flex-wrap items-center gap-3">
            <Btn size="md" variant="tinted" icon="download" loading={busy === "exp"} disabled={!owner} onClick={() => void doExport()}>
              Бүх өгөгдлөө татах (JSON)
            </Btn>
            <span className="text-[12.5px] text-mute">{owner ? "Нэг удаагийн холбоос, 15 минут" : "Зөвхөн эзэмшигч"}</span>
          </div>
          {data.tenant.partner && (
            <div className="mt-3 flex items-center justify-between gap-3 border-t border-[var(--sp-sep)] pt-3 text-[14px]">
              <span>{data.tenant.partner.name ?? "Түнш"}-д экспорт хийхийг зөвшөөрөх (бүртгэгдэнэ)</span>
              <Switch checked={data.exportToPartner} disabled={!owner || busy === "consent"} onChange={(v) => void consent(v)} label={`${data.tenant.partner.name ?? "Түнш"}-д экспорт хийхийг зөвшөөрөх`} />
            </div>
          )}
          <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-[var(--sp-sep)] pt-3">
            <Btn size="md" variant="dangerTinted" icon="trash" loading={busy === "del"} disabled={!owner} onClick={() => void eraseAll()}>
              Бүх өгөгдлийг устгах
            </Btn>
            <span className="text-[12.5px] text-mute">Шифрлэх түлхүүрийг устгана — нөөц хуулбар дахь шифр текст ч уншигдахгүй. Санхүүгийн бүртгэл нэргүйжүүлж үлдэнэ.</span>
          </div>
        </Card>
      </div>
    </div>
  );
}
