import crypto from "node:crypto";
import { authEnabled, COOKIE, token } from "../../../lib/server/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req) {
  if (!authEnabled()) return Response.json({ ok: true });
  const { password } = await req.json().catch(() => ({}));
  const a = crypto.createHash("sha256").update(String(password || "")).digest();
  const b = crypto.createHash("sha256").update(process.env.APP_PASSWORD).digest();
  if (!crypto.timingSafeEqual(a, b)) {
    await new Promise((r) => setTimeout(r, 800)); // slow down guessing
    return Response.json({ error: "Wrong password." }, { status: 401 });
  }
  const secure = (req.headers.get("x-forwarded-proto") || new URL(req.url).protocol).startsWith("https");
  const cookie = [
    `${COOKIE}=${token()}`, "Path=/", "HttpOnly", "SameSite=Lax",
    `Max-Age=${60 * 60 * 24 * 365}`, secure ? "Secure" : "",
  ].filter(Boolean).join("; ");
  return Response.json({ ok: true }, { headers: { "Set-Cookie": cookie } });
}
