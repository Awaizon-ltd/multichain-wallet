import React from "react";
import { ScrollView, StyleSheet, Platform, Linking } from "react-native";
import { useTheme } from "../../contexts/ThemeContext";
import { SettingsSection, MenuItem } from "../../components/settings/SettingsMenuItem";
import { APP_CONFIG } from "../../constants/Config";
import Alert from "../../utils/Alert";

const EXTERNAL_LINKS = {
  PLAY_STORE: "https://play.google.com/store/apps/details?id=com.awarizon.wallet",
  APP_STORE: "https://apps.apple.com/app/id123456789",
};

const AboutSettingsScreen = () => {
  const { COLORS, SPACING } = useTheme();

  const openExternalLink = async (url, title) => {
    try {
      const supported = await Linking.canOpenURL(url);
      if (supported) {
        await Linking.openURL(url);
      } else {
        Alert.alert("Error", `Cannot open ${title}. Please try again later.`);
      }
    } catch {
      Alert.alert("Error", `Failed to open ${title}. Please try again.`);
    }
  };

  const handleRateApp = () => {
    const storeUrl =
      Platform.OS === "ios" ? EXTERNAL_LINKS.APP_STORE : EXTERNAL_LINKS.PLAY_STORE;
    const storeName = Platform.OS === "ios" ? "App Store" : "Play Store";
    openExternalLink(storeUrl, storeName);
  };

  const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: COLORS.background },
    content: { paddingHorizontal: SPACING.sm, paddingTop: SPACING.lg, paddingBottom: 40 },
  });

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <SettingsSection title="About">
        <MenuItem
          iconName="information-circle-outline"
          iconColor="#1565C0"
          title="App Version"
          subtitle={APP_CONFIG.VERSION}
          showArrow={false}
        />
        <MenuItem
          iconName="star-outline"
          iconColor="#F0A500"
          title="Rate App"
          subtitle="Share your feedback on the store"
          onPress={handleRateApp}
          isLast
        />
      </SettingsSection>
    </ScrollView>
  );
};

export default AboutSettingsScreen;
