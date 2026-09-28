import React, { useEffect, useRef } from "react";
import { View, Text, StyleSheet, Animated } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Card from "../common/Card";
import { useTheme } from "../../contexts/ThemeContext";
import { useChain } from "../../contexts/ChainContext";
import { SPACING, FONTS, BORDER_RADIUS } from "../../constants/Theme";
import { formatPriceChange } from "../../services/coingecko";

const formatNumber = (num, decimals = 2) => {
  if (num === undefined || num === null) return "0.00";
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(num);
};

const SkeletonBone = ({ width, height, borderRadius = 6, style }) => {
  const { COLORS } = useTheme();
  const shimmer = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
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
    ).start();
  }, []);

  const opacity = shimmer.interpolate({
    inputRange: [0, 1],
    outputRange: [0.35, 0.7],
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
  tokenCount = 0, // total number of assets (native chains + ERC-20 tokens)
}) => {
  const { COLORS } = useTheme();
  const { isProduction } = useChain();
  const change = formatPriceChange(totalChange24h);

  const styles = StyleSheet.create({
    container: {
      paddingHorizontal: SPACING.lg,
      paddingTop: SPACING.md,
      paddingBottom: SPACING.lg,
      marginBottom: SPACING.md,
      backgroundColor: "transparent",
      shadowOpacity: 0,
      elevation: 0,
      borderWidth: 0,
    },
    row: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    leftSection: { flex: 1, alignItems: "flex-start" },
    label: {
      fontSize: FONTS.sizes.xs,
      color: COLORS.textSecondary,
      textTransform: "uppercase",
      letterSpacing: 0.5,
      marginBottom: 2,
    },
    value: {
      fontSize: FONTS.sizes.xxl,
      fontWeight: "bold",
      color: COLORS.text,
    },
    subRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      marginTop: 4,
    },
    trendIconContainer: { flexDirection: "row", alignItems: "center", gap: 3 },
    trendLabel: { fontSize: FONTS.sizes.xs, color: COLORS.textSecondary },
    assetPill: {
      flexDirection: "row",
      alignItems: "center",
      gap: 3,
      backgroundColor: COLORS.primary + "14",
      paddingHorizontal: 7,
      paddingVertical: 2,
      borderRadius: BORDER_RADIUS.round,
    },
    assetPillText: {
      fontSize: FONTS.sizes.xs,
      fontWeight: "600",
      color: COLORS.primary,
    },
    rightSection: { alignItems: "flex-end", justifyContent: "center" },
    changeBig: {
      fontSize: FONTS.sizes.xxl,
      fontWeight: "800",
      letterSpacing: -0.5,
    },
    changeSubLabel: {
      fontSize: FONTS.sizes.xs,
      color: COLORS.textSecondary,
      marginTop: 2,
      textAlign: "right",
    },
    skeletonLeft: { gap: 8 },
    skeletonRight: { alignItems: "flex-end", gap: 8 },
    testnetBadge: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: `${COLORS.warning}20`,
      paddingHorizontal: SPACING.sm,
      paddingVertical: SPACING.xs,
      borderRadius: BORDER_RADIUS.round,
      marginTop: SPACING.md,
      alignSelf: "flex-start",
      gap: 4,
    },
    testnetText: {
      fontSize: FONTS.sizes.xs,
      color: COLORS.warning,
      fontWeight: "600",
    },
  });

  return (
    <Card style={styles.container}>
      <View style={styles.row}>
        {/* Left */}
        <View style={styles.leftSection}>
          <Text style={styles.label}>Total Portfolio</Text>

          {loading ? (
            <View style={styles.skeletonLeft}>
              <SkeletonBone width={160} height={32} borderRadius={8} />
              <SkeletonBone width={90} height={12} borderRadius={6} />
            </View>
          ) : (
            <>
              <Text style={styles.value}>${formatNumber(totalValue, 2)}</Text>
              <View style={styles.subRow}>
                {totalChange24h !== undefined && totalChange24h !== null && (
                  <View style={styles.trendIconContainer}>
                    <Ionicons
                      name={change.isPositive ? "trending-up" : "trending-down"}
                      size={13}
                      color={change.isPositive ? COLORS.success : COLORS.error}
                    />
                    <Text style={styles.trendLabel}>24h change</Text>
                  </View>
                )}
                {tokenCount > 0 && (
                  <View style={styles.assetPill}>
                    <Ionicons
                      name="layers-outline"
                      size={10}
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
        </View>

        {/* Right */}
        {loading ? (
          <View style={styles.skeletonRight}>
            <SkeletonBone width={80} height={32} borderRadius={8} />
            <SkeletonBone width={28} height={11} borderRadius={6} />
          </View>
        ) : (
          totalChange24h !== undefined &&
          totalChange24h !== null && (
            <View style={styles.rightSection}>
              <Text
                style={[
                  styles.changeBig,
                  { color: change.isPositive ? COLORS.success : COLORS.error },
                ]}
              >
                {change.text}
              </Text>
              <Text style={styles.changeSubLabel}>24h</Text>
            </View>
          )
        )}
      </View>

      {!isProduction && includesTestnet && (
        <View style={styles.testnetBadge}>
          <Ionicons name="flask" size={12} color={COLORS.warning} />
          <Text style={styles.testnetText}>Includes Testnet</Text>
        </View>
      )}
    </Card>
  );
};

export default PortfolioSummary;
