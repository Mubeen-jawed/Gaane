"use client";

import { useState } from "react";

export default function LoginForm() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    const res = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    if (res.ok) {
      location.href = "/";
      return;
    }
    setError((await res.json().catch(() => ({}))).error || "Sign in failed.");
    setBusy(false);
  };

  return (
    <div className="overlay" style={{ background: "var(--bg)" }}>
      <form className="dialog raised" onSubmit={submit}>
        <div className="titlebar">
          <span aria-hidden>♫</span>
          <span className="grow">Welcome to Gaane</span>
        </div>
        <div className="dialog-body">
          <label htmlFor="pw">Password</label>
          <input
            id="pw"
            type="password"
            className="field sunken"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoFocus
            autoComplete="current-password"
          />
          {error && <div style={{ color: "#ff5a5a" }}>{error}</div>}
          <div className="dialog-actions">
            <button type="submit" className="btn raised" disabled={busy || !password}>
              {busy ? "Signing in…" : "OK"}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
