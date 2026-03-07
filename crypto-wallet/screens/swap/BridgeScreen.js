// BridgeScreen.js - Enhanced Bridge UI with Balance & Gas Estimation
import React, { useState, useCallback, useMemo, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  ActivityIndicator,
  Alert,
  Image,
} from "react-native";
import { parseEther, formatEther } from "ethers";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../../contexts/ThemeContext";
import { useWallet } from "../../contexts/WalletContext";
import { useChain } from "../../contexts/ChainContext";
import { useBridge } from "../../hooks/useBridge";
import { SPACING, FONTS, SHADOWS, BORDER_RADIUS } from "../../constants/Theme";
import BridgeTransactionModal from "../../components/BridgeTransactionModal";

/* =========================================================
   CONSTANTS
========================================================= */

const ETHEREUM_MAINNET = {
  id: 1,
  name: "Ethereum",
  symbol: "ETH",
  rpcUrl: "https://eth.llamarpc.com",
  logo: "https://cryptologos.cc/logos/ethereum-eth-logo.png?v=024",
};

const MANTLE_MAINNET = {
  id: 5000,
  name: "Mantle",
  symbol: "MNT",
  rpcUrl: "https://rpc.mantle.xyz",
  logo: "https://cryptologos.cc/logos/mantle-mnt-logo.png",
};

const BRIDGE_DIRECTION = {
  L1_TO_L2: "L1_TO_L2",
  L2_TO_L1: "L2_TO_L1",
};

/* =========================================================
   MAIN COMPONENT
========================================================= */

export default function BridgeScreen() {
  const { COLORS } = useTheme();
  const {
    address,
    isAuthenticated,
    balances,
    getBalanceForChain,
    refreshBalance,
  } = useWallet();
  const { activeChain, switchChain } = useChain();
  const {
    estimateGas,
    executeBridge,
    getTokenBalance,
    gasInfo,
    isEstimating,
    error: bridgeError,
    tokenBalance,
    clearError,
  } = useBridge();

  // Bridge state
  const [direction, setDirection] = useState(BRIDGE_DIRECTION.L1_TO_L2);
  const [assetType, setAssetType] = useState("native");
  const [amount, setAmount] = useState("");
  const [l1TokenAddress, setL1TokenAddress] = useState("");
  const [l2TokenAddress, setL2TokenAddress] = useState("");

  // UI state
  const [showTxModal, setShowTxModal] = useState(false);
  const [txReceipt, setTxReceipt] = useState(null);

  // Determine source and destination chains
  const sourceChain =
    direction === BRIDGE_DIRECTION.L1_TO_L2 ? ETHEREUM_MAINNET : MANTLE_MAINNET;
  const destChain =
    direction === BRIDGE_DIRECTION.L1_TO_L2 ? MANTLE_MAINNET : ETHEREUM_MAINNET;

  // Get native asset symbol based on source chain
  const nativeAssetSymbol = useMemo(() => {
    return sourceChain.id === 1 ? "ETH" : "MNT";
  }, [sourceChain]);

  // Get source chain balance
  const sourceBalance = useMemo(() => {
    return getBalanceForChain(sourceChain.id);
  }, [sourceChain.id, balances]);

  // Display balance (native or token)
  const displayBalance = useMemo(() => {
    if (assetType === "native") {
      return sourceBalance.formatted;
    }
    return tokenBalance?.formatted || "0";
  }, [assetType, sourceBalance, tokenBalance]);

  // Check if amount exceeds balance
  const exceedsBalance = useMemo(() => {
    if (!amount || parseFloat(amount) === 0) return false;
    return parseFloat(amount) > parseFloat(displayBalance);
  }, [amount, displayBalance]);

  /* =========================================================
     EFFECTS
  ========================================================= */

  // Load token balance when token addresses change
  useEffect(() => {
    if (
      assetType === "token" &&
      l1TokenAddress &&
      direction === BRIDGE_DIRECTION.L1_TO_L2
    ) {
      getTokenBalance(l1TokenAddress);
    } else if (
      assetType === "token" &&
      l2TokenAddress &&
      direction === BRIDGE_DIRECTION.L2_TO_L1
    ) {
      getTokenBalance(l2TokenAddress);
    }
  }, [assetType, l1TokenAddress, l2TokenAddress, direction]);

  // Auto-estimate gas when inputs change
  useEffect(() => {
    const timer = setTimeout(() => {
      if (
        amount &&
        parseFloat(amount) > 0 &&
        !exceedsBalance &&
        (assetType === "native" || (l1TokenAddress && l2TokenAddress))
      ) {
        estimateGas({
          direction,
          assetType,
          amount,
          l1TokenAddress,
          l2TokenAddress,
        }).catch((err) => {
          console.log(
            "[BridgeScreen] Auto gas estimation failed:",
            err.message,
          );
        });
      }
    }, 800); // Debounce

    return () => clearTimeout(timer);
  }, [
    amount,
    direction,
    assetType,
    l1TokenAddress,
    l2TokenAddress,
    exceedsBalance,
  ]);

  /* =========================================================
     HANDLERS
  ========================================================= */

  const handleBridge = useCallback(async () => {
    if (!amount || parseFloat(amount) <= 0) {
      Alert.alert("Invalid Amount", "Please enter a valid amount");
      return;
    }

    if (exceedsBalance) {
      Alert.alert(
        "Insufficient Balance",
        "Amount exceeds your available balance",
      );
      return;
    }

    if (assetType === "token" && (!l1TokenAddress || !l2TokenAddress)) {
      Alert.alert(
        "Missing Tokens",
        "Please provide both L1 and L2 token addresses",
      );
      return;
    }

    // Check if on correct chain
    if (activeChain.id !== sourceChain.id) {
      Alert.alert(
        "Wrong Network",
        `Please switch to ${sourceChain.name} to bridge from this network`,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: `Switch to ${sourceChain.name}`,
            onPress: () => switchChain(sourceChain.id),
          },
        ],
      );
      return;
    }

    setShowTxModal(true);
  }, [
    amount,
    exceedsBalance,
    assetType,
    l1TokenAddress,
    l2TokenAddress,
    activeChain,
    sourceChain,
    switchChain,
  ]);

  const handleTxSuccess = async (receipt) => {
    setTxReceipt(receipt);

    // Refresh balances
    await refreshBalance(sourceChain.id);

    // Show success message
    const message =
      direction === BRIDGE_DIRECTION.L1_TO_L2
        ? `Bridged ${amount} ${assetType === "native" ? nativeAssetSymbol : "tokens"} to Mantle. Arrival in ~10 minutes.`
        : `Withdrawal initiated. Complete on Ethereum after 7-day challenge period.`;

    setTimeout(() => {
      Alert.alert("Success", message, [{ text: "OK", onPress: resetForm }]);
    }, 500);
  };

  const handleTxError = (error) => {
    console.error("[BridgeScreen] Bridge failed:", error);
  };

  const resetForm = () => {
    setAmount("");
    setL1TokenAddress("");
    setL2TokenAddress("");
    setTxReceipt(null);
    clearError();
  };

  const toggleDirection = () => {
    setDirection(
      direction === BRIDGE_DIRECTION.L1_TO_L2
        ? BRIDGE_DIRECTION.L2_TO_L1
        : BRIDGE_DIRECTION.L1_TO_L2,
    );
    clearError();
  };

  const handleMaxAmount = () => {
    if (assetType === "native") {
      // Reserve some for gas
      const balance = parseFloat(displayBalance);
      const reserveForGas = 0.01; // Reserve 0.01 ETH for gas
      const maxAmount = Math.max(0, balance - reserveForGas);
      setAmount(maxAmount.toFixed(6));
    } else {
      setAmount(displayBalance);
    }
  };

  /* =========================================================
     RENDER
  ========================================================= */

  if (!isAuthenticated) {
    return (
      <View style={[styles.container, { backgroundColor: COLORS.background }]}>
        <View style={styles.centerContent}>
          <Ionicons name="lock-closed" size={64} color={COLORS.textTertiary} />
          <Text
            style={[
              styles.errorText,
              { color: COLORS.textSecondary, marginTop: SPACING.md },
            ]}
          >
            Please unlock your wallet to use the bridge
          </Text>
        </View>
      </View>
    );
  }

  return (
    <>
      <ScrollView
        style={[styles.container, { backgroundColor: COLORS.background }]}
        contentContainerStyle={{ padding: SPACING.md }}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={[styles.title, { color: COLORS.text }]}>Bridge</Text>
          <Text style={[styles.subtitle, { color: COLORS.textSecondary }]}>
            Transfer assets between chains
          </Text>
        </View>

        {/* Chain Selection Card */}
        <View
          style={[
            styles.card,
            {
              backgroundColor: COLORS.card,
              borderRadius: BORDER_RADIUS.lg,
              padding: SPACING.md,
              marginBottom: SPACING.md,
              ...SHADOWS.medium,
            },
          ]}
        >
          {/* From Chain */}
          <View style={styles.chainRow}>
            <Text
              style={[styles.chainRowLabel, { color: COLORS.textTertiary }]}
            >
              From
            </Text>
            <View style={styles.chainContent}>
              <Image
                source={{ uri: sourceChain.logo }}
                style={styles.chainLogo}
              />
              <View style={styles.chainInfo}>
                <Text style={[styles.chainName, { color: COLORS.text }]}>
                  {sourceChain.name}
                </Text>
                <Text
                  style={[styles.chainCaption, { color: COLORS.textTertiary }]}
                >
                  {sourceChain.id === 1 ? "Layer 1" : "Layer 2"}
                </Text>
              </View>
            </View>
          </View>

          {/* Direction Toggle Button */}
          <View style={styles.directionToggleContainer}>
            <TouchableOpacity
              onPress={toggleDirection}
              style={[
                styles.directionToggle,
                {
                  backgroundColor: COLORS.surface,
                  borderRadius: BORDER_RADIUS.md,
                },
              ]}
            >
              <Text style={{ color: COLORS.primary, fontSize: 20 }}>⇅</Text>
            </TouchableOpacity>
          </View>

          {/* To Chain */}
          <View style={styles.chainRow}>
            <Text
              style={[styles.chainRowLabel, { color: COLORS.textTertiary }]}
            >
              To
            </Text>
            <View style={styles.chainContent}>
              <Image
                source={{ uri: destChain.logo }}
                style={styles.chainLogo}
              />
              <View style={styles.chainInfo}>
                <Text style={[styles.chainName, { color: COLORS.text }]}>
                  {destChain.name}
                </Text>
                <Text
                  style={[styles.chainCaption, { color: COLORS.textTertiary }]}
                >
                  {destChain.id === 1 ? "Layer 1" : "Layer 2"}
                </Text>
              </View>
            </View>
          </View>
        </View>

        {/* Asset Type Selection */}
        <View
          style={[
            styles.card,
            {
              backgroundColor: COLORS.card,
              borderRadius: BORDER_RADIUS.lg,
              padding: SPACING.md,
              marginBottom: SPACING.md,
              ...SHADOWS.medium,
            },
          ]}
        >
          <Text style={[styles.sectionLabel, { color: COLORS.textSecondary }]}>
            ASSET TYPE
          </Text>

          <View style={styles.assetTypeContainer}>
            <TouchableOpacity
              onPress={() => {
                setAssetType("native");
                clearError();
              }}
              style={[
                styles.assetButton,
                {
                  backgroundColor:
                    assetType === "native" ? COLORS.primary : COLORS.surface,
                  borderRadius: BORDER_RADIUS.md,
                },
              ]}
            >
              <Text
                style={[
                  styles.assetButtonText,
                  {
                    color:
                      assetType === "native"
                        ? COLORS.background
                        : COLORS.textSecondary,
                  },
                ]}
              >
                {nativeAssetSymbol}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => {
                setAssetType("token");
                clearError();
              }}
              style={[
                styles.assetButton,
                {
                  backgroundColor:
                    assetType === "token" ? COLORS.primary : COLORS.surface,
                  borderRadius: BORDER_RADIUS.md,
                },
              ]}
            >
              <Text
                style={[
                  styles.assetButtonText,
                  {
                    color:
                      assetType === "token"
                        ? COLORS.background
                        : COLORS.textSecondary,
                  },
                ]}
              >
                Tokens
              </Text>
            </TouchableOpacity>
          </View>

          {/* Token Addresses */}
          {assetType === "token" && (
            <View style={{ marginTop: SPACING.md }}>
              <Text
                style={[styles.inputLabel, { color: COLORS.textSecondary }]}
              >
                L1 Token (Ethereum)
              </Text>
              <TextInput
                value={l1TokenAddress}
                onChangeText={setL1TokenAddress}
                placeholder="0x..."
                placeholderTextColor={COLORS.textTertiary}
                style={[
                  styles.input,
                  {
                    backgroundColor: COLORS.surface,
                    borderColor: COLORS.border,
                    color: COLORS.text,
                  },
                ]}
              />

              <Text
                style={[
                  styles.inputLabel,
                  { color: COLORS.textSecondary, marginTop: SPACING.sm },
                ]}
              >
                L2 Token (Mantle)
              </Text>
              <TextInput
                value={l2TokenAddress}
                onChangeText={setL2TokenAddress}
                placeholder="0x..."
                placeholderTextColor={COLORS.textTertiary}
                style={[
                  styles.input,
                  {
                    backgroundColor: COLORS.surface,
                    borderColor: COLORS.border,
                    color: COLORS.text,
                  },
                ]}
              />
            </View>
          )}
        </View>

        {/* Amount Input with Balance */}
        <View
          style={[
            styles.card,
            {
              backgroundColor: COLORS.card,
              borderRadius: BORDER_RADIUS.lg,
              padding: SPACING.md,
              marginBottom: SPACING.md,
              ...SHADOWS.medium,
            },
          ]}
        >
          <View style={styles.amountHeader}>
            <Text
              style={[styles.sectionLabel, { color: COLORS.textSecondary }]}
            >
              AMOUNT
            </Text>
            <View style={styles.balanceRow}>
              <Text
                style={[styles.balanceLabel, { color: COLORS.textTertiary }]}
              >
                Balance:
              </Text>
              <Text style={[styles.balanceValue, { color: COLORS.text }]}>
                {parseFloat(displayBalance).toFixed(6)}{" "}
                {assetType === "native" ? nativeAssetSymbol : ""}
              </Text>
              <TouchableOpacity
                onPress={handleMaxAmount}
                style={styles.maxButton}
              >
                <Text style={[styles.maxButtonText, { color: COLORS.primary }]}>
                  MAX
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          <TextInput
            value={amount}
            onChangeText={setAmount}
            placeholder="0.0"
            placeholderTextColor={COLORS.textTertiary}
            keyboardType="decimal-pad"
            style={[
              styles.amountInput,
              {
                backgroundColor: COLORS.surface,
                borderColor: exceedsBalance ? COLORS.error : COLORS.border,
                color: COLORS.text,
              },
            ]}
          />
          {exceedsBalance && (
            <Text style={[styles.errorHint, { color: COLORS.error }]}>
              Insufficient balance
            </Text>
          )}
        </View>

        {/* Gas Estimate Card */}
        {(isEstimating || gasInfo || bridgeError) && (
          <View
            style={[
              styles.card,
              {
                backgroundColor: COLORS.card,
                borderRadius: BORDER_RADIUS.lg,
                padding: SPACING.md,
                marginBottom: SPACING.md,
                borderWidth: 1,
                borderColor: bridgeError ? COLORS.error : COLORS.border,
                ...SHADOWS.medium,
              },
            ]}
          >
            {isEstimating ? (
              <View style={styles.estimatingContainer}>
                <ActivityIndicator size="small" color={COLORS.primary} />
                <Text
                  style={[
                    styles.estimatingText,
                    { color: COLORS.textSecondary },
                  ]}
                >
                  Estimating gas...
                </Text>
              </View>
            ) : bridgeError ? (
              <View>
                <View style={styles.errorHeader}>
                  <Ionicons
                    name="alert-circle"
                    size={20}
                    color={COLORS.error}
                  />
                  <Text style={[styles.errorTitle, { color: COLORS.error }]}>
                    {bridgeError.title}
                  </Text>
                </View>
                <Text
                  style={[styles.errorMessage, { color: COLORS.textSecondary }]}
                >
                  {bridgeError.message}
                </Text>
              </View>
            ) : gasInfo ? (
              <View>
                <Text
                  style={[styles.gasTitle, { color: COLORS.textSecondary }]}
                >
                  Estimated Gas
                </Text>
                <View style={styles.gasRow}>
                  <Text
                    style={[styles.gasLabel, { color: COLORS.textTertiary }]}
                  >
                    Gas Limit
                  </Text>
                  <Text style={[styles.gasValue, { color: COLORS.text }]}>
                    {gasInfo.gasLimit}
                  </Text>
                </View>
                <View style={styles.gasRow}>
                  <Text
                    style={[styles.gasLabel, { color: COLORS.textTertiary }]}
                  >
                    Gas Price
                  </Text>
                  <Text style={[styles.gasValue, { color: COLORS.text }]}>
                    {parseFloat(gasInfo.gasPrice).toFixed(2)} Gwei
                  </Text>
                </View>
                <View style={[styles.gasRow, { marginTop: SPACING.xs }]}>
                  <Text
                    style={[
                      styles.gasLabel,
                      { color: COLORS.text, fontWeight: "600" },
                    ]}
                  >
                    Total Cost
                  </Text>
                  <Text
                    style={[
                      styles.gasValueHighlight,
                      { color: COLORS.primary },
                    ]}
                  >
                    ~{gasInfo.estimatedCostEth.toFixed(6)} {sourceChain.symbol}
                  </Text>
                </View>
              </View>
            ) : null}
          </View>
        )}

        {/* Bridge Info */}
        <View
          style={[
            styles.infoCard,
            {
              backgroundColor: COLORS.surface,
              borderRadius: BORDER_RADIUS.md,
              padding: SPACING.sm,
              marginBottom: SPACING.md,
            },
          ]}
        >
          <Text style={[styles.infoText, { color: COLORS.textSecondary }]}>
            {direction === BRIDGE_DIRECTION.L1_TO_L2
              ? "⏱️ Arrival time: ~10 minutes"
              : "⚠️ Withdrawal requires 7-day challenge period"}
          </Text>
        </View>

        {/* Bridge Button */}
        <TouchableOpacity
          onPress={handleBridge}
          disabled={
            !amount ||
            parseFloat(amount) <= 0 ||
            exceedsBalance ||
            !!bridgeError
          }
          style={[
            styles.bridgeButton,
            {
              backgroundColor:
                !amount ||
                parseFloat(amount) <= 0 ||
                exceedsBalance ||
                bridgeError
                  ? COLORS.disabled
                  : COLORS.primary,
              borderRadius: BORDER_RADIUS.lg,
              ...SHADOWS.medium,
            },
          ]}
        >
          <Text style={[styles.buttonText, { color: COLORS.background }]}>
            Bridge {assetType === "native" ? nativeAssetSymbol : "Tokens"}
          </Text>
        </TouchableOpacity>

        {/* Transaction Receipt */}
        {txReceipt && (
          <View
            style={[
              styles.txContainer,
              {
                backgroundColor: COLORS.surface,
                borderRadius: BORDER_RADIUS.md,
                padding: SPACING.sm,
                marginTop: SPACING.md,
              },
            ]}
          >
            <Text style={[styles.txLabel, { color: COLORS.textTertiary }]}>
              TX HASH
            </Text>
            <Text style={[styles.txHash, { color: COLORS.primary }]}>
              {txReceipt.hash.slice(0, 10)}...{txReceipt.hash.slice(-8)}
            </Text>
          </View>
        )}
      </ScrollView>

      {/* Transaction Modal */}
      <BridgeTransactionModal
        visible={showTxModal}
        onClose={() => setShowTxModal(false)}
        title="Confirm Bridge"
        description={`Bridge ${amount} ${assetType === "native" ? nativeAssetSymbol : "tokens"} from ${sourceChain.name} to ${destChain.name}`}
        isBridgeTransaction={true}
        bridgeParams={{
          direction,
          assetType,
          amount,
          l1TokenAddress,
          l2TokenAddress,
          gasLimit: gasInfo?.gasLimit,
        }}
        chainSymbol={sourceChain.symbol}
        onSuccess={handleTxSuccess}
        onError={handleTxError}
      />
    </>
  );
}

/* =========================================================
   STYLES
========================================================= */

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centerContent: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: SPACING.xl,
  },
  header: {
    alignItems: "center",
    marginBottom: SPACING.lg,
  },
  title: {
    fontSize: FONTS.sizes.xl,
    fontWeight: "700",
  },
  subtitle: {
    fontSize: FONTS.sizes.sm,
    marginTop: 4,
  },
  card: {},
  chainRow: {
    paddingVertical: SPACING.sm,
  },
  chainRowLabel: {
    fontSize: FONTS.sizes.xs,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: SPACING.xs,
  },
  chainContent: {
    flexDirection: "row",
    alignItems: "center",
  },
  chainLogo: {
    width: 40,
    height: 40,
    borderRadius: 20,
    marginRight: SPACING.sm,
  },
  chainInfo: {
    flex: 1,
  },
  chainName: {
    fontSize: FONTS.sizes.lg,
    fontWeight: "600",
  },
  chainCaption: {
    fontSize: FONTS.sizes.xs,
    marginTop: 2,
  },
  directionToggleContainer: {
    alignItems: "center",
    marginVertical: SPACING.xs,
  },
  directionToggle: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  sectionLabel: {
    fontSize: FONTS.sizes.xs,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: SPACING.sm,
  },
  assetTypeContainer: {
    flexDirection: "row",
    gap: SPACING.sm,
  },
  assetButton: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 40,
    paddingVertical: SPACING.sm,
  },
  assetButtonText: {
    fontSize: FONTS.sizes.md,
    fontWeight: "600",
  },
  inputLabel: {
    fontSize: FONTS.sizes.xs,
    fontWeight: "500",
    textTransform: "uppercase",
    letterSpacing: 0.3,
    marginBottom: SPACING.xs,
  },
  input: {
    borderWidth: 1,
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.sm,
    fontSize: FONTS.sizes.sm,
    marginBottom: SPACING.sm,
  },
  amountHeader: {
    marginBottom: SPACING.sm,
  },
  balanceRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: SPACING.xs,
    gap: SPACING.xs,
  },
  balanceLabel: {
    fontSize: FONTS.sizes.xs,
  },
  balanceValue: {
    fontSize: FONTS.sizes.xs,
    fontWeight: "600",
  },
  maxButton: {
    paddingHorizontal: SPACING.xs,
    paddingVertical: 2,
  },
  maxButtonText: {
    fontSize: FONTS.sizes.xs,
    fontWeight: "700",
  },
  amountInput: {
    borderWidth: 1,
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md,
    fontSize: FONTS.sizes.xxl,
    fontWeight: "600",
    textAlign: "center",
  },
  errorHint: {
    fontSize: FONTS.sizes.xs,
    marginTop: SPACING.xs,
    textAlign: "center",
  },
  estimatingContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.sm,
  },
  estimatingText: {
    fontSize: FONTS.sizes.sm,
  },
  errorHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.xs,
    marginBottom: SPACING.xs,
  },
  errorTitle: {
    fontSize: FONTS.sizes.md,
    fontWeight: "600",
  },
  errorMessage: {
    fontSize: FONTS.sizes.sm,
    lineHeight: 18,
  },
  gasTitle: {
    fontSize: FONTS.sizes.xs,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: SPACING.sm,
  },
  gasRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 4,
  },
  gasLabel: {
    fontSize: FONTS.sizes.sm,
  },
  gasValue: {
    fontSize: FONTS.sizes.sm,
    fontWeight: "500",
  },
  gasValueHighlight: {
    fontSize: FONTS.sizes.md,
    fontWeight: "700",
  },
  infoCard: {},
  infoText: {
    fontSize: FONTS.sizes.xs,
    textAlign: "center",
    lineHeight: 18,
  },
  bridgeButton: {
    alignItems: "center",
    justifyContent: "center",
    minHeight: 48,
    padding: SPACING.md,
  },
  buttonText: {
    fontSize: FONTS.sizes.md,
    fontWeight: "600",
    textAlign: "center",
  },
  txContainer: {},
  txLabel: {
    fontSize: FONTS.sizes.xs,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: SPACING.xs,
  },
  txHash: {
    fontSize: FONTS.sizes.xs,
    fontWeight: "500",
    fontFamily: "monospace",
  },
  errorText: {
    textAlign: "center",
    fontSize: FONTS.sizes.md,
  },
});
