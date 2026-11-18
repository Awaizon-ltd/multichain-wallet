import { useState } from "react";
import { call } from "../api";
import { Banner, Button } from "../components/ui";
import { useApp } from "../state";

export function Unlock({ onUnlocked, subtitle }: { onUnlocked?: () => void; subtitle?: string }) {
  const [pw, setPw] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const { refresh } = useApp();
  return (
    <form
      className="screen center"
      style={{ alignItems: "center", textAlign: "center", gap: 14 }}
      onSubmit={async (e) => {
        e.preventDefault();
        if (!pw) return;
        setBusy(true);
        setErr("");
        try {
          await call("unlock", { password: pw });
          await refresh();
          onUnlocked?.();
        } catch (e: any) {
          setErr(/Incorrect/.test(e.message) ? "Incorrect password" : e.message);
          setPw("");
        } finally {
          setBusy(false);
        }
      }}
    >
      <img className="logo-mark" src="icons/icon128.png" alt="" />
      <div>
        <h1 className="h2">Welcome back</h1>
        <p className="p" style={{ marginTop: 4 }}>
          {subtitle ?? "Enter your password to unlock Rizon."}
        </p>
      </div>
      <input
        className={`input ${err ? "error" : ""}`}
        type="password"
        placeholder="Password"
        autoFocus
        autoComplete="current-password"
        value={pw}
        onChange={(e) => setPw(e.target.value)}
        aria-label="Password"
      />
      {err && <Banner kind="danger">{err}</Banner>}
      <Button type="submit" className="block" loading={busy} disabled={!pw}>
        Unlock
      </Button>
      <p className="tiny muted">Forgot your password? Reinstall Rizon and import your recovery phrase.</p>
    </form>
  );
}
