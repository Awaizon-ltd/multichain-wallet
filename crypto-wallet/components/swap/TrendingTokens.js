// components/swap/TrendingTokens.js
// Trending tokens across chains, grouped into scrollable tabs
// (All · Arc · Robinhood · Base · BNB · Meme · RWA). Data comes from our
// backend, which fetches it from CoinGecko once and caches it for everyone.
import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  Animated,
  StyleSheet,
  Image,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useTheme } from "../../contexts/ThemeContext";
import { useChain } from "../../contexts/ChainContext";
import { getTrending } from "../../services/marketApi";
import CoinLogo from "../market/CoinLogo";
import Sparkline from "../market/Sparkline";
import {
  formatPrice,
  formatPct,
  formatCompactUsd,
  formatUpdatedAgo,
} from "../../utils/marketFormat";

const TAB_ICONS = {
  all: "flame",
  meme: "happy-outline",
  rwa: "business-outline",
};

// ── Skeleton row ──────────────────────────────────────────────────────────────
const SkeletonRow = memo(({ COLORS, pulse }) => (
  <Animated.View style={[styles.row, { opacity: pulse }]}>
    <View style={[styles.skelCircle, { backgroundColor: COLORS.cardElevated }]} />
    <View style={{ flex: 1, gap: 6 }}>
      <View style={[styles.skelLine, { width: "45%", backgroundColor: COLORS.cardElevated }]} />
      <View style={[styles.skelLine, { width: "28%", backgroundColor: COLORS.cardElevated }]} />
    </View>
    <View style={{ alignItems: "flex-end", gap: 6 }}>
      <View style={[styles.skelLine, { width: 64, backgroundColor: COLORS.cardElevated }]} />
      <View style={[styles.skelLine, { width: 44, backgroundColor: COLORS.cardElevated }]} />
    </View>
  </Animated.View>
));

// ── Token row ─────────────────────────────────────────────────────────────────
const TokenRow = memo(({ token, index, badgeUri, COLORS, onPress, isLast }) => {
  const pct = formatPct(token.change24h);
  const up = (token.change24h ?? 0) >= 0;
  const trendColor = up ? COLORS.success : COLORS.error;

  return (
    <Pressable
      onPress={() => onPress(token)}
      style={({ pressed }) => [
        styles.row,
        !isLast && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: COLORS.divider },
        pressed && { backgroundColor: COLORS.cardElevated },
      ]}
    >
      <Text style={[styles.rank, { color: COLORS.textTertiary }]}>{index + 1}</Text>
      <CoinLogo uri={token.image} symbol={token.symbol} size={38} badgeUri={badgeUri} />

      <View style={styles.rowMain}>
        <View style={styles.nameLine}>
          <Text style={[styles.symbol, { color: COLORS.text }]} numberOfLines={1}>
            {token.symbol}
          </Text>
          {token.tag === "rwa" && (
            <View style={[styles.tag, { backgroundColor: COLORS.info + "22" }]}>
              <Text style={[styles.tagText, { color: COLORS.info }]}>RWA</Text>
            </View>
          )}
          {token.tag === "hot" && (
            <Ionicons name="flame" size={12} color={COLORS.warning} />
          )}
        </View>
        <Text style={[styles.sub, { color: COLORS.textTertiary }]} numberOfLines={1}>
          {token.name}
          {token.marketCap ? ` · ${formatCompactUsd(token.marketCap)}` : ""}
        </Text>
      </View>

      <Sparkline data={token.sparkline} width={54} height={26} color={trendColor} />

      <View style={styles.priceCol}>
        <Text style={[styles.price, { color: COLORS.text }]} numberOfLines={1}>
          {formatPrice(token.price)}
        </Text>
        {pct ? (
          <View style={[styles.changePill, { backgroundColor: trendColor + "1F" }]}>
            <Text style={[styles.changeText, { color: trendColor }]}>{pct}</Text>
          </View>
        ) : null}
      </View>
    </Pressable>
  );
});

// ── Main component ────────────────────────────────────────────────────────────
const TrendingTokens = ({ onTokenPress, refreshKey = 0 }) => {
  const { COLORS } = useTheme();
  const { getChain } = useChain();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeKey, setActiveKey] = useState("all");

  const pulse = useRef(new Animated.Value(0.5)).current;
  const fade = useRef(new Animated.Value(1)).current;

  const load = useCallback(async () => {
    setError(null);
    try {
      const result = await getTrending();
      setData(result);
    } catch (err) {
      setError(err?.message || "Couldn't load trending tokens");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  useEffect(() => {
    if (!loading) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.5, duration: 700, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [loading, pulse]);

  const selectTab = useCallback(
    (key) => {
      if (key === activeKey) return;
      Haptics.selectionAsync().catch(() => {});
      fade.setValue(0);
      setActiveKey(key);
      Animated.timing(fade, { toValue: 1, duration: 220, useNativeDriver: true }).start();
    },
    [activeKey, fade],
  );

  const handlePress = useCallback(
    (token) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      onTokenPress?.(token);
    },
    [onTokenPress],
  );

  const tabs = data?.tabs ?? [];
  const activeTab = tabs.find((t) => t.key === activeKey) ?? tabs[0];
  const badgeUri = useMemo(
    () => (activeTab?.chainId ? getChain(activeTab.chainId)?.icon : null),
    [activeTab?.chainId, getChain],
  );
  const updated = formatUpdatedAgo(data?.updatedAt);

  return (
    <View style={styles.wrap}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <Ionicons name="trending-up" size={20} color={COLORS.text} />
          <Text style={[styles.title, { color: COLORS.text }]}>Trending</Text>
        </View>
        {updated ? (
          <Text style={[styles.updated, { color: COLORS.textTertiary }]}>Updated {updated}</Text>
        ) : null}
      </View>

      {/* Tabs */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.tabs}
      >
        {(tabs.length ? tabs : [{ key: "all", label: "All" }]).map((tab) => {
          const active = tab.key === (activeTab?.key ?? "all");
          const chainIcon = tab.chainId ? getChain(tab.chainId)?.icon : null;
          return (
            <Pressable
              key={tab.key}
              onPress={() => selectTab(tab.key)}
              style={[
                styles.tab,
                active
                  ? { backgroundColor: COLORS.primary, borderColor: COLORS.primary }
                  : { backgroundColor: COLORS.surface, borderColor: COLORS.border },
              ]}
            >
              {chainIcon ? (
                <Image source={{ uri: chainIcon }} style={styles.tabIcon} />
              ) : TAB_ICONS[tab.key] ? (
                <Ionicons
                  name={TAB_ICONS[tab.key]}
                  size={14}
                  color={active ? "#000" : COLORS.textSecondary}
                />
              ) : null}
              <Text
                style={[
                  styles.tabText,
                  { color: active ? "#000" : COLORS.textSecondary },
                  active && { fontWeight: "800" },
                ]}
              >
                {tab.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {/* List */}
      <View style={[styles.card, { backgroundColor: COLORS.surface, borderColor: COLORS.border }]}>
        {loading && !data ? (
          [0, 1, 2, 3].map((i) => <SkeletonRow key={i} COLORS={COLORS} pulse={pulse} />)
        ) : error && !data ? (
          <View style={styles.state}>
            <Ionicons name="cloud-offline-outline" size={28} color={COLORS.textTertiary} />
            <Text style={[styles.stateText, { color: COLORS.textSecondary }]}>{error}</Text>
            <Pressable
              onPress={() => {
                setLoading(true);
                load();
              }}
              style={[styles.retry, { backgroundColor: COLORS.primary }]}
            >
              <Text style={styles.retryText}>Try again</Text>
            </Pressable>
          </View>
        ) : !activeTab?.tokens?.length ? (
          <View style={styles.state}>
            <Ionicons name="hourglass-outline" size={26} color={COLORS.textTertiary} />
            <Text style={[styles.stateText, { color: COLORS.textSecondary }]}>
              Nothing trending here right now. Check back soon.
            </Text>
          </View>
        ) : (
          <Animated.View style={{ opacity: fade }}>
            {activeTab.tokens.map((token, i) => (
              <TokenRow
                key={`${activeTab.key}-${token.id}`}
                token={token}
                index={i}
                badgeUri={badgeUri}
                COLORS={COLORS}
                onPress={handlePress}
                isLast={i === activeTab.tokens.length - 1}
              />
            ))}
          </Animated.View>
        )}
      </View>

      <Text style={[styles.attribution, { color: COLORS.textTertiary }]}>
        Market data by CoinGecko
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: { marginTop: 28 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  titleRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  title: { fontSize: 20, fontWeight: "800", letterSpacing: -0.3 },
  updated: { fontSize: 12 },
  tabs: { gap: 8, paddingBottom: 12, paddingRight: 8 },
  tab: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
  },
  tabIcon: { width: 16, height: 16, borderRadius: 8 },
  tabText: { fontSize: 13, fontWeight: "600" },
  card: { borderRadius: 20, borderWidth: 1, overflow: "hidden" },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  rank: { width: 14, fontSize: 12, fontWeight: "700", textAlign: "center" },
  rowMain: { flex: 1, minWidth: 0 },
  nameLine: { flexDirection: "row", alignItems: "center", gap: 6 },
  symbol: { fontSize: 15, fontWeight: "800", flexShrink: 1 },
  sub: { fontSize: 12, marginTop: 2 },
  tag: { paddingHorizontal: 6, paddingVertical: 1, borderRadius: 6 },
  tagText: { fontSize: 10, fontWeight: "800", letterSpacing: 0.4 },
  priceCol: { alignItems: "flex-end", minWidth: 78 },
  price: { fontSize: 14, fontWeight: "700", fontVariant: ["tabular-nums"] },
  changePill: { marginTop: 4, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  changeText: { fontSize: 11, fontWeight: "800", fontVariant: ["tabular-nums"] },
  skelCircle: { width: 38, height: 38, borderRadius: 19 },
  skelLine: { height: 10, borderRadius: 5 },
  state: { alignItems: "center", padding: 24, gap: 10 },
  stateText: { fontSize: 13, textAlign: "center" },
  retry: { paddingHorizontal: 18, paddingVertical: 8, borderRadius: 999 },
  retryText: { color: "#000", fontWeight: "800", fontSize: 13 },
  attribution: { fontSize: 11, textAlign: "center", marginTop: 10 },
});

export default memo(TrendingTokens);
