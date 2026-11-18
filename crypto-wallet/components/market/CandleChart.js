// components/market/CandleChart.js
// Candlestick chart on react-native-svg — candles, volume, MA7/MA25 overlays,
// last-price line, and a price axis.
//
// Gestures: drag sideways to scroll back through history; tap to drop a
// crosshair on a candle (its OHLC shows in the header) — drag then moves it;
// tap again to clear. Only the visible window is drawn (~60 candles), so a
// 200-candle series costs the same as a 60-candle one.
import React, { memo, useMemo, useRef, useState } from "react";
import { View, Text, StyleSheet, PanResponder } from "react-native";
import Svg, { Rect, Line, Polyline, Text as SvgText, G } from "react-native-svg";
import { useTheme } from "../../contexts/ThemeContext";
import { formatPrice } from "../../utils/marketFormat";

const AXIS_W = 58;
const VOLUME_FRACTION = 0.18;
const TAP_SLOP = 6;

/** Price in quote units: "$…" for USD quotes, plain digits otherwise. */
export const formatPairPrice = (value, quoteIsUsd) => {
  const s = formatPrice(value);
  return quoteIsUsd ? s : s.replace("$", "");
};

const movingAverage = (candles, period) =>
  candles.map((_, i) => {
    if (i < period - 1) return null;
    let sum = 0;
    for (let j = i - period + 1; j <= i; j++) sum += candles[j].c;
    return sum / period;
  });

const timeLabel = (t, tf) => {
  const d = new Date(t * 1000);
  if (tf === "1d") return `${d.getMonth() + 1}/${d.getDate()}`;
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};

const CandleChart = ({
  candles = [],
  height = 260,
  tf = "1h",
  quoteIsUsd = true,
  compact = false,
  visible: visibleProp,
  showMA = true,
}) => {
  const { COLORS } = useTheme();
  const [width, setWidth] = useState(0);
  const [offset, setOffset] = useState(0); // candles scrolled back from the newest
  const [cross, setCross] = useState(null); // index into the window, or null
  const gesture = useRef({ startOffset: 0, moved: false, crossOn: false });
  // Touch x is taken from pageX minus the chart's own page offset: locationX
  // is relative to whichever SVG child is under the finger, so it jumps.
  const viewRef = useRef(null);
  const originX = useRef(0);

  const visibleCount = Math.min(candles.length, visibleProp ?? (compact ? 48 : 60));
  const maxOffset = Math.max(0, candles.length - visibleCount);
  const clampedOffset = Math.min(offset, maxOffset);
  const end = candles.length - clampedOffset;
  const win = useMemo(
    () => candles.slice(Math.max(0, end - visibleCount), end),
    [candles, end, visibleCount],
  );

  // MAs over the full series (so the window's first points aren't null), then sliced
  const ma = useMemo(() => {
    if (!showMA || compact) return null;
    const start = Math.max(0, end - visibleCount);
    return {
      ma7: movingAverage(candles, 7).slice(start, end),
      ma25: movingAverage(candles, 25).slice(start, end),
    };
  }, [candles, end, visibleCount, showMA, compact]);

  const axisW = compact ? 0 : AXIS_W;
  const plotW = Math.max(0, width - axisW);
  const priceH = compact ? height : height * (1 - VOLUME_FRACTION) - 14;
  const volTop = priceH + 14;
  const volH = height - volTop;
  const slot = win.length ? plotW / win.length : 0;

  const { min, max, maxVol } = useMemo(() => {
    let lo = Infinity;
    let hi = -Infinity;
    let mv = 0;
    for (const k of win) {
      lo = Math.min(lo, k.l);
      hi = Math.max(hi, k.h);
      mv = Math.max(mv, k.v || 0);
    }
    const pad = (hi - lo) * 0.06 || hi * 0.01 || 1;
    return { min: lo - pad, max: hi + pad, maxVol: mv };
  }, [win]);

  const y = (p) => priceH - ((p - min) / (max - min || 1)) * priceH;
  const xMid = (i) => i * slot + slot / 2;

  // ── Gestures ────────────────────────────────────────────────────────────────
  const indexAt = (x) => Math.max(0, Math.min(win.length - 1, Math.floor(x / (slot || 1))));
  const pan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > TAP_SLOP,
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: () => {
          gesture.current = { startOffset: clampedOffset, moved: false, crossOn: cross != null };
          viewRef.current?.measure((_x, _y, _w, _h, pageX) => {
            originX.current = pageX ?? 0;
          });
        },
        onPanResponderMove: (e, g) => {
          if (Math.abs(g.dx) <= TAP_SLOP) return;
          gesture.current.moved = true;
          if (gesture.current.crossOn) {
            setCross(indexAt(e.nativeEvent.pageX - originX.current));
          } else {
            // drag right → older candles
            const delta = Math.round(g.dx / (slot || 1));
            setOffset(Math.max(0, Math.min(maxOffset, gesture.current.startOffset + delta)));
          }
        },
        onPanResponderRelease: (e) => {
          if (gesture.current.moved) return;
          setCross((c) => (c == null ? indexAt(e.nativeEvent.pageX - originX.current) : null));
        },
      }),
    [clampedOffset, cross, slot, maxOffset, win.length],
  );

  const shown = cross != null ? win[cross] : win[win.length - 1];
  const first = win[0];
  const changePct = shown && first ? ((shown.c - first.o) / first.o) * 100 : null;
  const last = candles[candles.length - 1];
  const fmt = (v) => formatPairPrice(v, quoteIsUsd);

  const gridPrices = useMemo(
    () => (compact ? [] : [0.15, 0.4, 0.65, 0.9].map((f) => max - (max - min) * f)),
    [min, max, compact],
  );

  if (!candles.length) {
    return (
      <View style={[styles.empty, { height }]}>
        <Text style={{ color: COLORS.textTertiary, fontSize: 13 }}>No chart data</Text>
      </View>
    );
  }

  return (
    <View>
      {!compact && shown && (
        <View style={styles.readout}>
          {[
            ["O", shown.o],
            ["H", shown.h],
            ["L", shown.l],
            ["C", shown.c],
          ].map(([k, v]) => (
            <Text key={k} style={[styles.readoutText, { color: COLORS.textSecondary }]}>
              {k} <Text style={{ color: COLORS.text }}>{fmt(v)}</Text>
            </Text>
          ))}
          {changePct != null && (
            <Text
              style={[
                styles.readoutText,
                { color: changePct >= 0 ? COLORS.success : COLORS.error, fontWeight: "700" },
              ]}
            >
              {changePct >= 0 ? "+" : ""}
              {changePct.toFixed(2)}%
            </Text>
          )}
          {cross != null && (
            <Text style={[styles.readoutText, { color: COLORS.textTertiary }]}>
              {timeLabel(shown.t, tf)}
            </Text>
          )}
        </View>
      )}

      <View
        ref={viewRef}
        collapsable={false}
        style={{ height }}
        onLayout={(e) => {
          setWidth(e.nativeEvent.layout.width);
          viewRef.current?.measure((_x, _y, _w, _h, pageX) => {
            originX.current = pageX ?? 0;
          });
        }}
        {...pan.panHandlers}
      >
        {width > 0 && (
          <Svg width={width} height={height}>
            {/* Grid + price axis */}
            {gridPrices.map((p, i) => (
              <G key={`g${i}`}>
                <Line x1={0} x2={plotW} y1={y(p)} y2={y(p)} stroke={COLORS.border} strokeWidth={0.5} />
                <SvgText x={plotW + 4} y={y(p) + 3} fontSize={9} fill={COLORS.textTertiary}>
                  {fmt(p)}
                </SvgText>
              </G>
            ))}

            {/* Volume */}
            {!compact &&
              maxVol > 0 &&
              win.map((k, i) => {
                const h = ((k.v || 0) / maxVol) * volH;
                return (
                  <Rect
                    key={`v${k.t}`}
                    x={i * slot + slot * 0.15}
                    y={volTop + volH - h}
                    width={Math.max(1, slot * 0.7)}
                    height={Math.max(0.5, h)}
                    fill={k.c >= k.o ? COLORS.success : COLORS.error}
                    opacity={0.3}
                  />
                );
              })}

            {/* Candles */}
            {win.map((k, i) => {
              const up = k.c >= k.o;
              const color = up ? COLORS.success : COLORS.error;
              const top = y(Math.max(k.o, k.c));
              const bodyH = Math.max(1, Math.abs(y(k.o) - y(k.c)));
              return (
                <G key={`c${k.t}`}>
                  <Line x1={xMid(i)} x2={xMid(i)} y1={y(k.h)} y2={y(k.l)} stroke={color} strokeWidth={1} />
                  <Rect
                    x={i * slot + slot * 0.15}
                    y={top}
                    width={Math.max(1, slot * 0.7)}
                    height={bodyH}
                    fill={color}
                    rx={slot > 6 ? 1 : 0}
                  />
                </G>
              );
            })}

            {/* Moving averages */}
            {ma &&
              [
                [ma.ma7, COLORS.warning],
                [ma.ma25, COLORS.primary],
              ].map(([series, color], idx) => {
                const pts = series
                  .map((v, i) => (v == null ? null : `${xMid(i)},${y(v)}`))
                  .filter(Boolean)
                  .join(" ");
                return pts ? (
                  <Polyline key={`ma${idx}`} points={pts} fill="none" stroke={color} strokeWidth={1.2} opacity={0.9} />
                ) : null;
              })}

            {/* Last price */}
            {!compact && last && last.c >= min && last.c <= max && (
              <G>
                <Line
                  x1={0}
                  x2={plotW}
                  y1={y(last.c)}
                  y2={y(last.c)}
                  stroke={last.c >= last.o ? COLORS.success : COLORS.error}
                  strokeWidth={0.8}
                  strokeDasharray="3,3"
                />
                <Rect
                  x={plotW + 1}
                  y={y(last.c) - 8}
                  width={axisW - 2}
                  height={16}
                  rx={3}
                  fill={last.c >= last.o ? COLORS.success : COLORS.error}
                />
                <SvgText x={plotW + 4} y={y(last.c) + 3.5} fontSize={9} fontWeight="700" fill="#fff">
                  {fmt(last.c)}
                </SvgText>
              </G>
            )}

            {/* Crosshair */}
            {cross != null && win[cross] && (
              <G>
                <Line
                  x1={xMid(cross)}
                  x2={xMid(cross)}
                  y1={0}
                  y2={height}
                  stroke={COLORS.textSecondary}
                  strokeWidth={0.7}
                  strokeDasharray="2,3"
                />
                <Line
                  x1={0}
                  x2={plotW}
                  y1={y(win[cross].c)}
                  y2={y(win[cross].c)}
                  stroke={COLORS.textSecondary}
                  strokeWidth={0.7}
                  strokeDasharray="2,3"
                />
              </G>
            )}

            {/* Time labels */}
            {!compact &&
              [0, Math.floor(win.length / 2), win.length - 1].map((i) =>
                win[i] ? (
                  <SvgText
                    key={`t${i}`}
                    x={Math.min(Math.max(xMid(i), 14), plotW - 14)}
                    y={height - 1}
                    fontSize={9}
                    fill={COLORS.textTertiary}
                    textAnchor="middle"
                  >
                    {timeLabel(win[i].t, tf)}
                  </SvgText>
                ) : null,
              )}
          </Svg>
        )}
      </View>

      {!compact && ma && (
        <View style={styles.legend}>
          <Text style={[styles.legendText, { color: COLORS.warning }]}>MA7</Text>
          <Text style={[styles.legendText, { color: COLORS.primary }]}>MA25</Text>
          {clampedOffset > 0 && (
            <Text
              onPress={() => setOffset(0)}
              style={[styles.legendText, { color: COLORS.textSecondary, marginLeft: "auto" }]}
            >
              Latest ›
            </Text>
          )}
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  empty: { alignItems: "center", justifyContent: "center" },
  readout: { flexDirection: "row", flexWrap: "wrap", gap: 10, paddingBottom: 6 },
  readoutText: { fontSize: 11, fontVariant: ["tabular-nums"] },
  legend: { flexDirection: "row", gap: 12, paddingTop: 4 },
  legendText: { fontSize: 10, fontWeight: "700" },
});

export default memo(CandleChart);
