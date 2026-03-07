// components/swap/SwapConfirmModal.js
import React, { useState, useEffect } from "react";
import {
  Modal,
  View,
  Text,
  Image,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Animated,
  Vibration,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Contract, MaxUint256 } from "ethers";
import { useTheme } from "../../contexts/ThemeContext";
import { useWallet } from "../../contexts/WalletContext";
import { API_CONFIG } from "../../config/api";

// ─── App logo ─────────────────────────────────────────────────────────────────
// Update this path to match your actual asset location.
// Common locations: ../../assets/logo.png  |  ../../assets/images/logo.png
const APP_LOGO = require("../../assets/logo.png");

const ERC20_ABI = [
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
];

const API_BASE_URL = API_CONFIG.BASE_URL;

const STEPS = {
  PIN: "pin",
  REVIEW: "review",
  APPROVING: "approving",
  SWAPPING: "swapping",
  SUCCESS: "success",
  ERROR: "error",
};

// ─── 0x v2 transaction field helpers ─────────────────────────────────────────
// v2 nests to/data/value/gas under quote.transaction{} — v1 had them top-level.
const getTxTo = (q) => q?.transaction?.to;
const getTxData = (q) => q?.transaction?.data;
const getTxValue = (q) => q?.transaction?.value ?? "0";
const getTxGas = (q) => q?.transaction?.gas;

const computeRate = (sellAmount, buyAmountEstimate, sellToken, buyToken) => {
  const sell = parseFloat(sellAmount);
  const buy = parseFloat(buyAmountEstimate);
  if (!sell || !buy || isNaN(sell) || isNaN(buy)) return null;
  return `1 ${sellToken?.symbol} = ${(buy / sell).toFixed(6)} ${buyToken?.symbol}`;
};

const formatMinReceived = (quote, buyToken) => {
  if (!quote?.minBuyAmount || !buyToken) return "—";
  try {
    const { formatUnits } = require("ethers");
    const dec = parseInt(buyToken.decimals, 10);
    const val = parseFloat(formatUnits(String(quote.minBuyAmount), dec));
    return `${val.toFixed(Math.min(dec, 6))} ${buyToken.symbol}`;
  } catch {
    return "—";
  }
};

// ─── Human-readable error translation ────────────────────────────────────────
// Converts raw ethers error codes and 0x messages into plain-English copy
// that a non-technical user can actually understand and act on.
const parseSwapError = (err) => {
  const code = err?.code ?? "";
  const message = (err?.reason ?? err?.message ?? "").toLowerCase();

  if (
    code === "ACTION_REJECTED" ||
    message.includes("user rejected") ||
    message.includes("user cancelled") ||
    message.includes("user denied")
  ) {
    return {
      title: "Transaction Cancelled",
      message: "You cancelled the transaction. No funds were moved.",
      icon: "close-circle-outline",
      canRetry: true,
    };
  }

  if (
    code === "INSUFFICIENT_FUNDS" ||
    message.includes("insufficient funds") ||
    message.includes("insufficient balance")
  ) {
    return {
      title: "Not Enough Balance",
      message:
        "Your wallet doesn't have enough funds to cover this swap and the gas fee.",
      icon: "wallet-outline",
      canRetry: false,
    };
  }

  if (
    code === "CALL_EXCEPTION" ||
    message.includes("execution reverted") ||
    message.includes("revert")
  ) {
    return {
      title: "Swap Reverted",
      message:
        "The swap was rejected by the network — the price moved too fast. Try increasing your slippage tolerance in settings.",
      icon: "trending-down-outline",
      canRetry: true,
    };
  }

  if (
    message.includes("gas required exceeds") ||
    message.includes("unpredictable gas") ||
    code === "UNPREDICTABLE_GAS_LIMIT"
  ) {
    return {
      title: "Gas Estimation Failed",
      message:
        "We couldn't estimate the gas cost for this swap. Try a smaller amount or a different token pair.",
      icon: "flame-outline",
      canRetry: true,
    };
  }

  if (
    message.includes("no route") ||
    message.includes("insufficient liquidity") ||
    message.includes("no liquidity")
  ) {
    return {
      title: "No Route Available",
      message:
        "There's no available swap route for this pair right now. Try a different token or a smaller amount.",
      icon: "git-network-outline",
      canRetry: false,
    };
  }

  if (
    code === "NETWORK_ERROR" ||
    code === "TIMEOUT" ||
    message.includes("network") ||
    message.includes("timeout") ||
    message.includes("connection")
  ) {
    return {
      title: "Connection Problem",
      message:
        "Lost connection to the network. Check your internet and try again.",
      icon: "wifi-outline",
      canRetry: true,
    };
  }

  if (message.includes("approve") || message.includes("allowance")) {
    return {
      title: "Approval Failed",
      message: "Couldn't approve the token for swapping. Please try again.",
      icon: "shield-outline",
      canRetry: true,
    };
  }

  // Fallback — surface the raw message but cleaned up
  return {
    title: "Swap Failed",
    message:
      err?.reason ?? err?.message ?? "Something went wrong. Please try again.",
    icon: "alert-circle-outline",
    canRetry: true,
  };
};

// ─── PIN Pad ──────────────────────────────────────────────────────────────────
const PinPad = ({ theme, onComplete, onCancel, error: externalError }) => {
  const styles = createStyles(theme);
  const { COLORS } = theme;

  const [pin, setPin] = useState("");
  const [shakeAnim] = useState(new Animated.Value(0));
  const [isSubmitting, setIsSubmitting] = useState(false);
  const PIN_LENGTH = 6;

  useEffect(() => {
    if (externalError) {
      setPin("");
      setIsSubmitting(false);
      Vibration.vibrate([0, 80, 40, 80]);
      Animated.sequence(
        [8, -8, 8, -8, 0].map((toValue) =>
          Animated.timing(shakeAnim, {
            toValue,
            duration: 50,
            useNativeDriver: true,
          }),
        ),
      ).start();
    }
  }, [externalError]);

  useEffect(() => {
    if (pin.length === PIN_LENGTH && !isSubmitting) {
      setIsSubmitting(true);
      setTimeout(() => onComplete(pin), 100);
    }
  }, [pin]);

  const handlePress = (digit) => {
    if (pin.length < PIN_LENGTH && !isSubmitting) {
      setPin((p) => p + digit);
      Vibration.vibrate(8);
    }
  };
  const handleBack = () => {
    if (pin.length > 0 && !isSubmitting) {
      setPin((p) => p.slice(0, -1));
      Vibration.vibrate(8);
    }
  };

  const keys = [
    ["1", "2", "3"],
    ["4", "5", "6"],
    ["7", "8", "9"],
    ["", "0", "⌫"],
  ];

  return (
    <View style={styles.pinScreen}>
      <TouchableOpacity onPress={onCancel} style={styles.pinCloseBtn}>
        <Ionicons name="close" size={22} color={COLORS.textSecondary} />
      </TouchableOpacity>

      {/* App logo instead of lock icon */}
      <View style={styles.pinLogoWrap}>
        <Image source={APP_LOGO} style={styles.pinLogo} resizeMode="contain" />
      </View>

      <Text style={styles.pinTitle}>Enter Passcode</Text>
      <Text style={styles.pinSubtitle}>
        Confirm your identity to authorise this swap
      </Text>

      {/* Error badge */}
      <View style={styles.pinErrorRow}>
        {externalError ? (
          <View style={styles.pinErrorBadge}>
            <Ionicons name="alert-circle" size={14} color={COLORS.error} />
            <Text style={styles.pinErrorText}>Wrong passcode — try again</Text>
          </View>
        ) : null}
      </View>

      {/* Dot indicators */}
      <Animated.View
        style={[styles.dotsRow, { transform: [{ translateX: shakeAnim }] }]}
      >
        {Array.from({ length: PIN_LENGTH }).map((_, i) => (
          <View
            key={i}
            style={[styles.dot, pin.length > i && styles.dotFilled]}
          />
        ))}
      </Animated.View>

      {/* Keypad */}
      <View style={styles.keypad}>
        {keys.map((row, ri) => (
          <View key={ri} style={styles.keyRow}>
            {row.map((k, ki) => {
              if (!k) return <View key={ki} style={styles.keyBtn} />;
              return (
                <TouchableOpacity
                  key={ki}
                  style={styles.keyBtn}
                  onPress={k === "⌫" ? handleBack : () => handlePress(k)}
                  disabled={isSubmitting}
                  activeOpacity={0.65}
                >
                  {k === "⌫" ? (
                    <Ionicons
                      name="backspace-outline"
                      size={22}
                      color={COLORS.text}
                    />
                  ) : (
                    <Text style={styles.keyText}>{k}</Text>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        ))}
      </View>
    </View>
  );
};

// ─── SwapConfirmModal ─────────────────────────────────────────────────────────
export const SwapConfirmModal = ({
  visible,
  onClose,
  onSuccess,
  onError,
  quote,
  sellToken,
  buyToken,
  sellAmount,
  buyAmountEstimate,
}) => {
  const theme = useTheme();
  const styles = createStyles(theme);
  const { COLORS } = theme;
  const { createSignerForTransaction, address, provider } = useWallet();

  const [step, setStep] = useState(STEPS.PIN);
  const [pinError, setPinError] = useState("");
  const [signer, setSigner] = useState(null);
  const [txInfo, setTxInfo] = useState(null);
  const [errorInfo, setErrorInfo] = useState(null);
  const [progressLabel, setProgressLabel] = useState("");

  useEffect(() => {
    if (visible) {
      setStep(STEPS.PIN);
      setPinError("");
      setSigner(null);
      setTxInfo(null);
      setErrorInfo(null);
      setProgressLabel("");
    }
  }, [visible]);

  const handlePinComplete = async (passcode) => {
    try {
      setPinError("");
      const walletSigner = await createSignerForTransaction(passcode);
      setSigner(walletSigner);
      setStep(STEPS.REVIEW);
    } catch {
      setPinError("wrong_pin"); // value just needs to be truthy to trigger shake
    }
  };

  const handleConfirm = async () => {
    if (!signer || !quote) return;
    try {
      // ── Token approval ───────────────────────────────────────────────────────
      const needsApproval =
        !sellToken.isNative &&
        quote.needsApproval &&
        quote.allowanceTarget &&
        quote.allowanceTarget !== "0x0000000000000000000000000000000000000000";

      if (needsApproval) {
        setStep(STEPS.APPROVING);
        setProgressLabel(`Approving ${sellToken.symbol} for trading…`);

        const tokenContract = new Contract(
          sellToken.address,
          ERC20_ABI,
          provider,
        );
        const allowance = await tokenContract.allowance(
          address,
          quote.allowanceTarget,
        );

        if (BigInt(allowance) < BigInt(quote.sellAmount)) {
          const approveTx = await new Contract(
            sellToken.address,
            ERC20_ABI,
            signer,
          ).approve(quote.allowanceTarget, MaxUint256);
          setProgressLabel("Waiting for approval to confirm on-chain…");
          await approveTx.wait();
          setProgressLabel(`${sellToken.symbol} approved ✓`);
        }
      }

      // ── Execute swap ─────────────────────────────────────────────────────────
      setStep(STEPS.SWAPPING);
      setProgressLabel("Broadcasting your swap…");

      if (__DEV__) {
        console.log("[SwapConfirmModal] tx:", {
          to: getTxTo(quote),
          value: getTxValue(quote),
          gas: getTxGas(quote),
          dataLen: getTxData(quote)?.length,
        });
      }

      const gasLimit = getTxGas(quote)
        ? BigInt(Math.floor(parseInt(getTxGas(quote)) * 1.2))
        : undefined;

      const tx = await signer.sendTransaction({
        to: getTxTo(quote),
        data: getTxData(quote),
        value: BigInt(getTxValue(quote)),
        gasLimit,
      });

      setProgressLabel("Waiting for block confirmation…");
      const receipt = await tx.wait();

      // ── Record swap (non-fatal) ──────────────────────────────────────────────
      try {
        await fetch(`${API_BASE_URL}/swap/record`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            wallet_address: address,
            chain_id: quote.chainId,
            sell_token_symbol: sellToken.symbol,
            sell_token_address: sellToken.address,
            buy_token_symbol: buyToken.symbol,
            buy_token_address: buyToken.address,
            sell_amount_raw: quote.sellAmount,
            buy_amount_raw: quote.buyAmount ?? "0",
            tx_hash: receipt.hash,
            block_number: receipt.blockNumber,
            gas_used: receipt.gasUsed?.toString(),
            price_impact: quote.estimatedPriceImpact ?? null,
            fee_amount_raw: quote.fees?.zeroExFee?.amount ?? null,
          }),
        });
      } catch (recordErr) {
        if (__DEV__)
          console.warn("[SwapConfirmModal] record failed:", recordErr.message);
      }

      setTxInfo({
        hash: receipt.hash,
        blockNumber: receipt.blockNumber,
        gasUsed: receipt.gasUsed?.toString(),
      });
      setStep(STEPS.SUCCESS);
      if (onSuccess) onSuccess(receipt);
    } catch (err) {
      if (__DEV__) console.error("[SwapConfirmModal]", err);
      setErrorInfo(parseSwapError(err));
      setStep(STEPS.ERROR);
      if (onError) onError(err);
    }
  };

  const handleClose = () => {
    setSigner(null);
    onClose();
  };
  const handleRetry = () => {
    setSigner(null);
    setStep(STEPS.PIN);
    setPinError("");
    setErrorInfo(null);
  };

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={false}
      onRequestClose={handleClose}
    >
      <View style={styles.screen}>
        {step === STEPS.PIN && (
          <PinPad
            theme={theme}
            onComplete={handlePinComplete}
            onCancel={handleClose}
            error={pinError}
          />
        )}

        {step !== STEPS.PIN && (
          <View style={styles.modalWrapper}>
            {/* Header — symmetric with back/close on either side */}
            <View style={styles.header}>
              {step === STEPS.REVIEW ? (
                <TouchableOpacity
                  onPress={handleClose}
                  style={styles.headerBtn}
                >
                  <Ionicons
                    name="chevron-back"
                    size={22}
                    color={COLORS.textSecondary}
                  />
                </TouchableOpacity>
              ) : (
                <View style={styles.headerBtn} />
              )}

              <Text style={styles.headerTitle}>
                {step === STEPS.REVIEW
                  ? "Review Swap"
                  : step === STEPS.APPROVING
                    ? "Approving"
                    : step === STEPS.SWAPPING
                      ? "Swapping"
                      : step === STEPS.SUCCESS
                        ? "Swap Complete"
                        : "Swap Failed"}
              </Text>

              {[STEPS.SUCCESS, STEPS.ERROR].includes(step) ? (
                <TouchableOpacity
                  onPress={handleClose}
                  style={styles.headerBtn}
                >
                  <Ionicons
                    name="close"
                    size={22}
                    color={COLORS.textSecondary}
                  />
                </TouchableOpacity>
              ) : (
                <View style={styles.headerBtn} />
              )}
            </View>

            <ScrollView
              contentContainerStyle={styles.body}
              showsVerticalScrollIndicator={false}
            >
              {step === STEPS.REVIEW && (
                <ReviewContent
                  theme={theme}
                  sellToken={sellToken}
                  buyToken={buyToken}
                  sellAmount={sellAmount}
                  buyAmountEstimate={buyAmountEstimate}
                  quote={quote}
                  onConfirm={handleConfirm}
                  onCancel={handleClose}
                />
              )}
              {[STEPS.APPROVING, STEPS.SWAPPING].includes(step) && (
                <ProcessingContent
                  theme={theme}
                  label={progressLabel}
                  isApproving={step === STEPS.APPROVING}
                />
              )}
              {step === STEPS.SUCCESS && (
                <SuccessContent
                  theme={theme}
                  txInfo={txInfo}
                  sellToken={sellToken}
                  buyToken={buyToken}
                  sellAmount={sellAmount}
                  buyAmountEstimate={buyAmountEstimate}
                  onClose={handleClose}
                />
              )}
              {step === STEPS.ERROR && (
                <ErrorContent
                  theme={theme}
                  errorInfo={errorInfo}
                  onRetry={handleRetry}
                  onClose={handleClose}
                />
              )}
            </ScrollView>
          </View>
        )}
      </View>
    </Modal>
  );
};

// ─── ReviewContent ────────────────────────────────────────────────────────────
const ReviewContent = ({
  theme,
  sellToken,
  buyToken,
  sellAmount,
  buyAmountEstimate,
  quote,
  onConfirm,
  onCancel,
}) => {
  const styles = createStyles(theme);
  const { COLORS } = theme;

  const priceImpact = quote?.estimatedPriceImpact
    ? parseFloat(quote.estimatedPriceImpact)
    : null;
  const impactColor =
    priceImpact === null
      ? COLORS.textSecondary
      : priceImpact < 1
        ? COLORS.success
        : priceImpact < 3
          ? COLORS.warning
          : COLORS.error;

  const needsApproval =
    !sellToken?.isNative &&
    quote?.needsApproval &&
    quote?.allowanceTarget &&
    quote.allowanceTarget !== "0x0000000000000000000000000000000000000000";

  const rateLabel = computeRate(
    sellAmount,
    buyAmountEstimate,
    sellToken,
    buyToken,
  );
  const minReceived = formatMinReceived(quote, buyToken);
  const gasLabel = getTxGas(quote)
    ? `~${parseInt(getTxGas(quote)).toLocaleString()} units`
    : "—";

  return (
    <View>
      {/* Token flow — side by side */}
      <View style={styles.flowCard}>
        <View style={styles.flowSide}>
          <Text style={styles.flowLabel}>You Pay</Text>
          <Text
            style={styles.flowAmount}
            numberOfLines={1}
            adjustsFontSizeToFit
          >
            {sellAmount}
          </Text>
          <View style={styles.flowTokenRow}>
            <View style={styles.flowTokenDot}>
              <Text style={styles.flowTokenDotText}>
                {sellToken?.symbol?.charAt(0)}
              </Text>
            </View>
            <Text style={styles.flowTokenSymbol}>{sellToken?.symbol}</Text>
          </View>
        </View>

        <View style={styles.flowArrow}>
          <Ionicons name="arrow-forward" size={18} color={COLORS.primary} />
        </View>

        <View style={[styles.flowSide, styles.flowSideReceive]}>
          <Text style={styles.flowLabel}>You Receive</Text>
          <Text
            style={[styles.flowAmount, { color: COLORS.primary }]}
            numberOfLines={1}
            adjustsFontSizeToFit
          >
            ≈{buyAmountEstimate}
          </Text>
          <View style={styles.flowTokenRow}>
            <View
              style={[
                styles.flowTokenDot,
                { backgroundColor: COLORS.primaryMuted },
              ]}
            >
              <Text style={styles.flowTokenDotText}>
                {buyToken?.symbol?.charAt(0)}
              </Text>
            </View>
            <Text style={styles.flowTokenSymbol}>{buyToken?.symbol}</Text>
          </View>
        </View>
      </View>

      {/* Details */}
      <View style={styles.detailCard}>
        <DetailRow theme={theme} label="Rate" value={rateLabel ?? "—"} />
        <DetailRow theme={theme} label="Min. Received" value={minReceived} />
        {priceImpact !== null && (
          <DetailRow
            theme={theme}
            label="Price Impact"
            value={`${priceImpact.toFixed(2)}%`}
            valueColor={impactColor}
          />
        )}
        <DetailRow theme={theme} label="Gas Estimate" value={gasLabel} last />

        {needsApproval && (
          <View style={styles.approvalBanner}>
            <Ionicons
              name="information-circle-outline"
              size={15}
              color={COLORS.primary}
            />
            <Text style={styles.approvalText}>
              A one-time approval is needed before swapping this token
            </Text>
          </View>
        )}
      </View>

      <View style={styles.btnRow}>
        <TouchableOpacity style={styles.cancelBtn} onPress={onCancel}>
          <Text style={styles.cancelBtnText}>Cancel</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.confirmBtn} onPress={onConfirm}>
          <Text style={styles.confirmBtnText}>
            {needsApproval ? "Approve & Swap" : "Confirm Swap"}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

// ─── ProcessingContent ────────────────────────────────────────────────────────
const ProcessingContent = ({ theme, label, isApproving }) => {
  const styles = createStyles(theme);
  const { COLORS } = theme;
  return (
    <View style={styles.centered}>
      <View style={styles.spinnerWrap}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
      <Text style={styles.processingTitle}>
        {isApproving ? "Approving Token" : "Executing Swap"}
      </Text>
      <Text style={styles.processingLabel}>{label}</Text>
      {isApproving && (
        <View style={styles.stepRow}>
          <StepIndicator theme={theme} label="Approve" state="active" />
          <View style={styles.stepConnector} />
          <StepIndicator theme={theme} label="Swap" state="pending" />
        </View>
      )}
    </View>
  );
};

// ─── SuccessContent ───────────────────────────────────────────────────────────
const SuccessContent = ({
  theme,
  txInfo,
  sellToken,
  buyToken,
  sellAmount,
  buyAmountEstimate,
  onClose,
}) => {
  const styles = createStyles(theme);
  return (
    <View style={styles.centered}>
      <View style={styles.successCircle}>
        <Ionicons name="checkmark" size={44} color="#fff" />
      </View>
      <Text style={styles.resultTitle}>Swap Complete!</Text>
      <Text style={styles.resultSubtitle}>
        {sellAmount} {sellToken?.symbol}
        {"\n"}→ {buyAmountEstimate} {buyToken?.symbol}
      </Text>
      <View style={styles.detailCard}>
        {txInfo?.hash && (
          <DetailRow
            theme={theme}
            label="Tx Hash"
            value={`${txInfo.hash.slice(0, 10)}…${txInfo.hash.slice(-8)}`}
            mono
          />
        )}
        {txInfo?.blockNumber && (
          <DetailRow
            theme={theme}
            label="Block"
            value={`#${txInfo.blockNumber}`}
          />
        )}
        {txInfo?.gasUsed && (
          <DetailRow
            theme={theme}
            label="Gas Used"
            value={parseInt(txInfo.gasUsed).toLocaleString()}
            last
          />
        )}
      </View>
      <TouchableOpacity
        style={[styles.confirmBtn, { width: "100%" }]}
        onPress={onClose}
      >
        <Text style={styles.confirmBtnText}>Done</Text>
      </TouchableOpacity>
    </View>
  );
};

// ─── ErrorContent ─────────────────────────────────────────────────────────────
const ErrorContent = ({ theme, errorInfo, onRetry, onClose }) => {
  const styles = createStyles(theme);
  const { COLORS } = theme;
  return (
    <View style={styles.centered}>
      <View style={styles.errorCircle}>
        <Ionicons
          name={errorInfo?.icon ?? "alert-circle-outline"}
          size={40}
          color="#fff"
        />
      </View>
      <Text style={styles.resultTitle}>
        {errorInfo?.title ?? "Swap Failed"}
      </Text>
      <View style={styles.errorMessageCard}>
        <Text style={styles.errorMessageText}>
          {errorInfo?.message ?? "Something went wrong. Please try again."}
        </Text>
      </View>
      <View style={styles.btnRow}>
        <TouchableOpacity style={styles.cancelBtn} onPress={onClose}>
          <Text style={styles.cancelBtnText}>Close</Text>
        </TouchableOpacity>
        {errorInfo?.canRetry !== false && (
          <TouchableOpacity style={styles.confirmBtn} onPress={onRetry}>
            <Text style={styles.confirmBtnText}>Try Again</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
};

// ─── DetailRow ────────────────────────────────────────────────────────────────
const DetailRow = ({ theme, label, value, valueColor, mono, last }) => {
  const styles = createStyles(theme);
  return (
    <View style={[styles.detailRow, last && styles.detailRowLast]}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text
        style={[
          styles.detailValue,
          valueColor && { color: valueColor },
          mono && styles.detailValueMono,
        ]}
        numberOfLines={1}
        ellipsizeMode="middle"
      >
        {value}
      </Text>
    </View>
  );
};

// ─── StepIndicator ────────────────────────────────────────────────────────────
const StepIndicator = ({ theme, label, state }) => {
  const styles = createStyles(theme);
  const { COLORS } = theme;
  const isActive = state === "active";
  const isDone = state === "done";
  return (
    <View style={styles.stepIndicator}>
      <View
        style={[
          styles.stepDot,
          isActive && styles.stepDotActive,
          isDone && styles.stepDotDone,
        ]}
      >
        {isDone && <Ionicons name="checkmark" size={12} color="#fff" />}
        {isActive && (
          <ActivityIndicator size="small" color={COLORS.background} />
        )}
      </View>
      <Text
        style={[
          styles.stepLabel,
          (isActive || isDone) && { color: COLORS.text },
        ]}
      >
        {label}
      </Text>
    </View>
  );
};

// ─── Styles ───────────────────────────────────────────────────────────────────
const createStyles = (theme) => {
  const { COLORS, SPACING, FONTS, BORDER_RADIUS, SHADOWS } = theme;

  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: COLORS.background },

    // PIN
    pinScreen: { flex: 1, backgroundColor: COLORS.background },
    pinCloseBtn: {
      position: "absolute",
      top: 52,
      right: SPACING.lg,
      zIndex: 10,
      padding: SPACING.sm,
      borderRadius: BORDER_RADIUS.md,
      backgroundColor: COLORS.surface,
      borderWidth: 1,
      borderColor: COLORS.border,
    },
    pinLogoWrap: {
      alignSelf: "center",
      marginTop: 110,
      marginBottom: SPACING.lg,
      width: 80,
      height: 80,
      borderRadius: 22,
      overflow: "hidden",
      backgroundColor: COLORS.surface,
      borderWidth: 1,
      borderColor: COLORS.border,
      alignItems: "center",
      justifyContent: "center",
      ...SHADOWS.small,
    },
    pinLogo: { width: 60, height: 60 },
    pinTitle: {
      fontSize: FONTS.sizes.xxl,
      fontWeight: "800",
      color: COLORS.text,
      textAlign: "center",
      marginBottom: SPACING.xs,
    },
    pinSubtitle: {
      fontSize: FONTS.sizes.sm,
      color: COLORS.textSecondary,
      textAlign: "center",
      paddingHorizontal: SPACING.xl,
      lineHeight: FONTS.sizes.sm * 1.5,
    },
    pinErrorRow: {
      height: 36,
      alignItems: "center",
      justifyContent: "center",
      marginTop: SPACING.sm,
    },
    pinErrorBadge: {
      flexDirection: "row",
      alignItems: "center",
      gap: SPACING.xs,
      backgroundColor: `${COLORS.error}15`,
      paddingHorizontal: SPACING.md,
      paddingVertical: SPACING.xs + 1,
      borderRadius: 99,
      borderWidth: 1,
      borderColor: `${COLORS.error}30`,
    },
    pinErrorText: {
      fontSize: FONTS.sizes.sm,
      color: COLORS.error,
      fontWeight: "600",
    },
    dotsRow: {
      flexDirection: "row",
      justifyContent: "center",
      gap: SPACING.md,
      marginVertical: SPACING.xl,
    },
    dot: {
      width: 14,
      height: 14,
      borderRadius: 7,
      borderWidth: 2,
      borderColor: COLORS.border,
      backgroundColor: "transparent",
    },
    dotFilled: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
    keypad: {
      flex: 1,
      justifyContent: "flex-end",
      paddingBottom: SPACING.xxl,
      paddingHorizontal: SPACING.xl,
    },
    keyRow: {
      flexDirection: "row",
      justifyContent: "center",
      marginBottom: SPACING.md,
    },
    keyBtn: {
      width: 72,
      height: 72,
      borderRadius: 36,
      backgroundColor: COLORS.surface,
      justifyContent: "center",
      alignItems: "center",
      marginHorizontal: SPACING.md,
      borderWidth: 1,
      borderColor: COLORS.border,
      ...SHADOWS.small,
    },
    keyText: { fontSize: 26, fontWeight: "400", color: COLORS.text },

    // Modal
    modalWrapper: { flex: 1 },
    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingTop: 56,
      paddingBottom: SPACING.md,
      paddingHorizontal: SPACING.md,
      borderBottomWidth: 1,
      borderBottomColor: COLORS.divider,
    },
    headerBtn: {
      width: 36,
      height: 36,
      borderRadius: BORDER_RADIUS.md,
      alignItems: "center",
      justifyContent: "center",
    },
    headerTitle: {
      fontSize: FONTS.sizes.lg,
      fontWeight: "700",
      color: COLORS.text,
    },
    body: { padding: SPACING.lg, paddingBottom: SPACING.xxxl },

    // Flow card
    flowCard: {
      flexDirection: "row",
      alignItems: "stretch",
      backgroundColor: COLORS.surface,
      borderRadius: BORDER_RADIUS.xl,
      borderWidth: 1,
      borderColor: COLORS.border,
      marginBottom: SPACING.md,
      overflow: "hidden",
      ...SHADOWS.small,
    },
    flowSide: { flex: 1, padding: SPACING.md, alignItems: "center" },
    flowSideReceive: {
      backgroundColor: COLORS.primaryMuted,
      borderLeftWidth: 1,
      borderLeftColor: COLORS.border,
    },
    flowLabel: {
      fontSize: FONTS.sizes.xs,
      fontWeight: "700",
      color: COLORS.textTertiary,
      textTransform: "uppercase",
      letterSpacing: 0.6,
      marginBottom: SPACING.xs,
    },
    flowAmount: {
      fontSize: FONTS.sizes.xl,
      fontWeight: "800",
      color: COLORS.text,
      marginBottom: SPACING.xs,
    },
    flowTokenRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: SPACING.xs,
    },
    flowTokenDot: {
      width: 20,
      height: 20,
      borderRadius: 10,
      backgroundColor: COLORS.surface,
      borderWidth: 1,
      borderColor: COLORS.border,
      alignItems: "center",
      justifyContent: "center",
    },
    flowTokenDotText: {
      fontSize: 9,
      fontWeight: "800",
      color: COLORS.primaryDark,
    },
    flowTokenSymbol: {
      fontSize: FONTS.sizes.sm,
      fontWeight: "700",
      color: COLORS.textSecondary,
    },
    flowArrow: {
      width: 30,
      alignSelf: "center",
      alignItems: "center",
      justifyContent: "center",
      marginHorizontal: -15,
      zIndex: 1,
    },

    // Detail card
    detailCard: {
      backgroundColor: COLORS.surface,
      borderRadius: BORDER_RADIUS.lg,
      paddingHorizontal: SPACING.md,
      marginBottom: SPACING.md,
      borderWidth: 1,
      borderColor: COLORS.border,
    },
    detailRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      paddingVertical: SPACING.sm + 2,
      borderBottomWidth: 1,
      borderBottomColor: COLORS.divider,
    },
    detailRowLast: { borderBottomWidth: 0 },
    detailLabel: { fontSize: FONTS.sizes.sm, color: COLORS.textSecondary },
    detailValue: {
      fontSize: FONTS.sizes.sm,
      fontWeight: "600",
      color: COLORS.text,
      maxWidth: "60%",
      textAlign: "right",
    },
    detailValueMono: { fontFamily: "monospace", fontSize: FONTS.sizes.xs },
    approvalBanner: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: SPACING.sm,
      paddingVertical: SPACING.sm,
    },
    approvalText: {
      fontSize: FONTS.sizes.sm,
      color: COLORS.primary,
      fontWeight: "600",
      flex: 1,
    },

    // Buttons
    btnRow: { flexDirection: "row", gap: SPACING.md, marginTop: SPACING.xs },
    cancelBtn: {
      flex: 1,
      borderWidth: 1,
      borderColor: COLORS.borderStrong,
      borderRadius: BORDER_RADIUS.lg,
      paddingVertical: SPACING.md,
      alignItems: "center",
      backgroundColor: COLORS.surface,
    },
    cancelBtnText: {
      fontSize: FONTS.sizes.base,
      fontWeight: "700",
      color: COLORS.text,
    },
    confirmBtn: {
      flex: 1,
      backgroundColor: COLORS.primary,
      borderRadius: BORDER_RADIUS.lg,
      paddingVertical: SPACING.md,
      alignItems: "center",
      ...SHADOWS.medium,
    },
    confirmBtnText: {
      fontSize: FONTS.sizes.base,
      fontWeight: "800",
      color: COLORS.background,
    },

    // Processing
    centered: { alignItems: "center", paddingTop: SPACING.lg },
    spinnerWrap: {
      width: 80,
      height: 80,
      borderRadius: 40,
      backgroundColor: COLORS.primaryMuted,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: SPACING.lg,
      borderWidth: 1,
      borderColor: COLORS.border,
    },
    processingTitle: {
      fontSize: FONTS.sizes.xl,
      fontWeight: "700",
      color: COLORS.text,
      marginBottom: SPACING.sm,
    },
    processingLabel: {
      fontSize: FONTS.sizes.md,
      color: COLORS.textSecondary,
      textAlign: "center",
      marginBottom: SPACING.xl,
      paddingHorizontal: SPACING.lg,
      lineHeight: FONTS.sizes.md * 1.5,
    },
    stepRow: { flexDirection: "row", alignItems: "center", gap: SPACING.sm },
    stepConnector: { height: 2, width: 44, backgroundColor: COLORS.border },
    stepIndicator: { alignItems: "center", gap: SPACING.xs },
    stepDot: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: COLORS.surface,
      borderWidth: 2,
      borderColor: COLORS.border,
      alignItems: "center",
      justifyContent: "center",
    },
    stepDotActive: {
      backgroundColor: COLORS.primary,
      borderColor: COLORS.primary,
    },
    stepDotDone: {
      backgroundColor: COLORS.success,
      borderColor: COLORS.success,
    },
    stepLabel: {
      fontSize: FONTS.sizes.xs,
      color: COLORS.textTertiary,
      fontWeight: "600",
    },

    // Success
    successCircle: {
      width: 88,
      height: 88,
      borderRadius: 44,
      backgroundColor: COLORS.success,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: SPACING.lg,
      ...SHADOWS.large,
    },

    // Error
    errorCircle: {
      width: 88,
      height: 88,
      borderRadius: 44,
      backgroundColor: COLORS.error,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: SPACING.lg,
      ...SHADOWS.large,
    },
    errorMessageCard: {
      backgroundColor: `${COLORS.error}0d`,
      borderRadius: BORDER_RADIUS.lg,
      borderWidth: 1,
      borderColor: `${COLORS.error}25`,
      padding: SPACING.md,
      marginBottom: SPACING.lg,
      width: "100%",
    },
    errorMessageText: {
      fontSize: FONTS.sizes.md,
      color: COLORS.text,
      textAlign: "center",
      lineHeight: FONTS.sizes.md * 1.6,
    },

    // Result shared
    resultTitle: {
      fontSize: FONTS.sizes.xxl,
      fontWeight: "800",
      color: COLORS.text,
      marginBottom: SPACING.sm,
      textAlign: "center",
    },
    resultSubtitle: {
      fontSize: FONTS.sizes.md,
      color: COLORS.textSecondary,
      marginBottom: SPACING.lg,
      textAlign: "center",
      lineHeight: FONTS.sizes.md * 1.6,
    },
  });
};

export default SwapConfirmModal;
