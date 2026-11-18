/**
 * Гарах HTTP-ийн SSRF шүүлт (docs/ARCHITECTURE.md §4.3, §4B.2): зөвхөн https://, нийтийн IP.
 * Хувийн муж (10/8, 172.16/12, 192.168/16, 127/8, 169.254/16, 100.64/10, 0/8, ::1, fc00::/7, fe80::/10) хориотой.
 * Хөгжүүлэлт/тест: ALLOW_PRIVATE_CONNECTOR=yes бол sandbox түнш/webhook-д http://127.0.0.1 зөвшөөрнө.
 * Хязгаар: DNS-ийг шалгасны дараа fetch дахин шийднэ (rebinding) — MVP-д хүлээн зөвшөөрсөн, дараа нь IP-гээр холбогдоно.
 */
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

export class UrlBlocked extends Error {}

export function isPrivateIp(ip: string): boolean {
  const v = isIP(ip);
  if (v === 4) {
    const [a, b] = ip.split(".").map(Number);
    return a === 10 || a === 127 || a === 0 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 169 && b === 254) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
  }
  if (v === 6) {
    const x = ip.toLowerCase();
    if (x === "::1" || x === "::") return true;
    if (x.startsWith("::ffff:")) return isPrivateIp(x.slice(7));
    return /^f[cd]/.test(x) || /^fe[89ab]/.test(x);
  }
  return true;
}

export const allowPrivate = (sandbox: boolean) => sandbox && process.env.ALLOW_PRIVATE_CONNECTOR === "yes";

/** Шалгаад URL буцаана; хориотой бол UrlBlocked */
export async function assertPublicUrl(raw: string, opts: { allowPrivate?: boolean } = {}): Promise<URL> {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new UrlBlocked("URL буруу");
  }
  if (u.username || u.password) throw new UrlBlocked("URL-д нэвтрэх мэдээлэл хориотой");
  const host = u.hostname.replace(/^\[|\]$/g, "");
  if (opts.allowPrivate && u.protocol === "http:" && (host === "127.0.0.1" || host === "localhost")) return u;
  if (u.protocol !== "https:") throw new UrlBlocked("Зөвхөн https:// хаяг");
  if (opts.allowPrivate) return u;
  const addrs = isIP(host) ? [host] : (await lookup(host, { all: true }).catch(() => [])).map((a) => a.address);
  if (!addrs.length) throw new UrlBlocked("Хост олдсонгүй");
  if (addrs.some(isPrivateIp)) throw new UrlBlocked("Хувийн сүлжээний хаяг хориотой");
  return u;
}

/** Синхрон хэлбэрийн шалгалт (хадгалахаас өмнө) — DNS шийдэхгүй */
export function urlShapeOk(raw: string, opts: { allowPrivate?: boolean } = {}): boolean {
  try {
    const u = new URL(raw);
    if (u.username || u.password) return false;
    const host = u.hostname.replace(/^\[|\]$/g, "");
    if (opts.allowPrivate && u.protocol === "http:" && (host === "127.0.0.1" || host === "localhost")) return true;
    if (u.protocol !== "https:") return false;
    if (isIP(host) && isPrivateIp(host) && !opts.allowPrivate) return false;
    if (/^(localhost|.*\.local|.*\.internal)$/i.test(host) && !opts.allowPrivate) return false;
    return true;
  } catch {
    return false;
  }
}
