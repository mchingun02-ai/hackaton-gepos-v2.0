"use client";

import { useEffect, useEffectEvent, useRef, useState } from "react";
import { Sheet } from "@/components/ui";

/**
 * Камераар бар код уншуулах.
 *
 * USB уншигчгүй касс (таблет, утас, ноутбук) камераараа уншина.
 * Хөтөч өөрөө BarcodeDetector-тэй бол (Android, macOS) түүнийг; үгүй
 * бол (Windows дээрх Chrome/Edge) ZXing-ийг ЗӨВХӨН энэ цонх нээгдэхэд
 * ачаална — кассын үндсэн хуудсанд нэг ч байт нэмэхгүй.
 *
 * Уншмагц дуугаргаад цонхыг хаахгүй — дараалсан бараа уншуулахад
 * кассчин цонх дахин нээх ёсгүй. Нэг кодыг 1.5 сек дотор дахин
 * тоолохгүй: камер нэг шошгыг секундэд хэд хэдэн удаа хардаг.
 */

type Detector = { detect: (source: CanvasImageSource) => Promise<{ rawValue: string }[]> };
type DetectorCtor = new (opts: { formats: string[] }) => Detector;

const FORMATS = ["ean_13", "ean_8", "upc_a", "upc_e", "code_128", "code_39", "qr_code"];
const REPEAT_MS = 1500;

function beep() {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = 1760;
    gain.gain.value = 0.08;
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.09);
    osc.onended = () => ctx.close();
  } catch {}
}

export function CameraScanner({
  onScan,
  onClose,
  title = "Камераар уншуулах",
  okText = "Сагсанд нэмэгдлээ",
  missText = "Бүртгэлгүй бар код",
}: {
  /** true буцаавал бараа олдсон гэж тоолно */
  onScan: (code: string) => boolean;
  onClose: () => void;
  title?: string;
  /** Олдсон / олдоогүй үед харуулах бичиг */
  okText?: string;
  missText?: string;
}) {
  const video = useRef<HTMLVideoElement>(null);
  // Камер дахин асахгүйгээр хамгийн сүүлийн onScan-ийг дуудна
  const handle = useEffectEvent((code: string) => onScan(code));
  const [state, setState] = useState<"starting" | "ready" | "denied" | "nocamera" | "error">("starting");
  const [last, setLast] = useState<{ code: string; ok: boolean } | null>(null);

  useEffect(() => {
    let stopped = false;
    let stop: () => void = () => {};
    const seen = new Map<string, number>();

    const found = (code: string) => {
      const now = Date.now();
      if (now - (seen.get(code) ?? 0) < REPEAT_MS) return;
      seen.set(code, now);
      const ok = handle(code);
      if (ok) beep();
      setLast({ code, ok });
    };

    (async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setState("nocamera");
        return;
      }
      try {
        const Native = (window as unknown as { BarcodeDetector?: DetectorCtor & { getSupportedFormats?: () => Promise<string[]> } })
          .BarcodeDetector;
        const supported = Native?.getSupportedFormats ? await Native.getSupportedFormats() : [];

        if (Native && supported.includes("ean_13")) {
          const stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } },
          });
          if (stopped) return stream.getTracks().forEach((t) => t.stop());
          const el = video.current!;
          el.srcObject = stream;
          await el.play();
          const detector = new Native({ formats: FORMATS.filter((f) => supported.includes(f)) });
          let raf = 0;
          const tick = async () => {
            if (stopped) return;
            try {
              if (el.readyState >= 2) for (const hit of await detector.detect(el)) found(hit.rawValue);
            } catch {}
            raf = window.setTimeout(tick, 120);
          };
          tick();
          stop = () => {
            clearTimeout(raf);
            stream.getTracks().forEach((t) => t.stop());
          };
        } else {
          const { BrowserMultiFormatReader } = await import("@zxing/browser");
          const { DecodeHintType, BarcodeFormat } = await import("@zxing/library");
          const hints = new Map();
          hints.set(DecodeHintType.POSSIBLE_FORMATS, [
            BarcodeFormat.EAN_13,
            BarcodeFormat.EAN_8,
            BarcodeFormat.UPC_A,
            BarcodeFormat.UPC_E,
            BarcodeFormat.CODE_128,
            BarcodeFormat.CODE_39,
            BarcodeFormat.QR_CODE,
          ]);
          const reader = new BrowserMultiFormatReader(hints, { delayBetweenScanAttempts: 100 });
          const controls = await reader.decodeFromConstraints(
            { video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } } },
            video.current!,
            (result) => {
              if (result && !stopped) found(result.getText());
            },
          );
          if (stopped) return controls.stop();
          stop = () => controls.stop();
        }
        if (!stopped) setState("ready");
      } catch (err) {
        const name = (err as { name?: string })?.name;
        setState(name === "NotAllowedError" ? "denied" : name === "NotFoundError" || name === "OverconstrainedError" ? "nocamera" : "error");
      }
    })();

    return () => {
      stopped = true;
      stop();
    };
  }, []);

  const message = {
    starting: "Камер асааж байна…",
    ready: "Бар кодыг хүрээн дотор барина уу",
    denied: "Камерын зөвшөөрөл олгоогүй байна. Хөтчийн хаягийн мөрөн дэх камерын тэмдгээр зөвшөөрнө үү.",
    nocamera: "Энэ төхөөрөмжид камер олдсонгүй. USB бар код уншигч холбоод шууд уншуулж болно.",
    error: "Камер асаахад алдаа гарлаа. Өөр програм камер ашиглаж байгаа эсэхийг шалгана уу.",
  }[state];

  return (
    <Sheet
      title={title}
      onClose={onClose}
      footer={
        <button type="button" onClick={onClose} className="press h-12 w-full rounded-xl bg-ink text-[15px] font-bold text-paper">
          Дуусгах
        </button>
      }
    >
      <div className="space-y-4">
        <div className="relative aspect-[4/3] overflow-hidden rounded-[16px] bg-black">
          <video ref={video} muted playsInline className="size-full object-cover" />
          {/* Онилох хүрээ — бар код хэвтээ урт тул өргөн, намхан */}
          <div className="pointer-events-none absolute inset-x-[12%] top-1/2 h-[34%] -translate-y-1/2 rounded-xl ring-2 ring-white/80 shadow-[0_0_0_999px_rgb(0_0_0/0.35)]">
            {state === "ready" && <div className="scanline absolute inset-x-3 h-0.5 rounded-full bg-accent" />}
          </div>
        </div>

        <p className={`text-[13px] leading-relaxed ${state === "ready" || state === "starting" ? "text-mute" : "font-semibold text-warn"}`}>{message}</p>

        {last && (
          <div
            role="status"
            className={`flex items-center justify-between rounded-xl px-3.5 py-2.5 text-[13px] font-semibold ${
              last.ok ? "bg-stage text-ink" : "bg-warn-soft text-warn"
            }`}
          >
            <span className="tnum">{last.code}</span>
            <span>{last.ok ? okText : missText}</span>
          </div>
        )}
      </div>
    </Sheet>
  );
}
