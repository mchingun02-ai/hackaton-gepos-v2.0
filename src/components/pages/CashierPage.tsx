"use client";

import { useMemo, useState } from "react";
import {
  type Category,
  type Member,
  type Product,
  categories,
  findMember,
  formatQty,
  lineTotal,
  moneyPlain,
  unitOf,
} from "@/lib/demo";
import { useStore } from "@/lib/store";
import { isMemberToken } from "@/lib/pos-api";
import { useBarcodeScanner } from "@/lib/scanner";
import { Barcode } from "@/components/Barcode";
import { CameraScanner } from "@/components/CameraScanner";
import {
  IconAlert,
  IconBarcode,
  IconCash,
  IconGrid,
  IconList,
  IconPlus,
  IconQr,
  IconSearch,
} from "@/components/icons";
import {
  Chip,
  Empty,
  Field,
  Money,
  PriceTag,
  PrimaryButton,
  ProductImage,
  Sheet,
  Stepper,
  btnGhost,
} from "@/components/ui";

/**
 * Барааны хавтан.
 *
 * Бүхэл хавтан нь нэг товч. Яагаад гэвэл каталогийн үүрэг бол «үүнийг
 * сонго» гэсэн ГАНЦ зүйл — тоо хэмжээг өөрчлөх нь сагсны ажил, мөр
 * байхгүй байхад тэнд степпер байх учиргүй.
 *
 * Өмнө нь хавтан бүр дээр «− 0 +» байсан нь гурван алдаа дагуулсан:
 * 24 хавтан дээр утгагүй тэг, 28px-ийн жижиг онилох талбай, мөн кг
 * бараан дээр үнэ, степпер хоёр багтахгүй таслагдаж байсан.
 *
 * Одоо: сагсанд орсон бол зурган дээр тоо нь тэмдэглэгдэнэ — мэдээлэл
 * өгнө, дарагдахгүй. Хүрээ нь бэх: улбар шар тэмдэг + улбар шар хүрээ
 * хоёулаа байвал нэг хавтан хоёр accent идэж, тор «шатдаг» байв.
 */
function ProductCard({
  product,
  qty,
  onAdd,
  compact,
}: {
  product: Product;
  qty: number;
  onAdd: () => void;
  compact: boolean;
}) {
  const out = product.stock === 0;
  const inCart = qty > 0;

  return (
    <button
      type="button"
      onClick={onAdd}
      disabled={out}
      className={`tile relative flex flex-col overflow-hidden rounded-[18px] bg-paper text-left ring-inset ${
        inCart ? "ring-[1.5px] ring-ink" : "ring-1 ring-hair hover:ring-line"
      } ${out ? "opacity-50" : ""}`}
    >
      <span
        className={`plate relative block w-full rounded-none! ${compact ? "h-[96px]" : "h-[146px]"}`}
      >
        <ProductImage
          src={product.image}
          name={product.name}
          sizes={compact ? "200px" : "280px"}
          pad={compact ? "p-3" : "p-4"}
        />

        {inCart && (
          <span className="tnum absolute left-2 top-2 rounded-full bg-accent px-2 py-1 text-[11px] font-bold leading-none text-[color:var(--accent-ink)] shadow-sm">
            {formatQty(qty, product.unit)}
          </span>
        )}

        {!product.taxCoded && (
          <span
            className="absolute right-2 top-2 grid size-6 place-items-center rounded-full bg-white/90 text-warn shadow-sm"
            title="Татварын код дутуу — е-баримт үүсэхгүй"
          >
            <IconAlert />
          </span>
        )}
      </span>

      <span className={`flex flex-1 flex-col ${compact ? "p-3" : "p-4"}`}>
        <span
          className={`line-clamp-2 font-bold leading-snug tracking-[-0.02em] text-ink ${
            compact ? "text-[14px]" : "text-[15px]"
          }`}
        >
          {product.name}
        </span>

        <span className={`tnum mt-1 text-[12px] ${out ? "font-semibold text-warn" : "text-mute"}`}>
          {out ? "Дууссан" : `Үлдэгдэл ${product.stock} ${product.unit}`}
          {product.taxType === "VAT_FREE" ? " · НӨАТ-гүй" : ""}
        </span>

        {/* Модуль бүхэл 1px — бутархай пиксел зураасыг тэгш бус болгож, уншигч уншихгүй */}
        {product.barCode && <Barcode code={product.barCode} height={compact ? 22 : 28} module={1} className="mt-2" />}

        {/* Үнэ өөрийн мөрөнд — хэнтэй ч зай булаалдахгүй тул таслагдахгүй */}
        <span className="mt-auto pt-2.5">
          <PriceTag value={product.price} old={product.oldPrice} unit={product.unit} />
        </span>
      </span>
    </button>
  );
}

/**
 * Захиалгын самбар.
 *
 * Гүйлгээний дундуур кассчин хоёр л зүйл хардаг: мөр бүрийн ДҮН, нийт.
 * Тиймээс мөр бүр хоёр эгнээ — дээр нэр + мөрийн дүн, доор тоо × үнэ +
 * степпер. Нэг эгнээнд шахвал нэр таслагдаж, дүн нь алга болдог байв.
 */
export function OrderPanel({ onContinue }: { onContinue: () => void }) {
  const {
    lines,
    setQty,
    clearCart,
    subtotal,
    discountAmount,
    redeemAmount,
    serverRedeemValue,
    serverRedemption,
    earnPreview,
    activeMember,
    mode,
    total,
    vat,
    count,
  } = useStore();

  const [scanning, setScanning] = useState(false);
  const uncoded = lines.filter((line) => !line.product.taxCoded).map((line) => line.product.name);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-start justify-between px-5 pb-2 pt-5">
        <div>
          <h2 className="text-[17px] font-bold tracking-[-0.03em] text-ink">Захиалга</h2>
          <p className="tnum mt-0.5 text-[12px] text-mute">
            {count > 0 ? `${count} бараа` : "Хоосон"}
          </p>
        </div>
        {lines.length > 0 && (
          <button
            type="button"
            onClick={clearCart}
            className="press -mr-2 rounded-lg px-2 py-1.5 text-[12px] font-semibold text-mute hover:bg-stage hover:text-ink"
          >
            Цэвэрлэх
          </button>
        )}
      </div>

      <ul className="min-h-0 flex-1 divide-y divide-hair overflow-y-auto px-5">
        {lines.length === 0 && <Empty text="Бараа нэмнэ үү" />}
        {lines.map((line) => (
          <li key={line.product.id} className="flex items-start gap-3 py-3">
            <span className="plate size-11 shrink-0">
              <ProductImage
                src={line.product.image}
                name={line.product.name}
                sizes="44px"
                pad="p-1.5"
              />
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-baseline justify-between gap-3">
                <span className="flex min-w-0 items-center gap-1.5">
                  <span className="truncate text-[14px] font-bold tracking-[-0.015em] text-ink">
                    {line.product.name}
                  </span>
                  {!line.product.taxCoded && (
                    <span className="shrink-0 text-warn" title="Татварын код дутуу">
                      <IconAlert />
                    </span>
                  )}
                </span>
                <Money
                  value={lineTotal(line)}
                  className="shrink-0 text-[14px] font-bold text-ink"
                />
              </span>
              <span className="mt-1.5 flex items-center justify-between gap-2">
                <span className="tnum text-[12px] text-mute">
                  {formatQty(line.qty, line.product.unit)} × {moneyPlain(line.product.price)}₮
                </span>
                <Stepper
                  compact
                  qty={line.qty}
                  unit={line.product.unit}
                  onLess={() =>
                    setQty(line.product.id, line.qty - unitOf(line.product.unit).step)
                  }
                  onMore={() =>
                    setQty(line.product.id, line.qty + unitOf(line.product.unit).step)
                  }
                />
              </span>
            </span>
          </li>
        ))}
      </ul>

      <div className="space-y-3 border-t border-hair px-5 pb-5 pt-4">
        {uncoded.length > 0 && (
          <div className="flex gap-2 rounded-xl bg-warn-soft px-3.5 py-3 text-warn">
            <span className="mt-px shrink-0">
              <IconAlert />
            </span>
            <p className="text-[12px] leading-[17px]">
              <span className="font-semibold">Татварын код дутуу:</span> {uncoded.join(", ")} —
              е-баримт үүсэхгүй, гүйлгээ дараалалд орно.
            </p>
          </div>
        )}

        <MemberBlock onScan={() => setScanning(true)} />

        <div className="space-y-1 text-[13px]">
          <div className="flex justify-between">
            <span className="text-mute">Дүн</span>
            <Money value={subtotal} className="font-medium text-ink-2" />
          </div>
          <div className="flex justify-between">
            <span className="text-mute">Үүнээс НӨАТ</span>
            <Money value={vat} className="font-medium text-ink-2" />
          </div>
          {discountAmount > 0 && (
            <div className="flex justify-between">
              <span className="text-mute">
                Хөнгөлөлт{activeMember ? ` · ${activeMember.tier}` : ""}
              </span>
              <Money value={discountAmount} sign="−" className="font-medium text-ink-2" />
            </div>
          )}
          {redeemAmount > 0 && (
            <div className="flex justify-between">
              <span className="text-mute">Оноогоор төлсөн</span>
              <Money value={redeemAmount} sign="−" className="font-medium text-ink-2" />
            </div>
          )}
          {serverRedeemValue > 0 && (
            <div className="flex justify-between">
              <span className="text-mute">Оноогоор · {moneyPlain(serverRedemption?.points ?? 0)} оноо</span>
              <Money value={serverRedeemValue} sign="−" className="font-medium text-ink-2" />
            </div>
          )}
        </div>

        <div className="flex items-end justify-between border-t border-dashed border-line pt-3">
          <span className="meta pb-1">Нийт</span>
          <span className="hugenum text-[32px]!">
            {moneyPlain(total)}
            <span className="suffix">₮</span>
          </span>
        </div>

        {earnPreview > 0 && (
          <p className="tnum -mt-1 text-right text-[12px] text-mute">
            Энэ худалдан авалтаас{" "}
            <span className="font-semibold text-accent">+{moneyPlain(earnPreview)}</span> оноо
          </p>
        )}

        <PrimaryButton disabled={lines.length === 0} onClick={onContinue}>
          Үргэлжлүүлэх
        </PrimaryButton>
      </div>

      {scanning && (mode === "server" ? <ServerMemberSheet onClose={() => setScanning(false)} /> : <MemberSheet onClose={() => setScanning(false)} />)}
    </div>
  );
}

/**
 * Захиалгад холбогдсон урамшууллын гишүүн.
 *
 * Хоосон үед энэ нь зүгээр нэг товч — кассчин QR уншуулах эсвэл утсаар
 * хайна. Холбогдсоны дараа зэрэглэл, үлдэгдэл оноо, тэр оноогоор төлөх
 * боломж нэг дор гарч ирнэ.
 */
/**
 * Оноо зарцуулах (сервер горим): кассчин оноо оруулж хүсэлт илгээнэ → хэрэглэгч АПП ДЭЭРЭЭ зөвшөөрнө →
 * хөнгөлөлт нийт дүнд орно. QR дангаараа оноо зарцуулж чадахгүй; дүн, үлдэгдлийг сервер дахин шалгана.
 */
function ServerRedeem() {
  const { serverMember, serverRedemption, serverRedeemMax, requestServerRedemption, cancelServerRedemption } = useStore();
  const [open, setOpen] = useState(false);
  const [raw, setRaw] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!serverMember?.canRedeem || !serverMember.redeem) return null;
  const rd = serverMember.redeem;
  const points = Number(raw.replace(/\D/g, "")) || 0;

  const send = async () => {
    setBusy(true);
    setError(null);
    const err = await requestServerRedemption(points);
    setBusy(false);
    if (err) setError(err);
    else setOpen(false);
  };

  const r = serverRedemption;
  if (r?.status === "pending") {
    return (
      <div role="status" className="mt-2.5 rounded-lg bg-paper px-3 py-2.5 ring-1 ring-inset ring-hair">
        <p className="flex items-center gap-2 text-[12.5px] font-semibold text-ink">
          <span className="size-2 animate-pulse rounded-full bg-accent" />
          Хэрэглэгч апп дээрээ зөвшөөрөхийг хүлээж байна…
        </p>
        <p className="tnum mt-0.5 text-[11.5px] text-mute">
          {moneyPlain(r.points)} оноо → −{moneyPlain(r.value)}₮
        </p>
        <button type="button" className="mt-1.5 text-[12px] font-semibold text-mute hover:text-danger" onClick={cancelServerRedemption}>
          Цуцлах
        </button>
      </div>
    );
  }
  if (r?.status === "approved") {
    return (
      <div role="status" className="mt-2.5 flex items-center gap-2 rounded-lg bg-ok-soft px-3 py-2.5">
        <span className="text-[12.5px] font-bold text-ok">✓ {moneyPlain(r.points)} оноо зарцуулна · −{moneyPlain(r.value)}₮</span>
        <button type="button" className="ml-auto text-[12px] font-semibold text-ok/80 hover:text-danger" onClick={cancelServerRedemption}>
          Болих
        </button>
      </div>
    );
  }
  const ended = r && (r.status === "declined" || r.status === "expired" || r.status === "cancelled");

  if (!open) {
    return (
      <div className="mt-2.5">
        {ended && (
          <p role="alert" className="mb-1.5 text-[11.5px] font-semibold text-danger">
            {r.status === "declined" ? "Хэрэглэгч татгалзсан." : r.status === "expired" ? "Хугацаа дууссан." : "Цуцлагдсан."}
          </p>
        )}
        <button
          type="button"
          disabled={serverRedeemMax < rd.minPoints}
          onClick={() => {
            setRaw(String(serverRedeemMax));
            setOpen(true);
            setError(null);
          }}
          className="press h-9 w-full rounded-lg bg-ink text-[12.5px] font-bold text-paper disabled:opacity-40"
        >
          Оноо зарцуулах · дээд {moneyPlain(serverRedeemMax)}
        </button>
        {serverRedeemMax < rd.minPoints && <p className="mt-1 text-[11px] text-mute">Энэ сагсанд хамгийн багадаа {moneyPlain(rd.minPoints)} оноо шаардлагатай.</p>}
      </div>
    );
  }
  const invalid = points < rd.minPoints || points > serverRedeemMax;
  return (
    <div className="mt-2.5 rounded-lg bg-paper p-3 ring-1 ring-inset ring-hair">
      <label className="block">
        <span className="meta mb-1 block">Зарцуулах оноо</span>
        <input
          inputMode="numeric"
          value={raw}
          onChange={(e) => setRaw(e.target.value.replace(/\D/g, "").slice(0, 9))}
          className="tnum h-10 w-full rounded-lg bg-stage px-3 text-[15px] font-bold text-ink outline-none"
          aria-label="Зарцуулах оноо"
        />
      </label>
      <p className="tnum mt-1 text-[11.5px] text-mute">
        = −{moneyPlain(points * rd.pointValue)}₮ · {moneyPlain(rd.minPoints)}–{moneyPlain(serverRedeemMax)} оноо (сагсны {rd.maxPct}% хүртэл)
      </p>
      {error && (
        <p role="alert" className="mt-1.5 text-[11.5px] font-semibold text-danger">
          {error}
        </p>
      )}
      <div className="mt-2 flex gap-2">
        <button type="button" className="press h-9 flex-1 rounded-lg bg-ink text-[12.5px] font-bold text-paper disabled:opacity-40" disabled={busy || invalid} onClick={() => void send()}>
          {busy ? "Илгээж байна…" : "Хэрэглэгчээр зөвшөөрүүлэх"}
        </button>
        <button type="button" className="press h-9 rounded-lg px-3 text-[12.5px] font-semibold text-mute hover:text-ink" onClick={() => setOpen(false)}>
          Болих
        </button>
      </div>
    </div>
  );
}

function MemberBlock({ onScan }: { onScan: () => void }) {
  const { activeMember, detachMember, redeem, setRedeem, redeemMax, mode, serverMember, detachServerMember } = useStore();

  /* Сервер горим: гишүүнийг QR-аар танина, оноог борлуулалт хадгалагдах үед сервер олгоно.
     Хөнгөлөлт, оноо зарцуулалт хаалттай (эзэмшигчийн нэмэлт баталгаажуулалт шаардлагатай). */
  if (mode === "server") {
    if (!serverMember) {
      return (
        <button
          type="button"
          onClick={onScan}
          className="press flex h-11 w-full items-center gap-2.5 rounded-xl bg-stage px-3.5 text-[13px] font-semibold text-ink-2 hover:text-ink"
        >
          <IconQr />
          Урамшууллын гишүүн
          <span className="ml-auto text-[12px] text-mute">QR уншуулах</span>
        </button>
      );
    }
    return (
      <div className="rounded-xl bg-stage p-3.5">
        <div className="flex items-start gap-2.5">
          <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-ink text-[12px] font-bold text-paper">
            {(serverMember.name ?? "Г").slice(0, 1)}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-bold text-ink">{serverMember.name ?? "Гишүүн"}{serverMember.phone ? ` · ${serverMember.phone}` : ""}</p>
            <p className="tnum mt-0.5 text-[11.5px] text-mute">
              {serverMember.tierName} · {moneyPlain(serverMember.points)} оноо
              {serverMember.programActive && ` · +${serverMember.rateBp / 100}%`}
            </p>
            <p className="mt-1 flex flex-wrap gap-1.5">
              <span className={`rounded-md px-1.5 py-0.5 text-[10.5px] font-bold ${serverMember.via === "gerege_qr" ? "bg-ok-soft text-ok" : "bg-paper text-mute ring-1 ring-inset ring-hair"}`}>
                {serverMember.via === "gerege_qr" ? "Gerege QR" : "Картын QR"}
              </span>
              {serverMember.joined && <span className="rounded-md bg-accent-soft px-1.5 py-0.5 text-[10.5px] font-bold text-accent">Шинээр элслээ</span>}
            </p>
          </div>
          <button type="button" onClick={detachServerMember} className="press text-[12px] font-semibold text-mute hover:text-danger">
            Салгах
          </button>
        </div>
        {serverMember.promos && serverMember.promos.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5" aria-label="Идэвхтэй урамшуулал">
            {serverMember.promos.map((p) => (
              <span key={p.id} title={p.title} className="rounded-md bg-accent px-1.5 py-0.5 text-[11px] font-bold text-[color:var(--accent-ink)]">
                {p.badge}
              </span>
            ))}
          </div>
        )}
        <ServerRedeem />
        <p className="mt-2.5 border-t border-hair pt-2.5 text-[11.5px] leading-relaxed text-mute">
          {serverMember.programActive ? "Оноог гүйлгээ хадгалагдах үед сервер бодно." : "Онооны дүрэм идэвхжээгүй — оноо олгогдохгүй."}
          {serverMember.via === "card" && serverMember.redeem && " Оноо зарцуулахад хэрэглэгчийн апп дээрх Gerege QR-ыг уншуулна."}
        </p>
      </div>
    );
  }

  if (!activeMember) {
    return (
      <button
        type="button"
        onClick={onScan}
        className="press flex h-11 w-full items-center gap-2.5 rounded-xl bg-stage px-3.5 text-[13px] font-semibold text-ink-2 hover:text-ink"
      >
        <IconQr />
        Урамшууллын харилцагч
        <span className="ml-auto text-[12px] text-mute">QR уншуулах</span>
      </button>
    );
  }

  const using = Math.min(redeem, redeemMax);

  return (
    <div className="rounded-xl bg-stage p-3.5">
      <div className="flex items-start gap-2.5">
        <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-ink text-[12px] font-bold text-paper">
          {activeMember.name.slice(0, 1)}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-bold text-ink">{activeMember.name}</p>
          <p className="tnum mt-0.5 text-[11.5px] text-mute">
            {activeMember.tier} · {moneyPlain(activeMember.points)} оноо
          </p>
        </div>
        <button
          type="button"
          onClick={detachMember}
          className="press text-[12px] font-semibold text-mute hover:text-danger"
        >
          Салгах
        </button>
      </div>

      {redeemMax > 0 && (
        <div className="mt-3 border-t border-hair pt-3">
          <div className="flex items-center justify-between">
            <span className="meta">Оноогоор төлөх</span>
            <span className="tnum text-[12px] font-semibold text-ink">
              {moneyPlain(using)}₮
            </span>
          </div>
          <div className="mt-2 flex gap-1.5">
            <Chip on={using === 0} onClick={() => setRedeem(0)}>
              Үгүй
            </Chip>
            <Chip on={using === redeemMax && redeemMax > 0} onClick={() => setRedeem(redeemMax)}>
              Бүгд · {moneyPlain(redeemMax)}
            </Chip>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Барааны жагсаалтын мөр.
 *
 * 248 бараатай дэлгүүрт тор нь ажиллахаа больдог — нэг дэлгэцэнд 6
 * хавтан багтахад 40 удаа гүйлгэх хэрэгтэй болно. Жагсаалтаар нэг
 * дэлгэцэнд 10–12 бараа харагдана, нэр нь зүүн ирмэгтээ эгнэсэн тул
 * нүд доошоо гүйж уншина.
 *
 * Тор нь цөөн барааны цэгт (кафе, жижиг цэг) хэвээр хэрэгтэй тул
 * хоёуланг нь үлдээж, кассчин өөрөө сонгоно.
 */
function ProductRow({
  product,
  qty,
  onAdd,
}: {
  product: Product;
  qty: number;
  onAdd: () => void;
}) {
  const out = product.stock === 0;
  const inCart = qty > 0;
  const low = !out && product.stock <= 5;

  return (
    <button
      type="button"
      onClick={onAdd}
      disabled={out}
      className={`press flex w-full items-center gap-3 border-b border-hair px-3 py-2.5 text-left ${
        inCart ? "bg-accent-soft" : "hover:bg-stage"
      } ${out ? "opacity-50" : ""}`}
    >
      <span className="plate size-12 shrink-0 rounded-lg!">
        <ProductImage src={product.image} name={product.name} sizes="48px" pad="p-1.5" />
      </span>

      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span className="truncate text-[14px] font-bold text-ink">{product.name}</span>
          {!product.taxCoded && (
            <span className="shrink-0 text-warn">
              <IconAlert />
            </span>
          )}
        </span>
        <span
          className={`tnum mt-0.5 block text-[12px] ${
            out ? "font-semibold text-warn" : low ? "font-semibold text-accent" : "text-mute"
          }`}
        >
          {out
            ? "Дууссан"
            : low
              ? `Үлдэгдэл ${product.stock} ${product.unit}`
              : `${product.stock} ${product.unit}`}
          {product.barCode && <span className="text-mute"> · {product.barCode}</span>}
        </span>
      </span>

      <span className="tnum shrink-0 text-[14px] font-bold text-ink">
        {moneyPlain(product.price)}
        <span className="font-medium text-mute">
          ₮{product.unit !== "ш" && `/${product.unit}`}
        </span>
      </span>

      {/* Сагсанд байгаа эсэхийг нэг л тэмдэгээр хэлнэ: тоо, эсвэл нэмэх */}
      <span
        className={`grid size-9 shrink-0 place-items-center rounded-lg text-[14px] font-bold ${
          inCart
            ? "bg-accent text-[color:var(--accent-ink)]"
            : "bg-stage text-ink-2"
        }`}
      >
        {inCart ? formatQty(qty, product.unit) : <IconPlus />}
      </span>
    </button>
  );
}

/** Тор ↔ жагсаалт солих хос товч */
function ViewSwitch({
  view,
  onChange,
}: {
  view: "жагсаалт" | "тор";
  onChange: (view: "жагсаалт" | "тор") => void;
}) {
  const base = "press grid size-8 place-items-center rounded-lg transition";
  const on = "bg-ink text-paper";
  const off = "text-mute hover:text-ink";
  return (
    <span className="flex items-center gap-1">
      <button
        type="button"
        onClick={() => onChange("жагсаалт")}
        aria-label="Жагсаалтаар"
        aria-pressed={view === "жагсаалт"}
        className={`${base} ${view === "жагсаалт" ? on : off}`}
      >
        <IconList />
      </button>
      <button
        type="button"
        onClick={() => onChange("тор")}
        aria-label="Тороор"
        aria-pressed={view === "тор"}
        className={`${base} ${view === "тор" ? on : off}`}
      >
        <IconGrid />
      </button>
    </span>
  );
}

/**
 * Сервер горим: гишүүний QR (Gerege апп). Сервер ЭНЭ байгууллагын гишүүнийг шалгана —
 * өөр байгууллагын QR, хуучин код «олдсонгүй». Утсаар хайх зам сервер горимд алга
 * (QR л гишүүнийг танина; утас бол баталгаажсан identity биш).
 */
function ServerMemberSheet({ onClose }: { onClose: () => void }) {
  const { attachServerMember } = useStore();
  const [camera, setCamera] = useState(false);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (value: string) => {
    if (!isMemberToken(value)) {
      setError("Энэ нь Gerege гишүүний QR биш байна.");
      return false;
    }
    setBusy(true);
    setError(null);
    const err = await attachServerMember(value);
    setBusy(false);
    if (err) setError(err);
    else onClose();
    return !err;
  };

  return (
    <Sheet title="Урамшууллын гишүүн" onClose={onClose} footer={null}>
      <button
        type="button"
        onClick={() => setCamera(true)}
        className="press grid w-full place-items-center rounded-2xl bg-stage py-7 text-center hover:bg-hair/40"
      >
        <span className="grid size-14 place-items-center rounded-2xl bg-paper text-ink-2 ring-1 ring-inset ring-hair">
          <IconQr />
        </span>
        <span className="mt-3 text-[13px] font-semibold text-ink">Камераар QR уншуулах</span>
        <span className="mt-1 px-8 text-[11.5px] leading-relaxed text-mute">
          Үйлчлүүлэгч Gerege аппаасаа гишүүний картын QR-аа харуулна. QR зөвхөн гишүүнийг танина.
        </span>
      </button>
      {camera && (
        <CameraScanner
          title="Гишүүний QR"
          missText="Gerege гишүүний QR биш"
          onScan={(value) => {
            if (!isMemberToken(value)) return false;
            setCamera(false);
            void submit(value);
            return true;
          }}
          onClose={() => setCamera(false)}
        />
      )}
      <Field label="QR код (уншигчаар)" value={code} onChange={setCode} placeholder="gm1.…" />
      {error && (
        <p role="alert" className="rounded-xl bg-danger-soft px-3.5 py-2.5 text-[13px] font-semibold text-danger">
          {error}
        </p>
      )}
      <PrimaryButton onClick={() => void submit(code)} disabled={busy || !code.trim()} arrow={false}>
        {busy ? "Шалгаж байна…" : "Гишүүн холбох"}
      </PrimaryButton>
    </Sheet>
  );
}

/**
 * Гишүүн холбох цонх.
 *
 * Хоёр зам: үйлчлүүлэгч Gerege апп дээрх QR-аа уншуулна, эсвэл апп
 * суулгаагүй хүнийг утсаар нь хайна. Хоёр дахь зам нь заавал байх
 * ёстой — Монголд бэлэн мөнгөөр, утасгүй ирэх үйлчлүүлэгч олон.
 */
function MemberSheet({ onClose }: { onClose: () => void }) {
  const { members, attachMember } = useStore();
  const [query, setQuery] = useState("");

  const hits = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return members.slice(0, 6);
    const digits = q.replace(/[^0-9]/g, "");
    return members.filter(
      (m) =>
        m.name.toLowerCase().includes(q) ||
        m.code.toLowerCase().includes(q) ||
        (digits.length >= 3 && m.phone.replace(/[^0-9]/g, "").includes(digits)) ||
        (digits.length >= 3 && (m.tin ?? "").includes(digits)),
    );
  }, [members, query]);

  const [camera, setCamera] = useState(false);

  const pick = (member: Member) => {
    attachMember(member);
    onClose();
  };

  /* Gerege аппын QR нь гишүүний код (GRG-…) агуулна. Олдвол шууд холбоно. */
  const onQr = (code: string) => {
    const member = findMember(members, code);
    if (!member) return false;
    pick(member);
    return true;
  };

  return (
    <Sheet title="Урамшууллын харилцагч" onClose={onClose} footer={null}>
      {/* QR унших талбай — дарахад камер нээгдэнэ */}
      <button
        type="button"
        onClick={() => setCamera(true)}
        className="press grid w-full place-items-center rounded-2xl bg-stage py-7 text-center hover:bg-hair/40"
      >
        <span className="grid size-14 place-items-center rounded-2xl bg-paper text-ink-2 ring-1 ring-inset ring-hair">
          <IconQr />
        </span>
        <span className="mt-3 text-[13px] font-semibold text-ink">Камераар QR уншуулах</span>
        <span className="mt-1 px-8 text-[11.5px] leading-relaxed text-mute">
          Үйлчлүүлэгч Gerege аппаасаа QR-аа харуулна. Камергүй бол доороос утас, нэр,
          ТТД-аар хайж сонгоно.
        </span>
      </button>
      {camera && <CameraScanner title="Харилцагчийн QR" missText="Бүртгэлгүй гишүүн" onScan={onQr} onClose={() => setCamera(false)} />}

      <Field
        label="Утас, нэр эсвэл ТТД"
        value={query}
        onChange={setQuery}
        placeholder="9911-0022"
      />

      <div className="space-y-1.5">
        {hits.length === 0 ? (
          <Empty text="Харилцагч олдсонгүй" />
        ) : (
          hits.map((member) => (
            <button
              key={member.id}
              type="button"
              onClick={() => pick(member)}
              className="press flex w-full items-center gap-3 rounded-xl bg-stage p-3 text-left hover:bg-hair/40"
            >
              <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-ink text-[12px] font-bold text-paper">
                {member.name.slice(0, 1)}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13.5px] font-bold text-ink">
                  {member.name}
                </span>
                <span className="tnum block text-[11.5px] text-mute">
                  {member.kind === "байгууллага" ? `ТТД ${member.tin}` : member.phone} ·{" "}
                  {member.tier}
                </span>
              </span>
              <span className="tnum shrink-0 text-right">
                <span className="block text-[13px] font-bold text-ink">
                  {moneyPlain(member.points)}
                </span>
                <span className="meta">оноо</span>
              </span>
            </button>
          ))
        )}
      </div>
    </Sheet>
  );
}

export default function CashierPage({
  narrow,
  onQuickPay,
}: {
  narrow: boolean;
  /** Задгай дүн нэмээд шууд төлбөр рүү */
  onQuickPay: (method: "бэлэн" | "карт" | "qpay") => void;
}) {
  const { catalog, lines, bump, setQty, addFreeAmount, mode, attachServerMember } = useStore();
  const [category, setCategory] = useState<Category | "бүгд">("бүгд");
  const [query, setQuery] = useState("");
  const [picking, setPicking] = useState<Product | null>(null);
  const [freeAmount, setFreeAmount] = useState(false);
  /* Тор нь цөөн бараатай цэгт, жагсаалт нь олон бараатай дэлгүүрт.
     Кассчин өөрөө сонгоно — нэгийг нь нөгөөгөөр солих нь алдаа.
     Анхдагч нь жагсаалт (эзний шийдвэр): нэг дэлгэцэнд олон бараа, том
     зурагтай торыг товчоор нээнэ. */
  const [view, setView] = useState<"жагсаалт" | "тор">("жагсаалт");

  const visible = useMemo(
    () =>
      catalog.filter((item) => {
        const byCategory = category === "бүгд" || item.category === category;
        const byQuery =
          query.trim() === "" ||
          item.name.toLowerCase().includes(query.trim().toLowerCase()) ||
          (item.barCode ?? "").includes(query.trim());
        return byCategory && byQuery;
      }),
    [category, query, catalog],
  );

  const qtyOf = (id: string) => lines.find((line) => line.product.id === id)?.qty ?? 0;

  /* Жин, эзэлхүүнээр зарагддаг барааг «+1» гэж нэмж болохгүй — жинлэх
     цонх нээнэ. Бусдыг нь нэг дарахад нэг ширхэг. */
  const addOne = (product: Product) =>
    unitOf(product.unit).fractional ? setPicking(product) : bump(product, 1);

  /* Бар код уншуулахад шууд сагсанд. Олдохгүй бол хайлтын талбарт
     тавина — кассчин юу уншуулсныг хараад гараар шийднэ. */
  const [scanMiss, setScanMiss] = useState("");
  const [camera, setCamera] = useState(false);
  const handleScan = (code: string) => {
    if (mode === "server" && isMemberToken(code)) {
      setCamera(false);
      void attachServerMember(code).then((err) => setScanMiss(err ? `Гишүүн: ${err}` : ""));
      return true;
    }
    const hit = catalog.find((item) => item.barCode === code);
    if (hit) {
      setScanMiss("");
      // Жинлэх бараа бол камерыг хааж жинлэх цонхыг нээнэ
      if (unitOf(hit.unit).fractional) setCamera(false);
      addOne(hit);
      return true;
    }
    setScanMiss(code);
    setQuery(code);
    return false;
  };
  useBarcodeScanner(handleScan);

  const cameraButton = (
    <button
      type="button"
      onClick={() => setCamera(true)}
      aria-label="Камераар бар код уншуулах"
      title="Камераар бар код уншуулах"
      className={`press grid size-10 shrink-0 place-items-center rounded-xl text-ink ring-1 ring-inset ${
        narrow ? "bg-paper ring-hair" : "bg-stage ring-transparent hover:bg-hair"
      }`}
    >
      <IconBarcode />
    </button>
  );

  /* Нарийн дэлгэц саарал тайзан дээр тул чип хүрээтэй; суурин кассын
     чип цагаан хуудсан дотор тул саарал дэвсгэртэй. */
  const chips = (
    <div className={`no-bar flex gap-2 overflow-x-auto ${narrow ? "-mx-4 px-4" : "min-w-0 flex-1"}`}>
      {categories.map((item) => (
        <Chip
          key={item.key}
          on={item.key === category}
          onClick={() => setCategory(item.key)}
          outlined={narrow}
        >
          {item.label}
        </Chip>
      ))}
    </div>
  );

  const search = (
    <label className={`relative block ${narrow ? "flex-1" : "w-[280px] shrink-0"}`}>
      <span className="sr-only">Бараа хайх</span>
      <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-mute">
        <IconSearch />
      </span>
      <input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder={narrow ? "Хайх" : "Нэр, бар код"}
        className={`h-10 w-full rounded-xl pl-10 pr-4 text-[14px] text-ink ring-1 ring-inset placeholder:text-mute focus:outline-none focus:ring-accent ${
          narrow ? "bg-paper ring-hair" : "bg-stage ring-transparent focus:bg-paper"
        }`}
      />
    </label>
  );

  const sheets = (
    <>
      {camera && <CameraScanner onScan={handleScan} onClose={() => setCamera(false)} />}
      {freeAmount && (
        <FreeAmountSheet
          onClose={() => setFreeAmount(false)}
          onPay={(amount, method) => {
            addFreeAmount(amount);
            setFreeAmount(false);
            onQuickPay(method);
          }}
          onAdd={(amount) => {
            addFreeAmount(amount);
            setFreeAmount(false);
          }}
        />
      )}

      {picking && (
        <QtySheet
          product={picking}
          current={qtyOf(picking.id)}
          onClose={() => setPicking(null)}
          onSet={(qty) => {
            setQty(picking.id, qty);
            setPicking(null);
          }}
        />
      )}
    </>
  );

  /* Нарийн дэлгэцэд хяналтууд НЭГ мөрөнд: хайх + дүнгээр. Ангилал доор нь.
     Тусдаа гурван мөр болговол дэлгэцийн гуравны нэг чимэглэл болно. */
  if (narrow) {
    return (
      <>
        <div className="shrink-0 space-y-2.5 px-4 pb-3 pt-3">
          <div className="flex items-center gap-2">
            {search}
            {cameraButton}
            <button
              type="button"
              onClick={() => setFreeAmount(true)}
              className="press flex h-10 shrink-0 items-center gap-1.5 rounded-xl bg-ink px-3.5 text-[13px] font-bold text-paper"
            >
              <IconCash />
              Дүн
            </button>
          </div>
          {chips}
        </div>

      {scanMiss && (
        <div className="mx-4 mb-2 flex items-center gap-2 rounded-xl bg-warn-soft px-3 py-2 text-[12px] font-semibold text-warn">
          <IconAlert />
          <span className="tnum">{scanMiss}</span> — бүртгэлгүй бар код
          <button
            type="button"
            onClick={() => setScanMiss("")}
            className="ml-auto text-[11px] font-bold underline"
          >
            Хаах
          </button>
        </div>
      )}
        <div className="flex shrink-0 items-center justify-between px-4 pb-2">
          <span className="meta">Бараа · {visible.length}</span>
          <ViewSwitch view={view} onChange={setView} />
        </div>

        <div className="no-bar min-h-0 flex-1 overflow-y-auto px-4 pb-4">
          {view === "жагсаалт" ? (
            <div className="overflow-hidden rounded-[14px] bg-paper ring-1 ring-inset ring-hair">
              {visible.map((product) => (
                <ProductRow
                  key={product.id}
                  product={product}
                  qty={qtyOf(product.id)}
                  onAdd={() => addOne(product)}
                />
              ))}
            </div>
          ) : (
          <div className="grid grid-cols-2 gap-2.5">
            {visible.map((product) => (
              <ProductCard
                key={product.id}
                product={product}
                qty={qtyOf(product.id)}
                compact
                onAdd={() => addOne(product)}
              />
            ))}
          </div>
          )}
          {visible.length === 0 && <Empty text="Бараа олдсонгүй" />}
        </div>

        {sheets}
      </>
    );
  }

  /* Суурин касс: хайлт зүүнд (кассчны гар тэнд), ангилал дунд, задгай дүн
     баруунд. Тусдаа гарчиг хэрэггүй — зүүн цэс «Касс» гэж хэлж байна. */
  return (
    <>
      <div className="flex items-center gap-3">
        {search}
        {cameraButton}
        {chips}
        <button
          type="button"
          onClick={() => setFreeAmount(true)}
          className={`${btnGhost} shrink-0`}
        >
          <IconCash />
          Дүн оруулах
        </button>
      </div>

      {scanMiss && (
        <div className="mt-3 mb-1 flex items-center gap-2 rounded-xl bg-warn-soft px-3 py-2 text-[12px] font-semibold text-warn">
          <IconAlert />
          <span className="tnum">{scanMiss}</span> — бүртгэлгүй бар код
          <button
            type="button"
            onClick={() => setScanMiss("")}
            className="ml-auto text-[11px] font-bold underline"
          >
            Хаах
          </button>
        </div>
      )}
      <div className="meta-rule mb-4 mt-4 flex items-center justify-between">
        <span className="flex items-center gap-3">
          <span className="meta">Бараа · {visible.length}</span>
          <span className="meta flex items-center gap-1.5" title="USB / Bluetooth уншигчаар уншуулахад бараа шууд сагсанд орно">
            <span className="size-1.5 rounded-full bg-[#22c55e]" aria-hidden="true" />
            Бар код уншигч бэлэн
          </span>
        </span>
        <span className="flex items-center gap-3">
          <span className="meta">{category === "бүгд" ? "Бүх ангилал" : categories.find((c) => c.key === category)?.label}</span>
          <ViewSwitch view={view} onChange={setView} />
        </span>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto pb-2 pr-1">
        {view === "жагсаалт" ? (
          <div className="overflow-hidden rounded-[14px] bg-paper ring-1 ring-inset ring-hair">
            {visible.map((product) => (
              <ProductRow
                key={product.id}
                product={product}
                qty={qtyOf(product.id)}
                onAdd={() => addOne(product)}
              />
            ))}
          </div>
        ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-3">
          {visible.map((product) => (
            <ProductCard
              key={product.id}
              product={product}
              qty={qtyOf(product.id)}
              compact={false}
              onAdd={() => addOne(product)}
            />
          ))}
        </div>
        )}
        {visible.length === 0 && <Empty text="Бараа олдсонгүй" />}
      </div>

      {sheets}
    </>
  );
}

/** Тоон товчлуур — жин, задгай дүн, төлбөр гурвуулаа нэг хэв */
export function Keypad({
  keys,
  onPress,
  compact,
}: {
  keys: string[];
  onPress: (key: string) => void;
  /** Намхан дэлгэцэд багтаах — смен нээх зэрэг бусад агуулгатай хуудсанд */
  compact?: boolean;
}) {
  return (
    <div className="grid grid-cols-3 gap-2">
      {keys.map((key) => (
        <button
          key={key}
          type="button"
          onClick={() => onPress(key)}
          className={`press tnum rounded-xl font-bold text-ink hover:bg-hair ${
            compact ? "h-[48px] text-[18px]" : "h-[56px] text-[20px]"
          } ${key === "⌫" ? "bg-paper ring-1 ring-inset ring-hair" : "bg-stage"}`}
        >
          {key}
        </button>
      ))}
    </div>
  );
}

/**
 * Жин, эзэлхүүнээр зарагддаг барааны тоо хэмжээ.
 *
 * Кг, литрийг +1-ээр нэмж болохгүй — 0.350 кг гэж жигнэнэ. Жинлүүр
 * холбогдох хүртэл кассчин энд гараар оруулна; v1-д жинлүүрээс шууд
 * уншина.
 */
function QtySheet({
  product,
  current,
  onClose,
  onSet,
}: {
  product: Product;
  current: number;
  onClose: () => void;
  onSet: (qty: number) => void;
}) {
  const unit = unitOf(product.unit);
  const [text, setText] = useState(current > 0 ? String(current) : "");
  const value = Number(text || 0);
  const amount = Math.round(value * product.price);

  const press = (key: string) => {
    if (key === "⌫") return setText((v) => v.slice(0, -1));
    if (key === ".") return setText((v) => (v.includes(".") ? v : (v || "0") + "."));
    setText((v) => {
      const next = v + key;
      // 3 оронгоос илүү бутархай утгагүй
      return /\.\d{4,}$/.test(next) ? v : next.slice(0, 8);
    });
  };

  return (
    <Sheet
      title={product.name}
      onClose={onClose}
      footer={
        <PrimaryButton disabled={value <= 0} onClick={() => onSet(value)}>
          Сагсанд нэмэх
        </PrimaryButton>
      }
    >
      <div className="rounded-xl bg-stage p-4">
        <span className="meta">Тоо хэмжээ</span>
        <div className="mt-1 flex items-baseline gap-1.5 border-b-2 border-accent pb-2">
          <span className="tnum text-[38px] font-bold leading-none tracking-[-0.035em] text-ink">
            {text === "" ? "0" : text}
          </span>
          <span className="text-[18px] font-semibold text-mute">{unit.key}</span>
        </div>
        <div className="mt-3 flex items-baseline justify-between">
          <span className="tnum text-[13px] text-mute">
            {moneyPlain(product.price)}₮ / {unit.key}
          </span>
          <Money value={amount} className="text-[18px] font-bold text-ink" />
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {[0.25, 0.5, 1, 2, 5].map((preset) => (
          <Chip key={preset} on={text === String(preset)} onClick={() => setText(String(preset))}>
            <span className="tnum">
              {preset} {unit.key}
            </span>
          </Chip>
        ))}
      </div>

      <Keypad keys={["1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "0", "⌫"]} onPress={press} />

      <p className="text-[12px] leading-[16px] text-mute">
        Жинлүүр холбогдсоны дараа энэ тоо автоматаар бөглөгдөнө.
      </p>
    </Sheet>
  );
}

/**
 * Задгай дүнгээр зарах.
 *
 * Жагсаалтад байхгүй бараа, үйлчилгээ, нэг удаагийн борлуулалт. Кассчин
 * дүнгээ шивээд шууд төлбөрийн аргаа дарна — хоёр дарахад гүйлгээ эхэлнэ.
 *
 * Сагсанд мөр болж орох тул энгийн барааны хамт нийлүүлж болно, баримт нь
 * мөн адил үүснэ.
 */
function FreeAmountSheet({
  onClose,
  onPay,
  onAdd,
}: {
  onClose: () => void;
  onPay: (amount: number, method: "бэлэн" | "карт" | "qpay") => void;
  onAdd: (amount: number) => void;
}) {
  const [text, setText] = useState("");
  const amount = Number(text || 0);
  const ready = amount > 0;

  const press = (key: string) => {
    if (key === "⌫") return setText((value) => value.slice(0, -1));
    if (key === "000") return setText((value) => (value === "" ? value : value + "000").slice(0, 9));
    setText((value) => (value + key).replace(/^0+(?=\d)/, "").slice(0, 9));
  };

  const methods: [("бэлэн" | "карт" | "qpay"), string][] = [
    ["бэлэн", "Бэлэн"],
    ["карт", "Карт"],
    ["qpay", "QPay"],
  ];

  return (
    <Sheet
      title="Дүнгээр зарах"
      onClose={onClose}
      footer={
        <div className="space-y-2">
          <span className="meta block">Шууд төлбөр авах</span>
          <div className="grid grid-cols-3 gap-2">
            {methods.map(([key, label]) => (
              <button
                key={key}
                type="button"
                disabled={!ready}
                onClick={() => onPay(amount, key)}
                className="press flex h-12 items-center justify-center rounded-xl bg-ink text-[14px] font-bold text-paper disabled:opacity-35"
              >
                {label}
              </button>
            ))}
          </div>
          <button
            type="button"
            disabled={!ready}
            onClick={() => onAdd(amount)}
            className={`${btnGhost} h-11 w-full justify-center disabled:opacity-35`}
          >
            Сагсанд нэмээд үргэлжлүүлэх
          </button>
        </div>
      }
    >
      <div className="rounded-xl bg-stage p-4">
        <span className="meta">Дүн</span>
        <div className="mt-1 flex items-baseline gap-1.5 border-b-2 border-accent pb-2">
          <span className="tnum text-[38px] font-bold leading-none tracking-[-0.035em] text-ink">
            {text === "" ? "0" : moneyPlain(amount)}
          </span>
          <span className="text-[20px] font-semibold text-mute">₮</span>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {[1_000, 2_000, 5_000, 10_000, 20_000].map((preset) => (
          <Chip key={preset} on={text === String(preset)} onClick={() => setText(String(preset))}>
            <span className="tnum">{moneyPlain(preset)}₮</span>
          </Chip>
        ))}
      </div>

      <Keypad keys={["1", "2", "3", "4", "5", "6", "7", "8", "9", "000", "0", "⌫"]} onPress={press} />

      <p className="text-[12px] leading-[16px] text-mute">
        Сагсанд «Бусад борлуулалт» нэрээр орно. Е-баримтад ерөнхий татварын кодоор бичигдэнэ —
        энэ кодыг е-баримтын албан тодорхойлолттой тулгаж батлах шаардлагатай.
      </p>
    </Sheet>
  );
}
