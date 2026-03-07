import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Image,
} from "react-native";
import {
  MaterialCommunityIcons,
  Ionicons,
  FontAwesome5,
  Feather,
} from "@expo/vector-icons";
import { useTheme } from "../../contexts/ThemeContext";

const BrowserHome = ({
  navigation,
  wallet,
  address,
  activeChain,
  inputUrl,
  setInputUrl,
  handleNavigate,
  handleUrlSubmit,
  onChainPress,
}) => {
  const { COLORS, SPACING, FONTS, BORDER_RADIUS } = useTheme();
  const [trendingCoins, setTrendingCoins] = useState([]);
  const [topGainers, setTopGainers] = useState([]);
  const [loadingCoins, setLoadingCoins] = useState(true);

  // const quickLinks = [
  //   // {
  //   //   name: "Uniswap",
  //   //   url: "https://app.uniswap.org",
  //   //   icon: "swap-horizontal",
  //   //   iconSet: "MaterialCommunityIcons",
  //   //   color: "#FF007A",
  //   // },
  //   // {
  //   //   name: "Aave",
  //   //   url: "https://app.aave.com",
  //   //   icon: "flash",
  //   //   iconSet: "Ionicons",
  //   //   color: "#B6509E",
  //   // },
  //   // {
  //   //   name: "OpenSea",
  //   //   url: "https://opensea.io",
  //   //   icon: "water",
  //   //   iconSet: "Ionicons",
  //   //   color: "#2081E2",
  //   // },
  //   // {
  //   //   name: "Curve",
  //   //   url: "https://curve.fi",
  //   //   icon: "chart-line",
  //   //   iconSet: "FontAwesome5",
  //   //   color: "#40649F",
  //   // },
  //   {
  //     name: "PancakeSwap",
  //     url: "https://pancakeswap.finance",
  //     icon: "food",
  //     iconSet: "MaterialCommunityIcons",
  //     color: "#1FC7D4",
  //   },
  //   // {
  //   //   name: "SushiSwap",
  //   //   url: "https://www.sushi.com",
  //   //   icon: "sushi",
  //   //   iconSet: "MaterialCommunityIcons",
  //   //   color: "#FA52A0",
  //   // },
  //   // {
  //   //   name: "Compound",
  //   //   url: "https://app.compound.finance",
  //   //   icon: "bank",
  //   //   iconSet: "MaterialCommunityIcons",
  //   //   color: "#00D395",
  //   // },
  //   // {
  //   //   name: "1inch",
  //   //   url: "https://app.1inch.io",
  //   //   icon: "swap-vertical",
  //   //   iconSet: "MaterialCommunityIcons",
  //   //   color: "#94A6C3",
  //   // },
  // ];

  const mantleEcosystem = [
    {
      name: "Refuel",
      url: "https://refuel.mantle.xyz/en/refuel",
      description: "Gas Refuel Station",
      icon: "gas-station",
      iconSet: "MaterialCommunityIcons",
      color: "#000000",
      favicon: "https://refuel.mantle.xyz/favicon.ico",
    },
    {
      name: "Bridge",
      url: "https://app.mantle.xyz/bridge",
      description: "Mantle Bridge",
      icon: "bridge",
      iconSet: "MaterialCommunityIcons",
      color: "#000000",
      favicon: "https://app.mantle.xyz/favicon.ico",
    },
    // {
    //   name: "Uniswap",
    //   url: "https://app.uniswap.org/swap",
    //   description: "Swap MNT on Ethereum",
    //   icon: "swap-horizontal",
    //   iconSet: "MaterialCommunityIcons",
    //   color: "#FF007A",
    //   favicon: "https://app.uniswap.org/favicon.ico",
    // },
    {
      name: "Merchant Moe",
      url: "https://merchantmoe.com/trade",
      description: "Swap MNT on Mantle",
      icon: "storefront",
      iconSet: "MaterialCommunityIcons",
      color: "#6C5DD3",
      favicon: "https://merchantmoe.com/favicon.ico",
    },
    {
      name: "Merkly",
      url: "https://minter.merkly.com/gas",
      description: "Gas Refuel - Merkly",
      icon: "water-pump",
      iconSet: "MaterialCommunityIcons",
      color: "#7B3FE4",
      favicon: "https://minter.merkly.com/favicon.ico",
    },
    {
      name: "Explorer",
      url: "https://explorer.mantle.xyz",
      description: "Mantle Explorer",
      icon: "compass",
      iconSet: "MaterialCommunityIcons",
      color: "#000000",
      favicon: "https://explorer.mantle.xyz/favicon.ico",
    },
  ];

  useEffect(() => {
    fetchCryptoData();
  }, []);

  const fetchCryptoData = async () => {
    setLoadingCoins(true);
    try {
      const trendingResponse = await fetch(
        "https://api.coingecko.com/api/v3/search/trending",
      );
      const trendingData = await trendingResponse.json();
      setTrendingCoins(trendingData.coins.slice(0, 5));

      const gainersResponse = await fetch(
        "https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=100&page=1&sparkline=false&price_change_percentage=24h",
      );
      const gainersData = await gainersResponse.json();

      const sortedGainers = gainersData
        .filter((coin) => coin.price_change_percentage_24h > 0)
        .sort(
          (a, b) =>
            b.price_change_percentage_24h - a.price_change_percentage_24h,
        )
        .slice(0, 5);

      setTopGainers(sortedGainers);
    } catch (error) {
      console.error("Error fetching crypto data:", error);
    } finally {
      setLoadingCoins(false);
    }
  };

  const renderIcon = (iconSet, iconName, size, color) => {
    const iconProps = { name: iconName, size, color };

    switch (iconSet) {
      case "MaterialCommunityIcons":
        return <MaterialCommunityIcons {...iconProps} />;
      case "Ionicons":
        return <Ionicons {...iconProps} />;
      case "FontAwesome5":
        return <FontAwesome5 {...iconProps} />;
      case "Feather":
        return <Feather {...iconProps} />;
      default:
        return <MaterialCommunityIcons {...iconProps} />;
    }
  };

  const renderHomeHeader = () => (
    <View style={styles.homeHeader}>
      <View style={styles.headerIconContainer}>
        <MaterialCommunityIcons name="web" size={32} color={COLORS.primary} />
      </View>
      <Text style={styles.title}>Web3 Browser</Text>
      <Text style={styles.subtitle}>Explore the Decentralized Web</Text>

      {wallet && (
        <View style={styles.walletBadge}>
          <View style={styles.connectedDot} />
          <Text style={styles.walletBadgeText}>Wallet Ready</Text>
          <Text style={styles.walletAddress}>
            {address?.substring(0, 6)}...
            {address?.substring(address.length - 4)}
          </Text>
        </View>
      )}

      {!wallet && (
        <TouchableOpacity
          style={styles.connectButton}
          onPress={() => navigation.navigate("CreateWallet")}
        >
          <Text style={styles.connectButtonText}>Create Wallet to Browse</Text>
        </TouchableOpacity>
      )}
    </View>
  );

  // const renderQuickLink = (item, index) => (
  //   <TouchableOpacity
  //     key={index}
  //     style={styles.quickLinkCard}
  //     onPress={() => handleNavigate(item.url)}
  //     activeOpacity={0.7}
  //   >
  //     <View
  //       style={[
  //         styles.quickLinkIconContainer,
  //         { backgroundColor: item.color + "15" },
  //       ]}
  //     >
  //       {renderIcon(item.iconSet, item.icon, 24, item.color)}
  //     </View>
  //     <Text style={styles.quickLinkName} numberOfLines={1}>
  //       {item.name}
  //     </Text>
  //   </TouchableOpacity>
  // );

  const renderMantleLink = (item, index) => (
    <TouchableOpacity
      key={index}
      style={styles.mantleCard}
      onPress={() => handleNavigate(item.url)}
      activeOpacity={0.7}
    >
      <View style={styles.mantleCardLeft}>
        <View
          style={[
            styles.mantleFaviconContainer,
            { backgroundColor: item.color + "15" },
          ]}
        >
          {item.favicon ? (
            <Image
              source={{ uri: item.favicon }}
              style={styles.favicon}
              defaultSource={renderIcon(
                item.iconSet,
                item.icon,
                24,
                item.color,
              )}
            />
          ) : (
            renderIcon(item.iconSet, item.icon, 24, item.color)
          )}
        </View>
        <View style={styles.mantleInfo}>
          <Text style={styles.mantleName}>{item.name}</Text>
          <Text style={styles.mantleDescription} numberOfLines={1}>
            {item.description}
          </Text>
        </View>
      </View>
      <Ionicons name="chevron-forward" size={20} color={COLORS.textSecondary} />
    </TouchableOpacity>
  );

  const renderCoinCard = (coin, index, isTrending = false) => {
    const coinData = isTrending ? coin.item : coin;
    const priceChange = isTrending
      ? coinData.data?.price_change_percentage_24h?.usd
      : coinData.price_change_percentage_24h;
    const currentPrice = isTrending
      ? coinData.data?.price
      : coinData.current_price;
    const isPositive = priceChange >= 0;

    return (
      <TouchableOpacity
        key={index}
        style={styles.coinCard}
        activeOpacity={0.7}
        onPress={() =>
          handleNavigate(`https://www.coingecko.com/en/coins/${coinData.id}`)
        }
      >
        <View style={styles.coinHeader}>
          <Image
            source={{ uri: isTrending ? coinData.large : coinData.image }}
            style={styles.coinImage}
          />
          <View style={styles.coinInfo}>
            <Text style={styles.coinSymbol}>
              {coinData.symbol.toUpperCase()}
            </Text>
            <Text style={styles.coinName} numberOfLines={1}>
              {coinData.name}
            </Text>
          </View>
          <View style={styles.coinPriceContainer}>
            {currentPrice && (
              <Text style={styles.coinPrice}>
                $
                {currentPrice >= 1
                  ? currentPrice.toFixed(2)
                  : currentPrice.toFixed(6)}
              </Text>
            )}
            {priceChange !== null && priceChange !== undefined && (
              <View
                style={[
                  styles.changeContainer,
                  isPositive ? styles.positiveChange : styles.negativeChange,
                ]}
              >
                <Ionicons
                  name={isPositive ? "trending-up" : "trending-down"}
                  size={12}
                  color={isPositive ? COLORS.success : COLORS.error}
                />
                <Text
                  style={[
                    styles.changeText,
                    isPositive ? styles.positiveText : styles.negativeText,
                  ]}
                >
                  {Math.abs(priceChange).toFixed(2)}%
                </Text>
              </View>
            )}
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  const styles = createStyles(COLORS, SPACING, FONTS, BORDER_RADIUS);

  return (
    <ScrollView
      style={styles.homeContainer}
      contentContainerStyle={styles.homeContent}
      showsVerticalScrollIndicator={false}
    >
      {renderHomeHeader()}

      {/* Search Card */}
      <View style={styles.searchCard}>
        <Ionicons name="search" size={20} color={COLORS.textTertiary} />
        <TextInput
          style={styles.homeSearchInput}
          value={inputUrl}
          onChangeText={setInputUrl}
          onSubmitEditing={handleUrlSubmit}
          placeholder="Search or enter URL..."
          placeholderTextColor={COLORS.textTertiary}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="go"
        />
      </View>

      {/* Chain Selector */}
      <TouchableOpacity onPress={onChainPress} style={styles.chainSelector}>
        <Image source={{ uri: activeChain.icon }} style={styles.chainIcon} />
        <View style={styles.chainInfo}>
          <Text style={styles.chainName}>{activeChain.name}</Text>
          <Text style={styles.chainSubtext}>Active Network</Text>
        </View>
        <Ionicons
          name="chevron-forward"
          size={20}
          color={COLORS.textSecondary}
        />
      </TouchableOpacity>

      {/* Mantle Ecosystem */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <MaterialCommunityIcons
            name="diamond-stone"
            size={20}
            color="#000000"
          />
          <Text style={styles.sectionTitle}>Mantle Ecosystem</Text>
        </View>
        <View style={styles.mantleContainer}>
          {mantleEcosystem.map((link, index) => renderMantleLink(link, index))}
        </View>
      </View>

      {/* Quick Access */}
      {/* <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <MaterialCommunityIcons
            name="lightning-bolt"
            size={20}
            color={COLORS.primary}
          />
          <Text style={styles.sectionTitle}>Quick Access</Text>
        </View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.quickLinksScroll}
        >
          {quickLinks.map((link, index) => renderQuickLink(link, index))}
        </ScrollView>
      </View> */}

      {/* Trending Tokens */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Ionicons name="flame" size={20} color={COLORS.warning} />
          <Text style={styles.sectionTitle}>Trending Tokens</Text>
          <TouchableOpacity
            onPress={fetchCryptoData}
            style={styles.refreshButton}
          >
            <Ionicons name="refresh" size={16} color={COLORS.textSecondary} />
          </TouchableOpacity>
        </View>
        {loadingCoins ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={COLORS.primary} />
          </View>
        ) : (
          <View style={styles.coinsContainer}>
            {trendingCoins.map((coin, index) =>
              renderCoinCard(coin, index, true),
            )}
          </View>
        )}
      </View>

      {/* Top Gainers */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Ionicons name="trending-up" size={20} color={COLORS.success} />
          <Text style={styles.sectionTitle}>Top Gainers (24h)</Text>
        </View>
        {loadingCoins ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={COLORS.primary} />
          </View>
        ) : (
          <View style={styles.coinsContainer}>
            {topGainers.map((coin, index) =>
              renderCoinCard(coin, index, false),
            )}
          </View>
        )}
      </View>

      {/* Footer */}
      <View style={styles.footer}>
        <MaterialCommunityIcons
          name="shield-check"
          size={16}
          color={COLORS.textTertiary}
        />
        <Text style={styles.footerText}>Secured by Web3 • Stay Safe</Text>
      </View>
    </ScrollView>
  );
};

const createStyles = (COLORS, SPACING, FONTS, BORDER_RADIUS) =>
  StyleSheet.create({
    homeContainer: {
      flex: 1,
    },
    homeContent: {
      paddingBottom: SPACING.xl,
    },
    homeHeader: {
      alignItems: "center",
      paddingTop: SPACING.xl,
      paddingBottom: SPACING.lg,
      paddingHorizontal: SPACING.md,
    },
    headerIconContainer: {
      width: 64,
      height: 64,
      borderRadius: BORDER_RADIUS.xl,
      backgroundColor: COLORS.card,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: SPACING.md,
    },
    title: {
      fontSize: FONTS.sizes.xxl,
      fontWeight: "bold",
      color: COLORS.text,
      marginBottom: SPACING.xs,
    },
    subtitle: {
      fontSize: FONTS.sizes.sm,
      color: COLORS.textSecondary,
    },
    walletBadge: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: COLORS.success + "20",
      paddingHorizontal: SPACING.md,
      paddingVertical: SPACING.sm,
      borderRadius: BORDER_RADIUS.md,
      marginTop: SPACING.md,
      gap: SPACING.xs,
    },
    connectedDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: COLORS.success,
    },
    walletBadgeText: {
      fontSize: FONTS.sizes.xs,
      color: COLORS.success,
      fontWeight: "600",
    },
    walletAddress: {
      fontSize: FONTS.sizes.xs,
      color: COLORS.success,
      fontFamily: "monospace",
    },
    connectButton: {
      backgroundColor: COLORS.primary,
      paddingHorizontal: SPACING.lg,
      paddingVertical: SPACING.sm,
      borderRadius: BORDER_RADIUS.md,
      marginTop: SPACING.md,
    },
    connectButtonText: {
      color: COLORS.background,
      fontSize: FONTS.sizes.sm,
      fontWeight: "600",
    },
    searchCard: {
      marginHorizontal: SPACING.md,
      marginBottom: SPACING.md,
      backgroundColor: COLORS.card,
      borderRadius: BORDER_RADIUS.lg,
      padding: SPACING.md,
      flexDirection: "row",
      alignItems: "center",
      gap: SPACING.sm,
      borderWidth: 1,
      borderColor: COLORS.border,
    },
    homeSearchInput: {
      flex: 1,
      fontSize: FONTS.sizes.md,
      color: COLORS.text,
      padding: 0,
    },
    chainSelector: {
      marginHorizontal: SPACING.md,
      marginBottom: SPACING.lg,
      backgroundColor: COLORS.card,
      borderRadius: BORDER_RADIUS.lg,
      padding: SPACING.md,
      flexDirection: "row",
      alignItems: "center",
      borderWidth: 1,
      borderColor: COLORS.border,
    },
    chainIcon: {
      width: 32,
      height: 32,
      borderRadius: 16,
      marginRight: SPACING.sm,
    },
    chainInfo: {
      flex: 1,
    },
    chainName: {
      fontSize: FONTS.sizes.md,
      fontWeight: "600",
      color: COLORS.text,
    },
    chainSubtext: {
      fontSize: FONTS.sizes.xs,
      color: COLORS.textSecondary,
      marginTop: 2,
    },
    section: {
      marginBottom: SPACING.lg,
    },
    sectionHeader: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: SPACING.md,
      marginBottom: SPACING.md,
      gap: SPACING.xs,
    },
    sectionTitle: {
      fontSize: FONTS.sizes.md,
      fontWeight: "600",
      color: COLORS.text,
      flex: 1,
    },
    refreshButton: {
      padding: SPACING.xs,
    },
    // Mantle Ecosystem Styles
    mantleContainer: {
      paddingHorizontal: SPACING.md,
      gap: SPACING.sm,
    },
    mantleCard: {
      backgroundColor: COLORS.card,
      borderRadius: BORDER_RADIUS.lg,
      padding: SPACING.md,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      borderWidth: 1,
      borderColor: COLORS.border,
    },
    mantleCardLeft: {
      flexDirection: "row",
      alignItems: "center",
      flex: 1,
    },
    mantleFaviconContainer: {
      width: 40,
      height: 40,
      borderRadius: BORDER_RADIUS.md,
      alignItems: "center",
      justifyContent: "center",
      marginRight: SPACING.sm,
    },
    favicon: {
      width: 24,
      height: 24,
      borderRadius: 4,
    },
    mantleInfo: {
      flex: 1,
    },
    mantleName: {
      fontSize: FONTS.sizes.md,
      fontWeight: "600",
      color: COLORS.text,
      marginBottom: 2,
    },
    mantleDescription: {
      fontSize: FONTS.sizes.xs,
      color: COLORS.textSecondary,
    },
    // Quick Links Styles
    quickLinksScroll: {
      paddingHorizontal: SPACING.md,
      gap: SPACING.md,
    },
    quickLinkCard: {
      width: 100,
      backgroundColor: COLORS.card,
      borderRadius: BORDER_RADIUS.lg,
      padding: SPACING.md,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 1,
      borderColor: COLORS.border,
    },
    quickLinkIconContainer: {
      width: 48,
      height: 48,
      borderRadius: BORDER_RADIUS.md,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: SPACING.sm,
    },
    quickLinkName: {
      fontSize: FONTS.sizes.xs,
      color: COLORS.textSecondary,
      textAlign: "center",
      fontWeight: "500",
    },
    loadingContainer: {
      paddingVertical: SPACING.xl,
      alignItems: "center",
    },
    coinsContainer: {
      paddingHorizontal: SPACING.md,
      gap: SPACING.sm,
    },
    coinCard: {
      backgroundColor: COLORS.card,
      borderRadius: BORDER_RADIUS.lg,
      padding: SPACING.md,
      borderWidth: 1,
      borderColor: COLORS.border,
    },
    coinHeader: {
      flexDirection: "row",
      alignItems: "center",
    },
    coinImage: {
      width: 36,
      height: 36,
      borderRadius: BORDER_RADIUS.round,
      marginRight: SPACING.sm,
    },
    coinInfo: {
      flex: 1,
    },
    coinSymbol: {
      fontSize: FONTS.sizes.md,
      fontWeight: "bold",
      color: COLORS.text,
    },
    coinName: {
      fontSize: FONTS.sizes.xs,
      color: COLORS.textSecondary,
      marginTop: 2,
    },
    coinPriceContainer: {
      alignItems: "flex-end",
    },
    coinPrice: {
      fontSize: FONTS.sizes.md,
      fontWeight: "600",
      color: COLORS.text,
      marginBottom: 4,
    },
    changeContainer: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: SPACING.xs,
      paddingVertical: 2,
      borderRadius: BORDER_RADIUS.sm,
      gap: 4,
    },
    positiveChange: {
      backgroundColor: COLORS.success + "15",
    },
    negativeChange: {
      backgroundColor: COLORS.error + "15",
    },
    changeText: {
      fontSize: FONTS.sizes.xs,
      fontWeight: "600",
    },
    positiveText: {
      color: COLORS.success,
    },
    negativeText: {
      color: COLORS.error,
    },
    footer: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      paddingVertical: SPACING.lg,
      gap: SPACING.xs,
    },
    footerText: {
      fontSize: FONTS.sizes.xs,
      color: COLORS.textTertiary,
    },
  });

export default BrowserHome;
