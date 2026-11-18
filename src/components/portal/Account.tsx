"use client";

/* Миний бүртгэл (7.1 №18–20, BR02) — мэдээлэл, багц, ажилтан */

import { useEffect, useState } from "react";
import { Icon } from "@/components/sp/icons";
import { Badge, Btn, cx, Field, Notice, Segmented, toast, useConfirm } from "@/components/sp/ui";
import { fmtPhone, MODULE_LABEL, PLAN_LABEL, PLAN_MODULES, staffName } from "@/lib/sp/logic";
import { addRole, setPlan, SpError, uid, updateMerchant, upsertStaff } from "@/lib/sp/store";
import { normReg, validReg } from "@/lib/sp/eid";
import type { Module, Plan, Role, Staff } from "@/lib/sp/types";
import { ACTIVITY_LABEL, DEFAULT_TAX, modeOf, PRODUCER_LABEL } from "@/lib/sp/tax";
import { Card, Check, Dialog, Drawer, KV, Page, SectionTitle, Table, usePortal } from "./kit";

type Tab = "info" | "plan" | "staff";

export default function Account() {
  const { sub, go, s } = usePortal();
  const tab: Tab = sub === "plan" || sub === "staff" ? sub : "info";
  return (
    <Page
      title="Миний бүртгэл"
      sub={`${s.merchant.name} · ${s.merchant.kind === "org" ? "Байгууллага" : "Хувь хүн"}`}
      tabs={
        <Segmented
          className="w-full max-w-[420px]"
          value={tab}
          onChange={(t) => go("account", t === "info" ? undefined : t)}
          options={[
            { id: "info", label: s.merchant.kind === "org" ? "Байгууллага" : "Хувийн мэдээлэл" },
            { id: "plan", label: "Багц" },
            { id: "staff", label: "Ажилтан" },
          ]}
        />
      }
    >
      {tab === "info" ? <Info /> : tab === "plan" ? <Plans /> : <StaffTab />}
    </Page>
  );
}

/* ───────── мэдээлэл ───────── */

function Info() {
  const { s, actor } = usePortal();
  const m = s.merchant;
  const [phone, setPhone] = useState(m.phone);
  const [email, setEmail] = useState(m.email);
  const kyc = Object.entries(m.kyc).filter(([k]) => !k.startsWith("_"));
  const consent = m.kyc._consentAt ? `${m.kyc._consentVersion ?? ""} · ${m.kyc._consentAt}` : null;
  const dirty = phone !== m.phone || email !== m.email;
  const phoneErr = phone.replace(/\D/g, "").length !== 8 ? "8 оронтой дугаар" : null;
  const emailErr = email && !/^\S+@\S+\.\S+$/.test(email) ? "Имэйл буруу байна" : null;

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
      <Card
        title={
          <span className="flex items-center gap-2">
            {m.kind === "org" ? "Байгууллагын KYC" : "Хувийн KYC"} <Badge icon="lock">eID-ээс</Badge>
          </span>
        }
      >
        <KV rows={kyc.map(([k, v]) => [k, v])} />
        <p className="mt-3 text-[13px] leading-snug text-mute">KYC мэдээллийг eID-ээс татсан тул засах боломжгүй. Өөрчлөгдсөн бол eID-ээр дахин баталгаажуулна.</p>
        {consent && <p className="mt-1 text-[13px] text-mute">Мэдээлэл боловсруулах зөвшөөрөл: {consent}</p>}
      </Card>
      <TaxCard />
      <div className="flex flex-col gap-4">
        <Card title="Холбоо барих">
          <div className="space-y-4">
            <Field label="Утасны дугаар" error={phoneErr}>
              <input className="sp-field tnum" inputMode="numeric" value={phone} onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 8))} />
            </Field>
            <Field label="Имэйл" error={emailErr}>
              <input className="sp-field" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </Field>
            <div className="flex justify-end">
              <Btn
                size="md"
                disabled={!dirty || !!phoneErr || !!emailErr}
                onClick={() => {
                  updateMerchant(actor, { phone, email });
                  toast("Хадгаллаа", "ok");
                }}
              >
                Хадгалах
              </Btn>
            </div>
          </div>
        </Card>
        <Card title="Нэвтрэлт">
          <KV rows={[["Арга", "Зөвхөн eID"], ["Эзэмшигчийн РД", m.ownerRegNo ?? (m.kind === "person" ? m.regNo : "—")]]} />
          <p className="mt-3 text-[13px] leading-snug text-mute">Нууц үг, PIN хэрэггүй — eID аппаараа баталгаажуулж нэвтэрнэ. Ажилтнууд өөрсдийн eID-ээр нэвтэрч, зөвхөн эрхийн цэсээ харна.</p>
        </Card>
      </div>
    </div>
  );
}

/* ───────── багц ───────── */

const PLAN_INFO: Record<Plan, { tag: string; list: string[] }> = {
  basic: { tag: "Касс ба тайлан", list: ["Касс / Борлуулалт", "Бараа, нөөц", "Тайлан", "Ажилтан, эрх", "Харилцагч, SMS маркетинг"] },
  plus: { tag: "Хүргэлт ба урамшуулал", list: ["Basic-ийн бүгд", "Хүргэлт, захиалгын веб хуудас", "Урамшуулал — оноо, бараа"] },
  premium: { tag: "Бүрэн лоялти", list: ["Plus-ийн бүгд", "Apple / Google Wallet pass", "Картаар оноо цуглуулах, зарцуулах"] },
};
const ORDER: Plan[] = ["basic", "plus", "premium"];

function Plans() {
  const { s, actor } = usePortal();
  const [pick, setPick] = useState<Plan | null>(null);
  const cur = s.merchant.plan;
  const down = pick ? ORDER.indexOf(pick) < ORDER.indexOf(cur) : false;
  const lost = pick ? PLAN_MODULES[cur].filter((m) => !PLAN_MODULES[pick].includes(m)) : [];
  const gained = pick ? PLAN_MODULES[pick].filter((m) => !PLAN_MODULES[cur].includes(m)) : [];
  return (
    <>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {ORDER.map((p) => {
          const on = p === cur;
          const up = ORDER.indexOf(p) > ORDER.indexOf(cur);
          return (
            <div key={p} className={cx("flex flex-col rounded-[22px] bg-paper p-6", on ? "shadow-[0_0_0_2px_var(--accent)]" : "shadow-[0_0_0_0.5px_var(--sp-sep)]")}>
              <div className="flex items-center justify-between">
                <h3 className="text-[22px] font-bold tracking-[-0.02em] text-ink">{PLAN_LABEL[p]}</h3>
                {on && <Badge tone="accent" icon="check">Одоогийн</Badge>}
              </div>
              <p className="mt-1 text-[14px] text-mute">{PLAN_INFO[p].tag}</p>
              <ul className="mt-5 flex-1 space-y-2.5">
                {PLAN_INFO[p].list.map((x) => (
                  <li key={x} className="flex items-start gap-2 text-[14px] text-ink-2">
                    <Icon name="check" size={17} stroke={2.2} className="mt-px text-ok" />
                    {x}
                  </li>
                ))}
              </ul>
              <p className="mt-5 text-[13px] text-mute">Үнэ, төлбөрийн мөчлөг: гэрээгээр</p>
              <Btn className="mt-3" size="md" block variant={on ? "gray" : up ? "filled" : "tinted"} disabled={on} onClick={() => setPick(p)}>
                {on ? "Сонгосон" : up ? "Дээшлүүлэх" : "Бууруулах"}
              </Btn>
            </div>
          );
        })}
      </div>
      <Dialog
        open={!!pick}
        onClose={() => setPick(null)}
        title={pick ? `${PLAN_LABEL[pick]} багц` : ""}
        width={440}
        footer={
          <>
            <Btn size="md" variant="gray" onClick={() => setPick(null)}>
              Болих
            </Btn>
            <Btn
              size="md"
              variant={down ? "danger" : "filled"}
              onClick={() => {
                if (!pick) return;
                setPlan(actor, pick);
                toast(`${PLAN_LABEL[pick]} багц идэвхжлээ`, "ok");
                setPick(null);
              }}
            >
              {down ? "Бууруулах" : "Дээшлүүлэх"}
            </Btn>
          </>
        }
      >
        {down ? (
          <div className="space-y-3 text-[15px] leading-snug text-ink-2">
            <p>Дараах цэс түгжигдэнэ: {lost.map((m) => MODULE_LABEL[m]).join(", ")}.</p>
            <Notice tone="gray" icon="info">
              Урамшуулал, хүргэлтийн тохиргоо, Wallet pass устахгүй — зөвхөн идэвхгүй болж, дахин дээшлүүлэхэд сэргэнэ.
            </Notice>
          </div>
        ) : (
          <p className="text-[15px] leading-snug text-ink-2">Шинээр нээгдэх цэс: {gained.map((m) => MODULE_LABEL[m]).join(", ")}. Шууд ашиглаж эхэлнэ.</p>
        )}
      </Dialog>
    </>
  );
}

/* ───────── ажилтан ───────── */

const ALL_MODULES: Module[] = ["dashboard", "sales", "products", "delivery", "campaigns", "wallet", "crm", "marketing", "chat", "ai", "reports", "account"];

function StaffTab() {
  const { s } = usePortal();
  const [edit, setEdit] = useState<Staff | null>(null);
  const [roleDlg, setRoleDlg] = useState(false);
  const roleName = (id: string) => s.roles.find((r) => r.id === id)?.name ?? id;
  const blank = (): Staff => ({ id: uid("st"), first: "", last: "", phone: "", roleId: "cashier", pin: "", active: true });
  return (
    <>
      <div className="mb-4 flex items-center justify-between gap-3">
        <p className="text-[14px] text-mute">Ажилтан порталд eID-ээр, пос дээр PIN-ээр нэвтэрч, зөвхөн эрхийн цэсээ харна.</p>
        <Btn size="md" icon="plus" onClick={() => setEdit(blank())}>
          Ажилтан нэмэх
        </Btn>
      </div>
      <Table
        rows={[...s.staff].sort((a, b) => Number(b.active) - Number(a.active))}
        rowKey={(x) => x.id}
        onRow={setEdit}
        maxH="none"
        rowClass={(x) => !x.active && "opacity-55"}
        cols={[
          { key: "n", label: "Нэр", render: (x) => <span className="font-medium">{staffName(x)}</span> },
          { key: "p", label: "Утас", render: (x) => <span className="tnum">{fmtPhone(x.phone)}</span> },
          { key: "r", label: "Эрх", render: (x) => roleName(x.roleId) },
          { key: "id", label: "eID", render: (x) => (x.regNo ? <span className="tnum text-ink-2">{x.regNo}</span> : <span className="text-mute">—</span>) },
          { key: "s", label: "Төлөв", render: (x) => (x.active ? <Badge tone="ok">Идэвхтэй</Badge> : <Badge>Идэвхгүй</Badge>) },
        ]}
      />
      <SectionTitle action={<Btn size="sm" variant="tinted" icon="plus" onClick={() => setRoleDlg(true)}>Шинэ эрх үүсгэх</Btn>}>Эрхүүд</SectionTitle>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {s.roles.map((r) => (
          <div key={r.id} className="rounded-[16px] bg-paper p-4 shadow-[0_0_0_0.5px_var(--sp-sep)]">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[15px] font-semibold text-ink">{r.name}</span>
              <span className="text-[12px] text-mute">{s.staff.filter((x) => x.active && x.roleId === r.id).length} ажилтан</span>
            </div>
            <p className="mt-1.5 text-[13px] leading-snug text-mute">
              {r.modules.length === ALL_MODULES.length ? "Бүх цэс" : r.modules.map((m) => MODULE_LABEL[m]).join(", ")}
              {r.manage && " · буцаалт, цуцлалт"}
            </p>
          </div>
        ))}
      </div>
      <StaffDrawer staff={edit} onClose={() => setEdit(null)} onNewRole={() => setRoleDlg(true)} />
      <RoleDialog open={roleDlg} onClose={() => setRoleDlg(false)} />
    </>
  );
}

function StaffDrawer({ staff, onClose, onNewRole }: { staff: Staff | null; onClose: () => void; onNewRole: () => void }) {
  const { s, actor } = usePortal();
  const [f, setF] = useState<Staff | null>(staff);
  const [tried, setTried] = useState(false);
  const { confirm, node } = useConfirm();
  useEffect(() => {
    setF(staff);
    setTried(false);
  }, [staff]);
  const prev = staff ? s.staff.find((x) => x.id === staff.id) : undefined;
  const isNew = !!staff && !prev;
  const set = <K extends keyof Staff>(k: K, v: Staff[K]) => setF((x) => (x ? { ...x, [k]: v } : x));

  const err = f
    ? {
        first: !f.first.trim() ? "Нэр оруулна уу" : null,
        last: !f.last.trim() ? "Овог оруулна уу" : null,
        phone: f.phone.length !== 8 ? "8 оронтой дугаар" : s.staff.some((x) => x.id !== f.id && x.phone === f.phone) ? "Энэ дугаартай ажилтан байна" : null,
        email: f.email && !/^\S+@\S+\.\S+$/.test(f.email) ? "Имэйл буруу" : null,
        regNo: f.regNo && !validReg(f.regNo) ? "2 үсэг, 8 тоо. Жишээ: УБ85032114" : f.regNo && s.staff.some((x) => x.id !== f.id && normReg(x.regNo ?? "") === normReg(f.regNo!)) ? "Энэ РД өөр ажилтанд бүртгэлтэй" : null,
      }
    : null;
  const valid = err && !Object.values(err).some(Boolean);

  const commit = (st: Staff, msg: string) => {
    try {
      upsertStaff(actor, st);
      toast(msg, "ok");
      onClose();
    } catch (e) {
      toast(e instanceof SpError ? e.message : "Хадгалж чадсангүй", "danger");
    }
  };
  const save = () => {
    setTried(true);
    if (!f || !valid) return;
    let pin = f.pin;
    if (isNew) {
      // Давхцахгүй 4 оронтой анхны PIN
      do pin = String(1000 + Math.floor(Math.random() * 9000));
      while (s.staff.some((x) => x.pin === pin) || pin === s.merchant.pin);
    }
    const st = { ...f, first: f.first.trim(), last: f.last.trim(), pin, address: f.address?.trim() || undefined, email: f.email?.trim() || undefined, regNo: f.regNo ? normReg(f.regNo) : undefined };
    if (prev && prev.roleId !== st.roleId) {
      const rn = (id: string) => s.roles.find((r) => r.id === id)?.name;
      confirm({ title: "Эрх солих уу?", message: `${staffName(st)}: ${rn(prev.roleId)} → ${rn(st.roleId)}. Дараагийн нэвтрэлтээс шинэ цэс харагдана.`, ok: "Солих", run: () => commit(st, "Эрх солигдлоо") });
      return;
    }
    commit(st, isNew ? `${staffName(st)} нэмэгдлээ · анхны PIN ${pin}` : "Хадгаллаа");
  };

  return (
    <Drawer
      open={!!f}
      onClose={onClose}
      title={isNew ? "Ажилтан нэмэх" : f ? staffName(prev ?? f) : ""}
      sub={isNew ? "Шинэ ажилтан" : prev?.active ? "Идэвхтэй" : "Идэвхгүй"}
      footer={
        <>
          {!isNew && prev && (
            <Btn
              size="md"
              className="mr-auto"
              variant={prev.active ? "dangerTinted" : "tinted"}
              onClick={() =>
                prev.active
                  ? confirm({
                      title: "Ажилтныг идэвхгүй болгох уу?",
                      message: "Пос болон порталд нэвтэрч чадахгүй. Хийсэн борлуулалт нь тайланд хэвээр үлдэнэ.",
                      ok: "Идэвхгүй болгох",
                      destructive: true,
                      run: () => commit({ ...prev, active: false }, "Идэвхгүй боллоо"),
                    })
                  : commit({ ...prev, active: true }, "Идэвхжлээ")
              }
            >
              {prev.active ? "Идэвхгүй болгох" : "Идэвхжүүлэх"}
            </Btn>
          )}
          <Btn size="md" variant="gray" onClick={onClose}>
            Болих
          </Btn>
          <Btn size="md" onClick={save}>
            {isNew ? "Нэмэх" : "Хадгалах"}
          </Btn>
        </>
      }
    >
      {f && err && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Нэр *" error={tried ? err.first : null}>
              <input className="sp-field" value={f.first} onChange={(e) => set("first", e.target.value)} autoFocus={isNew} />
            </Field>
            <Field label="Овог *" error={tried ? err.last : null}>
              <input className="sp-field" value={f.last} onChange={(e) => set("last", e.target.value)} />
            </Field>
          </div>
          <Field label="Утасны дугаар *" error={tried ? err.phone : null}>
            <input className="sp-field tnum" inputMode="numeric" value={f.phone} onChange={(e) => set("phone", e.target.value.replace(/\D/g, "").slice(0, 8))} />
          </Field>
          <Field label="Хаяг">
            <input className="sp-field" value={f.address ?? ""} onChange={(e) => set("address", e.target.value)} />
          </Field>
          <Field label="Регистрийн дугаар (eID)" error={tried ? err.regNo : null} hint="Бөглөвөл ажилтан порталд, аппад өөрийн eID-ээр нэвтэрнэ.">
            <input className="sp-field uppercase" value={f.regNo ?? ""} placeholder="УБ85032114" onChange={(e) => set("regNo", e.target.value.toUpperCase().replace(/\s/g, ""))} />
          </Field>
          <Field label="Имэйл" error={tried ? err.email : null}>
            <input className="sp-field" type="email" value={f.email ?? ""} onChange={(e) => set("email", e.target.value)} />
          </Field>
          <Field label="Эрх *">
            <select
              className="sp-field"
              value={f.roleId}
              onChange={(e) => {
                if (e.target.value === "__new") onNewRole();
                else set("roleId", e.target.value);
              }}
            >
              {s.roles.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
              <option value="__new">＋ Шинэ эрх үүсгэх…</option>
            </select>
          </Field>
          <p className="px-1 text-[13px] text-mute">
            {(() => {
              const r = s.roles.find((x) => x.id === f.roleId);
              return r ? `Харах цэс: ${r.modules.map((m) => MODULE_LABEL[m]).join(", ")}` : "";
            })()}
          </p>
          {isNew ? (
            <Notice tone="gray" icon="key">
              Хадгалахад посын 4 оронтой анхны PIN үүснэ — ажилтандаа өгнө үү.
            </Notice>
          ) : (
            <KV rows={[["PIN", <span key="p" className="font-mono tracking-[0.3em] placeholder:tracking-normal">••••</span>]]} />
          )}
        </div>
      )}
      {node}
    </Drawer>
  );
}

function RoleDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { s, actor } = usePortal();
  const [name, setName] = useState("");
  const [mods, setMods] = useState<Module[]>(["sales"]);
  const [manage, setManage] = useState(false);
  useEffect(() => {
    if (open) {
      setName("");
      setMods(["sales"]);
      setManage(false);
    }
  }, [open]);
  const dup = s.roles.some((r) => r.name.trim().toLowerCase() === name.trim().toLowerCase());
  const save = () => {
    if (!name.trim() || !mods.length || dup) return;
    const role: Role = { id: uid("r"), name: name.trim(), modules: ALL_MODULES.filter((m) => mods.includes(m)), manage };
    addRole(actor, role);
    toast(`«${role.name}» эрх үүслээ`, "ok");
    onClose();
  };
  return (
    <Dialog open={open} onClose={onClose} title="Шинэ эрх үүсгэх" width={480} footer={<Btn size="md" disabled={!name.trim() || !mods.length || dup} onClick={save}>Үүсгэх</Btn>}>
      <Field label="Эрхийн нэр" error={dup ? "Ийм нэртэй эрх байна" : null}>
        <input className="sp-field" value={name} autoFocus onChange={(e) => setName(e.target.value)} placeholder="Жишээ: Агуулахын ажилтан" />
      </Field>
      <SectionTitle>Хандах цэс</SectionTitle>
      <div className="grid grid-cols-2 gap-x-4 rounded-[14px] bg-paper px-4 py-2">
        {ALL_MODULES.map((m) => (
          <Check key={m} checked={mods.includes(m)} onChange={(v) => setMods((x) => (v ? [...x, m] : x.filter((y) => y !== m)))}>
            <span className="text-[14px]">{MODULE_LABEL[m]}</span>
          </Check>
        ))}
      </div>
      <div className="mt-3 rounded-[14px] bg-paper px-4 py-2">
        <Check checked={manage} onChange={setManage}>
          <span className="text-[14px]">Буцаалт, захиалга цуцлах, хүргэлт зогсоох</span>
        </Check>
      </div>
    </Dialog>
  );
}

/* НӨАТ, НХАТ — admin.geregepos.mn дээр Gerege тохируулна, мерчант зөвхөн харна */
function TaxCard() {
  const { s } = usePortal();
  const tx = s.merchant.tax ?? DEFAULT_TAX;
  const mode = modeOf(tx);
  const yes = (v: boolean) => (v ? "Тийм" : "Үгүй");
  return (
    <Card
      title={
        <span className="flex items-center gap-2">
          Татвар <Badge icon="lock">Gerege тохируулна</Badge>
        </span>
      }
    >
      <div className="mb-3 rounded-[14px] bg-accent-soft px-4 py-3">
        <div className="text-[13px] font-semibold text-accent">Горим {mode.code} · {mode.title}</div>
        <div className="mt-0.5 text-[13px] leading-snug text-ink-2">{mode.body}</div>
      </div>
      <KV
        rows={[
          ["НӨАТ төлөгч", yes(tx.vatPayer)],
          ["НХАТ төлөгч", yes(tx.cityTaxPayer)],
          ["НӨАТ-аас чөлөөлөгдсөн төсөл", yes(tx.freeProject)],
          ["Үйл ажиллагаа", ACTIVITY_LABEL[tx.activity]],
          ["Өөрөө үйлдвэрлэдэг", tx.producer.length ? tx.producer.map((x) => PRODUCER_LABEL[x]).join(", ") : "Үгүй"],
          ["и-Баримтаас шалгасан", tx.checkedAt ? `${tx.ebarimtName ?? ""} · ${tx.checkedAt.slice(0, 16).replace("T", " ")}` : "Шалгаагүй"],
        ]}
      />
      <p className="mt-3 text-[13px] leading-snug text-mute">
        Бараа бүртгэхэд та татвар сонгохгүй. Барааны ангиллаас (архи, тамхи) болон энэ тохиргооноос систем тооцно. Өөрчлөх бол Gerege-д хандана уу.
      </p>
    </Card>
  );
}
