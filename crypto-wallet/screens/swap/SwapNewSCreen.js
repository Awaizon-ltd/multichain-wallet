// screens/SwapScreen.js
import React, {
  useState,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  memo,
} from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  RefreshControl,
  Image,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { useNavigation, useRoute } from "@react-navigation/native";
import { useTheme } from "../../contexts/ThemeContext";
import { useWallet } from "../../contexts/WalletContext";
import { useChain, isSolanaChain } from "../../contexts/ChainContext";
import { useSwap } from "../../hooks/useSwap";
import { TokenSelectorModal } from "../../components/swap/TokenSelectorModal";
import { SwapConfirmModal } from "../../components/swap/SwapConfirmModal";
import ChainSwitcher, {
  ChainSelectorButton,
} from "../../components/wallet/ChainSwitcher";
import TrendingTokens from "../../components/swap/TrendingTokens";
// ✅ Pull balance utils directly — no WalletContext wrapper needed
import {
  getTokenBalance as fetchERC20Balance,
  getNativeBalance,
} from "../../utils/blockchain/Balances";
import { getSolBalance, getSplTokenBalance } from "../../utils/SolanaService";

// ─── Constants ────────────────────────────────────────────────────────────────
const SLIPPAGE_OPTIONS = [0.005, 0.01, 0.02, 0.05];

// ─── Helpers ──────────────────────────────────────────────────────────────────
const safeFloat = (val) => {
  const n = parseFloat(val);
  return isNaN(n) ? 0 : n;
};

const formatBalance = (val) => {
  const n = safeFloat(val);
  return n === 0 ? "0.0000" : n.toFixed(4);
};

const formatUsd = (amount, price) => {
  if (!price) return null;
  const usd = safeFloat(amount) * safeFloat(price);
  if (usd === 0) return null;
  return `≈ $${usd.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
};

// ─── useDebounce ──────────────────────────────────────────────────────────────
function useDebounce(value, delay = 400) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

// ─── TokenLogo ────────────────────────────────────────────────────────────────
const TokenLogo = memo(({ logoURI, symbol, size = 28, theme }) => {
  const [imgError, setImgError] = useState(false);
  const { COLORS } = theme;

  const styles = useMemo(
    () =>
      StyleSheet.create({
        image: { width: size, height: size, borderRadius: size / 2 },
        fallback: {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: COLORS.primaryMuted,
          alignItems: "center",
          justifyContent: "center",
        },
        fallbackText: {
          fontSize: size * 0.4,
          fontWeight: "800",
          color: COLORS.primaryDark,
        },
      }),
    [size, COLORS],
  );

  if (logoURI && !imgError) {
    return (
      <Image
        source={{ uri: logoURI }}
        style={styles.image}
        onError={() => setImgError(true)}
        fadeDuration={0}
      />
    );
  }
  return (
    <View style={styles.fallback}>
      <Text style={styles.fallbackText}>{symbol?.charAt(0) ?? "?"}</Text>
    </View>
  );
});

// ─── SlippageSelector ─────────────────────────────────────────────────────────
const SlippageSelector = memo(({ slippage, onSelect, theme }) => {
  const { COLORS, SPACING, FONTS, BORDER_RADIUS, SHADOWS } = theme;
  const [custom, setCustom] = useState("");
  const [showCustom, setShowCustom] = useState(false);
  const isCustomActive = !SLIPPAGE_OPTIONS.includes(slippage);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        container: {
          backgroundColor: COLORS.surface,
          borderRadius: BORDER_RADIUS.lg,
          padding: SPACING.md,
          marginBottom: SPACING.md,
          borderWidth: 1,
          borderColor: COLORS.border,
          ...SHADOWS.small,
        },
        label: {
          fontSize: FONTS.sizes.xs,
          fontWeight: "700",
          color: COLORS.textSecondary,
          textTransform: "uppercase",
          letterSpacing: 0.8,
          marginBottom: SPACING.sm,
        },
        row: { flexDirection: "row", gap: SPACING.xs },
        opt: {
          flex: 1,
          paddingVertical: SPACING.sm,
          borderRadius: BORDER_RADIUS.sm,
          alignItems: "center",
          borderWidth: 1,
          backgroundColor: COLORS.background,
          borderColor: COLORS.border,
        },
        optActive: {
          backgroundColor: COLORS.primaryMuted,
          borderColor: COLORS.primary,
        },
        optText: {
          fontSize: FONTS.sizes.xs,
          fontWeight: "600",
          color: COLORS.textSecondary,
        },
        optTextActive: { fontWeight: "700", color: COLORS.primaryDark },
        customRow: {
          flexDirection: "row",
          alignItems: "center",
          marginTop: SPACING.sm,
          gap: SPACING.sm,
        },
        customInput: {
          flex: 1,
          backgroundColor: COLORS.background,
          borderRadius: BORDER_RADIUS.md,
          paddingVertical: SPACING.sm,
          paddingHorizontal: SPACING.md,
          fontSize: FONTS.sizes.md,
          color: COLORS.text,
          borderWidth: 1,
          borderColor: COLORS.border,
        },
        customPct: {
          fontSize: FONTS.sizes.md,
          color: COLORS.textSecondary,
          fontWeight: "600",
        },
        confirmBtn: {
          backgroundColor: COLORS.primary,
          borderRadius: BORDER_RADIUS.md,
          paddingVertical: SPACING.sm,
          paddingHorizontal: SPACING.md,
        },
        confirmBtnText: {
          color: COLORS.background,
          fontWeight: "700",
          fontSize: FONTS.sizes.sm,
        },
      }),
    [theme],
  );

  const handleCustomConfirm = useCallback(() => {
    const val = parseFloat(custom) / 100;
    if (!isNaN(val) && val > 0 && val < 0.5) {
      onSelect(val);
      setShowCustom(false);
      setCustom("");
    }
  }, [custom, onSelect]);

  return (
    <View style={styles.container}>
      <Text style={styles.label}>Slippage Tolerance</Text>
      <View style={styles.row}>
        {SLIPPAGE_OPTIONS.map((opt) => (
          <TouchableOpacity
            key={opt}
            style={[styles.opt, slippage === opt && styles.optActive]}
            onPress={() => {
              onSelect(opt);
              setShowCustom(false);
            }}
          >
            <Text
              style={[styles.optText, slippage === opt && styles.optTextActive]}
            >
              {(opt * 100).toFixed(1)}%
            </Text>
          </TouchableOpacity>
        ))}
        <TouchableOpacity
          style={[styles.opt, isCustomActive && styles.optActive]}
          onPress={() => setShowCustom((v) => !v)}
        >
          <Text
            style={[styles.optText, isCustomActive && styles.optTextActive]}
          >
            {isCustomActive ? `${(slippage * 100).toFixed(1)}%` : "Custom"}
          </Text>
        </TouchableOpacity>
      </View>

      {showCustom && (
        <View style={styles.customRow}>
          <TextInput
            style={styles.customInput}
            placeholder="1.00"
            placeholderTextColor={COLORS.textTertiary}
            keyboardType="decimal-pad"
            value={custom}
            onChangeText={setCustom}
          />
          <Text style={styles.customPct}>%</Text>
          <TouchableOpacity
            style={styles.confirmBtn}
            onPress={handleCustomConfirm}
          >
            <Text style={styles.confirmBtnText}>Set</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
});

// ─── TokenInputBox ────────────────────────────────────────────────────────────
const TokenInputBox = memo(
  ({
    label,
    token,
    amount,
    onAmountChange,
    onTokenPress,
    isReadOnly,
    isFetching,
    balance,
    usdPrice,
    onMaxPress,
    chain,
    theme,
  }) => {
    const { COLORS, SPACING, FONTS, BORDER_RADIUS, SHADOWS } = theme;

    const styles = useMemo(
      () =>
        StyleSheet.create({
          container: { padding: SPACING.md },
          header: {
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: SPACING.sm,
          },
          label: {
            fontSize: FONTS.sizes.xs,
            fontWeight: "700",
            color: COLORS.textTertiary,
            textTransform: "uppercase",
            letterSpacing: 0.8,
          },
          balanceRow: {
            flexDirection: "row",
            alignItems: "center",
            gap: SPACING.sm,
          },
          balanceText: {
            fontSize: FONTS.sizes.xs,
            color: COLORS.textSecondary,
          },
          maxBtn: {
            backgroundColor: COLORS.primaryMuted,
            paddingHorizontal: SPACING.sm,
            paddingVertical: SPACING.xs,
            borderRadius: BORDER_RADIUS.xs,
          },
          maxBtnText: {
            fontSize: FONTS.sizes.xs,
            fontWeight: "800",
            color: COLORS.primaryDark,
            letterSpacing: 0.5,
          },
          body: { flexDirection: "row", alignItems: "center" },
          tokenCol: { alignItems: "flex-end", gap: 4 },
          chainTag: {
            flexDirection: "row",
            alignItems: "center",
            gap: 4,
            paddingRight: 2,
          },
          chainTagIcon: { width: 12, height: 12, borderRadius: 6 },
          chainTagText: {
            fontSize: FONTS.sizes.xs,
            color: COLORS.textTertiary,
            fontWeight: "600",
          },
          inputWrapper: { flex: 1 },
          input: {
            fontSize: FONTS.sizes.xxl,
            fontWeight: "700",
            color: COLORS.text,
            padding: 0,
            minHeight: 44,
          },
          inputReadOnly: { color: COLORS.textSecondary },
          usdLabel: {
            fontSize: FONTS.sizes.xs,
            color: COLORS.textTertiary,
            marginTop: 2,
          },
          tokenSelector: {
            flexDirection: "row",
            alignItems: "center",
            backgroundColor: COLORS.card,
            borderRadius: BORDER_RADIUS.lg,
            paddingVertical: SPACING.sm,
            paddingHorizontal: SPACING.sm,
            gap: SPACING.xs,
            borderWidth: 1,
            borderColor: COLORS.borderStrong,
            minWidth: 100,
            ...SHADOWS.small,
          },
          tokenSymbol: {
            fontSize: FONTS.sizes.md,
            fontWeight: "700",
            color: COLORS.text,
          },
          tokenPlaceholder: {
            fontSize: FONTS.sizes.sm,
            color: COLORS.primary,
            fontWeight: "700",
          },
        }),
      [theme],
    );

    const usdLabel = useMemo(
      () => formatUsd(amount, usdPrice),
      [amount, usdPrice],
    );
    const balanceLabel = useMemo(() => formatBalance(balance), [balance]);
    const showMax = !isReadOnly && onMaxPress && safeFloat(balance) > 0;

    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.label}>{label}</Text>
          {token && (
            <View style={styles.balanceRow}>
              <Text style={styles.balanceText}>Balance: {balanceLabel}</Text>
              {showMax && (
                <TouchableOpacity
                  onPress={onMaxPress}
                  style={styles.maxBtn}
                  hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                >
                  <Text style={styles.maxBtnText}>MAX</Text>
                </TouchableOpacity>
              )}
            </View>
          )}
        </View>

        <View style={styles.body}>
          <View style={styles.inputWrapper}>
            {isFetching ? (
              <ActivityIndicator
                size="small"
                color={COLORS.primary}
                style={{ alignSelf: "flex-start" }}
              />
            ) : (
              <>
                <TextInput
                  style={[styles.input, isReadOnly && styles.inputReadOnly]}
                  placeholder="0.0"
                  placeholderTextColor={COLORS.textTertiary}
                  keyboardType="decimal-pad"
                  value={amount}
                  onChangeText={onAmountChange}
                  editable={!isReadOnly}
                />
                {usdLabel ? (
                  <Text style={styles.usdLabel}>{usdLabel}</Text>
                ) : null}
              </>
            )}
          </View>

          <View style={styles.tokenCol}>
          <TouchableOpacity
            style={styles.tokenSelector}
            onPress={onTokenPress}
            activeOpacity={0.75}
          >
            {token ? (
              <>
                <TokenLogo
                  logoURI={token.logoURI}
                  symbol={token.symbol}
                  size={26}
                  theme={theme}
                />
                <Text style={styles.tokenSymbol}>{token.symbol}</Text>
              </>
            ) : (
              <Text style={styles.tokenPlaceholder}>Select</Text>
            )}
            <Ionicons
              name="chevron-down"
              size={14}
              color={COLORS.textSecondary}
            />
          </TouchableOpacity>
          {chain ? (
            <View style={styles.chainTag}>
              <Image source={{ uri: chain.icon }} style={styles.chainTagIcon} />
              <Text style={styles.chainTagText}>on {chain.name.replace(" Chain", "")}</Text>
            </View>
          ) : null}
          </View>
        </View>
      </View>
    );
  },
);

// ─── PriceInfo ────────────────────────────────────────────────────────────────
const PriceInfo = memo(
  ({
    isFetchingPrice,
    exchangeRate,
    priceImpact,
    slippage,
    impactColor,
    provider,
    routeInfo,
    theme,
  }) => {
    const { COLORS, SPACING, FONTS, BORDER_RADIUS } = theme;

    const styles = useMemo(
      () =>
        StyleSheet.create({
          container: {
            backgroundColor: COLORS.surface,
            borderRadius: BORDER_RADIUS.lg,
            padding: SPACING.md,
            marginBottom: SPACING.sm,
            gap: SPACING.sm,
            borderWidth: 1,
            borderColor: COLORS.border,
          },
          loadingRow: {
            flexDirection: "row",
            alignItems: "center",
            gap: SPACING.sm,
          },
          loadingText: {
            fontSize: FONTS.sizes.sm,
            color: COLORS.textSecondary,
          },
          row: { flexDirection: "row", alignItems: "center", gap: SPACING.xs },
          text: { fontSize: FONTS.sizes.sm, color: COLORS.textSecondary },
        }),
      [theme],
    );

    return (
      <View style={styles.container}>
        {isFetchingPrice ? (
          <View style={styles.loadingRow}>
            <ActivityIndicator size="small" color={COLORS.primary} />
            <Text style={styles.loadingText}>Fetching best price...</Text>
          </View>
        ) : (
          <>
            {exchangeRate && (
              <View style={styles.row}>
                <Ionicons
                  name="swap-horizontal-outline"
                  size={13}
                  color={COLORS.textTertiary}
                />
                <Text style={styles.text}>{exchangeRate.formatted}</Text>
              </View>
            )}
            {priceImpact && (
              <View style={styles.row}>
                <Ionicons
                  name="trending-down-outline"
                  size={13}
                  color={impactColor}
                />
                <Text style={[styles.text, { color: impactColor }]}>
                  Price impact: {priceImpact.formatted}
                </Text>
              </View>
            )}
            <View style={styles.row}>
              <Ionicons
                name="shield-checkmark-outline"
                size={13}
                color={COLORS.textTertiary}
              />
              <Text style={styles.text}>
                Slippage: {(slippage * 100).toFixed(1)}% · {provider}
              </Text>
            </View>
            {routeInfo && (
              <View style={styles.row}>
                <Ionicons name="time-outline" size={13} color={COLORS.textTertiary} />
                <Text style={styles.text}>
                  {routeInfo.eta != null
                    ? `Arrives in ~${Math.max(1, Math.ceil(routeInfo.eta / 60))} min`
                    : "Cross-chain"}
                  {routeInfo.feesUsd != null ? ` · fees ≈ $${routeInfo.feesUsd.toFixed(2)}` : ""}
                  {` · via ${routeInfo.via}`}
                </Text>
              </View>
            )}
          </>
        )}
      </View>
    );
  },
);

// ─── SwapScreen ───────────────────────────────────────────────────────────────
export default function SwapScreen() {
  const theme = useTheme();
  const { COLORS, SPACING, FONTS, BORDER_RADIUS, SHADOWS } = theme;

  const {
    activeChain: contextChain,
    switchChain,
    networks,
    solanaChain,
  } = useChain();
  // Only addresses from context — balance fetching goes direct to the utils
  const { wallet, solanaAddress } = useWallet();

  // The swap screen keeps its own chain so it can swap on Solana, which can't
  // be the global (EVM-only) active chain. false = follow the active chain.
  const [solanaSelected, setSolanaSelected] = useState(false);
  const activeChain =
    solanaSelected && solanaChain ? solanaChain : contextChain;
  const isSolana = isSolanaChain(activeChain);
  const swapNetworks = useMemo(
    () => networks.filter((c) => !c.testnet || __DEV__),
    [networks],
  );

  // What the user receives can be on another chain — that's a cross-chain
  // swap, routed through LI.FI by useSwap. null = same chain as the sell side.
  const [buyChainId, setBuyChainId] = useState(null);
  const buyChain =
    (buyChainId != null && swapNetworks.find((c) => c.id === buyChainId)) ||
    activeChain;

  const swap = useSwap(activeChain, buyChain);
  const provider = swap.isCrossChain ? "LI.FI" : isSolana ? "Jupiter" : "0x Protocol";
  const navigation = useNavigation();
  const route = useRoute();
  const [trendingRefreshKey, setTrendingRefreshKey] = useState(0);

  const [showSellSelector, setShowSellSelector] = useState(false);
  const [showBuySelector, setShowBuySelector] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showChainSwitcher, setShowChainSwitcher] = useState(false);
  const [currentQuote, setCurrentQuote] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [sellBalance, setSellBalance] = useState("0");
  const [buyBalance, setBuyBalance] = useState("0");

  const sellAbortRef = useRef(null);
  const buyAbortRef = useRef(null);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        safeArea: { flex: 1, backgroundColor: COLORS.background },
        // Extra bottom room so the last trending row clears the floating tab bar
        scroll: { padding: SPACING.md, paddingBottom: 120 },
        header: {
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "flex-start",
          marginBottom: SPACING.lg,
        },
        headerTitle: {
          fontSize: FONTS.sizes.xxl,
          fontWeight: "800",
          color: COLORS.text,
          letterSpacing: -0.5,
        },
        headerSubtitle: {
          fontSize: FONTS.sizes.sm,
          color: COLORS.textSecondary,
          marginTop: SPACING.xs,
        },
        headerActions: {
          flexDirection: "row",
          alignItems: "center",
          gap: SPACING.xs,
        },
        settingsBtn: {
          padding: SPACING.sm,
          borderRadius: BORDER_RADIUS.md,
          backgroundColor: COLORS.surface,
          borderWidth: 1,
          borderColor: COLORS.border,
        },
        settingsBtnActive: {
          backgroundColor: COLORS.primaryMuted,
          borderColor: COLORS.primary,
        },
        swapCard: {
          backgroundColor: COLORS.surface,
          borderRadius: BORDER_RADIUS.xl,
          borderWidth: 1,
          borderColor: COLORS.border,
          marginBottom: SPACING.sm,
          overflow: "hidden",
          ...SHADOWS.medium,
        },
        flipRow: {
          flexDirection: "row",
          alignItems: "center",
          paddingHorizontal: SPACING.md,
        },
        divider: { flex: 1, height: 1, backgroundColor: COLORS.divider },
        flipBtn: {
          width: 36,
          height: 36,
          borderRadius: 18,
          backgroundColor: COLORS.primaryMuted,
          borderWidth: 1,
          borderColor: COLORS.border,
          alignItems: "center",
          justifyContent: "center",
          marginHorizontal: SPACING.md,
        },
        errorBanner: {
          flexDirection: "row",
          alignItems: "center",
          gap: SPACING.sm,
          backgroundColor: `${COLORS.error}14`,
          borderRadius: BORDER_RADIUS.md,
          padding: SPACING.md,
          marginBottom: SPACING.sm,
          borderWidth: 1,
          borderColor: `${COLORS.error}30`,
        },
        errorText: { flex: 1, fontSize: FONTS.sizes.sm, color: COLORS.error },
        swapBtn: {
          backgroundColor: COLORS.primary,
          borderRadius: BORDER_RADIUS.xl,
          paddingVertical: SPACING.md + 2,
          alignItems: "center",
          justifyContent: "center",
          flexDirection: "row",
          marginBottom: SPACING.md,
          ...SHADOWS.large,
        },
        swapBtnDisabled: { opacity: 0.4 },
        swapBtnInsufficient: {
          backgroundColor: COLORS.error,
          opacity: 0.85,
        },
        swapBtnText: {
          fontSize: FONTS.sizes.lg,
          fontWeight: "800",
          color: COLORS.background,
          letterSpacing: 0.2,
        },
        poweredBy: {
          flexDirection: "row",
          justifyContent: "center",
          alignItems: "center",
        },
        poweredByText: { fontSize: FONTS.sizes.xs, color: COLORS.textTertiary },
        poweredByBrand: {
          fontSize: FONTS.sizes.xs,
          fontWeight: "700",
          color: COLORS.textSecondary,
        },
      }),
    [theme],
  );

  // ── Balance fetching ─────────────────────────────────────────────────────────
  // Balance of `token` on `chain` (each side of the swap has its own chain)
  const fetchBalance = useCallback(
    async (token, chain, abortRef, setter) => {
      if (abortRef.current) abortRef.current.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      const solana = isSolanaChain(chain);
      const owner = solana ? solanaAddress : wallet?.address;
      if (!token || !owner || !chain) {
        setter("0");
        return;
      }

      try {
        let formatted;

        if (solana) {
          // SOL, or an SPL token by mint (both cached 30s in SolanaService)
          const result = token.isNative
            ? await getSolBalance(owner)
            : await getSplTokenBalance(owner, token.address);
          formatted = result.formatted;
        } else if (token.isNative) {
          // getNativeBalance(address, chain) → { formatted, wei, symbol, decimals }
          const result = await getNativeBalance(owner, chain);
          formatted = result.formatted;
        } else {
          // getTokenBalance(tokenAddress, walletAddress, chain) → { formatted, wei, ... }
          const result = await fetchERC20Balance(token.address, owner, chain);
          formatted = result.formatted;
        }

        if (!controller.signal.aborted) {
          setter(safeFloat(formatted) > 0 ? formatted : "0");
        }
      } catch (err) {
        if (!controller.signal.aborted) {
          console.warn("[SwapScreen] fetchBalance error:", err.message);
          setter("0");
        }
      }
    },
    // Re-runs on account switch (either address)
    [wallet?.address, solanaAddress],
  );

  // Re-fetch sell balance when token changes or wallet/chain context changes
  useEffect(() => {
    fetchBalance(swap.sellToken, activeChain, sellAbortRef, setSellBalance);
  }, [swap.sellToken?.address, activeChain?.id, fetchBalance]);

  // Re-fetch buy balance when token changes or wallet/chain context changes
  useEffect(() => {
    fetchBalance(swap.buyToken, buyChain, buyAbortRef, setBuyBalance);
  }, [swap.buyToken?.address, buyChain?.id, fetchBalance]);

  // ── Debounced price fetch ────────────────────────────────────────────────────
  const debouncedSellAmount = useDebounce(swap.sellAmount, 400);
  useEffect(() => {
    if (safeFloat(debouncedSellAmount) > 0 && swap.sellToken && swap.buyToken) {
      swap.fetchPrice?.();
    }
  }, [
    debouncedSellAmount,
    swap.sellToken?.address,
    swap.buyToken?.address,
    activeChain?.id,
    buyChain?.id,
  ]);

  // ── Preselected buy token (from a token's detail page) ───────────────────────
  const presetBuy = route.params?.presetBuy;
  useEffect(() => {
    if (!presetBuy) return;
    navigation.setParams({ presetBuy: undefined }); // apply once
    // Buy it on its own chain, paying from the chain the user is already on —
    // a cross-chain swap when they differ, so no manual network switch.
    swap.queueBuyToken(presetBuy);
    setBuyChainId(presetBuy.chainId === activeChain?.id ? null : presetBuy.chainId);
  }, [presetBuy]);

  // Solana stays local to this screen; an EVM pick also becomes the app's
  // active chain, same as picking it anywhere else.
  const handleSelectSwapChain = useCallback(
    async (chain) => {
      // Paying on the chain we were receiving on → back to a same-chain swap
      if (chain.id === buyChainId) setBuyChainId(null);
      if (isSolanaChain(chain)) {
        setSolanaSelected(true);
        return;
      }
      await switchChain(chain);
      setSolanaSelected(false);
    },
    [switchChain, buyChainId],
  );

  const handleSelectBuyChain = useCallback(
    (chain) => setBuyChainId(chain.id === activeChain?.id ? null : chain.id),
    [activeChain?.id],
  );

  // Cross-chain flip swaps the chains as well as the tokens
  const handleFlip = useCallback(async () => {
    if (!swap.isCrossChain) return swap.flipTokens();
    const prevSell = activeChain;
    const prevBuy = buyChain;
    swap.queueSellToken(swap.buyToken);
    swap.queueBuyToken(swap.sellToken);
    try {
      await handleSelectSwapChain(prevBuy);
      setBuyChainId(prevSell.id);
    } catch (err) {
      swap.setError(err?.message || "Couldn't switch network");
    }
  }, [swap, activeChain, buyChain, handleSelectSwapChain]);

  const handleTrendingPress = useCallback(
    (token) =>
      navigation.navigate("TokenDetail", { coinId: token.id, preview: token }),
    [navigation],
  );

  // ── Handlers ─────────────────────────────────────────────────────────────────
  const handleSwapPress = useCallback(async () => {
    try {
      const quote = await swap.fetchQuote();
      setCurrentQuote(quote);
      setShowConfirm(true);
    } catch (err) {
      console.error("[SwapScreen] quote error:", err);
    }
  }, [swap.fetchQuote]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    setTrendingRefreshKey((k) => k + 1);
    await swap.loadTokens();
    // Re-fetch both balances after a pull-to-refresh
    fetchBalance(swap.sellToken, activeChain, sellAbortRef, setSellBalance);
    fetchBalance(swap.buyToken, buyChain, buyAbortRef, setBuyBalance);
    setRefreshing(false);
  }, [swap.loadTokens, swap.sellToken, swap.buyToken, activeChain, buyChain, fetchBalance]);

  // The modal stays open on success (it shows the result — and for a
  // cross-chain swap, tracks delivery); the amount is cleared when it closes.
  const swapDoneRef = useRef(false);
  const handleSuccess = useCallback(() => {
    swapDoneRef.current = true;
    // Refresh both balances after a successful swap
    fetchBalance(swap.sellToken, activeChain, sellAbortRef, setSellBalance);
    fetchBalance(swap.buyToken, buyChain, buyAbortRef, setBuyBalance);
  }, [swap.setSellAmount, swap.sellToken, swap.buyToken, activeChain, buyChain, fetchBalance]);

  const handleSellTokenSelect = useCallback(
    (token) => {
      swap.setSellToken(token);
      if (!swap.isCrossChain && swap.buyToken?.address === token.address)
        swap.setBuyToken(null);
      setShowSellSelector(false);
    },
    [swap.buyToken?.address, swap.isCrossChain],
  );

  const handleBuyTokenSelect = useCallback(
    (token) => {
      swap.setBuyToken(token);
      if (!swap.isCrossChain && swap.sellToken?.address === token.address)
        swap.setSellToken(null);
      setShowBuySelector(false);
    },
    [swap.sellToken?.address, swap.isCrossChain],
  );

  const handleMaxPress = useCallback(
    () => swap.setMaxAmount(sellBalance),
    [sellBalance, swap.setMaxAmount],
  );

  // ── Derived values ───────────────────────────────────────────────────────────
  const exchangeRate = useMemo(
    () => swap.getExchangeRate(),
    [
      swap.sellAmount,
      swap.buyAmountEstimate,
      swap.sellToken?.symbol,
      swap.buyToken?.symbol,
    ],
  );

  const priceImpact = useMemo(() => swap.getPriceImpact(), [swap.priceInfo]);
  const routeInfo = useMemo(() => swap.getRouteInfo(), [swap.priceInfo]);

  const sellUsdPrice = useMemo(
    () => swap.getSellUsdPrice(),
    [swap.sellToken, swap.priceInfo],
  );
  const buyUsdPrice = useMemo(
    () => swap.getBuyUsdPrice(),
    [swap.buyToken, swap.priceInfo],
  );

  const impactColor = !priceImpact
    ? COLORS.textSecondary
    : priceImpact.severity === "low"
      ? COLORS.success
      : priceImpact.severity === "medium"
        ? COLORS.warning
        : COLORS.error;

  const isInsufficientBalance = useMemo(() => {
    const amount = safeFloat(swap.sellAmount);
    const balance = safeFloat(sellBalance);
    return amount > 0 && amount > balance;
  }, [swap.sellAmount, sellBalance]);

  const swapBtnLabel = useMemo(() => {
    if (!swap.sellToken || !swap.buyToken) return "Select Tokens";
    if (safeFloat(swap.sellAmount) === 0) return "Enter Amount";
    if (isInsufficientBalance)
      return `Insufficient ${swap.sellToken.symbol} Balance`;
    if (swap.error) return "Invalid Swap";
    return "Swap";
  }, [
    swap.sellToken,
    swap.buyToken,
    swap.sellAmount,
    swap.error,
    isInsufficientBalance,
  ]);

  const showPriceInfo = !!(swap.priceInfo || swap.isFetchingPrice);
  const swapDisabled =
    !swap.isReadyToSwap || swap.isFetchingQuote || isInsufficientBalance;

  return (
    <SafeAreaView style={styles.safeArea} edges={["left", "right"]}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        removeClippedSubviews
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={COLORS.primary}
          />
        }
      >
        {/* ── Header ── */}
        <View style={styles.header}>
          <View>
            <Text style={styles.headerTitle}>Swap</Text>
            <Text style={styles.headerSubtitle}>
              {swap.isCrossChain
                ? `${activeChain?.name} → ${buyChain?.name}`
                : activeChain?.name}
            </Text>
          </View>
          <View style={styles.headerActions}>
            <ChainSelectorButton
              chain={activeChain}
              onPress={() => setShowChainSwitcher(true)}
            />
            <TouchableOpacity
              style={[
                styles.settingsBtn,
                showSettings && styles.settingsBtnActive,
              ]}
              onPress={() => setShowSettings((v) => !v)}
            >
              <Ionicons
                name={showSettings ? "settings" : "settings-outline"}
                size={20}
                color={showSettings ? COLORS.primary : COLORS.textSecondary}
              />
            </TouchableOpacity>
          </View>
        </View>

        {/* ── Slippage Settings ── */}
        {showSettings && (
          <SlippageSelector
            slippage={swap.slippage}
            onSelect={swap.setSlippage}
            theme={theme}
          />
        )}

        {/* ── Swap Card ── */}
        <View style={styles.swapCard}>
          <TokenInputBox
            label="You Pay"
            token={swap.sellToken}
            amount={swap.sellAmount}
            onAmountChange={swap.setSellAmount}
            onTokenPress={() => setShowSellSelector(true)}
            isReadOnly={false}
            isFetching={false}
            balance={sellBalance}
            usdPrice={sellUsdPrice}
            onMaxPress={handleMaxPress}
            chain={activeChain}
            theme={theme}
          />

          <View style={styles.flipRow}>
            <View style={styles.divider} />
            <TouchableOpacity
              style={styles.flipBtn}
              onPress={handleFlip}
              activeOpacity={0.75}
            >
              <Ionicons name="swap-vertical" size={18} color={COLORS.primary} />
            </TouchableOpacity>
            <View style={styles.divider} />
          </View>

          <TokenInputBox
            label="You Receive"
            token={swap.buyToken}
            amount={swap.buyAmountEstimate}
            onAmountChange={() => {}}
            onTokenPress={() => setShowBuySelector(true)}
            isReadOnly={true}
            isFetching={swap.isFetchingPrice}
            balance={buyBalance}
            usdPrice={buyUsdPrice}
            chain={buyChain}
            theme={theme}
          />
        </View>

        {/* ── Price Info ── */}
        {showPriceInfo && (
          <PriceInfo
            isFetchingPrice={swap.isFetchingPrice}
            exchangeRate={exchangeRate}
            priceImpact={priceImpact}
            slippage={swap.slippage}
            impactColor={impactColor}
            provider={provider}
            routeInfo={routeInfo}
            theme={theme}
          />
        )}

        {/* ── Error Banner ── */}
        {swap.error && (
          <View style={styles.errorBanner}>
            <Ionicons
              name="alert-circle-outline"
              size={15}
              color={COLORS.error}
            />
            <Text style={styles.errorText}>{swap.error}</Text>
            <TouchableOpacity
              onPress={() => swap.setError(null)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="close" size={15} color={COLORS.error} />
            </TouchableOpacity>
          </View>
        )}

        {/* ── Swap Button ── */}
        <TouchableOpacity
          style={[
            styles.swapBtn,
            isInsufficientBalance
              ? styles.swapBtnInsufficient
              : swapDisabled && styles.swapBtnDisabled,
          ]}
          onPress={handleSwapPress}
          disabled={swapDisabled}
          activeOpacity={0.85}
        >
          {swap.isFetchingQuote ? (
            <ActivityIndicator color={COLORS.background} />
          ) : (
            <>
              <Text style={styles.swapBtnText}>{swapBtnLabel}</Text>
              {swap.isReadyToSwap && !isInsufficientBalance && (
                <Ionicons
                  name="arrow-forward"
                  size={18}
                  color={COLORS.background}
                  style={{ marginLeft: SPACING.sm }}
                />
              )}
            </>
          )}
        </TouchableOpacity>

        {/* ── Powered By ── */}
        <View style={styles.poweredBy}>
          <Text style={styles.poweredByText}>Powered by </Text>
          <Text style={styles.poweredByBrand}>{provider}</Text>
        </View>

        {/* ── Trending across chains ── */}
        <TrendingTokens
          onTokenPress={handleTrendingPress}
          refreshKey={trendingRefreshKey}
        />
      </ScrollView>

      {/* ── Modals — only mounted when needed ── */}
      {showSellSelector && (
        <TokenSelectorModal
          visible
          onClose={() => setShowSellSelector(false)}
          onSelect={handleSellTokenSelect}
          tokens={swap.tokenList}
          selectedToken={swap.sellToken}
          excludeToken={swap.buyToken}
          networks={swapNetworks}
          selectedChainId={activeChain?.id}
          onChainChange={(c) =>
            handleSelectSwapChain(c).catch((err) =>
              swap.setError(err?.message || "Couldn't switch network"),
            )
          }
          loading={swap.loadingTokens}
          title="You Pay"
        />
      )}

      {showBuySelector && (
        <TokenSelectorModal
          visible
          onClose={() => setShowBuySelector(false)}
          onSelect={handleBuyTokenSelect}
          tokens={swap.buyTokenList}
          selectedToken={swap.buyToken}
          excludeToken={swap.sellToken}
          networks={swapNetworks}
          selectedChainId={buyChain?.id}
          onChainChange={handleSelectBuyChain}
          loading={swap.isCrossChain ? swap.loadingBuyTokens : swap.loadingTokens}
          title="You Receive"
        />
      )}

      {currentQuote && (
        <SwapConfirmModal
          visible={showConfirm}
          onClose={() => {
            setShowConfirm(false);
            setCurrentQuote(null);
            if (swapDoneRef.current) swap.setSellAmount("");
            swapDoneRef.current = false;
          }}
          onSuccess={handleSuccess}
          quote={currentQuote}
          sellToken={swap.sellToken}
          buyToken={swap.buyToken}
          sellAmount={swap.sellAmount}
          buyAmountEstimate={swap.buyAmountEstimate}
          chain={activeChain}
          buyChain={buyChain}
        />
      )}

      <ChainSwitcher
        visible={showChainSwitcher}
        onClose={() => setShowChainSwitcher(false)}
        chains={swapNetworks}
        selectedChain={activeChain}
        onSelect={handleSelectSwapChain}
      />
    </SafeAreaView>
  );
}
