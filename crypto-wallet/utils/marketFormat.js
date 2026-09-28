// utils/marketFormat.js — display formatting for market prices and stats

const SUBSCRIPTS = "₀₁₂₃₄₅₆₇₈₉";
const toSubscript = (n) =>
  String(n)
    .split("")
    .map((d) => SUBSCRIPTS[+d])
    .join("");

/**
 * $64,210.55 · $1.2345 · $0.004467 · $0.0₅4400 (zero-subscript for tiny prices)
 */
export const formatPrice = (value) => {
  const n = Number(value);
  if (!isFinite(n) || n === 0) return "$0.00";
  if (n >= 1000)
    return `$${n.toLocaleString("en-US", { maximumFractionDigits: 2, minimumFractionDigits: 2 })}`;
  if (n >= 1) return `$${n.toFixed(n >= 100 ? 2 : 4).replace(/0{1,2}$/, "")}`;
  if (n >= 0.001) return `$${n.toPrecision(4)}`;
  // 0.0000044 → "$0.0₅44": subscript = number of zeros after the decimal point
  const leading = Math.ceil(-Math.log10(n)) - 1;
  const digits = Math.round(n * 10 ** (leading + 4))
    .toString()
    .replace(/0+$/, "");
  return `$0.0${toSubscript(leading)}${digits || "0"}`;
};

/** $1.23T · $4.5B · $820.1M · $12.3K · $950 */
export const formatCompactUsd = (value) => {
  const n = Number(value);
  if (!isFinite(n) || n <= 0) return "—";
  const units = [
    [1e12, "T"],
    [1e9, "B"],
    [1e6, "M"],
    [1e3, "K"],
  ];
  for (const [size, suffix] of units) {
    if (n >= size) return `$${(n / size).toFixed(n / size >= 100 ? 0 : 2)}${suffix}`;
  }
  return `$${n.toFixed(2)}`;
};

/** 21M · 1.2B · 950K — supply counts, no currency sign */
export const formatCompact = (value) => {
  const n = Number(value);
  if (!isFinite(n) || n <= 0) return "—";
  if (n >= 1e12) return `${(n / 1e12).toFixed(2)}T`;
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return n.toFixed(0);
};

/** +4.21% / -0.87% — null when unknown */
export const formatPct = (value, digits = 2) => {
  const n = Number(value);
  if (value == null || !isFinite(n)) return null;
  return `${n >= 0 ? "+" : ""}${n.toFixed(digits)}%`;
};

/** Human label for a chart point's timestamp, sized to the period shown. */
export const formatChartTime = (ts, days) => {
  const d = new Date(ts);
  if (days <= 1)
    return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  if (days <= 90)
    return d.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      ...(days <= 7 ? { hour: "numeric" } : {}),
    });
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
};

/** "just now" · "4m ago" · "2h ago" */
export const formatUpdatedAgo = (iso) => {
  if (!iso) return null;
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
};
