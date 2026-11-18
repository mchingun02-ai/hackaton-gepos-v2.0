"use client";

/** AI-ийн хариуг аюулгүй зурна: **тод**, жагсаалт, | хүснэгт |, `код`. HTML-ийг хэзээ ч шууд оруулахгүй. */
import { Fragment, type ReactNode } from "react";

function inline(s: string, k: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|`[^`]+`)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(s))) {
    if (m.index > last) out.push(s.slice(last, m.index));
    const t = m[0];
    out.push(t.startsWith("**") ? <strong key={`${k}-${i++}`} className="font-semibold">{t.slice(2, -2)}</strong> : <code key={`${k}-${i++}`} className="rounded bg-[var(--sp-fill)] px-1 text-[0.92em]">{t.slice(1, -1)}</code>);
    last = m.index + t.length;
  }
  if (last < s.length) out.push(s.slice(last));
  return out;
}

export function Md({ text }: { text: string }) {
  const lines = text.replace(/\r/g, "").split("\n");
  const blocks: ReactNode[] = [];
  let i = 0;
  while (i < lines.length) {
    const l = lines[i];
    if (/^\s*\|.*\|\s*$/.test(l)) {
      const rows: string[][] = [];
      while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) {
        if (!/^\s*\|[\s:|-]+\|\s*$/.test(lines[i])) rows.push(lines[i].trim().slice(1, -1).split("|").map((c) => c.trim()));
        i++;
      }
      blocks.push(
        <div key={`t${i}`} className="my-2 overflow-x-auto rounded-[12px] shadow-[0_0_0_0.5px_var(--sp-sep)]">
          <table className="w-full text-[13.5px]">
            <tbody>
              {rows.map((r, ri) => (
                <tr key={ri} className={ri === 0 ? "bg-[var(--sp-fill)] font-semibold" : "border-t border-[var(--sp-sep)]"}>
                  {r.map((c, ci) => (
                    <td key={ci} className="px-3 py-1.5 align-top">
                      {inline(c, `c${ri}${ci}`)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
      continue;
    }
    if (/^\s*([-*•]|\d+[.)])\s+/.test(l)) {
      const items: string[] = [];
      const ordered = /^\s*\d/.test(l);
      while (i < lines.length && /^\s*([-*•]|\d+[.)])\s+/.test(lines[i])) items.push(lines[i++].replace(/^\s*([-*•]|\d+[.)])\s+/, ""));
      const L = ordered ? "ol" : "ul";
      blocks.push(
        <L key={`l${i}`} className={`my-1.5 space-y-1 pl-5 ${ordered ? "list-decimal" : "list-disc"}`}>
          {items.map((it, j) => (
            <li key={j}>{inline(it, `i${i}${j}`)}</li>
          ))}
        </L>,
      );
      continue;
    }
    if (/^#{1,4}\s/.test(l)) {
      blocks.push(
        <div key={`h${i}`} className="mt-2 font-semibold">
          {inline(l.replace(/^#+\s/, ""), `h${i}`)}
        </div>,
      );
      i++;
      continue;
    }
    if (!l.trim()) {
      i++;
      continue;
    }
    blocks.push(
      <p key={`p${i}`} className="my-1">
        {inline(l, `p${i}`)}
      </p>,
    );
    i++;
  }
  return <Fragment>{blocks}</Fragment>;
}
