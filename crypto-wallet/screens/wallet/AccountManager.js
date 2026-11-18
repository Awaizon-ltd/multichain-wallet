// screens/AccountManager.js
import React, {
  useState,
  useEffect,
  useMemo,
  useCallback,
  useRef,
} from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  FlatList,
  StyleSheet,
  Platform,
  RefreshControl,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useWallet } from "../../contexts/WalletContext";
import { useChain } from "../../contexts/ChainContext";
import { useTheme } from "../../contexts/ThemeContext";
import { useLoading } from "../../contexts/LoadingContext";
import { getBalance } from "../../utils/Wallet";
import { getCoinPriceBySymbol } from "../../services/coingecko";

import AddAccountModal from "../../components/account/AddAccountModal";
import PasscodeModal from "../../components/account/PasscodeModal";
import EmptyState from "../../components/account/EmptyState";
import useIdentity from "../../hooks/useIdentity";

// ─── Price cache (5 minutes) ──────────────────────────────────────────────────
const priceCache = { data: {}, timestamps: {} };
const CACHE_DURATION = 5 * 60 * 1000;
const isCacheValid = (symbol) => {
  const ts = priceCache.timestamps[symbol];
  return !!ts && Date.now() - ts < CACHE_DURATION;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
const shortAddress = (addr = "") =>
  addr.length > 12 ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : addr;

const formatToken = (formatted) => {
  const n = parseFloat(formatted);
  if (isNaN(n)) return "0";
  return n.toLocaleString("en-US", { maximumFractionDigits: 4 });
};

const formatUsd = (n) =>
  "$" +
  n.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

// ─── Account row (memoized: only re-renders when its own props change) ───────
const AccountRow = React.memo(
  ({
    account,
    index,
    hero,
    isEditing,
    editingName,
    balanceText,
    usdText,
    styles,
    COLORS,
    onSwitch,
    onStartEdit,
    onCancelEdit,
    onSaveEdit,
    onEditNameChange,
    onOpenIdentity,
  }) => {
    const initial = (account.name || "A").trim().charAt(0).toUpperCase();
    // Each account has its own identity (or none)
    const { identity } = useIdentity(account.address);

    const body = (
      <View style={hero ? styles.heroInner : styles.rowInner}>
        <View style={[styles.avatar, hero && styles.avatarHero]}>
          <Text style={[styles.avatarText, hero && styles.avatarTextHero]}>
            {initial}
          </Text>
        </View>

        <View style={styles.rowMain}>
          {isEditing ? (
            <View style={styles.editRow}>
              <TextInput
                style={styles.editInput}
                value={editingName}
                onChangeText={onEditNameChange}
                autoFocus
                maxLength={24}
                returnKeyType="done"
                placeholder="Account name"
                placeholderTextColor={COLORS.textTertiary}
                onSubmitEditing={() => onSaveEdit(index, editingName)}
              />
              <Pressable
                hitSlop={8}
                onPress={() => onSaveEdit(index, editingName)}
                style={styles.editBtn}
              >
                <Ionicons name="checkmark" size={18} color="#000" />
              </Pressable>
              <Pressable
                hitSlop={8}
                onPress={onCancelEdit}
                style={[styles.editBtn, styles.editBtnGhost]}
              >
                <Ionicons name="close" size={18} color={COLORS.text} />
              </Pressable>
            </View>
          ) : (
            <View style={styles.nameRow}>
              <Text style={styles.name} numberOfLines={1}>
                {account.name}
              </Text>
              <Pressable
                hitSlop={10}
                onPress={() => onStartEdit(index, account.name)}
              >
                <Ionicons name="pencil" size={13} color={COLORS.textTertiary} />
              </Pressable>
            </View>
          )}
          <Text style={styles.address}>
            {identity ? (
              <Text style={styles.handle}>@{identity.username} · </Text>
            ) : null}
            {shortAddress(account.address)}
          </Text>
          {hero && !isEditing && (
            <Pressable
              onPress={onOpenIdentity}
              hitSlop={6}
              style={[styles.identityPill, !identity && styles.identityPillClaim]}
              accessibilityRole="button"
            >
              <Ionicons
                name={identity ? "shield-checkmark" : "at-circle-outline"}
                size={13}
                color={identity ? COLORS.success : "#000"}
              />
              <Text style={[styles.identityPillText, !identity && { color: "#000" }]}>
                {identity ? "Verified identity" : "Claim @username"}
              </Text>
            </Pressable>
          )}
        </View>

        {!isEditing && (
          <View style={styles.rowRight}>
            <Text style={styles.balance} numberOfLines={1}>
              {balanceText}
            </Text>
            {!!usdText && <Text style={styles.usd}>{usdText}</Text>}
          </View>
        )}
      </View>
    );

    if (hero) {
      return (
        <View style={styles.hero}>
          <View style={styles.activeTag}>
            <Ionicons name="checkmark-circle" size={14} color="#000" />
            <Text style={styles.activeTagText}>Active</Text>
          </View>
          {body}
        </View>
      );
    }

    return (
      <Pressable
        onPress={() => !isEditing && onSwitch(index)}
        style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
      >
        {body}
      </Pressable>
    );
  },
);

// ─── Screen ───────────────────────────────────────────────────────────────────
const AccountManager = ({ navigation }) => {
  const {
    accounts,
    activeAccountIndex,
    addAccount,
    switchAccount,
    renameAccount,
  } = useWallet();
  const { activeChain } = useChain();
  const { COLORS, SPACING, FONTS, BORDER_RADIUS } = useTheme();
  const { showLoading, updateLoading, hideLoading } = useLoading();

  const [showAddAccount, setShowAddAccount] = useState(false);
  const [showPasscodeModal, setShowPasscodeModal] = useState(false);
  const [newAccountName, setNewAccountName] = useState("");
  const [editingIndex, setEditingIndex] = useState(null);
  const [editingName, setEditingName] = useState("");
  const [pendingAction, setPendingAction] = useState(null);
  const [pendingSwitchIndex, setPendingSwitchIndex] = useState(null);

  // Balances are cached per chain + address so switching chains feels instant
  const [accountBalances, setAccountBalances] = useState({});
  const [loadingBalances, setLoadingBalances] = useState(false);
  const [tokenPrice, setTokenPrice] = useState(null);
  const requestId = useRef(0);

  const chainId = activeChain?.id;
  const balanceKey = useCallback(
    (address) => `${chainId}:${address}`,
    [chainId],
  );

  // ── Styles (built once per theme change) ──
  const styles = useMemo(
    () =>
      StyleSheet.create({
        container: { flex: 1, backgroundColor: COLORS.background },

        // Header
        header: {
          paddingTop: Platform.OS === "ios" ? 56 : 44,
          paddingHorizontal: SPACING.md,
          paddingBottom: SPACING.md,
        },
        headerTop: {
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
        },
        backBtn: {
          width: 42,
          height: 42,
          borderRadius: 21,
          backgroundColor: COLORS.surface,
          alignItems: "center",
          justifyContent: "center",
        },
        headerRight: { flexDirection: "row", alignItems: "center", gap: SPACING.sm },
        handle: { color: COLORS.text, fontWeight: "800" },
        identityPill: {
          flexDirection: "row",
          alignItems: "center",
          alignSelf: "flex-start",
          gap: 5,
          marginTop: 8,
          paddingHorizontal: 10,
          height: 26,
          borderRadius: 13,
          backgroundColor: COLORS.success + "1F",
        },
        identityPillClaim: { backgroundColor: COLORS.primary },
        identityPillText: { fontSize: 12, fontWeight: "800", color: COLORS.success },
        chainChip: {
          flexDirection: "row",
          alignItems: "center",
          gap: 6,
          paddingHorizontal: 12,
          height: 34,
          borderRadius: 17,
          backgroundColor: COLORS.primary + "1F",
        },
        chainDot: {
          width: 8,
          height: 8,
          borderRadius: 4,
          backgroundColor: COLORS.primary,
        },
        chainChipText: {
          fontSize: FONTS.sizes.sm,
          fontWeight: "700",
          color: COLORS.text,
        },
        title: {
          fontSize: 34,
          fontWeight: "900",
          letterSpacing: -1,
          color: COLORS.text,
          marginTop: SPACING.md,
        },
        totalLabel: {
          fontSize: FONTS.sizes.sm,
          fontWeight: "600",
          color: COLORS.textSecondary,
          marginTop: 2,
        },

        // List
        list: { paddingHorizontal: SPACING.md, paddingBottom: 120 },
        sectionLabel: {
          fontSize: FONTS.sizes.sm,
          fontWeight: "700",
          color: COLORS.textSecondary,
          marginTop: SPACING.lg,
          marginBottom: SPACING.sm,
        },
        hint: {
          fontSize: FONTS.sizes.sm,
          color: COLORS.textTertiary,
          marginTop: SPACING.lg,
          textAlign: "center",
          lineHeight: 20,
        },

        // Hero (active account)
        hero: {
          borderRadius: 28,
          padding: 18,
          backgroundColor: COLORS.surface,
          borderWidth: 1.5,
          borderColor: COLORS.primary,
        },
        activeTag: {
          alignSelf: "flex-start",
          flexDirection: "row",
          alignItems: "center",
          gap: 4,
          paddingHorizontal: 10,
          paddingVertical: 4,
          borderRadius: 12,
          backgroundColor: COLORS.primary,
          marginBottom: 14,
        },
        activeTagText: { fontSize: 12, fontWeight: "800", color: "#000" },
        heroInner: { flexDirection: "row", alignItems: "center", gap: 14 },

        // Rows
        row: {
          borderRadius: 16,
          paddingVertical: 8,
          paddingHorizontal: 12,
          marginBottom: 6,
          backgroundColor: COLORS.surface,
          borderWidth: 1,
          borderColor: COLORS.primary + "20",
        },
        rowPressed: { opacity: 0.75, transform: [{ scale: 0.99 }] },
        rowInner: { flexDirection: "row", alignItems: "center", gap: 10 },
        rowMain: { flex: 1 },
        rowRight: { alignItems: "flex-end", maxWidth: "40%" },

        avatar: {
          width: 34,
          height: 34,
          borderRadius: 17,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: COLORS.primary + "26",
        },
        avatarHero: {
          width: 56,
          height: 56,
          borderRadius: 28,
          backgroundColor: COLORS.primary,
        },
        avatarText: {
          fontSize: 14,
          fontWeight: "900",
          color: COLORS.primary,
        },
        avatarTextHero: { fontSize: 22, color: "#000" },

        nameRow: { flexDirection: "row", alignItems: "center", gap: 8 },
        name: {
          fontSize: FONTS.sizes.md,
          fontWeight: "800",
          color: COLORS.text,
          flexShrink: 1,
        },
        address: {
          fontSize: FONTS.sizes.xs,
          fontWeight: "600",
          color: COLORS.textSecondary,
          marginTop: 2,
        },
        balance: {
          fontSize: FONTS.sizes.md,
          fontWeight: "800",
          color: COLORS.text,
        },
        usd: {
          fontSize: FONTS.sizes.xs,
          fontWeight: "600",
          color: COLORS.textSecondary,
          marginTop: 2,
        },

        // Inline edit
        editRow: { flexDirection: "row", alignItems: "center", gap: 6 },
        editInput: {
          flex: 1,
          height: 38,
          paddingHorizontal: 12,
          borderRadius: 12,
          fontSize: FONTS.sizes.md,
          color: COLORS.text,
          backgroundColor: COLORS.background,
          borderWidth: 1,
          borderColor: COLORS.primary,
        },
        editBtn: {
          width: 34,
          height: 34,
          borderRadius: 17,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: COLORS.primary,
        },
        editBtnGhost: { backgroundColor: COLORS.background },

        // Add button
        addWrap: {
          position: "absolute",
          left: SPACING.md,
          right: SPACING.md,
          bottom: SPACING.lg,
        },
        addBtn: {
          height: 56,
          borderRadius: 28,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
          backgroundColor: COLORS.primary,
          shadowColor: COLORS.primary,
          shadowOffset: { width: 0, height: 6 },
          shadowOpacity: 0.3,
          shadowRadius: 12,
          elevation: 6,
        },
        addBtnText: {
          fontSize: FONTS.sizes.md,
          fontWeight: "800",
          color: "#000",
        },
      }),
    [COLORS, SPACING, FONTS],
  );

  // ── Price (cached) ──
  const fetchCurrentTokenPrice = useCallback(async () => {
    const symbol = activeChain?.symbol;
    if (!symbol) return;
    try {
      if (isCacheValid(symbol)) {
        setTokenPrice(priceCache.data[symbol]);
        return;
      }
      const priceData = await getCoinPriceBySymbol(symbol);
      if (priceData) {
        priceCache.data[symbol] = priceData;
        priceCache.timestamps[symbol] = Date.now();
        setTokenPrice(priceData);
      } else {
        setTokenPrice(null);
      }
    } catch (error) {
      setTokenPrice(priceCache.data[symbol] || null);
    }
  }, [activeChain?.symbol]);

  // ── Balances (parallel, stale responses ignored) ──
  const fetchAllAccountBalances = useCallback(async () => {
    if (!accounts?.length || !activeChain) return;
    const id = ++requestId.current;
    setLoadingBalances(true);
    try {
      const results = await Promise.all(
        accounts.map(async (account) => {
          try {
            const balance = await getBalance(account.address, activeChain);
            return [account.address, balance];
          } catch (error) {
            return [account.address, { formatted: "0" }];
          }
        }),
      );
      if (id !== requestId.current) return; // a newer request replaced this one
      setAccountBalances((prev) => {
        const next = { ...prev };
        results.forEach(([address, balance]) => {
          next[`${activeChain.id}:${address}`] = balance;
        });
        return next;
      });
    } finally {
      if (id === requestId.current) setLoadingBalances(false);
    }
  }, [accounts, activeChain]);

  useEffect(() => {
    fetchAllAccountBalances();
    fetchCurrentTokenPrice();
  }, [accounts?.length, chainId]);

  // ── Derived display data ──
  const priceUsd = tokenPrice?.usd;

  const describe = useCallback(
    (address) => {
      const bal = accountBalances[balanceKey(address)];
      if (!bal) {
        return {
          balanceText: loadingBalances
            ? "···"
            : `0 ${activeChain?.symbol ?? ""}`,
          usdText: "",
        };
      }
      const amount = parseFloat(bal.formatted) || 0;
      return {
        balanceText: `${formatToken(bal.formatted)} ${activeChain?.symbol ?? ""}`,
        usdText: priceUsd ? formatUsd(amount * priceUsd) : "",
      };
    },
    [
      accountBalances,
      balanceKey,
      loadingBalances,
      activeChain?.symbol,
      priceUsd,
    ],
  );

  const totals = useMemo(() => {
    let amount = 0;
    (accounts || []).forEach((a) => {
      const bal = accountBalances[balanceKey(a.address)];
      if (bal) amount += parseFloat(bal.formatted) || 0;
    });
    return priceUsd
      ? formatUsd(amount * priceUsd)
      : `${formatToken(amount)} ${activeChain?.symbol ?? ""}`;
  }, [accounts, accountBalances, balanceKey, priceUsd, activeChain?.symbol]);

  // All accounts except the active one (keeping their original index)
  const otherAccounts = useMemo(
    () =>
      (accounts || [])
        .map((account, index) => ({ account, index }))
        .filter(({ index }) => index !== activeAccountIndex),
    [accounts, activeAccountIndex],
  );

  const activeAccount = accounts?.[activeAccountIndex];

  // ── Handlers ──
  const handleAddAccountFlow = useCallback(() => {
    setPendingAction("add");
    setShowAddAccount(true);
  }, []);

  const handleOpenPasscode = useCallback(() => setShowPasscodeModal(true), []);

  const handleClosePasscode = useCallback(() => {
    setShowPasscodeModal(false);
    setPendingAction(null);
    setPendingSwitchIndex(null);
  }, []);

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

  const handleSwitchAccount = useCallback(
    (index) => {
      if (index === activeAccountIndex) return;
      setPendingAction("switch");
      setPendingSwitchIndex(index);
      setShowPasscodeModal(true);
    },
    [activeAccountIndex],
  );

  const handleStartEdit = useCallback((index, name) => {
    setEditingIndex(index);
    setEditingName(name);
  }, []);

  const handleCancelEdit = useCallback(() => {
    setEditingIndex(null);
    setEditingName("");
  }, []);

  const handleSaveEdit = useCallback(
    async (index, newName) => {
      if (!newName?.trim()) return;
      try {
        await renameAccount(index, newName.trim());
        setEditingIndex(null);
        setEditingName("");
      } catch (error) {
        console.error("Rename error:", error);
      }
    },
    [renameAccount],
  );

  const onRefresh = useCallback(() => {
    delete priceCache.timestamps[activeChain?.symbol];
    fetchAllAccountBalances();
    fetchCurrentTokenPrice();
  }, [activeChain?.symbol, fetchAllAccountBalances, fetchCurrentTokenPrice]);

  // ── Render pieces ──
  const rowProps = {
    styles,
    COLORS,
    onOpenIdentity: () => navigation.navigate("BindWallet"),
    onSwitch: handleSwitchAccount,
    onStartEdit: handleStartEdit,
    onCancelEdit: handleCancelEdit,
    onSaveEdit: handleSaveEdit,
    onEditNameChange: setEditingName,
  };

  const renderItem = useCallback(
    ({ item }) => {
      const { account, index } = item;
      const editing = editingIndex === index;
      const { balanceText, usdText } = describe(account.address);
      return (
        <AccountRow
          {...rowProps}
          account={account}
          index={index}
          isEditing={editing}
          editingName={editing ? editingName : ""}
          balanceText={balanceText}
          usdText={usdText}
        />
      );
    },
    [describe, editingIndex, editingName, styles, COLORS, handleSwitchAccount],
  );

  const ListHeader = () => {
    if (!activeAccount) return null;
    const editing = editingIndex === activeAccountIndex;
    const { balanceText, usdText } = describe(activeAccount.address);
    return (
      <View>
        <AccountRow
          {...rowProps}
          hero
          account={activeAccount}
          index={activeAccountIndex}
          isEditing={editing}
          editingName={editing ? editingName : ""}
          balanceText={balanceText}
          usdText={usdText}
        />
        {otherAccounts.length > 0 ? (
          <Text style={styles.sectionLabel}>
            Other accounts · tap to switch
          </Text>
        ) : (
          <Text style={styles.hint}>
            Add another account to keep funds organized.
          </Text>
        )}
      </View>
    );
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <Pressable
            style={styles.backBtn}
            onPress={() => navigation.goBack()}
            hitSlop={8}
          >
            <Ionicons name="arrow-back" size={22} color={COLORS.text} />
          </Pressable>
          <View style={styles.headerRight}>
            {!!activeChain && (
              <View style={styles.chainChip}>
                <View style={styles.chainDot} />
                <Text style={styles.chainChipText}>{activeChain.name}</Text>
              </View>
            )}
            {/* Identity of the active account */}
            <Pressable
              style={styles.backBtn}
              onPress={() => navigation.navigate("BindWallet")}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Wallet identity"
            >
              <Ionicons name="at-circle-outline" size={22} color={COLORS.text} />
            </Pressable>
          </View>
        </View>
        <Text style={styles.title}>Accounts</Text>
        <Text style={styles.totalLabel}>
          {accounts?.length ?? 0}{" "}
          {accounts?.length === 1 ? "account" : "accounts"} · {totals} total
        </Text>
      </View>

      {/* List */}
      <FlatList
        data={otherAccounts}
        renderItem={renderItem}
        keyExtractor={(item) => `${item.account.address}-${item.index}`}
        extraData={[editingIndex, editingName, accountBalances, priceUsd]}
        contentContainerStyle={styles.list}
        ListHeaderComponent={ListHeader()}
        ListEmptyComponent={accounts?.length === 0 ? <EmptyState /> : null}
        refreshControl={
          <RefreshControl
            refreshing={loadingBalances}
            onRefresh={onRefresh}
            tintColor={COLORS.primary}
            colors={[COLORS.primary]}
          />
        }
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        initialNumToRender={8}
        maxToRenderPerBatch={8}
        windowSize={7}
        removeClippedSubviews={Platform.OS === "android"}
      />

      {/* Add account */}
      <View style={styles.addWrap} pointerEvents="box-none">
        <Pressable
          style={({ pressed }) => [styles.addBtn, pressed && { opacity: 0.9 }]}
          onPress={handleAddAccountFlow}
        >
          <Ionicons name="add" size={24} color="#000" />
          <Text style={styles.addBtnText}>Add account</Text>
        </Pressable>
      </View>

      {/* Modals */}
      <AddAccountModal
        visible={showAddAccount && !showPasscodeModal}
        accountName={newAccountName}
        accountNumber={(accounts?.length ?? 0) + 1}
        onClose={() => {
          setShowAddAccount(false);
          setNewAccountName("");
        }}
        onNameChange={setNewAccountName}
        onContinue={handleOpenPasscode}
      />

      <PasscodeModal
        visible={showPasscodeModal}
        title={pendingAction === "add" ? "Create account" : "Switch account"}
        subtitle={
          pendingAction === "add"
            ? "Enter your PIN to create a new account"
            : "Enter your PIN to switch accounts"
        }
        onClose={handleClosePasscode}
        onSuccess={handlePasscodeSuccess}
      />
    </View>
  );
};

export default AccountManager;
