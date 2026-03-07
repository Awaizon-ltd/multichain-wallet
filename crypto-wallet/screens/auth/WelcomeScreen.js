// screens/welcome/MantisWelcomeScreen.js
import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  TouchableOpacity,
  Animated,
  Image,
} from "react-native";
import { VideoView, useVideoPlayer } from "expo-video";
import { LinearGradient } from "expo-linear-gradient";
import { BlurView } from "expo-blur";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../../contexts/ThemeContext";

const { width, height } = Dimensions.get("window");

const WelcomeScreen = ({ navigation }) => {
  // ✅ Add navigation prop
  const { COLORS, isDark } = useTheme();
  const [glitchActive, setGlitchActive] = useState(false);

  // New expo-video API
  const player = useVideoPlayer(require("../../assets/video.mp4"), (player) => {
    player.loop = true;
    player.muted = true;
    player.play();
  });

  // Animation values
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(50)).current;
  const glitchAnim = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    // Entry animations
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 1000,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 800,
        useNativeDriver: true,
      }),
    ]).start();

    // Continuous pulse animation
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.05,
          duration: 2000,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 2000,
          useNativeDriver: true,
        }),
      ]),
    ).start();

    // Random glitch effect
    const glitchInterval = setInterval(() => {
      if (Math.random() > 0.7) {
        triggerGlitch();
      }
    }, 3000);

    return () => clearInterval(glitchInterval);
  }, []);

  const triggerGlitch = () => {
    setGlitchActive(true);
    Animated.sequence([
      Animated.timing(glitchAnim, {
        toValue: 1,
        duration: 50,
        useNativeDriver: true,
      }),
      Animated.timing(glitchAnim, {
        toValue: -1,
        duration: 50,
        useNativeDriver: true,
      }),
      Animated.timing(glitchAnim, {
        toValue: 0.5,
        duration: 50,
        useNativeDriver: true,
      }),
      Animated.timing(glitchAnim, {
        toValue: 0,
        duration: 50,
        useNativeDriver: true,
      }),
    ]).start(() => setGlitchActive(false));
  };

  // ✅ Handle Get Started - Navigate to Setup
  const handleGetStarted = () => {
    navigation.navigate("Setup");
  };

  const glitchTransform = glitchAnim.interpolate({
    inputRange: [-1, 0, 1],
    outputRange: [-5, 0, 5],
  });

  return (
    <View style={styles.container}>
      {/* Video Background - New expo-video API */}
      <VideoView
        player={player}
        style={styles.videoBackground}
        contentFit="cover"
        nativeControls={false}
      />

      {/* Dark Overlay for glass effect */}
      <View
        style={[
          styles.overlay,
          {
            backgroundColor: isDark
              ? "rgba(13, 20, 16, 0.75)"
              : "rgba(245, 249, 233, 0.6)",
          },
        ]}
      />

      <Animated.View
        style={[
          styles.content,
          {
            opacity: fadeAnim,
            transform: [{ translateY: slideAnim }],
          },
        ]}
      >
        {/* Logo Section with Glitch */}
        <Animated.View
          style={[
            styles.logoContainer,
            {
              transform: [
                { translateX: glitchTransform },
                { scale: pulseAnim },
              ],
            },
          ]}
        >
          {/* Logo */}
          <View style={styles.logoWrapper}>
            <Image
              source={require("../../assets/icon.png")}
              style={styles.logo}
              resizeMode="contain"
            />
          </View>

          <Text style={[styles.mantisText, { color: COLORS.text }]}>
            Awarizon
          </Text>
          {glitchActive && (
            <Text style={[styles.mantisGlitch, { color: COLORS.primary }]}>
              Awarizon
            </Text>
          )}
        </Animated.View>

        {/* Dark Glass Card with Features */}
        <View style={styles.glassWrapper}>
          <BlurView
            intensity={isDark ? 60 : 40}
            tint={isDark ? "dark" : "light"}
            style={styles.glassBlur}
          >
            <View
              style={[
                styles.glassOverlay,
                {
                  backgroundColor: isDark
                    ? "rgba(22, 29, 24, 0.85)"
                    : "rgba(255, 255, 255, 0.75)",
                },
              ]}
            >
              <LinearGradient
                colors={
                  isDark
                    ? ["rgba(168, 209, 79, 0.3)", "rgba(143, 188, 63, 0.15)"]
                    : ["rgba(143, 188, 63, 0.4)", "rgba(168, 209, 79, 0.2)"]
                }
                style={styles.gradientBorder}
              />

              <View style={styles.glassContent}>
                {/* Tagline */}
                <View style={styles.tagline}>
                  <Text style={[styles.taglineText, { color: COLORS.text }]}>
                    Your Keys, Your Crypto
                  </Text>
                  <View
                    style={[
                      styles.taglineUnderline,
                      { backgroundColor: COLORS.primary },
                    ]}
                  />
                </View>

                {/* Features */}
                <View style={styles.featuresContainer}>
                  <FeatureItem
                    icon="shield-checkmark-outline"
                    text="Safe for Web3 Navigation"
                    color={COLORS}
                    isDark={isDark}
                  />
                  <FeatureItem
                    icon="globe-outline"
                    text="Your Gateway to DeFi"
                    color={COLORS}
                    isDark={isDark}
                  />
                  <FeatureItem
                    icon="lock-closed-outline"
                    text="Non-Custodial & Secure"
                    color={COLORS}
                    isDark={isDark}
                  />
                </View>

                {/* CTA Button - ✅ Updated with handler */}
                <TouchableOpacity
                  style={styles.ctaButton}
                  activeOpacity={0.8}
                  onPress={handleGetStarted}
                >
                  <LinearGradient
                    colors={
                      isDark
                        ? ["#A8D14F", "#8FBC3F", "#6E9430"]
                        : ["#8FBC3F", "#A8D14F", "#B5D96A"]
                    }
                    style={styles.ctaGradient}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                  >
                    <Text style={styles.ctaText}>Get Started</Text>
                    <Ionicons name="arrow-forward" size={20} color="#FFFFFF" />
                  </LinearGradient>
                </TouchableOpacity>
              </View>
            </View>
          </BlurView>
        </View>

        {/* Bottom Badge */}
        <View style={styles.badge}>
          <View
            style={[
              styles.badgeContent,
              {
                backgroundColor: isDark
                  ? "rgba(58, 77, 44, 0.6)"
                  : "rgba(212, 232, 184, 0.6)",
                borderColor: isDark
                  ? "rgba(168, 209, 79, 0.3)"
                  : "rgba(143, 188, 63, 0.3)",
              },
            ]}
          >
            <Ionicons
              name="shield-checkmark"
              size={14}
              color={COLORS.primary}
            />
            <Text style={[styles.badgeText, { color: COLORS.textSecondary }]}>
              Non-Custodial • Open Source
            </Text>
          </View>
        </View>
      </Animated.View>
    </View>
  );
};

const FeatureItem = ({ icon, text, color, isDark }) => (
  <View style={styles.featureItem}>
    <View
      style={[
        styles.featureIconContainer,
        {
          backgroundColor: isDark
            ? "rgba(168, 209, 79, 0.15)"
            : "rgba(143, 188, 63, 0.15)",
          borderColor: isDark
            ? "rgba(168, 209, 79, 0.3)"
            : "rgba(143, 188, 63, 0.3)",
        },
      ]}
    >
      <Ionicons name={icon} size={20} color={color.primary} />
    </View>
    <Text style={[styles.featureText, { color: color.text }]}>{text}</Text>
  </View>
);

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  videoBackground: {
    position: "absolute",
    top: 0,
    left: 0,
    bottom: 0,
    right: 0,
    width: width,
    height: height,
  },
  overlay: {
    position: "absolute",
    top: 0,
    left: 0,
    bottom: 0,
    right: 0,
  },
  content: {
    flex: 1,
    width: "100%",
    paddingHorizontal: 20,
    justifyContent: "center",
    alignItems: "center",
  },
  logoContainer: {
    alignItems: "center",
    marginBottom: 40,
  },
  logoWrapper: {
    width: 100,
    height: 100,
    marginBottom: 16,
  },
  logo: {
    width: "100%",
    height: "100%",
  },
  mantisText: {
    fontSize: 44,
    fontWeight: "bold",
    letterSpacing: 6,
    textShadowColor: "rgba(168, 209, 79, 0.4)",
    textShadowOffset: { width: 0, height: 3 },
    textShadowRadius: 10,
  },
  mantisGlitch: {
    position: "absolute",
    bottom: 0,
    fontSize: 44,
    fontWeight: "bold",
    letterSpacing: 6,
    opacity: 0.4,
    transform: [{ translateX: 2 }, { translateY: 2 }],
  },
  glassWrapper: {
    width: "100%",
    borderRadius: 20,
    overflow: "hidden",
  },
  glassBlur: {
    width: "100%",
  },
  glassOverlay: {
    width: "100%",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(168, 209, 79, 0.2)",
  },
  gradientBorder: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 2,
  },
  glassContent: {
    padding: 28,
  },
  tagline: {
    alignItems: "center",
    marginBottom: 28,
  },
  taglineText: {
    fontSize: 18,
    fontWeight: "700",
    letterSpacing: 0.5,
    textAlign: "center",
    marginBottom: 8,
  },
  taglineUnderline: {
    width: 60,
    height: 3,
    borderRadius: 2,
  },
  featuresContainer: {
    marginBottom: 28,
    gap: 14,
  },
  featureItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  featureIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
  },
  featureText: {
    fontSize: 14,
    flex: 1,
    fontWeight: "500",
    letterSpacing: 0.2,
  },
  ctaButton: {
    borderRadius: 14,
    overflow: "hidden",
    shadowColor: "#A8D14F",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  ctaGradient: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 16,
    paddingHorizontal: 28,
    gap: 8,
  },
  ctaText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  badge: {
    marginTop: 24,
  },
  badgeContent: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    paddingHorizontal: 16,
    gap: 6,
    borderRadius: 100,
    borderWidth: 1,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 0.3,
  },
});

export default WelcomeScreen;
