/**
 * components/payment/FeeBreakdown.js
 *
 * Abstracts network fees for the Payment screen.
 *
 * Default state: "Network fee included" — one clean line.
 * Expanded state: full gas breakdown behind "Advanced" toggle.
 *
 * This component is intentionally payment-vocabulary: it says "fee",
 * never "gas", unless the user explicitly expands.
 *
 * Future PaymentIntent plug-in points are marked with:
 *   // [INTENT] ...
 */

import React, { useRef, useEffect } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
  ActivityIndicator,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { SPACING, FONTS, BORDER_RADIUS } from "../../constants/Theme";

// ─────────────────────────────────────────────────────────────────────────────
// FeeBreakdown
// ─────────────────────────────────────────────────────────────────────────────
const FeeBreakdown = ({
  COLORS,
  isDark,
  gasEstimate, // object: { totalCost, gasPriceGwei, gasLimit, estimatedCostEth }
  estimatingGas, // bool
  gasError, // string | null
  expanded, // bool — controlled by parent
  onToggle, // () => void
  chainSymbol, // e.g. "ETH", "MATIC"
  // [INTENT] Future: feeOverride — merchant-specified flat fee
  // [INTENT] Future: feeLabel    — e.g. "Processing fee" from merchant intent
}) => {
  const rotateAnim = useRef(new Animated.Value(expanded ? 1 : 0)).current;
  const expandAnim = useRef(new Animated.Value(expanded ? 1 : 0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(rotateAnim, {
        toValue: expanded ? 1 : 0,
        useNativeDriver: true,
        speed: 20,
        bounciness: 0,
      }),
      Animated.timing(expandAnim, {
        toValue: expanded ? 1 : 0,
        duration: 220,
        useNativeDriver: false,
      }),
    ]).start();
  }, [expanded]);

  const chevronRotate = rotateAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "180deg"],
  });

  const hasFee = !!gasEstimate && !gasError;
  const feeValue = hasFee
    ? parseFloat(gasEstimate.estimatedCostEth ?? gasEstimate.totalCost ?? 0)
    : null;

  // ── Helper: format fee as a display string ──────────────────────────────
  const feeDisplay =
    feeValue !== null ? `${feeValue.toFixed(6)} ${chainSymbol}` : null;

  return (
    <View
      style={[
        styles.wrap,
        {
          backgroundColor: isDark ? COLORS.cardElevated : COLORS.surface,
          borderColor: gasError ? COLORS.error + "40" : COLORS.border,
        },
      ]}
    >
      {/* ── Collapsed row ── */}
      <TouchableOpacity
        style={styles.row}
        onPress={onToggle}
        activeOpacity={0.7}
        disabled={estimatingGas}
      >
        {/* Left: fee icon + label */}
        <View style={styles.left}>
          <View
            style={[
              styles.iconWrap,
              {
                backgroundColor: gasError
                  ? COLORS.error + "15"
                  : COLORS.primary + "12",
              },
            ]}
          >
            <Feather
              name={gasError ? "alert-triangle" : "zap"}
              size={14}
              color={gasError ? COLORS.error : COLORS.primary}
            />
          </View>
          <Text style={[styles.label, { color: COLORS.text }]}>
            {/* [INTENT] Phase 1+: replace with intent.feeLabel if present */}
            Network fee
          </Text>
        </View>

        {/* Right: value or spinner */}
        <View style={styles.right}>
          {estimatingGas ? (
            <View style={styles.spinnerRow}>
              <ActivityIndicator size="small" color={COLORS.primary} />
              <Text
                style={[styles.estimatingText, { color: COLORS.textTertiary }]}
              >
                Calculating…
              </Text>
            </View>
          ) : gasError ? (
            <Text style={[styles.errorText, { color: COLORS.error }]}>
              Unavailable
            </Text>
          ) : feeDisplay ? (
            <Text style={[styles.feeValue, { color: COLORS.textSecondary }]}>
              {feeDisplay}
            </Text>
          ) : (
            <Text style={[styles.includedText, { color: COLORS.success }]}>
              Included ✓
            </Text>
          )}

          <Animated.View style={{ transform: [{ rotate: chevronRotate }] }}>
            <Feather
              name="chevron-down"
              size={14}
              color={COLORS.textTertiary}
              style={{ marginLeft: 6 }}
            />
          </Animated.View>
        </View>
      </TouchableOpacity>

      {/* ── Expandable breakdown ── */}
      <Animated.View
        style={{
          overflow: "hidden",
          maxHeight: expandAnim.interpolate({
            inputRange: [0, 1],
            outputRange: [0, 160],
          }),
          opacity: expandAnim,
        }}
      >
        <View style={[styles.breakdown, { borderTopColor: COLORS.border }]}>
          {/* Advanced label */}
          <Text style={[styles.advancedLabel, { color: COLORS.textTertiary }]}>
            Advanced
          </Text>

          {gasError ? (
            <Text style={[styles.breakdownNote, { color: COLORS.error }]}>
              {gasError}
            </Text>
          ) : hasFee ? (
            <>
              <BreakdownRow
                label="Gas limit"
                value={Number(gasEstimate.gasLimit).toLocaleString()}
                COLORS={COLORS}
              />
              <BreakdownRow
                label="Gas price"
                value={`${parseFloat(gasEstimate.gasPriceGwei ?? gasEstimate.gasPrice ?? 0).toFixed(2)} Gwei`}
                COLORS={COLORS}
              />
              <BreakdownRow
                label="Estimated cost"
                value={feeDisplay}
                COLORS={COLORS}
                highlight
              />
              {/* [INTENT] Phase 1+: show merchant-level fee or platform fee here */}
            </>
          ) : (
            <Text
              style={[styles.breakdownNote, { color: COLORS.textTertiary }]}
            >
              Fee details will appear once the payment is ready.
            </Text>
          )}
        </View>
      </Animated.View>
    </View>
  );
};

// ── Small key/value row inside the breakdown ─────────────────────────────────
const BreakdownRow = ({ label, value, COLORS, highlight }) => (
  <View style={styles.breakdownRow}>
    <Text style={[styles.breakdownKey, { color: COLORS.textTertiary }]}>
      {label}
    </Text>
    <Text
      style={[
        styles.breakdownVal,
        { color: highlight ? COLORS.text : COLORS.textSecondary },
        highlight && { fontWeight: "600" },
      ]}
    >
      {value}
    </Text>
  </View>
);

const styles = StyleSheet.create({
  wrap: {
    borderRadius: BORDER_RADIUS.lg,
    borderWidth: 1,
    overflow: "hidden",
    marginBottom: SPACING.md,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm + 2,
  },
  left: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.sm,
  },
  iconWrap: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  label: {
    fontSize: FONTS.sizes.sm,
    fontWeight: "500",
  },
  right: {
    flexDirection: "row",
    alignItems: "center",
  },
  spinnerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  estimatingText: {
    fontSize: FONTS.sizes.xs,
  },
  errorText: {
    fontSize: FONTS.sizes.xs,
    fontWeight: "500",
  },
  feeValue: {
    fontSize: FONTS.sizes.xs,
    fontFamily: "monospace",
  },
  includedText: {
    fontSize: FONTS.sizes.xs,
    fontWeight: "600",
  },
  // Breakdown
  breakdown: {
    paddingHorizontal: SPACING.md,
    paddingBottom: SPACING.md,
    paddingTop: SPACING.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  advancedLabel: {
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 1.5,
    textTransform: "uppercase",
    marginBottom: SPACING.sm,
  },
  breakdownRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  breakdownKey: {
    fontSize: FONTS.sizes.xs,
  },
  breakdownVal: {
    fontSize: FONTS.sizes.xs,
    fontFamily: "monospace",
  },
  breakdownNote: {
    fontSize: FONTS.sizes.xs,
    lineHeight: 18,
  },
});

export default FeeBreakdown;
