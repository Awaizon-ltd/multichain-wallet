import React, { useEffect, useRef, useMemo } from "react";
import { View, Text, StyleSheet, Animated } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../../contexts/ThemeContext";
import { useChain } from "../../contexts/ChainContext";
import { SPACING, FONTS, BORDER_RADIUS } from "../../constants/Theme";
import { formatPriceChange } from "../../services/coingecko";

const formatNumber = (num, decimals = 2) => {
  if (num === undefined || num === null || isNaN(num)) num = 0;
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(num);
};

const shortAddress = (addr) =>
  addr && addr.length > 12 ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : addr;

const SkeletonBone = ({ width, height, borderRadius = 6, style }) => {
  const { COLORS } = useTheme();
  const shimmer = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(shimmer, {
          toValue: 1,
          duration: 900,
          useNativeDriver: true,
        }),
        Animated.timing(shimmer, {
          toValue: 0,
          duration: 900,
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [shimmer]);

  const opacity = shimmer.interpolate({
    inputRange: [0, 1],
    outputRange: [0.15, 0.35],
  });

  return (
    <Animated.View
      style={[
        {
          width,
          height,
          borderRadius,
          backgroundColor: COLORS.primary,
          opacity,
        },
        style,
      ]}
    />
  );
};

const PortfolioSummary = ({
  totalValue,
  totalChange24h,
  loading,
  includesTestnet = false,
  walletAddress,
  tokenCount = 0, // total number of assets (native chains + tokens)
}) => {
  const { COLORS } = useTheme();
  const { isProduction } = useChain();
  const change = formatPriceChange(totalChange24h);
  const hasChange = totalChange24h !== undefined && totalChange24h !== null;

  // Split "1,234.56" into whole + cents so the cents can be set smaller
  // A tiny but non-zero total reads "<$0.01" rather than "$0.00"
  const tiny = totalValue > 0 && totalValue < 0.01;
  const [whole, cents] = useMemo(() => {
    if (tiny) return ["0", "01"];
    const [w, c] = formatNumber(totalValue, 2).split(".");
    return [w, c];
  }, [totalValue, tiny]);

  const trendColor = change.isPositive ? COLORS.success : COLORS.error;

  const styles = useMemo(
    () =>
      StyleSheet.create({
        container: {
          paddingHorizontal: SPACING.md,
          paddingTop: SPACING.sm,
          paddingBottom: SPACING.lg,
          marginBottom: SPACING.sm,
        },
        topRow: {
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: SPACING.xs,
        },
        label: {
          fontSize: FONTS.sizes.sm,
          fontWeight: "600",
          color: COLORS.textSecondary,
        },
        addressPill: {
          flexDirection: "row",
          alignItems: "center",
          gap: 5,
          paddingHorizontal: 10,
          paddingVertical: 4,
          borderRadius: BORDER_RADIUS.round,
          backgroundColor: COLORS.surface,
          borderWidth: 1,
          borderColor: COLORS.primary + "25",
        },
        addressText: {
          fontSize: FONTS.sizes.xs,
          fontWeight: "600",
          color: COLORS.textSecondary,
        },
        valueRow: {
          flexDirection: "row",
          alignItems: "flex-start",
        },
        currency: {
          fontSize: 22,
          fontWeight: "700",
          color: COLORS.textSecondary,
          marginTop: 6,
          marginRight: 2,
        },
        whole: {
          fontSize: 46,
          lineHeight: 54,
          fontWeight: "800",
          letterSpacing: -1.5,
          color: COLORS.text,
        },
        cents: {
          fontSize: 22,
          fontWeight: "700",
          color: COLORS.textSecondary,
          marginTop: 7,
          marginLeft: 1,
        },
        metaRow: {
          flexDirection: "row",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 8,
          marginTop: SPACING.sm,
        },
        changePill: {
          flexDirection: "row",
          alignItems: "center",
          gap: 4,
          paddingHorizontal: 10,
          paddingVertical: 5,
          borderRadius: BORDER_RADIUS.round,
          backgroundColor: trendColor + "1F",
        },
        changeText: {
          fontSize: FONTS.sizes.sm,
          fontWeight: "800",
          color: trendColor,
        },
        metaText: {
          fontSize: FONTS.sizes.xs,
          fontWeight: "600",
          color: COLORS.textSecondary,
        },
        assetPill: {
          flexDirection: "row",
          alignItems: "center",
          gap: 4,
          paddingHorizontal: 10,
          paddingVertical: 5,
          borderRadius: BORDER_RADIUS.round,
          backgroundColor: COLORS.primary + "14",
        },
        assetPillText: {
          fontSize: FONTS.sizes.xs,
          fontWeight: "700",
          color: COLORS.primary,
        },
        skeletonWrap: { gap: 12, marginTop: 4 },
        testnetBadge: {
          flexDirection: "row",
          alignItems: "center",
          alignSelf: "flex-start",
          gap: 4,
          marginTop: SPACING.md,
          paddingHorizontal: SPACING.sm,
          paddingVertical: SPACING.xs,
          borderRadius: BORDER_RADIUS.round,
          backgroundColor: `${COLORS.warning}20`,
        },
        testnetText: {
          fontSize: FONTS.sizes.xs,
          fontWeight: "600",
          color: COLORS.warning,
        },
      }),
    [COLORS, trendColor],
  );

  return (
    <View style={styles.container}>
      {/* Label + address */}
      <View style={styles.topRow}>
        <Text style={styles.label}>Total balance</Text>
        {!!walletAddress && (
          <View style={styles.addressPill}>
            <Ionicons
              name="wallet-outline"
              size={12}
              color={COLORS.textSecondary}
            />
            <Text style={styles.addressText}>
              {shortAddress(walletAddress)}
            </Text>
          </View>
        )}
      </View>

      {loading ? (
        <View style={styles.skeletonWrap}>
          <SkeletonBone width={200} height={44} borderRadius={10} />
          <View style={{ flexDirection: "row", gap: 8 }}>
            <SkeletonBone width={84} height={26} borderRadius={13} />
            <SkeletonBone width={72} height={26} borderRadius={13} />
          </View>
        </View>
      ) : (
        <>
          {/* Balance */}
          <View style={styles.valueRow}>
            <Text style={styles.currency}>{tiny ? "<$" : "$"}</Text>
            <Text style={styles.whole} adjustsFontSizeToFit numberOfLines={1}>
              {whole}
            </Text>
            <Text style={styles.cents}>.{cents}</Text>
          </View>

          {/* Change + asset count */}
          <View style={styles.metaRow}>
            {hasChange && (
              <View style={styles.changePill}>
                <Ionicons
                  name={change.isPositive ? "arrow-up" : "arrow-down"}
                  size={12}
                  color={trendColor}
                />
                <Text style={styles.changeText}>{change.text}</Text>
              </View>
            )}
            {hasChange && <Text style={styles.metaText}>past 24h</Text>}
            {tokenCount > 0 && (
              <View style={styles.assetPill}>
                <Ionicons
                  name="layers-outline"
                  size={11}
                  color={COLORS.primary}
                />
                <Text style={styles.assetPillText}>
                  {tokenCount} asset{tokenCount !== 1 ? "s" : ""}
                </Text>
              </View>
            )}
          </View>
        </>
      )}

      {!isProduction && includesTestnet && (
        <View style={styles.testnetBadge}>
          <Ionicons name="flask" size={12} color={COLORS.warning} />
          <Text style={styles.testnetText}>Includes testnet</Text>
        </View>
      )}
    </View>
  );
};

export default PortfolioSummary;
