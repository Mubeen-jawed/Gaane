"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as api from "../lib/api";
import { AUDIO_EXT, parseName, readDuration } from "../lib/meta";
import usePlayer from "../lib/usePlayer";
import SeekBar from "./SeekBar";
import TrackTable, { drag } from "./TrackTable";
import Dialog from "./Dialog";

const LIBRARY = "library";

export default function Player() {
  const [songs, setSongs] = useState([]);
  const [playlists, setPlaylists] = useState([]);
  const [ready, setReady] = useState(false);
  const [view, setView] = useState(LIBRARY);
  const [selected, setSelected] = useState(() => new Set());
  const [dialog, setDialog] = useState(null);
  const [status, setStatus] = useState("");
  const [dropTarget, setDropTarget] = useState(null);
  const [fileDrag, setFileDrag] = useState(false);
  const anchor = useRef(-1);
  const fileInput = useRef(null);

  const songsById = useMemo(() => new Map(songs.map((s) => [s.id, s])), [songs]);
  const p = usePlayer(songsById);

  // ---------- load everything once ----------
  useEffect(() => {
    (async () => {
      let s, pl;
      try {
        ({ songs: s, playlists: pl } = await api.getLibrary());
      } catch (e) {
        setStatus(`Couldn't load your library: ${e.message}`);
        return;
      }
      s.sort((a, b) => b.addedAt - a.addedAt);
      pl.sort((a, b) => a.createdAt - b.createdAt);
      setSongs(s);
      setPlaylists(pl);
      setReady(true);
      p.restore(new Set(s.map((x) => x.id)));
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const playlist = view === LIBRARY ? null : playlists.find((x) => x.id === view);
  useEffect(() => { if (view !== LIBRARY && !playlist && ready) setView(LIBRARY); }, [view, playlist, ready]);

  const viewSongs = useMemo(() => {
    if (!playlist) return songs;
    return playlist.songIds.map((id) => songsById.get(id)).filter(Boolean);
  }, [playlist, songs, songsById]);
  const viewIds = useMemo(() => viewSongs.map((s) => s.id), [viewSongs]);

  // Keep the play queue in step with whatever list it came from.
  useEffect(() => { if (ready) p.syncSource(LIBRARY, songs.map((s) => s.id)); }, [songs, ready]); // eslint-disable-line
  useEffect(() => {
    for (const pl of playlists) p.syncSource(pl.id, pl.songIds.filter((id) => songsById.has(id)));
  }, [playlists]); // eslint-disable-line

  useEffect(() => setSelected(new Set()), [view]);

  // ---------- adding songs ----------
  const addSongs = useCallback(async (entries) => {
    // entries: [{ file }] or [{ url }]
    const added = [];
    let n = 0;
    for (const e of entries) {
      n++;
      const yt = e.url && /youtu\.?be/i.test(e.url);
      const verb = e.file ? "Uploading" : yt ? "Downloading from YouTube & converting to MP3" : "Downloading";
      setStatus(`${verb} ${n} of ${entries.length}…`);
      try {
        let meta;
        if (e.file) {
          // Check it plays here first, so broken files never get uploaded.
          const tmp = URL.createObjectURL(e.file);
          const duration = await readDuration(tmp);
          URL.revokeObjectURL(tmp);
          if (duration < 0) { setStatus(`${e.file.name} can't be played.`); continue; }
          meta = await api.uploadSong(e.file, { ...parseName(e.file.name), duration });
        } else {
          meta = await api.importUrl(e.url);
        }
        added.push(meta);
      } catch (err) {
        console.error(err);
        setStatus(`Couldn't add that one: ${err.message}`);
      }
    }
    if (!added.length) return;
    setSongs((prev) => [...added.slice().reverse(), ...prev]);
    setStatus(`Added ${added.length} song${added.length > 1 ? "s" : ""}.`);
    // Nothing playing yet? Start the music right away.
    if (!p.currentId) p.playList(added.map((s) => s.id), 0, null);
  }, [p]);

  const onFiles = (files) => {
    const list = [...files].filter((f) => f.type.startsWith("audio/") || AUDIO_EXT.test(f.name));
    if (list.length) addSongs(list.map((file) => ({ file })));
    else if (files.length) setStatus("Those files aren't audio.");
  };

  // ---------- playlists ----------
  // Update the screen immediately; the server save happens in the background.
  const persist = (promise) => promise.catch((e) => setStatus(`Couldn't save: ${e.message}`));

  const savePlaylist = useCallback((pl) => {
    setPlaylists((prev) => prev.map((x) => (x.id === pl.id ? pl : x)));
    persist(api.savePlaylist(pl));
  }, []);

  const createPlaylist = (name, songIds = []) => {
    const pl = { id: api.uid(), name, songIds, createdAt: Date.now() };
    setPlaylists((prev) => [...prev, pl]);
    persist(api.savePlaylist(pl));
    return pl;
  };

  const addToPlaylist = (pl, ids) => {
    const have = new Set(pl.songIds);
    const fresh = ids.filter((id) => !have.has(id));
    if (fresh.length) savePlaylist({ ...pl, songIds: [...pl.songIds, ...fresh] });
    setStatus(fresh.length ? `Added ${fresh.length} to “${pl.name}”.` : `Already in “${pl.name}”.`);
  };

  const deletePlaylist = (pl) => {
    if (!confirm(`Delete playlist “${pl.name}”? Songs stay in your library.`)) return;
    setPlaylists((prev) => prev.filter((x) => x.id !== pl.id));
    persist(api.deletePlaylist(pl.id));
  };

  const reorder = (ids, beforeIndex) => {
    if (!playlist) return;
    const list = playlist.songIds.filter((id) => songsById.has(id));
    const target = list[beforeIndex];
    if (ids.includes(target)) return;
    const moving = new Set(ids);
    const rest = list.filter((id) => !moving.has(id));
    const at = rest.indexOf(target);
    rest.splice(at < 0 ? rest.length : at, 0, ...ids);
    savePlaylist({ ...playlist, songIds: rest });
  };

  // ---------- removing ----------
  const removeFromView = (ids) => {
    if (playlist) {
      const gone = new Set(ids);
      savePlaylist({ ...playlist, songIds: playlist.songIds.filter((id) => !gone.has(id)) });
      return;
    }
    const msg = ids.length === 1
      ? `Delete “${songsById.get(ids[0])?.title}” from your library?`
      : `Delete ${ids.length} songs from your library?`;
    if (!confirm(msg)) return;
    const gone = new Set(ids);
    p.removeSongs(gone);
    setSongs((prev) => prev.filter((s) => !gone.has(s.id)));
    // The server also removes deleted songs from every playlist.
    setPlaylists((prev) =>
      prev.map((pl) =>
        pl.songIds.some((id) => gone.has(id))
          ? { ...pl, songIds: pl.songIds.filter((id) => !gone.has(id)) }
          : pl
      )
    );
    for (const id of ids) persist(api.deleteSong(id));
    setSelected(new Set());
  };

  // ---------- selection ----------
  const onSelect = (id, index, e) => {
    const multi = e.shiftKey || e.ctrlKey || e.metaKey;
    // A plain click plays the song straight away (unless it's already the one playing).
    if (!multi) {
      const same = id === p.currentId && p.queue.source === (playlist ? playlist.id : LIBRARY);
      if (!same) playView(index);
      else if (!p.playing) p.toggle();
    }
    setSelected((prev) => {
      if (e.shiftKey && anchor.current >= 0) {
        const [a, b] = [anchor.current, index].sort((x, y) => x - y);
        return new Set(viewIds.slice(a, b + 1));
      }
      anchor.current = index;
      if (e.ctrlKey || e.metaKey) {
        const next = new Set(prev);
        next.has(id) ? next.delete(id) : next.add(id);
        return next;
      }
      return new Set([id]);
    });
  };

  const playView = (index = -1, forceShuffle) =>
    p.playList(viewIds, index, playlist ? playlist.id : LIBRARY, forceShuffle);

  // ---------- keyboard ----------
  useEffect(() => {
    const onKey = (e) => {
      if (e.target.closest?.("input, textarea") || dialog) return;
      if (e.code === "Space") { e.preventDefault(); p.toggle(); }
      else if (e.key === "ArrowRight" && e.ctrlKey) p.next();
      else if (e.key === "ArrowLeft" && e.ctrlKey) p.prev();
      else if (e.key === "Delete" && selected.size) removeFromView([...selected]);
      else if (e.key === "a" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); setSelected(new Set(viewIds)); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // ---------- drag & drop from the desktop ----------
  const isFileDrag = (e) => e.dataTransfer?.types?.includes("Files");
  const winDrag = {
    onDragOver: (e) => { if (isFileDrag(e)) { e.preventDefault(); setFileDrag(true); } },
    onDragLeave: (e) => { if (!e.relatedTarget) setFileDrag(false); },
    onDrop: (e) => {
      if (!isFileDrag(e)) return;
      e.preventDefault();
      setFileDrag(false);
      onFiles(e.dataTransfer.files);
    },
  };

  // Sidebar drop targets for dragged songs.
  const dropProps = (key, onDropIds) => ({
    onDragOver: (e) => {
      if (!drag.ids) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
      if (dropTarget !== key) setDropTarget(key);
    },
    onDragLeave: () => setDropTarget((t) => (t === key ? null : t)),
    onDrop: (e) => {
      if (!drag.ids) return;
      e.preventDefault();
      e.stopPropagation();
      setDropTarget(null);
      onDropIds(drag.ids);
    },
  });

  const current = p.currentId ? songsById.get(p.currentId) : null;
  const totalTime = viewSongs.reduce((t, s) => t + (s.duration || 0), 0);

  return (
    <div className="app" {...winDrag}>
      <div className={"window raised" + (fileDrag ? " dropzone-on" : "")}>
        <div className="titlebar">
          <span aria-hidden>♫</span>
          <span className="grow">
            Gaane{current ? ` — ${current.title}${current.artist ? " · " + current.artist : ""}` : ""}
          </span>
        </div>

        <div className="menubar">
          <button className="btn raised" onClick={() => fileInput.current.click()}>📁 Add files</button>
          <button className="btn raised" onClick={() => setDialog("new")}>➕ New playlist</button>
          <button className="btn raised" onClick={() => setDialog("url")}>🌐 Add from web</button>
          <input
            ref={fileInput}
            type="file"
            accept="audio/*"
            multiple
            hidden
            onChange={(e) => { onFiles(e.target.files); e.target.value = ""; }}
          />
        </div>

        <div className="body">
          <aside className="panel sunken">
            <div
              className={"nav-item" + (view === LIBRARY ? " active" : "")}
              onClick={() => setView(LIBRARY)}
            >
              <span>💿</span> All Songs <span className="count">{songs.length}</span>
            </div>
            <div className="sep" />
            <div className="panel-head" style={{ padding: "2px 6px 4px", fontWeight: "normal", color: "var(--dim)" }}>
              Playlists
            </div>
            <div className="list" style={{ contain: "none" }}>
              {playlists.map((pl) => (
                <div
                  key={pl.id}
                  className={
                    "nav-item" + (view === pl.id ? " active" : "") + (dropTarget === pl.id ? " drop" : "")
                  }
                  onClick={() => setView(pl.id)}
                  onDoubleClick={() => setDialog({ rename: pl })}
                  title="Drop songs here · double-click to rename"
                  {...dropProps(pl.id, (ids) => addToPlaylist(pl, ids))}
                >
                  <span>{p.queue.source === pl.id && p.playing ? "🔊" : "📂"}</span>
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{pl.name}</span>
                  <span className="count">{pl.songIds.length}</span>
                </div>
              ))}
              <div
                className={"nav-item" + (dropTarget === "new" ? " drop" : "")}
                style={{ color: "var(--dim)" }}
                onClick={() => setDialog("new")}
                {...dropProps("new", (ids) => setDialog({ newWith: ids }))}
              >
                <span>➕</span> {playlists.length ? "New playlist" : "Drag songs here to make a playlist"}
              </div>
            </div>
          </aside>

          <section className="panel sunken">
            <div className="panel-head">
              <span className="grow" style={{ fontSize: 14 }}>
                {playlist ? playlist.name : "All Songs"}
                <span style={{ color: "var(--dim)", fontWeight: "normal", fontSize: 12 }}>
                  {"  "}· {viewSongs.length} songs · {Math.round(totalTime / 60)} min
                </span>
              </span>
              <button className="btn raised" disabled={!viewIds.length} onClick={() => playView(-1, false)}>
                ▶ Play
              </button>
              <button className="btn raised" disabled={!viewIds.length} onClick={() => playView(-1, true)}>
                🔀 Shuffle
              </button>
              {playlist && (
                <button className="btn raised" onClick={() => deletePlaylist(playlist)} title="Delete playlist">
                  🗑
                </button>
              )}
            </div>
            <div className="list">
              {!ready ? null : viewSongs.length ? (
                <TrackTable
                  songs={viewSongs}
                  currentId={p.currentId}
                  selected={selected}
                  onSelect={onSelect}
                  onPlay={(i) => playView(i)}
                  onRemove={(id) => removeFromView(selected.has(id) ? [...selected] : [id])}
                  removeLabel={playlist ? "Remove from playlist" : "Delete song"}
                  onReorder={playlist ? reorder : null}
                />
              ) : (
                <div className="empty">
                  {playlist ? (
                    <div>This playlist is empty.<br />Drag songs from <b>All Songs</b> onto “{playlist.name}” in the sidebar.</div>
                  ) : (
                    <div>
                      Drop audio files anywhere in this window,<br />
                      or use <b>Add files</b> / <b>Add from web</b>.<br />
                      Everything you add stays here.
                    </div>
                  )}
                </div>
              )}
            </div>
          </section>
        </div>

        <footer className="player raised">
          <div className="now">
            <div className="art sunken">{p.playing ? "♫" : "♪"}</div>
            <div className="now-text">
              <div className="now-title">{current ? current.title : "Nothing playing"}</div>
              <div className="now-sub">{current ? current.artist || "Unknown artist" : "Add some music to begin"}</div>
            </div>
          </div>

          <div className="center">
            <div className="controls">
              <button className={"btn raised round" + (p.shuffle ? " on" : "")} onClick={p.toggleShuffle} title="Shuffle">
                🔀
              </button>
              <button className="btn raised round" onClick={p.prev} title="Previous (Ctrl+←)">⏮</button>
              <button data-ctl className="btn raised round play" onClick={p.toggle} title="Play/Pause (Space)">
                {p.playing ? "⏸" : "▶"}
              </button>
              <button className="btn raised round" onClick={() => p.next()} title="Next (Ctrl+→)">⏭</button>
              <button
                className={"btn raised round" + (p.repeat !== "off" ? " on" : "")}
                onClick={p.cycleRepeat}
                title={`Repeat: ${p.repeat}`}
              >
                {p.repeat === "one" ? "🔂" : "🔁"}
              </button>
            </div>
            <SeekBar audio={p.audio} />
          </div>

          <div className="right">
            <span title="Volume">{p.volume === 0 ? "🔇" : "🔊"}</span>
            <input
              className="vol"
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={p.volume}
              style={{ "--p": p.volume * 100 + "%" }}
              onChange={(e) => p.setVolume(+e.target.value)}
              aria-label="Volume"
            />
          </div>
        </footer>

        <div className="status">
          <div className="sunken">
            {p.blocked ? "▶ Click anywhere to start the music." : status || "Ready"}
          </div>
          <div className="sunken">
            {p.queue.ids.length ? `Track ${p.queue.index + 1} of ${p.queue.ids.length}` : "Queue empty"}
          </div>
        </div>
      </div>

      <audio ref={p.setAudio} preload="auto" />

      {dialog === "url" && (
        <Dialog
          title="Add from web"
          label="A YouTube video link (saved as MP3), or a direct link to an audio file. Separate several links with spaces."
          placeholder="https://www.youtube.com/watch?v=…"
          okText="Add"
          okRight
          onClose={() => setDialog(null)}
          onOk={(v) => {
            setDialog(null);
            addSongs(v.split(/\s+/).filter(Boolean).map((url) => ({ url })));
          }}
        />
      )}
      {(dialog === "new" || dialog?.newWith) && (
        <Dialog
          title="New playlist"
          label="Playlist name"
          initial={`Playlist ${playlists.length + 1}`}
          okText="Create"
          onClose={() => setDialog(null)}
          onOk={(name) => {
            const pl = createPlaylist(name, dialog.newWith || []);
            setDialog(null);
            setView(pl.id);
          }}
        />
      )}
      {dialog?.rename && (
        <Dialog
          title="Rename playlist"
          label="Playlist name"
          initial={dialog.rename.name}
          okText="Rename"
          onClose={() => setDialog(null)}
          onOk={(name) => {
            const cur = playlists.find((x) => x.id === dialog.rename.id);
            if (cur) savePlaylist({ ...cur, name });
            setDialog(null);
          }}
        />
      )}
    </div>
  );
}
