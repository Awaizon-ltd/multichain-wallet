// BridgeScreen.js
// ─────────────────────────────────────────────────────────────────────────────
// Cross-chain bridge — powered by LI.FI (any supported chain → any supported
// chain, not just one hardcoded pair). Pick a source chain + asset, a
// destination chain, and LI.FI finds the route (bridge, or bridge+swap if the
// destination doesn't have the same asset).
// ─────────────────────────────────────────────────────────────────────────────
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
import { Ionicons } from "@expo/vector-icons";
import { parseUnits, formatUnits } from "ethers";
import { useTheme } from "../../contexts/ThemeContext";
import { useWallet } from "../../contexts/WalletContext";
import { useChain } from "../../contexts/ChainContext";
import { useBridge } from "../../hooks/useBridge";
import { SPACING, FONTS, SHADOWS, BORDER_RADIUS } from "../../constants/Theme";
import BridgeTransactionModal from "../../components/BridgeTransactionModal";
import AssetListComponent from "../../components/swap/AssetListComponent";
import ChainPickerModal from "../../components/wallet/ChainPickerModal";
import { API_CONFIG } from "../../config/api";
import { apiGet } from "../../services/apiClient";
import { TTL } from "../../utils/cache/DataCache";

const NATIVE_TOKEN_ADDRESS = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";

/* =========================================================
   SMALL HELPERS
========================================================= */

const ChainPill = ({ chain, label, COLORS, onPress }) => {
  const [err, setErr] = useState(false);
  return (
    <TouchableOpacity
      style={[cp.wrap, { backgroundColor: COLORS.surface }]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <Text style={[cp.label, { color: COLORS.textTertiary }]}>{label}</Text>
      <View style={cp.row}>
        {chain?.icon && !err ? (
          <Image
            source={{ uri: chain.icon }}
            style={cp.logo}
            onError={() => setErr(true)}
          />
        ) : (
          <View style={[cp.logoFallback, { backgroundColor: COLORS.border }]} />
        )}
        <Text style={[cp.name, { color: COLORS.text }]} numberOfLines={1}>
          {chain?.name ?? "Select"}
        </Text>
        <Ionicons name="chevron-down" size={14} color={COLORS.textTertiary} />
      </View>
    </TouchableOpacity>
  );
};

const cp = StyleSheet.create({
  wrap: { flex: 1, borderRadius: BORDER_RADIUS.md, padding: 10, gap: 4 },
  label: {
    fontSize: 10,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  row: { flexDirection: "row", alignItems: "center", gap: 6 },
  logo: { width: 20, height: 20, borderRadius: 10 },
  logoFallback: { width: 20, height: 20, borderRadius: 10 },
  name: { fontSize: FONTS.sizes.sm, fontWeight: "700", flex: 1 },
});

const QuoteRow = ({ quote, isQuoting, bridgeError, toSymbol, COLORS }) => {
  if (!isQuoting && !quote && !bridgeError) return null;
  return (
    <View
      style={[
        gr.wrap,
        {
          backgroundColor: COLORS.surface,
          borderColor: bridgeError ? COLORS.error + "50" : COLORS.border,
        },
      ]}
    >
      {isQuoting ? (
        <View style={gr.row}>
          <ActivityIndicator size="small" color={COLORS.primary} />
          <Text style={[gr.text, { color: COLORS.textSecondary }]}>
            Finding best route…
          </Text>
        </View>
      ) : bridgeError ? (
        <View style={gr.row}>
          <Ionicons name="alert-circle-outline" size={14} color={COLORS.error} />
          <Text
            style={[gr.text, { color: COLORS.error, flex: 1 }]}
            numberOfLines={2}
          >
            {bridgeError.message}
          </Text>
        </View>
      ) : quote ? (
        <>
          <View style={gr.row}>
            <Ionicons name="git-network-outline" size={14} color={COLORS.textTertiary} />
            <Text style={[gr.text, { color: COLORS.textSecondary }]}>
              via {quote.toolDetails?.name || quote.tool || "LI.FI"}
            </Text>
            {quote.estimatedDurationSeconds != null && (
              <Text style={[gr.detail, { color: COLORS.textTertiary }]}>
                ~{Math.ceil(quote.estimatedDurationSeconds / 60)} min
              </Text>
            )}
          </View>
          {quote.gasCostUsd != null && (
            <Text style={[gr.text, { color: COLORS.textTertiary, marginTop: 4 }]}>
              Network fee ≈ ${parseFloat(quote.gasCostUsd).toFixed(2)}
            </Text>
          )}
        </>
      ) : null}
    </View>
  );
};

const gr = StyleSheet.create({
  wrap: {
    borderRadius: BORDER_RADIUS.md,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  row: { flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" },
  text: { fontSize: FONTS.sizes.xs, fontWeight: "500" },
  detail: { fontSize: FONTS.sizes.xs, marginLeft: "auto" },
});

/* =========================================================
   MAIN COMPONENT
========================================================= */

export default function BridgeScreen() {
  const { COLORS } = useTheme();
  const { address, isAuthenticated, getBalanceForChain, refreshBalance } =
    useWallet();
  const { chains, activeChain } = useChain();

  const {
    getQuote,
    quote,
    isQuoting,
    error: bridgeError,
    clearError,
    clearQuote,
  } = useBridge();

  const mainnetChains = useMemo(() => chains.filter((c) => !c.testnet), [chains]);

  const [fromChain, setFromChain] = useState(activeChain);
  const [toChain, setToChain] = useState(
    mainnetChains.find((c) => c.id !== activeChain?.id) || mainnetChains[0],
  );

  const [fromToken, setFromToken] = useState(null);
  const [amount, setAmount] = useState("");

  const [fromTokens, setFromTokens] = useState([]);
  const [toTokens, setToTokens] = useState([]);
  const [tokensLoading, setTokensLoading] = useState(true);

  const [showFromChainPicker, setShowFromChainPicker] = useState(false);
  const [showToChainPicker, setShowToChainPicker] = useState(false);
  const [showAssetModal, setShowAssetModal] = useState(false);
  const [showTxModal, setShowTxModal] = useState(false);
  const [txReceipt, setTxReceipt] = useState(null);

  /* ─── Load token lists whenever a chain changes ────────────────────────────
     Cached 10min via apiClient — the same catalog useSwap.js fetches, so
     switching between Swap and Bridge tabs on the same chain is instant. ─── */
  useEffect(() => {
    if (!fromChain) return;
    let cancelled = false;
    setTokensLoading(true);
    apiGet(API_CONFIG.ENDPOINTS.SWAP_TOKENS, {
      params: { chainId: fromChain.id },
      ttl: TTL.API_TOKEN_CATALOG,
    })
      .then((json) => {
        if (cancelled) return;
        setFromTokens(json.data.tokens);
        setFromToken(json.data.tokens[0] || null);
      })
      .catch((err) => console.error("[BridgeScreen] load from-tokens failed:", err.message))
      .finally(() => !cancelled && setTokensLoading(false));
    return () => {
      cancelled = true;
    };
  }, [fromChain?.id]);

  useEffect(() => {
    if (!toChain) return;
    let cancelled = false;
    apiGet(API_CONFIG.ENDPOINTS.SWAP_TOKENS, {
      params: { chainId: toChain.id },
      ttl: TTL.API_TOKEN_CATALOG,
    })
      .then((json) => {
        if (!cancelled) setToTokens(json.data.tokens);
      })
      .catch((err) => console.error("[BridgeScreen] load to-tokens failed:", err.message));
    return () => {
      cancelled = true;
    };
  }, [toChain?.id]);

  // Auto-resolve the destination token: same symbol if it exists on the
  // destination chain, otherwise fall back to the destination's native asset.
  const toToken = useMemo(() => {
    if (!fromToken || toTokens.length === 0) return null;
    return (
      toTokens.find((t) => t.symbol === fromToken.symbol) ??
      toTokens.find((t) => t.isNative) ??
      toTokens[0]
    );
  }, [fromToken, toTokens]);

  /* ─── Derived values ───────────────────────────────────────────────────── */

  const sourceBalance = useMemo(
    () => getBalanceForChain(fromChain?.id),
    [fromChain?.id, getBalanceForChain],
  );

  const displayBalance = fromToken?.isNative
    ? sourceBalance?.formatted ?? "0"
    : "0"; // ERC-20 balances load lazily below via getAssetBalance if needed

  const exceedsBalance = useMemo(() => {
    if (!amount || parseFloat(amount) === 0) return false;
    return parseFloat(amount) > parseFloat(displayBalance || "0");
  }, [amount, displayBalance]);

  const isSameChain = fromChain?.id === toChain?.id;

  const isValid =
    !!fromToken &&
    !!toToken &&
    !!amount &&
    parseFloat(amount) > 0 &&
    !exceedsBalance &&
    !isSameChain &&
    !!quote &&
    !bridgeError;

  /* ─── Debounced quote fetch ────────────────────────────────────────────── */
  useEffect(() => {
    clearError();
    if (!fromToken || !toToken || isSameChain) {
      clearQuote();
      return;
    }
    const timer = setTimeout(() => {
      if (!amount || parseFloat(amount) <= 0 || exceedsBalance) return;

      let fromAmountWei;
      try {
        fromAmountWei = parseUnits(amount, fromToken.decimals).toString();
      } catch {
        return;
      }

      getQuote({
        fromChainId: fromChain.id,
        toChainId: toChain.id,
        fromToken: fromToken.address,
        toToken: toToken.address,
        fromAmount: fromAmountWei,
        fromAddress: address,
      }).catch(() => {});
    }, 700);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [amount, fromToken, toToken, fromChain?.id, toChain?.id, exceedsBalance]);

  const buyAmountFormatted = useMemo(() => {
    if (!quote?.buyAmount || !toToken) return null;
    try {
      return parseFloat(formatUnits(quote.buyAmount, toToken.decimals)).toFixed(6);
    } catch {
      return null;
    }
  }, [quote, toToken]);

  /* ─── Handlers ─────────────────────────────────────────────────────────── */

  const handleBridge = useCallback(() => {
    if (!amount || parseFloat(amount) <= 0) {
      Alert.alert("Invalid Amount", "Please enter a valid amount");
      return;
    }
    if (exceedsBalance) {
      Alert.alert("Insufficient Balance", "Amount exceeds your available balance");
      return;
    }
    if (isSameChain) {
      Alert.alert("Pick Different Chains", "Source and destination must differ");
      return;
    }
    if (!quote) {
      Alert.alert("No Route Yet", "Please wait for a quote before continuing");
      return;
    }
    setShowTxModal(true);
  }, [amount, exceedsBalance, isSameChain, quote]);

  const handleTxSuccess = async (receipt) => {
    setTxReceipt(receipt);
    await refreshBalance(fromChain.id);
    setTimeout(() => {
      Alert.alert(
        "Bridge submitted",
        `Bridging ${amount} ${fromToken.symbol} from ${fromChain.name} to ${toChain.name}. This can take a few minutes to a few hours depending on the route.`,
        [{ text: "OK", onPress: resetForm }],
      );
    }, 500);
  };

  const handleTxError = (error) => {
    console.error("[BridgeScreen] Bridge failed:", error);
  };

  const resetForm = () => {
    setAmount("");
    setTxReceipt(null);
    clearError();
    clearQuote();
  };

  const handleSelectFromChain = (chain) => {
    setFromChain(chain);
    setShowFromChainPicker(false);
    if (chain.id === toChain?.id) {
      const alt = mainnetChains.find((c) => c.id !== chain.id);
      if (alt) setToChain(alt);
    }
  };

  const handleSelectToChain = (chain) => {
    setToChain(chain);
    setShowToChainPicker(false);
    if (chain.id === fromChain?.id) {
      const alt = mainnetChains.find((c) => c.id !== chain.id);
      if (alt) setFromChain(alt);
    }
  };

  const handleSelectAsset = (asset) => {
    setFromToken(asset);
    setAmount("");
    clearError();
    clearQuote();
  };

  const handleMaxAmount = () => {
    if (!fromToken?.isNative) return;
    const balance = parseFloat(displayBalance);
    const maxAmount = Math.max(0, balance - 0.01); // leave gas buffer
    setAmount(maxAmount > 0 ? maxAmount.toFixed(6) : "0");
  };

  // Build balances map for AssetListComponent { symbol_lower: formatted }
  const assetBalances = useMemo(() => {
    const map = {};
    fromTokens.forEach((t) => {
      map[t.symbol.toLowerCase()] = t.isNative ? displayBalance : "0";
    });
    return map;
  }, [fromTokens, displayBalance]);

  /* ─── Loading / unauthenticated states ─────────────────────────────────── */

  if (!isAuthenticated) {
    return (
      <View style={[styles.container, styles.center, { backgroundColor: COLORS.background }]}>
        <Ionicons name="lock-closed-outline" size={40} color={COLORS.textTertiary} />
        <Text style={[styles.emptyText, { color: COLORS.textSecondary }]}>
          Unlock your wallet to bridge
        </Text>
      </View>
    );
  }

  if (tokensLoading && fromTokens.length === 0) {
    return (
      <View style={[styles.container, styles.center, { backgroundColor: COLORS.background }]}>
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={[styles.emptyText, { color: COLORS.textSecondary }]}>
          Loading bridge assets…
        </Text>
      </View>
    );
  }

  /* ─── Render ───────────────────────────────────────────────────────────── */

  return (
    <>
      <ScrollView
        style={[styles.container, { backgroundColor: COLORS.background }]}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Chain direction row */}
        <View style={styles.chainRow}>
          <ChainPill
            chain={fromChain}
            label="From"
            COLORS={COLORS}
            onPress={() => setShowFromChainPicker(true)}
          />
          <TouchableOpacity
            onPress={() => {
              const prevFrom = fromChain;
              setFromChain(toChain);
              setToChain(prevFrom);
            }}
            style={[styles.swapBtn, { backgroundColor: COLORS.surface, borderColor: COLORS.border }]}
            activeOpacity={0.7}
          >
            <Ionicons name="swap-horizontal-outline" size={18} color={COLORS.primary} />
          </TouchableOpacity>
          <ChainPill
            chain={toChain}
            label="To"
            COLORS={COLORS}
            onPress={() => setShowToChainPicker(true)}
          />
        </View>

        {isSameChain && (
          <View style={[styles.infoPill, { backgroundColor: COLORS.error + "15" }]}>
            <Ionicons name="warning-outline" size={13} color={COLORS.error} />
            <Text style={[styles.infoText, { color: COLORS.error }]}>
              Source and destination chains must be different
            </Text>
          </View>
        )}

        {/* Asset + Amount card */}
        {fromToken && (
          <View style={[styles.card, { backgroundColor: COLORS.card, borderColor: COLORS.border }]}>
            <TouchableOpacity
              onPress={() => setShowAssetModal(true)}
              activeOpacity={0.7}
              style={[styles.assetRow, { borderBottomColor: COLORS.border }]}
            >
              <View style={[styles.assetLogoWrap, { backgroundColor: COLORS.surface }]}>
                <Image source={{ uri: fromToken.logoURI }} style={styles.assetLogo} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.assetSymbol, { color: COLORS.text }]}>{fromToken.symbol}</Text>
                <Text style={[styles.assetName, { color: COLORS.textSecondary }]}>{fromToken.name}</Text>
              </View>
              <View style={styles.assetRight}>
                <Text style={[styles.balanceText, { color: COLORS.textTertiary }]}>
                  {parseFloat(displayBalance || "0").toFixed(4)}
                </Text>
                <View style={[styles.changePill, { backgroundColor: COLORS.surface, borderColor: COLORS.border }]}>
                  <Text style={[styles.changePillText, { color: COLORS.textSecondary }]}>Change</Text>
                  <Ionicons name="chevron-down" size={11} color={COLORS.textSecondary} />
                </View>
              </View>
            </TouchableOpacity>

            <View style={styles.amountRow}>
              <TextInput
                value={amount}
                onChangeText={setAmount}
                placeholder="0.00"
                placeholderTextColor={COLORS.textTertiary}
                keyboardType="decimal-pad"
                style={[styles.amountInput, { color: exceedsBalance ? COLORS.error : COLORS.text }]}
              />
              <View style={styles.amountRight}>
                <TouchableOpacity
                  onPress={handleMaxAmount}
                  style={[styles.maxBtn, { backgroundColor: COLORS.primary + "18", borderColor: COLORS.primary + "40" }]}
                >
                  <Text style={[styles.maxBtnText, { color: COLORS.primary }]}>MAX</Text>
                </TouchableOpacity>
                <Text style={[styles.amountSymbol, { color: COLORS.textTertiary }]}>{fromToken.symbol}</Text>
              </View>
            </View>

            <View style={styles.balanceHintRow}>
              <Text style={[styles.hintText, { color: exceedsBalance ? COLORS.error : COLORS.textTertiary }]}>
                {exceedsBalance
                  ? "Insufficient balance"
                  : `Available: ${parseFloat(displayBalance || "0").toFixed(6)} ${fromToken.symbol}`}
              </Text>
            </View>

            {buyAmountFormatted && toToken && (
              <View style={[styles.receiveRow, { borderTopColor: COLORS.border }]}>
                <Text style={[styles.receiveLabel, { color: COLORS.textTertiary }]}>You receive</Text>
                <Text style={[styles.receiveValue, { color: COLORS.text }]}>
                  ≈ {buyAmountFormatted} {toToken.symbol}
                </Text>
              </View>
            )}
          </View>
        )}

        <QuoteRow
          quote={quote}
          isQuoting={isQuoting}
          bridgeError={bridgeError}
          toSymbol={toToken?.symbol}
          COLORS={COLORS}
        />

        <TouchableOpacity
          onPress={handleBridge}
          disabled={!isValid}
          activeOpacity={0.85}
          style={[styles.bridgeBtn, { backgroundColor: isValid ? COLORS.primary : COLORS.surface, borderColor: COLORS.border }]}
        >
          {isQuoting ? (
            <ActivityIndicator size="small" color={isValid ? COLORS.background : COLORS.textTertiary} />
          ) : (
            <Text style={[styles.bridgeBtnText, { color: isValid ? COLORS.background : COLORS.textTertiary }]}>
              Bridge {fromToken?.symbol}
            </Text>
          )}
        </TouchableOpacity>

        {txReceipt && (
          <View style={[styles.txPill, { backgroundColor: COLORS.surface, borderColor: COLORS.border }]}>
            <Ionicons name="checkmark-circle-outline" size={14} color={COLORS.success} />
            <Text style={[styles.txText, { color: COLORS.textSecondary }]}>
              {(txReceipt.hash || txReceipt.transactionHash)?.slice(0, 10)}…
              {(txReceipt.hash || txReceipt.transactionHash)?.slice(-8)}
            </Text>
          </View>
        )}
      </ScrollView>

      <AssetListComponent
        visible={showAssetModal}
        onClose={() => setShowAssetModal(false)}
        onSelect={handleSelectAsset}
        selectedAsset={fromToken}
        assets={fromTokens}
        balances={assetBalances}
        title="Select Asset"
      />

      <ChainPickerModal
        visible={showFromChainPicker}
        onClose={() => setShowFromChainPicker(false)}
        onSelect={handleSelectFromChain}
        chains={mainnetChains}
        selectedChainId={fromChain?.id}
        title="Bridge From"
      />
      <ChainPickerModal
        visible={showToChainPicker}
        onClose={() => setShowToChainPicker(false)}
        onSelect={handleSelectToChain}
        chains={mainnetChains}
        selectedChainId={toChain?.id}
        title="Bridge To"
      />

      <BridgeTransactionModal
        visible={showTxModal}
        onClose={() => setShowTxModal(false)}
        title="Confirm Bridge"
        description={`Bridge ${amount} ${fromToken?.symbol} from ${fromChain?.name} to ${toChain?.name}`}
        quote={quote}
        chainSymbol={fromToken?.symbol}
        fromChainName={fromChain?.name}
        toChainName={toChain?.name}
        toSymbol={toToken?.symbol}
        buyAmountFormatted={buyAmountFormatted}
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
  container: { flex: 1 },
  center: { justifyContent: "center", alignItems: "center", gap: SPACING.sm },
  content: { padding: SPACING.lg, gap: SPACING.sm, paddingBottom: SPACING.md },
  emptyText: { fontSize: FONTS.sizes.sm, textAlign: "center" },

  chainRow: { flexDirection: "row", alignItems: "center", gap: SPACING.xs },
  swapBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },

  card: {
    borderRadius: BORDER_RADIUS.lg,
    borderWidth: 1,
    overflow: "hidden",
    padding: SPACING.md,
  },

  assetRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: SPACING.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: SPACING.sm,
  },
  assetLogoWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  assetLogo: { width: 36, height: 36, borderRadius: 18 },
  assetSymbol: { fontSize: FONTS.sizes.md, fontWeight: "700" },
  assetName: { fontSize: FONTS.sizes.xs, marginTop: 1 },
  assetRight: { alignItems: "flex-end", gap: 4 },
  balanceText: { fontSize: FONTS.sizes.xs },
  changePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 99,
    borderWidth: 1,
  },
  changePillText: { fontSize: 10, fontWeight: "600" },

  amountRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: SPACING.sm,
    paddingTop: SPACING.sm,
    gap: SPACING.sm,
  },
  amountInput: { flex: 1, fontSize: 28, fontWeight: "700", padding: 0 },
  amountRight: { alignItems: "flex-end", gap: 4 },
  maxBtn: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
  },
  maxBtnText: { fontSize: 10, fontWeight: "800", letterSpacing: 0.3 },
  amountSymbol: { fontSize: FONTS.sizes.xs, fontWeight: "600" },

  balanceHintRow: {
    paddingHorizontal: SPACING.sm,
    paddingBottom: SPACING.sm,
    marginTop: 2,
  },
  hintText: { fontSize: FONTS.sizes.xs },

  receiveRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: SPACING.sm,
    paddingTop: SPACING.sm,
    marginTop: 4,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  receiveLabel: { fontSize: FONTS.sizes.xs },
  receiveValue: { fontSize: FONTS.sizes.sm, fontWeight: "700" },

  infoPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: BORDER_RADIUS.md,
  },
  infoText: { fontSize: FONTS.sizes.xs, flex: 1 },

  bridgeBtn: {
    borderRadius: BORDER_RADIUS.lg,
    borderWidth: 1,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
    marginTop: SPACING.xs,
  },
  bridgeBtnText: {
    fontSize: FONTS.sizes.md,
    fontWeight: "700",
    letterSpacing: 0.3,
  },

  txPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: BORDER_RADIUS.md,
    borderWidth: 1,
  },
  txText: { fontSize: FONTS.sizes.xs, fontFamily: "monospace" },
});
