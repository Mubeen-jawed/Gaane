import { guard } from "../../../lib/server/auth";
import { read } from "../../../lib/server/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req) {
  const denied = guard(req);
  if (denied) return denied;
  const db = await read();
  return Response.json(
    {
      songs: db.songs.map(({ file, ...s }) => s),
      playlists: db.playlists,
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
