// screens/swap/AdvancedSwapScreen.js
// ─────────────────────────────────────────────────────────────────────────────
// Advanced Swap — a CEX-style trading view on top of the ordinary swap.
//
//   [ pair header: BONK / SOL ▾        chain ▾ ]
//   [ timeframe · Pair | Side by side           ]
//   [ candle chart                               ]
//   [ Buy / Sell order panel   ← useSwap (0x / Jupiter / LI.FI) ]
//   [ market stats: mcap · FDV · holders · liquidity · risk ]
//
// A pair is base/quote: the chart prices the base in the quote. It opens on
// the active chain's native coin vs USD (USDC). Any two tokens work — same
// chain or not: BONK/SOL, SOL/ETH… the backend builds the relative candles
// from each token's USD series, and "Side by side" shows those two series
// next to each other. "Buy" pays with the quote and receives the base; "Sell"
// the reverse — executed exactly like the Swap tab (same hook, same confirm
// modal), cross-chain included, so nothing here is a separate trading engine.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Image,
  ActivityIndicator,
  Modal,
  RefreshControl,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "../../contexts/ThemeContext";
import { useWallet } from "../../contexts/WalletContext";
import { useChain, isSolanaChain } from "../../contexts/ChainContext";
import { useSwap } from "../../hooks/useSwap";
import usePairMarket from "../../hooks/usePairMarket";
import { formatPairPrice } from "../../components/market/CandleChart";
import TVCandleChart from "../../components/market/TVCandleChart";
import ChainSwitcher, { ChainSelectorButton } from "../../components/wallet/ChainSwitcher";
import { TokenSelectorModal } from "../../components/swap/TokenSelectorModal";
import { SwapConfirmModal } from "../../components/swap/SwapConfirmModal";
import TrendingTokens from "../../components/swap/TrendingTokens";
import MarketDisclaimer from "../../components/market/MarketDisclaimer";
import { apiGet } from "../../services/apiClient";
import { API_CONFIG } from "../../config/api";
import { TTL } from "../../utils/cache/DataCache";
import { formatCompact, formatCompactUsd, formatPct, formatPrice } from "../../utils/marketFormat";
import {
  getTokenBalance as fetchERC20Balance,
  getNativeBalance,
} from "../../utils/blockchain/Balances";
import { getSolBalance, getSplTokenBalance } from "../../utils/SolanaService";
import Alert from "../../utils/Alert";

const EVM_NATIVE = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";
const TIMEFRAMES = ["15m", "1h", "4h", "1d"];
const STABLE_SYMBOLS = ["USDC", "USDT", "USDG", "USDbC", "DAI"];
const USD_QUOTE = { usd: true };

// ─── Helpers ──────────────────────────────────────────────────────────────────

const safeFloat = (v) => {
  const n = parseFloat(v);
  return isNaN(n) ? 0 : n;
};

const sameToken = (a, b) =>
  !!a &&
  !!b &&
  (a.isNative && b.isNative
    ? true
    : !a.isNative && !b.isNative && a.address?.toLowerCase() === b.address?.toLowerCase());

const nativeSide = (chain) => ({
  chain,
  token: {
    symbol: chain.symbol,
    name: chain.nativeTokenName || chain.name,
    isNative: true,
    address: isSolanaChain(chain) ? chain.nativeMint : EVM_NATIVE,
    decimals: chain.decimals ?? 18,
    logoURI: chain.icon,
    chainId: chain.id,
  },
});

const sideLabel = (side) => (side?.usd ? "USD" : side?.token?.symbol ?? "—");

const balanceOf = async (token, chain, evmAddress, solanaAddress) => {
  if (!token || !chain) return "0";
  if (isSolanaChain(chain)) {
    if (!solanaAddress) return "0";
    const r = token.isNative
      ? await getSolBalance(solanaAddress)
      : await getSplTokenBalance(solanaAddress, token.address);
    return r.formatted;
  }
  if (!evmAddress) return "0";
  const r = token.isNative
    ? await getNativeBalance(evmAddress, chain)
    : await fetchERC20Balance(token.address, evmAddress, chain);
  return r.formatted;
};

// 24h change of a candle series: last close vs the close ~24h earlier
const change24h = (candles) => {
  if (!candles?.length) return null;
  const last = candles[candles.length - 1];
  const target = last.t - 86400;
  let ref = null;
  for (const k of candles) {
    if (k.t <= target) ref = k;
    else break;
  }
  ref = ref ?? candles[0];
  return ref?.c ? ((last.c - ref.c) / ref.c) * 100 : null;
};

// ─── Screen ───────────────────────────────────────────────────────────────────
export default function AdvancedSwapScreen() {
  const theme = useTheme();
  const { COLORS } = theme;
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const { address: evmAddress, solanaAddress } = useWallet();
  const { activeChain: contextChain, switchChain, networks } = useChain();

  const tradeNetworks = useMemo(
    () => networks.filter((c) => !c.testnet || __DEV__),
    [networks],
  );

  // ── Pair ────────────────────────────────────────────────────────────────────
  // Opens on the active chain's native coin vs USD (USDC)
  const [base, setBase] = useState(() => nativeSide(contextChain));
  const [quote, setQuote] = useState(USD_QUOTE);
  const [tf, setTf] = useState("1h");
  const [view, setView] = useState("pair"); // pair | compare
  const [statsSide, setStatsSide] = useState("base");
  const [mode, setMode] = useState("buy"); // buy = pay quote, get base

  const [showMarkets, setShowMarkets] = useState(false);
  const [showChains, setShowChains] = useState(false);
  const [picker, setPicker] = useState(null); // null | "base" | "quote"
  const [pickerChainId, setPickerChainId] = useState(null);
  const [catalogs, setCatalogs] = useState({});
  const [refreshing, setRefreshing] = useState(false);

  const market = usePairMarket(base, quote, tf, { compare: view === "compare" });

  // ── Catalogs (cached 10 min — same as Swap) ─────────────────────────────────
  const ensureCatalog = useCallback(
    (chainId) => {
      if (chainId == null || catalogs[chainId]) return;
      setCatalogs((prev) => ({ ...prev, [chainId]: { loading: true, tokens: [] } }));
      apiGet(API_CONFIG.ENDPOINTS.SWAP_TOKENS, {
        params: { chainId },
        ttl: TTL.API_TOKEN_CATALOG,
      })
        .then((json) =>
          setCatalogs((prev) => ({ ...prev, [chainId]: { loading: false, tokens: json.data?.tokens ?? [] } })),
        )
        .catch(() => setCatalogs((prev) => ({ ...prev, [chainId]: { loading: false, tokens: [] } })));
    },
    [catalogs],
  );

  useEffect(() => ensureCatalog(base.chain.id), [base.chain.id]);
  useEffect(() => {
    if (pickerChainId != null) ensureCatalog(pickerChainId);
  }, [pickerChainId]);

  // A "USD" quote trades through the base chain's stablecoin
  const tradeQuote = useMemo(() => {
    if (!quote.usd) return quote;
    const list = catalogs[base.chain.id]?.tokens ?? [];
    for (const sym of STABLE_SYMBOLS) {
      const t = list.find((x) => x.symbol?.toUpperCase() === sym.toUpperCase());
      if (t) return { chain: base.chain, token: t };
    }
    return null;
  }, [quote, base.chain, catalogs]);

  // Tokens picked from Markets may lack decimals — the stats endpoint has them
  const baseWithDecimals = useMemo(
    () =>
      base.token.decimals != null || market.stats.base?.decimals == null
        ? base
        : { ...base, token: { ...base.token, decimals: market.stats.base.decimals } },
    [base, market.stats.base?.decimals],
  );

  const paySide = mode === "buy" ? tradeQuote : baseWithDecimals;
  const getSide = mode === "buy" ? baseWithDecimals : tradeQuote;

  // ── Swap engine (shared with the Swap tab) ──────────────────────────────────
  const swap = useSwap(paySide?.chain, getSide?.chain);

  // Keep useSwap's tokens pinned to this pair (it picks defaults when a
  // chain's catalog loads; this puts the pair's tokens back)
  useEffect(() => {
    if (!paySide?.token || swap.sellChain?.id !== paySide.chain.id || swap.loadingTokens) return;
    if (!sameToken(swap.sellToken, paySide.token)) {
      swap.setSellToken(swap.tokenList.find((t) => sameToken(t, paySide.token)) ?? paySide.token);
    }
  }, [paySide, swap.sellToken, swap.tokenList, swap.loadingTokens, swap.sellChain?.id]);
  useEffect(() => {
    if (!getSide?.token || swap.buyChain?.id !== getSide.chain.id) return;
    if (swap.isCrossChain ? swap.loadingBuyTokens : swap.loadingTokens) return;
    if (!sameToken(swap.buyToken, getSide.token)) {
      swap.setBuyToken(swap.buyTokenList.find((t) => sameToken(t, getSide.token)) ?? getSide.token);
    }
  }, [getSide, swap.buyToken, swap.buyTokenList, swap.loadingTokens, swap.loadingBuyTokens, swap.buyChain?.id]);

  // Debounced price as the amount changes
  useEffect(() => {
    if (safeFloat(swap.sellAmount) <= 0 || !swap.sellToken || !swap.buyToken) return;
    const t = setTimeout(() => swap.fetchPrice(), 450);
    return () => clearTimeout(t);
  }, [swap.sellAmount, swap.sellToken?.address, swap.buyToken?.address, paySide?.chain?.id, getSide?.chain?.id]);

  // Pay-side balance
  const [payBalance, setPayBalance] = useState("0");
  useEffect(() => {
    let cancelled = false;
    balanceOf(paySide?.token, paySide?.chain, evmAddress, solanaAddress)
      .then((b) => !cancelled && setPayBalance(safeFloat(b) > 0 ? b : "0"))
      .catch(() => !cancelled && setPayBalance("0"));
    return () => {
      cancelled = true;
    };
  }, [paySide?.token?.address, paySide?.chain?.id, evmAddress, solanaAddress]);

  // ── Confirm flow ────────────────────────────────────────────────────────────
  const [confirmQuote, setConfirmQuote] = useState(null);
  const handleTrade = useCallback(async () => {
    try {
      // The EVM signer is bound to the app's active chain
      if (!isSolanaChain(paySide.chain) && paySide.chain.id !== contextChain?.id) {
        await switchChain(paySide.chain);
      }
      const q = await swap.fetchQuote();
      if (q) setConfirmQuote(q);
    } catch (err) {
      if (err?.message) swap.setError(err.message);
    }
  }, [paySide, contextChain?.id, switchChain, swap]);

  // The confirm modal stays up to show the result (and track cross-chain
  // delivery); the amount is cleared once it's closed.
  const tradeDoneRef = useRef(false);
  const handleTradeSuccess = useCallback(() => {
    tradeDoneRef.current = true;
    balanceOf(paySide?.token, paySide?.chain, evmAddress, solanaAddress)
      .then((b) => setPayBalance(b))
      .catch(() => {});
  }, [swap, paySide, evmAddress, solanaAddress]);

  // ── Pair changes ────────────────────────────────────────────────────────────
  const resetOrder = () => {
    swap.setSellAmount("");
    swap.setError(null);
  };

  const selectChain = useCallback((chain) => {
    setBase(nativeSide(chain));
    setQuote(USD_QUOTE);
    setStatsSide("base");
    resetOrder();
  }, []);

  // Trending token → base. Prefer a deployment on the quote's chain (cheapest
  // trade), then the current base chain, then anywhere supported.
  const selectFromMarkets = useCallback(
    (token) => {
      const deployments = (token.chains || [])
        .map((d) => ({ ...d, chain: tradeNetworks.find((c) => c.id === d.chainId) }))
        .filter((d) => d.chain);
      const preferred =
        deployments.find((d) => !quote.usd && d.chainId === quote.chain.id) ||
        deployments.find((d) => d.chainId === base.chain.id) ||
        deployments[0];
      if (!preferred) {
        Alert.alert("Not available", `${token.symbol} isn't on a network Rizon supports yet.`);
        return;
      }
      const side = preferred.isNative
        ? nativeSide(preferred.chain)
        : {
            chain: preferred.chain,
            token: {
              address: preferred.address,
              isNative: false,
              decimals: preferred.decimals ?? null,
              symbol: token.symbol?.toUpperCase(),
              name: token.name,
              logoURI: token.image,
              chainId: preferred.chain.id,
            },
          };
      if (!quote.usd && sameToken(side.token, quote.token) && side.chain.id === quote.chain.id) {
        setQuote(USD_QUOTE);
      }
      setBase(side);
      setStatsSide("base");
      setShowMarkets(false);
      resetOrder();
    },
    [tradeNetworks, quote, base.chain.id],
  );

  const openPicker = (which) => {
    setShowMarkets(false);
    const side = which === "base" ? base : quote.usd ? base : quote;
    setPickerChainId(side.chain.id);
    setPicker(which);
  };

  const handlePicked = (token) => {
    const chain = tradeNetworks.find((c) => c.id === pickerChainId);
    const side = { chain, token: { ...token, chainId: chain.id } };
    if (picker === "base") setBase(side);
    else setQuote(side);
    setPicker(null);
    resetOrder();
  };

  const flipPair = () => {
    if (quote.usd) return;
    setBase(quote);
    setQuote(base);
    resetOrder();
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await market.reload();
    setRefreshing(false);
  };

  // ── Derived display values ──────────────────────────────────────────────────
  const candles = market.pair?.candles ?? [];
  const quoteIsUsd = !!market.pair?.quoteIsUsd || quote.usd;
  const lastPrice = candles.length ? candles[candles.length - 1].c : null;
  const pairChange = quote.usd
    ? market.stats.base?.priceChange?.h24 ?? change24h(candles)
    : change24h(candles);
  const pairLabel = `${sideLabel(base)}/${sideLabel(quote)}`;
  const crossChainPair = !quote.usd && quote.chain.id !== base.chain.id;
  // What's plotted — a change makes the chart jump to the latest bars;
  // the 30s refresh (same key) keeps the user's scroll/zoom
  const seriesKey = `${base.chain.id}:${base.token.address}/${
    quote.usd ? "usd" : `${quote.chain.id}:${quote.token.address}`
  }:${tf}`;

  const amountNum = safeFloat(swap.sellAmount);
  const insufficient = amountNum > safeFloat(payBalance);
  const routeInfo = swap.getRouteInfo();
  const provider = swap.isCrossChain ? "LI.FI" : isSolanaChain(paySide?.chain) ? "Jupiter" : "0x";

  const tradeLabel = !tradeQuote
    ? "No stablecoin on this network"
    : amountNum <= 0
      ? "Enter amount"
      : insufficient
        ? `Insufficient ${paySide?.token?.symbol}`
        : swap.error
          ? "Can't trade this right now"
          : `${mode === "buy" ? "Buy" : "Sell"} ${base.token.symbol}`;
  const tradeDisabled =
    !tradeQuote || !swap.isReadyToSwap || swap.isFetchingQuote || insufficient;

  const setPercent = (pct) => {
    if (pct === 100) return swap.setMaxAmount(payBalance);
    const v = safeFloat(payBalance) * (pct / 100);
    swap.setSellAmount(v > 0 ? String(parseFloat(v.toFixed(6))) : "");
  };

  const stats = statsSide === "base" ? market.stats.base : market.stats.quote;
  const statsToken = statsSide === "base" ? base : quote;

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} />
        }
      >
        {/* ── Pair header ── */}
        <View style={styles.header}>
          <TouchableOpacity style={styles.pairBtn} onPress={() => setShowMarkets(true)} activeOpacity={0.8}>
            <View style={styles.pairLogos}>
              <TokenIcon uri={base.token.logoURI} symbol={base.token.symbol} size={30} styles={styles} />
              {!quote.usd && (
                <View style={styles.pairLogoBack}>
                  <TokenIcon uri={quote.token.logoURI} symbol={quote.token.symbol} size={22} styles={styles} />
                </View>
              )}
            </View>
            <View>
              <View style={styles.pairTitleRow}>
                <Text style={styles.pairTitle}>{pairLabel}</Text>
                <Ionicons name="chevron-down" size={16} color={COLORS.textSecondary} />
              </View>
              <Text style={styles.pairSub} numberOfLines={1}>
                {crossChainPair
                  ? `${base.chain.name} · ${quote.chain.name}`
                  : base.chain.name}
                {market.pair?.synthetic ? " · relative" : ""}
              </Text>
            </View>
          </TouchableOpacity>
          <ChainSelectorButton chain={base.chain} onPress={() => setShowChains(true)} compact />
        </View>

        <View style={styles.priceRow}>
          <Text style={styles.price}>
            {lastPrice != null ? formatPairPrice(lastPrice, quoteIsUsd) : "—"}
            {!quoteIsUsd && lastPrice != null ? (
              <Text style={styles.priceUnit}> {sideLabel(quote)}</Text>
            ) : null}
          </Text>
          {pairChange != null && (
            <View
              style={[
                styles.changePill,
                { backgroundColor: `${pairChange >= 0 ? COLORS.success : COLORS.error}1F` },
              ]}
            >
              <Text style={{ color: pairChange >= 0 ? COLORS.success : COLORS.error, fontWeight: "800", fontSize: 13 }}>
                {formatPct(pairChange)}
              </Text>
            </View>
          )}
          {!quote.usd && (
            <TouchableOpacity onPress={flipPair} style={styles.iconBtn} accessibilityLabel="Invert pair">
              <Ionicons name="swap-horizontal" size={16} color={COLORS.textSecondary} />
            </TouchableOpacity>
          )}
        </View>

        {/* ── Chart controls ── */}
        <View style={styles.controls}>
          <View style={styles.segment}>
            {TIMEFRAMES.map((k) => (
              <TouchableOpacity key={k} onPress={() => setTf(k)} style={[styles.segBtn, tf === k && styles.segBtnOn]}>
                <Text style={[styles.segText, tf === k && styles.segTextOn]}>{k}</Text>
              </TouchableOpacity>
            ))}
          </View>
          {!quote.usd && (
            <View style={styles.segment}>
              {[
                ["pair", "Pair"],
                ["compare", "Side by side"],
              ].map(([k, label]) => (
                <TouchableOpacity key={k} onPress={() => setView(k)} style={[styles.segBtn, view === k && styles.segBtnOn]}>
                  <Text style={[styles.segText, view === k && styles.segTextOn]}>{label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>

        {/* ── Chart ── */}
        <View style={styles.chartCard}>
          {market.loading && !candles.length ? (
            <View style={styles.chartPlaceholder}>
              <ActivityIndicator color={COLORS.primary} />
            </View>
          ) : market.error && !candles.length ? (
            <View style={styles.chartPlaceholder}>
              <Ionicons name="analytics-outline" size={26} color={COLORS.textTertiary} />
              <Text style={styles.muted}>{market.error}</Text>
            </View>
          ) : view === "compare" && !quote.usd ? (
            <View style={styles.compareRow}>
              {[
                [base, market.legs.base],
                [quote, market.legs.quote],
              ].map(([side, leg], i) => {
                const legCandles = leg?.candles ?? [];
                const ch = change24h(legCandles);
                return (
                  <View key={i} style={styles.compareCol}>
                    <Text style={styles.compareTitle}>{side.token.symbol}/USD</Text>
                    <Text style={styles.compareSub}>
                      {legCandles.length ? formatPrice(legCandles[legCandles.length - 1].c) : "—"}
                      {ch != null ? (
                        <Text style={{ color: ch >= 0 ? COLORS.success : COLORS.error }}> {formatPct(ch)}</Text>
                      ) : null}
                    </Text>
                    {legCandles.length ? (
                      <TVCandleChart
                        candles={legCandles}
                        height={170}
                        tf={tf}
                        compact
                        seriesKey={`${seriesKey}:leg${i}`}
                      />
                    ) : (
                      <View style={[styles.chartPlaceholder, { height: 170 }]}>
                        <ActivityIndicator color={COLORS.primary} />
                      </View>
                    )}
                  </View>
                );
              })}
            </View>
          ) : (
            <TVCandleChart
              candles={candles}
              height={280}
              tf={tf}
              quoteIsUsd={quoteIsUsd}
              seriesKey={seriesKey}
            />
          )}
        </View>

        {/* ── Order panel ── */}
        <View style={styles.orderCard}>
          <View style={styles.modeRow}>
            {["buy", "sell"].map((m) => (
              <TouchableOpacity
                key={m}
                onPress={() => {
                  setMode(m);
                  resetOrder();
                }}
                style={[
                  styles.modeBtn,
                  mode === m && { backgroundColor: m === "buy" ? COLORS.success : COLORS.error },
                ]}
              >
                <Text style={[styles.modeText, mode === m && { color: "#fff" }]}>
                  {m === "buy" ? "Buy" : "Sell"} {base.token.symbol}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={styles.inputRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.inputLabel}>You pay</Text>
              <TextInput
                value={swap.sellAmount}
                onChangeText={swap.setSellAmount}
                placeholder="0.0"
                placeholderTextColor={COLORS.textTertiary}
                keyboardType="decimal-pad"
                style={styles.input}
                editable={!!tradeQuote}
              />
            </View>
            <View style={styles.payToken}>
              <Text style={styles.payTokenText}>{paySide?.token?.symbol ?? "—"}</Text>
              <Text style={styles.payTokenSub}>on {paySide?.chain?.name?.replace(" Chain", "") ?? "—"}</Text>
            </View>
          </View>

          <View style={styles.pctRow}>
            <Text style={styles.muted}>
              Balance {safeFloat(payBalance).toLocaleString(undefined, { maximumFractionDigits: 6 })}
            </Text>
            <View style={{ flexDirection: "row", gap: 6 }}>
              {[25, 50, 75, 100].map((p) => (
                <TouchableOpacity key={p} onPress={() => setPercent(p)} style={styles.pctBtn}>
                  <Text style={styles.pctText}>{p === 100 ? "Max" : `${p}%`}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View style={styles.receiveRow}>
            <Text style={styles.muted}>You receive ≈</Text>
            {swap.isFetchingPrice ? (
              <ActivityIndicator size="small" color={COLORS.primary} />
            ) : (
              <Text style={styles.receiveText}>
                {swap.buyAmountEstimate || "0"} {getSide?.token?.symbol ?? ""}
              </Text>
            )}
          </View>
          {(routeInfo || swap.priceInfo) && (
            <Text style={styles.routeText}>
              {routeInfo
                ? `Cross-chain via ${routeInfo.via}${routeInfo.eta ? ` · ~${Math.max(1, Math.ceil(routeInfo.eta / 60))} min` : ""}`
                : `Best route via ${provider}`}
              {` · slippage ${(swap.slippage * 100).toFixed(1)}%`}
            </Text>
          )}
          {!!swap.error && <Text style={styles.errorText}>{swap.error}</Text>}

          <TouchableOpacity
            style={[
              styles.tradeBtn,
              { backgroundColor: mode === "buy" ? COLORS.success : COLORS.error },
              tradeDisabled && { opacity: 0.45 },
            ]}
            onPress={handleTrade}
            disabled={tradeDisabled}
            activeOpacity={0.85}
          >
            {swap.isFetchingQuote ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.tradeText}>{tradeLabel}</Text>
            )}
          </TouchableOpacity>
        </View>

        {/* ── Market stats ── */}
        <View style={styles.statsCard}>
          <View style={styles.statsHeader}>
            <Text style={styles.sectionTitle}>Market stats</Text>
            {!quote.usd && (
              <View style={styles.segment}>
                {[
                  ["base", base.token.symbol],
                  ["quote", quote.token.symbol],
                ].map(([k, label]) => (
                  <TouchableOpacity key={k} onPress={() => setStatsSide(k)} style={[styles.segBtn, statsSide === k && styles.segBtnOn]}>
                    <Text style={[styles.segText, statsSide === k && styles.segTextOn]}>{label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>
          <MarketStats stats={stats} token={statsToken.token} loading={market.loading} styles={styles} COLORS={COLORS} />
        </View>

        <MarketDisclaimer />
      </ScrollView>

      {/* ── Markets sheet ── */}
      <Modal visible={showMarkets} animationType="slide" onRequestClose={() => setShowMarkets(false)}>
        <View style={[styles.sheet, { paddingTop: insets.top + 8 }]}>
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>Markets</Text>
            <TouchableOpacity onPress={() => setShowMarkets(false)} style={styles.iconBtn}>
              <Ionicons name="close" size={20} color={COLORS.text} />
            </TouchableOpacity>
          </View>
          <View style={styles.sheetActions}>
            <TouchableOpacity style={styles.sheetAction} onPress={() => openPicker("base")}>
              <Ionicons name="search" size={15} color={COLORS.text} />
              <Text style={styles.sheetActionText}>Find token</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.sheetAction} onPress={() => openPicker("quote")}>
              <Ionicons name="git-compare-outline" size={15} color={COLORS.text} />
              <Text style={styles.sheetActionText}>Quote: {sideLabel(quote)}</Text>
            </TouchableOpacity>
            {!quote.usd && (
              <TouchableOpacity
                style={styles.sheetAction}
                onPress={() => {
                  setQuote(USD_QUOTE);
                  setShowMarkets(false);
                }}
              >
                <Text style={styles.sheetActionText}>vs USD</Text>
              </TouchableOpacity>
            )}
          </View>
          <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 48 }}>
            <TrendingTokens onTokenPress={selectFromMarkets} hideHeader />
          </ScrollView>
        </View>
      </Modal>

      {picker && (
        <TokenSelectorModal
          visible
          onClose={() => setPicker(null)}
          onSelect={handlePicked}
          tokens={catalogs[pickerChainId]?.tokens ?? []}
          loading={!!catalogs[pickerChainId]?.loading}
          selectedToken={picker === "base" ? base.token : quote.usd ? null : quote.token}
          excludeToken={picker === "base" ? (quote.usd ? null : quote.token) : base.token}
          networks={tradeNetworks}
          selectedChainId={pickerChainId}
          onChainChange={(c) => setPickerChainId(c.id)}
          title={picker === "base" ? "Chart token" : "Price it in"}
        />
      )}

      <ChainSwitcher
        visible={showChains}
        onClose={() => setShowChains(false)}
        chains={tradeNetworks}
        selectedChain={base.chain}
        onSelect={selectChain}
        title="Market network"
      />

      {confirmQuote && (
        <SwapConfirmModal
          visible
          onClose={() => {
            setConfirmQuote(null);
            if (tradeDoneRef.current) swap.setSellAmount("");
            tradeDoneRef.current = false;
          }}
          onSuccess={handleTradeSuccess}
          quote={confirmQuote}
          sellToken={swap.sellToken}
          buyToken={swap.buyToken}
          sellAmount={swap.sellAmount}
          buyAmountEstimate={swap.buyAmountEstimate}
          chain={paySide?.chain}
          buyChain={getSide?.chain}
        />
      )}
    </View>
  );
}

// ─── Pieces ───────────────────────────────────────────────────────────────────

const TokenIcon = ({ uri, symbol, size, styles }) => {
  const [err, setErr] = useState(false);
  if (!uri || err) {
    return (
      <View style={[styles.iconFallback, { width: size, height: size, borderRadius: size / 2 }]}>
        <Text style={styles.iconFallbackText}>{symbol?.slice(0, 2)}</Text>
      </View>
    );
  }
  return (
    <Image
      source={{ uri, cache: "force-cache" }}
      onError={() => setErr(true)}
      style={{ width: size, height: size, borderRadius: size / 2 }}
    />
  );
};

const StatCell = ({ label, value, styles, color }) => (
  <View style={styles.statCell}>
    <Text style={styles.statLabel}>{label}</Text>
    <Text style={[styles.statValue, color && { color }]} numberOfLines={1}>
      {value ?? "—"}
    </Text>
  </View>
);

const MarketStats = ({ stats, token, loading, styles, COLORS }) => {
  if (!stats) {
    return loading ? (
      <ActivityIndicator color={COLORS.primary} style={{ paddingVertical: 20 }} />
    ) : (
      <Text style={styles.muted}>
        {token?.symbol === "USD" ? "Priced in US dollars." : "No on-chain stats for this token yet."}
      </Text>
    );
  }
  if (stats.stable && !stats.marketCapUsd && !stats.fdvUsd) {
    return <Text style={styles.muted}>{stats.symbol} is a stablecoin pegged to $1.</Text>;
  }

  const top10 = stats.holdersDistribution?.top_10;
  const tx = stats.transactions24h;
  const risk = stats.risk;
  const authority = (v) => (v == null ? null : v === "no" || v === false ? "Renounced" : "Active");
  const riskColor = (v) => (v === "Active" ? COLORS.warning : v === "Renounced" ? COLORS.success : undefined);
  const mint = authority(risk?.mintAuthority);
  const freeze = authority(risk?.freezeAuthority);

  return (
    <>
      <View style={styles.statsGrid}>
        <StatCell styles={styles} label="Price" value={stats.priceUsd != null ? formatPrice(stats.priceUsd) : null} />
        <StatCell
          styles={styles}
          label="24h change"
          value={formatPct(stats.priceChange?.h24)}
          color={stats.priceChange?.h24 >= 0 ? COLORS.success : COLORS.error}
        />
        <StatCell styles={styles} label="Market cap" value={formatCompactUsd(stats.marketCapUsd)} />
        <StatCell styles={styles} label="FDV" value={formatCompactUsd(stats.fdvUsd)} />
        <StatCell styles={styles} label="24h volume" value={formatCompactUsd(stats.volume24hUsd)} />
        <StatCell styles={styles} label="Liquidity" value={formatCompactUsd(stats.liquidityUsd)} />
        {/* Holder data describes a token contract — native coins have none */}
        {!stats.native && (
          <>
            <StatCell
              styles={styles}
              label="Holders"
              value={stats.holders != null ? stats.holders.toLocaleString() : null}
            />
            <StatCell styles={styles} label="Top 10 hold" value={top10 != null ? `${parseFloat(top10).toFixed(1)}%` : null} />
          </>
        )}
        <StatCell styles={styles} label="Total supply" value={formatCompact(stats.totalSupply)} />
        <StatCell
          styles={styles}
          label="24h trades"
          value={tx ? `${formatCompact(tx.buys)} / ${formatCompact(tx.sells)}` : null}
        />
      </View>

      {risk && (
        <View style={styles.riskRow}>
          {mint && <RiskChip label={`Mint: ${mint}`} color={riskColor(mint)} styles={styles} />}
          {freeze && <RiskChip label={`Freeze: ${freeze}`} color={riskColor(freeze)} styles={styles} />}
          {/* "unknown" is common — only show a definite answer */}
          {(risk.honeypot === true || risk.honeypot === "yes") && (
            <RiskChip label="Honeypot risk" color={COLORS.error} styles={styles} />
          )}
          {(risk.honeypot === false || risk.honeypot === "no") && (
            <RiskChip label="No honeypot" color={COLORS.success} styles={styles} />
          )}
          {risk.gtScore != null && <RiskChip label={`GT score ${Math.round(risk.gtScore)}`} styles={styles} />}
          {stats.topPool?.dex && <RiskChip label={`Top pool: ${stats.topPool.dex}`} styles={styles} />}
        </View>
      )}
    </>
  );
};

const RiskChip = ({ label, color, styles }) => (
  <View style={[styles.riskChip, color && { borderColor: `${color}66` }]}>
    <Text style={[styles.riskText, color && { color }]}>{label}</Text>
  </View>
);

// ─── Styles ───────────────────────────────────────────────────────────────────
const makeStyles = ({ COLORS: C, SPACING, FONTS, BORDER_RADIUS }) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: C.background },
    scroll: { padding: SPACING.md, paddingBottom: 120, gap: SPACING.sm },
    header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
    pairBtn: { flexDirection: "row", alignItems: "center", gap: 10, flexShrink: 1 },
    pairLogos: { width: 40, height: 34, justifyContent: "center" },
    pairLogoBack: {
      position: "absolute",
      right: 0,
      bottom: -2,
      borderRadius: 13,
      borderWidth: 2,
      borderColor: C.background,
    },
    pairTitleRow: { flexDirection: "row", alignItems: "center", gap: 4 },
    pairTitle: { fontSize: FONTS.sizes.xl, fontWeight: "800", color: C.text, letterSpacing: -0.4 },
    pairSub: { fontSize: FONTS.sizes.xs, color: C.textSecondary, marginTop: 1 },
    priceRow: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 2 },
    price: { fontSize: 28, fontWeight: "800", color: C.text, fontVariant: ["tabular-nums"], letterSpacing: -0.6 },
    priceUnit: { fontSize: 14, fontWeight: "700", color: C.textSecondary },
    changePill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
    iconBtn: {
      width: 34,
      height: 34,
      borderRadius: 17,
      backgroundColor: C.surface,
      alignItems: "center",
      justifyContent: "center",
      marginLeft: "auto",
    },
    controls: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" },
    segment: {
      flexDirection: "row",
      backgroundColor: C.surface,
      borderRadius: 10,
      padding: 3,
      borderWidth: 1,
      borderColor: C.border,
    },
    segBtn: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 7 },
    segBtnOn: { backgroundColor: C.card ?? C.background },
    segText: { fontSize: 12, fontWeight: "700", color: C.textTertiary },
    segTextOn: { color: C.text },
    chartCard: {
      backgroundColor: C.surface,
      borderRadius: BORDER_RADIUS.xl,
      borderWidth: 1,
      borderColor: C.border,
      padding: SPACING.sm,
    },
    chartPlaceholder: { height: 280, alignItems: "center", justifyContent: "center", gap: 8 },
    compareRow: { flexDirection: "row", gap: SPACING.sm },
    compareCol: { flex: 1, minWidth: 0 },
    compareTitle: { fontSize: 13, fontWeight: "800", color: C.text },
    compareSub: { fontSize: 12, color: C.textSecondary, marginBottom: 6 },
    orderCard: {
      backgroundColor: C.surface,
      borderRadius: BORDER_RADIUS.xl,
      borderWidth: 1,
      borderColor: C.border,
      padding: SPACING.md,
      gap: SPACING.sm,
    },
    modeRow: { flexDirection: "row", gap: 8 },
    modeBtn: {
      flex: 1,
      height: 38,
      borderRadius: 10,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: C.cardElevated ?? C.background,
    },
    modeText: { fontSize: 14, fontWeight: "800", color: C.textSecondary },
    inputRow: { flexDirection: "row", alignItems: "flex-end", gap: 8 },
    inputLabel: { fontSize: 11, fontWeight: "700", color: C.textTertiary, textTransform: "uppercase", letterSpacing: 0.6 },
    input: { fontSize: 26, fontWeight: "700", color: C.text, paddingVertical: 4 },
    payToken: { alignItems: "flex-end", paddingBottom: 6 },
    payTokenText: { fontSize: 16, fontWeight: "800", color: C.text },
    payTokenSub: { fontSize: 11, color: C.textTertiary },
    pctRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
    pctBtn: {
      paddingHorizontal: 9,
      paddingVertical: 4,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: C.border,
    },
    pctText: { fontSize: 11, fontWeight: "700", color: C.textSecondary },
    receiveRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingTop: SPACING.xs,
      borderTopWidth: 1,
      borderTopColor: C.divider ?? C.border,
    },
    receiveText: { fontSize: 15, fontWeight: "800", color: C.text, fontVariant: ["tabular-nums"] },
    routeText: { fontSize: 11, color: C.textTertiary },
    errorText: { fontSize: 12, color: C.error },
    tradeBtn: { height: 50, borderRadius: 25, alignItems: "center", justifyContent: "center", marginTop: 2 },
    tradeText: { fontSize: 16, fontWeight: "800", color: "#fff" },
    statsCard: {
      backgroundColor: C.surface,
      borderRadius: BORDER_RADIUS.xl,
      borderWidth: 1,
      borderColor: C.border,
      padding: SPACING.md,
      gap: SPACING.sm,
    },
    statsHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
    sectionTitle: { fontSize: FONTS.sizes.md, fontWeight: "800", color: C.text },
    statsGrid: { flexDirection: "row", flexWrap: "wrap", rowGap: 12 },
    statCell: { width: "50%", paddingRight: 8 },
    statLabel: { fontSize: 11, color: C.textTertiary, fontWeight: "600" },
    statValue: { fontSize: 15, color: C.text, fontWeight: "700", marginTop: 2, fontVariant: ["tabular-nums"] },
    riskRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, paddingTop: 4 },
    riskChip: {
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: C.border,
    },
    riskText: { fontSize: 11, fontWeight: "700", color: C.textSecondary },
    muted: { fontSize: 12, color: C.textSecondary },
    iconFallback: { backgroundColor: C.primaryMuted, alignItems: "center", justifyContent: "center" },
    iconFallbackText: { fontSize: 10, fontWeight: "800", color: C.text },
    sheet: { flex: 1, backgroundColor: C.background },
    sheetHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 16,
      paddingBottom: 8,
    },
    sheetTitle: { fontSize: 24, fontWeight: "800", color: C.text },
    sheetActions: { flexDirection: "row", gap: 8, paddingHorizontal: 16, flexWrap: "wrap" },
    sheetAction: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      height: 34,
      paddingHorizontal: 12,
      borderRadius: 17,
      backgroundColor: C.surface,
      borderWidth: 1,
      borderColor: C.border,
    },
    sheetActionText: { fontSize: 13, fontWeight: "700", color: C.text },
  });
