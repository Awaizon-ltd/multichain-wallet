// components/BridgeTransactionModal.js
import React, { useState, useEffect } from "react";
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  Animated,
  Vibration,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../contexts/ThemeContext";
import { useWallet } from "../contexts/WalletContext";
import { useBridge } from "../hooks/useBridge";
import Alert from "../utils/Alert";

/* =========================================================
   PIN PAD
========================================================= */

const PinPad = ({ theme, onComplete, onCancel, error: externalError }) => {
  const styles = createStyles(theme);
  const [pin, setPin] = useState("");
  const [shakeAnimation] = useState(new Animated.Value(0));
  const [isSubmitting, setIsSubmitting] = useState(false);
  const PIN_LENGTH = 6;

  useEffect(() => {
    if (externalError) {
      setPin("");
      setIsSubmitting(false);
      Vibration.vibrate([0, 100, 50, 100]);
      Animated.sequence([
        Animated.timing(shakeAnimation, {
          toValue: 10,
          duration: 50,
          useNativeDriver: true,
        }),
        Animated.timing(shakeAnimation, {
          toValue: -10,
          duration: 50,
          useNativeDriver: true,
        }),
        Animated.timing(shakeAnimation, {
          toValue: 10,
          duration: 50,
          useNativeDriver: true,
        }),
        Animated.timing(shakeAnimation, {
          toValue: -10,
          duration: 50,
          useNativeDriver: true,
        }),
        Animated.timing(shakeAnimation, {
          toValue: 0,
          duration: 50,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [externalError]);

  useEffect(() => {
    if (pin.length === PIN_LENGTH && !isSubmitting) {
      setIsSubmitting(true);
      setTimeout(() => onComplete(pin), 100);
    }
  }, [pin, isSubmitting]);

  const handlePress = (digit) => {
    if (pin.length < PIN_LENGTH && !isSubmitting) {
      setPin((prev) => prev + digit);
      Vibration.vibrate(10);
    }
  };

  const handleBackspace = () => {
    if (pin.length > 0 && !isSubmitting) {
      setPin((prev) => prev.slice(0, -1));
      Vibration.vibrate(10);
    }
  };

  const keys = [
    ["1", "2", "3"],
    ["4", "5", "6"],
    ["7", "8", "9"],
    ["", "0", "backspace"],
  ];

  return (
    <View style={styles.pinPadContainer}>
      <View style={styles.pinPadHeader}>
        <TouchableOpacity
          onPress={onCancel}
          style={styles.pinCancelButton}
          disabled={isSubmitting}
        >
          <Ionicons name="close" size={28} color={theme.COLORS.textSecondary} />
        </TouchableOpacity>
      </View>

      <View style={styles.pinIconContainer}>
        <View style={styles.pinIconCircle}>
          <Ionicons
            name="swap-horizontal"
            size={48}
            color={theme.COLORS.primary}
          />
        </View>
      </View>

      <Text style={styles.pinTitle}>Enter Passcode</Text>
      <Text style={styles.pinSubtitle}>
        Enter your 6-digit passcode to authorize this bridge
      </Text>

      {externalError ? (
        <View style={styles.pinErrorContainer}>
          <Ionicons name="alert-circle" size={20} color={theme.COLORS.error} />
          <Text style={styles.pinErrorText}>{externalError}</Text>
        </View>
      ) : (
        <View style={styles.pinErrorContainer} />
      )}

      <Animated.View
        style={[
          styles.pinCirclesContainer,
          { transform: [{ translateX: shakeAnimation }] },
        ]}
      >
        {[...Array(PIN_LENGTH)].map((_, i) => (
          <View
            key={i}
            style={[styles.pinCircle, pin.length > i && styles.pinCircleFilled]}
          />
        ))}
      </Animated.View>

      <View style={styles.keypad}>
        {keys.map((row, ri) => (
          <View key={ri} style={styles.keypadRow}>
            {row.map((key, ki) => {
              if (key === "")
                return <View key={ki} style={styles.keypadButton} />;
              if (key === "backspace")
                return (
                  <TouchableOpacity
                    key={ki}
                    style={styles.keypadButton}
                    onPress={handleBackspace}
                    disabled={pin.length === 0 || isSubmitting}
                    activeOpacity={0.7}
                  >
                    <Ionicons
                      name="backspace-outline"
                      size={28}
                      color={
                        pin.length === 0 || isSubmitting
                          ? theme.COLORS.textTertiary
                          : theme.COLORS.text
                      }
                    />
                  </TouchableOpacity>
                );
              return (
                <TouchableOpacity
                  key={ki}
                  style={styles.keypadButton}
                  onPress={() => handlePress(key)}
                  disabled={isSubmitting}
                  activeOpacity={0.7}
                >
                  <Text style={styles.keypadButtonText}>{key}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        ))}
      </View>
    </View>
  );
};

/* =========================================================
   MAIN MODAL
========================================================= */

export const BridgeTransactionModal = ({
  visible,
  onClose,
  title = "Confirm Bridge",
  description = null,
  quote,
  chainSymbol = "ETH",
  fromChainName,
  toChainName,
  toSymbol,
  buyAmountFormatted,
  onSuccess,
  onError,
}) => {
  const theme = useTheme();
  const styles = createStyles(theme);

  // WalletContext — createSignerForTransaction decrypts the wallet with the
  // PIN and returns a one-time ethers Signer. The signer is kept in local
  // state only for the duration of this modal session.
  const { createSignerForTransaction } = useWallet();

  const { executeBridge, error, clearError } = useBridge();

  const [step, setStep] = useState("unlock");
  const [passcodeError, setPasscodeError] = useState("");
  const [txReceipt, setTxReceipt] = useState(null);
  const [signer, setSigner] = useState(null); // one-time signer from PIN
  const [status, setStatus] = useState("");

  // Reset state every time the modal opens/closes
  useEffect(() => {
    if (visible) {
      setStep("unlock");
      setPasscodeError("");
      setTxReceipt(null);
      setSigner(null);
      setStatus("");
      clearError();
    } else {
      setSigner(null);
      setPasscodeError("");
      setStep("unlock");
      setStatus("");
    }
  }, [visible]);

  /* ── PIN entry ──────────────────────────────────────────────────────────── */
  const handlePinComplete = async (passcode) => {
    try {
      setPasscodeError("");

      // Decrypt the wallet and get a live ethers Signer
      const walletSigner = await createSignerForTransaction(passcode);
      setSigner(walletSigner);
      setStep("review");
    } catch (err) {
      console.error("[BridgeTransactionModal] PIN failed:", err);
      setPasscodeError("Invalid passcode");
    }
  };

  /* ── Confirm bridge ─────────────────────────────────────────────────────── */
  const handleConfirm = async () => {
    if (!signer) {
      Alert.alert("Error", "Please unlock your wallet first");
      setStep("unlock");
      return;
    }
    if (!quote) {
      Alert.alert("No Route", "This quote is no longer available — go back and try again");
      return;
    }

    setStep("processing");

    try {
      // Pass the decrypted signer directly — it never touches the backend
      const receipt = await executeBridge({
        quote,
        signer,
        onProgress: (msg) => setStatus(msg),
      });

      setTxReceipt(receipt);
      setStep("success");
      setSigner(null); // discard signer immediately after use

      onSuccess?.(receipt);
    } catch (err) {
      console.error("[BridgeTransactionModal] Bridge failed:", err);
      setStep("error");
      setSigner(null);
      onError?.(err);
    }
  };

  /* ── Navigation helpers ─────────────────────────────────────────────────── */
  const handleClose = () => {
    setSigner(null);
    clearError();
    setPasscodeError("");
    setStep("unlock");
    setStatus("");
    onClose();
  };

  const handleRetry = () => {
    setSigner(null);
    setStep("unlock");
    clearError();
    setPasscodeError("");
    setStatus("");
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={false}
      onRequestClose={handleClose}
    >
      <View style={styles.fullScreenContainer}>
        {step === "unlock" && (
          <PinPad
            theme={theme}
            onComplete={handlePinComplete}
            onCancel={handleClose}
            error={passcodeError}
          />
        )}

        {step !== "unlock" && (
          <View style={styles.modalContainer}>
            <View style={styles.header}>
              <Text style={styles.title}>{title}</Text>
              <TouchableOpacity
                onPress={handleClose}
                style={styles.closeButton}
              >
                <Text style={styles.closeButtonText}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView
              style={styles.content}
              showsVerticalScrollIndicator={false}
            >
              {description && step === "review" && (
                <Text style={styles.description}>{description}</Text>
              )}

              {step === "review" && (
                <ReviewStep
                  theme={theme}
                  quote={quote}
                  chainSymbol={chainSymbol}
                  toSymbol={toSymbol}
                  fromChainName={fromChainName}
                  toChainName={toChainName}
                  buyAmountFormatted={buyAmountFormatted}
                  error={error}
                  onConfirm={handleConfirm}
                  onCancel={handleClose}
                  signerReady={!!signer}
                />
              )}
              {step === "processing" && (
                <ProcessingStep theme={theme} status={status} />
              )}
              {step === "success" && (
                <SuccessStep
                  theme={theme}
                  receipt={txReceipt}
                  fromChainName={fromChainName}
                  toChainName={toChainName}
                  onClose={handleClose}
                />
              )}
              {step === "error" && (
                <ErrorStep
                  theme={theme}
                  error={error}
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

/* =========================================================
   REVIEW STEP
========================================================= */

const ReviewStep = ({
  theme,
  quote,
  chainSymbol,
  toSymbol,
  fromChainName,
  toChainName,
  buyAmountFormatted,
  error,
  onConfirm,
  onCancel,
  signerReady,
}) => {
  const styles = createStyles(theme);

  return (
    <View style={styles.stepContainer}>
      <View style={styles.iconContainer}>
        <Text style={styles.icon}>🌉</Text>
      </View>

      <Text style={styles.stepTitle}>Review Bridge</Text>

      {signerReady && (
        <View style={styles.statusBadge}>
          <Text style={styles.statusBadgeText}>✓ Wallet Unlocked</Text>
        </View>
      )}

      <View style={styles.detailsCard}>
        <DetailRow
          theme={theme}
          label="Route"
          value={`${fromChainName} → ${toChainName}`}
        />
        <DetailRow theme={theme} label="Via" value={quote?.toolDetails?.name || quote?.tool || "LI.FI"} />
        {buyAmountFormatted && (
          <DetailRow
            theme={theme}
            label="You receive"
            value={`≈ ${buyAmountFormatted} ${toSymbol || ""}`}
            highlight
          />
        )}
        {quote?.estimatedDurationSeconds != null && (
          <DetailRow
            theme={theme}
            label="Est. time"
            value={`~${Math.ceil(quote.estimatedDurationSeconds / 60)} min`}
          />
        )}
      </View>

      {quote?.gasCostUsd != null ? (
        <View style={styles.gasCard}>
          <Text style={styles.gasCardTitle}>Fees</Text>
          <DetailRow
            theme={theme}
            label="Network fee"
            value={`≈ $${parseFloat(quote.gasCostUsd).toFixed(2)}`}
          />
          {quote.feeCostUsd != null && (
            <DetailRow
              theme={theme}
              label="Bridge fee"
              value={`≈ $${parseFloat(quote.feeCostUsd).toFixed(2)}`}
            />
          )}
        </View>
      ) : error ? (
        <View style={styles.errorCard}>
          <Text style={styles.errorCardTitle}>{error.title}</Text>
          <Text style={styles.errorCardMessage}>{error.message}</Text>
        </View>
      ) : null}

      <View style={styles.buttonRow}>
        <TouchableOpacity style={styles.secondaryButton} onPress={onCancel}>
          <Text style={styles.secondaryButtonText}>Cancel</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.primaryButton,
            (!signerReady || !!error) && styles.disabledButton,
          ]}
          onPress={onConfirm}
          disabled={!signerReady || !!error}
        >
          <Text style={styles.primaryButtonText}>Confirm</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

/* =========================================================
   PROCESSING / SUCCESS / ERROR STEPS
========================================================= */

const ProcessingStep = ({ theme, status }) => {
  const styles = createStyles(theme);
  return (
    <View style={styles.stepContainer}>
      <View style={styles.iconContainer}>
        <ActivityIndicator size="large" color={theme.COLORS.primary} />
      </View>
      <Text style={styles.stepTitle}>Processing Bridge</Text>
      <Text style={styles.stepDescription}>
        {status || "Please wait while your bridge is being processed..."}
      </Text>
      <View style={styles.processingCard}>
        <Text style={styles.processingStep}>✓ Transaction submitted</Text>
        <Text style={styles.processingStep}>
          ⏳ Waiting for confirmation...
        </Text>
      </View>
    </View>
  );
};

const SuccessStep = ({ theme, receipt, fromChainName, toChainName, onClose }) => {
  const styles = createStyles(theme);
  return (
    <View style={styles.stepContainer}>
      <View style={styles.iconContainer}>
        <Text style={styles.icon}>✅</Text>
      </View>
      <Text style={styles.stepTitle}>Bridge Submitted!</Text>
      <Text style={styles.stepDescription}>
        Your assets are on their way from {fromChainName} to {toChainName}. This
        can take anywhere from a few minutes to a few hours depending on the route.
      </Text>
      <View style={styles.successCard}>
        <DetailRow
          theme={theme}
          label="Transaction Hash"
          value={receipt?.hash || receipt?.transactionHash || "N/A"}
          mono
        />
        <DetailRow
          theme={theme}
          label="Block Number"
          value={receipt?.blockNumber?.toString() || "N/A"}
        />
      </View>
      <TouchableOpacity style={styles.primaryButton} onPress={onClose}>
        <Text style={styles.primaryButtonText}>Done</Text>
      </TouchableOpacity>
    </View>
  );
};

const ErrorStep = ({ theme, error, onRetry, onClose }) => {
  const styles = createStyles(theme);
  return (
    <View style={styles.stepContainer}>
      <View style={styles.iconContainer}>
        <Text style={styles.icon}>❌</Text>
      </View>
      <Text style={styles.stepTitle}>Bridge Failed</Text>
      <View style={styles.errorCard}>
        <Text style={styles.errorCardTitle}>{error?.title || "Error"}</Text>
        <Text style={styles.errorCardMessage}>
          {error?.message || "An unexpected error occurred"}
        </Text>
      </View>
      <View style={styles.buttonRow}>
        <TouchableOpacity style={styles.secondaryButton} onPress={onClose}>
          <Text style={styles.secondaryButtonText}>Close</Text>
        </TouchableOpacity>
        {error?.type !== "cancelled" && (
          <TouchableOpacity style={styles.primaryButton} onPress={onRetry}>
            <Text style={styles.primaryButtonText}>Retry</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
};

/* =========================================================
   DETAIL ROW
========================================================= */

const DetailRow = ({
  theme,
  label,
  value,
  highlight = false,
  mono = false,
}) => {
  const styles = createStyles(theme);
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text
        style={[
          styles.detailValue,
          highlight && styles.detailValueHighlight,
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

/* =========================================================
   STYLES
========================================================= */

const createStyles = (theme) =>
  StyleSheet.create({
    fullScreenContainer: { flex: 1, backgroundColor: theme.COLORS.background },

    // PIN Pad
    pinPadContainer: {
      flex: 1,
      backgroundColor: theme.COLORS.background,
      paddingTop: 20,
    },
    pinPadHeader: {
      paddingHorizontal: theme.SPACING.xs,
      alignItems: "flex-start",
    },
    pinCancelButton: { padding: theme.SPACING.sm },
    pinIconContainer: {
      alignItems: "center",
      marginTop: 40,
      marginBottom: theme.SPACING.xl,
    },
    pinIconCircle: {
      width: 50,
      height: 50,
      borderRadius: 25,
      backgroundColor: `${theme.COLORS.primary}20`,
      alignItems: "center",
      justifyContent: "center",
    },
    pinTitle: {
      fontSize: theme.FONTS.sizes.xxl,
      fontWeight: "bold",
      color: theme.COLORS.text,
      textAlign: "center",
      marginBottom: theme.SPACING.xs,
    },
    pinSubtitle: {
      fontSize: theme.FONTS.sizes.md,
      color: theme.COLORS.textSecondary,
      textAlign: "center",
      paddingHorizontal: theme.SPACING.xl,
      marginBottom: theme.SPACING.xs,
      lineHeight: 22,
    },
    pinErrorContainer: {
      height: 5,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: theme.SPACING.xs,
      marginVertical: theme.SPACING.md,
    },
    pinErrorText: {
      fontSize: theme.FONTS.sizes.sm,
      color: theme.COLORS.error,
      fontWeight: "600",
    },
    pinCirclesContainer: {
      flexDirection: "row",
      justifyContent: "center",
      alignItems: "center",
      gap: theme.SPACING.md,
      marginVertical: theme.SPACING.xl,
    },
    pinCircle: {
      width: 16,
      height: 16,
      borderRadius: 8,
      borderWidth: 2,
      borderColor: theme.COLORS.border,
      backgroundColor: "transparent",
    },
    pinCircleFilled: {
      backgroundColor: theme.COLORS.primary,
      borderColor: theme.COLORS.primary,
    },
    keypad: {
      flex: 1,
      justifyContent: "flex-end",
      paddingBottom: 40,
      paddingHorizontal: theme.SPACING.xl,
    },
    keypadRow: {
      flexDirection: "row",
      justifyContent: "center",
      marginBottom: theme.SPACING.md,
    },
    keypadButton: {
      width: 65,
      height: 65,
      borderRadius: 37.5,
      backgroundColor: theme.COLORS.surface,
      justifyContent: "center",
      alignItems: "center",
      marginHorizontal: theme.SPACING.sm,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.1,
      shadowRadius: 4,
      elevation: 2,
    },
    keypadButtonText: {
      fontSize: 28,
      fontWeight: "400",
      color: theme.COLORS.text,
    },

    // Modal
    modalContainer: {
      flex: 1,
      backgroundColor: theme.COLORS.background,
      padding: 10,
    },
    header: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      paddingHorizontal: theme.SPACING.lg,
      paddingVertical: theme.SPACING.xl,
      borderBottomWidth: 1,
      paddingBottom: 0,
      borderBottomColor: theme.COLORS.divider,
    },
    title: {
      fontSize: theme.FONTS.sizes.md,
      fontWeight: "bold",
      color: theme.COLORS.text,
    },
    closeButton: { padding: theme.SPACING.sm },
    closeButtonText: {
      fontSize: theme.FONTS.sizes.xl,
      color: theme.COLORS.textSecondary,
    },
    content: {
      flex: 1,
      paddingHorizontal: theme.SPACING.xs,
      paddingVertical: theme.SPACING.md,
    },
    description: {
      fontSize: theme.FONTS.sizes.md,
      color: theme.COLORS.textSecondary,
      marginBottom: theme.SPACING.xs,
      lineHeight: 22,
    },

    // Steps
    stepContainer: { paddingVertical: theme.SPACING.md },
    iconContainer: { alignItems: "center", marginBottom: theme.SPACING.xs },
    icon: { fontSize: 64 },
    stepTitle: {
      fontSize: theme.FONTS.sizes.xl,
      fontWeight: "bold",
      color: theme.COLORS.text,
      textAlign: "center",
      marginBottom: theme.SPACING.sm,
    },
    stepDescription: {
      fontSize: theme.FONTS.sizes.md,
      color: theme.COLORS.textSecondary,
      textAlign: "center",
      marginBottom: theme.SPACING.xl,
      lineHeight: 22,
    },
    statusBadge: {
      backgroundColor: theme.COLORS.success + "20",
      borderRadius: theme.BORDER_RADIUS.md,
      paddingVertical: theme.SPACING.xs,
      paddingHorizontal: theme.SPACING.md,
      alignSelf: "center",
      marginBottom: theme.SPACING.md,
    },
    statusBadgeText: {
      fontSize: theme.FONTS.sizes.sm,
      fontWeight: "600",
      color: theme.COLORS.success,
    },

    // Cards
    detailsCard: {
      backgroundColor: theme.COLORS.surface,
      borderRadius: theme.BORDER_RADIUS.md,
      padding: theme.SPACING.md,
      marginBottom: theme.SPACING.md,
      borderWidth: 1,
      borderColor: theme.COLORS.divider,
    },
    gasCard: {
      backgroundColor: theme.COLORS.surface,
      borderRadius: theme.BORDER_RADIUS.md,
      padding: theme.SPACING.md,
      marginBottom: theme.SPACING.xs,
      borderWidth: 1,
      borderColor: theme.COLORS.primary,
    },
    gasCardTitle: {
      fontSize: theme.FONTS.sizes.md,
      fontWeight: "bold",
      color: theme.COLORS.primary,
      marginBottom: theme.SPACING.sm,
    },
    gasEstimating: {
      fontSize: theme.FONTS.sizes.sm,
      color: theme.COLORS.textSecondary,
      marginLeft: theme.SPACING.sm,
    },
    errorCard: {
      backgroundColor: theme.COLORS.surface,
      borderRadius: theme.BORDER_RADIUS.md,
      padding: theme.SPACING.md,
      marginBottom: theme.SPACING.xs,
      borderWidth: 1,
      borderColor: theme.COLORS.error,
    },
    errorCardTitle: {
      fontSize: theme.FONTS.sizes.md,
      fontWeight: "bold",
      color: theme.COLORS.error,
      marginBottom: theme.SPACING.sm,
    },
    errorCardMessage: {
      fontSize: theme.FONTS.sizes.sm,
      color: theme.COLORS.textSecondary,
      lineHeight: 20,
    },
    successCard: {
      backgroundColor: theme.COLORS.surface,
      borderRadius: theme.BORDER_RADIUS.md,
      padding: theme.SPACING.md,
      marginBottom: theme.SPACING.xs,
      borderWidth: 1,
      borderColor: theme.COLORS.success,
    },
    processingCard: {
      backgroundColor: theme.COLORS.surface,
      borderRadius: theme.BORDER_RADIUS.md,
      padding: theme.SPACING.xs,
      marginVertical: theme.SPACING.xs,
    },
    processingStep: {
      fontSize: theme.FONTS.sizes.md,
      color: theme.COLORS.textSecondary,
      marginBottom: theme.SPACING.sm,
    },

    // Detail row
    detailRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      paddingVertical: theme.SPACING.sm,
    },
    detailLabel: {
      fontSize: theme.FONTS.sizes.sm,
      color: theme.COLORS.textSecondary,
      flex: 1,
    },
    detailValue: {
      fontSize: theme.FONTS.sizes.sm,
      color: theme.COLORS.text,
      flex: 2,
      textAlign: "right",
    },
    detailValueHighlight: { color: theme.COLORS.primary, fontWeight: "bold" },
    detailValueMono: {
      fontFamily: "monospace",
      fontSize: theme.FONTS.sizes.xs,
    },

    // Buttons
    buttonRow: {
      flexDirection: "row",
      gap: theme.SPACING.md,
      marginTop: theme.SPACING.xs,
      marginBottom: 10,
    },
    primaryButton: {
      flex: 1,
      backgroundColor: theme.COLORS.primary,
      borderRadius: theme.BORDER_RADIUS.md,
      paddingVertical: theme.SPACING.md,
      alignItems: "center",
      ...theme.SHADOWS.small,
    },
    primaryButtonText: {
      fontSize: theme.FONTS.sizes.md,
      fontWeight: "bold",
      color: theme.COLORS.surface,
    },
    secondaryButton: {
      flex: 1,
      backgroundColor: theme.COLORS.surface,
      borderWidth: 1,
      borderColor: theme.COLORS.border,
      borderRadius: theme.BORDER_RADIUS.md,
      paddingVertical: theme.SPACING.md,
      alignItems: "center",
    },
    secondaryButtonText: {
      fontSize: theme.FONTS.sizes.md,
      fontWeight: "bold",
      color: theme.COLORS.text,
    },
    disabledButton: { opacity: 0.5 },
  });

export default BridgeTransactionModal;
