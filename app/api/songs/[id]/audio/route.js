import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { guard } from "../../../../../lib/server/auth";
import { MIME, read, songPath, validId } from "../../../../../lib/server/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Streams a song with HTTP Range support, so playback starts instantly and
// seeking jumps straight to the right byte instead of downloading everything.
export async function GET(req, { params }) {
  const denied = guard(req);
  if (denied) return denied;
  const { id } = await params;
  if (!validId(id)) return new Response("Bad id", { status: 400 });
  const song = (await read()).songs.find((s) => s.id === id);
  if (!song) return new Response("Not found", { status: 404 });

  const file = songPath(song);
  let size;
  try {
    size = (await stat(file)).size;
  } catch {
    return new Response("Not found", { status: 404 });
  }

  const headers = {
    "Content-Type": MIME[path.extname(file).toLowerCase()] || "application/octet-stream",
    "Accept-Ranges": "bytes",
    // A song's file never changes, so the browser can keep it.
    "Cache-Control": "private, max-age=31536000, immutable",
  };

  const range = req.headers.get("range");
  const m = range && /^bytes=(\d*)-(\d*)$/.exec(range.trim());
  if (m && (m[1] || m[2])) {
    let start = m[1] ? +m[1] : Math.max(0, size - +m[2]);
    let end = m[1] && m[2] ? Math.min(+m[2], size - 1) : size - 1;
    if (start >= size || start > end) {
      return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } });
    }
    const body = Readable.toWeb(createReadStream(file, { start, end }));
    return new Response(body, {
      status: 206,
      headers: { ...headers, "Content-Range": `bytes ${start}-${end}/${size}`, "Content-Length": String(end - start + 1) },
    });
  }

  const body = Readable.toWeb(createReadStream(file));
  return new Response(body, { headers: { ...headers, "Content-Length": String(size) } });
}
