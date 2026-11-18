import { api } from "@/lib/agent/api";
import { checkInvoice, sandboxConfirm } from "@/lib/agent/billing";
import { requireTenant } from "@/lib/tenant/auth";

type Ctx = RouteContext<"/api/agent/billing/[id]">;

/** QPay-ээс төлбөр шалгана (төлөгдсөн бол кредит нэмэгдэнэ) */
export const GET = api(async (req: Request, rc: Ctx) => Response.json(await checkInvoice(requireTenant(req, "billing"), (await rc.params).id)));

/** QPay sandbox-ийн нэхэмжлэхийг гараар баталгаажуулах (зөвхөн sandbox, «sandbox-manual» гэж тэмдэглэгдэнэ) */
export const POST = api(async (req: Request, rc: Ctx) => Response.json(sandboxConfirm(requireTenant(req, "billing"), (await rc.params).id)));
