"use client";

import { memo, useMemo, useRef, useState } from "react";
import { fmt } from "../lib/meta";

// Shared between the table and the sidebar while a drag is in progress
// (dataTransfer contents are not readable during dragover).
export const drag = { ids: null, fromIndex: -1 };

const Row = memo(function Row({ song, index, playing, selected, dropAbove, handlers }) {
  return (
    <tr
      className={
        "row" + (playing ? " playing" : "") + (selected ? " sel" : "") + (dropAbove ? " drop-above" : "")
      }
      draggable
      onDragStart={(e) => handlers.dragStart(e, song.id, index)}
      onDragEnd={handlers.dragEnd}
      onDragOver={(e) => handlers.dragOver(e, index)}
      onDrop={(e) => handlers.drop(e, index)}
      onClick={(e) => handlers.click(e, song.id, index)}
    >
      <td className="num">{playing ? "♪" : index + 1}</td>
      <td title={song.title}>{song.title}</td>
      <td className="col-artist" title={song.artist}>{song.artist || "—"}</td>
      <td className="dur">{fmt(song.duration)}</td>
      <td className="act">
        <button
          className="x-btn"
          title={handlers.removeLabel}
          onClick={(e) => {
            e.stopPropagation();
            handlers.remove(song.id, index);
          }}
        >
          ✕
        </button>
      </td>
    </tr>
  );
});

export default function TrackTable({
  songs, currentId, selected, onSelect, onPlay, onRemove, removeLabel, onReorder,
}) {
  const [dropAt, setDropAt] = useState(-1);
  const reorderable = !!onReorder;

  // Rows get a stable handler object so React.memo can skip them; the
  // functions forward to the latest closures kept in a ref.
  const latest = useRef(null);
  latest.current = {
    play: onPlay,
    remove: onRemove,
    click: (e, id, index) => onSelect(id, index, e),
    dragStart: (e, id, index) => {
      const ids = selected.has(id) ? songs.filter((s) => selected.has(s.id)).map((s) => s.id) : [id];
      drag.ids = ids;
      drag.fromIndex = index;
      e.dataTransfer.effectAllowed = "copyMove";
      e.dataTransfer.setData("text/plain", ids.length + " song(s)");
    },
    dragEnd: () => {
      drag.ids = null;
      setDropAt(-1);
    },
    dragOver: (e, index) => {
      if (!reorderable || !drag.ids) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      if (dropAt !== index) setDropAt(index);
    },
    drop: (e, index) => {
      if (!reorderable || !drag.ids) return;
      e.preventDefault();
      e.stopPropagation();
      onReorder(drag.ids, index);
      setDropAt(-1);
    },
  };
  const handlers = useMemo(() => {
    const h = {};
    for (const k of Object.keys(latest.current)) h[k] = (...a) => latest.current[k](...a);
    return h;
  }, []);
  handlers.removeLabel = removeLabel;

  return (
    <table className="tracks">
      <thead>
        <tr>
          <th className="num">#</th>
          <th>Title</th>
          <th className="col-artist">Artist</th>
          <th className="dur">Time</th>
          <th className="act"></th>
        </tr>
      </thead>
      <tbody onDragLeave={(e) => !e.currentTarget.contains(e.relatedTarget) && setDropAt(-1)}>
        {songs.map((s, i) => (
          <Row
            key={s.id + ":" + i}
            song={s}
            index={i}
            playing={s.id === currentId}
            selected={selected.has(s.id)}
            dropAbove={dropAt === i}
            handlers={handlers}
          />
        ))}
      </tbody>
    </table>
  );
}
