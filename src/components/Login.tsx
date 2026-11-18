"use client";

import { useState } from "react";
import { type Staff, staff as demoStaff } from "@/lib/demo";
import { useStore } from "@/lib/store";
import { IconBackspace, IconLock, ThemeToggle, Wordmark } from "@/components/icons";

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9"];
const PIN_MIN = 4;
const PIN_MAX = 6;

/**
 * PIN нэвтрэлт.
 *
 * Системийн гарын оронд өөрийн тоон товчлуур: SUNMI-гийн дэлгэц жижиг,
 * системийн гар гарч ирэхэд дэлгэцийн талыг эзэлнэ. Мөн кассчин өдөрт
 * олон арван удаа нэвтэрдэг тул товчлуур том, тогтмол байрлалтай байх
 * ёстой.
 *
 * PIN апп дотор хадгалагддаггүй: төвд холбогдсон касс PIN-ийг сервер рүү
 * илгээж шалгуулна (hash, буруу оролдлогын хязгаар, түгжээ сервер дээр).
 * Холбогдоогүй (туршилтын) горимд PIN-гүй — үүргээ сонгож орно.
 */
export default function Login({
  onLogin,
  onToggleTheme,
}: {
  onLogin: (person: Staff) => void;
  onToggleTheme: () => void;
}) {
  const { mode, loginPin, authNotice } = useStore();
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (value: string) => {
    if (busy || value.length < PIN_MIN) return;
    setBusy(true);
    setError(null);
    const failed = await loginPin(value);
    setBusy(false);
    if (failed) {
      setError(failed);
      setPin("");
    }
  };

  const press = (key: string) => {
    if (busy) return;
    setError(null);
    const next = (pin + key).slice(0, PIN_MAX);
    setPin(next);
    if (next.length === PIN_MAX) window.setTimeout(() => submit(next), 120);
  };

  const notice = error ?? authNotice;

  return (
    <div className="relative flex size-full flex-col items-center justify-center bg-stage px-5 py-8">
      <span className="absolute right-5 top-5">
        <ThemeToggle onClick={onToggleTheme} />
      </span>

      <div className="w-full max-w-[404px] rounded-[26px] bg-paper p-7 ring-1 ring-inset ring-hair">
        <Wordmark />

        <h1 className="mt-7 text-[26px] font-bold tracking-[-0.04em] text-ink">Нэвтрэх</h1>

        {mode === "demo" ? (
          <>
            <p className="mt-1 text-[13px] text-mute">
              Туршилтын горим — касс төвд холбогдоогүй, PIN шаардлагагүй. Үүргээ сонгоно уу.
            </p>
            <div className="mt-6 space-y-2">
              {demoStaff.map((person) => (
                <button
                  key={person.id}
                  type="button"
                  onClick={() => onLogin(person)}
                  className="press flex h-14 w-full items-center gap-3 rounded-2xl bg-stage px-4 text-left hover:bg-hair"
                >
                  <span className="grid size-9 place-items-center rounded-full bg-ink text-[12px] font-bold text-paper">
                    {person.initials}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[14px] font-bold text-ink">{person.name}</span>
                    <span className="block text-[12px] text-mute">{person.role}</span>
                  </span>
                </button>
              ))}
            </div>
          </>
        ) : (
          <>
            <p className="mt-1 flex items-center gap-1.5 text-[13px] text-mute">
              <IconLock />
              PIN кодоо оруулна уу
            </p>

            {/* Оруулсан орны тоог цэгээр — тоог хэзээ ч харуулахгүй */}
            <div className="mt-7 flex items-center justify-center gap-3.5" aria-live="polite">
              {Array.from({ length: Math.max(PIN_MIN, pin.length) }).map((_, index) => (
                <span
                  key={index}
                  className={`size-3.5 rounded-full transition-colors duration-150 ${
                    error ? "bg-danger" : index < pin.length ? "bg-accent" : "bg-stage ring-1 ring-inset ring-line"
                  }`}
                />
              ))}
            </div>

            <p
              role={notice ? "alert" : undefined}
              className={`mt-3 min-h-[18px] text-center text-[13px] font-semibold ${notice ? "text-danger" : "text-mute"}`}
            >
              {busy ? "Шалгаж байна…" : notice}
            </p>

            <div className="mt-4 grid grid-cols-3 gap-2.5">
              {KEYS.map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => press(key)}
                  disabled={busy}
                  className="press h-[62px] rounded-2xl bg-stage text-[21px] font-bold text-ink hover:bg-hair"
                >
                  {key}
                </button>
              ))}

              <button
                type="button"
                onClick={() => setPin((value) => value.slice(0, -1))}
                disabled={busy}
                className="press grid h-[62px] place-items-center rounded-2xl text-ink-2 ring-1 ring-inset ring-hair hover:text-ink hover:ring-line"
                aria-label="Устгах"
              >
                <IconBackspace />
              </button>

              <button
                type="button"
                onClick={() => press("0")}
                disabled={busy}
                className="press h-[62px] rounded-2xl bg-stage text-[21px] font-bold text-ink hover:bg-hair"
              >
                0
              </button>

              <button
                type="button"
                onClick={() => submit(pin)}
                disabled={busy || pin.length < PIN_MIN}
                className="press grid h-[62px] place-items-center rounded-2xl bg-accent text-[15px] font-bold text-[color:var(--accent-ink)] disabled:opacity-35"
              >
                Нэвтрэх
              </button>
            </div>

            <p className="mt-6 text-center text-[12px] text-mute">
              PIN-ийг байгууллагын эзэн эсвэл Gerege төв олгоно.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
