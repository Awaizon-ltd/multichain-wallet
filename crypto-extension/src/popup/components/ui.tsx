import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import type { DomainVerdict } from "../../shared/domainSecurity";

/* --------------------------------- icons --------------------------------- */

const PATHS: Record<string, string> = {
  send: "M7 17 17 7M8 7h9v9",
  receive: "M17 7 7 17M16 17H7V8",
  swap: "M7 4 3 8l4 4M3 8h14M17 20l4-4-4-4M21 16H7",
  copy: "M9 9h11v11H9zM5 15H4V4h11v1",
  check: "m5 12 5 5L20 7",
  home: "M3 11 12 4l9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z",
  clock: "M12 7v5l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0",
  settings:
    "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z",
  back: "M15 18 9 12l6-6",
  chevron: "m9 18 6-6-6-6",
  down: "m6 9 6 6 6-6",
  lock: "M6 11h12v10H6zM8 11V7a4 4 0 0 1 8 0v4",
  plus: "M12 5v14M5 12h14",
  globe: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18",
  shield: "M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z",
  eye: "M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z",
  x: "M18 6 6 18M6 6l12 12",
  external: "M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5",
  warning: "M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z",
  refresh: "M21 12a9 9 0 0 1-15.5 6.3L3 16M3 12a9 9 0 0 1 15.5-6.3L21 8M21 3v5h-5M3 21v-5h5",
  edit: "M4 20h4L19 9l-4-4L4 16zM14 6l4 4",
  network: "M12 2v6M12 16v6M4.9 4.9l4.2 4.2M14.9 14.9l4.2 4.2M2 12h6M16 12h6M4.9 19.1l4.2-4.2M14.9 9.1l4.2-4.2",
  key: "M15 7a4 4 0 1 1-3.9 5H3v3h3v3h3v-3h2.1A4 4 0 0 1 15 7zM15 11h.01",
  info: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 16v-4M12 8h.01",
  trash: "M4 7h16M10 11v6M14 11v6M5 7l1 13h12l1-13M9 7V4h6v3",
  nft: "M4 4h16v16H4zM4 16l5-5 4 4 3-3 4 4M15 9h.01",
  chart: "M4 19h16M6 15l4-5 4 3 5-7",
};

export function Icon({ name, size = 18, stroke = 2 }: { name: keyof typeof PATHS | string; size?: number; stroke?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={PATHS[name] ?? PATHS.info} />
    </svg>
  );
}

/* -------------------------------- toast --------------------------------- */

const ToastCtx = createContext<(msg: string) => void>(() => {});
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    if (!msg) return;
    const t = setTimeout(() => setMsg(null), 1800);
    return () => clearTimeout(t);
  }, [msg]);
  return (
    <ToastCtx.Provider value={setMsg}>
      {children}
      {msg && (
        <div className="toast" role="status">
          {msg}
        </div>
      )}
    </ToastCtx.Provider>
  );
}

export function useCopy() {
  const toast = useToast();
  return useCallback(
    async (text: string, label = "Copied") => {
      await navigator.clipboard.writeText(text);
      toast(label);
    },
    [toast],
  );
}

/* ------------------------------- building blocks ------------------------------- */

export function TopBar({ title, onBack, right }: { title: ReactNode; onBack?: () => void; right?: ReactNode }) {
  return (
    <div className="topbar">
      {onBack ? (
        <button className="icon-btn" onClick={onBack} aria-label="Back">
          <Icon name="back" />
        </button>
      ) : (
        <span className="spacer" />
      )}
      <h1>{title}</h1>
      {right ?? <span className="spacer" />}
    </div>
  );
}

export function Spinner() {
  return <span className="spinner" aria-label="Loading" />;
}

export function Button({
  variant = "primary",
  loading,
  children,
  className = "",
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "danger" | "ghost"; loading?: boolean }) {
  return (
    <button className={`btn ${variant} ${className}`} disabled={loading || rest.disabled} {...rest}>
      {loading ? <Spinner /> : children}
    </button>
  );
}

export function Banner({ kind = "warning", children }: { kind?: "warning" | "danger" | "info"; children: ReactNode }) {
  return (
    <div className={`banner ${kind}`} role={kind === "danger" ? "alert" : undefined}>
      <Icon name={kind === "info" ? "info" : "warning"} size={16} />
      <div className="grow">{children}</div>
    </div>
  );
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="toggle" aria-label={label}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span />
    </label>
  );
}

export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" role="dialog" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <span className="h3 grow">{title}</span>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <Icon name="x" />
          </button>
        </div>
        <div className="sheet-body">{children}</div>
      </div>
    </div>
  );
}

/** Deterministic two-tone avatar from an address. */
export function Avatar({ seed, label, size }: { seed: string; label?: string; size?: number }) {
  let h = 0;
  for (const c of seed) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const a = h % 360;
  const b = (a + 60) % 360;
  return (
    <div
      className="avatar"
      style={{ background: `linear-gradient(135deg, hsl(${a} 85% 70%), hsl(${b} 80% 55%))`, width: size, height: size }}
    >
      {label}
    </div>
  );
}

export function TokenIcon({ src, symbol, chainIcon }: { src?: string; symbol: string; chainIcon?: string }) {
  const [broken, setBroken] = useState(false);
  return (
    <div className="token-icon">
      {src && !broken ? <img src={src} alt="" onError={() => setBroken(true)} /> : symbol.slice(0, 3).toUpperCase()}
      {chainIcon && <img className="chain" src={chainIcon} alt="" />}
    </div>
  );
}

export function SiteIcon({ origin }: { origin: string }) {
  const [broken, setBroken] = useState(false);
  return (
    <div className="site-icon">
      {!broken ? <img src={`${origin}/favicon.ico`} alt="" onError={() => setBroken(true)} /> : <Icon name="globe" />}
    </div>
  );
}

export function SecurityNotice({ verdict }: { verdict?: DomainVerdict }) {
  if (!verdict) return null;
  if (verdict.isLegitimate) {
    return (
      <span className="pill ok">
        <Icon name="shield" size={12} /> Verified {verdict.category}
      </span>
    );
  }
  if (!verdict.warnings.length) return null;
  return (
    <Banner kind={verdict.isHighRisk ? "danger" : "warning"}>
      <strong>{verdict.isHighRisk ? "This site may be a scam" : "Be careful with this site"}</strong>
      <ul>
        {verdict.warnings.map((w) => (
          <li key={w}>{w}</li>
        ))}
      </ul>
    </Banner>
  );
}

export function Kv({ k, children }: { k: ReactNode; children: ReactNode }) {
  return (
    <div className="kv">
      <span className="k">{k}</span>
      <span className="v">{children}</span>
    </div>
  );
}
