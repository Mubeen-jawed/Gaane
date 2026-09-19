"use client";

import { useEffect, useRef, useState } from "react";
import { fmt } from "../lib/meta";

// Subscribes to the <audio> element on its own so time updates only
// re-render this small bar, never the track list.
export default function SeekBar({ audio }) {
  const [time, setTime] = useState(0);
  const [dur, setDur] = useState(0);
  const dragging = useRef(false);

  useEffect(() => {
    if (!audio) return;
    const onTime = () => !dragging.current && setTime(audio.currentTime);
    const onDur = () => setDur(Number.isFinite(audio.duration) ? audio.duration : 0);
    audio.addEventListener("timeupdate", onTime);
    audio.addEventListener("durationchange", onDur);
    audio.addEventListener("loadedmetadata", onDur);
    const onEmpty = () => { setTime(0); setDur(0); };
    audio.addEventListener("emptied", onEmpty);
    return () => {
      audio.removeEventListener("emptied", onEmpty);
      audio.removeEventListener("timeupdate", onTime);
      audio.removeEventListener("durationchange", onDur);
      audio.removeEventListener("loadedmetadata", onDur);
    };
  }, [audio]);

  const pct = dur ? (time / dur) * 100 : 0;

  return (
    <div className="seek">
      <span>{fmt(time)}</span>
      <input
        type="range"
        min={0}
        max={dur || 1}
        step={0.1}
        value={time}
        style={{ "--p": pct + "%" }}
        aria-label="Seek"
        onPointerDown={() => (dragging.current = true)}
        onChange={(e) => setTime(+e.target.value)}
        onPointerUp={(e) => {
          dragging.current = false;
          if (audio) audio.currentTime = +e.target.value;
        }}
        onKeyUp={(e) => audio && (audio.currentTime = +e.target.value)}
      />
      <span>{fmt(dur)}</span>
    </div>
  );
}
