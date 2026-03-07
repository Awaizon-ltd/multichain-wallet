// components/account/AccountCard.js - Display USD value

import React from "react";
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  StyleSheet,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../../contexts/ThemeContext";
import { formatAddress } from "../../utils/Wallet";

const AccountCard = ({
  account,
  index,
  isActive,
  isEditing,
  editingName,
  selectedChain,
  balance,
  tokenPrice, // ✅ Price data object: { usd, usd_24h_change, usd_24h_vol, usd_market_cap }
  loadingBalance,
  onSwitch,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
  onEditNameChange,
}) => {
  const { COLORS, SPACING, FONTS, BORDER_RADIUS } = useTheme();

  // ✅ Format balance to 4 decimal places
  const formatBalance = (balanceStr) => {
    if (!balanceStr || balanceStr === "0") return "0.0000";
    const num = parseFloat(balanceStr);
    return num.toFixed(4);
  };

  // ✅ Calculate USD value
  const calculateUsdValue = () => {
    if (!tokenPrice || !tokenPrice.usd || !balance.formatted) return null;
    const value = parseFloat(balance.formatted) * tokenPrice.usd;
    return value.toFixed(2);
  };

  const formattedBalance = formatBalance(balance.formatted);
  const usdValue = calculateUsdValue();

  const styles = StyleSheet.create({
    card: {
      backgroundColor: COLORS.surface,
      borderRadius: BORDER_RADIUS.md,
      padding: SPACING.md,
      marginBottom: SPACING.sm,
      borderWidth: 1.5,
      borderColor: isActive ? COLORS.primary : COLORS.border,
    },
    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: SPACING.sm,
    },
    left: {
      flexDirection: "row",
      alignItems: "center",
      flex: 1,
    },
    icon: {
      width: 36,
      height: 36,
      borderRadius: BORDER_RADIUS.sm,
      backgroundColor: isActive ? COLORS.primary + "15" : COLORS.cardElevated,
      justifyContent: "center",
      alignItems: "center",
      marginRight: SPACING.sm,
    },
    info: {
      flex: 1,
    },
    name: {
      fontSize: FONTS.sizes.md,
      fontWeight: "600",
      color: COLORS.text,
      marginBottom: 2,
    },
    address: {
      fontSize: FONTS.sizes.xs,
      color: COLORS.textSecondary,
      fontFamily: "monospace",
      letterSpacing: 0.3,
    },
    badge: {
      backgroundColor: COLORS.primary,
      paddingHorizontal: SPACING.sm,
      paddingVertical: 3,
      borderRadius: BORDER_RADIUS.sm,
    },
    badgeText: {
      color: "#FFFFFF",
      fontSize: 10,
      fontWeight: "700",
      letterSpacing: 0.8,
    },
    balance: {
      backgroundColor: COLORS.cardElevated,
      padding: SPACING.sm,
      borderRadius: BORDER_RADIUS.sm,
      marginBottom: SPACING.sm,
    },
    balanceLabel: {
      fontSize: 10,
      color: COLORS.textSecondary,
      marginBottom: 2,
      textTransform: "uppercase",
      letterSpacing: 0.5,
      fontWeight: "600",
    },
    balanceAmount: {
      fontSize: FONTS.sizes.lg,
      fontWeight: "700",
      color: COLORS.text,
      letterSpacing: -0.5,
    },
    usdValue: {
      fontSize: FONTS.sizes.sm,
      color: COLORS.textSecondary,
      marginTop: 4,
      fontWeight: "500",
    },
    actions: {
      flexDirection: "row",
      gap: SPACING.xs,
    },
    actionButton: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      paddingVertical: SPACING.sm,
      borderRadius: BORDER_RADIUS.sm,
      gap: 4,
    },
    switchButton: {
      backgroundColor: COLORS.primary,
    },
    renameButton: {
      backgroundColor: COLORS.cardElevated,
      borderWidth: 1,
      borderColor: COLORS.border,
    },
    switchText: {
      color: "#FFFFFF",
      fontWeight: "600",
      fontSize: FONTS.sizes.sm,
      letterSpacing: 0.2,
    },
    renameText: {
      color: COLORS.text,
      fontWeight: "600",
      fontSize: FONTS.sizes.sm,
      letterSpacing: 0.2,
    },
    editContainer: {
      gap: SPACING.sm,
    },
    editInput: {
      backgroundColor: COLORS.cardElevated,
      borderWidth: 1,
      borderColor: COLORS.primary,
      borderRadius: BORDER_RADIUS.sm,
      padding: SPACING.sm,
      fontSize: FONTS.sizes.md,
      color: COLORS.text,
    },
    editActions: {
      flexDirection: "row",
      gap: SPACING.xs,
    },
    saveButton: {
      flex: 1,
      backgroundColor: COLORS.success,
      paddingVertical: SPACING.sm,
      borderRadius: BORDER_RADIUS.sm,
      alignItems: "center",
    },
    cancelButton: {
      flex: 1,
      backgroundColor: COLORS.cardElevated,
      paddingVertical: SPACING.sm,
      borderRadius: BORDER_RADIUS.sm,
      alignItems: "center",
      borderWidth: 1,
      borderColor: COLORS.border,
    },
    saveText: {
      color: "#FFFFFF",
      fontWeight: "600",
      fontSize: FONTS.sizes.sm,
    },
    cancelText: {
      color: COLORS.text,
      fontWeight: "600",
      fontSize: FONTS.sizes.sm,
    },
  });

  if (isEditing) {
    return (
      <View style={styles.card}>
        <View style={styles.editContainer}>
          <TextInput
            style={styles.editInput}
            value={editingName}
            onChangeText={onEditNameChange}
            placeholder="Account name"
            placeholderTextColor={COLORS.textTertiary}
            autoFocus
            maxLength={30}
          />
          <View style={styles.editActions}>
            <TouchableOpacity
              style={styles.cancelButton}
              onPress={onCancelEdit}
              activeOpacity={0.7}
            >
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.saveButton}
              onPress={() => onSaveEdit(editingName)}
              activeOpacity={0.7}
            >
              <Text style={styles.saveText}>Save</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View style={styles.left}>
          <View style={styles.icon}>
            <Ionicons
              name={isActive ? "wallet" : "wallet-outline"}
              size={18}
              color={COLORS.primary}
            />
          </View>
          <View style={styles.info}>
            <Text style={styles.name}>{account.name}</Text>
            <Text style={styles.address}>
              {formatAddress(account.address, 6)}
            </Text>
          </View>
        </View>
        {isActive && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>ACTIVE</Text>
          </View>
        )}
      </View>

      <View style={styles.balance}>
        <Text style={styles.balanceLabel}>
          {selectedChain?.name || "Balance"}
        </Text>
        <Text style={styles.balanceAmount}>
          {loadingBalance ? "..." : `${formattedBalance} ${balance.symbol}`}
        </Text>
        {/* ✅ Display USD value */}
        {!loadingBalance && usdValue && (
          <Text style={styles.usdValue}>≈ ${usdValue} USD</Text>
        )}
      </View>

      <View style={styles.actions}>
        {!isActive && (
          <TouchableOpacity
            style={[styles.actionButton, styles.switchButton]}
            onPress={onSwitch}
            activeOpacity={0.7}
          >
            <Ionicons name="swap-horizontal" size={16} color="#FFFFFF" />
            <Text style={styles.switchText}>Switch</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity
          style={[styles.actionButton, styles.renameButton]}
          onPress={onStartEdit}
          activeOpacity={0.7}
        >
          <Ionicons name="pencil-outline" size={14} color={COLORS.text} />
          <Text style={styles.renameText}>Rename</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

export default AccountCard;
