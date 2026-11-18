"use client";

/*
 * AI ажилтны хэсгүүдийг өөр бүрхүүл (Merchant portal) дотор харуулах үед толгойг тэр бүрхүүл зурна.
 * Контекст байхгүй (/ai) бол Head өөрийн загвараар зурна.
 */
import { createContext, type ReactNode } from "react";

export type HeadProps = { title: string; sub?: string; actions?: ReactNode };
export type Embed = { head: (p: HeadProps) => ReactNode };

export const EmbedCtx = createContext<Embed | null>(null);
