import { guard } from "../../../lib/server/auth";
import { importDirect, importYouTube, YT_HOSTS } from "../../../lib/server/importers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Add a song from a link: YouTube (converted to MP3) or a direct audio file.
export async function POST(req) {
  const denied = guard(req);
  if (denied) return denied;
  let url;
  try {
    url = new URL((await req.json()).url);
    if (!/^https?:$/.test(url.protocol)) throw new Error();
  } catch {
    return Response.json({ error: "Invalid link." }, { status: 400 });
  }
  try {
    const song = YT_HOSTS.test(url.hostname) ? await importYouTube(url.href) : await importDirect(url.href);
    const { file: _f, ...meta } = song;
    return Response.json(meta);
  } catch (e) {
    return Response.json({ error: e.message }, { status: 422 });
  }
}
