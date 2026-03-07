/**
 * components/payment/PaymentConfirmationSheet.js
 *
 * The payment-specific confirmation step.
 *
 * This is what makes Pay ≠ Send.
 *
 * It sits between the PaymentScreen form and the existing TransactionModal.
 * The user sees a non-editable, payment-vocabulary summary and must
 * explicitly tap "Confirm Payment" — which then opens the TransactionModal
 * for PIN + broadcast.
 *
 * ┌──────────────────────────────────────────────────────────────┐
 * │  PaymentScreen form                                          │
 * │       ↓  "Review Payment"                                    │
 * │  PaymentConfirmationSheet   ← YOU ARE HERE                   │
 * │       ↓  "Confirm Payment"                                   │
 * │  TransactionModal (PIN → broadcast) — reused from app        │
 * └──────────────────────────────────────────────────────────────┘
 *
 * Future PaymentIntent plug-in points are marked with [INTENT].
 */

import React, { useRef, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ScrollView,
  Animated,
  Image,
  Platform,
} from "react-native";
import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import { SPACING, FONTS, BORDER_RADIUS, SHADOWS } from "../../constants/Theme";
import { FIAT_CURRENCIES } from "./PaymentIntent";
import { formatAddress } from "../../utils/Wallet";

// ─────────────────────────────────────────────────────────────────────────────
// SummaryRow — a single non-editable key/value line in the payment summary
// ─────────────────────────────────────────────────────────────────────────────
const SummaryRow = ({
  label,
  value,
  valueColor,
  mono,
  last,
  COLORS,
  children,
}) => (
  <>
    <View style={ss.summaryRow}>
      <Text style={[ss.summaryKey, { color: COLORS.textTertiary }]}>
        {label}
      </Text>
      {children ?? (
        <Text
          style={[
            ss.summaryVal,
            { color: valueColor ?? COLORS.text },
            mono && ss.mono,
          ]}
          numberOfLines={1}
          ellipsizeMode="middle"
        >
          {value}
        </Text>
      )}
    </View>
    {!last && <View style={[ss.divider, { backgroundColor: COLORS.border }]} />}
  </>
);

// ─────────────────────────────────────────────────────────────────────────────
// PaymentConfirmationSheet
// ─────────────────────────────────────────────────────────────────────────────
const PaymentConfirmationSheet = ({
  visible,
  onClose, // go back to editing
  onConfirm, // open TransactionModal
  intent, // PaymentIntent object
  gasEstimate, // from usePaymentIntent
  chainSymbol, // e.g. "ETH"
  COLORS,
  isDark,
}) => {
  const slideAnim = useRef(new Animated.Value(0)).current;
  const backdropAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.spring(slideAnim, {
          toValue: 1,
          useNativeDriver: true,
          tension: 65,
          friction: 11,
        }),
        Animated.timing(backdropAnim, {
          toValue: 1,
          duration: 250,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(slideAnim, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.timing(backdropAnim, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [visible]);

  if (!intent) return null;

  const { asset, fiatAmount, fiatCurrency, tokenAmount, recipient } = intent;

  const fiatMeta = FIAT_CURRENCIES[fiatCurrency] ?? FIAT_CURRENCIES.NGN;
  const fiatSymbol = fiatMeta.symbol;

  const feeDisplay = gasEstimate
    ? `${parseFloat(gasEstimate.estimatedCostEth ?? gasEstimate.totalCost ?? 0).toFixed(6)} ${chainSymbol}`
    : "Included";

  // Total in token terms (token amount + fee in same token — only relevant for native)
  // For stablecoins, fee is always in the native chain token, shown separately.
  const formattedRecipient = recipient ? formatAddress(recipient, 14) : "—";

  // [INTENT] Phase 1+: show merchant name / logo here if intent.merchant is set
  // const merchantName = intent.merchant?.name ?? null;
  // const merchantLogo = intent.merchant?.logo ?? null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onClose}
    >
      {/* ── Backdrop ── */}
      <Animated.View
        style={[ss.backdrop, { opacity: backdropAnim }]}
        pointerEvents={visible ? "auto" : "none"}
      >
        <TouchableOpacity
          style={{ flex: 1 }}
          onPress={onClose}
          activeOpacity={1}
        />
      </Animated.View>

      {/* ── Sheet ── */}
      <Animated.View
        style={[
          ss.sheet,
          {
            backgroundColor: COLORS.background,
            transform: [
              {
                translateY: slideAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [600, 0],
                }),
              },
            ],
          },
        ]}
      >
        {/* Drag handle */}
        <View style={ss.handleRow}>
          <View style={[ss.handle, { backgroundColor: COLORS.border }]} />
        </View>

        {/* ── Header ── */}
        <View style={ss.headerRow}>
          <View>
            <Text style={[ss.headerTitle, { color: COLORS.text }]}>
              Review Payment
            </Text>
            {/* [INTENT] Phase 1+: "Payment to {merchantName}" */}
            <Text style={[ss.headerSub, { color: COLORS.textTertiary }]}>
              Check the details before confirming
            </Text>
          </View>
          <TouchableOpacity
            onPress={onClose}
            style={[ss.closeBtn, { backgroundColor: COLORS.cardElevated }]}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Feather name="x" size={18} color={COLORS.textSecondary} />
          </TouchableOpacity>
        </View>

        <ScrollView
          contentContainerStyle={ss.scroll}
          showsVerticalScrollIndicator={false}
        >
          {/* ── [INTENT] Phase 1+: Merchant identity card ────────────────── */}
          {/*   Uncomment and populate when intent.merchant is available.      */}
          {/*   {merchantName && (                                              */}
          {/*     <MerchantCard name={merchantName} logo={merchantLogo}        */}
          {/*       verified={intent.merchant.verified} COLORS={COLORS} />     */}
          {/*   )}                                                             */}

          {/* ── Amount hero ── */}
          <View style={ss.amountHero}>
            <Text style={[ss.amountFiat, { color: COLORS.text }]}>
              {fiatSymbol}
              {parseFloat(fiatAmount || "0").toLocaleString(undefined, {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </Text>
            <Text style={[ss.amountToken, { color: COLORS.textSecondary }]}>
              {tokenAmount} {asset?.symbol}
            </Text>
          </View>

          {/* ── Payment summary card ── */}
          <View
            style={[
              ss.summaryCard,
              {
                backgroundColor: isDark ? COLORS.cardElevated : COLORS.surface,
                borderColor: COLORS.border,
                ...SHADOWS.small,
              },
            ]}
          >
            {/* Recipient */}
            <SummaryRow
              label="Payment recipient"
              value={formattedRecipient}
              mono
              COLORS={COLORS}
            />

            {/* Asset */}
            <SummaryRow label="Token" COLORS={COLORS}>
              <View style={ss.assetCell}>
                {asset?.logo ? (
                  <Image
                    source={{ uri: asset.logo }}
                    style={ss.assetLogo}
                    resizeMode="contain"
                  />
                ) : (
                  <View
                    style={[
                      ss.assetFallback,
                      { backgroundColor: COLORS.primary + "20" },
                    ]}
                  >
                    <Text
                      style={[ss.assetFallbackText, { color: COLORS.primary }]}
                    >
                      {asset?.symbol?.slice(0, 2)}
                    </Text>
                  </View>
                )}
                <Text style={[ss.assetLabel, { color: COLORS.text }]}>
                  {asset?.symbol}
                </Text>
                {/* [INTENT] Phase 1+: if asset is locked by intent, show lock icon */}
              </View>
            </SummaryRow>

            {/* Amount (token) */}
            <SummaryRow
              label="You pay"
              value={`${tokenAmount} ${asset?.symbol}`}
              valueColor={COLORS.primary}
              COLORS={COLORS}
            />

            {/* Fee */}
            <SummaryRow
              label="Network fee"
              value={feeDisplay}
              COLORS={COLORS}
            />

            {/* Total */}
            <SummaryRow label="Total deducted" COLORS={COLORS} last>
              <View style={ss.totalCell}>
                <Text style={[ss.totalToken, { color: COLORS.text }]}>
                  {tokenAmount} {asset?.symbol}
                </Text>
                <Text style={[ss.totalFeeNote, { color: COLORS.textTertiary }]}>
                  + {feeDisplay} fee
                </Text>
              </View>
            </SummaryRow>
          </View>

          {/* ── [INTENT] Phase 1+: Reference / memo ───────────────────────── */}
          {/* {intent.reference && (                                             */}
          {/*   <View style={ss.referenceRow}>                                  */}
          {/*     <Feather name="hash" size={12} color={COLORS.textTertiary} /> */}
          {/*     <Text>Ref: {intent.reference}</Text>                           */}
          {/*   </View>                                                          */}
          {/* )}                                                                */}

          {/* ── Safety copy ── */}
          <View
            style={[
              ss.safetyCopy,
              {
                backgroundColor: isDark
                  ? COLORS.warning + "12"
                  : COLORS.warning + "08",
                borderColor: COLORS.warning + "30",
              },
            ]}
          >
            <MaterialCommunityIcons
              name="shield-check-outline"
              size={15}
              color={COLORS.warning}
              style={{ flexShrink: 0, marginTop: 1 }}
            />
            <Text style={[ss.safetyText, { color: COLORS.textSecondary }]}>
              <Text style={{ color: COLORS.text, fontWeight: "700" }}>
                Payments are final once confirmed.
              </Text>{" "}
              Double-check the recipient address — blockchain transactions
              cannot be reversed.
            </Text>
          </View>
        </ScrollView>

        {/* ── Action buttons ── */}
        <View
          style={[
            ss.actions,
            {
              borderTopColor: COLORS.border,
              paddingBottom: Platform.OS === "ios" ? 36 : SPACING.lg,
            },
          ]}
        >
          {/* Edit — go back to form */}
          <TouchableOpacity
            style={[
              ss.editBtn,
              {
                borderColor: COLORS.border,
                backgroundColor: COLORS.cardElevated,
              },
            ]}
            onPress={onClose}
            activeOpacity={0.75}
          >
            <Feather name="edit-2" size={15} color={COLORS.textSecondary} />
            <Text style={[ss.editBtnLabel, { color: COLORS.textSecondary }]}>
              Edit
            </Text>
          </TouchableOpacity>

          {/* Confirm Payment — the deliberate, final CTA */}
          <TouchableOpacity
            style={[
              ss.confirmBtn,
              {
                backgroundColor: COLORS.primary,
                shadowColor: COLORS.primary,
              },
            ]}
            onPress={onConfirm}
            activeOpacity={0.88}
          >
            <Feather name="check-circle" size={17} color={COLORS.background} />
            <Text style={[ss.confirmBtnLabel, { color: COLORS.background }]}>
              Confirm Payment
            </Text>
          </TouchableOpacity>
        </View>
      </Animated.View>
    </Modal>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────
const ss = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.55)",
  },
  sheet: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    maxHeight: "92%",
    overflow: "hidden",
    // Android elevation
    elevation: 24,
    // iOS shadow
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -6 },
    shadowOpacity: 0.18,
    shadowRadius: 20,
  },
  handleRow: {
    alignItems: "center",
    paddingTop: SPACING.md,
    paddingBottom: SPACING.sm,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
  },

  // Header
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.md,
  },
  headerTitle: {
    fontSize: FONTS.sizes.lg,
    fontWeight: "700",
    letterSpacing: -0.3,
  },
  headerSub: {
    fontSize: FONTS.sizes.xs,
    marginTop: 2,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },

  // Scroll content
  scroll: {
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.md,
  },

  // Amount hero
  amountHero: {
    alignItems: "center",
    paddingVertical: SPACING.lg,
  },
  amountFiat: {
    fontSize: 40,
    fontWeight: "800",
    letterSpacing: -1,
  },
  amountToken: {
    fontSize: FONTS.sizes.md,
    marginTop: 4,
    fontWeight: "500",
  },

  // Summary card
  summaryCard: {
    borderRadius: BORDER_RADIUS.xl,
    borderWidth: 1,
    paddingHorizontal: SPACING.md,
    marginBottom: SPACING.md,
  },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 13,
  },
  summaryKey: {
    fontSize: FONTS.sizes.sm,
    fontWeight: "500",
  },
  summaryVal: {
    fontSize: FONTS.sizes.sm,
    fontWeight: "600",
    maxWidth: "55%",
    textAlign: "right",
  },
  mono: {
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
    fontSize: 11,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
  },

  // Asset cell
  assetCell: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  assetLogo: {
    width: 20,
    height: 20,
    borderRadius: 10,
  },
  assetFallback: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  assetFallbackText: {
    fontSize: 8,
    fontWeight: "700",
  },
  assetLabel: {
    fontSize: FONTS.sizes.sm,
    fontWeight: "600",
  },

  // Total cell
  totalCell: {
    alignItems: "flex-end",
  },
  totalToken: {
    fontSize: FONTS.sizes.sm,
    fontWeight: "700",
  },
  totalFeeNote: {
    fontSize: 10,
    marginTop: 2,
  },

  // Safety copy
  safetyCopy: {
    flexDirection: "row",
    gap: SPACING.sm,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.md,
    marginBottom: SPACING.sm,
    borderWidth: 1,
    alignItems: "flex-start",
  },
  safetyText: {
    fontSize: FONTS.sizes.xs,
    lineHeight: 18,
    flex: 1,
  },

  // Actions
  actions: {
    flexDirection: "row",
    gap: SPACING.sm,
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.md,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  editBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 15,
    paddingHorizontal: SPACING.lg,
    borderRadius: BORDER_RADIUS.lg,
    borderWidth: 1,
  },
  editBtnLabel: {
    fontSize: FONTS.sizes.sm,
    fontWeight: "600",
  },
  confirmBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 16,
    borderRadius: BORDER_RADIUS.lg,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 8,
  },
  confirmBtnLabel: {
    fontSize: FONTS.sizes.md,
    fontWeight: "800",
    letterSpacing: 0.2,
  },
});

export default PaymentConfirmationSheet;
