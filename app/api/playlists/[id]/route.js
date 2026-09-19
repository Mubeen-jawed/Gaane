import { guard } from "../../../../lib/server/auth";
import { update, validId } from "../../../../lib/server/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(req, { params }) {
  const denied = guard(req);
  if (denied) return denied;
  const { id } = await params;
  if (!validId(id)) return Response.json({ error: "Bad id." }, { status: 400 });
  await update((db) => { db.playlists = db.playlists.filter((p) => p.id !== id); });
  return Response.json({ ok: true });
}
