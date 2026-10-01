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
import Card from "../../components/common/Card";
import PortfolioSummary from "../../components/wallet/PortfolioSummary";
import AssetCard from "../../components/wallet/AssetsCard";
import TokenAssetCard from "../../components/wallet/TokenAssetCard";
import NetworkManager from "../../components/wallet/NetworkManager";
import UserIcon from "../../components/common/UserIcon";
import BannerCarousel from "../../components/BannerCarousel";
import QRScanner from "../../components/wallet/QRScanner";
import usePortfolioAssets from "../../hooks/usePortfolioAssets";
import { SPACING, FONTS } from "../../constants/Theme";

// ── Skeleton bone ──────────────────────────────────────────────────────────────
const SkeletonBone = React.memo(
  ({ width: w, height, borderRadius = 8, style }) => {
    const { COLORS } = useTheme();
    const shimmer = useRef(new Animated.Value(0)).current;

    useEffect(() => {
      Animated.loop(
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
      ).start();
    }, []);

    const opacity = shimmer.interpolate({
      inputRange: [0, 1],
      outputRange: [0.25, 0.55],
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
  },
);

const AssetSkeletonRow = () => {
  return (
    <View style={skeletonStyles.row}>
      <SkeletonBone w={42} height={42} borderRadius={21} />
      <View style={{ flex: 1, gap: 6 }}>
        <SkeletonBone w="60%" height={13} borderRadius={6} />
        <SkeletonBone w="40%" height={10} borderRadius={6} />
      </View>
      <View style={{ alignItems: "flex-end", gap: 6 }}>
        <SkeletonBone w={60} height={13} borderRadius={6} />
        <SkeletonBone w={40} height={10} borderRadius={6} />
      </View>
    </View>
  );
};

// ──────────────────────────────────────────────────────────────────────────────
const HomeScreen = ({ navigation }) => {
  const { COLORS, toggleTheme, isDark } = useTheme();
  const { wallet, balances, refreshBalance, loading } = useWallet();
  const { enabledChainIds, isNetworkEnabled, isProduction, getChain } =
    useChain();

  const [refreshing, setRefreshing] = useState(false);
  const [showNetworkManager, setShowNetworkManager] = useState(false);
  const [showScanner, setShowScanner] = useState(false);

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
    enabledChainIds,
    balances,
    isProduction,
  });

  // Group tokens by chain for section rendering
  const tokensByChain = useMemo(() => {
    const map = {};
    for (const token of tokenAssets) {
      if (!map[token.chainId]) map[token.chainId] = [];
      map[token.chainId].push(token);
    }
    return map;
  }, [tokenAssets]);

  const totalAssetCount = nativeAssets.length + tokenAssets.length;

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

  // ── Styles that depend on theme (must stay inside component) ──
  const dynStyles = useMemo(
    () => getDynStyles(COLORS, isDark),
    [COLORS, isDark],
  );

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
        {/* ── Header ── */}
        <View style={staticStyles.header}>
          <UserIcon />
          <Pressable
            onPress={() => navigation.navigate("AccountManager")}
            style={staticStyles.walletNameContainer}
          >
            <Text style={[staticStyles.walletName, { color: COLORS.text }]}>
              {wallet?.name || "My Wallet"}
            </Text>
            <Ionicons
              name="chevron-down"
              size={16}
              color={COLORS.text}
              style={{ marginLeft: 4 }}
            />
          </Pressable>
          <View style={staticStyles.headerActions}>
            {/* Networks toggle */}
            <Pressable
              onPress={() => setShowNetworkManager(true)}
              style={[
                dynStyles.headerBtn,
                { borderColor: COLORS.primary + "30" },
              ]}
            >
              <Ionicons
                name="layers-outline"
                size={19}
                color={COLORS.primary}
              />
            </Pressable>
            <Pressable
              onPress={toggleTheme}
              style={[
                dynStyles.headerBtn,
                { borderColor: COLORS.primary + "30" },
              ]}
            >
              <Ionicons
                name={isDark ? "sunny-outline" : "moon-outline"}
                size={19}
                color={COLORS.primary}
              />
            </Pressable>
            <Pressable
              onPress={() => navigation.navigate("Settings")}
              style={[dynStyles.headerBtn, { borderColor: "transparent" }]}
            >
              <Ionicons name="settings-outline" size={22} color={COLORS.text} />
            </Pressable>
          </View>
        </View>

        {/* ── Portfolio Summary ── */}
        <PortfolioSummary
          totalValue={totalValue}
          totalChange24h={totalChange24h}
          loading={isLoading}
          walletAddress={wallet?.address}
          tokenCount={totalAssetCount}
        />

        {/* ── Quick Actions: Send / Receive / Scan / Collectibles ── */}
        <View style={staticStyles.actionsRow}>
          <Pressable
            style={({ pressed }) => [
              dynStyles.actionPrimary,
              pressed && staticStyles.actionPressed,
            ]}
            onPress={() => navigation.navigate("Send")}
          >
            <Ionicons
              name="arrow-up-outline"
              size={30}
              color="#000"
              style={staticStyles.slantIcon}
            />
            <Text style={[staticStyles.actionPrimaryLabel, { color: "#000" }]}>
              Send
            </Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [
              dynStyles.actionPrimary,
              pressed && staticStyles.actionPressed,
            ]}
            onPress={() => navigation.navigate("Receive")}
          >
            <Ionicons
              name="arrow-down-outline"
              size={30}
              color="#000"
              style={staticStyles.slantIcon}
            />
            <Text style={[staticStyles.actionPrimaryLabel, { color: "#000" }]}>
              Receive
            </Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [
              dynStyles.actionPrimary,
              pressed && staticStyles.actionPressed,
            ]}
            onPress={() => setShowScanner(true)}
          >
            <Ionicons name="scan-outline" size={30} color="#000" />
            <Text style={[staticStyles.actionPrimaryLabel, { color: "#000" }]}>
              Scan
            </Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [
              dynStyles.actionPrimary,
              pressed && staticStyles.actionPressed,
            ]}
            onPress={() => navigation.navigate("NFTs")}
          >
            <Ionicons name="images-outline" size={30} color="#000" />
            <Text style={[staticStyles.actionPrimaryLabel, { color: "#000" }]}>
              NFTs
            </Text>
          </Pressable>
        </View>

        <BannerCarousel />

        {/* ── Tokens section header ── */}
        <View style={staticStyles.tokensHeaderRow}>
          <Text
            style={[staticStyles.tokensHeaderLabel, { color: COLORS.text }]}
          >
            Tokens
          </Text>
          <Pressable onPress={() => navigation.navigate("Tokens")} hitSlop={8}>
            <Ionicons
              name="arrow-forward"
              size={20}
              color={COLORS.textSecondary}
            />
          </Pressable>
        </View>

        {/* ── Assets ── */}
        <View>
          {isLoading ? (
            <>
              {[...Array(3)].map((_, i) => (
                <AssetSkeletonRow key={i} />
              ))}
            </>
          ) : nativeAssets.length === 0 && tokenAssets.length === 0 ? (
            <Card style={staticStyles.emptyCard}>
              <Ionicons
                name="briefcase-outline"
                size={40}
                color={COLORS.textTertiary}
              />
              <Text
                style={[
                  staticStyles.emptyText,
                  { color: COLORS.textSecondary },
                ]}
              >
                No assets found
              </Text>
              <Text
                style={[
                  staticStyles.emptySubtext,
                  { color: COLORS.textTertiary },
                ]}
              >
                Enable networks above to see your balances
              </Text>
            </Card>
          ) : (
            <>
              {/* Native chain assets */}
              {nativeAssets.map((asset) => (
                <AssetCard
                  key={`native-${asset.chainId}`}
                  asset={asset}
                  onPress={() =>
                    navigation.navigate("TokenDetail", {
                      chain: asset.chain,
                      balance: asset.balance,
                      usdValue: asset.usdValue,
                      price: asset.price,
                      priceChange24h: asset.priceChange24h,
                      walletAddress: wallet?.address,
                    })
                  }
                />
              ))}

              {/* ERC-20 tokens grouped by chain */}
              {Object.entries(tokensByChain).map(([chainId, tokens]) => {
                const chain = getChain(parseInt(chainId));
                return (
                  <View key={chainId}>
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
                        Tokens · {chain?.name ?? `Chain ${chainId}`}
                      </Text>
                    </View>
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
                        onSend={() =>
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

// ─── Static styles (created once, no theme dep) ───────────────────────────────
const staticStyles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: {
    paddingHorizontal: SPACING.sm,
    paddingTop: SPACING.md,
    paddingBottom: 100,
  },

  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: SPACING.md,
    paddingTop: SPACING.sm,
  },
  walletNameContainer: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    marginLeft: 8,
  },
  walletName: { fontSize: FONTS.sizes.xl, fontWeight: "bold" },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.sm,
  },

  actionsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: SPACING.lg,
  },
  actionPrimaryLabel: { fontSize: FONTS.sizes.md, fontWeight: "900" },
  actionPressed: { opacity: 0.85, transform: [{ scale: 0.98 }] },
  // Turns the up/down icon into a diagonal arrow (↗ send, ↙ receive)
  slantIcon: { transform: [{ rotate: "45deg" }] },

  tokensHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: SPACING.sm,
  },
  tokensHeaderLabel: { fontSize: FONTS.sizes.lg, fontWeight: "800" },

  tokenSectionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: SPACING.md,
    marginBottom: SPACING.sm,
  },
  tokenSectionIcon: { width: 14, height: 14, borderRadius: 7 },
  tokenSectionLabel: {
    fontSize: FONTS.sizes.xs,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },

  emptyCard: { padding: SPACING.xl, alignItems: "center", gap: SPACING.sm },
  emptyText: { fontSize: FONTS.sizes.md, fontWeight: "600" },
  emptySubtext: { fontSize: FONTS.sizes.xs, textAlign: "center" },
});

// ─── Dynamic styles (theme-dependent, memoized per theme change) ──────────────
const skeletonStyles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
    marginBottom: SPACING.sm,
    borderRadius: 12,
    gap: SPACING.md,
  },
});

const getDynStyles = (COLORS, isDark) =>
  StyleSheet.create({
    headerBtn: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: COLORS.surface,
      justifyContent: "center",
      alignItems: "center",
      borderWidth: 2,
    },
    actionPrimary: {
      width: "22%", // aspectRatio keeps it square
      aspectRatio: 1,
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      gap: SPACING.xs,
      borderRadius: 16,
      backgroundColor: COLORS.primary,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: isDark ? 0.2 : 0.07,
      shadowRadius: 8,
      elevation: 4,
    },
  });

export default HomeScreen;
