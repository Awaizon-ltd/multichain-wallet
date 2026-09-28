// components/market/PriceChart.js
// Area line chart with press-and-drag scrubbing. While scrubbing it reports
// the point under the finger via onScrub(point), and onScrub(null) on release,
// so the screen can show that point's price and time in its header.
import React, { memo, useMemo, useRef, useState } from "react";
import { View, PanResponder } from "react-native";
import Svg, {
  Path,
  Line,
  Circle,
  Defs,
  LinearGradient,
  Stop,
} from "react-native-svg";
import * as Haptics from "expo-haptics";

const PAD_TOP = 12;
const PAD_BOTTOM = 8;

const PriceChart = ({ prices, height = 220, color, gridColor, onScrub }) => {
  const [width, setWidth] = useState(0);
  const [active, setActive] = useState(null); // index under the finger
  const lastIndex = useRef(null);

  const geometry = useMemo(() => {
    if (!width || !prices || prices.length < 2) return null;
    const values = prices.map((p) => p[1]);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || max * 0.01 || 1;
    const h = height - PAD_TOP - PAD_BOTTOM;
    const pts = values.map((v, i) => [
      (i / (values.length - 1)) * width,
      PAD_TOP + (1 - (v - min) / range) * h,
    ]);
    const line = pts
      .map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(2)},${y.toFixed(2)}`)
      .join("");
    return {
      pts,
      line,
      area: `${line}L${width},${height}L0,${height}Z`,
      openY: pts[0][1],
    };
  }, [prices, width, height]);

  // The PanResponder is created once; read the latest props through a ref
  const latest = useRef({});
  latest.current = { prices, width, onScrub };

  const update = (x) => {
    const { prices: p, width: w } = latest.current;
    if (!p?.length || !w) return;
    const i = Math.round((Math.max(0, Math.min(w, x)) / w) * (p.length - 1));
    if (i === lastIndex.current) return;
    lastIndex.current = i;
    setActive(i);
    Haptics.selectionAsync().catch(() => {});
    latest.current.onScrub?.({ time: p[i][0], price: p[i][1], index: i });
  };

  const end = () => {
    lastIndex.current = null;
    setActive(null);
    latest.current.onScrub?.(null);
  };

  const responder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      // Once scrubbing, don't let the parent ScrollView steal the gesture
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (e) => update(e.nativeEvent.locationX),
      onPanResponderMove: (e) => update(e.nativeEvent.locationX),
      onPanResponderRelease: end,
      onPanResponderTerminate: end,
    }),
  ).current;

  const point = active != null && geometry ? geometry.pts[active] : null;

  return (
    <View
      style={{ height }}
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      {...responder.panHandlers}
    >
      {geometry ? (
        <Svg width={width} height={height}>
          <Defs>
            <LinearGradient id="priceArea" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={color} stopOpacity={0.28} />
              <Stop offset="1" stopColor={color} stopOpacity={0} />
            </LinearGradient>
          </Defs>
          {/* Opening price of the period, for reference */}
          <Line
            x1={0}
            x2={width}
            y1={geometry.openY}
            y2={geometry.openY}
            stroke={gridColor}
            strokeWidth={1}
            strokeDasharray="3,5"
          />
          <Path d={geometry.area} fill="url(#priceArea)" />
          <Path
            d={geometry.line}
            stroke={color}
            strokeWidth={2.2}
            fill="none"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
          {point ? (
            <>
              <Line
                x1={point[0]}
                x2={point[0]}
                y1={0}
                y2={height}
                stroke={gridColor}
                strokeWidth={1}
              />
              <Circle cx={point[0]} cy={point[1]} r={10} fill={color} opacity={0.2} />
              <Circle cx={point[0]} cy={point[1]} r={4.5} fill={color} />
            </>
          ) : null}
        </Svg>
      ) : null}
    </View>
  );
};

export default memo(PriceChart);
