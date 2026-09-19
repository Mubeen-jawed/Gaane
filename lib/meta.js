// Helpers for turning a file / URL into song metadata.

export function parseName(raw) {
  let name = decodeURIComponent(raw.split(/[/\\]/).pop() || raw)
    .replace(/\?.*$/, "")
    .replace(/\.[a-z0-9]{2,5}$/i, "")
    .replace(/_/g, " ")
    .trim();
  const dash = name.indexOf(" - ");
  if (dash > 0) return { artist: name.slice(0, dash).trim(), title: name.slice(dash + 3).trim() };
  return { artist: "", title: name || "Untitled" };
}

// Reads the duration from the audio header only (preload="metadata"),
// so large files do not need to be decoded. Resolves -1 if it can't be played.
export function readDuration(src) {
  return new Promise((resolve) => {
    const a = new Audio();
    a.preload = "metadata";
    let settled = false;
    const done = (d) => {
      if (settled) return;
      settled = true;
      a.removeAttribute("src");
      a.load();
      resolve(Number.isFinite(d) ? d : 0);
    };
    a.onloadedmetadata = () => done(a.duration);
    a.onerror = () => done(-1);
    setTimeout(() => done(0), 10000);
    a.src = src;
  });
}

export function fmt(sec) {
  if (!Number.isFinite(sec) || sec <= 0) return "0:00";
  const s = Math.floor(sec);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  const ss = String(s % 60).padStart(2, "0");
  return h ? `${h}:${String(m % 60).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}

export function shuffled(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = (Math.random() * (i + 1)) | 0;
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export const AUDIO_EXT = /\.(mp3|m4a|aac|wav|ogg|oga|opus|flac|webm|weba|mp4)$/i;
