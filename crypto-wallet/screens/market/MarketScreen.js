// screens/market/MarketScreen.js
// Full-screen version of the same trending/market data shown inside Swap —
// more tokens per tab, more chains, more Meme/RWA, plus a New Launch tab.
// Tapping any asset deep-links straight into Swap with its chain switched
// and the token preselected as the buy side — no separate detail step.
import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, ScrollView } from "react-native";
import { useTheme } from "../../contexts/ThemeContext";
import { useChain } from "../../contexts/ChainContext";
import TrendingTokens from "../../components/swap/TrendingTokens";
import MarketDisclaimer from "../../components/market/MarketDisclaimer";
import Alert from "../../utils/Alert";

const NATIVE_ADDRESS = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";

const MarketScreen = ({ navigation }) => {
  const { COLORS, SPACING, FONTS } = useTheme();
  const { activeChain } = useChain();
  const [tabChainId, setTabChainId] = useState(null);

  const handleTabChange = useCallback((tab) => {
    setTabChainId(tab?.chainId ?? null);
  }, []);

  const handleAssetPress = useCallback(
    (token) => {
      const chains = token.chains || [];
      // Prefer the chain the asset was shown under (e.g. the "Arc" tab),
      // then the network the user is already on, then whatever's first —
      // in that order, same logic TokenDetailScreen uses for its Swap CTA.
      const deployment =
        (tabChainId && chains.find((c) => c.chainId === tabChainId)) ||
        chains.find((c) => c.chainId === activeChain?.id) ||
        chains[0];

      if (!deployment) {
        Alert.alert(
          "Not available",
          `${token.symbol} isn't available to swap on a chain we support yet.`,
        );
        return;
      }

      navigation.navigate("Main", {
        screen: "SwapTab",
        params: {
          presetBuy: {
            chainId: deployment.chainId,
            address: deployment.isNative ? NATIVE_ADDRESS : deployment.address,
            isNative: !!deployment.isNative,
            decimals: deployment.decimals ?? 18,
            symbol: token.symbol,
            name: token.name,
            logoURI: token.image,
          },
        },
      });
    },
    [tabChainId, activeChain?.id, navigation],
  );

  const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: COLORS.background },
    content: { padding: SPACING.md, paddingBottom: 100 },
    title: {
      fontSize: FONTS.sizes.xxl,
      fontWeight: "800",
      color: COLORS.text,
      marginBottom: SPACING.md,
    },
  });

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>Market</Text>

        <MarketDisclaimer />

        <TrendingTokens
          onTokenPress={handleAssetPress}
          onTabChange={handleTabChange}
          hideHeader
        />
      </ScrollView>
    </View>
  );
};

export default MarketScreen;
