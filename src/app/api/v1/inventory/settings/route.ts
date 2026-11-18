import { api } from "@/lib/agent/api";
import { readJson } from "@/lib/inventory/http";
import { getThresholds, saveThresholds } from "@/lib/inventory/sessions";
import { requireRole, requireTenant } from "@/lib/tenant/auth";

/** Зөрүүний босго (§5.5) */
export const GET = api(async (req: Request) => {
  const ctx = requireTenant(req, "inventory:count");
  return Response.json({ thresholds: getThresholds(ctx) });
});

export const PUT = api(async (req: Request) => {
  const ctx = requireTenant(req, "inventory:approve");
  requireRole(ctx, ["owner", "manager"]);
  const b = await readJson<{ thresholds?: Record<string, unknown> }>(req);
  return Response.json({ thresholds: saveThresholds(ctx, b.thresholds ?? {}) });
});
