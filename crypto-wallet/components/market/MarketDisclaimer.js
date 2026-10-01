// components/market/MarketDisclaimer.js
// One-time (per device) disclaimer shown at the top of the Market screen.
// Dismissing it persists via AsyncStorage — same pattern as BannerCarousel's
// dismiss — so it doesn't reappear every time the user opens the screen.
import React, { useEffect, useState } from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../../contexts/ThemeContext";

const DISMISSED_KEY = "@market_disclaimer_dismissed";

const MarketDisclaimer = () => {
  const { COLORS } = useTheme();
  const [dismissed, setDismissed] = useState(true); // hidden until we know it wasn't dismissed before

  useEffect(() => {
    AsyncStorage.getItem(DISMISSED_KEY)
      .then((v) => setDismissed(v === "1"))
      .catch(() => setDismissed(false));
  }, []);

  const cancel = () => {
    setDismissed(true);
    AsyncStorage.setItem(DISMISSED_KEY, "1").catch(() => {});
  };

  if (dismissed) return null;

  return (
    <View style={[styles.wrap, { backgroundColor: COLORS.warning + "14" }]}>
      <Ionicons name="alert-circle-outline" size={16} color={COLORS.warning} />
      <Text style={[styles.text, { color: COLORS.textSecondary }]}>
        Market data is for information only and isn't financial advice.
        Prices, especially for new and small-cap tokens, can move fast and
        carry real risk — always do your own research before trading.
      </Text>
      <Pressable onPress={cancel} hitSlop={8}>
        <Text style={[styles.cancel, { color: COLORS.warning }]}>Cancel</Text>
      </Pressable>
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    padding: 12,
    borderRadius: 12,
    marginBottom: 12,
  },
  text: { flex: 1, fontSize: 12, lineHeight: 17 },
  cancel: { fontSize: 12, fontWeight: "700", paddingLeft: 4 },
});

export default MarketDisclaimer;
