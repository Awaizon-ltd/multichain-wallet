import { formatUnits } from "ethers";

export const shortAddress = (a: string, n = 4) => (a.length > 2 * n + 3 ? `${a.slice(0, n + 2)}…${a.slice(-n)}` : a);

const usdFmt = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const usdSmall = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumSignificantDigits: 4 });

export function formatUsd(v: number | undefined | null): string {
  if (v === undefined || v === null || !Number.isFinite(v)) return "—";
  if (v === 0) return "$0.00";
  if (Math.abs(v) < 0.01) return v > 0 ? "<$0.01" : "-<$0.01";
  return usdFmt.format(v);
}

export function formatPrice(v: number | undefined | null): string {
  if (v === undefined || v === null || !Number.isFinite(v)) return "—";
  return v >= 1 ? usdFmt.format(v) : usdSmall.format(v);
}

export function formatPct(v: number | undefined | null): string {
  if (v === undefined || v === null || !Number.isFinite(v)) return "";
  const s = `${Math.abs(v).toFixed(2)}%`;
  return v >= 0 ? `+${s}` : `-${s}`;
}

/** Token amount with up to 6 significant digits, thousands separators, no scientific notation. */
export function formatAmount(raw: bigint | string, decimals: number, maxSig = 6): string {
  const s = formatUnits(BigInt(raw), decimals);
  const n = Number(s);
  if (n === 0) return "0";
  if (n > 0 && n < 1e-6) return "<0.000001";
  if (n >= 1e9) return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 2 }).format(n);
  const intDigits = Math.max(1, Math.floor(Math.log10(Math.abs(n))) + 1);
  const frac = Math.max(0, Math.min(decimals, maxSig - intDigits));
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: frac }).format(n);
}

export function timeAgo(ts: number): string {
  const s = Math.round((Date.now() - ts) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return new Date(ts).toLocaleDateString();
}

/** Parses a user-typed decimal amount to base units; throws on bad input. */
export function parseAmount(input: string, decimals: number): bigint {
  const v = input.trim().replace(/,/g, "");
  if (!/^\d*\.?\d*$/.test(v) || v === "" || v === ".") throw new Error("Enter a valid amount");
  const [i, f = ""] = v.split(".");
  if (f.length > decimals) throw new Error(`At most ${decimals} decimal places`);
  return BigInt(i || "0") * 10n ** BigInt(decimals) + BigInt((f + "0".repeat(decimals)).slice(0, decimals) || "0");
}

export const siteHost = (origin: string) => {
  try {
    return new URL(origin).host;
  } catch {
    return origin;
  }
};

/** Fee display: 3 significant digits, never scientific notation (7.44e-7 → 0.000000744). */
export function formatFee(v: string | number): string {
  const n = Number(v);
  if (!Number.isFinite(n) || n === 0) return "0";
  return n.toLocaleString("en-US", { maximumSignificantDigits: 3, maximumFractionDigits: 18 });
}
