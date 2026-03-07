import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Switch,
  Pressable,
  Linking,
  Platform,
  TouchableOpacity,
} from "react-native";
import * as Clipboard from "expo-clipboard";
import { Ionicons } from "@expo/vector-icons";
import { useWallet } from "../../contexts/WalletContext";
import { useTheme } from "../../contexts/ThemeContext";
import Button from "../../components/common/Button";
import { APP_CONFIG } from "../../constants/Config";
import {
  hasBiometricHardware,
  isBiometricEnrolled,
  getBiometricTypeName,
  isBiometricEnabled,
  setBiometricEnabled,
} from "../../utils/biometricAuth";
import { formatAddress } from "../../utils/Wallet";
import Alert from "../../utils/Alert";

const SettingsScreen = ({ navigation }) => {
  const { wallet, clearLocalWallet } = useWallet();
  const { COLORS, SPACING, FONTS, isDark, toggleTheme } = useTheme();
  const [biometricEnabled, setBiometricEnabledState] = useState(false);
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [biometricType, setBiometricType] = useState("Biometric");
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [loading, setLoading] = useState(false);
  const [bindingStatus, setBindingStatus] = useState(null);
  const [boundUsername, setBoundUsername] = useState(null);
  const [addressCopied, setAddressCopied] = useState(false);

  const EXTERNAL_LINKS = {
    TERMS_OF_SERVICE: "https://awarizon.com/terms",
    PRIVACY_POLICY: "https://awarizon.com/policy",
    PLAY_STORE:
      "https://play.google.com/store/apps/details?id=com.awarizon.wallet",
    APP_STORE: "https://apps.apple.com/app/id123456789",
  };

  useEffect(() => {
    checkBiometricAvailability();
    checkBindingStatus();
  }, []);

  useEffect(() => {
    const unsubscribe = navigation.addListener("focus", () => {
      checkBindingStatus();
    });
    return unsubscribe;
  }, [navigation]);

  const checkBiometricAvailability = async () => {
    try {
      const hasHardware = await hasBiometricHardware();
      const isEnrolled = await isBiometricEnrolled();
      const typeName = await getBiometricTypeName();
      const isEnabled = await isBiometricEnabled();
      setBiometricAvailable(hasHardware && isEnrolled);
      setBiometricType(typeName);
      setBiometricEnabledState(isEnabled && hasHardware && isEnrolled);
    } catch (error) {
      console.error("Error checking biometric availability:", error);
      setBiometricAvailable(false);
    }
  };

  const checkBindingStatus = async () => {
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
  };

  const handleCopyAddress = async () => {
    if (wallet?.address) {
      await Clipboard.setStringAsync(wallet.address);
      setAddressCopied(true);
      setTimeout(() => setAddressCopied(false), 2000);
    }
  };

  const handleBiometricToggle = async (value) => {
    if (!biometricAvailable) {
      Alert.alert(
        "Not Available",
        `Please enroll your ${biometricType} in device settings first.`,
        [{ text: "OK" }],
      );
      return;
    }
    if (value) {
      Alert.alert(
        `Enable ${biometricType}`,
        `Enter your 6-digit PIN to link it with ${biometricType}.`,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Continue",
            onPress: () => navigation.navigate("SetupBiometric"),
          },
        ],
      );
    } else {
      Alert.alert(
        "Disable Biometric Authentication",
        `Are you sure you want to disable ${biometricType}?`,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Disable",
            style: "destructive",
            onPress: async () => {
              await setBiometricEnabled(false);
              setBiometricEnabledState(false);
              Alert.alert("Disabled", `${biometricType} has been disabled.`);
            },
          },
        ],
      );
    }
  };

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

  const openExternalLink = async (url, title) => {
    try {
      const supported = await Linking.canOpenURL(url);
      if (supported) {
        await Linking.openURL(url);
      } else {
        Alert.alert("Error", `Cannot open ${title}. Please try again later.`);
      }
    } catch (error) {
      Alert.alert("Error", `Failed to open ${title}. Please try again.`);
    }
  };

  const handleRateApp = () => {
    const storeUrl =
      Platform.OS === "ios"
        ? EXTERNAL_LINKS.APP_STORE
        : EXTERNAL_LINKS.PLAY_STORE;
    const storeName = Platform.OS === "ios" ? "App Store" : "Play Store";
    openExternalLink(storeUrl, storeName);
  };

  const handleThemeToggle = () => toggleTheme();

  const bindingSubtitle = () => {
    if (bindingStatus === "bound" && boundUsername)
      return `Bound to @${boundUsername}  ✔`;
    return "Link your username & email to this wallet";
  };

  const styles = StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: COLORS.background,
    },
    content: {
      padding: SPACING.lg,
      paddingBottom: 120,
    },

    // ── Section group card ──
    section: {
      marginBottom: SPACING.xl,
      backgroundColor: isDark ? COLORS.card : "#FFFFFF",
      borderRadius: 16,
      overflow: "hidden",
      borderWidth: 1,
      borderColor: isDark ? COLORS.borderStrong : COLORS.border,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: isDark ? 0.5 : 0.18,
      shadowRadius: 16,
      elevation: 12,
    },
    sectionHeader: {
      paddingHorizontal: SPACING.md,
      paddingTop: SPACING.md,
      paddingBottom: SPACING.sm,
      borderBottomWidth: 1,
      borderBottomColor: COLORS.divider,
    },
    sectionTitle: {
      fontSize: FONTS.sizes.xs,
      fontWeight: "700",
      color: COLORS.primary,
      textTransform: "uppercase",
      letterSpacing: 1.2,
    },

    // ── Flat rows ──
    menuItem: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      paddingHorizontal: SPACING.md,
      paddingVertical: SPACING.md,
      backgroundColor: "transparent",
    },
    menuDivider: {
      height: 1,
      backgroundColor: COLORS.divider,
      marginLeft: SPACING.md + 28 + SPACING.md,
    },
    menuLeft: {
      flexDirection: "row",
      alignItems: "center",
      gap: SPACING.md,
      flex: 1,
    },
    iconContainer: {
      width: 32,
      height: 32,
      borderRadius: 8,
      justifyContent: "center",
      alignItems: "center",
      backgroundColor: `${COLORS.primary}15`,
    },
    menuTextBlock: {
      flex: 1,
    },
    menuTitle: {
      fontSize: FONTS.sizes.md,
      fontWeight: "500",
      color: COLORS.text,
    },
    menuSubtitle: {
      fontSize: FONTS.sizes.sm,
      color: COLORS.textSecondary,
      marginTop: 2,
    },
    toggleTextContainer: {
      flex: 1,
    },

    // ── Wallet address card ──
    addressSection: {
      marginBottom: SPACING.xl,
      backgroundColor: isDark ? COLORS.card : "#FFFFFF",
      borderRadius: 16,
      overflow: "hidden",
      borderWidth: 1,
      borderColor: isDark ? COLORS.borderStrong : COLORS.border,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: isDark ? 0.5 : 0.18,
      shadowRadius: 16,
      elevation: 12,
      padding: SPACING.lg,
    },
    addressSectionHeader: {
      flexDirection: "row",
      alignItems: "center",
      gap: SPACING.sm,
      marginBottom: SPACING.md,
    },
    addressSectionTitle: {
      fontSize: FONTS.sizes.xs,
      fontWeight: "700",
      color: COLORS.primary,
      textTransform: "uppercase",
      letterSpacing: 1.2,
    },
    addressBox: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      backgroundColor: isDark ? COLORS.surface : COLORS.primaryMuted,
      borderRadius: 12,
      paddingHorizontal: SPACING.md,
      paddingVertical: SPACING.sm + 2,
      borderWidth: 1,
      borderColor: `${COLORS.primary}30`,
    },
    addressText: {
      fontSize: FONTS.sizes.sm,
      fontFamily: "monospace",
      color: COLORS.text,
      fontWeight: "600",
      flex: 1,
      letterSpacing: 0.5,
    },
    copyButton: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      paddingHorizontal: SPACING.sm,
      paddingVertical: 4,
      borderRadius: 8,
      backgroundColor: addressCopied
        ? `${COLORS.success}20`
        : `${COLORS.primary}20`,
    },
    copyButtonText: {
      fontSize: FONTS.sizes.xs,
      fontWeight: "700",
      color: addressCopied ? COLORS.success : COLORS.primary,
    },

    logoutButton: {
      marginTop: SPACING.sm,
      marginBottom: SPACING.lg,
    },
    footer: {
      fontSize: FONTS.sizes.sm,
      color: COLORS.textTertiary,
      textAlign: "center",
      marginBottom: SPACING.xl,
    },
  });

  const MenuItem = ({
    iconName,
    iconColor,
    title,
    subtitle,
    onPress,
    showArrow = true,
    isLast = false,
  }) => (
    <>
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [
          styles.menuItem,
          pressed && onPress && { backgroundColor: COLORS.hover },
        ]}
      >
        <View style={styles.menuLeft}>
          <View
            style={[
              styles.iconContainer,
              iconColor && { backgroundColor: `${iconColor}18` },
            ]}
          >
            <Ionicons
              name={iconName}
              size={18}
              color={iconColor || COLORS.primary}
            />
          </View>
          <View style={styles.menuTextBlock}>
            <Text style={styles.menuTitle}>{title}</Text>
            {subtitle && <Text style={styles.menuSubtitle}>{subtitle}</Text>}
          </View>
        </View>
        {showArrow && onPress && (
          <Ionicons
            name="chevron-forward"
            size={18}
            color={COLORS.textTertiary}
          />
        )}
      </Pressable>
      {!isLast && <View style={styles.menuDivider} />}
    </>
  );

  const ToggleMenuItem = ({
    iconName,
    iconColor,
    title,
    subtitle,
    value,
    onValueChange,
    disabled,
    isLast = false,
  }) => (
    <>
      <View style={styles.menuItem}>
        <View style={styles.menuLeft}>
          <View
            style={[
              styles.iconContainer,
              iconColor && { backgroundColor: `${iconColor}18` },
            ]}
          >
            <Ionicons
              name={iconName}
              size={18}
              color={iconColor || COLORS.primary}
            />
          </View>
          <View style={styles.toggleTextContainer}>
            <Text style={styles.menuTitle}>{title}</Text>
            {subtitle && <Text style={styles.menuSubtitle}>{subtitle}</Text>}
          </View>
        </View>
        <Switch
          value={value}
          onValueChange={onValueChange}
          disabled={disabled || loading}
          trackColor={{ false: COLORS.surface, true: COLORS.primaryDark }}
          thumbColor={value ? COLORS.primary : COLORS.textTertiary}
        />
      </View>
      {!isLast && <View style={styles.menuDivider} />}
    </>
  );

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* ── Wallet Address Card ── */}
      {wallet?.address && (
        <View style={styles.addressSection}>
          <View style={styles.addressSectionHeader}>
            <Ionicons name="wallet-outline" size={14} color={COLORS.primary} />
            <Text style={styles.addressSectionTitle}>Your Wallet Address</Text>
          </View>
          <View style={styles.addressBox}>
            <Text style={styles.addressText} numberOfLines={1}>
              {formatAddress(wallet.address, 10)}
            </Text>
            <TouchableOpacity
              onPress={handleCopyAddress}
              style={styles.copyButton}
            >
              <Ionicons
                name={addressCopied ? "checkmark-outline" : "copy-outline"}
                size={13}
                color={addressCopied ? COLORS.success : COLORS.primary}
              />
              <Text style={styles.copyButtonText}>
                {addressCopied ? "Copied!" : "Copy"}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* ── Wallet ── */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Wallet</Text>
        </View>
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
            bindingStatus === "bound"
              ? "checkmark-circle-outline"
              : "card-outline"
          }
          iconColor={
            bindingStatus === "bound" ? COLORS.success : COLORS.primary
          }
          title="Bind Wallet Identity"
          subtitle={bindingSubtitle()}
          onPress={() => navigation.navigate("BindWallet")}
          isLast
        />
      </View>

      {/* ── Security ── */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Security</Text>
        </View>
        {/* <ToggleMenuItem
          iconName="finger-print-outline"
          iconColor="#1565C0"
          title={`${biometricType} Authentication`}
          subtitle={
            biometricAvailable
              ? `Use ${biometricType.toLowerCase()} to unlock app`
              : `${biometricType} not available on this device`
          }
          value={biometricEnabled}
          onValueChange={handleBiometricToggle}
          disabled={!biometricAvailable}
        /> */}
        <MenuItem
          iconName="lock-closed-outline"
          iconColor="#1565C0"
          title="Change Passcode"
          subtitle="Update your wallet passcode"
          onPress={() => navigation.navigate("ChangePasscode")}
        />
        {/* <MenuItem
          iconName="globe-outline"
          iconColor="#7B1FA2"
          title="dApps"
          subtitle="Manage dApp connections"
          onPress={() => Alert.alert("Coming Soon")}
        /> */}
        <MenuItem
          iconName="receipt-outline"
          iconColor="#00695C"
          title="Transaction History"
          subtitle="View all your transactions"
          onPress={() => navigation.navigate("Transactions")}
          isLast
        />
      </View>

      {/* ── Preferences ── */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Preferences</Text>
        </View>
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
        <ToggleMenuItem
          iconName={isDark ? "sunny-outline" : "moon-outline"}
          iconColor={COLORS.primary}
          title="Dark Mode"
          subtitle={`Currently: ${isDark ? "Dark" : "Light"}`}
          value={isDark}
          onValueChange={handleThemeToggle}
        />
        <MenuItem
          iconName="trash-outline"
          iconColor="#C62828"
          title="Clear Cache"
          subtitle="Free up storage space"
          onPress={handleClearCache}
          isLast
        />
      </View>

      {/* ── About ── */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>About</Text>
        </View>
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
