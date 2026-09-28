// screens/wallet/TokensScreen.js
// ─────────────────────────────────────────────────────────────────────────────
// Manage Tokens — the full catalog for the active chain, with a per-token
// enable/disable switch. Enabled tokens are what shows up in the portfolio
// (usePortfolioAssets.js reads exactly this list via TokenDatabase.js).
//
// Everything here reads through the shared data layer:
//   • catalog          → services/apiClient.js  (cached 10min, same as useSwap)
//   • balances         → one Multicall batch call for the whole catalog
//   • prices           → services/coingecko.js  (already cached)
//   • enabled/disabled → utils/TokenDatabase.js  (SQLite, same table the
//                        portfolio reads — flipping a switch here is instant
//                        everywhere else in the app)
// No screen-local cache reimplementation — that was the old bug: a bespoke
// AsyncStorage cache here, duplicating (and drifting from) the real one.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  RefreshControl,
  TouchableOpacity,
  TextInput,
  Image,
  ActivityIndicator,
  Switch,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { formatUnits } from "ethers";
import { useWallet } from "../../contexts/WalletContext";
import { useChain } from "../../contexts/ChainContext";
import { useTheme } from "../../contexts/ThemeContext";
import Button from "../../components/common/Button";
import {
  enableToken,
  disableToken,
  getEnabledAddressSet,
} from "../../utils/TokenDatabase";
import { getNativeBalance } from "../../utils/blockchain/Balances";
import { batchGetTokenBalances } from "../../utils/cache/Multicall";
import { apiGet } from "../../services/apiClient";
import { TTL } from "../../utils/cache/DataCache";
import { humanizeError } from "../../utils/errors/humanizeError";
import coinGeckoService from "../../services/coingecko";
import Alert from "../../utils/Alert";
import ChainBadge from "../../components/common/ChainBadge";

const NATIVE_TOKEN_ADDRESS = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";
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

const TokensScreen = ({ navigation }) => {
  const theme = useTheme();
  const styles = createStyles(theme);
  const { wallet } = useWallet();
  const { activeChain } = useChain();

  const [catalog, setCatalog] = useState([]);
  const [enabledAddresses, setEnabledAddresses] = useState(new Set());
  const [balancesByAddr, setBalancesByAddr] = useState({});
  const [pricesByAddr, setPricesByAddr] = useState({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState("");
  const [togglingAddr, setTogglingAddr] = useState(null);
  const [errorBanner, setErrorBanner] = useState(null);

  const loadingRef = useRef(false);

  useEffect(() => {
    if (wallet?.address && activeChain) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wallet?.address, activeChain?.id]);

  const load = useCallback(async (forceRefresh = false) => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    setLoading(true);
    setErrorBanner(null);

    try {
      const userAddress = wallet.address.toLowerCase();
      const chainId = parseInt(activeChain.id);

      // ── 1. Catalog + enabled set, in parallel ──────────────────────────────
      const [catalogRes, enabledSet] = await Promise.all([
        apiGet("/swap/tokens", {
          params: { chainId },
          ttl: forceRefresh ? 0 : TTL.API_TOKEN_CATALOG,
        }),
        getEnabledAddressSet(userAddress, chainId),
      ]);
      const tokens = catalogRes.data.tokens;
      setCatalog(tokens);
      setEnabledAddresses(enabledSet);

      // ── 2. Balances: native separately, everything else in ONE Multicall ──
      const erc20Tokens = tokens.filter((t) => !t.isNative);
      const nativeToken = tokens.find((t) => t.isNative);

      const [nativeBal, balanceMap] = await Promise.all([
        nativeToken
          ? getNativeBalance(wallet.address, activeChain).catch(() => null)
          : Promise.resolve(null),
        erc20Tokens.length
          ? batchGetTokenBalances(
              wallet.address,
              erc20Tokens.map((t) => t.address),
              activeChain,
            ).catch(() => new Map())
          : Promise.resolve(new Map()),
      ]);

      const balMap = {};
      if (nativeToken && nativeBal) balMap[NATIVE_TOKEN_ADDRESS.toLowerCase()] = nativeBal;
      for (const [addr, wei] of balanceMap) {
        const t = erc20Tokens.find((x) => x.address.toLowerCase() === addr);
        if (!t) continue;
        balMap[addr] = { formatted: formatUnits(wei, t.decimals), wei: wei.toString() };
      }
      setBalancesByAddr(balMap);

      // Auto-enable any token the user actually holds but hasn't explicitly
      // toggled yet, so a real balance never silently disappears from the
      // portfolio just because it wasn't manually enabled first.
      const holdingsNotEnabled = erc20Tokens.filter((t) => {
        const bal = balMap[t.address.toLowerCase()];
        return bal && parseFloat(bal.formatted) > 0 && !enabledSet.has(t.address.toLowerCase());
      });
      if (holdingsNotEnabled.length) {
        await Promise.all(
          holdingsNotEnabled.map((t) => enableToken(userAddress, chainId, t)),
        );
        setEnabledAddresses((prev) => {
          const next = new Set(prev);
          holdingsNotEnabled.forEach((t) => next.add(t.address.toLowerCase()));
          return next;
        });
      }

      // ── 3. Prices — capped, and only for tokens with a balance or already enabled ──
      const priceCandidates = erc20Tokens
        .filter((t) => {
          const bal = balMap[t.address.toLowerCase()];
          return (bal && parseFloat(bal.formatted) > 0) || enabledSet.has(t.address.toLowerCase());
        })
        .slice(0, MAX_PRICE_FETCHES);

      const priceResults = await Promise.all(
        priceCandidates.map(async (t) => {
          try {
            const price =
              (await coinGeckoService.getTokenPrice(t.address, chainId)) ??
              (await coinGeckoService.getTokenPrice(t.symbol, chainId));
            return [t.address.toLowerCase(), price];
          } catch {
            return [t.address.toLowerCase(), null];
          }
        }),
      );
      setPricesByAddr(Object.fromEntries(priceResults.filter(([, p]) => p)));
    } catch (err) {
      const humanized = humanizeError(err, { fallbackTitle: "Couldn't Load Tokens" });
      setErrorBanner(humanized);
    } finally {
      setLoading(false);
      loadingRef.current = false;
    }
  }, [wallet?.address, activeChain]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load(true);
    setRefreshing(false);
  }, [load]);

  // ── Toggle enable/disable ───────────────────────────────────────────────────
  const handleToggle = useCallback(
    async (token) => {
      const addr = token.address.toLowerCase();
      const userAddress = wallet.address.toLowerCase();
      const chainId = parseInt(activeChain.id);
      const willEnable = !enabledAddresses.has(addr);

      setTogglingAddr(addr);
      try {
        if (willEnable) {
          await enableToken(userAddress, chainId, token);
        } else {
          await disableToken(userAddress, chainId, addr);
        }
        setEnabledAddresses((prev) => {
          const next = new Set(prev);
          willEnable ? next.add(addr) : next.delete(addr);
          return next;
        });
      } catch (err) {
        const humanized = humanizeError(err, { fallbackTitle: "Couldn't Update Token" });
        Alert.alert(humanized.title, humanized.message);
      } finally {
        setTogglingAddr(null);
      }
    },
    [wallet?.address, activeChain?.id, enabledAddresses],
  );

  // ── Rows ready for render ───────────────────────────────────────────────────
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return catalog
      .filter((t) => {
        if (!q) return true;
        return t.symbol.toLowerCase().includes(q) || t.name.toLowerCase().includes(q);
      })
      .map((t) => {
        const addr = t.address.toLowerCase();
        const balance = balancesByAddr[addr] ?? null;
        const price = pricesByAddr[addr] ?? null;
        const usdValue =
          balance && price?.usd ? parseFloat(balance.formatted) * price.usd : 0;
        return {
          ...t,
          balance,
          price,
          usdValue,
          enabled: t.isNative ? true : enabledAddresses.has(addr),
        };
      })
      .sort((a, b) => {
        if (a.isNative) return -1;
        if (b.isNative) return 1;
        if (a.enabled !== b.enabled) return a.enabled ? -1 : 1;
        return (b.usdValue ?? 0) - (a.usdValue ?? 0);
      });
  }, [catalog, balancesByAddr, pricesByAddr, enabledAddresses, query]);

  const enabledCount = rows.filter((r) => r.enabled && !r.isNative).length;

  const handleTokenPress = (token) => {
    if (!token.balance || parseFloat(token.balance.formatted) === 0) return;
    navigation.navigate("TokenDetail", {
      token: {
        address: token.address,
        symbol: token.symbol,
        name: token.name,
        decimals: token.decimals,
        logoURI: token.logoURI || token.logo,
        isCustom: false,
      },
      chain: {
        id: activeChain.id,
        name: activeChain.name,
        symbol: activeChain.symbol,
        icon: activeChain.icon,
      },
      balance: token.balance.formatted,
      usdValue: token.usdValue,
      price: token.price?.usd || 0,
      priceChange24h: token.price?.usd_24h_change,
      walletAddress: wallet.address,
      chainId: parseInt(activeChain.id),
    });
  };

  const handleSendToken = (token) => {
    navigation.navigate("Send", {
      token: { ...token, balance: token.balance?.formatted || "0" },
      chain: activeChain,
    });
  };

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
              {activeChain.name} · {enabledCount} enabled
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
          placeholder="Search tokens"
          placeholderTextColor={theme.COLORS.textTertiary}
          style={[styles.searchInput, { color: theme.COLORS.text }]}
          autoCorrect={false}
        />
        {query.length > 0 && (
          <TouchableOpacity onPress={() => setQuery("")}>
            <Ionicons name="close-circle" size={16} color={theme.COLORS.textTertiary} />
          </TouchableOpacity>
        )}
      </View>

      {errorBanner && (
        <View style={[styles.errorBanner, { backgroundColor: theme.COLORS.error + "12", borderColor: theme.COLORS.error + "40" }]}>
          <Ionicons name="alert-circle-outline" size={16} color={theme.COLORS.error} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.errorTitle, { color: theme.COLORS.error }]}>{errorBanner.title}</Text>
            <Text style={[styles.errorMessage, { color: theme.COLORS.textSecondary }]}>
              {errorBanner.message}
            </Text>
          </View>
          <TouchableOpacity onPress={() => load(true)}>
            <Ionicons name="refresh" size={18} color={theme.COLORS.error} />
          </TouchableOpacity>
        </View>
      )}

      {loading && rows.length === 0 ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.COLORS.primary} />
          <Text style={styles.loadingText}>Loading tokens…</Text>
        </View>
      ) : (
        <FlatList
          data={rows}
          renderItem={({ item }) => (
            <TokenRow
              token={item}
              chainIcon={activeChain.icon}
              onToggle={handleToggle}
              onSend={handleSendToken}
              onPress={handleTokenPress}
              toggling={togglingAddr === item.address.toLowerCase()}
              theme={theme}
            />
          )}
          keyExtractor={(item) => `${item.address.toLowerCase()}-${activeChain.id}`}
          contentContainerStyle={styles.listContent}
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
