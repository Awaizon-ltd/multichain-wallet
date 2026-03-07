import "react-native-get-random-values";
import React, { useEffect, useState, useRef } from "react";
import { StatusBar } from "expo-status-bar";
import {
  View,
  Text,
  Image,
  StyleSheet,
  Animated,
  Platform,
  Alert,
  Easing,
} from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import * as NavigationBar from "expo-navigation-bar";

import { WalletProvider } from "./contexts/WalletContext";
import { ChainProvider } from "./contexts/ChainContext";
import { LoadingProvider } from "./contexts/LoadingContext";
import { ThemeProvider, useTheme } from "./contexts/ThemeContext";

import Navigation from "./navigation/navigation";
import { initDatabase } from "./utils/Database";
import { UpdateChecker } from "./utils/UpdateChecker";
import { AlertProvider } from "./contexts/AlertContext";

// ─── Logo asset ────────────────────────────────────────────────────────────
import Logo from "./assets/logo.png";

// ─── Splash Screen ─────────────────────────────────────────────────────────
const SplashScreen = ({ status, isDark, COLORS, onFadeOut, visible }) => {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(28)).current;
  const dotAnim1 = useRef(new Animated.Value(0.3)).current;
  const dotAnim2 = useRef(new Animated.Value(0.3)).current;
  const dotAnim3 = useRef(new Animated.Value(0.3)).current;
  const exitAnim = useRef(new Animated.Value(1)).current;

  // Entrance
  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 700,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 700,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  // Pulsing dots
  useEffect(() => {
    const pulse = (anim, delay) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(anim, {
            toValue: 1,
            duration: 350,
            useNativeDriver: true,
          }),
          Animated.timing(anim, {
            toValue: 0.3,
            duration: 350,
            useNativeDriver: true,
          }),
          Animated.delay(700 - delay),
        ]),
      ).start();
    pulse(dotAnim1, 0);
    pulse(dotAnim2, 200);
    pulse(dotAnim3, 400);
  }, []);

  // Fade out
  useEffect(() => {
    if (!visible) {
      Animated.timing(exitAnim, {
        toValue: 0,
        duration: 480,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }).start(() => onFadeOut?.());
    }
  }, [visible]);

  return (
    <Animated.View
      style={[
        styles.splash,
        { backgroundColor: COLORS.background, opacity: exitAnim },
      ]}
    >
      <StatusBar
        style={isDark ? "light" : "dark"}
        backgroundColor={COLORS.background}
      />

      {/* Centre block */}
      <Animated.View
        style={{
          opacity: fadeAnim,
          transform: [{ translateY: slideAnim }],
          alignItems: "center",
        }}
      >
        {/* W{logo}LLET wordmark */}
        <View style={styles.walletRow}>
          {/* W */}
          <Text style={[styles.walletLetter, { color: COLORS.primary }]}>
            W
          </Text>

          {/* Logo image in place of "A" */}
          <View style={[styles.logoWrapper, { borderColor: COLORS.primary }]}>
            <Image
              source={Logo}
              style={styles.logoImage}
              resizeMode="contain"
            />
          </View>

          {/* LLET */}
          <Text style={[styles.walletLetter, { color: COLORS.primary }]}>
            LLET
          </Text>
        </View>

        {/* Thin amber divider */}
        <View style={[styles.divider, { backgroundColor: COLORS.primary }]} />

        {/* Tagline */}
        <Text style={[styles.tagline, { color: COLORS.textSecondary }]}>
          Your keys. Your crypto.
        </Text>
      </Animated.View>

      {/* Bottom status */}
      <Animated.View style={[styles.bottomArea, { opacity: fadeAnim }]}>
        <Text style={[styles.statusText, { color: COLORS.textSecondary }]}>
          {status}
        </Text>
        <View style={styles.dots}>
          {[dotAnim1, dotAnim2, dotAnim3].map((anim, i) => (
            <Animated.View
              key={i}
              style={[
                styles.dot,
                { backgroundColor: COLORS.primary, opacity: anim },
              ]}
            />
          ))}
        </View>
      </Animated.View>
    </Animated.View>
  );
};

// ─── App Content ────────────────────────────────────────────────────────────
const AppContent = () => {
  const { COLORS, FONTS, isDark, isLoading: themeLoading } = useTheme();
  const [isReady, setIsReady] = useState(false);
  const [showNav, setShowNav] = useState(false);
  const [splashVisible, setSplashVisible] = useState(true);
  const [statusText, setStatusText] = useState("Initializing...");
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!themeLoading) initializeApp();
  }, [themeLoading]);

  useEffect(() => {
    if (Platform.OS === "android" && !themeLoading) {
      NavigationBar.setBackgroundColorAsync(COLORS.background);
      NavigationBar.setButtonStyleAsync(isDark ? "light" : "dark");
    }
  }, [isDark, COLORS.background, themeLoading]);

  const initializeApp = async () => {
    try {
      if (Platform.OS === "android") {
        await NavigationBar.setBackgroundColorAsync(COLORS.background);
        await NavigationBar.setButtonStyleAsync(isDark ? "light" : "dark");
      }
      setStatusText("Loading database...");
      await initDatabase();

      setStatusText("Checking for updates...");
      checkForUpdates();

      setStatusText("Almost ready...");
      await new Promise((r) => setTimeout(r, 400));

      setIsReady(true);
      setSplashVisible(false);
    } catch (err) {
      console.error("App initialization error:", err);
      setError("Failed to initialize app. Please restart.");
      setIsReady(true);
      setSplashVisible(false);
    }
  };

  const checkForUpdates = async () => {
    try {
      const update = await UpdateChecker.checkForUpdates();
      if (update.type === "playstore") handleGooglePlayUpdate(update);
      else if (update.type === "ota") showOTAUpdateAlert();
    } catch (e) {
      console.error("Update check error:", e);
    }
  };

  const handleGooglePlayUpdate = async (update) => {
    const isFlexible = (update.stalenessDays || 0) < 7;
    if (isFlexible) {
      Alert.alert(
        "Update Available",
        "A new version is available. Would you like to update now?",
        [
          { text: "Later", style: "cancel" },
          {
            text: "Update",
            onPress: async () => {
              try {
                await UpdateChecker.startGooglePlayUpdate(update, true);
              } catch {
                Alert.alert("Update Failed", "Please try again later.");
              }
            },
          },
        ],
        { cancelable: true },
      );
    } else {
      try {
        await UpdateChecker.startGooglePlayUpdate(update, false);
      } catch {
        Alert.alert(
          "Update Required",
          "Please update from Google Play Store to continue.",
        );
      }
    }
  };

  const showOTAUpdateAlert = () => {
    Alert.alert(
      "Update Available",
      "A new update is ready to install. The app will restart.",
      [
        { text: "Later", style: "cancel" },
        {
          text: "Install",
          onPress: async () => {
            try {
              await UpdateChecker.installOTAUpdate();
            } catch {
              Alert.alert("Update Failed", "Please try again later.");
            }
          },
        },
      ],
      { cancelable: true },
    );
  };

  if (themeLoading || !showNav) {
    return (
      <>
        {showNav && (
          <View style={{ flex: 1, backgroundColor: COLORS.background }}>
            <StatusBar
              style={isDark ? "light" : "dark"}
              backgroundColor={COLORS.background}
            />
            {error ? (
              <View
                style={[
                  styles.errorContainer,
                  { backgroundColor: COLORS.background },
                ]}
              >
                <Text style={[styles.errorTitle, { color: COLORS.error }]}>
                  Something went wrong
                </Text>
                <Text
                  style={[styles.errorMsg, { color: COLORS.textSecondary }]}
                >
                  {error}
                </Text>
              </View>
            ) : (
              <Navigation />
            )}
          </View>
        )}
        <SplashScreen
          status={themeLoading ? "Loading theme..." : statusText}
          isDark={isDark}
          COLORS={COLORS}
          visible={splashVisible}
          onFadeOut={() => setShowNav(true)}
        />
      </>
    );
  }

  return (
    <>
      <StatusBar
        style={isDark ? "light" : "dark"}
        backgroundColor={COLORS.background}
      />
      {error ? (
        <View
          style={[
            styles.errorContainer,
            { backgroundColor: COLORS.background },
          ]}
        >
          <Text style={[styles.errorTitle, { color: COLORS.error }]}>
            Something went wrong
          </Text>
          <Text style={[styles.errorMsg, { color: COLORS.textSecondary }]}>
            {error}
          </Text>
        </View>
      ) : (
        <Navigation />
      )}
    </>
  );
};

// ─── Root ────────────────────────────────────────────────────────────────────
export default function App() {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <AlertProvider>
          <LoadingProvider>
            <ChainProvider>
              <WalletProvider>
                <AppContent />
              </WalletProvider>
            </ChainProvider>
          </LoadingProvider>
        </AlertProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  splash: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 999,
  },

  // ── W{logo}LLET row ──
  walletRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 0,
  },
  walletLetter: {
    fontSize: 44,
    fontWeight: "800",
    letterSpacing: 4,
    lineHeight: 52,
  },
  logoWrapper: {
    width: 44,
    height: 44,
    borderRadius: 10,
    borderWidth: 2,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    marginHorizontal: 4,
    // Sits on the same baseline as the letters
    marginBottom: 2,
  },
  logoImage: {
    width: 38,
    height: 38,
  },

  // Divider
  divider: {
    width: 32,
    height: 2,
    borderRadius: 2,
    marginTop: 22,
    marginBottom: 14,
    opacity: 0.6,
  },

  // Tagline
  tagline: {
    fontSize: 12,
    letterSpacing: 2.5,
    fontWeight: "500",
    textTransform: "uppercase",
  },

  // Bottom loading
  bottomArea: {
    position: "absolute",
    bottom: 56,
    alignItems: "center",
    gap: 14,
  },
  statusText: {
    fontSize: 11,
    letterSpacing: 1,
    textTransform: "uppercase",
    fontWeight: "500",
  },
  dots: {
    flexDirection: "row",
    gap: 7,
  },
  dot: {
    width: 5,
    height: 5,
    borderRadius: 3,
  },

  // Error
  errorContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
  },
  errorTitle: {
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 8,
  },
  errorMsg: {
    fontSize: 14,
    textAlign: "center",
    lineHeight: 22,
  },
});
