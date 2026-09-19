import { guard } from "../../../lib/server/auth";
import { importUpload } from "../../../lib/server/importers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Upload one audio file (multipart: file, title?, artist?, duration?).
export async function POST(req) {
  const denied = guard(req);
  if (denied) return denied;
  try {
    const form = await req.formData();
    const file = form.get("file");
    if (!file || typeof file === "string") {
      return Response.json({ error: "No file uploaded." }, { status: 400 });
    }
    const song = await importUpload(file, {
      title: form.get("title") || "",
      artist: form.get("artist") ?? undefined,
      duration: form.get("duration") || 0,
    });
    const { file: _f, ...meta } = song;
    return Response.json(meta);
  } catch (e) {
    return Response.json({ error: e.message }, { status: 400 });
  }
}
