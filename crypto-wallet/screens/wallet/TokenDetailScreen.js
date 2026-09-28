// screens/wallet/TokenDetailScreen.js
// Token page for both a wallet holding (opened from Home / Tokens with
// balance params) and a market token (opened from Trending with a coinId).
// All market data comes from our backend's shared CoinGecko cache.
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Linking,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import { useTheme } from "../../contexts/ThemeContext";
import { useChain } from "../../contexts/ChainContext";
import CoinLogo from "../../components/market/CoinLogo";
import PriceChart from "../../components/market/PriceChart";
import {
  getCoin,
  getChart,
  resolveCoinId,
  CHART_PERIODS,
} from "../../services/marketApi";
import {
  formatPrice,
  formatPct,
  formatCompactUsd,
  formatCompact,
  formatChartTime,
} from "../../utils/marketFormat";

const NATIVE_ADDRESS = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";
const PERIOD_LABEL = { 1: "Today", 7: "Past week", 30: "Past month", 90: "Past 3 months", 365: "Past year" };

const shortAddr = (a) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "");

export default function TokenDetailScreen({ route, navigation }) {
  const theme = useTheme();
  const { COLORS } = theme;
  const { activeChain, getChain } = useChain();

  const {
    coinId: coinIdParam,
    preview, // trending row data, shown instantly while details load
    token,
    chain,
    balance,
    usdValue,
    price: priceParam,
    priceChange24h,
    walletAddress,
    chainId: chainIdParam,
  } = route.params || {};

  const holdingChainId = chainIdParam ?? chain?.id ?? null;
  const isHolding = balance != null;

  const [coinId, setCoinId] = useState(coinIdParam ?? null);
  const [coin, setCoin] = useState(null);
  const [coinError, setCoinError] = useState(null);
  const [days, setDays] = useState(7);
  const [prices, setPrices] = useState(null);
  const [chartLoading, setChartLoading] = useState(true);
  const [chartError, setChartError] = useState(false);
  const [scrub, setScrub] = useState(null);
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(null);

  // ── Identity (instant, from params) → replaced by backend data when loaded ──
  const symbol = coin?.symbol ?? preview?.symbol ?? token?.symbol ?? chain?.symbol ?? "";
  const name = coin?.name ?? preview?.name ?? token?.name ?? chain?.name ?? symbol;
  const image = coin?.image ?? preview?.image ?? token?.logoURI ?? chain?.icon;
  const market = coin?.market;
  const livePrice = market?.price ?? preview?.price ?? priceParam ?? null;

  // ── Resolve the CoinGecko id for wallet holdings ────────────────────────────
  useEffect(() => {
    if (coinId) return;
    let cancelled = false;
    resolveCoinId({
      chainId: holdingChainId,
      address: token?.address,
      symbol: token?.symbol ?? chain?.symbol,
    })
      .then((id) => {
        if (cancelled) return;
        if (id) setCoinId(id);
        else {
          setCoinError("Market data isn't available for this token.");
          setChartLoading(false);
        }
      })
      .catch(() => {
        if (cancelled) return;
        setCoinError("Couldn't load market data.");
        setChartLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // ── Details ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!coinId) return;
    let cancelled = false;
    getCoin(coinId)
      .then((c) => !cancelled && setCoin(c))
      .catch((err) => !cancelled && setCoinError(err?.message || "Couldn't load market data."));
    return () => {
      cancelled = true;
    };
  }, [coinId]);

  // ── Chart (per period) ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!coinId) return;
    let cancelled = false;
    setChartLoading(true);
    setChartError(false);
    getChart(coinId, days)
      .then((p) => !cancelled && setPrices(p))
      .catch(() => !cancelled && setChartError(true))
      .finally(() => !cancelled && setChartLoading(false));
    return () => {
      cancelled = true;
    };
  }, [coinId, days]);

  // ── Derived ─────────────────────────────────────────────────────────────────
  const periodChange = useMemo(() => {
    if (prices?.length >= 2) {
      const first = prices[0][1];
      const last = scrub ? scrub.price : prices[prices.length - 1][1];
      return first ? ((last - first) / first) * 100 : null;
    }
    return days === 1 ? market?.change24h ?? preview?.change24h ?? priceChange24h ?? null : null;
  }, [prices, scrub, days, market, preview, priceChange24h]);

  const up = (periodChange ?? 0) >= 0;
  const trendColor = up ? COLORS.success : COLORS.error;
  const shownPrice = scrub ? scrub.price : livePrice;

  // Supported chains this token lives on, for "Available on" and the Swap CTA
  const deployments = useMemo(() => {
    const list = coin?.platforms ?? preview?.chains ?? [];
    return list
      .map((p) => ({ ...p, chain: getChain(p.chainId) }))
      .filter((p) => p.chain && (__DEV__ || !p.chain.testnet));
  }, [coin, preview, getChain]);

  const swapTarget = useMemo(() => {
    if (isHolding && holdingChainId) {
      return {
        chainId: holdingChainId,
        address: token?.address ?? null,
        isNative: !token?.address,
        decimals: token?.decimals ?? 18,
      };
    }
    // Prefer the network the user is already on, to avoid a chain switch
    return (
      deployments.find((d) => d.chainId === activeChain?.id) ?? deployments[0] ?? null
    );
  }, [isHolding, holdingChainId, token, deployments, activeChain?.id]);

  // ── Actions ─────────────────────────────────────────────────────────────────
  const goSwap = useCallback(() => {
    if (!swapTarget) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    navigation.navigate("Main", {
      screen: "SwapTab",
      params: {
        presetBuy: {
          chainId: swapTarget.chainId,
          address: swapTarget.isNative ? NATIVE_ADDRESS : swapTarget.address,
          isNative: !!swapTarget.isNative,
          decimals: swapTarget.decimals ?? 18,
          symbol,
          name,
          logoURI: image,
        },
      },
    });
  }, [swapTarget, navigation, symbol, name, image]);

  const copyAddress = useCallback(async (d) => {
    if (!d.address) return;
    await Clipboard.setStringAsync(d.address);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    setCopied(d.chainId);
    setTimeout(() => setCopied((c) => (c === d.chainId ? null : c)), 1600);
  }, []);

  const selectPeriod = (d) => {
    if (d === days) return;
    Haptics.selectionAsync().catch(() => {});
    setDays(d);
  };

  const styles = useMemo(() => makeStyles(COLORS), [COLORS]);

  // ── Stats ───────────────────────────────────────────────────────────────────
  const stats = market
    ? [
        ["Market cap", formatCompactUsd(market.marketCap)],
        ["24h volume", formatCompactUsd(market.volume24h)],
        ["Fully diluted", formatCompactUsd(market.fdv)],
        ["Circulating", market.circulatingSupply ? `${formatCompact(market.circulatingSupply)} ${symbol}` : "—"],
        ["24h high", market.high24h ? formatPrice(market.high24h) : "—"],
        ["24h low", market.low24h ? formatPrice(market.low24h) : "—"],
        ["All-time high", market.ath ? formatPrice(market.ath) : "—", formatPct(market.athChange, 1)],
        ["Max supply", market.maxSupply ? formatCompact(market.maxSupply) : "∞"],
      ]
    : null;

  const performance = market
    ? [
        ["1H", market.change1h],
        ["24H", market.change24h],
        ["7D", market.change7d],
        ["30D", market.change30d],
        ["1Y", market.change1y],
      ].filter(([, v]) => v != null)
    : [];

  const links = coin?.links
    ? [
        ["Website", "globe-outline", coin.links.homepage],
        ["X", "logo-twitter", coin.links.twitter],
        ["Explorer", "open-outline", coin.links.explorer],
      ].filter(([, , url]) => url)
    : [];

  return (
    <SafeAreaView style={styles.safe} edges={["top", "left", "right"]}>
      {/* ── Top bar ── */}
      <View style={styles.topBar}>
        <Pressable onPress={() => navigation.goBack()} style={styles.iconBtn} hitSlop={8}>
          <Ionicons name="chevron-back" size={22} color={COLORS.text} />
        </Pressable>
        <View style={styles.topTitle}>
          <CoinLogo uri={image} symbol={symbol} size={26} />
          <Text style={styles.topSymbol}>{symbol}</Text>
          {market?.rank ? (
            <View style={styles.rankPill}>
              <Text style={styles.rankText}>#{market.rank}</Text>
            </View>
          ) : null}
        </View>
        <View style={styles.iconBtn} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        scrollEnabled={!scrub}
      >
        {/* ── Price hero ── */}
        <View style={styles.hero}>
          <Text style={styles.heroName}>{name}</Text>
          <Text style={styles.heroPrice} adjustsFontSizeToFit numberOfLines={1}>
            {shownPrice != null ? formatPrice(shownPrice) : "—"}
          </Text>
          <View style={styles.heroMeta}>
            {periodChange != null ? (
              <View style={[styles.changePill, { backgroundColor: trendColor + "1F" }]}>
                <Ionicons name={up ? "arrow-up" : "arrow-down"} size={12} color={trendColor} />
                <Text style={[styles.changeText, { color: trendColor }]}>
                  {formatPct(Math.abs(periodChange)).replace("+", "")}
                </Text>
              </View>
            ) : null}
            <Text style={styles.heroPeriod}>
              {scrub ? formatChartTime(scrub.time, days) : PERIOD_LABEL[days]}
            </Text>
          </View>
        </View>

        {/* ── Chart ── */}
        <View style={styles.chartWrap}>
          {chartLoading && !prices ? (
            <View style={styles.chartState}>
              <ActivityIndicator color={COLORS.primary} />
            </View>
          ) : chartError || coinError || !prices ? (
            <View style={styles.chartState}>
              <Ionicons name="analytics-outline" size={26} color={COLORS.textTertiary} />
              <Text style={styles.muted}>
                {coinError ?? "Chart isn't available right now."}
              </Text>
            </View>
          ) : (
            <View style={{ opacity: chartLoading ? 0.4 : 1 }}>
              <PriceChart
                prices={prices}
                height={220}
                color={trendColor}
                gridColor={COLORS.borderStrong}
                onScrub={setScrub}
              />
            </View>
          )}
        </View>

        {/* ── Period selector ── */}
        <View style={styles.periods}>
          {CHART_PERIODS.map((p) => {
            const active = p.days === days;
            return (
              <Pressable
                key={p.days}
                onPress={() => selectPeriod(p.days)}
                style={[styles.period, active && styles.periodActive]}
              >
                <Text style={[styles.periodText, active && styles.periodTextActive]}>
                  {p.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {/* ── Your balance ── */}
        {isHolding ? (
          <View style={styles.card}>
            <View style={styles.balanceRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.cardLabel}>Your balance</Text>
                <Text style={styles.balanceAmount} numberOfLines={1}>
                  {Number(balance).toLocaleString("en-US", { maximumFractionDigits: 6 })} {symbol}
                </Text>
              </View>
              <Text style={styles.balanceUsd}>
                {usdValue != null
                  ? `$${Number(usdValue).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                  : "—"}
              </Text>
            </View>
            {chain?.name ? (
              <View style={styles.chainTag}>
                <CoinLogo uri={chain.icon} symbol={chain.name} size={14} />
                <Text style={styles.chainTagText}>{chain.name}</Text>
              </View>
            ) : null}
          </View>
        ) : null}

        {/* ── Actions ── */}
        <View style={styles.actions}>
          {isHolding ? (
            <ActionButton
              icon="arrow-up"
              label="Send"
              styles={styles}
              onPress={() => navigation.navigate("Send", { token, chain, walletAddress })}
            />
          ) : null}
          <ActionButton
            icon="arrow-down"
            label="Receive"
            styles={styles}
            onPress={() => navigation.navigate("Receive", { token, chain, walletAddress })}
          />
          <ActionButton
            icon="swap-horizontal"
            label="Swap"
            styles={styles}
            disabled={!swapTarget}
            onPress={goSwap}
          />
        </View>

        {/* ── Performance ── */}
        {performance.length ? (
          <>
            <Text style={styles.section}>Performance</Text>
            <View style={styles.perfRow}>
              {performance.map(([label, v]) => {
                const pos = v >= 0;
                return (
                  <View key={label} style={styles.perfCell}>
                    <Text style={styles.perfLabel}>{label}</Text>
                    <Text style={[styles.perfValue, { color: pos ? COLORS.success : COLORS.error }]}>
                      {formatPct(v, 1)}
                    </Text>
                  </View>
                );
              })}
            </View>
          </>
        ) : null}

        {/* ── Market stats ── */}
        {stats ? (
          <>
            <Text style={styles.section}>Market stats</Text>
            <View style={styles.statsGrid}>
              {stats.map(([label, value, sub]) => (
                <View key={label} style={styles.statCell}>
                  <Text style={styles.statLabel}>{label}</Text>
                  <Text style={styles.statValue} numberOfLines={1}>
                    {value}
                  </Text>
                  {sub ? <Text style={styles.statSub}>{sub} from ATH</Text> : null}
                </View>
              ))}
            </View>
          </>
        ) : !coinError ? (
          <View style={[styles.card, styles.center]}>
            <ActivityIndicator color={COLORS.primary} />
          </View>
        ) : null}

        {/* ── Available on ── */}
        {deployments.length ? (
          <>
            <Text style={styles.section}>Available on</Text>
            <View style={styles.card}>
              {deployments.map((d, i) => (
                <Pressable
                  key={d.chainId}
                  onPress={() => copyAddress(d)}
                  disabled={!d.address}
                  style={({ pressed }) => [
                    styles.deployRow,
                    i < deployments.length - 1 && styles.divider,
                    pressed && { opacity: 0.6 },
                  ]}
                >
                  <CoinLogo uri={d.chain.icon} symbol={d.chain.name} size={24} />
                  <Text style={styles.deployName}>{d.chain.name}</Text>
                  <Text style={styles.deployAddr}>
                    {d.isNative || !d.address
                      ? "Native"
                      : copied === d.chainId
                        ? "Copied"
                        : shortAddr(d.address)}
                  </Text>
                  {d.address ? (
                    <Ionicons
                      name={copied === d.chainId ? "checkmark" : "copy-outline"}
                      size={15}
                      color={copied === d.chainId ? COLORS.success : COLORS.textTertiary}
                    />
                  ) : null}
                </Pressable>
              ))}
            </View>
          </>
        ) : null}

        {/* ── About ── */}
        {coin?.description || links.length ? (
          <>
            <Text style={styles.section}>About {name}</Text>
            <View style={styles.card}>
              {coin?.description ? (
                <>
                  <Text style={styles.about} numberOfLines={expanded ? undefined : 4}>
                    {coin.description}
                  </Text>
                  {coin.description.length > 220 ? (
                    <Pressable onPress={() => setExpanded((v) => !v)} hitSlop={6}>
                      <Text style={styles.readMore}>{expanded ? "Show less" : "Read more"}</Text>
                    </Pressable>
                  ) : null}
                </>
              ) : null}
              {links.length ? (
                <View style={styles.links}>
                  {links.map(([label, icon, url]) => (
                    <Pressable
                      key={label}
                      onPress={() => Linking.openURL(url).catch(() => {})}
                      style={({ pressed }) => [styles.linkChip, pressed && { opacity: 0.6 }]}
                    >
                      <Ionicons name={icon} size={14} color={COLORS.text} />
                      <Text style={styles.linkText}>{label}</Text>
                    </Pressable>
                  ))}
                </View>
              ) : null}
            </View>
          </>
        ) : null}

        <Text style={styles.attribution}>Market data by CoinGecko</Text>
      </ScrollView>

      {/* ── Sticky swap CTA ── */}
      <View style={styles.footer}>
        <Pressable
          onPress={goSwap}
          disabled={!swapTarget}
          style={({ pressed }) => [
            styles.cta,
            !swapTarget && styles.ctaDisabled,
            pressed && { opacity: 0.85, transform: [{ scale: 0.99 }] },
          ]}
        >
          <Ionicons name="swap-horizontal" size={20} color="#000" />
          <Text style={styles.ctaText}>
            {swapTarget ? `Swap ${symbol}` : "Not swappable on supported networks"}
          </Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const ActionButton = ({ icon, label, onPress, disabled, styles }) => (
  <Pressable
    onPress={onPress}
    disabled={disabled}
    style={({ pressed }) => [
      styles.action,
      disabled && { opacity: 0.35 },
      pressed && { opacity: 0.8, transform: [{ scale: 0.97 }] },
    ]}
  >
    <View style={styles.actionIcon}>
      <Ionicons name={icon} size={22} color="#000" />
    </View>
    <Text style={styles.actionLabel}>{label}</Text>
  </Pressable>
);

const makeStyles = (C) =>
  StyleSheet.create({
    safe: { flex: 1, backgroundColor: C.background },
    topBar: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 12,
      paddingVertical: 8,
    },
    iconBtn: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: C.surface,
    },
    topTitle: { flexDirection: "row", alignItems: "center", gap: 8 },
    topSymbol: { fontSize: 17, fontWeight: "800", color: C.text },
    rankPill: {
      backgroundColor: C.surface,
      borderRadius: 6,
      paddingHorizontal: 6,
      paddingVertical: 2,
    },
    rankText: { fontSize: 11, fontWeight: "700", color: C.textSecondary },
    scroll: { paddingHorizontal: 16, paddingBottom: 110 },

    hero: { marginTop: 8, marginBottom: 8 },
    heroName: { fontSize: 14, fontWeight: "600", color: C.textSecondary },
    heroPrice: {
      fontSize: 40,
      fontWeight: "800",
      color: C.text,
      letterSpacing: -1,
      marginTop: 2,
      fontVariant: ["tabular-nums"],
    },
    heroMeta: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 6 },
    changePill: {
      flexDirection: "row",
      alignItems: "center",
      gap: 3,
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 8,
    },
    changeText: { fontSize: 13, fontWeight: "800", fontVariant: ["tabular-nums"] },
    heroPeriod: { fontSize: 13, color: C.textTertiary, fontWeight: "600" },

    chartWrap: { marginHorizontal: -16, height: 220, marginTop: 8 },
    chartState: { flex: 1, alignItems: "center", justifyContent: "center", gap: 8 },
    muted: { fontSize: 13, color: C.textTertiary, textAlign: "center", paddingHorizontal: 32 },

    periods: {
      flexDirection: "row",
      backgroundColor: C.surface,
      borderRadius: 14,
      padding: 4,
      marginTop: 12,
      marginBottom: 20,
    },
    period: { flex: 1, paddingVertical: 8, borderRadius: 10, alignItems: "center" },
    periodActive: { backgroundColor: C.card, borderWidth: 1, borderColor: C.border },
    periodText: { fontSize: 13, fontWeight: "700", color: C.textTertiary },
    periodTextActive: { color: C.text },

    card: {
      backgroundColor: C.surface,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: C.border,
      padding: 16,
      marginBottom: 16,
    },
    center: { alignItems: "center", justifyContent: "center", minHeight: 80 },
    cardLabel: { fontSize: 12, fontWeight: "700", color: C.textTertiary, textTransform: "uppercase", letterSpacing: 0.6 },
    balanceRow: { flexDirection: "row", alignItems: "flex-end", gap: 12 },
    balanceAmount: { fontSize: 20, fontWeight: "800", color: C.text, marginTop: 4 },
    balanceUsd: { fontSize: 16, fontWeight: "700", color: C.textSecondary },
    chainTag: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 10 },
    chainTagText: { fontSize: 12, fontWeight: "600", color: C.textSecondary },

    actions: { flexDirection: "row", justifyContent: "center", gap: 28, marginBottom: 24 },
    action: { alignItems: "center", gap: 8 },
    actionIcon: {
      width: 54,
      height: 54,
      borderRadius: 18,
      backgroundColor: C.primary,
      alignItems: "center",
      justifyContent: "center",
    },
    actionLabel: { fontSize: 13, fontWeight: "700", color: C.text },

    section: { fontSize: 18, fontWeight: "800", color: C.text, marginBottom: 10, letterSpacing: -0.2 },

    perfRow: {
      flexDirection: "row",
      backgroundColor: C.surface,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: C.border,
      paddingVertical: 14,
      marginBottom: 24,
    },
    perfCell: { flex: 1, alignItems: "center", gap: 4 },
    perfLabel: { fontSize: 11, fontWeight: "700", color: C.textTertiary },
    perfValue: { fontSize: 13, fontWeight: "800", fontVariant: ["tabular-nums"] },

    statsGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      backgroundColor: C.surface,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: C.border,
      paddingVertical: 6,
      marginBottom: 24,
    },
    statCell: { width: "50%", paddingHorizontal: 16, paddingVertical: 10 },
    statLabel: { fontSize: 12, color: C.textTertiary, fontWeight: "600" },
    statValue: { fontSize: 15, fontWeight: "800", color: C.text, marginTop: 3, fontVariant: ["tabular-nums"] },
    statSub: { fontSize: 11, color: C.textTertiary, marginTop: 2 },

    deployRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 10 },
    divider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.divider },
    deployName: { flex: 1, fontSize: 14, fontWeight: "700", color: C.text },
    deployAddr: { fontSize: 13, color: C.textSecondary, fontVariant: ["tabular-nums"] },

    about: { fontSize: 14, lineHeight: 21, color: C.textSecondary },
    readMore: { fontSize: 13, fontWeight: "800", color: C.text, marginTop: 8, textDecorationLine: "underline" },
    links: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 14 },
    linkChip: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      paddingHorizontal: 12,
      paddingVertical: 7,
      borderRadius: 999,
      backgroundColor: C.card,
      borderWidth: 1,
      borderColor: C.border,
    },
    linkText: { fontSize: 13, fontWeight: "700", color: C.text },
    attribution: { fontSize: 11, color: C.textTertiary, textAlign: "center", marginTop: 4 },

    footer: {
      position: "absolute",
      left: 0,
      right: 0,
      bottom: 0,
      paddingHorizontal: 16,
      paddingTop: 10,
      paddingBottom: 12,
      backgroundColor: C.background,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: C.divider,
    },
    cta: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      backgroundColor: C.primary,
      borderRadius: 18,
      paddingVertical: 16,
    },
    ctaDisabled: { opacity: 0.4 },
    ctaText: { fontSize: 16, fontWeight: "800", color: "#000" },
  });
