"use client";

import { useEffect, useRef, useState } from "react";

// A small Win95-style prompt window.
export default function Dialog({ title, label, initial = "", placeholder, okText = "OK", okRight = false, onOk, onClose }) {
  const [value, setValue] = useState(initial);
  const input = useRef(null);

  useEffect(() => {
    input.current?.focus();
    input.current?.select();
  }, []);

  const submit = (e) => {
    e.preventDefault();
    if (value.trim()) onOk(value.trim());
  };

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form className="dialog raised" onSubmit={submit} onKeyDown={(e) => e.key === "Escape" && onClose()}>
        <div className="titlebar">
          <span className="grow">{title}</span>
          <button type="button" className="tb-btn raised" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div className="dialog-body">
          <label htmlFor="dlg-input">{label}</label>
          <input
            id="dlg-input"
            ref={input}
            className="field sunken"
            value={value}
            placeholder={placeholder}
            onChange={(e) => setValue(e.target.value)}
            autoComplete="off"
          />
          <div className="dialog-actions">
            {!okRight && <button type="submit" className="btn raised">{okText}</button>}
            <button type="button" className="btn raised" onClick={onClose}>Cancel</button>
            {okRight && <button type="submit" className="btn raised">{okText}</button>}
          </div>
        </div>
      </form>
    </div>
  );
}
