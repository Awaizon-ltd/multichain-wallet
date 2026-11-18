import React, { useEffect, useState, useRef, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  Pressable,
  Image,
  Animated,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useWallet } from "../../contexts/WalletContext";
import { useTheme } from "../../contexts/ThemeContext";
import { useChain } from "../../contexts/ChainContext";
import PortfolioSummary from "../../components/wallet/PortfolioSummary";
import AssetCard from "../../components/wallet/AssetsCard";
import TokenAssetCard from "../../components/wallet/TokenAssetCard";
import NetworkManager from "../../components/wallet/NetworkManager";
import UserIcon from "../../components/common/UserIcon";
import BannerCarousel from "../../components/BannerCarousel";
import QRScanner from "../../components/wallet/QRScanner";
import usePortfolioAssets from "../../hooks/usePortfolioAssets";
import useIdentity from "../../hooks/useIdentity";
import { SPACING, FONTS } from "../../constants/Theme";

// ── Skeleton bone ──────────────────────────────────────────────────────────────
const SkeletonBone = React.memo(({ w, height, borderRadius = 8, style }) => {
  const { COLORS } = useTheme();
  const shimmer = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(shimmer, {
          toValue: 1,
          duration: 850,
          useNativeDriver: true,
        }),
        Animated.timing(shimmer, {
          toValue: 0,
          duration: 850,
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [shimmer]);

  const opacity = shimmer.interpolate({
    inputRange: [0, 1],
    outputRange: [0.12, 0.3],
  });

  return (
    <Animated.View
      style={[
        {
          width: w,
          height,
          borderRadius,
          backgroundColor: COLORS.primary,
          opacity,
        },
        style,
      ]}
    />
  );
});

const AssetSkeletonRow = () => (
  <View style={skeletonStyles.row}>
    <SkeletonBone w={42} height={42} borderRadius={21} />
    <View style={{ flex: 1, gap: 6 }}>
      <SkeletonBone w="55%" height={13} borderRadius={6} />
      <SkeletonBone w="35%" height={10} borderRadius={6} />
    </View>
    <View style={{ alignItems: "flex-end", gap: 6 }}>
      <SkeletonBone w={60} height={13} borderRadius={6} />
      <SkeletonBone w={40} height={10} borderRadius={6} />
    </View>
  </View>
);

// ── Quick action ───────────────────────────────────────────────────────────────
const QuickAction = ({ icon, label, onPress, slant, styles, textColor }) => (
  <Pressable
    onPress={onPress}
    style={({ pressed }) => [
      staticStyles.actionItem,
      pressed && staticStyles.actionPressed,
    ]}
    accessibilityRole="button"
    accessibilityLabel={label}
  >
    <View style={styles.actionCircle}>
      <Ionicons
        name={icon}
        size={26}
        color="#000"
        style={slant ? staticStyles.slantIcon : undefined}
      />
    </View>
    <Text style={[staticStyles.actionLabel, { color: textColor }]}>
      {label}
    </Text>
  </Pressable>
);

// ──────────────────────────────────────────────────────────────────────────────
const HomeScreen = ({ navigation }) => {
  const { COLORS, toggleTheme, isDark } = useTheme();
  const {
    wallet,
    balances,
    refreshBalance,
    loading,
    solanaAddress,
    solanaBalance,
  } = useWallet();
  const { identity } = useIdentity(wallet?.address);
  const {
    enabledChainIds: rawEnabledChainIds,
    isProduction,
    getChain,
  } = useChain();
  // Context can be undefined/non-array briefly (e.g. right after wallet creation)
  const enabledChainIds = Array.isArray(rawEnabledChainIds)
    ? rawEnabledChainIds
    : [];

  const [refreshing, setRefreshing] = useState(false);
  const [showNetworkManager, setShowNetworkManager] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [selectedChain, setSelectedChain] = useState("all");

  // ── Portfolio data ──
  const {
    nativeAssets,
    tokenAssets,
    totalValue,
    totalChange24h,
    loading: assetsLoading,
    refresh: refreshAssets,
  } = usePortfolioAssets({
    walletAddress: wallet?.address,
    enabledChainIds: rawEnabledChainIds,
    balances,
    isProduction,
    solanaAddress,
    solanaBalance,
  });

  // If the selected network gets disabled, fall back to "All"
  const activeChain =
    selectedChain !== "all" && enabledChainIds.includes(selectedChain)
      ? selectedChain
      : "all";

  const visibleNative = useMemo(
    () =>
      activeChain === "all"
        ? nativeAssets
        : nativeAssets.filter((a) => a.chainId === activeChain),
    [nativeAssets, activeChain],
  );

  const visibleTokens = useMemo(
    () =>
      activeChain === "all"
        ? tokenAssets
        : tokenAssets.filter((t) => t.chainId === activeChain),
    [tokenAssets, activeChain],
  );

  // Group tokens by chain
  const tokensByChain = useMemo(() => {
    const map = {};
    for (const token of visibleTokens) {
      if (!map[token.chainId]) map[token.chainId] = [];
      map[token.chainId].push(token);
    }
    return map;
  }, [visibleTokens]);

  const totalAssetCount = nativeAssets.length + tokenAssets.length;
  const visibleCount = visibleNative.length + visibleTokens.length;

  // ── Init ──
  useEffect(() => {
    if (wallet) refreshBalance();
  }, [wallet]);

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([refreshBalance(), refreshAssets()]);
    setRefreshing(false);
  };

  const isLoading = assetsLoading || loading;

  const dynStyles = useMemo(
    () => getDynStyles(COLORS, isDark),
    [COLORS, isDark],
  );

  const openToken = (asset) =>
    navigation.navigate("TokenDetail", {
      chain: asset.chain,
      balance: asset.balance,
      usdValue: asset.usdValue,
      price: asset.price,
      priceChange24h: asset.priceChange24h,
      walletAddress: wallet?.address,
    });

  // ── Render ──
  return (
    <View
      style={[staticStyles.container, { backgroundColor: COLORS.background }]}
    >
      <ScrollView
        contentContainerStyle={staticStyles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={COLORS.primary}
            colors={[COLORS.primary]}
          />
        }
        showsVerticalScrollIndicator={false}
      >
        {/* ── Top bar ── */}
        <View style={staticStyles.header}>
          <UserIcon />

          <Pressable
            onPress={() => navigation.navigate("AccountManager")}
            style={dynStyles.walletPill}
            accessibilityRole="button"
            accessibilityLabel="Switch account"
          >
            <Text
              numberOfLines={1}
              style={[staticStyles.walletName, { color: COLORS.text }]}
            >
              {wallet?.name || "My Wallet"}
            </Text>
            <Ionicons
              name="chevron-down"
              size={14}
              color={COLORS.textSecondary}
            />
          </Pressable>

          <View style={staticStyles.headerActions}>
            {/* Wallet identity (@username) for the active account */}
            <Pressable
              onPress={() => navigation.navigate("BindWallet")}
              style={dynStyles.headerBtn}
              accessibilityRole="button"
              accessibilityLabel={
                identity ? `Identity @${identity.username}` : "Claim a username"
              }
            >
              <Ionicons
                name={identity ? "at-circle" : "at-circle-outline"}
                size={21}
                color={identity ? COLORS.primary : COLORS.text}
              />
              {!identity && <View style={dynStyles.identityDot} />}
            </Pressable>
            <Pressable onPress={toggleTheme} style={dynStyles.headerBtn}>
              <Ionicons
                name={isDark ? "sunny-outline" : "moon-outline"}
                size={19}
                color={COLORS.primary}
              />
            </Pressable>
            <Pressable
              onPress={() => navigation.navigate("Settings")}
              style={dynStyles.headerBtn}
            >
              <Ionicons
                name="settings-outline"
                size={19}
                color={COLORS.text}
              />
            </Pressable>
          </View>
        </View>

        {/* ── Balance hero ── */}
        <PortfolioSummary
          totalValue={totalValue}
          totalChange24h={totalChange24h}
          loading={isLoading}
          walletAddress={wallet?.address}
          tokenCount={totalAssetCount}
        />

        {/* ── Quick actions dock ── */}
        <View style={dynStyles.actionsDock}>
          <QuickAction
            icon="arrow-up-outline"
            label="Send"
            slant
            styles={dynStyles}
            textColor={COLORS.text}
            onPress={() => navigation.navigate("Send")}
          />
          <QuickAction
            icon="arrow-down-outline"
            label="Receive"
            slant
            styles={dynStyles}
            textColor={COLORS.text}
            onPress={() => navigation.navigate("Receive")}
          />
          <QuickAction
            icon="scan-outline"
            label="Scan"
            styles={dynStyles}
            textColor={COLORS.text}
            onPress={() => setShowScanner(true)}
          />
          <QuickAction
            icon="images-outline"
            label="NFTs"
            styles={dynStyles}
            textColor={COLORS.text}
            onPress={() => navigation.navigate("NFTs")}
          />
        </View>

        <BannerCarousel />

        {/* ── Assets header ── */}
        <View style={staticStyles.sectionHeader}>
          <View style={staticStyles.sectionTitleRow}>
            <Text style={[staticStyles.sectionTitle, { color: COLORS.text }]}>
              Assets
            </Text>
            {!isLoading && totalAssetCount > 0 && (
              <View style={dynStyles.countBadge}>
                <Text style={dynStyles.countBadgeText}>{totalAssetCount}</Text>
              </View>
            )}
          </View>
          <Pressable
            onPress={() => navigation.navigate("Tokens")}
            hitSlop={8}
            style={staticStyles.seeAll}
          >
            <Text
              style={[staticStyles.seeAllText, { color: COLORS.textSecondary }]}
            >
              See all
            </Text>
            <Ionicons
              name="chevron-forward"
              size={16}
              color={COLORS.textSecondary}
            />
          </Pressable>
        </View>

        {/* ── Network filter chips ── */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={staticStyles.chipRow}
          style={staticStyles.chipScroll}
        >
          <Pressable
            onPress={() => setSelectedChain("all")}
            style={[
              dynStyles.chip,
              activeChain === "all" && dynStyles.chipActive,
            ]}
          >
            <Text
              style={[
                staticStyles.chipText,
                { color: activeChain === "all" ? "#000" : COLORS.text },
              ]}
            >
              All
            </Text>
          </Pressable>

          {enabledChainIds.map((id) => {
            const chain = getChain(id);
            const active = activeChain === id;
            return (
              <Pressable
                key={id}
                onPress={() => setSelectedChain(id)}
                style={[dynStyles.chip, active && dynStyles.chipActive]}
              >
                {chain?.icon ? (
                  <Image
                    source={{ uri: chain.icon }}
                    style={staticStyles.chipIcon}
                  />
                ) : null}
                <Text
                  style={[
                    staticStyles.chipText,
                    { color: active ? "#000" : COLORS.text },
                  ]}
                >
                  {chain?.name ?? `Chain ${id}`}
                </Text>
              </Pressable>
            );
          })}

          <Pressable
            onPress={() => setShowNetworkManager(true)}
            style={[dynStyles.chip, staticStyles.chipManage]}
            accessibilityLabel="Manage networks"
          >
            <Ionicons name="layers-outline" size={16} color={COLORS.primary} />
          </Pressable>
        </ScrollView>

        {/* ── Asset list ── */}
        <View>
          {isLoading ? (
            [...Array(3)].map((_, i) => <AssetSkeletonRow key={i} />)
          ) : visibleCount === 0 ? (
            <View style={dynStyles.emptyCard}>
              <View style={dynStyles.emptyIconWrap}>
                <Ionicons
                  name="wallet-outline"
                  size={28}
                  color={COLORS.primary}
                />
              </View>
              <Text style={[staticStyles.emptyText, { color: COLORS.text }]}>
                {activeChain === "all"
                  ? "No assets yet"
                  : "Nothing on this network"}
              </Text>
              <Text
                style={[
                  staticStyles.emptySubtext,
                  { color: COLORS.textSecondary },
                ]}
              >
                {activeChain === "all"
                  ? "Turn on a network to see your balances, or receive funds to get started."
                  : "Switch networks or receive funds to this address."}
              </Text>
              <View style={staticStyles.emptyActions}>
                <Pressable
                  onPress={() => navigation.navigate("Receive")}
                  style={dynStyles.emptyPrimaryBtn}
                >
                  <Text style={staticStyles.emptyPrimaryText}>Receive</Text>
                </Pressable>
                <Pressable
                  onPress={() => setShowNetworkManager(true)}
                  style={dynStyles.emptySecondaryBtn}
                >
                  <Text
                    style={[
                      staticStyles.emptySecondaryText,
                      { color: COLORS.text },
                    ]}
                  >
                    Networks
                  </Text>
                </Pressable>
              </View>
            </View>
          ) : (
            <>
              {/* Native chain assets */}
              {visibleNative.map((asset) => (
                <AssetCard
                  key={`native-${asset.chainId}`}
                  asset={asset}
                  onPress={() => openToken(asset)}
                />
              ))}

              {/* Tokens grouped by chain */}
              {Object.entries(tokensByChain).map(([chainId, tokens]) => {
                // Object keys are strings: numeric for EVM, "SOLANA" for Solana
                const chain = getChain(
                  /^\d+$/.test(chainId) ? parseInt(chainId) : chainId,
                );
                return (
                  <View key={chainId}>
                    {activeChain === "all" && (
                      <View style={staticStyles.tokenSectionRow}>
                        {chain?.icon && (
                          <Image
                            source={{ uri: chain.icon }}
                            style={staticStyles.tokenSectionIcon}
                          />
                        )}
                        <Text
                          style={[
                            staticStyles.tokenSectionLabel,
                            { color: COLORS.textSecondary },
                          ]}
                        >
                          {chain?.name ?? `Chain ${chainId}`} tokens
                        </Text>
                        <View
                          style={[
                            staticStyles.tokenSectionLine,
                            { backgroundColor: COLORS.primary + "20" },
                          ]}
                        />
                      </View>
                    )}
                    {tokens.map((token) => (
                      <TokenAssetCard
                        key={token._id}
                        asset={token}
                        onPress={() =>
                          navigation.navigate("TokenDetail", {
                            token: {
                              address: token.address,
                              symbol: token.symbol,
                              name: token.name,
                              decimals: token.decimals,
                              logoURI: token.logo,
                            },
                            chain,
                            balance: token.balance,
                            usdValue: token.usdValue,
                            price: token.price,
                            priceChange24h: token.priceChange24h,
                            walletAddress: wallet?.address,
                            chainId: token.chainId,
                          })
                        }
                        onSend={
                          // SendScreen is EVM-only
                          token.networkType === "solana"
                            ? undefined
                            : () =>
                                navigation.navigate("Send", {
                                  token: { ...token, balance: token.balance },
                                  chain,
                                })
                        }
                      />
                    ))}
                  </View>
                );
              })}
            </>
          )}
        </View>
      </ScrollView>

      <NetworkManager
        visible={showNetworkManager}
        onClose={() => setShowNetworkManager(false)}
      />

      <QRScanner
        visible={showScanner}
        onClose={() => setShowScanner(false)}
        onScan={(address) =>
          navigation.navigate("Send", { recipient: address })
        }
      />
    </View>
  );
};

// ─── Static styles (no theme dependency) ──────────────────────────────────────
const staticStyles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: {
    paddingHorizontal: SPACING.sm,
    paddingTop: SPACING.md,
    paddingBottom: 100,
  },

  // Top bar
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: SPACING.md,
    paddingTop: SPACING.sm,
    gap: SPACING.sm,
  },
  walletName: {
    fontSize: FONTS.sizes.md,
    fontWeight: "700",
    maxWidth: 160,
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.xs,
  },

  // Quick actions
  actionItem: { flex: 1, alignItems: "center", gap: 8 },
  actionPressed: { opacity: 0.8, transform: [{ scale: 0.96 }] },
  actionLabel: { fontSize: FONTS.sizes.xs, fontWeight: "700" },
  // Turns up/down icons into diagonal arrows (↗ send, ↙ receive)
  slantIcon: { transform: [{ rotate: "45deg" }] },

  // Section header
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: SPACING.sm,
    marginBottom: SPACING.sm,
  },
  sectionTitleRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  sectionTitle: { fontSize: FONTS.sizes.lg, fontWeight: "800" },
  seeAll: { flexDirection: "row", alignItems: "center" },
  seeAllText: { fontSize: FONTS.sizes.sm, fontWeight: "600" },

  // Chips
  chipScroll: { marginHorizontal: -SPACING.sm },
  chipRow: {
    paddingHorizontal: SPACING.sm,
    gap: 8,
    paddingBottom: SPACING.sm,
  },
  chipText: { fontSize: FONTS.sizes.sm, fontWeight: "700" },
  chipIcon: { width: 16, height: 16, borderRadius: 8 },
  chipManage: { paddingHorizontal: 10 },

  // Token section divider
  tokenSectionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: SPACING.md,
    marginBottom: SPACING.sm,
  },
  tokenSectionIcon: { width: 14, height: 14, borderRadius: 7 },
  tokenSectionLabel: { fontSize: FONTS.sizes.xs, fontWeight: "700" },
  tokenSectionLine: { flex: 1, height: 1, marginLeft: 4 },

  // Empty state
  emptyText: {
    fontSize: FONTS.sizes.md,
    fontWeight: "800",
    marginTop: SPACING.xs,
  },
  emptySubtext: {
    fontSize: FONTS.sizes.sm,
    textAlign: "center",
    lineHeight: 20,
    maxWidth: 280,
  },
  emptyActions: { flexDirection: "row", gap: SPACING.sm, marginTop: SPACING.sm },
  emptyPrimaryText: {
    color: "#000",
    fontSize: FONTS.sizes.sm,
    fontWeight: "800",
  },
  emptySecondaryText: { fontSize: FONTS.sizes.sm, fontWeight: "700" },
});

const skeletonStyles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
    marginBottom: SPACING.sm,
    borderRadius: 16,
    gap: SPACING.md,
  },
});

// ─── Theme-dependent styles (memoized per theme change) ───────────────────────
const getDynStyles = (COLORS, isDark) =>
  StyleSheet.create({
    headerBtn: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: COLORS.surface,
      justifyContent: "center",
      alignItems: "center",
    },
    // "not linked yet" nudge on the identity button
    identityDot: {
      position: "absolute",
      top: 8,
      right: 8,
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: COLORS.primary,
      borderWidth: 1.5,
      borderColor: COLORS.surface,
    },
    walletPill: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      alignSelf: "center",
      gap: 6,
      height: 40,
      paddingHorizontal: 14,
      borderRadius: 20,
      backgroundColor: COLORS.surface,
      borderWidth: 1,
      borderColor: COLORS.primary + "25",
    },

    actionsDock: {
      flexDirection: "row",
      paddingVertical: SPACING.md,
      paddingHorizontal: SPACING.xs,
      marginBottom: SPACING.lg,
      borderRadius: 24,
      backgroundColor: COLORS.surface,
      borderWidth: 1,
      borderColor: COLORS.primary + "20",
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: isDark ? 0.2 : 0.06,
      shadowRadius: 8,
      elevation: 3,
    },
    actionCircle: {
      width: 56,
      height: 56,
      borderRadius: 28,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: COLORS.primary,
    },

    countBadge: {
      minWidth: 22,
      height: 22,
      paddingHorizontal: 6,
      borderRadius: 11,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: COLORS.primary + "22",
    },
    countBadgeText: {
      color: COLORS.primary,
      fontSize: FONTS.sizes.xs,
      fontWeight: "800",
    },

    chip: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      height: 34,
      paddingHorizontal: 14,
      borderRadius: 17,
      backgroundColor: COLORS.surface,
      borderWidth: 1,
      borderColor: COLORS.primary + "25",
    },
    chipActive: {
      backgroundColor: COLORS.primary,
      borderColor: COLORS.primary,
    },

    emptyCard: {
      alignItems: "center",
      gap: SPACING.sm,
      padding: SPACING.xl,
      borderRadius: 24,
      backgroundColor: COLORS.surface,
      borderWidth: 1,
      borderColor: COLORS.primary + "20",
    },
    emptyIconWrap: {
      width: 60,
      height: 60,
      borderRadius: 30,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: COLORS.primary + "18",
    },
    emptyPrimaryBtn: {
      paddingHorizontal: 20,
      height: 40,
      borderRadius: 20,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: COLORS.primary,
    },
    emptySecondaryBtn: {
      paddingHorizontal: 20,
      height: 40,
      borderRadius: 20,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 1,
      borderColor: COLORS.primary + "40",
    },
  });

export default HomeScreen;