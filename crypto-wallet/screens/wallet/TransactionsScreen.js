import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  RefreshControl,
  Pressable,
  Linking,
  Image,
  ActivityIndicator,
  TouchableOpacity,
} from "react-native";
import { useWallet } from "../../contexts/WalletContext";
import { useTheme } from "../../contexts/ThemeContext";
import Card from "../../components/common/Card";
import { getTransactionHistory } from "../../utils/blockchain/Transaction";
import { formatAddress } from "../../utils/Wallet";
import { Ionicons } from "@expo/vector-icons";

const TransactionsScreen = ({ navigation }) => {
  const theme = useTheme();
  const styles = createStyles(theme);
  const { wallet, selectedChain } = useWallet();
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (wallet?.address) {
      loadTransactions();
    }
  }, [wallet, selectedChain]);

  const loadTransactions = async () => {
    try {
      setLoading(true);
      const history = await getTransactionHistory(
        wallet.address,
        selectedChain,
        50,
      );
      setTransactions(history);
    } catch (error) {
      console.error("Error loading transactions:", error);
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadTransactions();
    setRefreshing(false);
  };

  const openTransaction = (txHash) => {
    const url = `${selectedChain.explorer}/tx/${txHash}`;
    Linking.openURL(url);
  };

  const getTransactionType = (tx) => {
    if (tx.from.toLowerCase() === wallet.address.toLowerCase()) {
      return "sent";
    }
    return "received";
  };

  const formatTimestamp = (timestamp) => {
    if (!timestamp) return "Pending";
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now - date;

    // Less than 1 minute
    if (diff < 60000) return "Just now";
    // Less than 1 hour
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    // Less than 24 hours
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    // Less than 7 days
    if (diff < 604800000) return `${Math.floor(diff / 86400000)}d ago`;

    // Format as date
    const options = { month: "short", day: "numeric" };
    if (date.getFullYear() !== now.getFullYear()) {
      options.year = "numeric";
    }
    return date.toLocaleDateString("en-US", options);
  };

  const formatAmount = (value, decimals = 4) => {
    const num = parseFloat(value);
    if (num === 0) return "0";
    if (num < 0.0001) return "<0.0001";
    if (num < 1) return num.toFixed(6).replace(/\.?0+$/, "");
    if (num < 1000) return num.toFixed(decimals).replace(/\.?0+$/, "");
    if (num < 1000000)
      return (num / 1000).toFixed(2).replace(/\.?0+$/, "") + "K";
    return (num / 1000000).toFixed(2).replace(/\.?0+$/, "") + "M";
  };

  const renderTransaction = ({ item }) => {
    const type = getTransactionType(item);
    const isSent = type === "sent";

    return (
      <Pressable
        style={styles.txCard}
        onPress={() => openTransaction(item.hash)}
        android_ripple={{ color: theme.COLORS.surface }}
      >
        <View style={styles.txRow}>
          {/* Left: Icon and Address */}
          <View style={styles.txLeft}>
            <View
              style={[
                styles.txIconContainer,
                isSent ? styles.txIconSent : styles.txIconReceived,
              ]}
            >
              <Text style={styles.txIconText}>{isSent ? "↑" : "↓"}</Text>
            </View>
            <View style={styles.txInfo}>
              <Text style={styles.txAddress}>
                {isSent ? "To" : "From"}{" "}
                {formatAddress(isSent ? item.to : item.from, 8)}
              </Text>
              <View style={styles.txMeta}>
                <Text style={styles.txTime}>
                  {formatTimestamp(item.timestamp)}
                </Text>
                {item.category === "erc20" && (
                  <>
                    <Text style={styles.txMetaDot}>•</Text>
                    <Text style={styles.txToken}>ERC-20</Text>
                  </>
                )}
              </View>
            </View>
          </View>

          {/* Right: Amount */}
          <View style={styles.txRight}>
            <Text
              style={[
                styles.txAmount,
                isSent ? styles.txAmountSent : styles.txAmountReceived,
              ]}
            >
              {isSent ? "-" : "+"}
              {formatAmount(item.value)}
            </Text>
            <Text style={styles.txSymbol}>{item.asset}</Text>
          </View>
        </View>
      </Pressable>
    );
  };

  const renderSectionHeader = (date) => (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionHeaderText}>{date}</Text>
    </View>
  );

  const groupTransactionsByDate = () => {
    const grouped = {};
    transactions.forEach((tx) => {
      const date = formatTimestamp(tx.timestamp);
      if (!grouped[date]) {
        grouped[date] = [];
      }
      grouped[date].push(tx);
    });
    return grouped;
  };

  const renderEmpty = () => (
    <View style={styles.emptyContainer}>
      <View style={styles.emptyIconContainer}>
        <Text style={styles.emptyIcon}>📋</Text>
      </View>
      <Text style={styles.emptyText}>No transactions</Text>
      <Text style={styles.emptySubtext}>
        Transaction history will appear here
      </Text>
    </View>
  );

  return (
    <View style={styles.container}>
      {/* Minimal Header */}

      <View style={styles.header}>
        {/* Back Button */}
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backButton}
          activeOpacity={0.7}
        >
          <Ionicons
            name="chevron-back"
            size={24}
            color={theme.COLORS.text}
          />
        </TouchableOpacity>

        {/* Title */}
        <Text style={styles.headerTitle}>Transactions</Text>

        {/* Chain Badge */}
        <View style={styles.chainBadge}>
          <Image
            source={{ uri: selectedChain.icon }}
            style={styles.chainIcon}
            resizeMode="contain"
          />
          <Text style={styles.chainText}>{selectedChain.name}</Text>
        </View>
      </View>
      {/* Transaction List */}
      {loading && transactions.length === 0 ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.COLORS.primary} />
        </View>
      ) : (
        <FlatList
          data={transactions}
          renderItem={renderTransaction}
          keyExtractor={(item) => item.hash}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={theme.COLORS.primary}
              colors={[theme.COLORS.primary]}
            />
          }
          ListEmptyComponent={renderEmpty}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
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
      paddingHorizontal: theme.SPACING.lg,
      paddingVertical: theme.SPACING.md,
      backgroundColor: theme.COLORS.background,
      borderBottomWidth: 1,
      borderBottomColor: theme.COLORS.border,
    },
    headerTitle: {
      fontSize: theme.FONTS.sizes.xl,
      fontWeight: "600",
      color: theme.COLORS.text,
      letterSpacing: -0.5,
    },
    chainBadge: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: theme.COLORS.surface,
      paddingHorizontal: theme.SPACING.sm,
      paddingVertical: 6,
      borderRadius: 20,
      gap: 6,
      borderWidth: 1,
      borderColor: theme.COLORS.border,
    },
    chainIcon: {
      width: 16,
      height: 16,
      borderRadius: 8,
    },
    chainText: {
      fontSize: theme.FONTS.sizes.xs,
      color: theme.COLORS.text,
      fontWeight: "500",
    },
    list: {
      paddingHorizontal: theme.SPACING.lg,
      paddingBottom: theme.SPACING.lg,
    },
    loadingContainer: {
      flex: 1,
      justifyContent: "center",
      alignItems: "center",
    },

    // Transaction Card
    txCard: {
      paddingVertical: theme.SPACING.md,
      backgroundColor: theme.COLORS.background,
    },
    txRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
    },
    txLeft: {
      flexDirection: "row",
      alignItems: "center",
      flex: 1,
      gap: theme.SPACING.sm,
    },
    txIconContainer: {
      width: 36,
      height: 36,
      borderRadius: 18,
      justifyContent: "center",
      alignItems: "center",
    },
    txIconSent: {
      backgroundColor: theme.COLORS.error + "15",
    },
    txIconReceived: {
      backgroundColor: theme.COLORS.success + "15",
    },
    txIconText: {
      fontSize: 18,
      fontWeight: "600",
    },
    txInfo: {
      flex: 1,
    },
    txAddress: {
      fontSize: theme.FONTS.sizes.md,
      color: theme.COLORS.text,
      fontWeight: "500",
      marginBottom: 2,
    },
    txMeta: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
    },
    txTime: {
      fontSize: theme.FONTS.sizes.xs,
      color: theme.COLORS.textSecondary,
    },
    txMetaDot: {
      fontSize: theme.FONTS.sizes.xs,
      color: theme.COLORS.textSecondary,
    },
    txToken: {
      fontSize: theme.FONTS.sizes.xs,
      color: theme.COLORS.primary,
      fontWeight: "500",
    },
    txRight: {
      alignItems: "flex-end",
    },
    txAmount: {
      fontSize: theme.FONTS.sizes.md,
      fontWeight: "600",
      marginBottom: 2,
    },
    txAmountSent: {
      color: theme.COLORS.error,
    },
    txAmountReceived: {
      color: theme.COLORS.success,
    },
    txSymbol: {
      fontSize: theme.FONTS.sizes.xs,
      color: theme.COLORS.textSecondary,
      fontWeight: "500",
    },
    separator: {
      height: 1,
      backgroundColor: theme.COLORS.border,
      opacity: 0.3,
    },

    // Section Header
    sectionHeader: {
      paddingVertical: theme.SPACING.sm,
      backgroundColor: theme.COLORS.background,
    },
    sectionHeaderText: {
      fontSize: theme.FONTS.sizes.xs,
      color: theme.COLORS.textSecondary,
      fontWeight: "600",
      textTransform: "uppercase",
      letterSpacing: 0.5,
    },

    // Empty State
    emptyContainer: {
      alignItems: "center",
      justifyContent: "center",
      paddingVertical: theme.SPACING.xxl * 3,
    },
    emptyIconContainer: {
      width: 80,
      height: 80,
      borderRadius: 40,
      backgroundColor: theme.COLORS.surface,
      justifyContent: "center",
      alignItems: "center",
      marginBottom: theme.SPACING.lg,
      borderWidth: 1,
      borderColor: theme.COLORS.border,
    },
    emptyIcon: {
      fontSize: 40,
    },
    emptyText: {
      fontSize: theme.FONTS.sizes.lg,
      fontWeight: "600",
      color: theme.COLORS.text,
      marginBottom: theme.SPACING.xs,
    },
    emptySubtext: {
      fontSize: theme.FONTS.sizes.sm,
      color: theme.COLORS.textSecondary,
      textAlign: "center",
    },
  });

export default TransactionsScreen;
