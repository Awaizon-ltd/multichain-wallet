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
import { SPACING, FONTS } from "../../constants/Theme";
import { formatPriceChange } from "../../services/coingecko";
import ChainBadge from "../common/ChainBadge";

const formatNumber = (num, decimals = 2) => {
  if (num === undefined || num === null) return "0.00";
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(num);
};

// Same mini sparkline as AssetCard
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

/**
 * TokenAssetCard
 *
 * Renders an ERC-20 token as an asset card that visually matches <AssetCard>.
 * Used in HomeScreen assets tab alongside native chain cards.
 *
 * Props:
 *   asset    — item from usePortfolioAssets.tokenAssets
 *   onPress  — navigate to TokenDetail
 *   onSend   — navigate to Send screen (optional)
 */
const TokenAssetCard = ({ asset, onPress, onSend }) => {
  const { COLORS, isDark } = useTheme();
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const {
    symbol,
    name,
    logo,
    chainIcon,
    balance,
    price,
    priceChange24h,
    usdValue,
  } = asset;
  const change =
    priceChange24h != null ? formatPriceChange(priceChange24h) : null;
  const hasBalance = parseFloat(balance ?? "0") > 0;

  const handlePressIn = () =>
    Animated.spring(scaleAnim, {
      toValue: 0.97,
      useNativeDriver: true,
      tension: 120,
      friction: 8,
    }).start();

  const handlePressOut = () =>
    Animated.spring(scaleAnim, {
      toValue: 1,
      useNativeDriver: true,
      tension: 120,
      friction: 8,
    }).start();

  // Deterministic accent colour derived from symbol chars (same colour every render)
  const ACCENTS = [
    "#6366F1",
    "#F59E0B",
    "#10B981",
    "#EF4444",
    "#3B82F6",
    "#8B5CF6",
    "#EC4899",
    "#14B8A6",
  ];
  const accent =
    ACCENTS[
      symbol.split("").reduce((a, c) => a + c.charCodeAt(0), 0) % ACCENTS.length
    ];

  const styles = StyleSheet.create({
    wrapper: { marginBottom: SPACING.sm },
    body: {
      padding: SPACING.xs,
      paddingHorizontal: SPACING.md,
      flexDirection: "row",
      alignItems: "center",
      gap: SPACING.md,
    },
    iconWrapper: { position: "relative" },
    iconRing: {
      width: 52,
      height: 52,
      borderRadius: 26,
      borderWidth: 1.5,
      borderColor: accent + "50",
      justifyContent: "center",
      alignItems: "center",
      backgroundColor: isDark ? COLORS.surface : accent + "15",
    },
    icon: { width: 34, height: 34, borderRadius: 17 },
    iconFallback: {
      width: 34,
      height: 34,
      borderRadius: 17,
      justifyContent: "center",
      alignItems: "center",
      backgroundColor: accent + "30",
    },
    iconFallbackText: { fontSize: 13, fontWeight: "700", color: accent },
    center: { flex: 1, gap: 4 },
    tokenName: {
      fontSize: FONTS.sizes.md,
      fontWeight: "700",
      color: COLORS.text,
      letterSpacing: 0.1,
    },
    tokenSymbol: {
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
    noPrice: {
      fontSize: FONTS.sizes.xs,
      color: COLORS.textTertiary,
      fontStyle: "italic",
    },
    changePill: {
      flexDirection: "row",
      alignItems: "center",
      gap: 2,
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 20,
    },
    changeText: { fontSize: 10, fontWeight: "700", letterSpacing: 0.2 },
    right: { alignItems: "flex-end", gap: 4 },
    usdValue: {
      fontSize: FONTS.sizes.md,
      fontWeight: "700",
      color: COLORS.text,
      letterSpacing: -0.3,
    },
    usdValueZero: { color: COLORS.textTertiary },
    balanceText: {
      fontSize: FONTS.sizes.xs,
      color: COLORS.textTertiary,
      fontWeight: "500",
    },
    sparklineRow: { marginTop: 4 },
    sendBtn: {
      marginTop: 4,
      flexDirection: "row",
      alignItems: "center",
      gap: 3,
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 8,
      backgroundColor: COLORS.primary + "18",
    },
    sendBtnText: { fontSize: 10, fontWeight: "700", color: COLORS.primary },
    sendBtnDisabled: { opacity: 0.3 },
  });

  return (
    <Pressable
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      style={styles.wrapper}
    >
      <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
        <View style={styles.body}>
          {/* Icon */}
          <View style={styles.iconWrapper}>
            <View style={styles.iconRing}>
              {logo ? (
                <Image source={{ uri: logo }} style={styles.icon} />
              ) : (
                <View style={styles.iconFallback}>
                  <Text style={styles.iconFallbackText}>
                    {symbol.substring(0, 2).toUpperCase()}
                  </Text>
                </View>
              )}
            </View>
            <ChainBadge uri={chainIcon} borderColor={COLORS.background} />
          </View>

          {/* Info */}
          <View style={styles.center}>
            <Text style={styles.tokenName} numberOfLines={1}>
              {name}
            </Text>
            <Text style={styles.tokenSymbol}>{symbol}</Text>
            <View style={styles.priceRow}>
              {price != null ? (
                <Text style={styles.priceText}>${formatNumber(price, 4)}</Text>
              ) : (
                <Text style={styles.noPrice}>No price data</Text>
              )}
              {change && (
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

          {/* Balance */}
          <View style={styles.right}>
            <Text style={[styles.usdValue, !hasBalance && styles.usdValueZero]}>
              ${formatNumber(usdValue ?? 0, 2)}
            </Text>
            <Text style={styles.balanceText}>
              {formatNumber(parseFloat(balance ?? "0"), 4)} {symbol}
            </Text>
            {change && (
              <View style={styles.sparklineRow}>
                <MiniBar isPositive={change.isPositive} COLORS={COLORS} />
              </View>
            )}
            {onSend && (
              <Pressable
                onPress={(e) => {
                  e.stopPropagation?.();
                  if (hasBalance) onSend();
                }}
                style={[styles.sendBtn, !hasBalance && styles.sendBtnDisabled]}
              >
                <Ionicons name="paper-plane" size={10} color={COLORS.primary} />
                <Text style={styles.sendBtnText}>Send</Text>
              </Pressable>
            )}
          </View>
        </View>
      </Animated.View>
    </Pressable>
  );
};

export default TokenAssetCard;
