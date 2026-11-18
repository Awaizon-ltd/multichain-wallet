// screens/wallet/TokensScreen.js
// ─────────────────────────────────────────────────────────────────────────────
// Manage Tokens — the full catalog of every enabled network, with a
// per-token enable/disable switch. Enabled tokens are what shows up in the
// portfolio (usePortfolioAssets.js reads the same stores).
//
// Everything here reads through the shared data layer:
//   • catalog + balances → hooks/useMultiChainTokens.js (catalog cached 10min,
//                          same as useSwap; one balance round-trip per chain)
//   • prices           → services/coingecko.js  (already cached)
//   • enabled/disabled → utils/TokenDatabase.js for EVM (SQLite, the table the
//                        portfolio reads) and utils/splVisibility.js for
//                        Solana — flipping a switch is instant everywhere
// No screen-local cache reimplementation — that was the old bug: a bespoke
// AsyncStorage cache here, duplicating (and drifting from) the real one.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  SectionList,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  TextInput,
  Image,
  ActivityIndicator,
  Switch,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useWallet } from "../../contexts/WalletContext";
import { useChain, isSolanaChain } from "../../contexts/ChainContext";
import { useTheme } from "../../contexts/ThemeContext";
import Button from "../../components/common/Button";
import {
  enableToken,
  disableToken,
  getEnabledAddressSet,
} from "../../utils/TokenDatabase";
import useMultiChainTokens, { tokenKey } from "../../hooks/useMultiChainTokens";
import { getSplPrefs, setSplVisible, isSplVisible } from "../../utils/splVisibility";
import { humanizeError } from "../../utils/errors/humanizeError";
import coinGeckoService from "../../services/coingecko";
import Alert from "../../utils/Alert";
import ChainBadge from "../../components/common/ChainBadge";

const MAX_PRICE_FETCHES = 40; // cap CoinGecko calls per load — prices are a nice-to-have, not blocking

// ─── Formatting helpers ───────────────────────────────────────────────────────

const formatNumber = (num, decimals = 4) => {
  const n = parseFloat(num);
  if (!n) return "0";
  if (n < 0.000001) return "< 0.000001";
  if (n < 0.01) return n.toFixed(6);
  if (n < 1) return n.toFixed(4);
  if (n < 1000) return n.toFixed(decimals);
  if (n < 1_000_000) return n.toLocaleString("en-US", { maximumFractionDigits: decimals });
  if (n < 1_000_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  return `${(n / 1_000_000_000).toFixed(2)}B`;
};

const formatCurrency = (value) => {
  const n = parseFloat(value);
  if (!n) return "$0.00";
  if (n < 0.01) return "< $0.01";
  if (n < 1000) return `$${n.toFixed(2)}`;
  if (n < 1_000_000) return `$${n.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
  return `$${(n / 1_000_000).toFixed(2)}M`;
};

// ─── Row ──────────────────────────────────────────────────────────────────────

const TokenRow = React.memo(
  ({ token, chainIcon, onToggle, onSend, onPress, toggling, theme }) => {
    const { COLORS } = theme;
    const styles = rowStyles(theme);
    const [imgErr, setImgErr] = useState(false);
    const logo = token.logoURI || token.logo;
    const priceChange = token.price?.usd_24h_change;
    const isPositive = priceChange > 0;
    const isNegative = priceChange < 0;
    const hasBalance = parseFloat(token.balance?.formatted || "0") > 0;

    return (
      <TouchableOpacity
        activeOpacity={0.7}
        onPress={() => onPress(token)}
        style={[styles.card, { backgroundColor: COLORS.surface, borderColor: COLORS.border }]}
      >
        <View style={styles.row}>
          <View style={styles.left}>
            <View style={styles.iconWrap}>
              {logo && !imgErr ? (
                <Image source={{ uri: logo }} style={styles.icon} onError={() => setImgErr(true)} />
              ) : (
                <View style={[styles.iconFallback, { backgroundColor: COLORS.primary + "20" }]}>
                  <Text style={[styles.iconFallbackText, { color: COLORS.primary }]}>
                    {token.symbol?.slice(0, 2).toUpperCase()}
                  </Text>
                </View>
              )}
              {!token.isNative && (
                <ChainBadge uri={chainIcon} borderColor={COLORS.surface} />
              )}
            </View>

            <View style={styles.info}>
              <View style={styles.nameRow}>
                <Text style={[styles.symbol, { color: COLORS.text }]} numberOfLines={1}>
                  {token.symbol}
                </Text>
                {token.isNative && (
                  <View style={[styles.badge, { backgroundColor: COLORS.primary + "18" }]}>
                    <Text style={[styles.badgeText, { color: COLORS.primary }]}>NATIVE</Text>
                  </View>
                )}
                {priceChange != null && (
                  <View
                    style={[
                      styles.changeChip,
                      { backgroundColor: isPositive ? "#E8F5E9" : isNegative ? "#FFEBEE" : COLORS.border },
                    ]}
                  >
                    <Text
                      style={[
                        styles.changeText,
                        { color: isPositive ? "#2E7D32" : isNegative ? "#C62828" : COLORS.textSecondary },
                      ]}
                    >
                      {isPositive ? "+" : ""}
                      {priceChange.toFixed(1)}%
                    </Text>
                  </View>
                )}
              </View>
              <Text style={[styles.name, { color: COLORS.textSecondary }]} numberOfLines={1}>
                {token.name}
              </Text>
              {hasBalance && (
                <Text style={[styles.balanceLine, { color: COLORS.textTertiary }]}>
                  {formatNumber(token.balance.formatted)} {token.symbol}
                  {token.usdValue > 0 ? `  ·  ${formatCurrency(token.usdValue)}` : ""}
                </Text>
              )}
            </View>
          </View>

          <View style={styles.right}>
            {hasBalance && (
              <TouchableOpacity
                onPress={(e) => {
                  e.stopPropagation();
                  onSend(token);
                }}
                style={[styles.sendBtn, { backgroundColor: COLORS.primary + "15" }]}
              >
                <Ionicons name="paper-plane" size={13} color={COLORS.primary} />
              </TouchableOpacity>
            )}
            {token.isNative ? (
              <View style={styles.alwaysOnPill}>
                <Ionicons name="lock-closed" size={11} color={COLORS.textTertiary} />
              </View>
            ) : toggling ? (
              <ActivityIndicator size="small" color={COLORS.primary} />
            ) : (
              <Switch
                value={token.enabled}
                onValueChange={() => onToggle(token)}
                trackColor={{ false: COLORS.disabled, true: COLORS.primary + "60" }}
                thumbColor={token.enabled ? COLORS.primary : COLORS.textTertiary}
                ios_backgroundColor={COLORS.disabled}
              />
            )}
          </View>
        </View>
      </TouchableOpacity>
    );
  },
);

// ─── Screen ───────────────────────────────────────────────────────────────────
// Every enabled network's catalog in one list, grouped by chain (SectionList,
// virtualized — only what's on screen is rendered). Chips filter to one
// chain; search runs across all of them. Each chain fills in as soon as its
// own data arrives (hooks/useMultiChainTokens).

const TokensScreen = ({ navigation }) => {
  const theme = useTheme();
  const styles = createStyles(theme);
  const { wallet, solanaAddress } = useWallet();
  const { getEnabledNetworks } = useChain();

  // Recompute only when the enabled set changes, not on every render
  const networks = useMemo(() => getEnabledNetworks(), [getEnabledNetworks]);
  const { byChain, reload } = useMultiChainTokens({ networks, withBalances: true });

  // chainId → Set of enabled keys (EVM: SQLite table; Solana: splVisibility)
  const [enabledByChain, setEnabledByChain] = useState({});
  const [splPrefs, setSplPrefs] = useState(null);
  const [pricesByKey, setPricesByKey] = useState({});
  const [chainFilter, setChainFilter] = useState("all");
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState("");
  const [togglingKey, setTogglingKey] = useState(null);

  const userAddress = wallet?.address?.toLowerCase();

  // ── Enabled sets ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!userAddress) return;
    let cancelled = false;
    (async () => {
      const entries = await Promise.all(
        networks
          .filter((c) => !isSolanaChain(c))
          .map(async (c) => [c.id, await getEnabledAddressSet(userAddress, parseInt(c.id))]),
      );
      const prefs = solanaAddress ? await getSplPrefs(solanaAddress) : null;
      if (cancelled) return;
      setEnabledByChain(Object.fromEntries(entries));
      setSplPrefs(prefs);
    })();
    return () => {
      cancelled = true;
    };
  }, [userAddress, solanaAddress, networks]);

  // ── Auto-enable ERC-20 holdings, then prices (capped) ───────────────────────
  // A token the user actually holds is switched on the first time it's seen,
  // so a real balance never silently disappears from the portfolio.
  const pricedRef = useRef(new Set());
  useEffect(() => {
    if (!userAddress) return;
    for (const chain of networks) {
      const entry = byChain[chain.id];
      if (!entry || entry.loading || pricedRef.current.has(chain.id)) continue;
      pricedRef.current.add(chain.id);
      const solana = isSolanaChain(chain);
      const enabled = enabledByChain[chain.id] ?? new Set();

      const held = entry.tokens.filter(
        (t) => !t.isNative && parseFloat(entry.balances[tokenKey(chain, t)] || "0") > 0,
      );
      if (!solana) {
        const toEnable = held.filter((t) => !enabled.has(t.address.toLowerCase()));
        if (toEnable.length) {
          Promise.all(toEnable.map((t) => enableToken(userAddress, parseInt(chain.id), t)))
            .then(() =>
              setEnabledByChain((prev) => {
                const next = new Set(prev[chain.id] ?? []);
                toEnable.forEach((t) => next.add(t.address.toLowerCase()));
                return { ...prev, [chain.id]: next };
              }),
            )
            .catch(() => {});
        }
      }

      const candidates = held.slice(0, MAX_PRICE_FETCHES);
      Promise.all(
        candidates.map(async (t) => {
          try {
            const price =
              (await coinGeckoService.getTokenPrice(t.address, chain.id)) ??
              (solana ? null : await coinGeckoService.getTokenPrice(t.symbol, chain.id));
            return [`${chain.id}:${tokenKey(chain, t)}`, price];
          } catch {
            return [null, null];
          }
        }),
      ).then((results) =>
        setPricesByKey((prev) => ({
          ...prev,
          ...Object.fromEntries(results.filter(([k, p]) => k && p)),
        })),
      );
    }
  }, [byChain, networks, userAddress, enabledByChain]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    pricedRef.current = new Set();
    await reload({ force: true });
    setRefreshing(false);
  }, [reload]);

  const isEnabled = useCallback(
    (chain, token, held) => {
      if (token.isNative) return true;
      if (isSolanaChain(chain)) return !!splPrefs && isSplVisible(splPrefs, token.address, held);
      return (enabledByChain[chain.id] ?? new Set()).has(token.address.toLowerCase());
    },
    [enabledByChain, splPrefs],
  );

  // ── Toggle enable/disable ───────────────────────────────────────────────────
  const handleToggle = useCallback(
    async (token) => {
      const chain = token.chain;
      const key = `${chain.id}:${tokenKey(chain, token)}`;
      const willEnable = !token.enabled;
      setTogglingKey(key);
      try {
        if (isSolanaChain(chain)) {
          setSplPrefs(await setSplVisible(solanaAddress, token.address, willEnable));
        } else {
          const chainId = parseInt(chain.id);
          const addr = token.address.toLowerCase();
          if (willEnable) await enableToken(userAddress, chainId, token);
          else await disableToken(userAddress, chainId, addr);
          setEnabledByChain((prev) => {
            const next = new Set(prev[chain.id] ?? []);
            willEnable ? next.add(addr) : next.delete(addr);
            return { ...prev, [chain.id]: next };
          });
        }
      } catch (err) {
        const humanized = humanizeError(err, { fallbackTitle: "Couldn't Update Token" });
        Alert.alert(humanized.title, humanized.message);
      } finally {
        setTogglingKey(null);
      }
    },
    [userAddress, solanaAddress],
  );

  // ── Sections ready for render ───────────────────────────────────────────────
  const sections = useMemo(() => {
    const q = query.trim().toLowerCase();
    return networks
      .filter((c) => chainFilter === "all" || c.id === chainFilter)
      .map((chain) => {
        const entry = byChain[chain.id] ?? { tokens: [], balances: {} };
        const data = entry.tokens
          .filter(
            (t) =>
              !q ||
              t.symbol.toLowerCase().includes(q) ||
              t.name.toLowerCase().includes(q) ||
              t.address.toLowerCase() === q,
          )
          .map((t) => {
            const key = tokenKey(chain, t);
            const formatted = entry.balances[key];
            const balance = formatted != null ? { formatted } : null;
            const held = parseFloat(formatted || "0") > 0;
            const price = pricesByKey[`${chain.id}:${key}`] ?? null;
            return {
              ...t,
              chain,
              rowKey: `${chain.id}:${key}`,
              balance,
              price,
              usdValue: held && price?.usd ? parseFloat(formatted) * price.usd : 0,
              enabled: isEnabled(chain, t, held),
            };
          })
          .sort((a, b) => {
            if (a.isNative) return -1;
            if (b.isNative) return 1;
            if (a.enabled !== b.enabled) return a.enabled ? -1 : 1;
            return (b.usdValue ?? 0) - (a.usdValue ?? 0);
          });
        return {
          chain,
          key: String(chain.id),
          loading: !!entry.loading && entry.tokens.length === 0,
          error: entry.error,
          enabledCount: data.filter((r) => r.enabled && !r.isNative).length,
          data,
        };
      })
      .filter((s) => s.data.length || s.loading || (!q && s.error));
  }, [networks, byChain, pricesByKey, isEnabled, query, chainFilter]);

  const enabledCount = sections.reduce((n, s) => n + s.enabledCount, 0);
  const anyLoading = networks.some((c) => byChain[c.id]?.loading);

  const handleTokenPress = (token) => {
    if (!token.balance || parseFloat(token.balance.formatted) === 0) return;
    const chain = token.chain;
    navigation.navigate("TokenDetail", {
      token: token.isNative
        ? undefined
        : {
            address: token.address,
            symbol: token.symbol,
            name: token.name,
            decimals: token.decimals,
            logoURI: token.logoURI || token.logo,
            isCustom: false,
          },
      chain: { id: chain.id, name: chain.name, symbol: chain.symbol, icon: chain.icon, type: chain.type },
      balance: token.balance.formatted,
      usdValue: token.usdValue,
      price: token.price?.usd || 0,
      priceChange24h: token.price?.usd_24h_change,
      walletAddress: isSolanaChain(chain) ? solanaAddress : wallet.address,
      chainId: chain.id,
    });
  };

  // SendScreen is EVM-only; Solana rows get no send shortcut
  const handleSendToken = (token) => {
    if (isSolanaChain(token.chain)) return;
    navigation.navigate("Send", {
      token: { ...token, balance: token.balance?.formatted || "0" },
      chain: token.chain,
    });
  };

  const renderItem = useCallback(
    ({ item }) => (
      <TokenRow
        token={item}
        chainIcon={item.chain.icon}
        onToggle={handleToggle}
        onSend={handleSendToken}
        onPress={handleTokenPress}
        toggling={togglingKey === item.rowKey}
        theme={theme}
      />
    ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [handleToggle, togglingKey, theme],
  );

  const renderSectionHeader = useCallback(
    ({ section }) => (
      <View style={[styles.sectionHeader, { backgroundColor: theme.COLORS.background }]}>
        <Image source={{ uri: section.chain.icon }} style={styles.sectionIcon} />
        <Text style={styles.sectionTitle}>{section.chain.name}</Text>
        <Text style={styles.sectionMeta}>
          {section.loading ? "Loading…" : section.error ? "Couldn't load" : `${section.enabledCount} enabled`}
        </Text>
        {section.loading && <ActivityIndicator size="small" color={theme.COLORS.primary} />}
      </View>
    ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [theme],
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
            <Ionicons name="arrow-back" size={22} color={theme.COLORS.text} />
          </TouchableOpacity>
          <View>
            <Text style={styles.headerTitle}>Manage Tokens</Text>
            <Text style={styles.headerSubtitle}>
              {networks.length} networks · {enabledCount} enabled
            </Text>
          </View>
        </View>
        <TouchableOpacity style={styles.addButton} onPress={() => navigation.navigate("TokenImport")}>
          <Ionicons name="add" size={22} color="#FFF" />
        </TouchableOpacity>
      </View>

      <View style={[styles.searchWrap, { backgroundColor: theme.COLORS.surface, borderColor: theme.COLORS.border }]}>
        <Ionicons name="search-outline" size={16} color={theme.COLORS.textTertiary} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search tokens on all networks"
          placeholderTextColor={theme.COLORS.textTertiary}
          style={[styles.searchInput, { color: theme.COLORS.text }]}
          autoCorrect={false}
          autoCapitalize="none"
        />
        {query.length > 0 && (
          <TouchableOpacity onPress={() => setQuery("")}>
            <Ionicons name="close-circle" size={16} color={theme.COLORS.textTertiary} />
          </TouchableOpacity>
        )}
      </View>

      {/* Chain filter */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.chipsWrap}
        contentContainerStyle={styles.chips}
      >
        {[{ id: "all", name: "All networks" }, ...networks].map((c) => {
          const active = chainFilter === c.id;
          return (
            <TouchableOpacity
              key={String(c.id)}
              onPress={() => setChainFilter(c.id)}
              style={[
                styles.chip,
                { borderColor: active ? theme.COLORS.primary : theme.COLORS.border },
                active && { backgroundColor: theme.COLORS.primaryMuted },
              ]}
            >
              {c.icon ? <Image source={{ uri: c.icon }} style={styles.chipIcon} /> : null}
              <Text style={[styles.chipText, { color: active ? theme.COLORS.text : theme.COLORS.textSecondary }]}>
                {c.name.replace(" Chain", "")}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {sections.length === 0 && anyLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.COLORS.primary} />
          <Text style={styles.loadingText}>Loading tokens…</Text>
        </View>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(item) => item.rowKey}
          renderItem={renderItem}
          renderSectionHeader={renderSectionHeader}
          stickySectionHeadersEnabled
          contentContainerStyle={styles.listContent}
          initialNumToRender={14}
          maxToRenderPerBatch={16}
          windowSize={9}
          removeClippedSubviews
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <View style={[styles.emptyIconContainer, { backgroundColor: theme.COLORS.border }]}>
                <Ionicons name="search-outline" size={48} color={theme.COLORS.textSecondary} />
              </View>
              <Text style={styles.emptyTitle}>No tokens found</Text>
              <Text style={styles.emptySubtitle}>
                Try a different search, or import a token by contract address
              </Text>
              <Button
                title="Import Token"
                onPress={() => navigation.navigate("TokenImport")}
                variant="primary"
                size="medium"
                style={styles.emptyButton}
              />
            </View>
          }
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.COLORS.primary} />
          }
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  );
};

// ─── Styles ───────────────────────────────────────────────────────────────────

const createStyles = (theme) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.COLORS.background },
    chipsWrap: { flexGrow: 0 },
    chips: { paddingHorizontal: 20, paddingBottom: 10, gap: 8 },
    chip: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      height: 32,
      paddingHorizontal: 12,
      borderRadius: 16,
      borderWidth: 1,
      backgroundColor: theme.COLORS.surface,
    },
    chipIcon: { width: 16, height: 16, borderRadius: 8 },
    chipText: { fontSize: 13, fontWeight: "700" },
    sectionHeader: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      paddingVertical: 10,
      paddingHorizontal: 4,
    },
    sectionIcon: { width: 20, height: 20, borderRadius: 10 },
    sectionTitle: { fontSize: 15, fontWeight: "800", color: theme.COLORS.text },
    sectionMeta: { flex: 1, fontSize: 12, color: theme.COLORS.textTertiary },
    header: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      paddingHorizontal: 20,
      paddingTop: 16,
      paddingBottom: 12,
      backgroundColor: theme.COLORS.background,
      borderBottomWidth: 1,
      borderBottomColor: theme.COLORS.border,
    },
    headerLeft: { flexDirection: "row", alignItems: "center", gap: 12, flex: 1 },
    backButton: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: theme.COLORS.border,
      justifyContent: "center",
      alignItems: "center",
    },
    headerTitle: { fontSize: 18, fontWeight: "800", color: theme.COLORS.text, letterSpacing: -0.5 },
    headerSubtitle: { fontSize: 13, color: theme.COLORS.textSecondary, marginTop: 2 },
    addButton: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: theme.COLORS.primary,
      justifyContent: "center",
      alignItems: "center",
      shadowColor: theme.COLORS.primary,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.3,
      shadowRadius: 8,
      elevation: 4,
    },
    searchWrap: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      marginHorizontal: 16,
      marginTop: 12,
      paddingHorizontal: 12,
      paddingVertical: 10,
      borderRadius: 12,
      borderWidth: 1,
    },
    searchInput: { flex: 1, fontSize: 14, padding: 0 },
    errorBanner: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      marginHorizontal: 16,
      marginTop: 12,
      padding: 12,
      borderRadius: 12,
      borderWidth: 1,
    },
    errorTitle: { fontSize: 13, fontWeight: "700" },
    errorMessage: { fontSize: 12, marginTop: 1 },
    listContent: { padding: 16, paddingBottom: 32, gap: 10 },
    emptyContainer: { alignItems: "center", justifyContent: "center", paddingVertical: 80, paddingHorizontal: 40 },
    emptyIconContainer: {
      width: 110,
      height: 110,
      borderRadius: 55,
      justifyContent: "center",
      alignItems: "center",
      marginBottom: 20,
    },
    emptyTitle: { fontSize: 20, fontWeight: "800", color: theme.COLORS.text, marginBottom: 6, textAlign: "center" },
    emptySubtitle: {
      fontSize: 13,
      color: theme.COLORS.textSecondary,
      textAlign: "center",
      lineHeight: 19,
      marginBottom: 24,
    },
    emptyButton: { paddingHorizontal: 32 },
    loadingContainer: { flex: 1, justifyContent: "center", alignItems: "center", paddingVertical: 100 },
    loadingText: { marginTop: 16, fontSize: 14, color: theme.COLORS.textSecondary, fontWeight: "500" },
  });

const rowStyles = (theme) =>
  StyleSheet.create({
    card: { borderRadius: 16, borderWidth: 1, overflow: "hidden" },
    row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 14, gap: 10 },
    left: { flexDirection: "row", alignItems: "center", flex: 1, gap: 12 },
    iconWrap: { position: "relative" },
    icon: { width: 40, height: 40, borderRadius: 20 },
    iconFallback: { width: 40, height: 40, borderRadius: 20, justifyContent: "center", alignItems: "center" },
    iconFallbackText: { fontSize: 14, fontWeight: "700" },
    info: { flex: 1, gap: 2 },
    nameRow: { flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" },
    symbol: { fontSize: 15, fontWeight: "700" },
    badge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
    badgeText: { fontSize: 9, fontWeight: "800", letterSpacing: 0.3 },
    changeChip: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
    changeText: { fontSize: 10, fontWeight: "700" },
    name: { fontSize: 12, fontWeight: "500" },
    balanceLine: { fontSize: 11, fontWeight: "600", marginTop: 2 },
    right: { flexDirection: "row", alignItems: "center", gap: 8 },
    sendBtn: { width: 30, height: 30, borderRadius: 15, justifyContent: "center", alignItems: "center" },
    alwaysOnPill: {
      width: 30,
      height: 30,
      borderRadius: 15,
      justifyContent: "center",
      alignItems: "center",
    },
  });

export default TokensScreen;
