// components/market/tvChartHtml.js
// The page TVCandleChart loads into its WebView: TradingView Lightweight
// Charts (Apache-2.0, https://github.com/tradingview/lightweight-charts),
// pinned to an exact version so a CDN update can never change the chart
// under us. Kept as a plain string — nothing is interpolated into it; all
// data and theme arrive later over postMessage:
//
//   app → page   { type: "init", colors, compact, showMA }
//                { type: "data", candles: [{t,o,h,l,c,v}], seriesKey, quoteIsUsd }
//                { type: "theme", colors }
//   page → app   { type: "ready" } | { type: "error", message }
//
// The licence asks for TradingView attribution, which the library's own
// `attributionLogo` provides (left on).

export const LIGHTWEIGHT_CHARTS_URL =
  "https://cdn.jsdelivr.net/npm/lightweight-charts@5.2.1/dist/lightweight-charts.standalone.production.js";

export const TV_CHART_HTML = `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
<style>
  html, body { margin: 0; padding: 0; height: 100%; background: transparent; overflow: hidden;
    -webkit-user-select: none; user-select: none; -webkit-tap-highlight-color: transparent;
    font-family: -apple-system, system-ui, Roboto, sans-serif; }
  #chart { position: absolute; inset: 0; }
  #legend { position: absolute; left: 6px; top: 4px; z-index: 3; pointer-events: none;
    font-size: 11px; line-height: 15px; font-variant-numeric: tabular-nums; white-space: nowrap; }
  #legend b { font-weight: 600; }
  #legend .ma { margin-left: 8px; }
</style>
</head>
<body>
<div id="chart"></div>
<div id="legend"></div>
<script>
(function () {
  var post = function (msg) {
    if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(JSON.stringify(msg));
  };
  window.onerror = function (m) { post({ type: "error", message: String(m) }); };

  var script = document.createElement("script");
  script.src = "${LIGHTWEIGHT_CHARTS_URL}";
  script.onerror = function () { post({ type: "error", message: "chart library failed to load" }); };
  script.onload = function () { post({ type: "ready" }); };
  document.head.appendChild(script);

  var LWC, chart, candle, volume, ma7, ma25;
  var colors = {}, compact = false, showMA = true, quoteIsUsd = true;
  var data = [], lastKey = null, lastMsg = null;
  var TZ = -new Date().getTimezoneOffset() * 60; // the library renders UTC; shift to local time
  var legend = document.getElementById("legend");

  // ── Price formatting: "$1,234.56", "0.04091", "0.0₇2993" ─────────────────────
  var SUB = "₀₁₂₃₄₅₆₇₈₉";
  var sub = function (n) { return String(n).split("").map(function (d) { return SUB[+d]; }).join(""); };
  var fmt = function (v) {
    var n = Math.abs(v), s;
    if (!isFinite(n) || n === 0) s = "0";
    else if (n >= 1000) s = n.toLocaleString("en-US", { maximumFractionDigits: 2, minimumFractionDigits: 2 });
    else if (n >= 1) s = n.toFixed(n >= 100 ? 2 : 4);
    else if (n >= 0.001) s = n.toPrecision(4);
    else {
      var lead = Math.ceil(-Math.log10(n)) - 1;
      var digits = String(Math.round(n * Math.pow(10, lead + 4))).replace(/0+$/, "");
      s = "0.0" + sub(lead) + (digits || "0");
    }
    return (v < 0 ? "-" : "") + (quoteIsUsd ? "$" : "") + s;
  };
  // Smallest price step the scale should show, from the price's magnitude
  var minMoveFor = function (p) {
    if (!p) return 0.01;
    return Math.pow(10, Math.floor(Math.log10(Math.abs(p))) - 4);
  };

  var sma = function (rows, period) {
    var out = [], sum = 0;
    for (var i = 0; i < rows.length; i++) {
      sum += rows[i].close;
      if (i >= period) sum -= rows[i - period].close;
      if (i >= period - 1) out.push({ time: rows[i].time, value: sum / period });
    }
    return out;
  };

  var applyTheme = function () {
    if (!chart) return;
    chart.applyOptions({
      layout: { background: { type: "solid", color: "transparent" }, textColor: colors.textTertiary,
        fontSize: 10, attributionLogo: true },
      grid: { vertLines: { color: colors.grid }, horzLines: { color: colors.grid } },
      rightPriceScale: { borderColor: colors.border },
      timeScale: { borderColor: colors.border },
      crosshair: {
        vertLine: { color: colors.textSecondary, labelBackgroundColor: colors.surface },
        horzLine: { color: colors.textSecondary, labelBackgroundColor: colors.surface },
      },
    });
    candle.applyOptions({ upColor: colors.up, downColor: colors.down, wickUpColor: colors.up,
      wickDownColor: colors.down, borderVisible: false });
    if (ma7) ma7.applyOptions({ color: colors.ma7 });
    if (ma25) ma25.applyOptions({ color: colors.ma25 });
    renderLegend(null);
  };

  var build = function () {
    LWC = window.LightweightCharts;
    var el = document.getElementById("chart");
    chart = LWC.createChart(el, {
      autoSize: true,
      handleScroll: compact ? false : { mouseWheel: true, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: false },
      handleScale: compact ? false : { pinch: true, mouseWheel: true, axisPressedMouseMove: { time: true, price: true } },
      rightPriceScale: { visible: !compact, scaleMargins: { top: compact ? 0.08 : 0.12, bottom: compact ? 0.08 : 0.24 } },
      timeScale: { visible: !compact, timeVisible: true, secondsVisible: false, rightOffset: 4, barSpacing: 7, minBarSpacing: 2 },
      crosshair: { mode: compact ? LWC.CrosshairMode.Hidden : LWC.CrosshairMode.Normal },
    });
    candle = chart.addSeries(LWC.CandlestickSeries, {
      priceLineVisible: !compact, lastValueVisible: !compact,
      priceFormat: { type: "custom", formatter: fmt, minMove: 0.01 },
    });
    if (!compact) {
      volume = chart.addSeries(LWC.HistogramSeries, {
        priceScaleId: "", priceFormat: { type: "volume" }, lastValueVisible: false, priceLineVisible: false,
      });
      volume.priceScale().applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });
      if (showMA) {
        var line = { lineWidth: 1, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false };
        ma7 = chart.addSeries(LWC.LineSeries, line);
        ma25 = chart.addSeries(LWC.LineSeries, line);
      }
      chart.subscribeCrosshairMove(function (param) {
        renderLegend(param && param.time != null ? param.seriesData.get(candle) : null);
      });
    }
    applyTheme();
  };

  // OHLC of the hovered bar, or of the latest one
  var renderLegend = function (bar) {
    if (compact) { legend.innerHTML = ""; return; }
    var b = bar || (data.length ? data[data.length - 1] : null);
    if (!b) { legend.innerHTML = ""; return; }
    var up = b.close >= b.open;
    var pct = b.open ? ((b.close - b.open) / b.open) * 100 : 0;
    var lab = function (k, v) {
      return '<span style="color:' + colors.textSecondary + '">' + k + ' </span><b style="color:' +
        colors.text + '">' + fmt(v) + "</b>  ";
    };
    legend.innerHTML = lab("O", b.open) + lab("H", b.high) + lab("L", b.low) + lab("C", b.close) +
      '<b style="color:' + (up ? colors.up : colors.down) + '">' + (pct >= 0 ? "+" : "") + pct.toFixed(2) + "%</b>" +
      (ma7 ? '<span class="ma" style="color:' + colors.ma7 + '">MA7</span><span class="ma" style="color:' + colors.ma25 + '">MA25</span>' : "");
  };

  var setData = function (msg) {
    lastMsg = msg;
    quoteIsUsd = msg.quoteIsUsd !== false;
    data = (msg.candles || []).map(function (k) {
      return { time: k.t + TZ, open: k.o, high: k.h, low: k.l, close: k.c, v: k.v || 0 };
    });
    var last = data.length ? data[data.length - 1].close : 0;
    candle.applyOptions({ priceFormat: { type: "custom", formatter: fmt, minMove: minMoveFor(last) } });

    // Same pair refreshing (the 30s poll): keep wherever the user scrolled to.
    // New pair or timeframe: jump to the latest ~60 bars.
    var sameSeries = msg.seriesKey === lastKey;
    var range = sameSeries ? chart.timeScale().getVisibleLogicalRange() : null;

    candle.setData(data);
    if (volume) {
      volume.setData(data.map(function (b) {
        return { time: b.time, value: b.v, color: (b.close >= b.open ? colors.up : colors.down) + "55" };
      }));
    }
    if (ma7) { ma7.setData(sma(data, 7)); ma25.setData(sma(data, 25)); }

    if (range) chart.timeScale().setVisibleLogicalRange(range);
    else if (compact) chart.timeScale().fitContent();
    else chart.timeScale().setVisibleLogicalRange({ from: Math.max(0, data.length - 60), to: data.length + 3 });
    lastKey = msg.seriesKey;
    renderLegend(null);
  };

  var pending = [];
  var handle = function (raw) {
    var msg;
    try { msg = JSON.parse(raw); } catch (e) { return; }
    if (!window.LightweightCharts) { pending.push(raw); return; }
    try {
      if (msg.type === "init") {
        colors = msg.colors; compact = !!msg.compact; showMA = msg.showMA !== false;
        if (!chart) build(); else applyTheme();
      } else if (msg.type === "theme") {
        colors = msg.colors; applyTheme();
        if (lastMsg) setData(lastMsg); // re-tint volume bars, keeps the scroll position
      } else if (msg.type === "data" && chart) {
        setData(msg);
      }
    } catch (e) { post({ type: "error", message: String(e && e.message || e) }); }
  };
  script.addEventListener("load", function () { var q = pending; pending = []; q.forEach(handle); });

  // iOS delivers postMessage on window, Android on document
  window.addEventListener("message", function (e) { handle(e.data); });
  document.addEventListener("message", function (e) { handle(e.data); });
})();
</script>
</body>
</html>`;
