import { spawn } from "node:child_process";
import { createWriteStream, existsSync } from "node:fs";
import { mkdtemp, rename, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import ffmpegPath from "ffmpeg-static";
import { parseName } from "../meta";
import { MIME, SONGS_DIR, read, uid, update } from "./store";

export const YT_HOSTS = /(^|\.)(youtube\.com|youtu\.be|youtube-nocookie\.com)$/i;
const MAX_SECONDS = 60 * 60;
export const MAX_BYTES = 300 * 1024 * 1024;

const ytDlpPath = path.join(
  process.cwd(), "node_modules", "youtube-dl-exec", "bin",
  process.platform === "win32" ? "yt-dlp.exe" : "yt-dlp"
);

function exec(bin, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { windowsHide: true });
    let out = "";
    let err = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (err += d));
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, out, err }));
  });
}

// Song length from the file header, via ffmpeg (no ffprobe needed).
export async function probeDuration(file) {
  const { err } = await exec(ffmpegPath, ["-hide_banner", "-i", file]);
  const m = /Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(err);
  return m ? +m[1] * 3600 + +m[2] * 60 + +m[3] : 0;
}

// Tidy typical video titles: "Artist - Song (Official Video) [4K]"
function tidy(title, fallbackArtist) {
  const clean = title
    .replace(/\s*[([][^)\]]*(official|video|audio|lyrics?|visuali[sz]er|hd|4k|mv)[^)\]]*[)\]]/gi, "")
    .trim();
  const split = parseName(clean + ".mp3");
  return split.artist ? split : { title: clean || title, artist: fallbackArtist || "" };
}

// Moves a finished file into the library and records it.
async function addToLibrary(srcFile, ext, meta) {
  await read(); // makes sure the songs folder exists
  const id = uid();
  const file = id + ext;
  await rename(srcFile, path.join(SONGS_DIR, file)).catch(async (e) => {
    if (e.code !== "EXDEV") throw e; // different disk: copy instead
    const { copyFile, unlink } = await import("node:fs/promises");
    await copyFile(srcFile, path.join(SONGS_DIR, file));
    await unlink(srcFile);
  });
  const duration = meta.duration || (await probeDuration(path.join(SONGS_DIR, file)));
  const song = {
    id, file,
    title: meta.title || "Untitled",
    artist: meta.artist || "",
    duration,
    size: (await stat(path.join(SONGS_DIR, file))).size,
    addedAt: Date.now(),
  };
  await update((db) => { db.songs.push(song); });
  return song;
}

export async function importYouTube(url) {
  if (!existsSync(ytDlpPath)) throw new Error("yt-dlp is missing. Run `npm install` again.");
  const dir = await mkdtemp(path.join(tmpdir(), "gaane-"));
  try {
    const { code, out, err } = await exec(ytDlpPath, [
      "--no-playlist", "--no-progress",
      "--match-filter", `duration <= ${MAX_SECONDS} & !is_live`,
      "-f", "bestaudio/best",
      "-x", "--audio-format", "mp3", "--audio-quality", "0",
      "--ffmpeg-location", ffmpegPath,
      "--restrict-filenames",
      "-o", path.join(dir, "%(id)s.%(ext)s"),
      "--print", "after_move:%(.{title,track,artist,uploader,channel,duration,filepath})j",
      url,
    ]);
    if (code !== 0) {
      const msg = err.split("\n").filter((l) => l.startsWith("ERROR")).pop() || err.trim();
      throw new Error((msg || `yt-dlp exited with ${code}`).replace(/^ERROR:\s*/, ""));
    }
    const line = out.trim().split("\n").pop();
    if (!line) throw new Error("Skipped: live streams and videos over 1 hour aren't downloaded.");
    const info = JSON.parse(line);
    const uploader = (info.channel || info.uploader || "").replace(/\s*-\s*Topic$/i, "");
    const names = info.track
      ? { title: info.track, artist: info.artist || uploader }
      : tidy(info.title || "YouTube audio", uploader);
    return await addToLibrary(info.filepath, ".mp3", { ...names, duration: info.duration });
  } finally {
    rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

// Refuse links that point at the server itself or a private network.
function isPrivateIp(ip) {
  if (ip.startsWith("::ffff:")) ip = ip.slice(7);
  if (/^(127\.|10\.|0\.|169\.254\.|192\.168\.)/.test(ip)) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(ip)) return true;
  if (/^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(ip)) return true;
  const v6 = ip.toLowerCase();
  return v6 === "::1" || v6 === "::" || /^f[cd]/.test(v6) || /^fe[89ab]/.test(v6);
}

async function safeFetch(url) {
  for (let hop = 0; hop < 5; hop++) {
    const u = new URL(url);
    if (!/^https?:$/.test(u.protocol)) throw new Error("Only http(s) links are supported.");
    const { lookup } = await import("node:dns/promises");
    const addrs = await lookup(u.hostname.replace(/^\[|\]$/g, ""), { all: true });
    if (!addrs.length || addrs.some((a) => isPrivateIp(a.address))) {
      throw new Error("That link points to a private address.");
    }
    const res = await fetch(u, { redirect: "manual" });
    if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
      url = new URL(res.headers.get("location"), u).href;
      continue;
    }
    return { res, finalUrl: u.href };
  }
  throw new Error("Too many redirects.");
}

// Direct link to an audio file: the server downloads it (no CORS limits here).
export async function importDirect(url) {
  const { res, finalUrl } = await safeFetch(url);
  if (!res.ok || !res.body) throw new Error(`The link returned ${res.status}.`);
  const type = (res.headers.get("content-type") || "").split(";")[0].trim();
  let ext = path.extname(new URL(finalUrl).pathname).toLowerCase();
  if (!MIME[ext]) ext = Object.keys(MIME).find((k) => MIME[k] === type) || "";
  if (!ext) throw new Error("That link isn't an audio file. Use a YouTube link or a direct .mp3/.m4a link.");
  if (+res.headers.get("content-length") > MAX_BYTES) throw new Error("File is too big (300 MB max).");

  const dir = await mkdtemp(path.join(tmpdir(), "gaane-"));
  const tmp = path.join(dir, "file" + ext);
  try {
    let bytes = 0;
    const body = Readable.fromWeb(res.body);
    body.on("data", (c) => {
      bytes += c.length;
      if (bytes > MAX_BYTES) body.destroy(new Error("File is too big (300 MB max)."));
    });
    await pipeline(body, createWriteStream(tmp));
    const duration = await probeDuration(tmp);
    if (!duration) throw new Error("Couldn't read that file as audio.");
    return await addToLibrary(tmp, ext, { ...parseName(new URL(url).pathname), duration });
  } finally {
    rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

// Uploaded file (from the browser).
export async function importUpload(file, meta) {
  let ext = path.extname(file.name || "").toLowerCase();
  if (!MIME[ext]) ext = Object.keys(MIME).find((k) => MIME[k] === file.type) || "";
  if (!ext) throw new Error(`${file.name} isn't a supported audio file.`);
  if (file.size > MAX_BYTES) throw new Error(`${file.name} is too big (300 MB max).`);
  const dir = await mkdtemp(path.join(tmpdir(), "gaane-"));
  const tmp = path.join(dir, "file" + ext);
  try {
    await pipeline(Readable.fromWeb(file.stream()), createWriteStream(tmp));
    const names = parseName(file.name);
    return await addToLibrary(tmp, ext, {
      title: meta.title || names.title,
      artist: meta.artist ?? names.artist,
      duration: +meta.duration || 0,
    });
  } finally {
    rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}
