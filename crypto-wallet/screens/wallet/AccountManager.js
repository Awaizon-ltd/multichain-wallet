// screens/AccountManager.js - Using existing CoinGecko API

import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useWallet } from "../../contexts/WalletContext";
import { useChain } from "../../contexts/ChainContext";
import { useTheme } from "../../contexts/ThemeContext";
import { useLoading } from "../../contexts/LoadingContext";
import { getBalance } from "../../utils/Wallet";
import { getCoinPriceBySymbol } from "../../services/coingecko"; // ✅ Import existing API


// Import sub-components
import AccountCard from "../../components/account/AccountCard";
import AddAccountModal from "../../components/account/AddAccountModal";
import PasscodeModal from "../../components/account/PasscodeModal";
import EmptyState from "../../components/account/EmptyState";

// ✅ Simple in-memory cache for prices (5 minutes)
const priceCache = {
  data: {},
  timestamps: {},
};

const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

const isCacheValid = (symbol) => {
  const timestamp = priceCache.timestamps[symbol];
  if (!timestamp) return false;
  return Date.now() - timestamp < CACHE_DURATION;
};

const AccountManager = ({ navigation }) => {
  const {
    accounts,
    activeAccountIndex,
    addAccount,
    switchAccount,
    renameAccount,
  } = useWallet();

  const { activeChain } = useChain();
  const { COLORS, SPACING, FONTS, BORDER_RADIUS, SHADOWS } = useTheme();
  const { showLoading, updateLoading, hideLoading } = useLoading();

  // State management
  const [showAddAccount, setShowAddAccount] = useState(false);
  const [showPasscodeModal, setShowPasscodeModal] = useState(false);
  const [newAccountName, setNewAccountName] = useState("");
  const [editingIndex, setEditingIndex] = useState(null);
  const [editingName, setEditingName] = useState("");
  const [pendingAction, setPendingAction] = useState(null);
  const [pendingSwitchIndex, setPendingSwitchIndex] = useState(null);

  // ✅ Store balances and prices locally per account
  const [accountBalances, setAccountBalances] = useState({});
  const [loadingBalances, setLoadingBalances] = useState(false);
  const [tokenPrice, setTokenPrice] = useState(null); // ✅ USD price for current chain token

  const styles = StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: COLORS.background,
    },
    header: {
      backgroundColor: COLORS.surface,
      paddingTop: Platform.OS === "ios" ? 56 : 44,
      paddingBottom: SPACING.lg,
      paddingHorizontal: SPACING.md,
      ...SHADOWS.small,
    },
    headerTop: {
      flexDirection: "row",
      alignItems: "center",
      marginBottom: SPACING.xs,
    },
    backButton: {
      padding: SPACING.xs,
      marginRight: SPACING.sm,
    },
    title: {
      fontSize: FONTS.sizes.xl,
      fontWeight: "700",
      color: COLORS.text,
      flex: 1,
    },
    subtitle: {
      fontSize: FONTS.sizes.sm,
      color: COLORS.textSecondary,
      marginTop: 2,
      paddingLeft: 36,
    },
    accountCount: {
      fontSize: FONTS.sizes.xs,
      color: COLORS.primary,
      fontWeight: "600",
      marginTop: SPACING.xs,
      paddingLeft: 36,
      textTransform: "uppercase",
      letterSpacing: 0.8,
    },
    listContainer: {
      padding: SPACING.md,
      paddingBottom: 100,
    },
    addButton: {
      position: "absolute",
      bottom: SPACING.lg,
      left: SPACING.md,
      right: SPACING.md,
      backgroundColor: COLORS.primary,
      paddingVertical: SPACING.md + 2,
      borderRadius: BORDER_RADIUS.md,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: SPACING.xs,
      ...SHADOWS.medium,
    },
    addButtonText: {
      color: "#FFFFFF",
      fontSize: FONTS.sizes.md,
      fontWeight: "700",
      letterSpacing: 0.2,
    },
  });

  // ✅ Fetch balances and prices when component mounts or chain changes
  useEffect(() => {
    fetchAllAccountBalances();
    fetchCurrentTokenPrice();
  }, [accounts.length, activeChain.id]);

  // ✅ Fetch token price for current chain with caching
  const fetchCurrentTokenPrice = async () => {
    try {
      const symbol = activeChain.symbol;

      // Check cache first
      if (isCacheValid(symbol)) {
        console.log(
          `💰 Using cached price for ${symbol}: $${priceCache.data[symbol].usd}`,
        );
        setTokenPrice(priceCache.data[symbol]);
        return;
      }

      console.log(`📡 Fetching price for ${symbol}...`);
      const priceData = await getCoinPriceBySymbol(symbol);

      if (priceData) {
        // Cache the price
        priceCache.data[symbol] = priceData;
        priceCache.timestamps[symbol] = Date.now();

        console.log(`✅ Fetched ${symbol} price: $${priceData.usd}`);
        setTokenPrice(priceData);
      } else {
        console.warn(`⚠️ No price data for ${symbol}`);
        setTokenPrice(null);
      }
    } catch (error) {
      console.error("❌ Error fetching token price:", error);
      // Use cached price if available
      const cachedPrice = priceCache.data[activeChain.symbol];
      if (cachedPrice) {
        setTokenPrice(cachedPrice);
      } else {
        setTokenPrice(null);
      }
    }
  };

  // ✅ Fetch balance for all accounts independently
  const fetchAllAccountBalances = async () => {
    if (accounts.length === 0) return;

    try {
      setLoadingBalances(true);
      const balancePromises = accounts.map(async (account) => {
        try {
          const balance = await getBalance(account.address, activeChain);
          return { address: account.address, balance };
        } catch (error) {
          console.error(
            `Error fetching balance for ${account.address}:`,
            error,
          );
          return {
            address: account.address,
            balance: {
              wei: "0",
              formatted: "0",
              symbol: activeChain.symbol,
              chainId: activeChain.id,
              chainName: activeChain.name,
            },
          };
        }
      });

      const results = await Promise.all(balancePromises);

      // Store balances by address
      const balancesMap = {};
      results.forEach(({ address, balance }) => {
        balancesMap[address] = balance;
      });

      setAccountBalances(balancesMap);
    } catch (error) {
      console.error("Error fetching account balances:", error);
    } finally {
      setLoadingBalances(false);
    }
  };

  // ✅ Get balance for a specific account
  const getBalanceForAccount = (accountAddress) => {
    return (
      accountBalances[accountAddress] || {
        wei: "0",
        formatted: "0",
        symbol: activeChain.symbol,
        chainId: activeChain.id,
        chainName: activeChain.name,
      }
    );
  };

  // Handlers
  const handleAddAccountFlow = () => {
    setPendingAction("add");
    setShowAddAccount(true);
  };

  const handleOpenPasscode = () => {
    setShowPasscodeModal(true);
  };

  const handleClosePasscode = () => {
    setShowPasscodeModal(false);
    setPendingAction(null);
    setPendingSwitchIndex(null);
  };

  const handlePasscodeSuccess = async (passcode) => {
    try {
      if (pendingAction === "add") {
        showLoading("Creating account...", { step: 1, totalSteps: 2 });
        const accountName = newAccountName.trim() || undefined;
        await addAccount(passcode, accountName);
        updateLoading("Account created!", 2);
        await new Promise((resolve) => setTimeout(resolve, 500));
        hideLoading();
        handleClosePasscode();
        setShowAddAccount(false);
        setNewAccountName("");
        fetchAllAccountBalances();
      } else if (pendingAction === "switch") {
        showLoading("Switching account...", { step: 1, totalSteps: 2 });
        await switchAccount(pendingSwitchIndex);
        updateLoading("Switched!", 2);
        await new Promise((resolve) => setTimeout(resolve, 500));
        hideLoading();
        handleClosePasscode();
      }
    } catch (error) {
      hideLoading();
      throw error;
    }
  };

  const handleSwitchAccount = (index) => {
    if (index === activeAccountIndex) return;
    setPendingAction("switch");
    setPendingSwitchIndex(index);
    handleOpenPasscode();
  };

  const handleRenameAccount = async (index, newName) => {
    if (!newName.trim()) return;
    try {
      await renameAccount(index, newName.trim());
      setEditingIndex(null);
      setEditingName("");
    } catch (error) {
      console.error("Rename error:", error);
    }
  };

  const renderAccountItem = ({ item, index }) => {
    const accountBalance = getBalanceForAccount(item.address);

    return (
      <AccountCard
        account={item}
        index={index}
        isActive={index === activeAccountIndex}
        isEditing={editingIndex === index}
        editingName={editingName}
        selectedChain={activeChain}
        balance={accountBalance}
        tokenPrice={tokenPrice} // ✅ Pass price data (includes usd, usd_24h_change, etc.)
        loadingBalance={loadingBalances}
        onSwitch={() => handleSwitchAccount(index)}
        onStartEdit={() => {
          setEditingIndex(index);
          setEditingName(item.name);
        }}
        onCancelEdit={() => {
          setEditingIndex(null);
          setEditingName("");
        }}
        onSaveEdit={(newName) => handleRenameAccount(index, newName)}
        onEditNameChange={setEditingName}
      />
    );
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => navigation.goBack()}
            activeOpacity={0.6}
          >
            <Ionicons name="arrow-back" size={24} color={COLORS.text} />
          </TouchableOpacity>
          <Text style={styles.title}>Accounts</Text>
        </View>
        <Text style={styles.subtitle}>Manage your wallet accounts</Text>
        <Text style={styles.accountCount}>
          {accounts.length} {accounts.length === 1 ? "Account" : "Accounts"}
        </Text>
      </View>

      {/* Accounts List */}
      <FlatList
        data={accounts}
        renderItem={renderAccountItem}
        keyExtractor={(item, index) => `${item.address}-${index}`}
        contentContainerStyle={styles.listContainer}
        ListEmptyComponent={<EmptyState />}
        showsVerticalScrollIndicator={false}
      />

      {/* Add Account Button */}
      <TouchableOpacity
        style={styles.addButton}
        onPress={handleAddAccountFlow}
        activeOpacity={0.8}
      >
        <Ionicons name="add-circle-outline" size={22} color="#FFFFFF" />
        <Text style={styles.addButtonText}>Add Account</Text>
      </TouchableOpacity>

      {/* Modals */}
      <AddAccountModal
        visible={showAddAccount && !showPasscodeModal}
        accountName={newAccountName}
        accountNumber={accounts.length + 1}
        onClose={() => {
          setShowAddAccount(false);
          setNewAccountName("");
        }}
        onNameChange={setNewAccountName}
        onContinue={handleOpenPasscode}
      />

      <PasscodeModal
        visible={showPasscodeModal}
        title={pendingAction === "add" ? "Create Account" : "Switch Account"}
        subtitle={
          pendingAction === "add"
            ? "Enter PIN to create new account"
            : "Enter PIN to switch accounts"
        }
        onClose={handleClosePasscode}
        onSuccess={handlePasscodeSuccess}
      />
    </View>
  );
};

export default AccountManager;
