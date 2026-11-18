import { api } from "@/lib/agent/api";
import { listActions } from "@/lib/agent/crm";
import { requireTenant } from "@/lib/tenant/auth";

/** AI-ийн хийсэн бүх үйлдлийн бүртгэл (аудит) */
export const GET = api(async (req: Request) => Response.json({ actions: listActions(requireTenant(req, "dashboard"), 200) }));
