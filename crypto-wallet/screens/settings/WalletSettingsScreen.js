import React, { useState, useEffect, useCallback } from "react";
import { ScrollView, StyleSheet } from "react-native";
import { useWallet } from "../../contexts/WalletContext";
import { useTheme } from "../../contexts/ThemeContext";
import { SettingsSection, MenuItem } from "../../components/settings/SettingsMenuItem";
import { getIdentityByAddress } from "../../services/identity";

const WalletSettingsScreen = ({ navigation }) => {
  const { wallet, address } = useWallet();
  const { COLORS, SPACING } = useTheme();
  const [bindingStatus, setBindingStatus] = useState(null);
  const [boundUsername, setBoundUsername] = useState(null);

  // Identity of the ACTIVE account (each account links separately)
  const checkBindingStatus = useCallback(async () => {
    if (!address) return;
    try {
      const found = await getIdentityByAddress(address);
      setBindingStatus(found ? "bound" : "unbound");
      setBoundUsername(found?.username ?? null);
    } catch {
      setBindingStatus(null); // unknown (offline) — don't claim either way
    }
  }, [address]);

  useEffect(() => {
    checkBindingStatus();
    const unsubscribe = navigation.addListener("focus", checkBindingStatus);
    return unsubscribe;
  }, [navigation, checkBindingStatus]);

  const bindingSubtitle =
    bindingStatus === "bound" && boundUsername
      ? `@${boundUsername} · verified`
      : "Claim a @username for this account";

  const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: COLORS.background },
    content: { paddingHorizontal: SPACING.sm, paddingTop: SPACING.lg, paddingBottom: 40 },
  });

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <SettingsSection title="Wallet">
        <MenuItem
          iconName="wallet-outline"
          iconColor={COLORS.primary}
          title="Manage Wallets"
          subtitle={`Active: ${wallet?.name || "No wallet"}`}
          onPress={() => navigation.navigate("AccountManager")}
        />
        <MenuItem
          iconName="key-outline"
          iconColor="#E65100"
          title="Show Recovery Phrase"
          subtitle="View your 12-word recovery phrase"
          onPress={() => navigation.navigate("RecoveryPhrase")}
        />
        <MenuItem
          iconName="cloud-upload-outline"
          iconColor={COLORS.primary}
          title="Cloud Backup"
          subtitle="Encrypted backup to your Google Drive"
          onPress={() => navigation.navigate("CloudBackup")}
        />
        <MenuItem
          iconName={
            bindingStatus === "bound" ? "checkmark-circle-outline" : "card-outline"
          }
          iconColor={bindingStatus === "bound" ? COLORS.success : COLORS.primary}
          title="Wallet Identity"
          subtitle={bindingSubtitle}
          onPress={() => navigation.navigate("BindWallet")}
          isLast
        />
      </SettingsSection>
    </ScrollView>
  );
};

export default WalletSettingsScreen;
