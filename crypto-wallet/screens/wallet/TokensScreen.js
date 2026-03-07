import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  RefreshControl,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  Dimensions,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useWallet } from "../../contexts/WalletContext";
import { useChain } from "../../contexts/ChainContext";
import { useTheme } from "../../contexts/ThemeContext";
import Button from "../../components/common/Button";
import { deleteToken, saveToken } from "../../utils/Database";
import { getTokensByChain } from "../../utils/TokenDatabase";
import tokenList from "../../tokens/TokenList";
import coinGeckoService from "../../services/coingecko";
import Alert from "../../utils/Alert";
import { Contract, formatUnits, ZeroAddress } from "ethers";
import AsyncStorage from "@react-native-async-storage/async-storage";

const { width } = Dimensions.get("window");

// Cache keys
const CACHE_KEYS = {
  TOKEN_METADATA: "token_metadata_cache_",
  CACHE_TIMESTAMP: "token_cache_timestamp_",
};

// Cache expiry (1 hour for metadata, prices fetched fresh)
const METADATA_CACHE_DURATION = 60 * 60 * 1000; // 1 hour

const TokensScreen = ({ navigation }) => {
  const theme = useTheme();
  const styles = createStyles(theme);
  const { wallet, provider } = useWallet();
  const { activeChain, chainId } = useChain();

  const [allTokens, setAllTokens] = useState([]);
  const [displayTokens, setDisplayTokens] = useState([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [portfolioValue, setPortfolioValue] = useState(0);
  const [loadProgress, setLoadProgress] = useState(0);

  const loadingRef = useRef(false);

  useEffect(() => {
    if (wallet?.address && activeChain && provider) {
      loadTokens();
    }
  }, [activeChain, chainId, wallet?.address, provider]);

  /**
   * Get cache key for current chain and user
   */
  const getCacheKey = (type) => {
    return `${type}${activeChain.id}_${wallet?.address?.toLowerCase()}`;
  };

  /**
   * Load cached token metadata
   */
  const loadCachedMetadata = async () => {
    try {
      const cacheKey = getCacheKey(CACHE_KEYS.TOKEN_METADATA);
      const timestampKey = getCacheKey(CACHE_KEYS.CACHE_TIMESTAMP);

      const [cachedData, timestamp] = await Promise.all([
        AsyncStorage.getItem(cacheKey),
        AsyncStorage.getItem(timestampKey),
      ]);

      if (!cachedData || !timestamp) return null;

      const cacheAge = Date.now() - parseInt(timestamp);
      if (cacheAge > METADATA_CACHE_DURATION) {
        return null;
      }

      return JSON.parse(cachedData);
    } catch (error) {
      console.error("[TokensScreen] Error loading cache:", error);
      return null;
    }
  };

  /**
   * Save token metadata to cache
   */
  const saveCachedMetadata = async (tokens) => {
    try {
      const cacheKey = getCacheKey(CACHE_KEYS.TOKEN_METADATA);
      const timestampKey = getCacheKey(CACHE_KEYS.CACHE_TIMESTAMP);

      const metadataOnly = tokens.map((token) => ({
        address: token.address,
        name: token.name,
        symbol: token.symbol,
        decimals: token.decimals,
        logoURI: token.logoURI,
        logo: token.logo,
        id: token.id,
        isCustom: !!token.id,
      }));

      await Promise.all([
        AsyncStorage.setItem(cacheKey, JSON.stringify(metadataOnly)),
        AsyncStorage.setItem(timestampKey, Date.now().toString()),
      ]);
    } catch (error) {
      console.error("[TokensScreen] Error saving cache:", error);
    }
  };

  /**
   * Merge and deduplicate tokens
   */
  const mergeTokens = (customTokens, baseTokens) => {
    const tokenMap = new Map();

    customTokens.forEach((token) => {
      const key = token.address.toLowerCase();
      tokenMap.set(key, {
        ...token,
        isCustom: true,
        id: token.id,
      });
    });

    baseTokens.forEach((token) => {
      const key = token.address.toLowerCase();
      if (!tokenMap.has(key)) {
        tokenMap.set(key, {
          ...token,
          isCustom: false,
          id: null,
        });
      }
    });

    return Array.from(tokenMap.values());
  };

  /**
   * Auto-save tokens with balance to database
   */
  const autoSaveTokensWithBalance = async (tokens, userAddress, chainId) => {
    try {
      const tokensToSave = tokens.filter(
        (token) =>
          !token.isCustom &&
          token.hasBalance &&
          parseFloat(token.balance?.formatted || "0") > 0,
      );

      if (tokensToSave.length === 0) return;

      console.log(
        `[TokensScreen] Auto-saving ${tokensToSave.length} tokens with balance`,
      );

      for (const token of tokensToSave) {
        try {
          const tokenData = {
            address: token.address.toLowerCase(),
            name: token.name,
            symbol: token.symbol,
            decimals: token.decimals,
            logo: token.logoURI || token.logo,
          };

          await saveToken(userAddress, chainId, tokenData);
        } catch (err) {
          if (!err.message?.includes("UNIQUE constraint")) {
            console.error(`[TokensScreen] Error saving ${token.symbol}:`, err);
          }
        }
      }
    } catch (error) {
      console.error(
        "[TokensScreen] Error in autoSaveTokensWithBalance:",
        error,
      );
    }
  };

  const loadTokens = async (forceRefresh = false) => {
    if (loadingRef.current) return;

    try {
      loadingRef.current = true;
      setLoading(true);
      setLoadProgress(0);

      const userAddress = wallet.address.toLowerCase();
      const normalizedChainId = parseInt(activeChain.id);

      console.log(
        "[TokensScreen] 🔄 Loading tokens for chain:",
        normalizedChainId,
        activeChain.name,
      );

      let allCombinedTokens = [];

      if (!forceRefresh) {
        const cachedMetadata = await loadCachedMetadata();
        if (cachedMetadata) {
          console.log(
            "[TokensScreen] 📦 Using cached metadata:",
            cachedMetadata.length,
          );
          allCombinedTokens = cachedMetadata;
          setAllTokens(cachedMetadata);
          setDisplayTokens(cachedMetadata);
          setLoadProgress(10);
        }
      }

      const [customTokens, baseTokens] = await Promise.all([
        getTokensByChain(userAddress, normalizedChainId),
        Promise.resolve(tokenList.getTokensByChain(normalizedChainId)),
      ]);

      console.log("[TokensScreen] 📦 Custom tokens:", customTokens.length);
      console.log("[TokensScreen] 📦 Base tokens:", baseTokens.length);

      const mergedTokens = mergeTokens(customTokens, baseTokens);
      console.log(
        "[TokensScreen] 📦 Total unique tokens:",
        mergedTokens.length,
      );

      if (!forceRefresh) {
        await saveCachedMetadata(mergedTokens);
      }

      await loadTokensInBatches(mergedTokens, userAddress, normalizedChainId);
    } catch (error) {
      console.error("[TokensScreen] ❌ Error:", error.message);
      Alert.alert("Error", `Failed to load tokens: ${error.message}`);
    } finally {
      setLoading(false);
      loadingRef.current = false;
    }
  };

  const loadTokensInBatches = async (tokens, userAddress, chainId) => {
    const BATCH_SIZE = 20;
    const PRICE_DELAY = 100;

    if (!provider) {
      throw new Error("Provider not available");
    }

    let processedTokens = [];
    let totalValue = 0;
    let pricesFetched = 0;
    const MAX_PRICE_FETCHES = 50;

    for (let i = 0; i < tokens.length; i += BATCH_SIZE) {
      const batch = tokens.slice(i, i + BATCH_SIZE);
      const progress = ((i + batch.length) / tokens.length) * 100;
      setLoadProgress(progress);

      const batchResults = await Promise.all(
        batch.map(async (token) => {
          try {
            // Get balance
            const balance = await getTokenBalance(
              token.address,
              userAddress,
              token.decimals,
              provider,
            );

            const hasBalance = balance && parseFloat(balance.formatted) > 0;

            // Get price - with rate limiting
            let price = null;
            if (pricesFetched < MAX_PRICE_FETCHES) {
              try {
                // Try contract address first for ERC20 tokens
                price = await coinGeckoService.getTokenPrice(
                  token.address,
                  chainId,
                );

                // If contract address fails, try symbol
                if (!price) {
                  price = await coinGeckoService.getTokenPrice(
                    token.symbol,
                    chainId,
                  );
                }

                pricesFetched++;

                await new Promise((resolve) =>
                  setTimeout(resolve, PRICE_DELAY),
                );
              } catch (priceError) {
                console.warn(
                  `[TokensScreen] Price fetch failed for ${token.symbol}:`,
                  priceError.message,
                );
                price = null;
              }
            }

            const usdValue =
              hasBalance && price?.usd
                ? parseFloat(balance.formatted) * price.usd
                : 0;

            if (usdValue > 0) {
              totalValue += usdValue;
            }

            return {
              ...token,
              balance,
              price,
              hasBalance,
              usdValue,
            };
          } catch (error) {
            console.error(`Error loading ${token.symbol}:`, error.message);
            return {
              ...token,
              balance: null,
              price: null,
              hasBalance: false,
              usdValue: 0,
            };
          }
        }),
      );

      processedTokens = [...processedTokens, ...batchResults];
      const sorted = sortTokens(processedTokens);

      setAllTokens(sorted);
      setDisplayTokens(sorted);
      setPortfolioValue(totalValue);
    }

    await autoSaveTokensWithBalance(processedTokens, userAddress, chainId);

    setLoadProgress(100);

    console.log(
      `[TokensScreen] ✅ Loaded ${processedTokens.length} tokens, fetched ${pricesFetched} prices`,
    );
  };

  const getTokenBalance = async (
    tokenAddress,
    userAddress,
    decimals,
    provider,
  ) => {
    try {
      // Native token
      if (
        tokenAddress === "0x0000000000000000000000000000000000000000" ||
        tokenAddress === ZeroAddress
      ) {
        const balance = await provider.getBalance(userAddress);
        const formatted = formatUnits(balance, decimals);
        return {
          raw: balance.toString(),
          formatted: formatted,
          decimals: decimals,
        };
      }

      // ERC20 token
      const tokenContract = new Contract(
        tokenAddress,
        [
          "function balanceOf(address owner) view returns (uint256)",
          "function decimals() view returns (uint8)",
        ],
        provider,
      );

      const balance = await tokenContract.balanceOf(userAddress);
      const formatted = formatUnits(balance, decimals);

      return {
        raw: balance.toString(),
        formatted: formatted,
        decimals: decimals,
      };
    } catch (error) {
      console.error(
        `Error getting balance for ${tokenAddress}:`,
        error.message,
      );
      return null;
    }
  };

  const sortTokens = (tokens) => {
    return tokens.sort((a, b) => {
      // Custom tokens with balance first
      if (a.isCustom && a.hasBalance && !(b.isCustom && b.hasBalance))
        return -1;
      if (!(a.isCustom && a.hasBalance) && b.isCustom && b.hasBalance) return 1;

      // Then by balance
      if (a.hasBalance && !b.hasBalance) return -1;
      if (!a.hasBalance && b.hasBalance) return 1;

      // Then by USD value
      const aValue = a.usdValue || 0;
      const bValue = b.usdValue || 0;

      return bValue - aValue;
    });
  };

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    coinGeckoService.clearCache();
    setPortfolioValue(0);
    await loadTokens(true);
    setRefreshing(false);
  }, []);

  const handleTokenPress = (token) => {
    if (!token.balance) return;

    const usdValue = token.usdValue || 0;

    // Pass comprehensive token data to TokenDetailScreen
    navigation.navigate("TokenDetail", {
      token: {
        address: token.address,
        symbol: token.symbol,
        name: token.name,
        decimals: token.decimals,
        logoURI: token.logoURI || token.logo,
        isCustom: token.isCustom,
      },
      chain: {
        id: activeChain.id,
        name: activeChain.name,
        symbol: activeChain.symbol,
        icon: activeChain.icon,
      },
      balance: token.balance.formatted || "0",
      usdValue: usdValue,
      price: token.price?.usd || 0,
      priceChange24h: token.price?.usd_24h_change,
      walletAddress: wallet.address,
      chainId: parseInt(activeChain.id),
    });
  };

  const handleSendToken = (token, event) => {
    event.stopPropagation();

    if (!token.hasBalance) {
      Alert.alert("No Balance", "You don't have any of this token to send.");
      return;
    }

    navigation.navigate("Send", {
      token: {
        ...token,
        balance: token.balance?.formatted || "0",
      },
      chain: activeChain,
    });
  };

  const handleRemoveToken = (token, event) => {
    event.stopPropagation();

    if (!token.isCustom) {
      Alert.alert(
        "Cannot Remove",
        "Only custom imported tokens can be removed from the list.",
      );
      return;
    }

    Alert.alert(
      "Remove Token",
      `Remove ${token.symbol} from your list?\n\nYour tokens will remain safe in your wallet.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: async () => {
            try {
              await deleteToken(token.id);
              await loadTokens(true);
            } catch (error) {
              Alert.alert("Error", "Failed to remove token");
            }
          },
        },
      ],
    );
  };

  const formatNumber = (num, decimals = 2) => {
    if (!num || num === 0) return "0";
    if (num < 0.000001) return "< 0.000001";
    if (num < 0.01) return num.toFixed(6);
    if (num < 1) return num.toFixed(4);
    if (num < 1000) return num.toFixed(decimals);
    if (num < 1000000)
      return num.toLocaleString("en-US", { maximumFractionDigits: decimals });
    if (num < 1000000000) return `${(num / 1000000).toFixed(2)}M`;
    return `${(num / 1000000000).toFixed(2)}B`;
  };

  const formatCurrency = (value) => {
    if (!value || value === 0) return "$0.00";
    if (value < 0.01) return "< $0.01";
    if (value < 1000) return `$${value.toFixed(2)}`;
    if (value < 1000000)
      return `$${value.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
    if (value < 1000000000) return `$${(value / 1000000).toFixed(2)}M`;
    return `$${(value / 1000000000).toFixed(2)}B`;
  };

  const renderToken = ({ item, index }) => {
    const balance = item.balance;
    const price = item.price;
    const hasBalance = item.hasBalance;
    const priceChange = price?.usd_24h_change;
    const isPositive = priceChange && priceChange > 0;
    const isNegative = priceChange && priceChange < 0;
    const usdValue = item.usdValue || 0;

    return (
      <TouchableOpacity
        activeOpacity={0.7}
        onPress={() => handleTokenPress(item)}
        style={styles.tokenCard}
      >
        <View style={styles.tokenRow}>
          <View style={styles.tokenLeft}>
            <View style={styles.tokenIconContainer}>
              {item.logoURI || item.logo ? (
                <Image
                  source={{ uri: item.logoURI || item.logo }}
                  style={styles.tokenIcon}
                />
              ) : (
                <View
                  style={[
                    styles.tokenIconFallback,
                    { backgroundColor: theme.COLORS.primary + "20" },
                  ]}
                >
                  <Text
                    style={[
                      styles.tokenIconText,
                      { color: theme.COLORS.primary },
                    ]}
                  >
                    {item.symbol.substring(0, 2).toUpperCase()}
                  </Text>
                </View>
              )}
              {item.isCustom && <View style={styles.customBadge} />}
            </View>

            <View style={styles.tokenInfo}>
              <View style={styles.tokenNameRow}>
                <Text style={styles.tokenSymbol} numberOfLines={1}>
                  {item.symbol}
                </Text>
                {priceChange !== undefined && priceChange !== null && (
                  <View
                    style={[
                      styles.changeChip,
                      {
                        backgroundColor: isPositive
                          ? "#E8F5E9"
                          : isNegative
                            ? "#FFEBEE"
                            : "#F5F5F5",
                      },
                    ]}
                  >
                    <Ionicons
                      name={
                        isPositive
                          ? "trending-up"
                          : isNegative
                            ? "trending-down"
                            : "remove"
                      }
                      size={10}
                      color={
                        isPositive
                          ? "#2E7D32"
                          : isNegative
                            ? "#C62828"
                            : "#757575"
                      }
                    />
                    <Text
                      style={[
                        styles.changeText,
                        {
                          color: isPositive
                            ? "#2E7D32"
                            : isNegative
                              ? "#C62828"
                              : "#757575",
                        },
                      ]}
                    >
                      {Math.abs(priceChange).toFixed(2)}%
                    </Text>
                  </View>
                )}
              </View>
              <Text style={styles.tokenName} numberOfLines={1}>
                {item.name}
              </Text>
              {price && price.usd ? (
                <Text style={styles.tokenPrice}>
                  ${formatNumber(price.usd, 6)}
                </Text>
              ) : (
                <Text style={[styles.tokenPrice, styles.noPriceText]}>
                  $0.00
                </Text>
              )}
            </View>
          </View>

          <View style={styles.tokenRight}>
            <Text
              style={[styles.balanceAmount, hasBalance && styles.balanceActive]}
              numberOfLines={1}
            >
              {balance
                ? formatNumber(parseFloat(balance.formatted || "0"), 4)
                : "..."}
            </Text>
            {usdValue > 0 && (
              <Text style={styles.balanceUSD}>{formatCurrency(usdValue)}</Text>
            )}

            <View style={styles.quickActions}>
              <TouchableOpacity
                onPress={(e) => handleSendToken(item, e)}
                disabled={!hasBalance}
                style={[
                  styles.quickActionBtn,
                  !hasBalance && styles.quickActionDisabled,
                ]}
              >
                <Ionicons
                  name="paper-plane"
                  size={12}
                  color={
                    hasBalance
                      ? theme.COLORS.primary
                      : theme.COLORS.textSecondary
                  }
                />
              </TouchableOpacity>
              {item.isCustom && (
                <TouchableOpacity
                  onPress={(e) => handleRemoveToken(item, e)}
                  style={styles.quickActionBtn}
                >
                  <Ionicons
                    name="trash-outline"
                    size={12}
                    color={theme.COLORS.error}
                  />
                </TouchableOpacity>
              )}
            </View>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  const renderEmpty = () => (
    <View style={styles.emptyContainer}>
      <View style={styles.emptyIconContainer}>
        <Ionicons
          name="wallet-outline"
          size={64}
          color={theme.COLORS.textSecondary}
        />
      </View>
      <Text style={styles.emptyTitle}>No Tokens Yet</Text>
      <Text style={styles.emptySubtitle}>
        Import custom tokens or switch{"\n"}to a different network
      </Text>
      <Button
        title="Import Token"
        onPress={() => navigation.navigate("TokenImport")}
        variant="primary"
        size="medium"
        style={styles.emptyButton}
      />
    </View>
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => navigation.goBack()}
          >
            <Ionicons name="arrow-back" size={24} color={theme.COLORS.text} />
          </TouchableOpacity>
          <View>
            <Text style={styles.headerTitle}>Tokens</Text>
            <Text style={styles.headerSubtitle}>Manage your tokens</Text>
          </View>
        </View>
        <TouchableOpacity
          style={styles.addButton}
          onPress={() => navigation.navigate("TokenImport")}
        >
          <Ionicons name="add" size={24} color="#FFF" />
        </TouchableOpacity>
      </View>

      {loading && displayTokens.length === 0 ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.COLORS.primary} />
          <Text style={styles.loadingText}>Loading your tokens...</Text>
        </View>
      ) : (
        <FlatList
          data={displayTokens}
          renderItem={renderToken}
          keyExtractor={(item, index) =>
            `${item.address.toLowerCase()}-${activeChain.id}-${index}`
          }
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={renderEmpty}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={theme.COLORS.primary}
            />
          }
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  );
};

const createStyles = (theme) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.COLORS.background,
    },
    header: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      paddingHorizontal: 20,
      paddingTop: 16,
      paddingBottom: 16,
      backgroundColor: theme.COLORS.background,
      borderBottomWidth: 1,
      borderBottomColor: theme.COLORS.border,
    },
    headerLeft: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      flex: 1,
    },
    backButton: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: theme.COLORS.border,
      justifyContent: "center",
      alignItems: "center",
    },
    headerTitle: {
      fontSize: 18,
      fontWeight: "800",
      color: theme.COLORS.text,
      letterSpacing: -0.5,
    },
    headerSubtitle: {
      fontSize: 13,
      color: theme.COLORS.textSecondary,
      marginTop: 2,
    },
    addButton: {
      width: 48,
      height: 48,
      borderRadius: 24,
      backgroundColor: theme.COLORS.primary,
      justifyContent: "center",
      alignItems: "center",
      shadowColor: theme.COLORS.primary,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.3,
      shadowRadius: 8,
      elevation: 4,
    },
    listContent: {
      padding: 16,
      paddingBottom: 32,
    },
    tokenCard: {
      backgroundColor: theme.COLORS.surface,
      borderRadius: 16,
      marginBottom: 10,
      borderWidth: 1,
      borderColor: theme.COLORS.border,
      overflow: "hidden",
    },
    tokenRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      padding: 14,
    },
    tokenLeft: {
      flexDirection: "row",
      alignItems: "center",
      flex: 1,
      gap: 12,
    },
    tokenIconContainer: {
      position: "relative",
    },
    tokenIcon: {
      width: 44,
      height: 44,
      borderRadius: 22,
    },
    tokenIconFallback: {
      width: 44,
      height: 44,
      borderRadius: 22,
      justifyContent: "center",
      alignItems: "center",
    },
    tokenIconText: {
      fontSize: 16,
      fontWeight: "700",
    },
    customBadge: {
      position: "absolute",
      top: -2,
      right: -2,
      width: 14,
      height: 14,
      borderRadius: 7,
      backgroundColor: theme.COLORS.primary,
      borderWidth: 2,
      borderColor: theme.COLORS.surface,
    },
    tokenInfo: {
      flex: 1,
      gap: 2,
    },
    tokenNameRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      marginBottom: 2,
    },
    tokenSymbol: {
      fontSize: 16,
      fontWeight: "700",
      color: theme.COLORS.text,
      letterSpacing: 0.2,
    },
    changeChip: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 6,
      gap: 3,
    },
    changeText: {
      fontSize: 10,
      fontWeight: "700",
      letterSpacing: 0.2,
    },
    tokenName: {
      fontSize: 12,
      color: theme.COLORS.textSecondary,
      fontWeight: "500",
    },
    tokenPrice: {
      fontSize: 11,
      color: theme.COLORS.textSecondary,
      fontWeight: "600",
      marginTop: 2,
    },
    noPriceText: {
      fontStyle: "italic",
      opacity: 0.7,
    },
    tokenRight: {
      alignItems: "flex-end",
      gap: 4,
      minWidth: 100,
    },
    balanceAmount: {
      fontSize: 15,
      fontWeight: "700",
      color: theme.COLORS.textSecondary,
      letterSpacing: 0.2,
    },
    balanceActive: {
      color: theme.COLORS.text,
      fontSize: 16,
    },
    balanceUSD: {
      fontSize: 11,
      color: theme.COLORS.textSecondary,
      fontWeight: "600",
    },
    quickActions: {
      flexDirection: "row",
      gap: 8,
      marginTop: 6,
    },
    quickActionBtn: {
      width: 28,
      height: 28,
      borderRadius: 14,
      backgroundColor: theme.COLORS.border,
      justifyContent: "center",
      alignItems: "center",
    },
    quickActionDisabled: {
      opacity: 0.4,
    },
    emptyContainer: {
      alignItems: "center",
      justifyContent: "center",
      paddingVertical: 100,
      paddingHorizontal: 40,
    },
    emptyIconContainer: {
      width: 120,
      height: 120,
      borderRadius: 60,
      backgroundColor: theme.COLORS.border,
      justifyContent: "center",
      alignItems: "center",
      marginBottom: 24,
    },
    emptyTitle: {
      fontSize: 24,
      fontWeight: "800",
      color: theme.COLORS.text,
      marginBottom: 8,
      textAlign: "center",
    },
    emptySubtitle: {
      fontSize: 14,
      color: theme.COLORS.textSecondary,
      textAlign: "center",
      lineHeight: 20,
      marginBottom: 32,
    },
    emptyButton: {
      paddingHorizontal: 32,
    },
    loadingContainer: {
      flex: 1,
      justifyContent: "center",
      alignItems: "center",
      paddingVertical: 100,
    },
    loadingText: {
      marginTop: 16,
      fontSize: 14,
      color: theme.COLORS.textSecondary,
      fontWeight: "500",
    },
  });

export default TokensScreen;
