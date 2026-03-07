// navigation/Navigation.js
import React from "react";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { View, StyleSheet, Platform } from "react-native";
import { useWallet } from "../contexts/WalletContext";
import { useTheme } from "../contexts/ThemeContext";
import AppNavigator from "./AppNavigator";
import WalletSetupScreen from "../screens/wallet/WalletSetupScreen";
import PasscodeScreen from "../screens/auth/PasscodeScreen.js";
import AuthLoadingScreen from "../screens/loading/LoadingScreen";
import WelcomeScreen from "../screens/auth/WelcomeScreen.js";

const OnboardingStack = createNativeStackNavigator();

const OnboardingNavigator = () => {
  return (
    <OnboardingStack.Navigator
      screenOptions={{
        headerShown: false,
      }}
    >
      <OnboardingStack.Screen name="Welcome" component={WelcomeScreen} />
      <OnboardingStack.Screen name="Setup" component={WalletSetupScreen} />
    </OnboardingStack.Navigator>
  );
};

const Navigation = () => {
  const { COLORS } = useTheme();
  const { wallet, isAuthenticated, checkingWallet } = useWallet();

  // Determine which screen to show
  const getInitialScreen = () => {
    if (checkingWallet) {
      return "loading";
    }

    if (!wallet) {
      // No wallet exists - show onboarding flow (welcome -> setup)
      return "onboarding";
    }

    if (!isAuthenticated) {
      // Wallet exists but not authenticated - show passcode
      return "passcode";
    }

    // Wallet exists and authenticated - show main app
    return "main";
  };

  const currentScreen = getInitialScreen();

  // Show loading screen while checking wallet
  if (currentScreen === "loading") {
    return <AuthLoadingScreen />;
  }

  // Show onboarding flow if no wallet exists
  if (currentScreen === "onboarding") {
    return (
      <View style={[styles.container, { backgroundColor: COLORS.background }]}>
        <NavigationContainer>
          <OnboardingNavigator />
        </NavigationContainer>
      </View>
    );
  }

  // Show passcode screen if wallet exists but not authenticated
  if (currentScreen === "passcode") {
    return (
      <View style={[styles.container, { backgroundColor: COLORS.background }]}>
        <PasscodeScreen />
      </View>
    );
  }

  // Show main app
  return (
    <View style={[styles.container, { backgroundColor: COLORS.background }]}>
      <NavigationContainer fallback={<AuthLoadingScreen />}>
        <AppNavigator />
      </NavigationContainer>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingTop: Platform.OS === "ios" ? 30 : 20,
    paddingBottom: Platform.OS === "ios" ? 30 : 0,
  },
});

export default Navigation;
