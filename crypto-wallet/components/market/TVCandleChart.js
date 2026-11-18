// components/market/TVCandleChart.js
// Candlestick chart rendered by TradingView Lightweight Charts in a WebView.
// Same props as CandleChart (the SVG chart), plus `seriesKey`:
//
//   <TVCandleChart candles tf quoteIsUsd height compact showMA seriesKey />
//
// `seriesKey` identifies what's plotted (pair + timeframe). When it changes
// the chart jumps to the latest bars; when only the candles change (the 30s
// refresh) it keeps wherever the user had scrolled or zoomed to.
//
// The library comes from a pinned CDN build (see tvChartHtml.js). If it can't
// load — offline, CDN blocked — this falls back to the SVG CandleChart, so a
// chart always renders.
import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { View, ActivityIndicator, Linking, StyleSheet } from "react-native";
import { WebView } from "react-native-webview";
import { useTheme } from "../../contexts/ThemeContext";
import CandleChart from "./CandleChart";
import { TV_CHART_HTML } from "./tvChartHtml";

const LOAD_TIMEOUT_MS = 10_000;

const TVCandleChart = ({
  candles = [],
  height = 260,
  tf = "1h",
  quoteIsUsd = true,
  compact = false,
  showMA = true,
  seriesKey,
}) => {
  const { COLORS } = useTheme();
  const webRef = useRef(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);

  const colors = useMemo(
    () => ({
      up: COLORS.success,
      down: COLORS.error,
      ma7: COLORS.warning,
      ma25: COLORS.primary,
      text: COLORS.text,
      textSecondary: COLORS.textSecondary,
      textTertiary: COLORS.textTertiary,
      border: COLORS.border,
      grid: `${COLORS.border}66`,
      surface: COLORS.cardElevated ?? COLORS.surface,
    }),
    [COLORS],
  );

  const send = useCallback((msg) => {
    webRef.current?.postMessage(JSON.stringify(msg));
  }, []);

  // Library didn't come up in time → SVG fallback
  useEffect(() => {
    if (ready || failed) return;
    const t = setTimeout(() => setFailed(true), LOAD_TIMEOUT_MS);
    return () => clearTimeout(t);
  }, [ready, failed]);

  const onMessage = useCallback(
    (e) => {
      let msg;
      try {
        msg = JSON.parse(e.nativeEvent.data);
      } catch {
        return;
      }
      if (msg.type === "ready") {
        send({ type: "init", colors, compact, showMA });
        setReady(true);
      } else if (msg.type === "error") {
        if (__DEV__) console.warn("[TVCandleChart]", msg.message);
        if (!ready) setFailed(true);
      }
    },
    [send, colors, compact, showMA, ready],
  );

  // Data → chart (after init). Only what the page needs crosses the bridge.
  useEffect(() => {
    if (!ready) return;
    send({
      type: "data",
      candles,
      quoteIsUsd,
      seriesKey: seriesKey ?? `${tf}:${candles[0]?.t ?? ""}`,
    });
  }, [ready, candles, quoteIsUsd, seriesKey, tf, send]);

  // Light/dark or accent change
  useEffect(() => {
    if (ready) send({ type: "theme", colors });
  }, [colors]);

  // The attribution logo links to tradingview.com — open links in the
  // system browser, never inside this WebView.
  // (Loading the CDN script isn't a navigation, so it isn't affected.)
  const onShouldStartLoadWithRequest = useCallback((req) => {
    if (/^https?:/i.test(req.url)) {
      Linking.openURL(req.url).catch(() => {});
      return false;
    }
    return true; // the inline page itself (about:blank / data:)
  }, []);

  if (failed) {
    return (
      <CandleChart
        candles={candles}
        height={height}
        tf={tf}
        quoteIsUsd={quoteIsUsd}
        compact={compact}
        showMA={showMA}
      />
    );
  }

  return (
    <View style={{ height }}>
      <WebView
        ref={webRef}
        source={{ html: TV_CHART_HTML }}
        originWhitelist={["*"]}
        onMessage={onMessage}
        onError={() => setFailed(true)}
        onShouldStartLoadWithRequest={onShouldStartLoadWithRequest}
        javaScriptEnabled
        scrollEnabled={false}
        bounces={false}
        overScrollMode="never"
        nestedScrollEnabled
        showsHorizontalScrollIndicator={false}
        showsVerticalScrollIndicator={false}
        setSupportMultipleWindows={false}
        style={styles.web}
        containerStyle={styles.web}
      />
      {!ready && (
        <View style={[StyleSheet.absoluteFill, styles.loading]} pointerEvents="none">
          <ActivityIndicator color={COLORS.primary} />
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  web: { flex: 1, backgroundColor: "transparent" },
  loading: { alignItems: "center", justifyContent: "center" },
});

export default memo(TVCandleChart);
