import { guard } from "../../../lib/server/auth";
import { update, validId } from "../../../lib/server/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Create or replace a playlist: { id, name, songIds, createdAt }.
export async function POST(req) {
  const denied = guard(req);
  if (denied) return denied;
  let body;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Bad request." }, { status: 400 });
  }
  const { id, name, songIds, createdAt } = body || {};
  if (!validId(id) || typeof name !== "string" || !Array.isArray(songIds)) {
    return Response.json({ error: "Bad playlist." }, { status: 400 });
  }
  const pl = await update((db) => {
    const known = new Set(db.songs.map((s) => s.id));
    const clean = {
      id,
      name: name.trim().slice(0, 100) || "Playlist",
      songIds: songIds.filter((x) => known.has(x)),
      createdAt: +createdAt || Date.now(),
    };
    const i = db.playlists.findIndex((p) => p.id === id);
    if (i >= 0) db.playlists[i] = clean;
    else db.playlists.push(clean);
    return clean;
  });
  return Response.json(pl);
}
