import React, { useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  Image,
  Pressable,
  Animated,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../../contexts/ThemeContext";
import { SPACING, FONTS, BORDER_RADIUS } from "../../constants/Theme";
import { formatPriceChange } from "../../services/coingecko";

const formatNumber = (num, decimals = 2) => {
  if (num === undefined || num === null) return "0.00";
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(num);
};

// Tiny sparkline-style bar chart for visual flair
const MiniBar = ({ isPositive, COLORS }) => {
  const bars = [0.4, 0.65, 0.5, 0.8, 0.6, isPositive ? 0.9 : 0.3];
  const color = isPositive ? COLORS.success : COLORS.error;
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "flex-end",
        gap: 2,
        height: 18,
      }}
    >
      {bars.map((h, i) => (
        <View
          key={i}
          style={{
            width: 3,
            height: 18 * h,
            borderRadius: 2,
            backgroundColor: color,
            opacity: i === bars.length - 1 ? 1 : 0.35 + i * 0.1,
          }}
        />
      ))}
    </View>
  );
};

const AssetCard = ({ asset, onPress }) => {
  const { COLORS, isDark } = useTheme();
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const { chain, balance, usdValue, price, priceChange24h, isZeroBalance } =
    asset;

  if (!__DEV__ && chain.testnet) return null;

  const change = formatPriceChange(priceChange24h);

  const handlePressIn = () => {
    Animated.spring(scaleAnim, {
      toValue: 0.97,
      useNativeDriver: true,
      tension: 120,
      friction: 8,
    }).start();
  };

  const handlePressOut = () => {
    Animated.spring(scaleAnim, {
      toValue: 1,
      useNativeDriver: true,
      tension: 120,
      friction: 8,
    }).start();
  };

  const styles = StyleSheet.create({
    wrapper: {
      marginBottom: SPACING.sm,
    },
    card: {
      backgroundColor: isDark ? COLORS.card : "#FFFFFF",
      borderRadius: 18,
      borderWidth: 1,
      borderColor: isDark ? COLORS.borderStrong : COLORS.border,
      overflow: "hidden",
      shadowColor: isDark ? COLORS.primary : "#000",
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: isDark ? 0.15 : 0.07,
      shadowRadius: 14,
      elevation: 5,
      opacity: isZeroBalance ? 0.55 : 1,
    },

    // ── Accent bar at top ──
    accentBar: {
      height: 2,
      backgroundColor: change.isPositive ? COLORS.success : COLORS.error,
      opacity: 0.7,
    },

    body: {
      padding: SPACING.xs,
      paddingHorizontal:SPACING.md,
      flexDirection: "row",
      alignItems: "center",
      gap: SPACING.md,
    },

    // ── Left: icon with ring ──
    iconWrapper: {
      position: "relative",
    },
    iconRing: {
      width: 52,
      height: 52,
      borderRadius: 26,
      borderWidth: 1.5,
      borderColor: COLORS.primary + "40",
      justifyContent: "center",
      alignItems: "center",
      backgroundColor: isDark ? COLORS.surface : COLORS.primaryMuted,
    },
    icon: {
      width: 34,
      height: 34,
      borderRadius: 17,
    },
    testnetDot: {
      position: "absolute",
      bottom: 0,
      right: 0,
      width: 12,
      height: 12,
      borderRadius: 6,
      backgroundColor: COLORS.warning,
      borderWidth: 2,
      borderColor: isDark ? COLORS.card : "#fff",
    },

    // ── Center: chain name + price ──
    center: {
      flex: 1,
      gap: 4,
    },
    chainName: {
      fontSize: FONTS.sizes.md,
      fontWeight: "700",
      color: COLORS.text,
      letterSpacing: 0.1,
    },
    chainSymbol: {
      fontSize: FONTS.sizes.xs,
      color: COLORS.textTertiary,
      fontWeight: "500",
      letterSpacing: 0.5,
      textTransform: "uppercase",
    },
    priceRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: SPACING.xs,
      marginTop: 2,
    },
    priceText: {
      fontSize: FONTS.sizes.sm,
      color: COLORS.textSecondary,
      fontWeight: "500",
    },
    changePill: {
      flexDirection: "row",
      alignItems: "center",
      gap: 2,
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 20,
    },
    changeText: {
      fontSize: 10,
      fontWeight: "700",
      letterSpacing: 0.2,
    },

    // ── Right: balance + sparkline ──
    right: {
      alignItems: "flex-end",
      gap: 4,
    },
    usdValue: {
      fontSize: FONTS.sizes.md,
      fontWeight: "700",
      color: COLORS.text,
      letterSpacing: -0.3,
    },
    balanceText: {
      fontSize: FONTS.sizes.xs,
      color: COLORS.textTertiary,
      fontWeight: "500",
    },
    sparklineRow: {
      marginTop: 4,
    },
  });

  return (
    <Pressable
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      style={styles.wrapper}
    >
      <Animated.View
        style={[styles.card, { transform: [{ scale: scaleAnim }] }]}
      >
        {/* Top accent line — green if positive, red if negative */}
        <View style={styles.accentBar} />

        <View style={styles.body}>
          {/* ── Icon ── */}
          <View style={styles.iconWrapper}>
            <View style={styles.iconRing}>
              <Image source={{ uri: chain.icon }} style={styles.icon} />
            </View>
            {chain.testnet && <View style={styles.testnetDot} />}
          </View>

          {/* ── Chain info ── */}
          <View style={styles.center}>
            <Text style={styles.chainName}>{chain.name}</Text>
            <View style={styles.priceRow}>
              <Text style={styles.priceText}>${formatNumber(price, 2)}</Text>
              {priceChange24h !== undefined && priceChange24h !== null && (
                <View
                  style={[
                    styles.changePill,
                    {
                      backgroundColor: change.isPositive
                        ? COLORS.success + "18"
                        : COLORS.error + "18",
                    },
                  ]}
                >
                  <Ionicons
                    name={change.isPositive ? "caret-up" : "caret-down"}
                    size={8}
                    color={change.isPositive ? COLORS.success : COLORS.error}
                  />
                  <Text
                    style={[
                      styles.changeText,
                      {
                        color: change.isPositive
                          ? COLORS.success
                          : COLORS.error,
                      },
                    ]}
                  >
                    {change.text}
                  </Text>
                </View>
              )}
            </View>
          </View>

          {/* ── Balance + sparkline ── */}
          <View style={styles.right}>
            <Text style={styles.usdValue}>${formatNumber(usdValue, 2)}</Text>
            <Text style={styles.balanceText}>
              {formatNumber(parseFloat(balance), 4)} {chain.symbol}
            </Text>
            {priceChange24h !== undefined && priceChange24h !== null && (
              <View style={styles.sparklineRow}>
                <MiniBar isPositive={change.isPositive} COLORS={COLORS} />
              </View>
            )}
          </View>
        </View>
      </Animated.View>
    </Pressable>
  );
};

export default AssetCard;
