/**
 * screens/payment/PaymentScreen.js
 *
 * ═══════════════════════════════════════════════════════════════════════════
 *  WHAT MAKES THIS PAY ≠ SEND
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  Send screen:   raw address, any token, token-first amounts, any network.
 *  Payment screen: fiat-first, stablecoins only, guided language, two-step
 *                  confirmation ("Review Payment" → "Confirm Payment"), no
 *                  network switcher, fee abstracted by default.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 *  STATE FLOW
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *   "form"
 *     │  user fills recipient, selects token, enters fiat amount
 *     │  fiat → token conversion runs in background (600ms debounce)
 *     │  gas estimate runs once recipient + tokenAmount are ready
 *     │
 *     ↓  "Review Payment" CTA
 *
 *   "confirming"  ← PaymentConfirmationSheet is open
 *     │  non-editable summary, safety copy, no auto-sign
 *     │
 *     ↓  "Confirm Payment"
 *
 *   TransactionModal (from existing app infrastructure)
 *     │  PIN unlock → review → broadcast
 *     │  title: "Confirm Payment"
 *     │  description: payment-vocabulary string
 *     │
 *     ↓  onSuccess / onError
 *
 *   "success" | back to "form"
 *
 * ═══════════════════════════════════════════════════════════════════════════
 *  HOW IT REUSES THE EXISTING TRANSACTION MODEL
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  TransactionModal and useTransactionManager are used 100% unchanged.
 *  PaymentScreen only controls WHAT and WHEN they receive data.
 *  buildTxConfig() in usePaymentIntent produces the same shape that
 *  SendScreen passes to TransactionModal — ERC20 transfer args.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 *  FUTURE PAYMENTINTENT PLUG-IN POINTS
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  All marked with // [INTENT] in this file and in:
 *    - PaymentIntent.js       (schema)
 *    - usePaymentIntent.js    (hook)
 *    - PaymentConfirmationSheet.js  (merchant UI)
 *    - FeeBreakdown.js        (fee label override)
 *
 *  To activate Phase 1 (QR / deep link):
 *    1. Decode QR or URL → createIntentFromQR() / createIntentFromDeepLink()
 *    2. Pass resulting object as `route.params.intent`
 *    3. Nothing else changes.
 */

import React, { useState, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Modal,
  FlatList,
  Image,
  Animated,
  StatusBar,
} from "react-native";
import { Feather, Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";

import { useWallet } from "../../contexts/WalletContext";
import { useChain } from "../../contexts/ChainContext";
import { useTheme } from "../../contexts/ThemeContext";
import { TransactionModal } from "../../components/TransactionModal";
import Alert from "../../utils/Alert";

import { usePaymentIntent } from "../../hooks/usePaymentIntent";
import { FIAT_CURRENCIES } from "../../components/payment/PaymentIntent";
import FeeBreakdown from "../../components/payment/feeBreakdown";
import PaymentConfirmationSheet from "../../components/payment/PaymentConfirmationSheet";
import { formatAddress } from "../../utils/Wallet";
import { SPACING, FONTS, BORDER_RADIUS, SHADOWS } from "../../constants/Theme";

// ─────────────────────────────────────────────────────────────────────────────
// Recipient input modes (same identities system as SendScreen)
// ─────────────────────────────────────────────────────────────────────────────
const RECIPIENT_MODES = [
  { key: "address", label: "Address", icon: "hash" },
  { key: "username", label: "Username", icon: "at-sign" },
  { key: "email", label: "Email", icon: "mail" },
];

// ─────────────────────────────────────────────────────────────────────────────
// PaymentScreen
// ─────────────────────────────────────────────────────────────────────────────
const PaymentScreen = ({ navigation, route }) => {
  const { COLORS, isDark } = useTheme();
  const { address, provider, refreshAllBalances } = useWallet();
  const { activeChain } = useChain();

  const styles = createStyles(COLORS, isDark);

  // ── [INTENT] Phase 1+: read pre-built intent from route params ──────────
  const routeIntent = route?.params?.intent ?? null;

  // ── Payment logic hook ───────────────────────────────────────────────────
  const payment = usePaymentIntent({
    initialIntent: routeIntent,
    address,
    activeChain,
    provider,
  });

  // ── Local UI state ───────────────────────────────────────────────────────
  const [showTokenSheet, setShowTokenSheet] = useState(false);
  const [showConfirmSheet, setShowConfirmSheet] = useState(false);
  const [showTxModal, setShowTxModal] = useState(false);
  const [showCurrencyPicker, setShowCurrencyPicker] = useState(false);

  // ─────────────────────────────────────────────────────────────────────────
  // "Review Payment" — validate → open confirmation sheet
  // ─────────────────────────────────────────────────────────────────────────
  const handleReviewPayment = () => {
    const ok = payment.proceedToConfirmation();
    if (ok) setShowConfirmSheet(true);
  };

  // ─────────────────────────────────────────────────────────────────────────
  // "Confirm Payment" — close sheet, open TransactionModal
  // ─────────────────────────────────────────────────────────────────────────
  const handleConfirmPayment = () => {
    setShowConfirmSheet(false);
    // Small delay so sheet slides down before modal appears
    setTimeout(() => setShowTxModal(true), 260);
  };

  // ─────────────────────────────────────────────────────────────────────────
  // Transaction success / error (forwarded from TransactionModal)
  // ─────────────────────────────────────────────────────────────────────────
  const handleTxSuccess = async (receipt) => {
    setShowTxModal(false);
    payment.onPaymentSuccess(receipt);

    try {
      await refreshAllBalances();
    } catch (_) {}

    Alert.alert(
      "Payment Sent ✓",
      `${payment.intent.tokenAmount} ${payment.intent.asset?.symbol} has been sent successfully.`,
      [{ text: "Done", onPress: () => navigation.goBack() }],
    );
  };

  const handleTxError = (err) => {
    setShowTxModal(false);
    payment.onPaymentError(err);
    if (err?.type !== "cancelled") {
      Alert.alert(
        err?.title ?? "Payment Failed",
        err?.message ?? "Something went wrong. Please try again.",
      );
    }
  };

  // ─────────────────────────────────────────────────────────────────────────
  // Build TransactionModal config from the confirmed intent
  // ─────────────────────────────────────────────────────────────────────────
  const txConfig = payment.buildTxConfig();

  // ─────────────────────────────────────────────────────────────────────────
  // CTA state helpers
  // ─────────────────────────────────────────────────────────────────────────
  const canReview =
    !payment.loadingTokens &&
    !!payment.intent.asset &&
    !!payment.recipientInput.trim() &&
    !!payment.intent.fiatAmount &&
    !payment.rateLoading &&
    !!payment.intent.tokenAmount &&
    !payment.resolving &&
    !(payment.recipientMode !== "address" && !payment.resolvedRecipient);

  const ctaLoading =
    payment.rateLoading || payment.estimatingGas || payment.resolving;

  // ─────────────────────────────────────────────────────────────────────────
  // Render: loading state while tokens load
  // ─────────────────────────────────────────────────────────────────────────
  if (payment.loadingTokens) {
    return (
      <View style={[styles.centered, { backgroundColor: COLORS.background }]}>
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={[styles.loadingText, { color: COLORS.textSecondary }]}>
          Preparing payment…
        </Text>
      </View>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Render: chain has no payment token support (testnet or not in registry)
  // ─────────────────────────────────────────────────────────────────────────
  if (!payment.loadingTokens && !payment.chainSupported) {
    return (
      <View style={[styles.centered, { backgroundColor: COLORS.background }]}>
        <View
          style={[
            styles.emptyIconWrap,
            { backgroundColor: COLORS.cardElevated },
          ]}
        >
          <MaterialCommunityIcons
            name="link-off"
            size={36}
            color={COLORS.textSecondary}
          />
        </View>
        <Text style={[styles.emptyTitle, { color: COLORS.text }]}>
          {activeChain.testnet
            ? "Testnet not supported"
            : "Chain not supported"}
        </Text>
        <Text style={[styles.emptyBody, { color: COLORS.textSecondary }]}>
          {activeChain.testnet
            ? `${activeChain.name} is a test network. Switch to Ethereum or Base to make payments.`
            : `Payments are not available on ${activeChain.name} yet. Supported chains: Ethereum, Base.`}
        </Text>
      </View>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Render: chain is supported but no stablecoins found (shouldn't normally
  // happen since tokens come from the constant, not user imports)
  // ─────────────────────────────────────────────────────────────────────────
  if (!payment.loadingTokens && payment.paymentTokens.length === 0) {
    return (
      <View style={[styles.centered, { backgroundColor: COLORS.background }]}>
        <View
          style={[
            styles.emptyIconWrap,
            { backgroundColor: COLORS.cardElevated },
          ]}
        >
          <MaterialCommunityIcons
            name="cash-remove"
            size={36}
            color={COLORS.textSecondary}
          />
        </View>
        <Text style={[styles.emptyTitle, { color: COLORS.text }]}>
          Tokens unavailable
        </Text>
        <Text style={[styles.emptyBody, { color: COLORS.textSecondary }]}>
          Could not load payment tokens for {activeChain.name}. Check your
          connection and try again.
        </Text>
        <TouchableOpacity
          style={[styles.ghostBtn, { borderColor: COLORS.primary }]}
          onPress={() => payment.loadPaymentTokens?.()}
        >
          <Text style={[styles.ghostBtnLabel, { color: COLORS.primary }]}>
            Retry
          </Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Main form
  // ─────────────────────────────────────────────────────────────────────────
  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: COLORS.background }}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} />

      {/* ── Navigation header ── */}
      <View
        style={[
          styles.navHeader,
          {
            borderBottomColor: COLORS.border,
            backgroundColor: COLORS.background,
          },
        ]}
      >
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={[styles.backBtn, { backgroundColor: COLORS.cardElevated }]}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="chevron-back" size={20} color={COLORS.text} />
        </TouchableOpacity>

        <View style={{ flex: 1, marginLeft: SPACING.sm }}>
          {/* [INTENT] Phase 1+: "Pay {merchantName}" */}
          <Text style={[styles.navTitle, { color: COLORS.text }]}>
            Make a Payment
          </Text>
          <Text style={[styles.navSub, { color: COLORS.textTertiary }]}>
            {/* Network is derived from the selected token — not user-switchable */}
            {payment.intent.asset
              ? `${payment.intent.asset.symbol} · ${activeChain.name}`
              : "Select a payment token to begin"}
          </Text>
        </View>

        {/* [INTENT] Phase 1+: show expiry countdown badge here */}
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* ════════════════════════════════════════════════
            SECTION 1 — PAYMENT RECIPIENT
        ════════════════════════════════════════════════ */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            {/* Deliberate label — not "To", not "Recipient" */}
            <Text style={[styles.sectionLabel, { color: COLORS.textTertiary }]}>
              Payment recipient
            </Text>
          </View>

          {/* [INTENT] Phase 1+: if intent.recipientLocked, render a locked display
              component instead of this input. Example:
              if (payment.intent.recipientLocked) return <LockedRecipient ... /> */}

          {/* ── Mode pills ── */}
          <View
            style={[
              styles.modeToggle,
              {
                backgroundColor: COLORS.surface,
                borderColor: COLORS.border,
              },
            ]}
          >
            {RECIPIENT_MODES.map((mode) => {
              const active = payment.recipientMode === mode.key;
              return (
                <TouchableOpacity
                  key={mode.key}
                  style={[
                    styles.modePill,
                    active && { backgroundColor: COLORS.primary },
                  ]}
                  onPress={() => payment.switchRecipientMode(mode.key)}
                  activeOpacity={0.75}
                >
                  <Feather
                    name={mode.icon}
                    size={11}
                    color={active ? COLORS.background : COLORS.textSecondary}
                  />
                  <Text
                    style={[
                      styles.modePillLabel,
                      {
                        color: active
                          ? COLORS.background
                          : COLORS.textSecondary,
                      },
                    ]}
                  >
                    {mode.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* ── Address / identity input ── */}
          <View
            style={[
              styles.inputBox,
              {
                backgroundColor: COLORS.cardElevated,
                borderColor: payment.fieldErrors.recipient
                  ? COLORS.error
                  : COLORS.border,
              },
            ]}
          >
            <TextInput
              style={[styles.inputText, { color: COLORS.text }]}
              value={payment.recipientInput}
              onChangeText={payment.setRecipientInput}
              placeholder={
                payment.recipientMode === "address"
                  ? "Enter wallet address (0x…)"
                  : payment.recipientMode === "username"
                    ? "Enter @username"
                    : "Enter email address"
              }
              placeholderTextColor={COLORS.textTertiary}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType={
                payment.recipientMode === "email" ? "email-address" : "default"
              }
            />
            {payment.resolving && (
              <ActivityIndicator
                size="small"
                color={COLORS.primary}
                style={{ marginLeft: SPACING.sm }}
              />
            )}
            {payment.recipientMode === "address" && (
              <TouchableOpacity style={{ marginLeft: SPACING.sm }}>
                {/* [INTENT] Phase 1+: QR scan could populate recipient + asset + amount */}
                <Ionicons
                  name="scan-outline"
                  size={18}
                  color={COLORS.primary}
                />
              </TouchableOpacity>
            )}
          </View>

          {/* Error */}
          {(payment.fieldErrors.recipient || payment.resolveError) && (
            <View style={styles.fieldErrorRow}>
              <Feather name="alert-circle" size={12} color={COLORS.error} />
              <Text style={[styles.fieldErrorText, { color: COLORS.error }]}>
                {payment.fieldErrors.recipient ?? payment.resolveError}
              </Text>
            </View>
          )}

          {/* Resolved identity chip */}
          {payment.resolvedRecipient && payment.recipientMode !== "address" && (
            <ResolvedChip
              address={payment.resolvedRecipient}
              onClear={() => payment.setRecipientInput("")}
              COLORS={COLORS}
            />
          )}
        </View>

        {/* ════════════════════════════════════════════════
            SECTION 2 — PAYMENT TOKEN
            Stablecoins only — no network switcher
        ════════════════════════════════════════════════ */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionLabel, { color: COLORS.textTertiary }]}>
              Pay with
            </Text>
            <Text style={[styles.sectionHint, { color: COLORS.textTertiary }]}>
              {payment.paymentTokens.length} payment token
              {payment.paymentTokens.length !== 1 ? "s" : ""} available
            </Text>
          </View>

          {/* [INTENT] Phase 1+: if intent.assetLocked, show a locked display instead */}
          <TouchableOpacity
            style={[
              styles.tokenSelector,
              {
                backgroundColor: COLORS.cardElevated,
                borderColor: payment.fieldErrors.asset
                  ? COLORS.error
                  : COLORS.border,
              },
            ]}
            onPress={() => setShowTokenSheet(true)}
            activeOpacity={0.75}
          >
            {payment.intent.asset ? (
              <View style={styles.tokenSelectorInner}>
                {payment.intent.asset.logo ? (
                  <Image
                    source={{ uri: payment.intent.asset.logo }}
                    style={styles.tokenLogo}
                    resizeMode="contain"
                  />
                ) : (
                  <View
                    style={[
                      styles.tokenLogoFallback,
                      { backgroundColor: COLORS.primary + "20" },
                    ]}
                  >
                    <Text
                      style={[
                        styles.tokenLogoFallbackText,
                        { color: COLORS.primary },
                      ]}
                    >
                      {payment.intent.asset.symbol.slice(0, 2)}
                    </Text>
                  </View>
                )}
                <View style={{ flex: 1 }}>
                  <Text style={[styles.tokenSymbol, { color: COLORS.text }]}>
                    {payment.intent.asset.symbol}
                  </Text>
                  <Text
                    style={[
                      styles.tokenBalance,
                      { color: COLORS.textSecondary },
                    ]}
                  >
                    {parseFloat(payment.intent.asset.balance).toFixed(4)}{" "}
                    available
                  </Text>
                </View>
                {/* Stablecoin badge */}
                <View
                  style={[
                    styles.stableBadge,
                    { backgroundColor: COLORS.success + "15" },
                  ]}
                >
                  <Text
                    style={[styles.stableBadgeText, { color: COLORS.success }]}
                  >
                    Stablecoin
                  </Text>
                </View>
                <Feather
                  name="chevron-down"
                  size={16}
                  color={COLORS.textSecondary}
                />
              </View>
            ) : (
              <View style={styles.tokenSelectorInner}>
                <Text
                  style={[
                    styles.tokenPlaceholder,
                    { color: COLORS.textTertiary },
                  ]}
                >
                  Select payment token
                </Text>
                <Feather
                  name="chevron-down"
                  size={16}
                  color={COLORS.textSecondary}
                />
              </View>
            )}
          </TouchableOpacity>

          {payment.fieldErrors.asset && (
            <View style={styles.fieldErrorRow}>
              <Feather name="alert-circle" size={12} color={COLORS.error} />
              <Text style={[styles.fieldErrorText, { color: COLORS.error }]}>
                {payment.fieldErrors.asset}
              </Text>
            </View>
          )}
        </View>

        {/* ════════════════════════════════════════════════
            SECTION 3 — FIAT-FIRST AMOUNT INPUT
        ════════════════════════════════════════════════ */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionLabel, { color: COLORS.textTertiary }]}>
              Amount
            </Text>
            {/* [INTENT] Phase 1+: if fiatAmountLocked, hide this section entirely */}
          </View>

          {/* ── Fiat input ── */}
          <View
            style={[
              styles.fiatInputWrap,
              {
                backgroundColor: COLORS.cardElevated,
                borderColor: payment.fieldErrors.amount
                  ? COLORS.error
                  : COLORS.border,
              },
            ]}
          >
            {/* Currency symbol button */}
            <TouchableOpacity
              style={[
                styles.currencyBtn,
                { backgroundColor: COLORS.primary + "15" },
              ]}
              onPress={() => setShowCurrencyPicker(true)}
              activeOpacity={0.75}
            >
              <Text style={[styles.currencySymbol, { color: COLORS.primary }]}>
                {FIAT_CURRENCIES[payment.intent.fiatCurrency]?.symbol ?? "₦"}
              </Text>
              <Feather name="chevron-down" size={11} color={COLORS.primary} />
            </TouchableOpacity>

            {/* Fiat amount text input */}
            <TextInput
              style={[styles.fiatInput, { color: COLORS.text }]}
              value={payment.intent.fiatAmount}
              onChangeText={payment.setFiatAmount}
              placeholder="0.00"
              placeholderTextColor={COLORS.textTertiary}
              keyboardType="decimal-pad"
            />

            {/* Rate loading spinner */}
            {payment.rateLoading && (
              <ActivityIndicator
                size="small"
                color={COLORS.primary}
                style={{ marginRight: SPACING.sm }}
              />
            )}
          </View>

          {/* Token amount secondary display */}
          {payment.intent.tokenAmount && !payment.rateLoading ? (
            <View style={styles.tokenAmountRow}>
              <MaterialCommunityIcons
                name="approximately-equal"
                size={13}
                color={COLORS.textTertiary}
              />
              <Text
                style={[
                  styles.tokenAmountDisplay,
                  { color: COLORS.textSecondary },
                ]}
              >
                {payment.intent.tokenAmount} {payment.intent.asset?.symbol}
              </Text>
              {payment.exchangeRate && (
                <Text
                  style={[styles.rateDisplay, { color: COLORS.textTertiary }]}
                >
                  ({payment.exchangeRate})
                </Text>
              )}
            </View>
          ) : payment.rateError ? (
            <View style={styles.fieldErrorRow}>
              <Feather name="alert-circle" size={12} color={COLORS.error} />
              <Text style={[styles.fieldErrorText, { color: COLORS.error }]}>
                {payment.rateError}
              </Text>
            </View>
          ) : null}

          {payment.fieldErrors.amount && (
            <View style={styles.fieldErrorRow}>
              <Feather name="alert-circle" size={12} color={COLORS.error} />
              <Text style={[styles.fieldErrorText, { color: COLORS.error }]}>
                {payment.fieldErrors.amount}
              </Text>
            </View>
          )}
        </View>

        {/* ════════════════════════════════════════════════
            SECTION 4 — FEE (abstracted, expandable)
        ════════════════════════════════════════════════ */}
        <FeeBreakdown
          COLORS={COLORS}
          isDark={isDark}
          gasEstimate={payment.gasEstimate}
          estimatingGas={payment.estimatingGas}
          gasError={payment.gasError}
          expanded={payment.feeExpanded}
          onToggle={() => payment.setFeeExpanded((v) => !v)}
          chainSymbol={activeChain.symbol}
        />

        {/* ════════════════════════════════════════════════
            SECTION 5 — "REVIEW PAYMENT" CTA
        ════════════════════════════════════════════════ */}
        <View style={{ marginTop: SPACING.sm }}>
          <TouchableOpacity
            style={[
              styles.reviewBtn,
              {
                backgroundColor: canReview
                  ? COLORS.primary
                  : COLORS.cardElevated,
                borderColor: canReview ? COLORS.primary : COLORS.border,
                shadowColor: COLORS.primary,
              },
            ]}
            onPress={handleReviewPayment}
            disabled={!canReview || ctaLoading}
            activeOpacity={0.85}
          >
            {ctaLoading ? (
              <ActivityIndicator
                size="small"
                color={canReview ? COLORS.background : COLORS.textTertiary}
              />
            ) : (
              <>
                <Feather
                  name="shield"
                  size={16}
                  color={canReview ? COLORS.background : COLORS.textTertiary}
                />
                <Text
                  style={[
                    styles.reviewBtnLabel,
                    {
                      color: canReview
                        ? COLORS.background
                        : COLORS.textTertiary,
                    },
                  ]}
                >
                  Review Payment
                </Text>
              </>
            )}
          </TouchableOpacity>

          {/* Reassurance copy */}
          <Text
            style={[styles.reassuranceText, { color: COLORS.textTertiary }]}
          >
            You'll review the full details before anything is sent.
          </Text>
        </View>
      </ScrollView>

      {/* ════════════════════════════════════════════════
          TOKEN SELECTION SHEET
          Shows stablecoins only — by construction of paymentTokens list
      ════════════════════════════════════════════════ */}
      <Modal
        visible={showTokenSheet}
        animationType="slide"
        transparent
        onRequestClose={() => setShowTokenSheet(false)}
      >
        <View style={styles.sheetOverlay}>
          <View
            style={[styles.tokenSheet, { backgroundColor: COLORS.background }]}
          >
            <View style={styles.sheetHandleRow}>
              <View
                style={[styles.sheetHandle, { backgroundColor: COLORS.border }]}
              />
            </View>

            <View style={styles.sheetHeaderRow}>
              <Text style={[styles.sheetTitle, { color: COLORS.text }]}>
                Payment token
              </Text>
              <TouchableOpacity onPress={() => setShowTokenSheet(false)}>
                <Feather name="x" size={20} color={COLORS.textSecondary} />
              </TouchableOpacity>
            </View>

            {/* Stablecoin-only notice */}
            <View
              style={[
                styles.stableNotice,
                {
                  backgroundColor: COLORS.primary + "10",
                  borderColor: COLORS.primary + "25",
                },
              ]}
            >
              <Feather name="info" size={13} color={COLORS.primary} />
              <Text
                style={[
                  styles.stableNoticeText,
                  { color: COLORS.textSecondary },
                ]}
              >
                Only stablecoins are shown for payments — stable value, no price
                volatility.
              </Text>
            </View>

            <FlatList
              data={payment.paymentTokens}
              keyExtractor={(t) => t.id}
              contentContainerStyle={{ padding: SPACING.md }}
              ItemSeparatorComponent={() => (
                <View style={{ height: SPACING.sm }} />
              )}
              renderItem={({ item }) => {
                const selected = payment.intent.asset?.id === item.id;
                return (
                  <TouchableOpacity
                    style={[
                      styles.tokenItem,
                      {
                        backgroundColor: selected
                          ? COLORS.primary + "15"
                          : COLORS.cardElevated,
                        borderColor: selected ? COLORS.primary : COLORS.border,
                      },
                    ]}
                    onPress={() => {
                      payment.setAsset(item);
                      setShowTokenSheet(false);
                    }}
                    activeOpacity={0.75}
                  >
                    {item.logo ? (
                      <Image
                        source={{ uri: item.logo }}
                        style={styles.tokenLogo}
                        resizeMode="contain"
                      />
                    ) : (
                      <View
                        style={[
                          styles.tokenLogoFallback,
                          { backgroundColor: COLORS.primary + "20" },
                        ]}
                      >
                        <Text
                          style={[
                            styles.tokenLogoFallbackText,
                            { color: COLORS.primary },
                          ]}
                        >
                          {item.symbol.slice(0, 2)}
                        </Text>
                      </View>
                    )}
                    <View style={{ flex: 1 }}>
                      <Text
                        style={[styles.tokenSymbol, { color: COLORS.text }]}
                      >
                        {item.symbol}
                      </Text>
                      <Text
                        style={[
                          styles.tokenBalance,
                          { color: COLORS.textSecondary },
                        ]}
                      >
                        {parseFloat(item.balance).toFixed(4)} available
                      </Text>
                    </View>
                    {selected && (
                      <Feather
                        name="check-circle"
                        size={18}
                        color={COLORS.primary}
                      />
                    )}
                  </TouchableOpacity>
                );
              }}
            />
          </View>
        </View>
      </Modal>

      {/* ════════════════════════════════════════════════
          CURRENCY PICKER (fiat currency selection)
      ════════════════════════════════════════════════ */}
      <Modal
        visible={showCurrencyPicker}
        animationType="fade"
        transparent
        onRequestClose={() => setShowCurrencyPicker(false)}
      >
        <TouchableOpacity
          style={styles.currencyOverlay}
          activeOpacity={1}
          onPress={() => setShowCurrencyPicker(false)}
        >
          <View
            style={[
              styles.currencyMenu,
              {
                backgroundColor: COLORS.background,
                borderColor: COLORS.border,
                ...SHADOWS.large,
              },
            ]}
          >
            {Object.values(FIAT_CURRENCIES).map((fc) => {
              const active = payment.intent.fiatCurrency === fc.code;
              return (
                <TouchableOpacity
                  key={fc.code}
                  style={[
                    styles.currencyMenuItem,
                    active && {
                      backgroundColor: COLORS.primary + "12",
                    },
                    { borderBottomColor: COLORS.border },
                  ]}
                  onPress={() => {
                    payment.setFiatCurrency(fc.code);
                    setShowCurrencyPicker(false);
                  }}
                >
                  <Text
                    style={[
                      styles.currencyMenuSymbol,
                      { color: active ? COLORS.primary : COLORS.text },
                    ]}
                  >
                    {fc.symbol}
                  </Text>
                  <Text
                    style={[
                      styles.currencyMenuCode,
                      { color: active ? COLORS.primary : COLORS.textSecondary },
                    ]}
                  >
                    {fc.code}
                  </Text>
                  {active && (
                    <Feather
                      name="check"
                      size={14}
                      color={COLORS.primary}
                      style={{ marginLeft: "auto" }}
                    />
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        </TouchableOpacity>
      </Modal>

      {/* ════════════════════════════════════════════════
          STEP 2: PAYMENT CONFIRMATION SHEET
          The UX differentiator — "Pay" not "Send"
      ════════════════════════════════════════════════ */}
      <PaymentConfirmationSheet
        visible={showConfirmSheet}
        onClose={() => {
          setShowConfirmSheet(false);
          payment.backToForm();
        }}
        onConfirm={handleConfirmPayment}
        intent={payment.intent}
        gasEstimate={payment.gasEstimate}
        chainSymbol={activeChain.symbol}
        COLORS={COLORS}
        isDark={isDark}
      />

      {/* ════════════════════════════════════════════════
          STEP 3: TRANSACTION MODAL (existing app infra)
          Reused 100% unchanged — only title/description differ
      ════════════════════════════════════════════════ */}
      {txConfig && (
        <TransactionModal
          visible={showTxModal}
          onClose={() => {
            setShowTxModal(false);
            payment.backToForm();
          }}
          // ── Contract call config (ERC20 transfer) ──────────────────────
          contractAddress={txConfig.contractAddress}
          contractABI={txConfig.contractABI}
          functionName={txConfig.functionName}
          args={txConfig.args}
          value={txConfig.value}
          isNativeTransfer={false}
          // ── Payment-specific copy ───────────────────────────────────────
          // This is ALL that differs from SendScreen's TransactionModal usage
          title="Confirm Payment"
          description={
            `Paying ${payment.intent.tokenAmount} ${payment.intent.asset?.symbol}` +
            ` to ${formatAddress(payment.intent.recipient ?? "", 10)}`
          }
          chainSymbol={activeChain.symbol}
          onSuccess={handleTxSuccess}
          onError={handleTxError}
        />
      )}
    </KeyboardAvoidingView>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// ResolvedChip — shows resolved wallet address after identity lookup
// ─────────────────────────────────────────────────────────────────────────────
const ResolvedChip = ({ address, onClear, COLORS }) => (
  <View
    style={[
      rc.chip,
      {
        backgroundColor: COLORS.success + "14",
        borderColor: COLORS.success + "35",
      },
    ]}
  >
    <View style={[rc.dot, { backgroundColor: COLORS.success }]} />
    <Text style={[rc.label, { color: COLORS.textSecondary }]}>Resolves to</Text>
    <Text
      style={[
        rc.address,
        {
          color: COLORS.text,
          fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
        },
      ]}
    >
      {formatAddress(address, 12)}
    </Text>
    <TouchableOpacity
      onPress={onClear}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
    >
      <Feather name="x" size={13} color={COLORS.textSecondary} />
    </TouchableOpacity>
  </View>
);
const rc = StyleSheet.create({
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 8,
    borderWidth: 1,
    borderRadius: BORDER_RADIUS.md,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  dot: { width: 6, height: 6, borderRadius: 3 },
  label: { fontSize: 11, fontWeight: "600" },
  address: { flex: 1, fontSize: 11, fontWeight: "600" },
});

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────
const createStyles = (COLORS, isDark) =>
  StyleSheet.create({
    centered: {
      flex: 1,
      justifyContent: "center",
      alignItems: "center",
      padding: SPACING.xl,
    },
    loadingText: {
      marginTop: SPACING.md,
      fontSize: FONTS.sizes.sm,
    },
    emptyIconWrap: {
      width: 80,
      height: 80,
      borderRadius: 24,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: SPACING.lg,
    },
    emptyTitle: {
      fontSize: FONTS.sizes.lg,
      fontWeight: "700",
      marginBottom: SPACING.sm,
      textAlign: "center",
    },
    emptyBody: {
      fontSize: FONTS.sizes.sm,
      textAlign: "center",
      lineHeight: 20,
      marginBottom: SPACING.lg,
    },
    ghostBtn: {
      borderWidth: 1.5,
      borderRadius: BORDER_RADIUS.lg,
      paddingHorizontal: SPACING.lg,
      paddingVertical: 12,
    },
    ghostBtnLabel: { fontSize: FONTS.sizes.sm, fontWeight: "700" },

    // Nav header
    navHeader: {
      flexDirection: "row",
      alignItems: "center",
      paddingTop: Platform.OS === "ios" ? 58 : 22,
      paddingHorizontal: SPACING.lg,
      paddingBottom: SPACING.md,
      borderBottomWidth: StyleSheet.hairlineWidth,
      ...SHADOWS.small,
    },
    backBtn: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: "center",
      justifyContent: "center",
    },
    navTitle: {
      fontSize: FONTS.sizes.md,
      fontWeight: "700",
    },
    navSub: {
      fontSize: FONTS.sizes.xs,
      marginTop: 1,
    },

    // Scroll
    scroll: {
      padding: SPACING.lg,
      paddingBottom: 120,
    },

    // Sections
    section: {
      marginBottom: SPACING.lg,
    },
    sectionHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: SPACING.sm,
    },
    sectionLabel: {
      fontSize: 11,
      fontWeight: "700",
      letterSpacing: 0.8,
      textTransform: "uppercase",
    },
    sectionHint: {
      fontSize: 11,
    },

    // Recipient mode toggle
    modeToggle: {
      flexDirection: "row",
      borderRadius: BORDER_RADIUS.md,
      borderWidth: 1,
      padding: 3,
      marginBottom: SPACING.sm,
      gap: 3,
    },
    modePill: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 4,
      paddingVertical: 7,
      borderRadius: BORDER_RADIUS.sm,
    },
    modePillLabel: {
      fontSize: 11,
      fontWeight: "600",
    },

    // Input box (recipient)
    inputBox: {
      flexDirection: "row",
      alignItems: "center",
      borderRadius: BORDER_RADIUS.lg,
      borderWidth: 1.5,
      paddingHorizontal: SPACING.md,
      paddingVertical: SPACING.sm + 2,
    },
    inputText: {
      flex: 1,
      fontSize: FONTS.sizes.sm,
      fontWeight: "400",
    },

    // Token selector
    tokenSelector: {
      borderRadius: BORDER_RADIUS.lg,
      borderWidth: 1.5,
      paddingHorizontal: SPACING.md,
      paddingVertical: SPACING.sm + 2,
    },
    tokenSelectorInner: {
      flexDirection: "row",
      alignItems: "center",
      gap: SPACING.sm,
    },
    tokenLogo: {
      width: 32,
      height: 32,
      borderRadius: 16,
    },
    tokenLogoFallback: {
      width: 32,
      height: 32,
      borderRadius: 16,
      alignItems: "center",
      justifyContent: "center",
    },
    tokenLogoFallbackText: {
      fontSize: 11,
      fontWeight: "700",
    },
    tokenSymbol: {
      fontSize: FONTS.sizes.sm,
      fontWeight: "700",
    },
    tokenBalance: {
      fontSize: 10,
      marginTop: 1,
    },
    tokenPlaceholder: {
      flex: 1,
      fontSize: FONTS.sizes.sm,
    },
    stableBadge: {
      paddingHorizontal: 7,
      paddingVertical: 3,
      borderRadius: BORDER_RADIUS.round,
    },
    stableBadgeText: {
      fontSize: 9,
      fontWeight: "700",
    },

    // Fiat input
    fiatInputWrap: {
      flexDirection: "row",
      alignItems: "center",
      borderRadius: BORDER_RADIUS.lg,
      borderWidth: 1.5,
      overflow: "hidden",
    },
    currencyBtn: {
      flexDirection: "row",
      alignItems: "center",
      gap: 3,
      paddingHorizontal: SPACING.md,
      paddingVertical: 16,
    },
    currencySymbol: {
      fontSize: 20,
      fontWeight: "700",
    },
    fiatInput: {
      flex: 1,
      fontSize: 28,
      fontWeight: "700",
      paddingVertical: SPACING.md,
      letterSpacing: -0.5,
    },
    tokenAmountRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 5,
      marginTop: 6,
      paddingHorizontal: 2,
    },
    tokenAmountDisplay: {
      fontSize: FONTS.sizes.sm,
      fontWeight: "500",
    },
    rateDisplay: {
      fontSize: FONTS.sizes.xs,
    },

    // Field errors
    fieldErrorRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 5,
      marginTop: 6,
    },
    fieldErrorText: {
      fontSize: 11,
      fontWeight: "500",
    },

    // Review CTA
    reviewBtn: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: SPACING.sm,
      paddingVertical: 17,
      borderRadius: BORDER_RADIUS.lg,
      borderWidth: 1,
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.22,
      shadowRadius: 14,
      elevation: 8,
    },
    reviewBtnLabel: {
      fontSize: FONTS.sizes.md,
      fontWeight: "800",
      letterSpacing: 0.2,
    },
    reassuranceText: {
      fontSize: 11,
      textAlign: "center",
      marginTop: SPACING.sm,
    },

    // Token sheet
    sheetOverlay: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.5)",
      justifyContent: "flex-end",
    },
    tokenSheet: {
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      maxHeight: "75%",
    },
    sheetHandleRow: {
      alignItems: "center",
      paddingTop: SPACING.md,
      paddingBottom: SPACING.sm,
    },
    sheetHandle: {
      width: 36,
      height: 4,
      borderRadius: 2,
    },
    sheetHeaderRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      paddingHorizontal: SPACING.lg,
      paddingBottom: SPACING.sm,
    },
    sheetTitle: {
      fontSize: FONTS.sizes.md,
      fontWeight: "700",
    },
    stableNotice: {
      flexDirection: "row",
      gap: SPACING.sm,
      marginHorizontal: SPACING.md,
      marginBottom: SPACING.sm,
      padding: SPACING.sm + 2,
      borderRadius: BORDER_RADIUS.md,
      borderWidth: 1,
      alignItems: "flex-start",
    },
    stableNoticeText: {
      fontSize: FONTS.sizes.xs,
      lineHeight: 17,
      flex: 1,
    },
    tokenItem: {
      flexDirection: "row",
      alignItems: "center",
      gap: SPACING.sm,
      borderRadius: BORDER_RADIUS.lg,
      borderWidth: 1,
      padding: SPACING.md,
    },

    // Currency picker
    currencyOverlay: {
      flex: 1,
      justifyContent: "flex-end",
      paddingHorizontal: SPACING.lg,
      paddingBottom: Platform.OS === "ios" ? 52 : SPACING.xl,
    },
    currencyMenu: {
      borderRadius: BORDER_RADIUS.xl,
      borderWidth: 1,
      overflow: "hidden",
    },
    currencyMenuItem: {
      flexDirection: "row",
      alignItems: "center",
      gap: SPACING.md,
      paddingVertical: 14,
      paddingHorizontal: SPACING.lg,
      borderBottomWidth: StyleSheet.hairlineWidth,
    },
    currencyMenuSymbol: {
      fontSize: 20,
      fontWeight: "700",
      width: 28,
    },
    currencyMenuCode: {
      fontSize: FONTS.sizes.sm,
      fontWeight: "600",
    },
  });

export default PaymentScreen;
