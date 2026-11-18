"use client";

import { useMemo, useState } from "react";
import { type Member, loyaltyOrgs, moneyPlain } from "@/lib/demo";
import { downloadCsv, useStore } from "@/lib/store";
import { IconCaret, IconExport, IconPlus, IconSearch } from "@/components/icons";
import { Chip, Empty, Field, PrimaryButton, Sheet, Stat, Td, Th, btnGhost } from "@/components/ui";
import { QrCode } from "@/components/QrCode";

type Filter = "бүгд" | "хүн" | "байгууллага";

/**
 * Урамшууллын систем.
 *
 * Хоёр төрлийн байгууллага энд байна, эдгээрийг хольж болохгүй:
 *  - **Мерчантын байгууллага** (зүүн тал): эзний хуулийн этгээд, салбар.
 *    Тус бүрт өөрийн QR үүснэ, оноо нь тусдаа хуримтлагдана.
 *  - **Гишүүн байгууллага** (хүснэгт): B2B худалдан авагч. Утасны оронд
 *    ТТД-гаар танигдана — B2B баримтад мөн энэ ТТД очно.
 */
export default function LoyaltyPage({ narrow }: { narrow: boolean }) {
  const { members, addMember } = useStore();
  const [orgId, setOrgId] = useState(loyaltyOrgs[0].id);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("бүгд");
  const [adding, setAdding] = useState(false);

  const org = loyaltyOrgs.find((item) => item.id === orgId) ?? loyaltyOrgs[0];

  const rows = useMemo(
    () =>
      members.filter((item) => {
        const byKind = filter === "бүгд" || item.kind === filter;
        const byQuery =
          query.trim() === "" ||
          item.name.toLowerCase().includes(query.trim().toLowerCase()) ||
          item.phone.includes(query.trim()) ||
          (item.tin ?? "").includes(query.trim());
        return byKind && byQuery;
      }),
    [query, filter, members],
  );

  const totalPoints = members.reduce((sum, item) => sum + item.points, 0);
  const orgMembers = members.filter((item) => item.kind === "байгууллага").length;

  const exportCsv = () =>
    downloadCsv("uramshuulal.csv", [
      ["Нэр", "Төрөл", "Утас", "ТТД", "Зэрэг", "Ирсэн", "Оноо"],
      ...members.map((item) => [
        item.name,
        item.kind,
        item.phone,
        item.tin ?? "",
        item.tier,
        item.visits,
        item.points,
      ]),
    ]);

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className={`grid gap-4 ${narrow ? "" : "grid-cols-[336px_1fr]"}`}>
        {/* Мерчантын байгууллагууд ба тэдний QR */}
        <div className="space-y-3">
          <div className="rounded-[18px] bg-paper p-4 ring-1 ring-inset ring-hair">
            <div className="flex items-center justify-between">
              <span className="meta">Миний байгууллага</span>
              <button type="button" className="meta hover:text-accent">
                Нэмэх
              </button>
            </div>

            <ul className="mt-3 space-y-1.5">
              {loyaltyOrgs.map((item) => {
                const active = item.id === org.id;
                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => setOrgId(item.id)}
                      aria-pressed={active}
                      className={`press flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left ${
                        active ? "bg-stage ring-1 ring-inset ring-line" : "hover:bg-stage/60"
                      }`}
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] font-bold text-ink">
                          {item.name}
                        </span>
                        <span className="tnum mt-0.5 block text-[11px] text-mute">
                          {item.branch} · ТТД {item.tin}
                        </span>
                      </span>
                      {!item.active && (
                        <span className="shrink-0 rounded-full bg-stage px-2 py-0.5 text-[10px] font-semibold text-mute">
                          идэвхгүй
                        </span>
                      )}
                      <span className={active ? "text-accent" : "text-mute"}>
                        <IconCaret />
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>

          <div className="rounded-[18px] bg-paper p-5 ring-1 ring-inset ring-hair">
            <span className="meta">Урамшууллын QR</span>
            <p className="mt-1 text-[13px] font-bold text-ink">{org.branch}</p>

            <div className="mt-4 flex justify-center rounded-2xl bg-stage p-5">
              <QrCode value={org.code} size={160} label="Урамшууллын QR код" />
            </div>

            <p className="tnum mt-3 break-all text-center text-[11px] text-mute">{org.code}</p>

            <div className="mt-3 flex justify-between text-[12px]">
              <span className="text-mute">Бүртгүүлсэн</span>
              <span className="tnum font-semibold text-ink">{moneyPlain(org.joined)}</span>
            </div>
            <div className="mt-1 flex justify-between text-[12px]">
              <span className="text-mute">100₮ тутамд</span>
              <span className="tnum font-semibold text-ink">{org.pointRate} оноо</span>
            </div>

            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => window.print()}
                className={`${btnGhost} flex-1 justify-center`}
              >
                Хэвлэх
              </button>
              <button
                type="button"
                onClick={() =>
                  downloadCsv(`loyalty-qr-${org.tin}.csv`, [
                    ["Байгууллага", "Салбар", "ТТД", "QR код", "Оноо/100₮"],
                    [org.name, org.branch, org.tin, org.code, org.pointRate],
                  ])
                }
                className={`${btnGhost} flex-1 justify-center`}
              >
                Татах
              </button>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div className={`grid gap-3 ${narrow ? "grid-cols-2" : "grid-cols-4"}`}>
            <Stat label="Гишүүн" value={members.length} hint="бүртгэлтэй" />
            <Stat label="Байгууллага" value={orgMembers} hint="B2B харилцагч" />
            <Stat label="Нийт оноо" value={moneyPlain(totalPoints)} tone="accent" />
            <Stat label="Салбар" value={loyaltyOrgs.length} hint="QR-тай" />
          </div>

          <div className="rounded-[18px] bg-paper p-5 ring-1 ring-inset ring-hair">
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="text-[15px] font-bold tracking-[-0.02em] text-ink">Гишүүд</h2>

              <div className="flex gap-1.5">
                {(["бүгд", "хүн", "байгууллага"] as Filter[]).map((item) => (
                  <Chip key={item} on={filter === item} onClick={() => setFilter(item)}>
                    {item === "бүгд" ? "Бүгд" : item === "хүн" ? "Хүн" : "Байгууллага"}
                  </Chip>
                ))}
              </div>

              <label className="relative ml-auto block w-full sm:w-[200px]">
                <span className="sr-only">Гишүүн хайх</span>
                <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-mute">
                  <IconSearch />
                </span>
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Нэр, утас, ТТД"
                  className="h-10 w-full rounded-xl bg-stage pl-4 pr-10 text-[13px] text-ink ring-1 ring-inset ring-transparent placeholder:text-mute focus:bg-paper focus:outline-none focus:ring-accent"
                />
              </label>
              <button type="button" onClick={exportCsv} className={btnGhost}>
                <IconExport />
                Excel
              </button>
              <button
                type="button"
                onClick={() => setAdding(true)}
                className="press flex h-10 items-center gap-2 rounded-xl bg-accent px-4 text-[13px] font-bold text-[color:var(--accent-ink)]"
              >
                <IconPlus />
                Гишүүн нэмэх
              </button>
            </div>

            <div className="mt-4">
              {rows.length === 0 ? (
                <Empty text="Гишүүн олдсонгүй" />
              ) : narrow ? (
                <ul className="divide-y divide-hair">
                  {rows.map((item) => (
                    <li key={item.id} className="flex items-center gap-3 py-3">
                      <KindMark kind={item.kind} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[14px] font-bold text-ink">
                          {item.name}
                        </span>
                        <span className="tnum mt-0.5 block text-[12px] text-mute">
                          {item.kind === "байгууллага" ? `ТТД ${item.tin}` : item.phone} ·{" "}
                          {item.visits} удаа
                        </span>
                      </span>
                      <span className="flex flex-col items-end gap-1">
                        <span className="tnum block text-[14px] font-bold text-ink">
                          {moneyPlain(item.points)} <span className="font-medium text-mute">оноо</span>
                        </span>
                        <TierBadge tier={item.tier} />
                      </span>
                      <CornerLink code={item.code} />
                    </li>
                  ))}
                </ul>
              ) : (
                <table className="w-full border-separate border-spacing-0">
                  <thead>
                    <tr>
                      <Th>Нэр</Th>
                      <Th>Төрөл</Th>
                      <Th>Утас / ТТД</Th>
                      <Th>Зэрэг</Th>
                      <Th align="right">Ирсэн</Th>
                      <Th align="right">Оноо</Th>
                      <Th align="right">Булан</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((item) => (
                      <tr key={item.id} className="row">
                        <Td>
                          <span className="flex items-center gap-2.5">
                            <KindMark kind={item.kind} />
                            <span className="font-bold text-ink">{item.name}</span>
                          </span>
                        </Td>
                        <Td className="text-mute">{item.kind}</Td>
                        <Td className="tnum text-mute">
                          {item.kind === "байгууллага" ? item.tin : item.phone}
                        </Td>
                        <Td>
                          <TierBadge tier={item.tier} />
                        </Td>
                        <Td align="right" className="tnum text-mute">
                          {item.visits}
                        </Td>
                        <Td align="right" className="tnum font-bold text-ink">
                          {moneyPlain(item.points)}
                        </Td>
                        <Td align="right">
                          <CornerLink code={item.code} />
                        </Td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      </div>

      {adding && <AddMember onClose={() => setAdding(false)} onSave={addMember} />}
    </div>
  );
}

/** Гишүүний «Хэрэглэгчийн булан»-г шинэ табд нээх — үйлчлүүлэгч юу харахыг шалгах */
function CornerLink({ code }: { code: string }) {
  return (
    <a
      href={`/app?code=${encodeURIComponent(code)}`}
      target="_blank"
      rel="noopener noreferrer"
      title="Хэрэглэгчийн булан"
      className="press inline-flex h-8 items-center rounded-lg px-2.5 text-[12px] font-semibold text-mute ring-1 ring-inset ring-hair hover:text-ink hover:ring-line"
    >
      Булан ↗
    </a>
  );
}

/** Хүн дугуй, байгууллага дөрвөлжин — хүснэгтэд харцаар ялгана */
function KindMark({ kind }: { kind: Member["kind"] }) {
  const org = kind === "байгууллага";
  return (
    <span
      className={`grid size-7 shrink-0 place-items-center text-[10px] font-bold ${
        org ? "rounded-md bg-ink text-paper" : "rounded-full bg-stage text-ink-2"
      }`}
      title={kind}
    >
      {org ? "ББ" : "Х"}
    </span>
  );
}

function AddMember({
  onClose,
  onSave,
}: {
  onClose: () => void;
  onSave: (member: Omit<Member, "id">) => void;
}) {
  const [kind, setKind] = useState<Member["kind"]>("хүн");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [tin, setTin] = useState("");
  const [points, setPoints] = useState("0");

  const valid =
    name.trim() !== "" && (kind === "хүн" ? phone.trim() !== "" : tin.trim().length >= 7);

  return (
    <Sheet
      title="Гишүүн нэмэх"
      onClose={onClose}
      footer={
        <PrimaryButton
          disabled={!valid}
          arrow={false}
          onClick={() => {
            onSave({
              name: name.trim(),
              kind,
              phone: phone.trim() || "—",
              tin: kind === "байгууллага" ? tin.trim() : undefined,
              points: Number(points || 0),
              tier: "Энгийн",
              visits: 0,
              // Хувь хүн утсаараа, байгууллага ТТД-гаараа танигдана
              code:
                "GRG-" +
                (kind === "байгууллага" ? tin.trim() : phone.trim().replace(/[^0-9]/g, "")),
            });
            onClose();
          }}
        >
          Нэмэх
        </PrimaryButton>
      }
    >
      <div>
        <span className="meta mb-1.5 block">Төрөл</span>
        <div className="grid grid-cols-2 gap-2">
          {(["хүн", "байгууллага"] as Member["kind"][]).map((item) => (
            <Chip
              key={item}
              on={kind === item}
              onClick={() => setKind(item)}
              large
              className="w-full justify-center"
            >
              {item === "хүн" ? "Хувь хүн" : "Байгууллага"}
            </Chip>
          ))}
        </div>
      </div>

      <Field
        label={kind === "хүн" ? "Нэр" : "Байгууллагын нэр"}
        value={name}
        onChange={setName}
        placeholder={kind === "хүн" ? "Б. Болд" : "Эрдэнэ сүлжээ ХХК"}
      />

      {kind === "байгууллага" && (
        <Field label="ТТД" value={tin} onChange={setTin} numeric placeholder="2845119" />
      )}

      <Field label="Утас" value={phone} onChange={setPhone} placeholder="9911-2233" />
      <Field label="Эхлэх оноо" value={points} onChange={setPoints} numeric />

      <p className="text-[12px] leading-[16px] text-mute">
        {kind === "байгууллага"
          ? "Байгууллагын ТТД нь B2B баримт үүсгэхэд мөн ашиглагдана — кассчин дахин шивэх шаардлагагүй."
          : "Шинэ гишүүн «Энгийн» зэрэгтэй эхэлнэ. Худалдан авалт бүрт 100₮ тутамд оноо нэмэгдэнэ."}
      </p>
    </Sheet>
  );
}

function TierBadge({ tier }: { tier: Member["tier"] }) {
  /* Алтан зэрэг нь бэх — хүснэгтэд 5 алтан гишүүн байхад 5 улбар шар
     тэмдэг гарч, «Гишүүн нэмэх» товч алга болдог байв. */
  const style =
    tier === "Алтан"
      ? "bg-ink text-paper ring-transparent"
      : tier === "Мөнгөн"
        ? "bg-stage text-ink-2 ring-hair"
        : "bg-stage text-mute ring-hair";
  return (
    <span className={`rounded-full px-2 py-1 text-[11px] font-semibold ring-1 ring-inset ${style}`}>
      {tier}
    </span>
  );
}
