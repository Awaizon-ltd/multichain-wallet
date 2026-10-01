import React from "react";
import { ScrollView, StyleSheet } from "react-native";
import { useTheme } from "../../contexts/ThemeContext";
import { SettingsSection, MenuItem } from "../../components/settings/SettingsMenuItem";

const SecuritySettingsScreen = ({ navigation }) => {
  const { COLORS, SPACING } = useTheme();

  const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: COLORS.background },
    content: { paddingHorizontal: SPACING.sm, paddingTop: SPACING.lg, paddingBottom: 40 },
  });

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <SettingsSection title="Security">
        <MenuItem
          iconName="lock-closed-outline"
          iconColor="#1565C0"
          title="Change Passcode"
          subtitle="Update your wallet passcode"
          onPress={() => navigation.navigate("ChangePasscode")}
        />
        <MenuItem
          iconName="receipt-outline"
          iconColor="#00695C"
          title="Transaction History"
          subtitle="View all your transactions"
          onPress={() => navigation.navigate("Transactions")}
          isLast
        />
      </SettingsSection>
    </ScrollView>
  );
};

export default SecuritySettingsScreen;
