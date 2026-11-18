"use client";

/*
 * eID нэвтрэлт — authorization хэлбэрээр.
 *
 * Веб (/portal) ба мерчантын апп (/merchant) нь eID апп руу нэвтрэх хүсэлт
 * илгээнэ; хэрэглэгч eID апп дээрээ дэлгэцэн дээрх тоог тулгаж зөвшөөрнө.
 * Туршилтад eID аппыг /eid хуудас дуурайна — хүсэлт, хариу нь
 * localStorage + BroadcastChannel-аар шууд дамжина (нэг хөтөч дотор).
 * Бодит холболтод энэ модулийн функцуудыг eID OIDC/CIBA API-аар солино.
 */

import { useEffect, useState } from "react";
import type { SpState, Staff } from "./types";

export type EidClient = "portal" | "merchant";

export type EidReq = {
  id: string;
  /** Регистрээр илгээсэн бол РД; QR-аар бол хоосон — уншсан хүн зөвшөөрнө */
  regNo: string;
  via: "regno" | "qr";
  client: EidClient;
  /** Тулгах 2 оронтой тоо (number matching) */
  code: string;
  at: number;
  expires: number;
  status: "pending" | "approved" | "denied";
  /** Зөвшөөрсөн хүний РД, нэр */
  by?: { regNo: string; name: string };
};

const KEY = "gepos-eid";
const CH = "gepos-eid";
export const EID_TTL = 120_000;

let ch: BroadcastChannel | null = null;
const subs = new Set<() => void>();

function channel() {
  if (typeof window === "undefined") return null;
  if (!ch && "BroadcastChannel" in window) {
    ch = new BroadcastChannel(CH);
    ch.onmessage = () => subs.forEach((f) => f());
    window.addEventListener("storage", (e) => e.key === KEY && subs.forEach((f) => f()));
  }
  return ch;
}

function read(): EidReq[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) || "[]") as EidReq[];
  } catch {
    return [];
  }
}
function write(list: EidReq[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list.slice(0, 20)));
  } catch {
    /* хувийн цонх */
  }
  channel()?.postMessage("changed");
  subs.forEach((f) => f());
}

export const normReg = (r: string) => r.trim().toUpperCase().replace(/\s+/g, "");
/** Монгол РД: 2 кирилл үсэг + 8 тоо */
export const validReg = (r: string) => /^[А-ЯӨҮЁ]{2}\d{8}$/.test(normReg(r));

export function eidRequest(client: EidClient, regNo: string, via: "regno" | "qr" = "regno"): EidReq {
  const now = Date.now();
  const req: EidReq = {
    id: `eid${now.toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    regNo: via === "qr" ? "" : normReg(regNo),
    via,
    client,
    code: String(10 + Math.floor(Math.random() * 90)),
    at: now,
    expires: now + EID_TTL,
    status: "pending",
  };
  write([req, ...read().filter((x) => x.expires > now - 60_000)]);
  return req;
}

export function eidRespond(id: string, approve: boolean, by: { regNo: string; name: string }) {
  const now = Date.now();
  write(read().map((x) => (x.id === id && x.status === "pending" && x.expires > now ? { ...x, status: approve ? "approved" : "denied", by } : x)));
}

export function eidCancel(id: string) {
  write(read().filter((x) => x.id !== id));
}

/** Нэг хүсэлтийн төлөвийг дагана */
export function useEidReq(id: string | null): EidReq | null {
  const [req, setReq] = useState<EidReq | null>(null);
  useEffect(() => {
    if (!id) return;
    channel();
    const f = () => setReq(read().find((x) => x.id === id) ?? null);
    f();
    subs.add(f);
    return () => {
      subs.delete(f);
    };
  }, [id]);
  return id ? req : null;
}

/** eID апп талд: хүлээгдэж буй хүсэлтүүд */
export function useEidPending(): EidReq[] {
  const [list, setList] = useState<EidReq[]>([]);
  useEffect(() => {
    channel();
    const f = () => setList(read().filter((x) => x.status === "pending" && x.expires > Date.now()));
    f();
    subs.add(f);
    const t = setInterval(f, 1000);
    return () => {
      subs.delete(f);
      clearInterval(t);
    };
  }, []);
  return list;
}

/* ───────── eID → бүртгэл (BR01-3, BR01-6, BR02-6) ───────── */

export type EidAccount =
  | { kind: "owner"; title: string; sub: string }
  | { kind: "staff"; staffId: string; title: string; sub: string };

/**
 * Нэг eID-д холбогдсон бүртгэлүүд: мерчантын эзэмшигч (админ) ба
 * ажилтны эрх. Олон бол хэрэглэгч сонгоно (BR01-6).
 */
export function eidAccounts(s: SpState, regNo: string): EidAccount[] {
  const r = normReg(regNo);
  const out: EidAccount[] = [];
  const owner = normReg(s.merchant.ownerRegNo ?? "") === r || (s.merchant.kind === "person" && normReg(s.merchant.regNo) === r);
  if (owner) out.push({ kind: "owner", title: s.merchant.name, sub: "Эзэмшигч · Бүх эрх" });
  for (const st of s.staff) {
    if (!st.active || normReg(st.regNo ?? "") !== r) continue;
    if (owner && st.roleId === "admin") continue; // эзэмшигч өөрөө админ
    out.push({ kind: "staff", staffId: st.id, title: s.merchant.name, sub: `Ажилтан · ${s.roles.find((x) => x.id === st.roleId)?.name ?? ""}` });
  }
  return out;
}

/** eID-ийн эзэмшигчийн нэр (туршилтын өгөгдлөөс) */
export function eidName(s: SpState, regNo: string): string {
  const r = normReg(regNo);
  const st = s.staff.find((x: Staff) => normReg(x.regNo ?? "") === r);
  if (st) return `${st.last} ${st.first}`;
  if (s.merchant.kind === "person" && normReg(s.merchant.regNo) === r) return s.merchant.name;
  if (normReg(s.merchant.ownerRegNo ?? "") === r) return s.merchant.kyc["Эрх бүхий этгээд"]?.split("—")[0].trim() || `${s.merchant.name} — эзэмшигч`;
  return "eID хэрэглэгч";
}

/** eID апп (туршилт) дээр сонгож болох хүмүүс: ажилтнууд + мерчантын эзэмшигч */
export function eidPeople(s: SpState): { regNo: string; name: string }[] {
  const out = new Map<string, string>();
  const owner = normReg(s.merchant.ownerRegNo ?? (s.merchant.kind === "person" ? s.merchant.regNo : ""));
  if (owner) out.set(owner, eidName(s, owner));
  for (const st of s.staff) if (st.regNo) out.set(normReg(st.regNo), `${st.last} ${st.first}`);
  return [...out].map(([regNo, name]) => ({ regNo, name }));
}
