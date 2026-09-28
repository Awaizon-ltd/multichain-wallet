// components/market/Sparkline.js — tiny 7-day trend line for list rows
import React, { memo, useMemo } from "react";
import { View } from "react-native";
import Svg, { Path, Defs, LinearGradient, Stop } from "react-native-svg";

const Sparkline = ({ data, width = 64, height = 28, color }) => {
  const paths = useMemo(() => {
    if (!Array.isArray(data) || data.length < 2) return null;
    const min = Math.min(...data);
    const max = Math.max(...data);
    const range = max - min || 1;
    const pad = 2;
    const pts = data.map((v, i) => [
      (i / (data.length - 1)) * width,
      pad + (1 - (v - min) / range) * (height - pad * 2),
    ]);
    const line = pts
      .map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`)
      .join("");
    return { line, area: `${line}L${width},${height}L0,${height}Z` };
  }, [data, width, height]);

  if (!paths) return <View style={{ width, height }} />;

  const gradId = `spark-${color.replace(/[^a-zA-Z0-9]/g, "")}`;
  return (
    <Svg width={width} height={height}>
      <Defs>
        <LinearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={color} stopOpacity={0.22} />
          <Stop offset="1" stopColor={color} stopOpacity={0} />
        </LinearGradient>
      </Defs>
      <Path d={paths.area} fill={`url(#${gradId})`} />
      <Path
        d={paths.line}
        stroke={color}
        strokeWidth={1.6}
        fill="none"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </Svg>
  );
};

export default memo(Sparkline);
