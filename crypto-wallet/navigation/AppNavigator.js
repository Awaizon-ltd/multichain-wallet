import React from "react";
import { View, Text, StyleSheet, Dimensions, Pressable } from "react-native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../contexts/ThemeContext";

// Wallet Screens
import HomeScreen from "../screens/wallet/HomeScreen";
import SendScreen from "../screens/wallet/SendScreen";
import ReceiveScreen from "../screens/wallet/ReceiveScreen";
import TransactionsScreen from "../screens/wallet/TransactionsScreen";
import TransactionConfirmScreen from "../screens/wallet/TransactionConfirmScreen";
import TokensScreen from "../screens/wallet/TokensScreen";
import TokenImportScreen from "../screens/wallet/TokenImportScreen";
import BrowserScreen from "../screens/wallet/DappBrowserScreen";
import NFTScreen from "../screens/wallet/NFTScreen";
import TokenDetailScreen from "../screens/wallet/TokenDetailScreen";
import NFTDetailScreen from "../screens/wallet/NFTDetailScreen";
import NFTSendScreen from "../screens/wallet/NFTSendScreen";
import RecoveryPhraseScreen from "../screens/wallet/RecoveryPhraseScreen";

// Settings
import SettingsScreen from "../screens/settings/SettingsScreen";
import SetupBiometricScreen from "../screens/auth/SetupBiometricScreen";
import ChangePasscodeScreen from "../screens/auth/ChangePasscodeScreen";
import AccountManager from "../screens/wallet/AccountManager";
import BindWalletScreen from "../screens/settings/BindingWalletScreen";
import SwapBridgeScreen from "../screens/swap/SwapBridgeScreen";
import PaymentScreen from "../screens/wallet/PaymentScreen";
import SwapScreen from "../screens/swap/SwapNewSCreen";

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();
const { width } = Dimensions.get("window");
const TAB_WIDTH = width * 0.9;

// ── Floating tab bar ──
const FloatingTabBar = ({ state, descriptors, navigation }) => {
  const { COLORS } = useTheme();

  // Hide entirely when Browser tab is active
  const activeRoute = state.routes[state.index];
  if (activeRoute.name === "BrowserTab") return null;

  const iconMap = {
    WalletTab: { focused: "wallet", blur: "wallet-outline" },
    SendTab: { focused: "send", blur: "send-outline" },
    BrowserTab: { focused: "compass", blur: "compass-outline" },
    ActivityTab: { focused: "time", blur: "time-outline" },
    SwapTab: { focused: "repeat", blur: "repeat-outline" },
  };

  const labelMap = {
    WalletTab: "Wallet",
    SendTab: "Send",
    BrowserTab: "Explore",
    ActivityTab: "Activity",
    SwapTab: "Swap",
  };

  return (
    <View style={styles.outerWrapper} pointerEvents="box-none">
      <View
        style={[
          styles.tabBar,
          {
            backgroundColor: COLORS.card,
            borderColor: COLORS.border,
          },
        ]}
      >
        {state.routes.map((route, index) => {
          const isFocused = state.index === index;
          const icons = iconMap[route.name] ?? {
            focused: "ellipse",
            blur: "ellipse-outline",
          };
          const iconName = isFocused ? icons.focused : icons.blur;
          const label = labelMap[route.name] ?? route.name;

          const onPress = () => {
            const event = navigation.emit({
              type: "tabPress",
              target: route.key,
              canPreventDefault: true,
            });
            if (!isFocused && !event.defaultPrevented) {
              navigation.navigate(route.name);
            }
          };

          return (
            <Pressable
              key={route.key}
              onPress={onPress}
              style={({ pressed }) => [
                styles.tabItem,
                isFocused && { backgroundColor: `${COLORS.primary}15` },
                pressed && { opacity: 0.7 },
              ]}
            >
              {/* Active top notch */}
              {isFocused && (
                <View
                  style={[
                    styles.activeNotch,
                    { backgroundColor: COLORS.primary },
                  ]}
                />
              )}

              <Ionicons
                name={iconName}
                size={22}
                color={isFocused ? COLORS.primary : COLORS.textTertiary}
              />

              <Text
                style={[
                  styles.tabLabel,
                  { color: isFocused ? COLORS.primary : COLORS.textTertiary },
                ]}
              >
                {label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  outerWrapper: {
    position: "absolute",
    bottom: 16,
    width: "100%",
    alignItems: "center",
  },
  tabBar: {
    flexDirection: "row",
    width: TAB_WIDTH,
    borderRadius: 32,
    borderWidth: 1,
    paddingVertical: 2,
    paddingHorizontal: 12,
    alignItems: "center",
    justifyContent: "space-around",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 20,
    elevation: 16,
  },
  tabItem: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 6,
    paddingHorizontal: 4,
    borderRadius: 20,
    position: "relative",
  },
  activeNotch: {
    position: "absolute",
    top: -8,
    width: 20,
    height: 3,
    borderRadius: 2,
  },
  tabLabel: {
    fontSize: 11,
    fontWeight: "600",
    marginTop: 3,
  },
});

// ── Tab Navigator ──
const MainTabs = () => (
  <Tab.Navigator
    tabBar={(props) => <FloatingTabBar {...props} />}
    screenOptions={{ headerShown: false }}
  >
    <Tab.Screen name="WalletTab" component={HomeScreen} />
    <Tab.Screen name="SendTab" component={SendScreen} />
    <Tab.Screen name="SwapTab" component={SwapScreen} />
    <Tab.Screen name="ActivityTab" component={TransactionsScreen} />
    <Tab.Screen name="BrowserTab" component={BrowserScreen} />
  </Tab.Navigator>
);

const AppNavigator = () => {
  const { COLORS } = useTheme();

  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: COLORS.background },
        headerTintColor: COLORS.text,
        headerTitleStyle: { fontWeight: "bold" },
        headerShadowVisible: false,
        contentStyle: { backgroundColor: COLORS.background },
      }}
    >
      <Stack.Screen
        name="Main"
        component={MainTabs}
        options={{ headerShown: false }}
      />

      {/* Token */}
      <Stack.Screen
        name="TokenDetail"
        component={TokenDetailScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="Tokens"
        component={TokensScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="TokenImport"
        component={TokenImportScreen}
        options={{ title: "Import Token", headerBackTitle: "Back" }}
      />

      {/* Transactions */}
      <Stack.Screen
        name="Send"
        component={SendScreen}
        options={{ title: "Send", headerBackTitle: "Back" }}
      />
      <Stack.Screen
        name="Receive"
        component={ReceiveScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="Payment"
        component={PaymentScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="Transactions"
        component={TransactionsScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="TransactionConfirm"
        component={TransactionConfirmScreen}
        options={{ title: "Confirm Transaction", headerBackTitle: "Back" }}
      />
      <Stack.Screen
        name="BindWallet"
        component={BindWalletScreen}
        options={{ headerShown: false }}
      />

      {/* NFT */}
      <Stack.Screen
        name="NFTs"
        component={NFTScreen}
        options={{ title: "NFT Collection", headerBackTitle: "Back" }}
      />
      <Stack.Screen
        name="NFTDetail"
        component={NFTDetailScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="NFTSend"
        component={NFTSendScreen}
        options={{ title: "Send NFT" }}
      />

      {/* Browser */}
      <Stack.Screen
        name="Browser"
        component={BrowserScreen}
        options={{ title: "DApp Browser", headerBackTitle: "Back" }}
      />

      {/* Auth & Settings */}
      <Stack.Screen
        name="RecoveryPhrase"
        component={RecoveryPhraseScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="SetupBiometric"
        component={SetupBiometricScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="AccountManager"
        component={AccountManager}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="ChangePasscode"
        component={ChangePasscodeScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="Swap"
        component={SwapScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="Settings"
        component={SettingsScreen}
        options={{ title: "Settings", headerBackTitle: "Back" }}
      />
    </Stack.Navigator>
  );
};

export default AppNavigator;
