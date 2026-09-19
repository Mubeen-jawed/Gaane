// Server-side library: audio files in DATA_DIR/songs, metadata in library.json.
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";

export const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), "data");
export const SONGS_DIR = path.join(DATA_DIR, "songs");
const DB_FILE = path.join(DATA_DIR, "library.json");

export const MIME = {
  ".mp3": "audio/mpeg", ".m4a": "audio/mp4", ".mp4": "audio/mp4", ".aac": "audio/aac",
  ".wav": "audio/wav", ".ogg": "audio/ogg", ".oga": "audio/ogg", ".opus": "audio/ogg",
  ".flac": "audio/flac", ".webm": "audio/webm", ".weba": "audio/webm",
};

export const validId = (id) => typeof id === "string" && /^[a-z0-9]{6,40}$/.test(id);

export function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

// One in-memory copy, loaded once; every change is written atomically and
// one at a time so concurrent requests can't corrupt the file.
let cache = null;
let queue = Promise.resolve();

async function load() {
  if (cache) return cache;
  await mkdir(SONGS_DIR, { recursive: true });
  try {
    cache = JSON.parse(await readFile(DB_FILE, "utf8"));
  } catch (e) {
    if (e.code !== "ENOENT") throw e;
    cache = { songs: [], playlists: [] };
  }
  return cache;
}

export async function read() {
  return load();
}

export function update(fn) {
  const run = queue.then(async () => {
    const db = await load();
    const result = await fn(db);
    const tmp = DB_FILE + ".tmp";
    await writeFile(tmp, JSON.stringify(db));
    await rename(tmp, DB_FILE);
    return result;
  });
  queue = run.catch(() => {});
  return run;
}

export function songPath(song) {
  return path.join(SONGS_DIR, song.file);
}

export async function removeSongFile(song) {
  await rm(songPath(song), { force: true });
}
