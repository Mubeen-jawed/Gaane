// Optional password protection. Set APP_PASSWORD (e.g. in .env.local) to turn it on.
import crypto from "node:crypto";

export const COOKIE = "gaane_auth";

export const authEnabled = () => !!process.env.APP_PASSWORD;

export function token() {
  return crypto.createHmac("sha256", process.env.APP_PASSWORD).update("gaane-session-v1").digest("hex");
}

export function isValid(value) {
  if (!authEnabled()) return true;
  if (!value) return false;
  const a = Buffer.from(value);
  const b = Buffer.from(token());
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// For route handlers: returns a 401 response when not signed in, else null.
export function guard(req) {
  if (isValid(req.cookies.get(COOKIE)?.value)) return null;
  return Response.json({ error: "Please sign in again." }, { status: 401 });
}
