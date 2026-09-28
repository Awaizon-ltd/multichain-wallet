import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Image,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useWallet } from "../../contexts/WalletContext";
import { useTheme } from "../../contexts/ThemeContext";
import Button from "../../components/common/Button";
import Input from "../../components/common/Input";
import Card from "../../components/common/Card";
import ChainSwitcher from "../../components/wallet/ChainSwitcher";
import ChainBadge from "../../components/common/ChainBadge";
import { getTokenDetails, getTokenBalance } from "../../services/blockchain";
import { saveToken, getDatabase } from "../../utils/Database";
import { getTokensByChain } from "../../utils/TokenDatabase";
import { validateAddress } from "../../utils/Validators";
import coinGeckoService from "../../services/coingec";
import Alert from "../../utils/Alert";

const TokenImportScreen = ({ navigation }) => {
  const theme = useTheme();
  const styles = createStyles(theme);
  const { selectedChain, wallet } = useWallet();

  const [tokenAddress, setTokenAddress] = useState("");
  const [loading, setLoading] = useState(false);
  const [fetchingPrice, setFetchingPrice] = useState(false);
  const [tokenInfo, setTokenInfo] = useState(null);
  const [balance, setBalance] = useState(null);
  const [priceData, setPriceData] = useState(null);
  const [logoUrl, setLogoUrl] = useState(null);
  const [error, setError] = useState("");
  const [showChainSwitcher, setShowChainSwitcher] = useState(false);

  const handleFetchToken = async () => {
    setError("");
    setTokenInfo(null);
    setBalance(null);
    setPriceData(null);
    setLogoUrl(null);

    console.log("[TokenImport] 🔍 ========== FETCH TOKEN START ==========");
    console.log("[TokenImport] 📊 Input Address:", tokenAddress);
    console.log("[TokenImport] 🔗 Selected Chain:", {
      id: selectedChain.id,
      name: selectedChain.name,
    });

    const addressValidation = validateAddress(tokenAddress);
    if (!addressValidation.isValid) {
      console.log("[TokenImport] ❌ Invalid address");
      setError("Invalid token contract address");
      return;
    }

    try {
      setLoading(true);
      console.log("[TokenImport] 🔄 Fetching token details...");

      const details = await getTokenDetails(tokenAddress, selectedChain);
      console.log("[TokenImport] ✅ Token details received:", {
        name: details.name,
        symbol: details.symbol,
        decimals: details.decimals,
      });
      setTokenInfo(details);

      if (wallet?.address) {
        console.log(
          "[TokenImport] 🔄 Fetching balance for wallet:",
          wallet.address,
        );
        const tokenBalance = await getTokenBalance(
          tokenAddress,
          wallet.address,
          selectedChain,
        );
        console.log("[TokenImport] ✅ Balance:", tokenBalance.formatted);
        setBalance(tokenBalance);
      }

      setFetchingPrice(true);
      try {
        const platform = coinGeckoService.getPlatformId(selectedChain.id);
        console.log("[TokenImport] 🔄 Fetching CoinGecko data");

        const price = await coinGeckoService.getTokenPrice(
          tokenAddress,
          platform,
        );
        if (price) {
          setPriceData(price);
          console.log("[TokenImport] ✅ Price:", price.usd);
        }

        const logo = await coinGeckoService.getTokenLogo(
          tokenAddress,
          platform,
        );
        if (logo) {
          setLogoUrl(logo);
          console.log("[TokenImport] ✅ Logo retrieved");
        }
      } catch (priceError) {
        console.log(
          "[TokenImport] ⚠️ CoinGecko fetch failed:",
          priceError.message,
        );
      }
      setFetchingPrice(false);

      console.log(
        "[TokenImport] ✅ ========== FETCH TOKEN COMPLETE ==========",
      );
    } catch (err) {
      console.error("[TokenImport] ❌ Error:", err.message);
      setError("Failed to fetch token details. Verify address and network.");
      setFetchingPrice(false);
    } finally {
      setLoading(false);
    }
  };

  const handleImportToken = async () => {
    if (!tokenInfo) {
      console.log("[TokenImport] ❌ No token info available");
      return;
    }

    console.log("[TokenImport] 💾 ========== IMPORT TOKEN START ==========");

    try {
      setLoading(true);

      // Step 1: Get wallet address as user identifier
      console.log("[TokenImport] 🔍 Step 1: Getting wallet address");

      if (!wallet?.address) {
        throw new Error("No wallet connected");
      }

      const userAddress = wallet.address.toLowerCase();
      console.log("[TokenImport] 📊 User Address:", userAddress);

      // Step 2: Prepare token data
      console.log("[TokenImport] 🔍 Step 2: Preparing token data");
      const tokenData = {
        address: tokenInfo.address.toLowerCase(),
        name: tokenInfo.name,
        symbol: tokenInfo.symbol,
        decimals: tokenInfo.decimals,
        logo: logoUrl,
      };
      console.log("[TokenImport] 📦 Token data prepared");

      // Step 3: Normalize chain ID
      const normalizedChainId = parseInt(selectedChain.id);
      console.log("[TokenImport] 🔍 Step 3: Chain ID:", normalizedChainId);

      // Step 4: Check if token already exists
      console.log("[TokenImport] 🔍 Step 4: Checking existing tokens");
      const existingTokens = await getTokensByChain(
        userAddress,
        normalizedChainId,
      );
      console.log("[TokenImport] 📊 Existing tokens:", existingTokens.length);

      const alreadyExists = existingTokens.some(
        (t) => t.address.toLowerCase() === tokenData.address.toLowerCase(),
      );

      if (alreadyExists) {
        console.log("[TokenImport] ⚠️ Token already exists");
        Alert.alert(
          "Already Added",
          `${tokenInfo.symbol} is already in your wallet`,
          [
            {
              text: "OK",
              onPress: () => navigation.goBack(),
            },
          ],
        );
        return;
      }

      // Step 5: Save token
      console.log("[TokenImport] 🔍 Step 5: Saving token");
      const db = getDatabase();

      let savedTokenId = null;
      await db.withTransactionAsync(async () => {
        savedTokenId = await saveToken(
          userAddress,
          normalizedChainId,
          tokenData,
        );
        console.log("[TokenImport] 💾 Token saved, ID:", savedTokenId);
      });

      console.log("[TokenImport] ✅ Transaction committed");

      // Step 6: Verify
      console.log("[TokenImport] 🔍 Step 6: Verifying save");
      const verifiedTokens = await getTokensByChain(
        userAddress,
        normalizedChainId,
      );
      console.log("[TokenImport] ✅ Total tokens now:", verifiedTokens.length);

      console.log("[TokenImport] ✅ ========== IMPORT COMPLETE ==========");

      Alert.alert(
        "Success! 🎉",
        `${tokenInfo.symbol} has been added to your wallet`,
        [
          {
            text: "Done",
            onPress: () => navigation.goBack(),
          },
        ],
      );
    } catch (err) {
      console.error("[TokenImport] ❌ Error:", err.message);

      if (err.message?.includes("UNIQUE constraint failed")) {
        Alert.alert(
          "Already Added",
          `${tokenInfo.symbol} is already in your wallet`,
          [
            {
              text: "OK",
              onPress: () => navigation.goBack(),
            },
          ],
        );
      } else {
        Alert.alert("Error", `Failed to import token: ${err.message}`);
      }
    } finally {
      setLoading(false);
    }
  };

  const formatBalance = (bal) => {
    if (!bal) return "0";
    const num = parseFloat(bal.formatted);
    if (num === 0) return "0";
    if (num < 0.0001) return "< 0.0001";
    return num.toFixed(6);
  };

  const formatUSD = (value) => {
    if (!value) return "$0.00";
    if (value < 0.01) return "< $0.01";
    return `$${value.toFixed(2)}`;
  };

  const calculateUSDValue = () => {
    if (!balance || !priceData) return 0;
    return parseFloat(balance.formatted) * priceData.usd;
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Compact Header */}
        <View style={styles.header}>
          <Ionicons name="add-circle" size={32} color={theme.COLORS.primary} />
          <Text style={styles.title}>Import Token</Text>
        </View>

        {/* Network Selector - Compact */}
        <TouchableOpacity
          style={styles.networkSelector}
          onPress={() => setShowChainSwitcher(true)}
          activeOpacity={0.7}
        >
          <Image
            source={{ uri: selectedChain.icon }}
            style={styles.networkIcon}
            resizeMode="contain"
          />
          <Text style={styles.networkName}>{selectedChain.name}</Text>
          <Ionicons
            name="chevron-down"
            size={18}
            color={theme.COLORS.textSecondary}
          />
        </TouchableOpacity>

        {/* Token Address Input - Compact */}
        <View style={styles.inputSection}>
          <Text style={styles.inputLabel}>Contract Address</Text>
          <View style={styles.inputRow}>
            <Input
              value={tokenAddress}
              onChangeText={setTokenAddress}
              placeholder="0x..."
              error={error}
              autoCapitalize="none"
              autoCorrect={false}
              style={styles.input}
            />
            <Button
              title={loading ? "..." : "Fetch"}
              onPress={handleFetchToken}
              loading={loading}
              disabled={!tokenAddress || loading}
              style={styles.fetchButton}
            />
          </View>
        </View>

        {/* Token Info Card - Compact & Clean */}
        {tokenInfo && (
          <Card style={styles.tokenCard}>
            {/* Token Header - Minimal */}
            <View style={styles.tokenHeader}>
              <View style={styles.tokenLogoOuterWrap}>
                {logoUrl ? (
                  <Image source={{ uri: logoUrl }} style={styles.tokenLogo} />
                ) : (
                  <View style={styles.tokenLogoPlaceholder}>
                    <Text style={styles.tokenLogoText}>
                      {tokenInfo.symbol.substring(0, 2).toUpperCase()}
                    </Text>
                  </View>
                )}
                <ChainBadge
                  uri={selectedChain?.icon}
                  borderColor={theme.COLORS.card}
                />
              </View>

              <View style={styles.tokenInfo}>
                <Text style={styles.tokenName}>{tokenInfo.name}</Text>
                <Text style={styles.tokenSymbol}>{tokenInfo.symbol}</Text>
              </View>

              {!loading && (
                <Ionicons
                  name="checkmark-circle"
                  size={24}
                  color={theme.COLORS.success}
                />
              )}
            </View>

            {/* Price Section - Compact */}
            {fetchingPrice ? (
              <View style={styles.loadingRow}>
                <ActivityIndicator size="small" color={theme.COLORS.primary} />
                <Text style={styles.loadingText}>Loading price...</Text>
              </View>
            ) : (
              <>
                {priceData && (
                  <View style={styles.infoRow}>
                    <View style={styles.infoItem}>
                      <Text style={styles.infoLabel}>Price</Text>
                      <Text style={styles.infoValue}>
                        ${priceData.usd.toFixed(6)}
                      </Text>
                    </View>
                    {priceData.usd_24h_change !== undefined && (
                      <View style={styles.infoItem}>
                        <Text style={styles.infoLabel}>24h</Text>
                        <Text
                          style={[
                            styles.infoValue,
                            {
                              color:
                                priceData.usd_24h_change >= 0
                                  ? theme.COLORS.success
                                  : theme.COLORS.error,
                            },
                          ]}
                        >
                          {priceData.usd_24h_change >= 0 ? "+" : ""}
                          {priceData.usd_24h_change.toFixed(2)}%
                        </Text>
                      </View>
                    )}
                  </View>
                )}

                {balance && (
                  <View style={styles.balanceRow}>
                    <Text style={styles.balanceLabel}>Balance</Text>
                    <View style={styles.balanceValues}>
                      <Text style={styles.balanceAmount}>
                        {formatBalance(balance)} {tokenInfo.symbol}
                      </Text>
                      {priceData && (
                        <Text style={styles.balanceUSD}>
                          {formatUSD(calculateUSDValue())}
                        </Text>
                      )}
                    </View>
                  </View>
                )}
              </>
            )}

            {/* Details - Minimal */}
            <View style={styles.details}>
              <View style={styles.detailItem}>
                <Text style={styles.detailLabel}>Decimals</Text>
                <Text style={styles.detailValue}>{tokenInfo.decimals}</Text>
              </View>
              <View style={styles.detailItem}>
                <Text style={styles.detailLabel}>Network</Text>
                <Text style={styles.detailValue}>{selectedChain.name}</Text>
              </View>
            </View>

            <Button
              title={`Import ${tokenInfo.symbol}`}
              onPress={handleImportToken}
              loading={loading}
              fullWidth
              style={styles.importButton}
            />
          </Card>
        )}

        {/* Warning - Compact */}
        <View style={styles.warning}>
          <Ionicons
            name="shield-checkmark-outline"
            size={16}
            color={theme.COLORS.warning}
          />
          <Text style={styles.warningText}>
            Only import tokens from trusted sources. Verify contract addresses
            carefully.
          </Text>
        </View>
      </ScrollView>

      {/* Chain Switcher Modal */}
      <ChainSwitcher
        visible={showChainSwitcher}
        onClose={() => setShowChainSwitcher(false)}
        currentChain={selectedChain}
        onSelectChain={(chain) => {
          console.log("[TokenImport] Chain switched:", chain.name);
          setShowChainSwitcher(false);
          setTokenInfo(null);
          setBalance(null);
          setPriceData(null);
          setLogoUrl(null);
          setTokenAddress("");
        }}
      />
    </KeyboardAvoidingView>
  );
};

const createStyles = (theme) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.COLORS.background,
    },
    content: {
      padding: 16,
      paddingBottom: 24,
    },
    // Compact Header
    header: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      marginBottom: 16,
    },
    title: {
      fontSize: 20,
      fontWeight: "700",
      color: theme.COLORS.text,
    },
    // Compact Network Selector
    networkSelector: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: theme.COLORS.surface,
      borderRadius: 12,
      padding: 12,
      marginBottom: 16,
      borderWidth: 1,
      borderColor: theme.COLORS.border,
    },
    networkIcon: {
      width: 28,
      height: 28,
      borderRadius: 14,
      marginRight: 10,
    },
    networkName: {
      flex: 1,
      fontSize: 15,
      fontWeight: "600",
      color: theme.COLORS.text,
    },
    // Compact Input Section
    inputSection: {
      marginBottom: 16,
    },
    inputLabel: {
      fontSize: 13,
      fontWeight: "600",
      color: theme.COLORS.textSecondary,
      marginBottom: 8,
    },
    inputRow: {
      flexDirection: "row",
      gap: 8,
    },
    input: {
      flex: 1,
    },
    fetchButton: {
      width: 80,
      height: 48,
    },
    // Token Card - Minimal Spacing
    tokenCard: {
      padding: 14,
      marginBottom: 16,
      borderWidth: 1.5,
      borderColor: theme.COLORS.success,
      backgroundColor: theme.COLORS.surface,
    },
    tokenHeader: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      marginBottom: 12,
      paddingBottom: 12,
      borderBottomWidth: 1,
      borderBottomColor: theme.COLORS.border,
    },
    tokenLogoOuterWrap: { position: "relative" },
    tokenLogo: {
      width: 40,
      height: 40,
      borderRadius: 20,
    },
    tokenLogoPlaceholder: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: theme.COLORS.primary,
      justifyContent: "center",
      alignItems: "center",
    },
    tokenLogoText: {
      fontSize: 16,
      fontWeight: "bold",
      color: theme.COLORS.surface,
    },
    tokenInfo: {
      flex: 1,
    },
    tokenName: {
      fontSize: 15,
      fontWeight: "700",
      color: theme.COLORS.text,
      marginBottom: 2,
    },
    tokenSymbol: {
      fontSize: 13,
      color: theme.COLORS.textSecondary,
      fontWeight: "500",
    },
    // Loading State
    loadingRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      padding: 10,
      backgroundColor: theme.COLORS.background,
      borderRadius: 8,
      marginBottom: 8,
    },
    loadingText: {
      fontSize: 13,
      color: theme.COLORS.textSecondary,
    },
    // Info Row - Compact
    infoRow: {
      flexDirection: "row",
      gap: 8,
      marginBottom: 8,
    },
    infoItem: {
      flex: 1,
      backgroundColor: theme.COLORS.background,
      borderRadius: 8,
      padding: 10,
    },
    infoLabel: {
      fontSize: 11,
      color: theme.COLORS.textSecondary,
      marginBottom: 4,
      textTransform: "uppercase",
      fontWeight: "600",
    },
    infoValue: {
      fontSize: 14,
      fontWeight: "700",
      color: theme.COLORS.text,
    },
    // Balance Row - Compact
    balanceRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      backgroundColor: theme.COLORS.primaryLight,
      borderRadius: 8,
      padding: 10,
      marginBottom: 12,
    },
    balanceLabel: {
      fontSize: 13,
      color: theme.COLORS.primary,
      fontWeight: "600",
    },
    balanceValues: {
      alignItems: "flex-end",
    },
    balanceAmount: {
      fontSize: 14,
      fontWeight: "700",
      color: theme.COLORS.primary,
    },
    balanceUSD: {
      fontSize: 11,
      color: theme.COLORS.primary,
      marginTop: 2,
    },
    // Details - Minimal
    details: {
      gap: 6,
      marginBottom: 12,
    },
    detailItem: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
    },
    detailLabel: {
      fontSize: 12,
      color: theme.COLORS.textSecondary,
    },
    detailValue: {
      fontSize: 12,
      fontWeight: "600",
      color: theme.COLORS.text,
    },
    importButton: {
      marginTop: 4,
    },
    // Warning - Compact
    warning: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 8,
      padding: 12,
      backgroundColor: theme.COLORS.surface,
      borderRadius: 8,
      borderLeftWidth: 3,
      borderLeftColor: theme.COLORS.warning,
    },
    warningText: {
      flex: 1,
      fontSize: 11,
      color: theme.COLORS.textSecondary,
      lineHeight: 16,
    },
  });

export default TokenImportScreen;
