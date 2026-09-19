// Browser-side calls to the Gaane server.

async function call(url, opts) {
  const res = await fetch(url, opts);
  if (res.status === 401) {
    location.href = "/login";
    throw new Error("Please sign in again.");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status}).`);
  return data;
}

const json = (method, body) => ({
  method,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

export const audioUrl = (id) => `/api/songs/${id}/audio`;

export const getLibrary = () => call("/api/library", { cache: "no-store" });

export function uploadSong(file, meta) {
  const form = new FormData();
  form.append("file", file);
  form.append("title", meta.title || "");
  form.append("artist", meta.artist || "");
  form.append("duration", String(meta.duration || 0));
  return call("/api/songs", { method: "POST", body: form });
}

export const importUrl = (url) => call("/api/import", json("POST", { url }));
export const deleteSong = (id) => call(`/api/songs/${id}`, { method: "DELETE" });
export const savePlaylist = (pl) => call("/api/playlists", json("POST", pl));
export const deletePlaylist = (id) => call(`/api/playlists/${id}`, { method: "DELETE" });

export function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}
