// components/EnhancedSwapModal.js
import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import { ethers } from "ethers";
import { useWallet } from "../contexts/WalletContext";
import { useChain } from "../contexts/ChainContext";
import { useTheme } from "../contexts/ThemeContext";
import { useSeamlessSwap } from "../hooks/useSeamlessApproval";
import {
  UNISWAP_V2_ROUTER_ABI,
  getDeadline,
  isNativeToken,
} from "../config/swapConfig";
import PasscodeModal from "./modal/PasscodeModal";
import coinGeckoService from "../services/coingec";

export const EnhancedSwapModal = ({
  visible,
  onClose,
  fromToken,
  toToken,
  fromAmount,
  quote,
  onSuccess,
  onError,
}) => {
  const theme = useTheme();
  const { COLORS, SPACING, FONTS, BORDER_RADIUS } = theme;
  const { address, createSignerForTransaction, encryptionProgress } =
    useWallet();
  const { activeChain } = useChain();

  const { checkApproval, approveToken } = useSeamlessSwap();

  const [step, setStep] = useState("idle"); // idle, checking, approval, swapping, success, error
  const [showPasscode, setShowPasscode] = useState(false);
  const [currentSigner, setCurrentSigner] = useState(null);
  const [txHash, setTxHash] = useState(null);
  const [errorMsg, setErrorMsg] = useState(null);

  // USD prices state
  const [fromTokenPrice, setFromTokenPrice] = useState(null);
  const [toTokenPrice, setToTokenPrice] = useState(null);
  const [loadingPrices, setLoadingPrices] = useState(false);

  useEffect(() => {
    if (visible) {
      setStep("idle");
      setTxHash(null);
      setErrorMsg(null);
      fetchTokenPrices();
    }
  }, [visible]);

  // Fetch USD prices from CoinGecko
  const fetchTokenPrices = async () => {
    try {
      setLoadingPrices(true);

      const platform = coinGeckoService.getPlatformId(activeChain.id);
      const addresses = [];

      // Only fetch prices for ERC20 tokens (not native)
      if (!isNativeToken(fromToken.address)) {
        addresses.push(fromToken.address);
      }
      if (!isNativeToken(toToken.address)) {
        addresses.push(toToken.address);
      }

      // Fetch prices
      const prices = await coinGeckoService.getMultipleTokenPrices(
        addresses,
        platform,
      );

      // Set prices
      if (!isNativeToken(fromToken.address)) {
        const fromPrice = prices[fromToken.address.toLowerCase()];
        setFromTokenPrice(fromPrice);
      } else {
        // For native tokens, use the native token price
        // You might want to hardcode or fetch separately
        // For now, we'll fetch it by symbol
        const nativePrice = await fetchNativeTokenPrice(activeChain.symbol);
        setFromTokenPrice(nativePrice);
      }

      if (!isNativeToken(toToken.address)) {
        const toPrice = prices[toToken.address.toLowerCase()];
        setToTokenPrice(toPrice);
      } else {
        const nativePrice = await fetchNativeTokenPrice(activeChain.symbol);
        setToTokenPrice(nativePrice);
      }
    } catch (err) {
      console.error("[EnhancedSwapModal] Error fetching prices:", err);
      // Don't block the swap if price fetch fails
    } finally {
      setLoadingPrices(false);
    }
  };

  // Fetch native token price (ETH, BNB, etc.)
  const fetchNativeTokenPrice = async (symbol) => {
    try {
      // Map of native token symbols to CoinGecko IDs
      const nativeTokenIds = {
        ETH: "ethereum",
        BNB: "binancecoin",
        POL: "polygon-ecosystem-token",
        MATIC: "polygon-ecosystem-token",
        AVAX: "avalanche-2",
        FTM: "fantom",
        MNT: "mantle",
        // Add more as needed
      };

      const coinId = nativeTokenIds[symbol];
      if (!coinId) return null;

      const response = await fetch(
        `https://api.coingecko.com/api/v3/simple/price?ids=${coinId}&vs_currencies=usd&include_24hr_change=true`,
      );
      const data = await response.json();

      if (data[coinId]) {
        return {
          usd: data[coinId].usd,
          usd_24h_change: data[coinId].usd_24h_change,
        };
      }

      return null;
    } catch (err) {
      console.error("[fetchNativeTokenPrice] Error:", err);
      return null;
    }
  };

  // Calculate USD values
  const fromTokenUSD = fromTokenPrice?.usd
    ? (parseFloat(fromAmount) * fromTokenPrice.usd).toFixed(2)
    : null;

  const toTokenUSD = toTokenPrice?.usd
    ? (parseFloat(quote.amountOut) * toTokenPrice.usd).toFixed(2)
    : null;

  // Handle passcode submission
  const handlePasscodeSubmit = async (passcode) => {
    try {
      setShowPasscode(false);
      setStep("checking");

      // Create signer
      const signer = await createSignerForTransaction(passcode);
      setCurrentSigner(signer);

      // Check if approval needed (only for ERC20)
      if (!isNativeToken(fromToken.address)) {
        const needsApprove = await checkApproval(
          fromToken,
          fromAmount,
          quote.router,
          signer,
        );

        if (needsApprove) {
          await handleApproval(signer);
        } else {
          await handleSwap(signer);
        }
      } else {
        await handleSwap(signer);
      }
    } catch (err) {
      console.error("[EnhancedSwapModal] Error:", err);
      setStep("error");
      setErrorMsg(err.message || "Transaction failed");
    }
  };

  // Handle approval
  const handleApproval = async (signer) => {
    try {
      setStep("approval");
      await approveToken(fromToken, quote.router, signer);
      console.log("[Approval] ✅ Approved, now swapping...");
      await handleSwap(signer);
    } catch (err) {
      console.error("[Approval] ❌ Error:", err);
      setStep("error");
      setErrorMsg(err.message || "Approval failed");
      throw err;
    }
  };

  // Handle swap execution
  const handleSwap = async (signer) => {
    try {
      setStep("swapping");

      const router = new ethers.Contract(
        quote.router,
        UNISWAP_V2_ROUTER_ABI,
        signer,
      );

      const amountInWei = ethers.parseUnits(
        fromAmount.toString(),
        fromToken.decimals,
      );

      const amountOutWei = ethers.getBigInt(quote.amountOutWei);
      const minAmountOut = (amountOutWei * BigInt(9950)) / BigInt(10000); // 0.5% slippage

      const deadline = getDeadline();

      let tx;
      const isFromNative = isNativeToken(fromToken.address);
      const isToNative = isNativeToken(toToken.address);

      console.log("[Swap] Executing:", {
        from: fromToken.symbol,
        to: toToken.symbol,
        amount: fromAmount,
        minOut: ethers.formatUnits(minAmountOut, toToken.decimals),
      });

      // ETH → Token (auto-wraps through WETH)
      if (isFromNative && !isToNative) {
        tx = await router.swapExactETHForTokens(
          minAmountOut,
          quote.path,
          address,
          deadline,
          { value: amountInWei },
        );
      }
      // Token → ETH (auto-unwraps from WETH)
      else if (!isFromNative && isToNative) {
        tx = await router.swapExactTokensForETH(
          amountInWei,
          minAmountOut,
          quote.path,
          address,
          deadline,
        );
      }
      // Token → Token (routes through WETH if needed)
      else {
        tx = await router.swapExactTokensForTokens(
          amountInWei,
          minAmountOut,
          quote.path,
          address,
          deadline,
        );
      }

      console.log("[Swap] Transaction sent:", tx.hash);
      setTxHash(tx.hash);

      const receipt = await tx.wait();
      console.log("[Swap] ✅ Confirmed:", receipt.hash);

      setStep("success");
      setTimeout(() => {
        onSuccess(receipt);
        onClose();
      }, 2000);
    } catch (err) {
      console.error("[Swap] ❌ Error:", err);

      let errorMessage = "Swap failed";

      if (err.code === "ACTION_REJECTED") {
        errorMessage = "Transaction rejected";
      } else if (err.message?.includes("insufficient funds")) {
        errorMessage = "Insufficient funds";
      } else if (err.message?.includes("INSUFFICIENT_OUTPUT_AMOUNT")) {
        errorMessage = "Slippage too high";
      } else if (err.reason) {
        errorMessage = err.reason;
      }

      setStep("error");
      setErrorMsg(errorMessage);
      throw err;
    }
  };

  const renderContent = () => {
    switch (step) {
      case "idle":
        return (
          <View style={styles(theme).content}>
            <Text style={styles(theme).title}>Confirm Swap</Text>

            {/* From Token */}
            <View style={styles(theme).swapDetails}>
              <Text style={styles(theme).detailLabel}>You Pay</Text>
              <View style={styles(theme).amountRow}>
                <Text style={styles(theme).detailValue}>
                  {parseFloat(fromAmount).toFixed(4)} {fromToken.symbol}
                </Text>
                {loadingPrices ? (
                  <ActivityIndicator size="small" color={COLORS.textTertiary} />
                ) : fromTokenUSD ? (
                  <Text style={styles(theme).usdValue}>≈ ${fromTokenUSD}</Text>
                ) : null}
              </View>
            </View>

            {/* Arrow */}
            <View style={styles(theme).arrow}>
              <Text style={styles(theme).arrowText}>↓</Text>
            </View>

            {/* To Token */}
            <View style={styles(theme).swapDetails}>
              <Text style={styles(theme).detailLabel}>You Receive</Text>
              <View style={styles(theme).amountRow}>
                <Text style={styles(theme).detailValue}>
                  {quote.amountOut} {toToken.symbol}
                </Text>
                {loadingPrices ? (
                  <ActivityIndicator size="small" color={COLORS.textTertiary} />
                ) : toTokenUSD ? (
                  <Text style={styles(theme).usdValue}>≈ ${toTokenUSD}</Text>
                ) : null}
              </View>
            </View>

            {/* Price Difference Warning */}
            {fromTokenUSD && toTokenUSD && (
              <View style={styles(theme).priceDiffBox}>
                <Text style={styles(theme).priceDiffLabel}>
                  Value Difference
                </Text>
                <Text
                  style={[
                    styles(theme).priceDiffValue,
                    Math.abs(
                      parseFloat(fromTokenUSD) - parseFloat(toTokenUSD),
                    ) >
                      parseFloat(fromTokenUSD) * 0.05 &&
                      styles(theme).priceDiffWarning,
                  ]}
                >
                  {(
                    ((parseFloat(toTokenUSD) - parseFloat(fromTokenUSD)) /
                      parseFloat(fromTokenUSD)) *
                    100
                  ).toFixed(2)}
                  %
                </Text>
              </View>
            )}

            {/* Approval Warning */}
            {!isNativeToken(fromToken.address) && (
              <View style={styles(theme).infoBox}>
                <Text style={styles(theme).infoText}>
                  ⚠️ This swap requires token approval
                </Text>
              </View>
            )}

            {/* Buttons */}
            <TouchableOpacity
              style={styles(theme).confirmButton}
              onPress={() => setShowPasscode(true)}
            >
              <Text style={styles(theme).confirmButtonText}>Confirm Swap</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles(theme).cancelButton}
              onPress={onClose}
            >
              <Text style={styles(theme).cancelButtonText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        );

      case "checking":
        return (
          <View style={styles(theme).content}>
            <ActivityIndicator size="large" color={COLORS.primary} />
            <Text style={styles(theme).statusText}>
              Checking requirements...
            </Text>
            {encryptionProgress && (
              <Text style={styles(theme).progressText}>
                {encryptionProgress.stage}...{" "}
                {Math.round(encryptionProgress.progress * 100)}%
              </Text>
            )}
          </View>
        );

      case "approval":
        return (
          <View style={styles(theme).content}>
            <ActivityIndicator size="large" color={COLORS.primary} />
            <Text style={styles(theme).statusText}>
              Approving {fromToken.symbol}...
            </Text>
            <Text style={styles(theme).subText}>
              This is a one-time approval
            </Text>
          </View>
        );

      case "swapping":
        return (
          <View style={styles(theme).content}>
            <ActivityIndicator size="large" color={COLORS.primary} />
            <Text style={styles(theme).statusText}>Swapping...</Text>
            {txHash && (
              <Text style={styles(theme).hashText}>
                Tx: {txHash.slice(0, 10)}...
              </Text>
            )}
          </View>
        );

      case "success":
        return (
          <View style={styles(theme).content}>
            <Text style={styles(theme).successIcon}>✅</Text>
            <Text style={styles(theme).successText}>Swap Successful!</Text>
            <Text style={styles(theme).successDetail}>
              {parseFloat(fromAmount).toFixed(4)} {fromToken.symbol} →{" "}
              {quote.amountOut} {toToken.symbol}
            </Text>
            {fromTokenUSD && toTokenUSD && (
              <Text style={styles(theme).successUSD}>
                ${fromTokenUSD} → ${toTokenUSD}
              </Text>
            )}
          </View>
        );

      case "error":
        return (
          <View style={styles(theme).content}>
            <Text style={styles(theme).errorIcon}>❌</Text>
            <Text style={styles(theme).errorText}>Swap Failed</Text>
            <Text style={styles(theme).errorDetail}>
              {errorMsg || "Unknown error"}
            </Text>
            <TouchableOpacity
              style={styles(theme).retryButton}
              onPress={() => {
                setStep("idle");
                setErrorMsg(null);
              }}
            >
              <Text style={styles(theme).retryButtonText}>Try Again</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles(theme).cancelButton}
              onPress={onClose}
            >
              <Text style={styles(theme).cancelButtonText}>Close</Text>
            </TouchableOpacity>
          </View>
        );

      default:
        return null;
    }
  };

  return (
    <>
      <Modal visible={visible} animationType="slide" transparent>
        <View style={styles(theme).overlay}>
          <View style={styles(theme).modal}>{renderContent()}</View>
        </View>
      </Modal>

      <PasscodeModal
        visible={showPasscode}
        onClose={() => setShowPasscode(false)}
        onSubmit={handlePasscodeSubmit}
        title="Confirm Transaction"
        subtitle="Enter your passcode to proceed"
      />
    </>
  );
};

const styles = (theme) => {
  const { COLORS, SPACING, FONTS, BORDER_RADIUS, SHADOWS } = theme;

  return StyleSheet.create({
    overlay: {
      flex: 1,
      backgroundColor: "rgba(0, 0, 0, 0.7)",
      justifyContent: "center",
      alignItems: "center",
      padding: SPACING.lg,
    },
    modal: {
      backgroundColor: COLORS.card,
      borderRadius: BORDER_RADIUS.xl,
      padding: SPACING.xl,
      width: "100%",
      maxWidth: 400,
      ...SHADOWS.xl,
    },
    content: {
      alignItems: "center",
    },
    title: {
      fontSize: FONTS.sizes.xl,
      fontWeight: "bold",
      color: COLORS.text,
      marginBottom: SPACING.lg,
      fontFamily: FONTS.bold,
    },
    swapDetails: {
      width: "100%",
      backgroundColor: COLORS.surface,
      padding: SPACING.md,
      borderRadius: BORDER_RADIUS.md,
      marginBottom: SPACING.sm,
    },
    detailLabel: {
      fontSize: FONTS.sizes.sm,
      color: COLORS.textSecondary,
      marginBottom: SPACING.xs,
      fontFamily: FONTS.regular,
    },
    amountRow: {
      flexDirection: "column",
      alignItems: "flex-start",
    },
    detailValue: {
      fontSize: FONTS.sizes.lg,
      fontWeight: "bold",
      color: COLORS.text,
      fontFamily: FONTS.bold,
      marginBottom: SPACING.xs,
    },
    usdValue: {
      fontSize: FONTS.sizes.sm,
      color: COLORS.textTertiary,
      fontFamily: FONTS.regular,
    },
    arrow: {
      marginVertical: SPACING.sm,
    },
    arrowText: {
      fontSize: FONTS.sizes.xxl,
      color: COLORS.textSecondary,
    },
    priceDiffBox: {
      width: "100%",
      backgroundColor: COLORS.surface,
      padding: SPACING.sm,
      borderRadius: BORDER_RADIUS.sm,
      marginTop: SPACING.sm,
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
    },
    priceDiffLabel: {
      fontSize: FONTS.sizes.xs,
      color: COLORS.textSecondary,
      fontFamily: FONTS.regular,
    },
    priceDiffValue: {
      fontSize: FONTS.sizes.sm,
      fontWeight: "600",
      color: COLORS.success,
      fontFamily: FONTS.semiBold,
    },
    priceDiffWarning: {
      color: COLORS.warning,
    },
    infoBox: {
      backgroundColor: COLORS.warning + "20",
      padding: SPACING.md,
      borderRadius: BORDER_RADIUS.md,
      marginTop: SPACING.md,
      width: "100%",
    },
    infoText: {
      fontSize: FONTS.sizes.sm,
      color: COLORS.warning,
      textAlign: "center",
      fontFamily: FONTS.regular,
    },
    confirmButton: {
      backgroundColor: COLORS.primary,
      padding: SPACING.md,
      borderRadius: BORDER_RADIUS.md,
      width: "100%",
      marginTop: SPACING.lg,
      ...SHADOWS.medium,
    },
    confirmButtonText: {
      color: COLORS.surface,
      fontSize: FONTS.sizes.md,
      fontWeight: "bold",
      textAlign: "center",
      fontFamily: FONTS.bold,
    },
    cancelButton: {
      padding: SPACING.md,
      marginTop: SPACING.md,
    },
    cancelButtonText: {
      color: COLORS.textSecondary,
      fontSize: FONTS.sizes.md,
      textAlign: "center",
      fontFamily: FONTS.regular,
    },
    statusText: {
      fontSize: FONTS.sizes.lg,
      color: COLORS.text,
      marginTop: SPACING.lg,
      fontFamily: FONTS.medium,
    },
    subText: {
      fontSize: FONTS.sizes.sm,
      color: COLORS.textSecondary,
      marginTop: SPACING.sm,
      fontFamily: FONTS.regular,
    },
    progressText: {
      fontSize: FONTS.sizes.sm,
      color: COLORS.textTertiary,
      marginTop: SPACING.xs,
      fontFamily: FONTS.regular,
    },
    hashText: {
      fontSize: FONTS.sizes.xs,
      color: COLORS.textTertiary,
      marginTop: SPACING.sm,
      fontFamily: FONTS.mono,
    },
    successIcon: {
      fontSize: 64,
      marginBottom: SPACING.md,
    },
    successText: {
      fontSize: FONTS.sizes.xl,
      fontWeight: "bold",
      color: COLORS.success,
      marginBottom: SPACING.sm,
      fontFamily: FONTS.bold,
    },
    successDetail: {
      fontSize: FONTS.sizes.md,
      color: COLORS.text,
      textAlign: "center",
      fontFamily: FONTS.regular,
    },
    successUSD: {
      fontSize: FONTS.sizes.sm,
      color: COLORS.textTertiary,
      marginTop: SPACING.xs,
      textAlign: "center",
      fontFamily: FONTS.regular,
    },
    errorIcon: {
      fontSize: 64,
      marginBottom: SPACING.md,
    },
    errorText: {
      fontSize: FONTS.sizes.xl,
      fontWeight: "bold",
      color: COLORS.error,
      marginBottom: SPACING.sm,
      fontFamily: FONTS.bold,
    },
    errorDetail: {
      fontSize: FONTS.sizes.sm,
      color: COLORS.textSecondary,
      textAlign: "center",
      marginBottom: SPACING.lg,
      fontFamily: FONTS.regular,
    },
    retryButton: {
      backgroundColor: COLORS.primary,
      padding: SPACING.md,
      borderRadius: BORDER_RADIUS.md,
      width: "100%",
      marginBottom: SPACING.sm,
    },
    retryButtonText: {
      color: COLORS.surface,
      fontSize: FONTS.sizes.md,
      fontWeight: "bold",
      textAlign: "center",
      fontFamily: FONTS.bold,
    },
  });
};

export default EnhancedSwapModal;
