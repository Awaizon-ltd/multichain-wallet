import React, { useEffect, useRef, useState } from "react";
import { View, Text, Pressable, StyleSheet, Animated } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRoute } from "@react-navigation/native";
import * as Haptics from "expo-haptics";
import { useTheme } from "../../contexts/ThemeContext";
import BridgeScreen from "./BridgeScreen";
import SwapScreen from "./SwapNewSCreen";

// Cross-chain is powered by LI.FI, which routes between any supported chain.
const TABS = [
  { key: "swap", label: "Swap", component: SwapScreen },
  { key: "cross", label: "Cross-chain", component: BridgeScreen },
];

const SwapBridgeScreen = () => {
  const { COLORS } = useTheme();
  const insets = useSafeAreaInsets();
  const route = useRoute();
  const [active, setActive] = useState(0);
  const [trackWidth, setTrackWidth] = useState(0);
  const slide = useRef(new Animated.Value(0)).current;

  const segment = trackWidth ? (trackWidth - 8) / TABS.length : 0;

  const select = (index) => {
    if (index === active) return;
    Haptics.selectionAsync().catch(() => {});
    setActive(index);
    Animated.spring(slide, {
      toValue: index,
      useNativeDriver: true,
      tension: 90,
      friction: 12,
    }).start();
  };

  // "Swap" on a token page preselects a buy token for the Swap tab — make sure
  // it's the visible one, even if Cross-chain was open.
  useEffect(() => {
    if (route.params?.presetBuy && active !== 0) select(0);
  }, [route.params?.presetBuy]);

  const ActiveComponent = TABS[active].component;

  return (
    <View style={[styles.container, { backgroundColor: COLORS.background, paddingTop: insets.top }]}>
      <View
        style={[styles.track, { backgroundColor: COLORS.surface, borderColor: COLORS.border }]}
        onLayout={(e) => setTrackWidth(e.nativeEvent.layout.width)}
      >
        {segment ? (
          <Animated.View
            style={[
              styles.thumb,
              {
                width: segment,
                backgroundColor: COLORS.primary,
                transform: [
                  { translateX: slide.interpolate({ inputRange: [0, 1], outputRange: [0, segment] }) },
                ],
              },
            ]}
          />
        ) : null}
        {TABS.map((tab, i) => (
          <Pressable key={tab.key} style={styles.tab} onPress={() => select(i)}>
            <Text
              style={[
                styles.tabText,
                { color: i === active ? "#000" : COLORS.textSecondary },
                i === active && styles.tabTextActive,
              ]}
            >
              {tab.label}
            </Text>
          </Pressable>
        ))}
      </View>

      <View style={styles.content}>
        <ActiveComponent />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  track: {
    flexDirection: "row",
    marginHorizontal: 16,
    marginTop: 10,
    marginBottom: 6,
    padding: 4,
    borderRadius: 999,
    borderWidth: 1,
  },
  thumb: { position: "absolute", top: 4, bottom: 4, left: 4, borderRadius: 999 },
  tab: { flex: 1, alignItems: "center", paddingVertical: 10 },
  tabText: { fontSize: 15, fontWeight: "600", letterSpacing: 0.2 },
  tabTextActive: { fontWeight: "800" },
  content: { flex: 1 },
});

export default SwapBridgeScreen;
