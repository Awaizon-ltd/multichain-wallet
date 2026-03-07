import React, { useEffect, useState, useRef, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  Pressable,
  Image,
  FlatList,
  Dimensions,
  Animated,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useWallet } from "../../contexts/WalletContext";
import { useTheme } from "../../contexts/ThemeContext";
import Card from "../../components/common/Card";
import ChainSwitcher from "../../components/wallet/ChainSwitcher";
import PortfolioSummary from "../../components/wallet/PortfolioSummary";
import AssetCard from "../../components/wallet/AssetsCard";
import { SPACING, FONTS } from "../../constants/Theme";
import { getAllNFTsAcrossChains } from "../../utils/blockchain/NFTs";
import { getAllNativePrices } from "../../services/coingecko";
import { useChain } from "../../contexts/ChainContext";
import { SUPPORTED_CHAINS } from "../../constants/Chain";
import UserIcon from "../../components/common/UserIcon";

const { width } = Dimensions.get("window");
const NFT_CARD_WIDTH = 150;
const DEFAULT_VISIBLE_CHAINS = [5000, 1, 8453];

// ── Skeleton bone ──
const SkeletonBone = ({ width: w, height, borderRadius = 8, style }) => {
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
};

// ── NFT skeleton card ──
const NFTSkeletonCard = () => {
  const { COLORS } = useTheme();
  return (
    <View style={{ width: NFT_CARD_WIDTH, marginRight: SPACING.sm }}>
      <SkeletonBone
        w={NFT_CARD_WIDTH}
        height={NFT_CARD_WIDTH}
        borderRadius={12}
      />
      <SkeletonBone
        w={NFT_CARD_WIDTH * 0.7}
        height={11}
        borderRadius={6}
        style={{ marginTop: 8 }}
      />
      <SkeletonBone
        w={NFT_CARD_WIDTH * 0.45}
        height={9}
        borderRadius={6}
        style={{ marginTop: 5 }}
      />
    </View>
  );
};

// ── Asset skeleton row ──
const AssetSkeletonRow = () => {
  const { COLORS } = useTheme();
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        paddingVertical: SPACING.sm,
        paddingHorizontal: SPACING.md,
        marginBottom: SPACING.sm,
        backgroundColor: COLORS.card,
        borderRadius: 12,
        gap: SPACING.md,
      }}
    >
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

const HomeScreen = ({ navigation }) => {
  const { COLORS, toggleTheme, isDark } = useTheme();
  const { wallet, selectedChain, balances, refreshBalance, loading } =
    useWallet();

  const [refreshing, setRefreshing] = useState(false);
  const { activeChain, isProduction } = useChain();
  const [showChainSwitcher, setShowChainSwitcher] = useState(false);

  // ── Tab state ──
  const [activeTab, setActiveTab] = useState("assets"); // "assets" | "collectibles"
  const tabUnderline = useRef(new Animated.Value(0)).current;

  // ── NFT state ──
  const [nfts, setNfts] = useState([]);
  const [loadingNFTs, setLoadingNFTs] = useState(false);
  const [totalNFTCount, setTotalNFTCount] = useState(0);
  const [nftFetched, setNftFetched] = useState(false); // fetch once per session

  // ── Price state ──
  const [prices, setPrices] = useState({});
  const [loadingPrices, setLoadingPrices] = useState(true);

  useEffect(() => {
    if (wallet) {
      refreshBalance();
      loadPrices();
    }
  }, [wallet]);

  // Fetch NFTs only when tab becomes active and not yet fetched
  useEffect(() => {
    if (activeTab === "collectibles" && !nftFetched && wallet?.address) {
      loadNFTs();
    }
  }, [activeTab]);

  const loadPrices = async () => {
    try {
      setLoadingPrices(true);
      const nativePrices = await getAllNativePrices();
      setPrices(nativePrices);
    } catch (error) {
      console.error("Error loading prices:", error);
    } finally {
      setLoadingPrices(false);
    }
  };

  const loadNFTs = async () => {
    if (!wallet?.address) return;
    try {
      setLoadingNFTs(true);
      const result = await getAllNFTsAcrossChains(wallet.address);
      setNfts((result.nfts || []).slice(0, 20));
      setTotalNFTCount(result.totalCount || 0);
      setNftFetched(true);
    } catch (error) {
      console.error("Error loading NFTs:", error);
    } finally {
      setLoadingNFTs(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    if (activeTab === "collectibles") setNftFetched(false);
    await Promise.all([
      refreshBalance(),
      loadPrices(),
      activeTab === "collectibles" ? loadNFTs() : Promise.resolve(),
    ]);
    setRefreshing(false);
  };

  const switchTab = (tab) => {
    setActiveTab(tab);
    Animated.spring(tabUnderline, {
      toValue: tab === "assets" ? 0 : 1,
      useNativeDriver: false,
      tension: 80,
      friction: 10,
    }).start();
  };

  const getAssetsWithPrices = () => {
    const assets = [];
    const allChains = Object.values(SUPPORTED_CHAINS);
    const availableChains = isProduction
      ? allChains.filter((c) => !c.testnet)
      : allChains;

    availableChains.forEach((chain) => {
      const balance = balances[chain.id];
      const balanceValue = balance ? parseFloat(balance.formatted) : 0;
      const priceData = prices[chain.symbol];
      const price = priceData?.usd || 0;
      const priceChange24h = priceData?.usd_24h_change;
      const usdValue = balanceValue * price;
      const shouldShow =
        DEFAULT_VISIBLE_CHAINS.includes(chain.id) || balanceValue > 0;

      if (shouldShow) {
        assets.push({
          chain,
          balance: balanceValue.toString(),
          usdValue,
          price,
          priceChange24h,
          isZeroBalance: balanceValue === 0,
          isTestnet: chain.testnet,
        });
      }
    });

    return assets.sort((a, b) => {
      if (a.isZeroBalance && !b.isZeroBalance) return 1;
      if (!a.isZeroBalance && b.isZeroBalance) return -1;
      return b.usdValue - a.usdValue;
    });
  };

  const calculatePortfolioStats = () => {
    const assets = getAssetsWithPrices();
    const includesTestnet = assets.some((a) => a.isTestnet);
    const totalValue = assets.reduce((sum, a) => sum + a.usdValue, 0);
    let totalChange = 0,
      totalWeight = 0;
    assets.forEach((a) => {
      if (a.priceChange24h && a.usdValue > 0) {
        totalChange += a.priceChange24h * a.usdValue;
        totalWeight += a.usdValue;
      }
    });
    return {
      totalValue,
      totalChange24h: totalWeight > 0 ? totalChange / totalWeight : 0,
      includesTestnet,
    };
  };

  const assets = getAssetsWithPrices();
  const { totalValue, totalChange24h, includesTestnet } =
    calculatePortfolioStats();

  const tabIndicatorLeft = tabUnderline.interpolate({
    inputRange: [0, 1],
    outputRange: ["0%", "50%"],
  });

  const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: COLORS.background },
    scrollContent: { padding: SPACING.md, paddingBottom: 100 },

    // Header
    header: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: SPACING.md,
      paddingTop: SPACING.sm,
    },
    headerActions: {
      flexDirection: "row",
      alignItems: "center",
      gap: SPACING.sm,
    },
    chainButton: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: COLORS.surface,
      justifyContent: "center",
      alignItems: "center",
      overflow: "hidden",
      borderWidth: 2,
      borderColor: COLORS.primary + "30",
    },
    chainButtonIcon: { width: 28, height: 28, borderRadius: 14 },

    walletNameContainer: {
      flexDirection: "row",
      alignItems: "center",
      flex: 1,
      marginLeft: 8,
    },
    walletName: {
      fontSize: FONTS.sizes.xl,
      fontWeight: "bold",
      color: COLORS.text,
    },
    themeButton: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: COLORS.surface,
      justifyContent: "center",
      alignItems: "center",
      borderWidth: 2,
      borderColor: COLORS.primary + "30",
    },
    settingsButton: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: COLORS.surface,
      justifyContent: "center",
      alignItems: "center",
    },

    // Actions
    actionsGrid: {
      flexDirection: "row",
      justifyContent: "space-between",
      marginBottom: SPACING.lg,
      gap: SPACING.sm,
    },
    actionButton: { flex: 1, alignItems: "center", gap: 6 },
    actionIconContainer: {
      width: 56,
      height: 56,
      borderRadius: 16,
      justifyContent: "center",
      alignItems: "center",
    },
    actionLabel: {
      fontSize: FONTS.sizes.xs,
      color: COLORS.text,
      fontWeight: "500",
    },

    // ── Tab switcher ──
    tabContainer: {
      marginBottom: SPACING.md,
      backgroundColor: COLORS.surface,
      borderRadius: 14,
      padding: 4,
      flexDirection: "row",
      position: "relative",
    },
    tabIndicator: {
      position: "absolute",
      top: 4,
      bottom: 4,
      width: "50%",
      backgroundColor: COLORS.card,
      borderRadius: 10,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.08,
      shadowRadius: 4,
      elevation: 3,
      borderWidth: 1,
      borderColor: COLORS.primary + "25",
    },
    tabButton: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      paddingVertical: 10,
      gap: 6,
      zIndex: 1,
    },
    tabButtonText: { fontSize: FONTS.sizes.sm, fontWeight: "600" },
    tabBadge: {
      minWidth: 18,
      height: 18,
      borderRadius: 9,
      backgroundColor: COLORS.primary,
      justifyContent: "center",
      alignItems: "center",
      paddingHorizontal: 4,
    },
    tabBadgeText: {
      fontSize: 10,
      fontWeight: "700",
      color: isDark ? COLORS.background : "#fff",
    },

    // NFT grid
    nftGrid: { flexDirection: "row", flexWrap: "wrap", gap: SPACING.sm },
    nftCard: {
      width: NFT_CARD_WIDTH,
      backgroundColor: COLORS.surface,
      borderRadius: 12,
      overflow: "hidden",
    },
    nftImage: {
      width: NFT_CARD_WIDTH,
      height: NFT_CARD_WIDTH,
      backgroundColor: COLORS.background,
    },
    nftImagePlaceholder: {
      width: NFT_CARD_WIDTH,
      height: NFT_CARD_WIDTH,
      backgroundColor: COLORS.background,
      justifyContent: "center",
      alignItems: "center",
    },
    chainBadge: {
      position: "absolute",
      top: 8,
      right: 8,
      backgroundColor: COLORS.surface,
      borderRadius: 12,
      padding: 4,
      elevation: 3,
    },
    chainIcon: { width: 20, height: 20, borderRadius: 10 },
    nftInfo: { padding: SPACING.xs },
    nftName: {
      fontSize: FONTS.sizes.xs,
      fontWeight: "600",
      color: COLORS.text,
    },
    nftChain: { fontSize: 10, color: COLORS.textTertiary, marginTop: 2 },

    emptyCard: { padding: SPACING.xl, alignItems: "center", gap: SPACING.sm },
    emptyText: {
      fontSize: FONTS.sizes.md,
      fontWeight: "600",
      color: COLORS.textSecondary,
    },
    emptySubtext: { fontSize: FONTS.sizes.xs, color: COLORS.textTertiary },
    // Replace only the actionsGrid styles and ActionButton component + JSX

    // ── In styles ──
    actionsRow: {
      flexDirection: "row",
      gap: SPACING.sm,
      marginBottom: SPACING.sm,
    },
    actionPrimary: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: SPACING.sm,
      paddingVertical: SPACING.md,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: COLORS.primary + "30",
      backgroundColor: isDark ? COLORS.card : "#FFFFFF",
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: isDark ? 0.2 : 0.07,
      shadowRadius: 8,
      elevation: 4,
    },
    actionPrimaryIcon: {
      width: 36,
      height: 36,
      borderRadius: 10,
      justifyContent: "center",
      alignItems: "center",
    },
    actionPrimaryLabel: {
      fontSize: FONTS.sizes.sm,
      fontWeight: "700",
      color: COLORS.text,
    },
    actionSecondaryRow: {
      flexDirection: "row",
      gap: SPACING.sm,
      marginBottom: SPACING.lg,
    },
    actionSecondary: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      gap: 5,
      paddingVertical: SPACING.sm + 2,
      borderRadius: 14,
      backgroundColor: COLORS.surface,
      borderWidth: 1,
      borderColor: COLORS.divider,
    },
    actionSecondaryIcon: {
      width: 30,
      height: 30,
      borderRadius: 9,
      justifyContent: "center",
      alignItems: "center",
    },
    actionSecondaryLabel: {
      fontSize: 10,
      fontWeight: "600",
      color: COLORS.textSecondary,
    },
  });

  const ActionButton = ({ icon, label, onPress, color = COLORS.primary }) => (
    <Pressable style={styles.actionButton} onPress={onPress}>
      <View
        style={[styles.actionIconContainer, { backgroundColor: color + "15" }]}
      >
        <Ionicons name={icon} size={24} color={color} />
      </View>
      <Text style={styles.actionLabel}>{label}</Text>
    </Pressable>
  );

  const getImageUrl = (nft) => {
    if (nft.image?.cachedUrl) return nft.image.cachedUrl;
    if (nft.image?.thumbnailUrl) return nft.image.thumbnailUrl;
    if (nft.image?.originalUrl) return nft.image.originalUrl;
    if (nft.media?.[0]?.gateway) return nft.media[0].gateway;
    return null;
  };

  const getChainIcon = (chainId) => {
    const chain = Object.values(SUPPORTED_CHAINS).find((c) => c.id === chainId);
    return chain?.icon;
  };

  const NFTCard = ({ nft }) => {
    const imageUrl = getImageUrl(nft);
    const chainIcon = getChainIcon(nft.chainId);
    return (
      <Pressable
        style={styles.nftCard}
        onPress={() => navigation.navigate("NFTs")}
      >
        {imageUrl ? (
          <Image
            source={{ uri: imageUrl }}
            style={styles.nftImage}
            resizeMode="cover"
          />
        ) : (
          <View style={styles.nftImagePlaceholder}>
            <Ionicons
              name="image-outline"
              size={32}
              color={COLORS.textTertiary}
            />
          </View>
        )}
        {chainIcon && (
          <View style={styles.chainBadge}>
            <Image source={{ uri: chainIcon }} style={styles.chainIcon} />
          </View>
        )}
        <View style={styles.nftInfo}>
          <Text style={styles.nftName} numberOfLines={1}>
            {nft.name || nft.title || `#${nft.tokenId}`}
          </Text>
          <Text style={styles.nftChain} numberOfLines={1}>
            {nft.chainName}
          </Text>
        </View>
      </Pressable>
    );
  };

  const renderNFTSkeletons = () => (
    <View style={styles.nftGrid}>
      {[...Array(6)].map((_, i) => (
        <NFTSkeletonCard key={i} />
      ))}
    </View>
  );

  const renderAssetSkeletons = () => (
    <View>
      {[...Array(4)].map((_, i) => (
        <AssetSkeletonRow key={i} />
      ))}
    </View>
  );

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <UserIcon />

          {/* Wallet Name with Dropdown */}
          <Pressable
            onPress={() => navigation.navigate("AccountManager")}
            style={styles.walletNameContainer}
          >
            <Text style={styles.walletName}>{wallet?.name || "My Wallet"}</Text>

            <Ionicons
              name="chevron-down"
              size={16}
              color={COLORS.text}
              style={{ marginLeft: 4 }}
            />
          </Pressable>

          <View style={styles.headerActions}>
            <Pressable
              onPress={() => setShowChainSwitcher(true)}
              style={styles.chainButton}
            >
              <Image
                source={{ uri: activeChain.icon }}
                style={styles.chainButtonIcon}
              />
            </Pressable>

            <Pressable onPress={toggleTheme} style={styles.themeButton}>
              <Ionicons
                name={isDark ? "sunny-outline" : "moon-outline"}
                size={19}
                color={COLORS.primary}
              />
            </Pressable>

            <Pressable
              onPress={() => navigation.navigate("Settings")}
              style={styles.settingsButton}
            >
              <Ionicons name="settings-outline" size={24} color={COLORS.text} />
            </Pressable>
          </View>
        </View>
        {/* Portfolio Summary */}
        <PortfolioSummary
          totalValue={totalValue}
          totalChange24h={totalChange24h}
          loading={loadingPrices || loading}
          includesTestnet={includesTestnet}
          walletAddress={wallet?.address}
        />
        {/* Quick Actions */}
        // ── Replace the Quick Actions JSX block ──
        {/* Quick Actions */}
        <View style={{ marginBottom: SPACING.lg }}>
          {/* Primary row — Send & Receive */}
          <View style={styles.actionsRow}>
            <Pressable
              style={({ pressed }) => [
                styles.actionPrimary,
                pressed && { opacity: 0.85, transform: [{ scale: 0.98 }] },
              ]}
              onPress={() => navigation.navigate("Send")}
            >
              <View
                style={[
                  styles.actionPrimaryIcon,
                  { backgroundColor: COLORS.primary + "18" },
                ]}
              >
                <Ionicons
                  name="arrow-up-outline"
                  size={20}
                  color={COLORS.primary}
                />
              </View>
              <Text style={styles.actionPrimaryLabel}>Send</Text>
            </Pressable>

            <Pressable
              style={({ pressed }) => [
                styles.actionPrimary,
                pressed && { opacity: 0.85, transform: [{ scale: 0.98 }] },
              ]}
              onPress={() => navigation.navigate("Receive")}
            >
              <View
                style={[
                  styles.actionPrimaryIcon,
                  { backgroundColor: "#4CAF5018" },
                ]}
              >
                <Ionicons name="arrow-down-outline" size={20} color="#4CAF50" />
              </View>
              <Text style={styles.actionPrimaryLabel}>Receive</Text>
            </Pressable>
          </View>

          {/* Secondary row — Tokens, Activity, (+ room for more) */}
          <View style={styles.actionSecondaryRow}>
            <Pressable
              style={({ pressed }) => [
                styles.actionSecondary,
                pressed && { opacity: 0.8 },
              ]}
              onPress={() => navigation.navigate("Tokens")}
            >
              <View
                style={[
                  styles.actionSecondaryIcon,
                  { backgroundColor: "#2196F318" },
                ]}
              >
                <Ionicons name="wallet-outline" size={17} color="#2196F3" />
              </View>
              <Text style={styles.actionSecondaryLabel}>Tokens</Text>
            </Pressable>

            <Pressable
              style={({ pressed }) => [
                styles.actionSecondary,
                pressed && { opacity: 0.8 },
              ]}
              onPress={() => navigation.navigate("Payment")}
            >
              <View
                style={[
                  styles.actionSecondaryIcon,
                  { backgroundColor: COLORS.warningLight + "18" },
                ]}
              >
                <Ionicons
                  name="time-outline"
                  size={17}
                  color={COLORS.warningLight}
                />
              </View>
              <Text style={styles.actionSecondaryLabel}>Payment</Text>
            </Pressable>

            <Pressable
              style={({ pressed }) => [
                styles.actionSecondary,
                pressed && { opacity: 0.8 },
              ]}
              onPress={() => navigation.navigate("BindWallet")}
            >
              <View
                style={[
                  styles.actionSecondaryIcon,
                  { backgroundColor: COLORS.info + "18" },
                ]}
              >
                <Ionicons name="person-outline" size={17} color={COLORS.info} />
              </View>
              <Text style={styles.actionSecondaryLabel}>Identity</Text>
            </Pressable>
          </View>
        </View>
        {/* ── Tab Switcher ── */}
        <View style={styles.tabContainer}>
          <Animated.View
            style={[styles.tabIndicator, { left: tabIndicatorLeft }]}
          />

          <Pressable
            style={styles.tabButton}
            onPress={() => switchTab("assets")}
          >
            <Ionicons
              name={activeTab === "assets" ? "briefcase" : "briefcase-outline"}
              size={16}
              color={
                activeTab === "assets" ? COLORS.primary : COLORS.textTertiary
              }
            />
            <Text
              style={[
                styles.tabButtonText,
                {
                  color:
                    activeTab === "assets"
                      ? COLORS.primary
                      : COLORS.textTertiary,
                },
              ]}
            >
              Assets
            </Text>
          </Pressable>

          <Pressable
            style={styles.tabButton}
            onPress={() => switchTab("collectibles")}
          >
            <Ionicons
              name={activeTab === "collectibles" ? "images" : "images-outline"}
              size={16}
              color={
                activeTab === "collectibles"
                  ? COLORS.primary
                  : COLORS.textTertiary
              }
            />
            <Text
              style={[
                styles.tabButtonText,
                {
                  color:
                    activeTab === "collectibles"
                      ? COLORS.primary
                      : COLORS.textTertiary,
                },
              ]}
            >
              Collectibles
            </Text>
            {totalNFTCount > 0 && (
              <View style={styles.tabBadge}>
                <Text style={styles.tabBadgeText}>{totalNFTCount}</Text>
              </View>
            )}
          </Pressable>
        </View>
        {/* ── Assets Tab ── */}
        {activeTab === "assets" && (
          <View>
            {loadingPrices || loading ? (
              renderAssetSkeletons()
            ) : assets.length === 0 ? (
              <Card style={styles.emptyCard}>
                <Ionicons
                  name="briefcase-outline"
                  size={40}
                  color={COLORS.textTertiary}
                />
                <Text style={styles.emptyText}>No assets found</Text>
              </Card>
            ) : (
              assets.map((asset) => (
                <AssetCard
                  key={asset.chain.id}
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
              ))
            )}
          </View>
        )}
        {/* ── Collectibles Tab ── */}
        {activeTab === "collectibles" && (
          <View>
            {loadingNFTs ? (
              renderNFTSkeletons()
            ) : nfts.length === 0 ? (
              <Card style={styles.emptyCard}>
                <Ionicons
                  name="images-outline"
                  size={40}
                  color={COLORS.textTertiary}
                />
                <Text style={styles.emptyText}>No NFTs yet</Text>
                <Text style={styles.emptySubtext}>
                  Your NFT collection will appear here
                </Text>
              </Card>
            ) : (
              <View style={styles.nftGrid}>
                {nfts.map((nft, index) => (
                  <NFTCard
                    key={`${nft.contract?.address}-${nft.tokenId}-${index}`}
                    nft={nft}
                  />
                ))}
              </View>
            )}
          </View>
        )}
      </ScrollView>

      <ChainSwitcher
        visible={showChainSwitcher}
        onClose={() => setShowChainSwitcher(false)}
      />
    </View>
  );
};

export default HomeScreen;
