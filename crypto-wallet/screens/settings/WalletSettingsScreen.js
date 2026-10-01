import React, { useState, useEffect, useCallback } from "react";
import { ScrollView, StyleSheet } from "react-native";
import { useWallet } from "../../contexts/WalletContext";
import { useTheme } from "../../contexts/ThemeContext";
import { SettingsSection, MenuItem } from "../../components/settings/SettingsMenuItem";
import { APP_CONFIG } from "../../constants/Config";

const WalletSettingsScreen = ({ navigation }) => {
  const { wallet } = useWallet();
  const { COLORS, SPACING } = useTheme();
  const [bindingStatus, setBindingStatus] = useState(null);
  const [boundUsername, setBoundUsername] = useState(null);

  const checkBindingStatus = useCallback(async () => {
    const walletAddress = wallet?.address;
    if (!walletAddress || !APP_CONFIG.API_URL) return;
    try {
      const res = await fetch(
        `${APP_CONFIG.API_URL}/api/wallets/resolve?email_or_username=${encodeURIComponent(walletAddress)}`,
      );
      if (res.ok) {
        const json = await res.json();
        setBindingStatus("bound");
        setBoundUsername(json.data?.username || null);
      } else {
        setBindingStatus("unbound");
        setBoundUsername(null);
      }
    } catch {
      setBindingStatus("unbound");
    }
  }, [wallet?.address]);

  useEffect(() => {
    checkBindingStatus();
    const unsubscribe = navigation.addListener("focus", checkBindingStatus);
    return unsubscribe;
  }, [navigation, checkBindingStatus]);

  const bindingSubtitle =
    bindingStatus === "bound" && boundUsername
      ? `Bound to @${boundUsername}  ✔`
      : "Link your username & email to this wallet";

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
          iconName={
            bindingStatus === "bound" ? "checkmark-circle-outline" : "card-outline"
          }
          iconColor={bindingStatus === "bound" ? COLORS.success : COLORS.primary}
          title="Bind Wallet Identity"
          subtitle={bindingSubtitle}
          onPress={() => navigation.navigate("BindWallet")}
          isLast
        />
      </SettingsSection>
    </ScrollView>
  );
};

export default WalletSettingsScreen;
