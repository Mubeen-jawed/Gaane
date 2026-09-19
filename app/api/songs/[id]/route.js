import { guard } from "../../../../lib/server/auth";
import { removeSongFile, update, validId } from "../../../../lib/server/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Delete a song from the library, its file, and every playlist.
export async function DELETE(req, { params }) {
  const denied = guard(req);
  if (denied) return denied;
  const { id } = await params;
  if (!validId(id)) return Response.json({ error: "Bad id." }, { status: 400 });
  const song = await update((db) => {
    const s = db.songs.find((x) => x.id === id);
    if (!s) return null;
    db.songs = db.songs.filter((x) => x.id !== id);
    for (const pl of db.playlists) pl.songIds = pl.songIds.filter((x) => x !== id);
    return s;
  });
  if (song) await removeSongFile(song);
  return Response.json({ ok: true });
}
