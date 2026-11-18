// Single-series price chart: 2px line, faint area, recessive axis labels,
// crosshair + tooltip on hover / keyboard. Colour is one series token
// (--chart-line), validated per theme; direction is told in text, not colour alone.

import { useMemo, useRef, useState } from "react";
import { formatPrice } from "../format";

const W = 328;
const H = 160;
const PAD = { top: 12, right: 4, bottom: 18, left: 4 };

function fmtTime(ts: number, days: number) {
  const d = new Date(ts);
  return days <= 1
    ? d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
    : d.toLocaleDateString("en-US", { month: "short", day: "numeric", ...(days > 90 ? { year: "2-digit" } : {}) });
}

export function PriceChart({ points, days, label }: { points: [number, number][]; days: number; label: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const geo = useMemo(() => {
    if (points.length < 2) return null;
    const xs = points.map((p) => p[0]);
    const ys = points.map((p) => p[1]);
    const x0 = xs[0];
    const x1 = xs[xs.length - 1];
    let lo = Math.min(...ys);
    let hi = Math.max(...ys);
    if (hi === lo) (hi += 1), (lo -= 1);
    const sx = (x: number) => PAD.left + ((x - x0) / (x1 - x0)) * (W - PAD.left - PAD.right);
    const sy = (y: number) => PAD.top + (1 - (y - lo) / (hi - lo)) * (H - PAD.top - PAD.bottom);
    const line = points.map((p, i) => `${i ? "L" : "M"}${sx(p[0]).toFixed(1)},${sy(p[1]).toFixed(1)}`).join("");
    const area = `${line}L${sx(x1).toFixed(1)},${H - PAD.bottom}L${sx(x0).toFixed(1)},${H - PAD.bottom}Z`;
    const iHi = ys.indexOf(Math.max(...ys));
    const iLo = ys.indexOf(Math.min(...ys));
    return { sx, sy, line, area, lo: Math.min(...ys), hi: Math.max(...ys), iHi, iLo };
  }, [points]);

  if (!geo) return <div className="skeleton" style={{ height: H }} />;

  const first = points[0][1];
  const last = points[points.length - 1][1];
  const pct = ((last - first) / first) * 100;
  const summary = `${label} price over the period: from ${formatPrice(first)} to ${formatPrice(last)} (${pct >= 0 ? "up" : "down"} ${Math.abs(pct).toFixed(2)}%). High ${formatPrice(geo.hi)}, low ${formatPrice(geo.lo)}.`;

  const pick = (clientX: number) => {
    const r = svgRef.current!.getBoundingClientRect();
    const x = ((clientX - r.left) / r.width) * W;
    let best = 0;
    let bestD = Infinity;
    points.forEach((p, i) => {
      const d = Math.abs(geo.sx(p[0]) - x);
      if (d < bestD) (bestD = d), (best = i);
    });
    setHover(best);
  };

  const h = hover !== null ? points[hover] : null;
  const hx = h ? geo.sx(h[0]) : 0;
  const hy = h ? geo.sy(h[1]) : 0;

  return (
    <div className="chart">
      <div className="chart-readout">
        {h ? (
          <>
            <strong>{formatPrice(h[1])}</strong> <span className="muted small">{fmtTime(h[0], days)}</span>
          </>
        ) : (
          <span className="small muted">
            {pct >= 0 ? "▲" : "▼"} {Math.abs(pct).toFixed(2)}% over this period
          </span>
        )}
      </div>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        role="img"
        aria-label={summary}
        tabIndex={0}
        onPointerMove={(e) => pick(e.clientX)}
        onPointerLeave={() => setHover(null)}
        onKeyDown={(e) => {
          if (e.key === "ArrowLeft") setHover((v) => Math.max(0, (v ?? points.length) - 1));
          if (e.key === "ArrowRight") setHover((v) => Math.min(points.length - 1, (v ?? -1) + 1));
          if (e.key === "Escape") setHover(null);
        }}
        onBlur={() => setHover(null)}
        style={{ touchAction: "none", display: "block" }}
      >
        <path d={geo.area} fill="var(--chart-line)" opacity="0.08" />
        <path d={geo.line} fill="none" stroke="var(--chart-line)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        {/* high / low labels — selective, not on every point */}
        <text x={Math.min(Math.max(geo.sx(points[geo.iHi][0]), 30), W - 30)} y={PAD.top - 2} textAnchor="middle" className="chart-label">
          {formatPrice(geo.hi)}
        </text>
        <text x={Math.min(Math.max(geo.sx(points[geo.iLo][0]), 30), W - 30)} y={H - 4} textAnchor="middle" className="chart-label">
          {formatPrice(geo.lo)}
        </text>
        {h && (
          <g pointerEvents="none">
            <line x1={hx} x2={hx} y1={PAD.top} y2={H - PAD.bottom} stroke="var(--text-3)" strokeWidth="1" strokeDasharray="3 3" />
            <circle cx={hx} cy={hy} r="4.5" fill="var(--chart-line)" stroke="var(--card)" strokeWidth="2" />
          </g>
        )}
      </svg>
    </div>
  );
}

export function Sparkline({ values, width = 56, height = 22 }: { values?: number[]; width?: number; height?: number }) {
  if (!values || values.length < 2) return <span style={{ width }} />;
  const step = Math.max(1, Math.floor(values.length / 40));
  const v = values.filter((_, i) => i % step === 0);
  const lo = Math.min(...v);
  const hi = Math.max(...v) || lo + 1;
  const d = v.map((y, i) => `${i ? "L" : "M"}${((i / (v.length - 1)) * width).toFixed(1)},${(2 + (1 - (y - lo) / (hi - lo || 1)) * (height - 4)).toFixed(1)}`).join("");
  return (
    <svg width={width} height={height} aria-hidden="true" style={{ flexShrink: 0 }}>
      <path d={d} fill="none" stroke="var(--text-3)" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}
