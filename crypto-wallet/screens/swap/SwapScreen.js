// screens/wallet/SwapScreen.js
import React, { useState, useCallback, useEffect, useMemo } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Modal,
  SafeAreaView,
  ActivityIndicator,
  Image,
  FlatList,
  RefreshControl,
} from "react-native";
import { useTokenList } from "../../hooks/useTokenList";
import { useSwapQuote } from "../../hooks/useSwapQuote";
import { useTheme } from "../../contexts/ThemeContext";
import { useChain } from "../../contexts/ChainContext";
import { useWallet } from "../../contexts/WalletContext";
import ChainSwitcher from "../../components/wallet/ChainSwitcher";
import { EnhancedSwapModal } from "../../components/EnhanceSwapModal";
import { isNativeToken } from "../../config/swapConfig";
import coinGeckoService from "../../services/coingec";
import Alert from "../../utils/Alert";

// Skeleton loader component
const TokenItemSkeleton = ({ COLORS, SPACING, BORDER_RADIUS }) => (
  <View
    style={{
      flexDirection: "row",
      alignItems: "center",
      paddingVertical: SPACING.sm,
      paddingHorizontal: SPACING.lg,
      borderBottomWidth: 1,
      borderBottomColor: COLORS.border,
    }}
  >
    <View
      style={{
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: COLORS.disabled,
        opacity: 0.3,
      }}
    />
    <View style={{ flex: 1, marginLeft: SPACING.md }}>
      <View
        style={{
          width: "30%",
          height: 16,
          backgroundColor: COLORS.disabled,
          borderRadius: BORDER_RADIUS.sm,
          marginBottom: SPACING.xs,
          opacity: 0.3,
        }}
      />
      <View
        style={{
          width: "60%",
          height: 12,
          backgroundColor: COLORS.disabled,
          borderRadius: BORDER_RADIUS.sm,
          opacity: 0.2,
        }}
      />
    </View>
  </View>
);

const SwapScreen = () => {
  const theme = useTheme();
  const { COLORS, SPACING, FONTS, BORDER_RADIUS, SHADOWS } = theme;
  const styles = createStyles(theme);
  const { activeChain } = useChain();
  const { address, refreshBalance, getActiveChainBalance } = useWallet();

  const {
    tokens,
    loading,
    error,
    chainName,
    findTokenBySymbol,
    searchTokens,
    refreshTokens,
  } = useTokenList();

  // Swap state
  const [fromToken, setFromToken] = useState(null);
  const [toToken, setToToken] = useState(null);
  const [fromAmount, setFromAmount] = useState("");
  const [showFromTokenModal, setShowFromTokenModal] = useState(false);
  const [showToTokenModal, setShowToTokenModal] = useState(false);
  const [showChainSwitcher, setShowChainSwitcher] = useState(false);
  const [showTransactionModal, setShowTransactionModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [isRefreshing, setIsRefreshing] = useState(false);

  // USD price state
  const [fromTokenPrice, setFromTokenPrice] = useState(null);
  const [toTokenPrice, setToTokenPrice] = useState(null);
  const [loadingPrices, setLoadingPrices] = useState(false);

  // Get quote hook
  const {
    quote,
    loading: quoteLoading,
    error: quoteError,
  } = useSwapQuote(fromToken, toToken, fromAmount);

  // Get balance from wallet context
  const activeBalance = getActiveChainBalance();

  // Initialize tokens only once when tokens list first loads
  useEffect(() => {
    if (tokens.length > 0 && !fromToken) {
      const nativeToken = {
        address: "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE",
        symbol: activeChain.symbol,
        name: activeChain.name,
        decimals: 18,
        logoURI: activeChain.icon,
      };

      const usdc = findTokenBySymbol("USDC");
      setFromToken(nativeToken);
      setToToken(usdc || tokens[0]);
    }
  }, [tokens.length]);

  // Reset tokens when chain changes
  useEffect(() => {
    if (tokens.length > 0) {
      const nativeToken = {
        address: "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE",
        symbol: activeChain.symbol,
        name: activeChain.name,
        decimals: 18,
        logoURI: activeChain.icon,
      };

      const usdc = findTokenBySymbol("USDC");
      setFromToken(nativeToken);
      setToToken(usdc || tokens[0]);
      setFromAmount("");
    }
  }, [activeChain.id]);

  // Fetch USD prices when tokens change
  useEffect(() => {
    if (fromToken && toToken) {
      fetchTokenPrices();
    }
  }, [fromToken, toToken]);

  // Fetch native token price (ETH, BNB, etc.)
  const fetchNativeTokenPrice = async (symbol) => {
    try {
      const nativeTokenIds = {
        ETH: "ethereum",
        BNB: "binancecoin",
        POL: "polygon-ecosystem-token",
        MATIC: "polygon-ecosystem-token",
        AVAX: "avalanche-2",
        FTM: "fantom",
        MNT: "mantle",
      };

      const coinId = nativeTokenIds[symbol];
      if (!coinId) return null;

      const response = await fetch(
        `https://api.coingecko.com/api/v3/simple/price?ids=${coinId}&vs_currencies=usd&include_24hr_change=true`,
      );
      const data = await response.json();

      if (data[coinId]) {
        return {
          usd: data[coinId].usd,
          usd_24h_change: data[coinId].usd_24h_change,
        };
      }

      return null;
    } catch (err) {
      console.error("[fetchNativeTokenPrice] Error:", err);
      return null;
    }
  };

  // Fetch USD prices from CoinGecko
  const fetchTokenPrices = async () => {
    try {
      setLoadingPrices(true);

      const platform = coinGeckoService.getPlatformId(activeChain.id);
      const addresses = [];

      // Collect addresses for ERC20 tokens
      if (!isNativeToken(fromToken.address)) {
        addresses.push(fromToken.address);
      }
      if (!isNativeToken(toToken.address)) {
        addresses.push(toToken.address);
      }

      // Fetch ERC20 prices
      if (addresses.length > 0) {
        const prices = await coinGeckoService.getMultipleTokenPrices(
          addresses,
          platform,
        );

        if (!isNativeToken(fromToken.address)) {
          const fromPrice = prices[fromToken.address.toLowerCase()];
          setFromTokenPrice(fromPrice);
        }

        if (!isNativeToken(toToken.address)) {
          const toPrice = prices[toToken.address.toLowerCase()];
          setToTokenPrice(toPrice);
        }
      }

      // Fetch native token prices
      if (isNativeToken(fromToken.address)) {
        const nativePrice = await fetchNativeTokenPrice(activeChain.symbol);
        setFromTokenPrice(nativePrice);
      }

      if (isNativeToken(toToken.address)) {
        const nativePrice = await fetchNativeTokenPrice(activeChain.symbol);
        setToTokenPrice(nativePrice);
      }
    } catch (err) {
      console.error("[fetchTokenPrices] Error:", err);
    } finally {
      setLoadingPrices(false);
    }
  };

  // Calculate USD values
  const fromTokenUSD = useMemo(() => {
    if (!fromTokenPrice?.usd || !fromAmount || parseFloat(fromAmount) <= 0)
      return null;
    return (parseFloat(fromAmount) * fromTokenPrice.usd).toFixed(2);
  }, [fromAmount, fromTokenPrice]);

  const toTokenUSD = useMemo(() => {
    if (!toTokenPrice?.usd || !quote?.amountOut) return null;
    return (parseFloat(quote.amountOut) * toTokenPrice.usd).toFixed(2);
  }, [quote, toTokenPrice]);

  // Pull to refresh handler
  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      await Promise.all([
        refreshTokens(),
        refreshBalance(),
        fetchTokenPrices(),
      ]);
    } catch (err) {
      console.error("Refresh error:", err);
    } finally {
      setIsRefreshing(false);
    }
  }, [refreshTokens, refreshBalance]);

  // Handle amount change - allow empty and validate input
  const handleFromAmountChange = useCallback((value) => {
    if (value === "") {
      setFromAmount("");
      return;
    }

    const regex = /^\d*\.?\d*$/;
    if (regex.test(value)) {
      setFromAmount(value);
    }
  }, []);

  // Flip tokens
  const handleFlipTokens = useCallback(() => {
    const tempFrom = fromToken;
    const tempTo = toToken;
    const tempFromPrice = fromTokenPrice;
    const tempToPrice = toTokenPrice;

    setFromToken(tempTo);
    setToToken(tempFrom);
    setFromTokenPrice(tempToPrice);
    setToTokenPrice(tempFromPrice);
    setFromAmount("");
  }, [fromToken, toToken, fromTokenPrice, toTokenPrice]);

  // Handle MAX button
  const handleMax = useCallback(() => {
    if (fromToken && isNativeToken(fromToken.address)) {
      const balance = parseFloat(activeBalance.formatted);
      const maxAmount = Math.max(0, balance - 0.001);
      setFromAmount(maxAmount.toFixed(6));
    } else {
      setFromAmount("0.00");
    }
  }, [fromToken, activeBalance]);

  // Execute swap
  const handleSwap = useCallback(() => {
    if (!fromAmount || parseFloat(fromAmount) <= 0) {
      Alert.alert("Error", "Please enter an amount");
      return;
    }

    if (!quote) {
      Alert.alert("Error", "Unable to get quote. Please try again.");
      return;
    }

    // Check balance
    if (fromToken && isNativeToken(fromToken.address)) {
      const balance = parseFloat(activeBalance.formatted);
      const amount = parseFloat(fromAmount);
      if (amount > balance) {
        Alert.alert(
          "Insufficient Balance",
          `You only have ${balance.toFixed(4)} ${fromToken.symbol}`,
        );
        return;
      }
    }

    setShowTransactionModal(true);
  }, [fromAmount, quote, fromToken, activeBalance]);

  // Get logo URI
  const getLogoUri = useCallback((uri) => {
    if (!uri) return null;
    if (uri.startsWith("ipfs://")) {
      return uri.replace("ipfs://", "https://ipfs.io/ipfs/");
    }
    if (uri.startsWith("/")) {
      return `https://raw.githubusercontent.com${uri}`;
    }
    return uri;
  }, []);

  // Memoized TokenLogo component
  const TokenLogo = React.memo(({ uri, symbol, size = 32 }) => {
    const [imageError, setImageError] = useState(false);
    const logoSource = getLogoUri(uri);

    if (!logoSource || imageError) {
      return (
        <View
          style={[
            styles.tokenIcon,
            { width: size, height: size, borderRadius: size / 2 },
          ]}
        >
          <Text style={[styles.tokenIconText, { fontSize: size * 0.5 }]}>
            {symbol?.[0]?.toUpperCase() || "?"}
          </Text>
        </View>
      );
    }

    return (
      <Image
        key={logoSource}
        source={{ uri: logoSource }}
        style={[
          styles.tokenLogo,
          { width: size, height: size, borderRadius: size / 2 },
        ]}
        resizeMode="cover"
        onError={() => setImageError(true)}
      />
    );
  });

  // Chain icon with fallback
  const ChainIcon = React.memo(({ uri, name, size = 20 }) => {
    const [imageError, setImageError] = useState(false);
    const logoSource = getLogoUri(uri);

    if (!logoSource || imageError) {
      return (
        <View
          style={[
            styles.chainIconFallback,
            { width: size, height: size, borderRadius: size / 2 },
          ]}
        >
          <Text
            style={[styles.chainIconFallbackText, { fontSize: size * 0.5 }]}
          >
            {name?.[0]?.toUpperCase() || "?"}
          </Text>
        </View>
      );
    }

    return (
      <Image
        key={logoSource}
        source={{ uri: logoSource }}
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          marginRight: SPACING.xs,
        }}
        resizeMode="cover"
        onError={() => setImageError(true)}
      />
    );
  });

  // Token selector component with balance
  const TokenSelector = React.memo(({ token, onPress, label }) => {
    if (!token) return null;

    const displayBalance = useMemo(() => {
      if (isNativeToken(token.address)) {
        return `${parseFloat(activeBalance.formatted).toFixed(4)} ${token.symbol}`;
      }
      return "0.00";
    }, [token, activeBalance]);

    return (
      <TouchableOpacity style={styles.tokenSelector} onPress={onPress}>
        <Text style={styles.tokenLabel}>{label}</Text>
        <View style={styles.tokenInfo}>
          <TokenLogo uri={token.logoURI} symbol={token.symbol} size={40} />
          <View style={styles.tokenDetails}>
            <Text style={styles.tokenSymbol}>{token.symbol}</Text>
            {/* <Text style={styles.tokenName} numberOfLines={1}>
              {token.name}
            </Text> */}
          </View>
          <Text style={styles.chevron}>▼</Text>
        </View>
        <Text style={styles.balance}>Balance: {displayBalance}</Text>
      </TouchableOpacity>
    );
  });

  // Debounced search - memoized filtered tokens
  const filteredTokens = useMemo(() => {
    if (!searchQuery) return tokens;
    return searchTokens(searchQuery);
  }, [searchQuery, tokens, searchTokens]);

  // Render token item for FlatList
  const renderTokenItem = useCallback(
    ({ item: token }) => (
      <TouchableOpacity
        style={[
          styles.tokenItem,
          (fromToken?.address === token.address ||
            toToken?.address === token.address) &&
            styles.tokenItemSelected,
        ]}
        onPress={() => {
          if (showFromTokenModal) {
            setFromToken(token);
          } else {
            setToToken(token);
          }
          setSearchQuery("");
          setShowFromTokenModal(false);
          setShowToTokenModal(false);
        }}
      >
        <TokenLogo uri={token.logoURI} symbol={token.symbol} size={40} />
        <View style={styles.tokenItemInfo}>
          <Text style={styles.tokenItemSymbol}>{token.symbol}</Text>
          <Text style={styles.tokenItemName} numberOfLines={1}>
            {token.name}
          </Text>
        </View>
        <View style={styles.tokenItemRight}>
          <Text style={styles.tokenItemBalance}>
            {isNativeToken(token.address)
              ? parseFloat(activeBalance.formatted).toFixed(4)
              : "0.00"}
          </Text>
          {(fromToken?.address === token.address ||
            toToken?.address === token.address) && (
            <View style={styles.selectedBadge}>
              <Text style={styles.selectedText}>✓</Text>
            </View>
          )}
        </View>
      </TouchableOpacity>
    ),
    [fromToken, toToken, showFromTokenModal, styles, activeBalance],
  );

  // Token modal with FlatList
  const TokenModal = ({ visible, onClose }) => (
    <Modal visible={visible} animationType="slide" transparent>
      <TouchableOpacity
        style={styles.modalOverlay}
        activeOpacity={1}
        onPress={onClose}
      >
        <TouchableOpacity
          activeOpacity={1}
          style={styles.modalContent}
          onPress={(e) => e.stopPropagation()}
        >
          <View style={styles.modalHeader}>
            <View>
              <Text style={styles.modalTitle}>Select Token</Text>
              {loading && (
                <ActivityIndicator
                  size="small"
                  color={COLORS.primary}
                  style={{ position: "absolute", right: -30, top: 5 }}
                />
              )}
            </View>
            <TouchableOpacity onPress={onClose}>
              <Text style={styles.modalClose}>✕</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.searchContainer}>
            <TextInput
              style={styles.searchInput}
              placeholder="Search by name or symbol"
              placeholderTextColor={COLORS.textTertiary}
              value={searchQuery}
              onChangeText={setSearchQuery}
              autoCapitalize="none"
              autoFocus={false}
            />
          </View>

          <View style={styles.chainInfoContainer}>
            <Text style={styles.chainInfo}>
              {chainName} • {filteredTokens.length} tokens
            </Text>
            {!loading && (
              <TouchableOpacity onPress={handleRefresh}>
                <Text style={styles.refreshText}>Refresh</Text>
              </TouchableOpacity>
            )}
          </View>

          {loading && tokens.length === 0 ? (
            <View>
              {[1, 2, 3, 4, 5].map((i) => (
                <TokenItemSkeleton
                  key={i}
                  COLORS={COLORS}
                  SPACING={SPACING}
                  BORDER_RADIUS={BORDER_RADIUS}
                />
              ))}
            </View>
          ) : (
            <FlatList
              data={filteredTokens}
              renderItem={renderTokenItem}
              keyExtractor={(item) => item.address}
              removeClippedSubviews={true}
              maxToRenderPerBatch={10}
              updateCellsBatchingPeriod={50}
              initialNumToRender={15}
              windowSize={10}
              ListEmptyComponent={
                <View style={styles.emptyContainer}>
                  <Text style={styles.emptyText}>
                    {searchQuery ? "No tokens found" : "No tokens available"}
                  </Text>
                </View>
              }
            />
          )}
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );

  // Error state with retry
  if (error && tokens.length === 0) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>Error loading tokens</Text>
          <TouchableOpacity style={styles.retryButton} onPress={handleRefresh}>
            <Text style={styles.retryButtonText}>Retry</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // Show skeleton on initial load
  if (loading && tokens.length === 0) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>Swap</Text>
          <View style={styles.chainBadge}>
            <ActivityIndicator size="small" color={COLORS.primary} />
          </View>
        </View>
        <View style={styles.swapCard}>
          <View style={styles.tokenSection}>
            <View style={styles.skeletonLoader} />
          </View>
          <View style={styles.tokenSection}>
            <View style={styles.skeletonLoader} />
          </View>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={handleRefresh}
            tintColor={COLORS.primary}
            colors={[COLORS.primary]}
          />
        }
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Swap</Text>
          <TouchableOpacity
            style={styles.chainBadge}
            onPress={() => setShowChainSwitcher(true)}
            activeOpacity={0.7}
          >
            {loading && tokens.length > 0 && (
              <ActivityIndicator
                size="small"
                color={COLORS.primary}
                style={{ marginRight: SPACING.xs }}
              />
            )}
            <ChainIcon
              uri={activeChain.icon}
              name={activeChain.name}
              size={18}
            />
            <Text style={styles.chainText}>{chainName}</Text>
            <Text style={styles.chainChevron}>▼</Text>
          </TouchableOpacity>
        </View>

        {/* Swap Card */}
        <View style={styles.swapCard}>
          {/* From Token */}
          <View style={styles.tokenSection}>
            <TokenSelector
              token={fromToken}
              onPress={() => setShowFromTokenModal(true)}
              label="From"
            />
            <TextInput
              style={styles.amountInput}
              placeholder="0.0"
              placeholderTextColor={COLORS.textTertiary}
              keyboardType="decimal-pad"
              value={fromAmount}
              onChangeText={handleFromAmountChange}
            />
            {/* USD Value */}
            {loadingPrices && fromAmount ? (
              <ActivityIndicator
                size="small"
                color={COLORS.textTertiary}
                style={styles.usdLoader}
              />
            ) : fromTokenUSD ? (
              <Text style={styles.usdValue}>≈ ${fromTokenUSD}</Text>
            ) : null}
            <TouchableOpacity style={styles.maxButton} onPress={handleMax}>
              <Text style={styles.maxButtonText}>MAX</Text>
            </TouchableOpacity>
          </View>

          {/* Flip Button */}
          <View style={styles.flipContainer}>
            <TouchableOpacity
              style={styles.flipButton}
              onPress={handleFlipTokens}
            >
              <Text style={styles.flipIcon}>⇅</Text>
            </TouchableOpacity>
          </View>

          {/* To Token */}
          <View style={styles.tokenSection}>
            <TokenSelector
              token={toToken}
              onPress={() => setShowToTokenModal(true)}
              label="To"
            />
            <View style={styles.amountOutputContainer}>
              {quoteLoading ? (
                <ActivityIndicator size="small" color={COLORS.primary} />
              ) : (
                <Text style={[styles.amountInput, styles.amountInputDisabled]}>
                  {quote?.amountOut || "0.0000"}
                </Text>
              )}
            </View>
            {/* USD Value */}
            {loadingPrices && quote ? (
              <ActivityIndicator
                size="small"
                color={COLORS.textTertiary}
                style={styles.usdLoader}
              />
            ) : toTokenUSD ? (
              <Text style={styles.usdValue}>≈ ${toTokenUSD}</Text>
            ) : null}
          </View>
        </View>

        {/* Quote Info */}
        {quote && fromToken && toToken && fromAmount && (
          <View style={styles.quoteInfo}>
            <View style={styles.quoteRow}>
              <Text style={styles.quoteLabel}>Rate</Text>
              <Text style={styles.quoteValue}>
                1 {fromToken.symbol} ≈{" "}
                {(parseFloat(quote.amountOut) / parseFloat(fromAmount)).toFixed(
                  4,
                )}{" "}
                {toToken.symbol}
              </Text>
            </View>
            {quote.priceImpact > 0 && (
              <View style={styles.quoteRow}>
                <Text style={styles.quoteLabel}>Price Impact</Text>
                <Text
                  style={[
                    styles.quoteValue,
                    quote.priceImpact > 3 && styles.quoteValueWarning,
                  ]}
                >
                  {quote.priceImpact.toFixed(2)}%
                </Text>
              </View>
            )}
            <View style={styles.quoteRow}>
              <Text style={styles.quoteLabel}>Slippage Tolerance</Text>
              <Text style={styles.quoteValue}>0.5%</Text>
            </View>
            <View style={styles.quoteRow}>
              <Text style={styles.quoteLabel}>Route</Text>
              <Text style={[styles.quoteValue, styles.routeText]}>
                {quote.path.length === 2
                  ? "Direct"
                  : `Via ${quote.path.length - 1} hop${quote.path.length > 2 ? "s" : ""}`}
              </Text>
            </View>
          </View>
        )}

        {/* Quote Error */}
        {quoteError && (
          <View style={styles.errorBanner}>
            <Text style={styles.errorBannerText}>⚠️ {quoteError}</Text>
          </View>
        )}

        {/* Swap Button */}
        <TouchableOpacity
          style={[
            styles.swapButton,
            (!fromAmount || !quote || quoteLoading || quoteError) &&
              styles.swapButtonDisabled,
          ]}
          onPress={handleSwap}
          disabled={!fromAmount || !quote || quoteLoading || quoteError}
        >
          {quoteLoading ? (
            <ActivityIndicator color={COLORS.surface} />
          ) : (
            <Text style={styles.swapButtonText}>
              {!fromAmount
                ? "Enter Amount"
                : !quote
                  ? "Getting Quote..."
                  : quoteError
                    ? "Quote Failed"
                    : "Swap"}
            </Text>
          )}
        </TouchableOpacity>

        {/* Info Box */}
        <View style={styles.infoBox}>
          <Text style={styles.infoText}>
            💡 Swaps use {activeChain.symbol} for gas fees
          </Text>
        </View>
      </ScrollView>

      {/* Token Selection Modals */}
      <TokenModal
        visible={showFromTokenModal}
        onClose={() => {
          setShowFromTokenModal(false);
          setSearchQuery("");
        }}
      />
      <TokenModal
        visible={showToTokenModal}
        onClose={() => {
          setShowToTokenModal(false);
          setSearchQuery("");
        }}
      />

      {/* Chain Switcher Modal */}
      <ChainSwitcher
        visible={showChainSwitcher}
        onClose={() => setShowChainSwitcher(false)}
      />

      {/* Enhanced Swap Modal with Approval Flow */}
      {fromToken && toToken && quote && (
        <EnhancedSwapModal
          visible={showTransactionModal}
          onClose={() => setShowTransactionModal(false)}
          fromToken={fromToken}
          toToken={toToken}
          fromAmount={fromAmount}
          quote={quote}
          onSuccess={(receipt) => {
            Alert.alert(
              "Swap Successful! 🎉",
              `Swapped ${parseFloat(fromAmount).toFixed(4)} ${fromToken.symbol} for ${quote.amountOut} ${toToken.symbol}\n\nHash: ${receipt.hash.slice(0, 10)}...`,
            );
            setFromAmount("");
            setShowTransactionModal(false);
            refreshBalance();
          }}
          onError={(error) => {
            Alert.alert("Swap Failed", error.message || "Transaction failed");
            setShowTransactionModal(false);
          }}
        />
      )}
    </SafeAreaView>
  );
};

const createStyles = (theme) => {
  const { COLORS, SPACING, FONTS, BORDER_RADIUS, SHADOWS } = theme;

  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: COLORS.background,
    },
    scrollContent: {
      padding: SPACING.lg,
    },
    header: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: SPACING.lg,
    },
    title: {
      fontSize: FONTS.sizes.xl,
      fontWeight: "bold",
      color: COLORS.text,
      fontFamily: FONTS.bold,
    },
    chainBadge: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: COLORS.card,
      paddingHorizontal: SPACING.md,
      paddingVertical: SPACING.sm,
      borderRadius: BORDER_RADIUS.md,
      borderWidth: 1,
      borderColor: COLORS.border,
      ...SHADOWS.small,
    },
    chainText: {
      color: COLORS.text,
      fontSize: FONTS.sizes.sm,
      fontWeight: "600",
      fontFamily: FONTS.semiBold,
    },
    chainChevron: {
      color: COLORS.textSecondary,
      fontSize: FONTS.sizes.xs,
      marginLeft: SPACING.xs,
    },
    chainIconFallback: {
      backgroundColor: COLORS.primary,
      justifyContent: "center",
      alignItems: "center",
      marginRight: SPACING.xs,
    },
    chainIconFallbackText: {
      color: COLORS.surface,
      fontWeight: "bold",
      fontFamily: FONTS.bold,
    },
    swapCard: {
      // backgroundColor: COLORS.card,
      borderRadius: BORDER_RADIUS.xl,
      padding: SPACING.xs,
      // borderWidth: 1,
      // borderColor: COLORS.border,
      // ...SHADOWS.medium,
    },
    tokenSection: {
      backgroundColor: COLORS.surface,
      borderRadius: BORDER_RADIUS.lg,
      padding: SPACING.md,
      marginBottom: SPACING.sm,
    },
    tokenSelector: {
      marginBottom: SPACING.md,
    },
    tokenLabel: {
      color: COLORS.textSecondary,
      fontSize: FONTS.sizes.sm,
      marginBottom: SPACING.sm,
      fontWeight: "600",
      fontFamily: FONTS.semiBold,
    },
    tokenInfo: {
      flexDirection: "row",
      alignItems: "center",
      marginBottom: SPACING.sm,
    },
    tokenLogo: {
      marginRight: SPACING.md,
    },
    tokenIcon: {
      backgroundColor: COLORS.primary,
      justifyContent: "center",
      alignItems: "center",
      marginRight: SPACING.md,
    },
    tokenIconText: {
      color: COLORS.surface,
      fontWeight: "bold",
      fontFamily: FONTS.bold,
    },
    tokenDetails: {
      flex: 1,
    },
    tokenSymbol: {
      color: COLORS.text,
      fontSize: FONTS.sizes.md,
      fontWeight: "bold",
      fontFamily: FONTS.bold,
    },
    tokenName: {
      color: COLORS.textSecondary,
      fontSize: FONTS.sizes.sm,
      fontFamily: FONTS.regular,
    },
    chevron: {
      color: COLORS.textSecondary,
      fontSize: FONTS.sizes.sm,
    },
    balance: {
      color: COLORS.textSecondary,
      fontSize: FONTS.sizes.sm,
      fontFamily: FONTS.regular,
    },
    amountInput: {
      fontSize: FONTS.sizes.xl,
      color: COLORS.text,
      fontWeight: "bold",
      padding: 0,
      fontFamily: FONTS.bold,
    },
    amountInputDisabled: {
      color: COLORS.textTertiary,
    },
    amountOutputContainer: {
      minHeight: 48,
      justifyContent: "center",
    },
    // NEW: USD value styles
    usdValue: {
      fontSize: FONTS.sizes.md,
      color: COLORS.textTertiary,
      fontFamily: FONTS.regular,
      marginTop: SPACING.xs,
    },
    usdLoader: {
      alignSelf: "flex-start",
      marginTop: SPACING.xs,
    },
    maxButton: {
      position: "absolute",
      right: SPACING.md,
      bottom: SPACING.md,
      backgroundColor: COLORS.primary,
      paddingHorizontal: SPACING.md,
      paddingVertical: SPACING.sm,
      borderRadius: BORDER_RADIUS.sm,
    },
    maxButtonText: {
      color: COLORS.surface,
      fontSize: FONTS.sizes.sm,
      fontWeight: "bold",
      fontFamily: FONTS.bold,
    },
    flipContainer: {
      alignItems: "center",
      marginVertical: SPACING.sm,
    },
    flipButton: {
      width: 40,
      height: 40,
      borderRadius: BORDER_RADIUS.round,
      backgroundColor: COLORS.card,
      borderWidth: 4,
      borderColor: COLORS.background,
      justifyContent: "center",
      alignItems: "center",
      ...SHADOWS.small,
    },
    flipIcon: {
      fontSize: FONTS.sizes.xl,
      color: COLORS.text,
    },
    quoteInfo: {
      backgroundColor: COLORS.card,
      padding: SPACING.md,
      borderRadius: BORDER_RADIUS.md,
      marginTop: SPACING.md,
      borderWidth: 1,
      borderColor: COLORS.border,
    },
    quoteRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: SPACING.xs,
    },
    quoteLabel: {
      color: COLORS.textSecondary,
      fontSize: FONTS.sizes.sm,
      fontFamily: FONTS.regular,
    },
    quoteValue: {
      color: COLORS.text,
      fontSize: FONTS.sizes.sm,
      fontWeight: "600",
      fontFamily: FONTS.semiBold,
    },
    quoteValueWarning: {
      color: COLORS.warning,
    },
    routeText: {
      fontSize: FONTS.sizes.xs,
      color: COLORS.textTertiary,
    },
    errorBanner: {
      backgroundColor: COLORS.error + "20",
      padding: SPACING.md,
      borderRadius: BORDER_RADIUS.md,
      marginTop: SPACING.md,
      borderWidth: 1,
      borderColor: COLORS.error,
    },
    errorBannerText: {
      color: COLORS.error,
      fontSize: FONTS.sizes.sm,
      textAlign: "center",
      fontFamily: FONTS.regular,
    },
    swapButton: {
      backgroundColor: COLORS.primary,
      padding: SPACING.lg,
      borderRadius: BORDER_RADIUS.lg,
      marginTop: SPACING.lg,
      alignItems: "center",
      ...SHADOWS.medium,
    },
    swapButtonDisabled: {
      backgroundColor: COLORS.disabled,
    },
    swapButtonText: {
      color: COLORS.surface,
      fontSize: FONTS.sizes.lg,
      fontWeight: "bold",
      fontFamily: FONTS.bold,
    },
    infoBox: {
      backgroundColor: COLORS.card,
      padding: SPACING.md,
      borderRadius: BORDER_RADIUS.md,
      marginTop: SPACING.md,
      borderWidth: 1,
      borderColor: COLORS.border,
    },
    infoText: {
      color: COLORS.textSecondary,
      fontSize: FONTS.sizes.sm,
      textAlign: "center",
      fontFamily: FONTS.regular,
    },
    errorContainer: {
      flex: 1,
      justifyContent: "center",
      alignItems: "center",
      padding: SPACING.xl,
    },
    errorText: {
      color: COLORS.error,
      fontSize: FONTS.sizes.lg,
      textAlign: "center",
      fontFamily: FONTS.medium,
      marginBottom: SPACING.lg,
    },
    retryButton: {
      backgroundColor: COLORS.primary,
      paddingHorizontal: SPACING.xl,
      paddingVertical: SPACING.md,
      borderRadius: BORDER_RADIUS.md,
    },
    retryButtonText: {
      color: COLORS.surface,
      fontSize: FONTS.sizes.md,
      fontWeight: "bold",
      fontFamily: FONTS.bold,
    },
    modalOverlay: {
      flex: 1,
      backgroundColor: theme.isDark
        ? "rgba(0, 0, 0, 0.9)"
        : "rgba(0, 0, 0, 0.5)",
      justifyContent: "flex-end",
    },
    modalContent: {
      backgroundColor: COLORS.card,
      borderTopLeftRadius: BORDER_RADIUS.xxl,
      borderTopRightRadius: BORDER_RADIUS.xxl,
      maxHeight: "80%",
      paddingBottom: SPACING.xl,
      ...SHADOWS.xl,
    },
    modalHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      padding: SPACING.xl,
      borderBottomWidth: 1,
      borderBottomColor: COLORS.border,
    },
    modalTitle: {
      fontSize: FONTS.sizes.xl,
      fontWeight: "bold",
      color: COLORS.text,
      fontFamily: FONTS.bold,
    },
    modalClose: {
      fontSize: FONTS.sizes.xxl,
      color: COLORS.textSecondary,
      fontWeight: "300",
    },
    searchContainer: {
      paddingHorizontal: SPACING.xl,
      paddingVertical: SPACING.md,
    },
    searchInput: {
      backgroundColor: COLORS.surface,
      borderRadius: BORDER_RADIUS.md,
      padding: SPACING.md,
      color: COLORS.text,
      fontSize: FONTS.sizes.md,
      borderWidth: 1,
      borderColor: COLORS.border,
      fontFamily: FONTS.regular,
    },
    chainInfoContainer: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      paddingHorizontal: SPACING.xl,
      paddingVertical: SPACING.sm,
    },
    chainInfo: {
      color: COLORS.textTertiary,
      fontSize: FONTS.sizes.sm,
      fontFamily: FONTS.regular,
    },
    refreshText: {
      color: COLORS.primary,
      fontSize: FONTS.sizes.sm,
      fontWeight: "600",
      fontFamily: FONTS.semiBold,
    },
    tokenItem: {
      flexDirection: "row",
      alignItems: "center",
      paddingVertical: SPACING.sm,
      paddingHorizontal: SPACING.lg,
      borderBottomWidth: 1,
      borderBottomColor: COLORS.border,
    },
    tokenItemSelected: {
      backgroundColor: COLORS.cardElevated,
    },
    tokenItemInfo: {
      flex: 1,
      marginLeft: SPACING.md,
    },
    tokenItemSymbol: {
      color: COLORS.text,
      fontSize: FONTS.sizes.md,
      fontWeight: "bold",
      fontFamily: FONTS.bold,
    },
    tokenItemName: {
      color: COLORS.textSecondary,
      fontSize: FONTS.sizes.sm,
      fontFamily: FONTS.regular,
    },
    tokenItemRight: {
      alignItems: "flex-end",
    },
    tokenItemBalance: {
      color: COLORS.textSecondary,
      fontSize: FONTS.sizes.sm,
      marginBottom: SPACING.xs,
      fontFamily: FONTS.regular,
    },
    selectedBadge: {
      backgroundColor: COLORS.primary,
      width: 20,
      height: 20,
      borderRadius: BORDER_RADIUS.round,
      justifyContent: "center",
      alignItems: "center",
    },
    selectedText: {
      color: COLORS.surface,
      fontSize: FONTS.sizes.xs,
      fontWeight: "bold",
      fontFamily: FONTS.bold,
    },
    emptyContainer: {
      padding: SPACING.xl,
      alignItems: "center",
    },
    emptyText: {
      color: COLORS.textSecondary,
      fontSize: FONTS.sizes.md,
      fontFamily: FONTS.regular,
    },
    skeletonLoader: {
      height: 100,
      backgroundColor: COLORS.disabled,
      borderRadius: BORDER_RADIUS.md,
      opacity: 0.3,
    },
  });
};

export default SwapScreen;
