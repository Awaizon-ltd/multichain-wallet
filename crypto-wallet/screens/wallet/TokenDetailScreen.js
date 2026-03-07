import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Image,
  Pressable,
  ActivityIndicator,
  Dimensions,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LineChart } from "react-native-chart-kit";
import { useTheme } from "../../contexts/ThemeContext";
import Card from "../../components/common/Card";
import Button from "../../components/common/Button";
import coinGeckoService from "../../services/coingecko";

const { width } = Dimensions.get("window");

const TokenDetailScreen = ({ route, navigation }) => {
  const theme = useTheme();
  const styles = createStyles(theme);

  const {
    token,
    chain,
    balance,
    usdValue,
    price,
    priceChange24h,
    walletAddress,
    chainId,
  } = route.params;

  const [coinDetails, setCoinDetails] = useState(null);
  const [chartData, setChartData] = useState(null);
  const [selectedPeriod, setSelectedPeriod] = useState("7");
  const [loading, setLoading] = useState(true);
  const [coinId, setCoinId] = useState(null);

  // Helper function - must be defined before use
  const formatPriceChange = (priceChange) => {
    if (!priceChange && priceChange !== 0)
      return { text: "0.00%", isPositive: true };

    const isPositive = priceChange >= 0;
    const formatted = Math.abs(priceChange).toFixed(2);

    return {
      text: `${isPositive ? "+" : "-"}${formatted}%`,
      isPositive,
      value: priceChange,
    };
  };

  const formatChartData = () => {
    if (!chartData?.prices) return null;

    const prices = chartData.prices.map((p) => p[1]);
    const labels = chartData.prices
      .map((p) => {
        const date = new Date(p[0]);
        return selectedPeriod === "1"
          ? `${date.getHours()}:00`
          : `${date.getMonth() + 1}/${date.getDate()}`;
      })
      .filter((_, i, arr) => i % Math.ceil(arr.length / 6) === 0);

    return {
      labels,
      datasets: [
        {
          data: prices,
          color: (opacity = 1) =>
            change.isPositive
              ? `rgba(76, 175, 80, ${opacity})`
              : `rgba(244, 67, 54, ${opacity})`,
          strokeWidth: 2,
        },
      ],
    };
  };

  // Now we can safely use formatPriceChange
  const change = formatPriceChange(priceChange24h);

  const periods = [
    { label: "1D", value: "1" },
    { label: "7D", value: "7" },
    { label: "1M", value: "30" },
    { label: "3M", value: "90" },
    { label: "1Y", value: "365" },
  ];

  // Get display info from token or fallback to chain
  const displayIcon = token?.logoURI || chain?.icon;
  const displayName = token?.name || chain?.name;
  const displaySymbol = token?.symbol || chain?.symbol;

  useEffect(() => {
    fetchCoinId();
  }, []);

  useEffect(() => {
    if (coinId) {
      loadTokenData();
    }
  }, [selectedPeriod, coinId]);

  /**
   * Get CoinGecko ID for this token using multiple strategies
   */
  const fetchCoinId = async () => {
    try {
      console.log("[TokenDetail] Fetching coin ID for:", token.symbol);

      // Strategy 1: Try by symbol first (for known tokens)
      let id = coinGeckoService.getCoinIdFromSymbol(token.symbol);

      if (id) {
        console.log("[TokenDetail] Found ID by symbol:", id);
        setCoinId(id);
        return;
      }

      // Strategy 2: If we have a contract address, try by contract
      if (
        token?.address &&
        token.address !== "0x0000000000000000000000000000000000000000" &&
        chainId
      ) {
        console.log("[TokenDetail] Trying by contract address:", token.address);

        const platformId = coinGeckoService.getPlatformId(chainId);
        if (platformId) {
          // Try to get token info by contract
          const tokenInfo = await coinGeckoService.getTokenInfoByContract(
            token.address,
            platformId,
          );

          if (tokenInfo && tokenInfo.id) {
            console.log("[TokenDetail] Found ID by contract:", tokenInfo.id);
            setCoinId(tokenInfo.id);
            return;
          }
        }
      }

      // Strategy 3: Try searching by symbol
      console.log("[TokenDetail] Trying search by symbol:", token.symbol);
      const searchResult = await coinGeckoService.searchToken(token.symbol);
      if (searchResult && searchResult.id) {
        console.log("[TokenDetail] Found ID by search:", searchResult.id);
        setCoinId(searchResult.id);
        return;
      }

      console.warn("[TokenDetail] Could not find CoinGecko ID");
      setCoinId(null);
    } catch (error) {
      console.error("[TokenDetail] Error fetching coin ID:", error);
      setCoinId(null);
    } finally {
      // Set loading to false if no coinId was found
      if (!coinId) {
        setLoading(false);
      }
    }
  };

  const loadTokenData = async () => {
    if (!coinId) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      console.log("[TokenDetail] Loading data for coin:", coinId);

      const [details, chart] = await Promise.all([
        coinGeckoService.getCoinDetails(coinId),
        coinGeckoService.getCoinChart(coinId, parseInt(selectedPeriod)),
      ]);

      console.log("[TokenDetail] Data loaded successfully");
      setCoinDetails(details);
      setChartData(chart);
    } catch (error) {
      console.error("[TokenDetail] Error loading token data:", error);
      setCoinDetails(null);
      setChartData(null);
    } finally {
      setLoading(false);
    }
  };

  const chartConfig = {
    backgroundGradientFrom: theme.COLORS.surface,
    backgroundGradientTo: theme.COLORS.surface,
    color: (opacity = 1) =>
      change.isPositive
        ? `rgba(76, 175, 80, ${opacity})`
        : `rgba(244, 67, 54, ${opacity})`,
    strokeWidth: 2,
    barPercentage: 0.5,
    useShadowColorFromDataset: false,
    decimalPlaces: 2,
    propsForDots: {
      r: "0",
    },
  };

  const ActionButton = ({
    icon,
    label,
    onPress,
    color = theme.COLORS.primary,
  }) => (
    <Pressable style={styles.actionButton} onPress={onPress}>
      <View
        style={[styles.actionIconContainer, { backgroundColor: color + "20" }]}
      >
        <Ionicons name={icon} size={24} color={color} />
      </View>
      <Text style={styles.actionLabel}>{label}</Text>
    </Pressable>
  );

  const StatCard = ({ label, value, icon }) => (
    <Card style={styles.statCard}>
      <Ionicons name={icon} size={20} color={theme.COLORS.textSecondary} />
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
    </Card>
  );

  const formatNumber = (num) => {
    if (!num || num === 0) return "0";
    if (num < 0.000001) return "< 0.000001";
    if (num < 0.01) return num.toFixed(6);
    if (num < 1) return num.toFixed(4);
    if (num < 1000) return num.toFixed(2);
    if (num < 1000000)
      return num.toLocaleString("en-US", { maximumFractionDigits: 2 });
    if (num < 1000000000) return `${(num / 1000000).toFixed(2)}M`;
    return `${(num / 1000000000).toFixed(2)}B`;
  };

  return (
    <View style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <Pressable
            onPress={() => navigation.goBack()}
            style={styles.backButton}
          >
            <Ionicons name="arrow-back" size={24} color={theme.COLORS.text} />
          </Pressable>
          <View style={styles.headerInfo}>
            {displayIcon && (
              <Image source={{ uri: displayIcon }} style={styles.tokenIcon} />
            )}
            <View style={styles.headerText}>
              <Text style={styles.tokenName}>{displayName}</Text>
              <Text style={styles.tokenSymbol}>{displaySymbol}</Text>
            </View>
          </View>
          <View style={{ width: 40 }} />
        </View>

        {/* Price Info */}
        <View style={styles.priceSection}>
          <Text style={styles.currentPrice}>
            ${formatNumber(price) || "0.00"}
          </Text>
          {priceChange24h !== undefined && priceChange24h !== null && (
            <View style={styles.priceChange}>
              <Ionicons
                name={change.isPositive ? "trending-up" : "trending-down"}
                size={20}
                color={
                  change.isPositive ? theme.COLORS.success : theme.COLORS.error
                }
              />
              <Text
                style={[
                  styles.priceChangeText,
                  {
                    color: change.isPositive
                      ? theme.COLORS.success
                      : theme.COLORS.error,
                  },
                ]}
              >
                {change.text} (24h)
              </Text>
            </View>
          )}
        </View>

        {/* Balance */}
        <Card style={styles.balanceCard}>
          <Text style={styles.balanceLabel}>Your Balance</Text>
          <Text style={styles.balanceAmount}>
            {parseFloat(balance).toFixed(6)} {displaySymbol}
          </Text>
          <Text style={styles.balanceUsd}>${formatNumber(usdValue)}</Text>
        </Card>

        {/* Chart Section */}
        {coinId ? (
          <>
            {/* Chart Period Selector */}
            <View style={styles.periodSelector}>
              {periods.map((period) => (
                <Pressable
                  key={period.value}
                  style={[
                    styles.periodButton,
                    selectedPeriod === period.value &&
                      styles.periodButtonActive,
                  ]}
                  onPress={() => setSelectedPeriod(period.value)}
                >
                  <Text
                    style={[
                      styles.periodText,
                      selectedPeriod === period.value &&
                        styles.periodTextActive,
                    ]}
                  >
                    {period.label}
                  </Text>
                </Pressable>
              ))}
            </View>

            {/* Chart */}
            <Card style={styles.chartCard}>
              {loading || !formatChartData() ? (
                <View style={styles.chartLoading}>
                  <ActivityIndicator
                    size="large"
                    color={theme.COLORS.primary}
                  />
                </View>
              ) : (
                <LineChart
                  data={formatChartData()}
                  width={width - theme.SPACING.md * 4}
                  height={200}
                  chartConfig={chartConfig}
                  bezier
                  withDots={false}
                  withInnerLines={false}
                  withOuterLines={false}
                  withVerticalLabels={true}
                  withHorizontalLabels={true}
                  style={styles.chart}
                />
              )}
            </Card>
          </>
        ) : (
          <Card style={styles.noDataCard}>
            <Ionicons
              name="information-circle-outline"
              size={48}
              color={theme.COLORS.textSecondary}
            />
            <Text style={styles.noDataText}>
              Chart data not available for this token
            </Text>
          </Card>
        )}

        {/* Quick Actions */}
        <View style={styles.actionsSection}>
          <Text style={styles.sectionTitle}>Quick Actions</Text>
          <View style={styles.actionsGrid}>
            <ActionButton
              icon="arrow-up-outline"
              label="Send"
              onPress={() =>
                navigation.navigate("Send", {
                  token,
                  chain,
                  walletAddress,
                })
              }
              color={theme.COLORS.primary}
            />
            <ActionButton
              icon="arrow-down-outline"
              label="Receive"
              onPress={() =>
                navigation.navigate("Receive", {
                  token,
                  chain,
                  walletAddress,
                })
              }
              color="#4CAF50"
            />
            <ActionButton
              icon="swap-horizontal-outline"
              label="Swap"
              onPress={() =>
                navigation.navigate("Swap", {
                  token,
                  chain,
                  fromToken: displaySymbol,
                })
              }
              color="#FF9800"
            />
          </View>
        </View>

        {/* Statistics */}
        {coinDetails && coinDetails.market_data && (
          <View style={styles.statsSection}>
            <Text style={styles.sectionTitle}>Market Statistics</Text>
            <View style={styles.statsGrid}>
              {coinDetails.market_data?.market_cap?.usd && (
                <StatCard
                  label="Market Cap"
                  value={`$${formatNumber(coinDetails.market_data.market_cap.usd)}`}
                  icon="stats-chart-outline"
                />
              )}
              {coinDetails.market_data?.total_volume?.usd && (
                <StatCard
                  label="24h Volume"
                  value={`$${formatNumber(coinDetails.market_data.total_volume.usd)}`}
                  icon="trending-up-outline"
                />
              )}
              {coinDetails.market_data?.circulating_supply && (
                <StatCard
                  label="Circulating Supply"
                  value={formatNumber(
                    coinDetails.market_data.circulating_supply,
                  )}
                  icon="globe-outline"
                />
              )}
              {coinDetails.market_data?.ath?.usd && (
                <StatCard
                  label="All-Time High"
                  value={`$${formatNumber(coinDetails.market_data.ath.usd)}`}
                  icon="trophy-outline"
                />
              )}
            </View>
          </View>
        )}

        {/* About */}
        {coinDetails?.description?.en && (
          <View style={styles.aboutSection}>
            <Text style={styles.sectionTitle}>About {displayName}</Text>
            <Card style={styles.aboutCard}>
              <Text style={styles.aboutText} numberOfLines={5}>
                {coinDetails.description.en.replace(/<[^>]*>/g, "")}
              </Text>
            </Card>
          </View>
        )}
      </ScrollView>
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
      alignItems: "center",
      justifyContent: "space-between",
      padding: theme.SPACING.md,
      paddingTop: theme.SPACING.lg,
    },
    backButton: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: theme.COLORS.surface,
      justifyContent: "center",
      alignItems: "center",
    },
    headerInfo: {
      flexDirection: "row",
      alignItems: "center",
      gap: theme.SPACING.sm,
    },
    tokenIcon: {
      width: 40,
      height: 40,
      borderRadius: 20,
    },
    headerText: {
      alignItems: "center",
    },
    tokenName: {
      fontSize: theme.FONTS.sizes.lg,
      fontWeight: "bold",
      color: theme.COLORS.text,
    },
    tokenSymbol: {
      fontSize: theme.FONTS.sizes.sm,
      color: theme.COLORS.textSecondary,
    },
    priceSection: {
      alignItems: "center",
      paddingHorizontal: theme.SPACING.md,
      marginBottom: theme.SPACING.md,
    },
    currentPrice: {
      fontSize: 48,
      fontWeight: "bold",
      color: theme.COLORS.text,
      marginBottom: theme.SPACING.xs,
    },
    priceChange: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
    },
    priceChangeText: {
      fontSize: theme.FONTS.sizes.lg,
      fontWeight: "600",
    },
    balanceCard: {
      padding: theme.SPACING.lg,
      marginHorizontal: theme.SPACING.md,
      marginBottom: theme.SPACING.md,
      alignItems: "center",
    },
    balanceLabel: {
      fontSize: theme.FONTS.sizes.sm,
      color: theme.COLORS.textSecondary,
      marginBottom: 4,
    },
    balanceAmount: {
      fontSize: theme.FONTS.sizes.xl,
      fontWeight: "bold",
      color: theme.COLORS.text,
      marginBottom: 2,
    },
    balanceUsd: {
      fontSize: theme.FONTS.sizes.md,
      color: theme.COLORS.textSecondary,
    },
    noDataCard: {
      padding: theme.SPACING.xl,
      marginHorizontal: theme.SPACING.md,
      marginBottom: theme.SPACING.md,
      alignItems: "center",
      gap: theme.SPACING.sm,
    },
    noDataText: {
      fontSize: theme.FONTS.sizes.sm,
      color: theme.COLORS.textSecondary,
      textAlign: "center",
    },
    periodSelector: {
      flexDirection: "row",
      justifyContent: "space-around",
      paddingHorizontal: theme.SPACING.md,
      marginBottom: theme.SPACING.sm,
    },
    periodButton: {
      paddingHorizontal: theme.SPACING.md,
      paddingVertical: theme.SPACING.xs,
      borderRadius: 12,
      backgroundColor: theme.COLORS.surface,
    },
    periodButtonActive: {
      backgroundColor: theme.COLORS.primary,
    },
    periodText: {
      fontSize: theme.FONTS.sizes.sm,
      color: theme.COLORS.text,
      fontWeight: "500",
    },
    periodTextActive: {
      color: "#fff",
    },
    chartCard: {
      padding: theme.SPACING.sm,
      marginHorizontal: theme.SPACING.md,
      marginBottom: theme.SPACING.md,
    },
    chartLoading: {
      height: 200,
      justifyContent: "center",
      alignItems: "center",
    },
    chart: {
      marginVertical: 8,
      borderRadius: 16,
    },
    actionsSection: {
      paddingHorizontal: theme.SPACING.md,
      marginBottom: theme.SPACING.lg,
    },
    sectionTitle: {
      fontSize: theme.FONTS.sizes.lg,
      fontWeight: "bold",
      color: theme.COLORS.text,
      marginBottom: theme.SPACING.sm,
    },
    actionsGrid: {
      flexDirection: "row",
      justifyContent: "space-around",
    },
    actionButton: {
      alignItems: "center",
      gap: 6,
    },
    actionIconContainer: {
      width: 56,
      height: 56,
      borderRadius: 16,
      justifyContent: "center",
      alignItems: "center",
    },
    actionLabel: {
      fontSize: theme.FONTS.sizes.sm,
      color: theme.COLORS.text,
      fontWeight: "500",
    },
    statsSection: {
      paddingHorizontal: theme.SPACING.md,
      marginBottom: theme.SPACING.lg,
    },
    statsGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: theme.SPACING.sm,
    },
    statCard: {
      flex: 1,
      minWidth: "48%",
      padding: theme.SPACING.md,
      alignItems: "flex-start",
    },
    statLabel: {
      fontSize: theme.FONTS.sizes.xs,
      color: theme.COLORS.textSecondary,
      marginTop: 4,
      marginBottom: 2,
    },
    statValue: {
      fontSize: theme.FONTS.sizes.md,
      fontWeight: "600",
      color: theme.COLORS.text,
    },
    aboutSection: {
      paddingHorizontal: theme.SPACING.md,
      marginBottom: theme.SPACING.xl,
    },
    aboutCard: {
      padding: theme.SPACING.md,
    },
    aboutText: {
      fontSize: theme.FONTS.sizes.sm,
      color: theme.COLORS.textSecondary,
      lineHeight: 20,
    },
  });

export default TokenDetailScreen;
