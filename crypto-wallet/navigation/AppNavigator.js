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
import BannerDetailScreen from "../screens/settings/BannerDetailScreen";
import AccentColorScreen from "../screens/settings/AccentColorScreen";

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();
const { width } = Dimensions.get("window");

// The isolated Explore circle sits outside the pill, so the pill itself
// now only has to fit the other 4 tabs.
const EXPLORE_ROUTE = "BrowserTab";
const PILL_WIDTH = width * 0.7;
const CIRCLE_SIZE = 56;

const iconMap = {
  WalletTab: { focused: "wallet", blur: "wallet-outline" },
  BrowserTab: { focused: "compass", blur: "compass-outline" },
  ActivityTab: { focused: "time", blur: "time-outline" },
  SwapTab: { focused: "repeat", blur: "repeat-outline" },
};

const labelMap = {
  WalletTab: "Wallet",
  BrowserTab: "Explore",
  ActivityTab: "Activity",
  SwapTab: "Swap",
};

// ── Floating tab bar ──
const FloatingTabBar = ({ state, descriptors, navigation }) => {
  const { COLORS } = useTheme();

  const goTo = (route, isFocused) => {
    const event = navigation.emit({
      type: "tabPress",
      target: route.key,
      canPreventDefault: true,
    });
    if (!isFocused && !event.defaultPrevented) {
      navigation.navigate(route.name);
    }
  };

  const exploreRoute = state.routes.find((r) => r.name === EXPLORE_ROUTE);
  const exploreIndex = state.routes.findIndex((r) => r.name === EXPLORE_ROUTE);
  const exploreFocused = state.index === exploreIndex;
  const mainRoutes = state.routes.filter((r) => r.name !== EXPLORE_ROUTE);

  return (
    <View style={styles.outerWrapper} pointerEvents="box-none">
      <View style={styles.row}>
        {/* Main pill: Wallet / Send / Swap / Activity */}
        <View
          style={[
            styles.tabBar,
            {
              backgroundColor: COLORS.card,
              borderColor: COLORS.border,
            },
          ]}
        >
          {mainRoutes.map((route) => {
            const routeIndex = state.routes.indexOf(route);
            const isFocused = state.index === routeIndex;
            const icons = iconMap[route.name] ?? {
              focused: "ellipse",
              blur: "ellipse-outline",
            };
            const iconName = isFocused ? icons.focused : icons.blur;

            return (
              <Pressable
                key={route.key}
                onPress={() => goTo(route, isFocused)}
                style={({ pressed }) => [
                  styles.tabItem,
                  isFocused && { backgroundColor: COLORS.primary },
                  pressed && { opacity: 0.7 },
                ]}
              >
                <Ionicons
                  name={iconName}
                  size={20}
                  color={isFocused ? COLORS.background : COLORS.textTertiary}
                />
              </Pressable>
            );
          })}
        </View>

        {/* Isolated Explore circle */}
        {exploreRoute && (
          <Pressable
            onPress={() => goTo(exploreRoute, exploreFocused)}
            style={({ pressed }) => [
              styles.exploreCircle,
              {
                backgroundColor: COLORS.card,
                borderColor: exploreFocused ? COLORS.primary : COLORS.border,
              },
              exploreFocused && { backgroundColor: COLORS.primary },
              pressed && { opacity: 0.7 },
            ]}
          >
            <Ionicons
              name={iconMap[EXPLORE_ROUTE][exploreFocused ? "focused" : "blur"]}
              size={22}
              color={exploreFocused ? COLORS.background : COLORS.textTertiary}
            />
          </Pressable>
        )}
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
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  tabBar: {
    flexDirection: "row",
    width: PILL_WIDTH,
    borderRadius: 32,
    borderWidth: 1,
    paddingVertical: 6,
    paddingHorizontal: 6,
    alignItems: "center",
    justifyContent: "space-around",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 20,
    elevation: 16,
  },
  tabItem: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  exploreCircle: {
    width: CIRCLE_SIZE,
    height: CIRCLE_SIZE,
    borderRadius: CIRCLE_SIZE / 2,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 20,
    elevation: 16,
  },
});

// ── Tab Navigator ──
const MainTabs = () => (
  <Tab.Navigator
    tabBar={(props) => <FloatingTabBar {...props} />}
    screenOptions={{ headerShown: false }}
  >
    <Tab.Screen name="WalletTab" component={HomeScreen} />
    <Tab.Screen name="SwapTab" component={SwapBridgeScreen} />
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
        name="BannerDetail"
        component={BannerDetailScreen}
        options={{ headerShown: false }} // we render our own back button
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
        component={SwapBridgeScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="Settings"
        component={SettingsScreen}
        options={{ title: "Settings", headerBackTitle: "Back" }}
      />
      <Stack.Screen
        name="AccentColor"
        component={AccentColorScreen}
        options={{ headerShown: false }}
      />
    </Stack.Navigator>
  );
};

export default AppNavigator;
