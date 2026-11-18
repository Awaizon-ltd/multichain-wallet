// screens/swap/SwapBridgeScreen.js
// The Swap tab. Same-chain and cross-chain swaps are one screen now
// (SwapNewSCreen + hooks/useSwap.js pick 0x / Jupiter / LI.FI per pair), so
// this only adds the top safe-area inset the tab needs.
import React from "react";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "../../contexts/ThemeContext";
import SwapScreen from "./SwapNewSCreen";

const SwapBridgeScreen = () => {
  const { COLORS } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View style={{ flex: 1, backgroundColor: COLORS.background, paddingTop: insets.top }}>
      <SwapScreen />
    </View>
  );
};

export default SwapBridgeScreen;
