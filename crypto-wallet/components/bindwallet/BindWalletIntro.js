// components/BindWalletIntro.js
import React, { useEffect, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Animated,
  Dimensions,
  Platform,
} from "react-native";
import { Feather, MaterialCommunityIcons, Ionicons } from "@expo/vector-icons";
import { SPACING, FONTS, BORDER_RADIUS, SHADOWS } from "../../constants/Theme";

const { width: SW } = Dimensions.get("window");

// ─────────────────────────────────────────────────────────────────────────────
// Feature card data
// ─────────────────────────────────────────────────────────────────────────────
const FEATURES = [
  {
    key: "email",
    icon: (color) => <Feather name="mail" size={22} color={color} />,
    title: "Send via Email",
    body: "Anyone can send crypto directly to your email — no long wallet address needed.",
  },
  {
    key: "username",
    icon: (color) => <Feather name="at-sign" size={22} color={color} />,
    title: "Send via Username",
    body: "Share your @handle instead. Clean, human-readable, impossible to mistype.",
  },
  {
    key: "chains",
    icon: (color) => (
      <MaterialCommunityIcons name="link-variant" size={22} color={color} />
    ),
    title: "Works Everywhere",
    body: "One binding covers all EVM-compatible networks — automatically, forever.",
  },
  {
    key: "secure",
    icon: (color) => <Feather name="shield" size={22} color={color} />,
    title: "Permanent & Secure",
    body: "Linked once. Each address, username and email can only bind to one identity.",
  },
];

const HOW_IT_WORKS = [
  "Enter a username and email in the form.",
  "We bind them permanently to your wallet address.",
  "Share your username or email — receive from anyone.",
];

// ─────────────────────────────────────────────────────────────────────────────
// Staggered animated wrapper
// ─────────────────────────────────────────────────────────────────────────────
const StaggerItem = ({ children, delay, style }) => {
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(anim, {
      toValue: 1,
      duration: 420,
      delay,
      useNativeDriver: true,
    }).start();
  }, []);

  return (
    <Animated.View
      style={[
        {
          opacity: anim,
          transform: [
            {
              translateY: anim.interpolate({
                inputRange: [0, 1],
                outputRange: [22, 0],
              }),
            },
          ],
        },
        style,
      ]}
    >
      {children}
    </Animated.View>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// BindWalletIntro
// ─────────────────────────────────────────────────────────────────────────────
const BindWalletIntro = ({ onContinue, chainCount, COLORS, isDark }) => {
  const btnScale = useRef(new Animated.Value(1)).current;

  const handlePressIn = () =>
    Animated.spring(btnScale, {
      toValue: 0.96,
      useNativeDriver: true,
      speed: 40,
    }).start();

  const handlePressOut = () =>
    Animated.spring(btnScale, {
      toValue: 1,
      useNativeDriver: true,
      speed: 40,
    }).start();

  const accentMuted = COLORS.primary + "18";
  const accentBorder = COLORS.primary + "35";

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: COLORS.background }}
      contentContainerStyle={styles.scroll}
      showsVerticalScrollIndicator={false}
    >
      {/* ── Hero ── */}
      <StaggerItem delay={0}>
        <View style={styles.hero}>
          {/* Badge */}
          <View
            style={[
              styles.heroBadge,
              { backgroundColor: accentMuted, borderColor: accentBorder },
            ]}
          >
            <Ionicons name="flash" size={38} color={COLORS.primary} />
          </View>

          <Text style={[styles.heroEyebrow, { color: COLORS.primary }]}>
            WALLET IDENTITY
          </Text>

          <Text style={[styles.heroTitle, { color: COLORS.text }]}>
            Your wallet,{"\n"}a human name.
          </Text>

          <Text style={[styles.heroBody, { color: COLORS.textSecondary }]}>
            Stop copying 42-character addresses. Bind your wallet once and let
            anyone send you crypto using just your{" "}
            <Text style={{ color: COLORS.text, fontWeight: "700" }}>email</Text>{" "}
            or{" "}
            <Text style={{ color: COLORS.text, fontWeight: "700" }}>
              @username
            </Text>
            .
          </Text>
        </View>
      </StaggerItem>

      {/* ── Feature cards ── */}
      {FEATURES.map((f, i) => (
        <StaggerItem key={f.key} delay={80 + i * 60}>
          <View
            style={[
              styles.featureCard,
              {
                backgroundColor: COLORS.card,
                borderColor: COLORS.border,
                ...SHADOWS.small,
              },
            ]}
          >
            <View
              style={[
                styles.featureIconWrap,
                {
                  backgroundColor: accentMuted,
                  borderColor: accentBorder,
                },
              ]}
            >
              {f.icon(COLORS.primary)}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.featureTitle, { color: COLORS.text }]}>
                {f.title}
              </Text>
              <Text
                style={[styles.featureBody, { color: COLORS.textSecondary }]}
              >
                {f.body}
              </Text>
            </View>
          </View>
        </StaggerItem>
      ))}

      {/* ── How it works ── */}
      <StaggerItem delay={380}>
        <View
          style={[
            styles.howCard,
            {
              backgroundColor: accentMuted,
              borderColor: accentBorder,
            },
          ]}
        >
          <View style={styles.howHeader}>
            <MaterialCommunityIcons
              name="information-outline"
              size={14}
              color={COLORS.primary}
            />
            <Text style={[styles.howTitle, { color: COLORS.primary }]}>
              HOW IT WORKS
            </Text>
          </View>

          {HOW_IT_WORKS.map((step, i) => (
            <View key={i} style={styles.howRow}>
              <View
                style={[
                  styles.howNumBadge,
                  { backgroundColor: COLORS.primary },
                ]}
              >
                <Text style={styles.howNum}>{i + 1}</Text>
              </View>
              <Text style={[styles.howText, { color: COLORS.textSecondary }]}>
                {step}
              </Text>
            </View>
          ))}
        </View>
      </StaggerItem>

      {/* ── Chain count callout ── */}
      <StaggerItem delay={440}>
        <View
          style={[
            styles.chainCallout,
            {
              backgroundColor: isDark
                ? COLORS.success + "15"
                : COLORS.success + "10",
              borderColor: COLORS.success + "30",
            },
          ]}
        >
          <View
            style={[
              styles.chainCalloutDot,
              { backgroundColor: COLORS.success },
            ]}
          />
          <Text
            style={[styles.chainCalloutText, { color: COLORS.textSecondary }]}
          >
            Covers all{" "}
            <Text style={{ color: COLORS.success, fontWeight: "700" }}>
              {chainCount} EVM networks
            </Text>{" "}
            with a single binding. No repeat setup.
          </Text>
        </View>
      </StaggerItem>

      {/* ── CTA ── */}
      <StaggerItem delay={500}>
        <Animated.View style={{ transform: [{ scale: btnScale }] }}>
          <TouchableOpacity
            onPress={onContinue}
            onPressIn={handlePressIn}
            onPressOut={handlePressOut}
            activeOpacity={1}
            style={[
              styles.ctaBtn,
              {
                backgroundColor: COLORS.primary,
                shadowColor: COLORS.primary,
              },
            ]}
          >
            <Text style={[styles.ctaLabel, { color: COLORS.background }]}>
              Set Up My Identity
            </Text>
            <Feather name="arrow-right" size={18} color={COLORS.background} />
          </TouchableOpacity>
        </Animated.View>

        <Text style={[styles.ctaMeta, { color: COLORS.textTertiary }]}>
          Free · Permanent · Cross-chain
        </Text>
      </StaggerItem>
    </ScrollView>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  scroll: {
    padding: SPACING.lg,
    paddingTop: Platform.OS === "ios" ? 64 : 36,
    paddingBottom: 52,
  },

  // Hero
  hero: {
    alignItems: "center",
    marginBottom: SPACING.xl,
  },
  heroBadge: {
    width: 82,
    height: 82,
    borderRadius: 24,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: SPACING.lg,
  },
  heroEyebrow: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 2.5,
    marginBottom: SPACING.sm,
  },
  heroTitle: {
    fontSize: 36,
    fontWeight: "800",
    textAlign: "center",
    lineHeight: 42,
    letterSpacing: -0.8,
    marginBottom: SPACING.md,
  },
  heroBody: {
    fontSize: FONTS.sizes.md,
    textAlign: "center",
    lineHeight: 24,
    maxWidth: SW * 0.82,
  },

  // Feature cards
  featureCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.md,
    marginBottom: SPACING.sm,
    borderWidth: 1,
    gap: SPACING.md,
  },
  featureIconWrap: {
    width: 48,
    height: 48,
    borderRadius: BORDER_RADIUS.lg,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  featureTitle: {
    fontSize: FONTS.sizes.md,
    fontWeight: "700",
    marginBottom: 3,
  },
  featureBody: {
    fontSize: FONTS.sizes.sm,
    lineHeight: 18,
  },

  // How it works
  howCard: {
    borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.lg,
    marginTop: SPACING.sm,
    marginBottom: SPACING.md,
    borderWidth: 1,
  },
  howHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: SPACING.md,
  },
  howTitle: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 2,
  },
  howRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: SPACING.md,
    marginBottom: SPACING.sm,
  },
  howNumBadge: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    marginTop: 1,
  },
  howNum: {
    fontSize: 11,
    fontWeight: "800",
    color: "#fff",
  },
  howText: {
    fontSize: FONTS.sizes.sm,
    lineHeight: 20,
    flex: 1,
  },

  // Chain callout
  chainCallout: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.md,
    marginBottom: SPACING.xl,
    borderWidth: 1,
    gap: SPACING.sm,
  },
  chainCalloutDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    flexShrink: 0,
  },
  chainCalloutText: {
    fontSize: FONTS.sizes.sm,
    lineHeight: 19,
    flex: 1,
  },

  // CTA
  ctaBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 17,
    borderRadius: BORDER_RADIUS.lg,
    gap: SPACING.sm,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.28,
    shadowRadius: 14,
    elevation: 8,
  },
  ctaLabel: {
    fontSize: FONTS.sizes.md,
    fontWeight: "800",
    letterSpacing: 0.3,
  },
  ctaMeta: {
    fontSize: 11,
    fontWeight: "500",
    textAlign: "center",
    marginTop: SPACING.md,
    letterSpacing: 0.5,
  },
});

export default BindWalletIntro;
