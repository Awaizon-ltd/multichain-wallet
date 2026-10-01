import React, { useState } from "react";
import { ScrollView, StyleSheet } from "react-native";
import { useTheme } from "../../contexts/ThemeContext";
import {
  SettingsSection,
  MenuItem,
  ToggleMenuItem,
} from "../../components/settings/SettingsMenuItem";
import Alert from "../../utils/Alert";

const PreferencesSettingsScreen = ({ navigation }) => {
  const { COLORS, SPACING, isDark, toggleTheme, accentColor } = useTheme();
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);

  const handleClearCache = () => {
    Alert.alert(
      "Clear Cache",
      "This will clear cached data but will not affect your wallet or transactions.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Clear",
          onPress: () => {
            Alert.alert("Success", "Cache cleared successfully");
          },
        },
      ],
    );
  };

  const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: COLORS.background },
    content: { paddingHorizontal: SPACING.sm, paddingTop: SPACING.lg, paddingBottom: 40 },
  });

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <SettingsSection title="Preferences">
        <ToggleMenuItem
          iconName="notifications-outline"
          iconColor="#E65100"
          title="Notifications"
          subtitle="Transaction and price alerts"
          value={notificationsEnabled}
          onValueChange={setNotificationsEnabled}
        />
        <MenuItem
          iconName="swap-horizontal-outline"
          iconColor="#00695C"
          title="Currency"
          subtitle="USD"
          showArrow={false}
        />
        <MenuItem
          iconName="color-palette-outline"
          iconColor={accentColor ?? COLORS.primary}
          title="Theme Color"
          subtitle={accentColor ? `Custom · ${accentColor}` : "Default yellow-green"}
          onPress={() => navigation.navigate("AccentColor")}
        />
        <ToggleMenuItem
          iconName={isDark ? "sunny-outline" : "moon-outline"}
          iconColor={COLORS.primary}
          title="Dark Mode"
          subtitle={`Currently: ${isDark ? "Dark" : "Light"}`}
          value={isDark}
          onValueChange={toggleTheme}
        />
        <MenuItem
          iconName="trash-outline"
          iconColor="#C62828"
          title="Clear Cache"
          subtitle="Free up storage space"
          onPress={handleClearCache}
          isLast
        />
      </SettingsSection>
    </ScrollView>
  );
};

export default PreferencesSettingsScreen;
