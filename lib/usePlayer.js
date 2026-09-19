"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { audioUrl } from "./api";
import { shuffled } from "./meta";

const SAVE_KEY = "gaane:player";

function load() {
  try { return JSON.parse(localStorage.getItem(SAVE_KEY)) || {}; } catch { return {}; }
}
function save(v) {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(v)); } catch {}
}

// Playback engine: one <audio> element, a queue of song ids, shuffle/repeat.
export default function usePlayer(songsById) {
  const [audio, setAudio] = useState(null);
  const [queue, setQueue] = useState({ ids: [], base: [], index: -1, source: null });
  const [playing, setPlaying] = useState(false);
  const [shuffle, setShuffle] = useState(false);
  const [repeat, setRepeat] = useState("all"); // "off" | "all" | "one"
  const [volume, setVolume] = useState(0.8);
  const [blocked, setBlocked] = useState(false);

  const q = useRef(queue);
  q.current = queue;
  const opts = useRef({ shuffle, repeat });
  opts.current = { shuffle, repeat };
  const songsRef = useRef(songsById);
  songsRef.current = songsById;
  const loadedId = useRef(null);
  const restored = useRef(false);

  const currentId = queue.index >= 0 ? queue.ids[queue.index] : null;

  const tryPlay = useCallback(() => {
    if (!audio) return;
    audio.play().then(
      () => setBlocked(false),
      (err) => { if (err?.name === "NotAllowedError") setBlocked(true); }
    );
  }, [audio]);

  // Load the current song into the audio element whenever it changes.
  const startAt = useRef(0);
  const autoStart = useRef(true);
  useEffect(() => {
    if (!audio) return;
    if (!currentId) {
      loadedId.current = null;
      audio.removeAttribute("src");
      audio.load();
      return;
    }
    if (loadedId.current === currentId) return;
    const song = songsRef.current.get(currentId);
    if (!song) return;
    loadedId.current = currentId;
    // Swapping src cuts the old song off instantly. Streamed from the server
    // with range requests, so playback starts after the first few KB.
    audio.src = audioUrl(currentId);
    if (startAt.current) {
      audio.currentTime = startAt.current;
      startAt.current = 0;
    }
    if (autoStart.current) tryPlay();
    autoStart.current = true;
  }, [audio, currentId, songsById, tryPlay]);

  const next = useCallback((fromEnded = false) => {
    const { ids, index, base } = q.current;
    if (!ids.length) return;
    if (fromEnded && opts.current.repeat === "one") {
      audio.currentTime = 0;
      tryPlay();
      return;
    }
    if (index + 1 < ids.length) {
      setQueue((s) => ({ ...s, index: s.index + 1 }));
    } else if (opts.current.repeat !== "off" || !fromEnded) {
      // Wrap around; a fresh shuffle each lap so it never feels repetitive.
      const newIds = opts.current.shuffle ? shuffled(base) : base;
      if (newIds.length === 1) { audio.currentTime = 0; tryPlay(); return; }
      setQueue((s) => ({ ...s, ids: newIds, index: 0 }));
    } else {
      setPlaying(false);
    }
  }, [audio, tryPlay]);

  const prev = useCallback(() => {
    const { ids, index } = q.current;
    if (!ids.length) return;
    if (audio.currentTime > 3 || ids.length === 1) {
      audio.currentTime = 0;
      return;
    }
    setQueue((s) => ({ ...s, index: s.index > 0 ? s.index - 1 : s.ids.length - 1 }));
  }, [audio]);

  // Start playing a list of ids (a playlist or the library).
  const playList = useCallback((ids, startIndex = -1, source = null, forceShuffle) => {
    if (!ids.length) return;
    const sh = forceShuffle ?? opts.current.shuffle;
    if (forceShuffle !== undefined) setShuffle(forceShuffle);
    let order, index;
    if (sh) {
      const first = startIndex >= 0 ? startIndex : (Math.random() * ids.length) | 0;
      const rest = ids.filter((_, i) => i !== first);
      order = [ids[first], ...shuffled(rest)];
      index = 0;
    } else {
      order = ids;
      index = Math.max(0, startIndex);
    }
    // Replaying the same song from the top: restart it.
    if (order[index] === loadedId.current) {
      audio.currentTime = 0;
      tryPlay();
    }
    setQueue({ ids: order, base: ids, index, source });
  }, [audio, tryPlay]);

  const toggle = useCallback(() => {
    if (!audio) return;
    if (!q.current.ids.length) return;
    if (audio.paused) tryPlay(); else audio.pause();
  }, [audio, tryPlay]);

  const toggleShuffle = useCallback(() => {
    const nextOn = !opts.current.shuffle;
    setShuffle(nextOn);
    setQueue((s) => {
      if (!s.ids.length) return s;
      const cur = s.ids[s.index];
      if (nextOn) {
        return { ...s, ids: [cur, ...shuffled(s.base.filter((id) => id !== cur))], index: 0 };
      }
      return { ...s, ids: s.base, index: Math.max(0, s.base.indexOf(cur)) };
    });
  }, []);

  const cycleRepeat = useCallback(() => {
    setRepeat((r) => (r === "all" ? "one" : r === "one" ? "off" : "all"));
  }, []);

  // Keep the queue in sync when songs are added to / removed from its source.
  const syncSource = useCallback((source, ids) => {
    setQueue((s) => {
      if (s.source !== source) return s;
      const set = new Set(ids);
      const cur = s.ids[s.index];
      const added = ids.filter((id) => !s.base.includes(id));
      const base = s.base.filter((id) => set.has(id)).concat(added);
      const tail = opts.current.shuffle ? shuffled(added) : added;
      const list = opts.current.shuffle ? s.ids.filter((id) => set.has(id)).concat(tail) : base;
      let index = list.indexOf(cur);
      if (index < 0) index = Math.min(s.index, list.length - 1);
      return { ...s, ids: list, base, index };
    });
  }, []);

  const removeSongs = useCallback((removed) => {
    setQueue((s) => {
      const cur = s.ids[s.index];
      const ids = s.ids.filter((id) => !removed.has(id));
      const base = s.base.filter((id) => !removed.has(id));
      let index = ids.indexOf(cur);
      if (index < 0) index = ids.length ? Math.min(s.index, ids.length - 1) : -1;
      return { ...s, ids, base, index };
    });
  }, []);

  // audio element events
  useEffect(() => {
    if (!audio) return;
    let errors = 0;
    const onPlay = () => { setPlaying(true); setBlocked(false); };
    const onPlaying = () => { errors = 0; };
    const onPause = () => setPlaying(false);
    const onEnded = () => next(true);
    // Skip unplayable tracks, but give up once every track has failed.
    const onError = () => {
      if (!audio.getAttribute("src")) return;
      if (++errors >= q.current.ids.length) { setPlaying(false); return; }
      setTimeout(() => next(true), 400);
    };
    audio.addEventListener("playing", onPlaying);
    audio.addEventListener("play", onPlay);
    audio.addEventListener("pause", onPause);
    audio.addEventListener("ended", onEnded);
    audio.addEventListener("error", onError);
    return () => {
      audio.removeEventListener("playing", onPlaying);
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("pause", onPause);
      audio.removeEventListener("ended", onEnded);
      audio.removeEventListener("error", onError);
    };
  }, [audio, next]);

  useEffect(() => { if (audio) audio.volume = volume; }, [audio, volume]);

  // If the browser blocked autoplay, start on the very first click/key.
  useEffect(() => {
    if (!blocked) return;
    // The play button handles its own click; starting here too would
    // immediately be undone by its toggle.
    const go = (e) => {
      if (e.code === "Space" || e.target.closest?.("[data-ctl]")) return;
      tryPlay();
    };
    window.addEventListener("pointerdown", go, { once: true, capture: true });
    window.addEventListener("keydown", go, { once: true, capture: true });
    return () => {
      window.removeEventListener("pointerdown", go, { capture: true });
      window.removeEventListener("keydown", go, { capture: true });
    };
  }, [blocked, tryPlay]);

  // Restore last session (queue, position, settings) and auto-start.
  const restore = useCallback((known) => {
    if (restored.current) return;
    restored.current = true;
    const s = load();
    if (typeof s.volume === "number") setVolume(s.volume);
    if (typeof s.shuffle === "boolean") setShuffle(s.shuffle);
    if (s.repeat) setRepeat(s.repeat);
    const ids = (s.ids || []).filter((id) => known.has(id));
    const base = (s.base || []).filter((id) => known.has(id));
    if (ids.length) {
      let index = ids.indexOf(s.currentId);
      if (index < 0) index = 0; else startAt.current = s.time || 0;
      setQueue({ ids, base: base.length ? base : ids, index, source: s.source ?? null });
    }
  }, []);

  // Persist (cheap, throttled by the natural rate of changes + a periodic tick).
  useEffect(() => {
    if (!restored.current) return;
    const write = () =>
      save({
        ids: queue.ids, base: queue.base, source: queue.source, currentId,
        time: audio?.currentTime || 0, shuffle, repeat, volume,
      });
    write();
    const t = setInterval(write, 5000);
    window.addEventListener("pagehide", write);
    return () => { clearInterval(t); window.removeEventListener("pagehide", write); };
  }, [queue, currentId, shuffle, repeat, volume, audio]);

  // Media keys / lock-screen controls.
  useEffect(() => {
    if (!("mediaSession" in navigator)) return;
    const ms = navigator.mediaSession;
    const song = currentId && songsById.get(currentId);
    ms.metadata = song ? new MediaMetadata({ title: song.title, artist: song.artist || "Gaane" }) : null;
    ms.setActionHandler("play", () => tryPlay());
    ms.setActionHandler("pause", () => audio?.pause());
    ms.setActionHandler("nexttrack", () => next());
    ms.setActionHandler("previoustrack", () => prev());
  }, [currentId, songsById, audio, next, prev, tryPlay]);

  return {
    setAudio, audio, currentId, queue, playing, shuffle, repeat, volume, blocked,
    setVolume, toggle, next, prev, playList, toggleShuffle, cycleRepeat,
    syncSource, removeSongs, restore,
  };
}
