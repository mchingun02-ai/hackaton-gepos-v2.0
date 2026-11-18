import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Түрээслэгчийн тусгаарлалт (docs/ARCHITECTURE.md §3.3 дүрэм 3): tenant-гүй one/all/run зөвхөн src/lib/tenant/**-д
  {
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/lib/tenant/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/lib/agent/db", "**/agent/db", "./db"],
              importNames: ["one", "all", "run", "db"],
              message: "Tenant-гүй query хориотой — ctx.db (tenant/tdb.ts) ашиглана.",
            },
          ],
        },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
