"use client";

import { useEffect, useEffectEvent, useRef } from "react";

/**
 * USB / Bluetooth бар код уншигчийг сонсох.
 *
 * Монголын дэлгүүрийн уншигчийн 99% нь «keyboard wedge» буюу гар
 * дуурайдаг төхөөрөмж: кодын цифрүүдийг маш хурдан бичээд төгсгөлд
 * нь Enter дарна. Тусгай драйвер, зөвшөөрөл, камер шаардахгүй —
 * зөвхөн гарын товчлуурыг сонсоход л хангалттай.
 *
 * Хүний бичилтээс ялгах цорын ганц найдвартай шинж нь ХУРД: уншигч
 * нэг тэмдэгтийг 10–30мс-д бичдэг бол хүн 80мс-ээс удаан. Тиймээс
 * тэмдэгт хоорондын завсар хэтэрвэл цуглуулсан буферийг хаяна.
 *
 * Талбарт бичиж байх үед хөндлөнгөөс оролцохгүй — кассчин нэрээр
 * хайж байхад бичсэн үсэг нь уншигчийн код мэт тооцогдох учиргүй.
 */
const MAX_GAP_MS = 60;
const MIN_LENGTH = 6;

export function useBarcodeScanner(onScan: (code: string) => void) {
  const buffer = useRef("");
  const last = useRef(0);
  // Хамгийн сүүлийн onScan-ийг дуудна, гэхдээ listener дахин бүртгэгдэхгүй
  const emit = useEffectEvent((code: string) => onScan(code));

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing =
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable);
      if (typing) return;

      const now = Date.now();
      if (now - last.current > MAX_GAP_MS) buffer.current = "";
      last.current = now;

      if (event.key === "Enter") {
        const code = buffer.current;
        buffer.current = "";
        if (code.length >= MIN_LENGTH) {
          event.preventDefault();
          emit(code);
        }
        return;
      }

      // Бар код нь зөвхөн цифр. Бусад товчлуур буферийг эвдэнэ.
      if (event.key.length === 1 && event.key >= "0" && event.key <= "9") {
        buffer.current += event.key;
      } else if (event.key.length === 1) {
        buffer.current = "";
      }
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}
