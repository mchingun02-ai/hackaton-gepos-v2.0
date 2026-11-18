/**
 * Тестэд src доторх .ts файлыг шууд импортлох (Node 26-ийн type stripping) — `@/…` alias ба өргөтгөлгүй
 * импортыг .ts руу шийднэ. Шинэ хамаарал нэмэхгүй.
 */
import { existsSync } from "node:fs";
import { registerHooks } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const SRC = path.join(ROOT, "src");

registerHooks({
  resolve(spec, ctx, next) {
    let s = spec;
    if (s.startsWith("@/")) s = pathToFileURL(path.join(SRC, s.slice(2))).href;
    if ((s.startsWith("file:") || s.startsWith("./") || s.startsWith("../")) && !/\.[cm]?[jt]sx?$/.test(s) && ctx.parentURL) {
      const base = s.startsWith("file:") ? fileURLToPath(s) : path.resolve(path.dirname(fileURLToPath(ctx.parentURL)), s);
      for (const ext of [".ts", ".tsx", "/index.ts"]) if (existsSync(base + ext)) return next(pathToFileURL(base + ext).href, ctx);
    }
    return next(s, ctx);
  },
});

/** src доторх модуль (ж: "lib/sp/core") */
export const src = (p) => import(pathToFileURL(path.join(SRC, p.endsWith(".ts") ? p : `${p}.ts`)).href);
