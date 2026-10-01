import React from "react";
import { View, Text, StyleSheet, ScrollView } from "react-native";
import { useWallet } from "../../contexts/WalletContext";
import { useTheme } from "../../contexts/ThemeContext";
import Button from "../../components/common/Button";
import { MenuItem } from "../../components/settings/SettingsMenuItem";
import { APP_CONFIG } from "../../constants/Config";
import Alert from "../../utils/Alert";

const SettingsScreen = ({ navigation }) => {
  const { clearLocalWallet } = useWallet();
  const { COLORS, SPACING, FONTS } = useTheme();

  const handleLogout = () => {
    Alert.alert("Clear Wallet", "Are you sure you want to clear wallet?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Clear",
        style: "destructive",
        onPress: async () => {
          await clearLocalWallet();
        },
      },
    ]);
  };

  const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: COLORS.background },
    content: { paddingHorizontal: SPACING.sm, paddingTop: SPACING.lg, paddingBottom: 120 },
    groupList: { marginBottom: SPACING.xl },
    logoutButton: { marginTop: SPACING.sm, marginBottom: SPACING.lg },
    footer: {
      fontSize: FONTS.sizes.sm,
      color: COLORS.textTertiary,
      textAlign: "center",
      marginBottom: SPACING.xl,
    },
  });

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* ── Groups — each navigates to its own page ── */}
      <View style={styles.groupList}>
        <MenuItem
          iconName="wallet-outline"
          iconColor={COLORS.primary}
          title="Wallet"
          subtitle="Manage wallets, recovery phrase, identity binding"
          onPress={() => navigation.navigate("WalletSettings")}
        />
        <MenuItem
          iconName="shield-checkmark-outline"
          iconColor="#1565C0"
          title="Security"
          subtitle="Passcode and transaction history"
          onPress={() => navigation.navigate("SecuritySettings")}
        />
        <MenuItem
          iconName="options-outline"
          iconColor="#00695C"
          title="Preferences"
          subtitle="Notifications, currency, theme"
          onPress={() => navigation.navigate("PreferencesSettings")}
        />
        <MenuItem
          iconName="information-circle-outline"
          iconColor="#7B1FA2"
          title="About"
          subtitle="Version and support"
          onPress={() => navigation.navigate("AboutSettings")}
          isLast
        />
      </View>

      <Button
        title="Clear Wallet"
        onPress={handleLogout}
        variant="danger"
        fullWidth
        style={styles.logoutButton}
      />

      <Text style={styles.footer}>
        {APP_CONFIG.APP_NAME} v{APP_CONFIG.VERSION}
      </Text>
    </ScrollView>
  );
};

export default SettingsScreen;
