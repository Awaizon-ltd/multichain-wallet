// screens/settings/BindWalletScreen.js
import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  KeyboardAvoidingView,
  Image,
  Platform,
  Animated,
  StatusBar,
} from "react-native";
import {
  Feather,
  Ionicons,
  MaterialCommunityIcons,
  FontAwesome5,
} from "@expo/vector-icons";
import { useWallet } from "../../contexts/WalletContext";
import { useTheme } from "../../contexts/ThemeContext";
import { API_CONFIG } from "../../config/api";
import { getMainnetChains } from "../../constants/Chain";
import Alert from "../../utils/Alert";
import { SPACING, FONTS, BORDER_RADIUS, SHADOWS } from "../../constants/Theme";
import AsyncStorage from "@react-native-async-storage/async-storage";
import BindWalletIntro from "../../components/bindwallet/BindWalletIntro";

const INTRO_SEEN_KEY = "@bind_wallet_intro_seen";

const MAINNET_CHAINS = getMainnetChains();
const API_BASE_URL = API_CONFIG.BASE_URL;

// ─────────────────────────────────────────────────────────────────────────────
// API layer
// ─────────────────────────────────────────────────────────────────────────────
const api = {
  async bind({ username, email, wallet_address }) {
    const res = await fetch(`${API_BASE_URL}/wallets/bind`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, email, wallet_address }),
    });
    const json = await res.json();
    if (!res.ok) throw { status: res.status, ...json };
    return json;
  },

  async resolveByAddress(wallet_address) {
    const res = await fetch(
      `${API_BASE_URL}/wallets/resolve-by-address?wallet_address=${encodeURIComponent(wallet_address.trim())}`,
    );
    const json = await res.json();
    if (!res.ok) throw { status: res.status, ...json };
    return json;
  },

  async resolveByIdentity(emailOrUsername) {
    const res = await fetch(
      `${API_BASE_URL}/wallets/resolve?email_or_username=${encodeURIComponent(emailOrUsername.trim())}`,
    );
    const json = await res.json();
    if (!res.ok) throw { status: res.status, ...json };
    return json;
  },
};

const ERROR_MESSAGES = {
  EMAIL_ALREADY_BOUND: "This email is already linked to another wallet.",
  WALLET_ALREADY_BOUND: "This wallet is already bound to another account.",
  USERNAME_TAKEN: "That username is taken — try a different one.",
  INVALID_WALLET_FORMAT: "Your wallet address must be a valid EVM address.",
};

// ─────────────────────────────────────────────────────────────────────────────
// Skeleton shimmer — single reusable bone
// ─────────────────────────────────────────────────────────────────────────────
const SkeletonBone = ({ width, height, borderRadius, style, COLORS }) => {
  const shimmer = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(shimmer, {
          toValue: 1,
          duration: 900,
          useNativeDriver: true,
        }),
        Animated.timing(shimmer, {
          toValue: 0,
          duration: 900,
          useNativeDriver: true,
        }),
      ]),
    ).start();
  }, []);

  const opacity = shimmer.interpolate({
    inputRange: [0, 1],
    outputRange: [0.35, 0.7],
  });

  return (
    <Animated.View
      style={[
        {
          width,
          height,
          borderRadius: borderRadius ?? BORDER_RADIUS.md,
          backgroundColor: COLORS.border,
          opacity,
        },
        style,
      ]}
    />
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Skeleton screen — shown while resolveByAddress is in-flight
// ─────────────────────────────────────────────────────────────────────────────
const SkeletonScreen = ({ COLORS }) => {
  const cardBg = { backgroundColor: COLORS.card, ...SHADOWS.small };

  return (
    <ScrollView
      contentContainerStyle={{ padding: SPACING.lg, paddingBottom: 100 }}
      showsVerticalScrollIndicator={false}
      scrollEnabled={false}
    >
      {/* Status banner skeleton */}
      <View
        style={[
          ss.card,
          cardBg,
          {
            flexDirection: "row",
            alignItems: "center",
            gap: SPACING.md,
            padding: SPACING.md,
            marginBottom: SPACING.md,
          },
        ]}
      >
        <SkeletonBone
          width={60}
          height={60}
          borderRadius={30}
          COLORS={COLORS}
        />
        <View style={{ flex: 1, gap: 8 }}>
          <SkeletonBone width="55%" height={14} COLORS={COLORS} />
          <SkeletonBone width="80%" height={11} COLORS={COLORS} />
          <SkeletonBone width="65%" height={11} COLORS={COLORS} />
        </View>
      </View>

      {/* Chain coverage skeleton */}
      <View style={[ss.card, cardBg]}>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            marginBottom: SPACING.md,
          }}
        >
          <SkeletonBone width="40%" height={11} COLORS={COLORS} />
          <SkeletonBone
            width={52}
            height={22}
            borderRadius={11}
            COLORS={COLORS}
            style={{ marginLeft: "auto" }}
          />
        </View>
        <View
          style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, margin: -3 }}
        >
          {Array.from({ length: 8 }).map((_, i) => (
            <SkeletonBone
              key={i}
              width={72 + (i % 3) * 12}
              height={28}
              borderRadius={14}
              COLORS={COLORS}
              style={{ margin: 3 }}
            />
          ))}
        </View>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
            marginTop: SPACING.md,
            paddingTop: SPACING.sm,
            borderTopWidth: StyleSheet.hairlineWidth,
            borderTopColor: COLORS.divider,
          }}
        >
          <SkeletonBone width={6} height={6} borderRadius={3} COLORS={COLORS} />
          <SkeletonBone width="60%" height={10} COLORS={COLORS} />
        </View>
      </View>

      {/* Active wallet skeleton */}
      <View style={[ss.card, cardBg]}>
        <SkeletonBone
          width="30%"
          height={10}
          COLORS={COLORS}
          style={{ marginBottom: SPACING.md }}
        />
        <View
          style={[
            ss.addressRow,
            { backgroundColor: COLORS.cardElevated, alignItems: "center" },
          ]}
        >
          <SkeletonBone
            width={36}
            height={36}
            borderRadius={18}
            COLORS={COLORS}
          />
          <SkeletonBone
            width="60%"
            height={13}
            COLORS={COLORS}
            style={{ flex: 1, marginLeft: SPACING.sm }}
          />
          <SkeletonBone width={32} height={14} COLORS={COLORS} />
        </View>
      </View>

      {/* Bind form skeleton */}
      <View style={[ss.card, cardBg]}>
        <SkeletonBone
          width="35%"
          height={10}
          COLORS={COLORS}
          style={{ marginBottom: SPACING.md }}
        />
        <SkeletonBone
          width="25%"
          height={10}
          COLORS={COLORS}
          style={{ marginBottom: 6 }}
        />
        <SkeletonBone
          width="100%"
          height={48}
          borderRadius={BORDER_RADIUS.lg}
          COLORS={COLORS}
          style={{ marginBottom: SPACING.md }}
        />
        <SkeletonBone
          width="30%"
          height={10}
          COLORS={COLORS}
          style={{ marginBottom: 6 }}
        />
        <SkeletonBone
          width="100%"
          height={48}
          borderRadius={BORDER_RADIUS.lg}
          COLORS={COLORS}
          style={{ marginBottom: SPACING.md }}
        />
        <SkeletonBone
          width="100%"
          height={52}
          borderRadius={BORDER_RADIUS.lg}
          COLORS={COLORS}
          style={{ marginTop: SPACING.sm }}
        />
      </View>

      {/* Lookup skeleton */}
      <View style={[ss.card, cardBg]}>
        <SkeletonBone
          width="38%"
          height={10}
          COLORS={COLORS}
          style={{ marginBottom: SPACING.md }}
        />
        <SkeletonBone
          width="40%"
          height={10}
          COLORS={COLORS}
          style={{ marginBottom: 6 }}
        />
        <SkeletonBone
          width="100%"
          height={48}
          borderRadius={BORDER_RADIUS.lg}
          COLORS={COLORS}
          style={{ marginBottom: SPACING.md }}
        />
        <SkeletonBone
          width="100%"
          height={50}
          borderRadius={BORDER_RADIUS.lg}
          COLORS={COLORS}
        />
      </View>
    </ScrollView>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Animated card wrapper — slides up + fades in with configurable delay
// ─────────────────────────────────────────────────────────────────────────────
const AnimatedCard = ({ children, delay = 0, style }) => {
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(anim, {
      toValue: 1,
      duration: 380,
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
                outputRange: [18, 0],
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
// Animated focus input with theme-driven border
// ─────────────────────────────────────────────────────────────────────────────
const ThemedInput = ({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType,
  iconName,
  iconLib = "Feather",
  COLORS,
}) => {
  const focusAnim = useRef(new Animated.Value(0)).current;

  const borderColor = focusAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [COLORS.border, COLORS.primary],
  });
  const bgColor = focusAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [COLORS.cardElevated, COLORS.hover],
  });

  const IconComponent =
    iconLib === "Feather"
      ? Feather
      : iconLib === "Ionicons"
        ? Ionicons
        : MaterialCommunityIcons;

  return (
    <View style={{ marginBottom: SPACING.md }}>
      <Text style={[ss.inputLabel, { color: COLORS.textTertiary }]}>
        {label}
      </Text>
      <Animated.View
        style={[ss.inputWrap, { borderColor, backgroundColor: bgColor }]}
      >
        {iconName ? (
          <IconComponent
            name={iconName}
            size={17}
            color={COLORS.textTertiary}
            style={{ marginRight: SPACING.sm }}
          />
        ) : null}
        <TextInput
          style={[ss.inputText, { color: COLORS.text }]}
          placeholder={placeholder}
          placeholderTextColor={COLORS.textTertiary}
          value={value}
          onChangeText={onChangeText}
          onFocus={() =>
            Animated.timing(focusAnim, {
              toValue: 1,
              duration: 200,
              useNativeDriver: false,
            }).start()
          }
          onBlur={() =>
            Animated.timing(focusAnim, {
              toValue: 0,
              duration: 200,
              useNativeDriver: false,
            }).start()
          }
          keyboardType={keyboardType || "default"}
          autoCapitalize="none"
          autoCorrect={false}
        />
      </Animated.View>
    </View>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Chain pill using real icons from Chain.js
// ─────────────────────────────────────────────────────────────────────────────
const ChainPill = ({ chain, COLORS }) => (
  <View
    style={[
      ss.chainPill,
      { backgroundColor: COLORS.cardElevated, borderColor: COLORS.border },
    ]}
  >
    <Image
      source={{ uri: chain.icon }}
      style={ss.chainIcon}
      resizeMode="contain"
    />
    <Text style={[ss.chainLabel, { color: COLORS.textSecondary }]}>
      {chain.name}
    </Text>
  </View>
);

// ─────────────────────────────────────────────────────────────────────────────
// Divider
// ─────────────────────────────────────────────────────────────────────────────
const Divider = ({ COLORS }) => (
  <View
    style={{
      height: StyleSheet.hairlineWidth,
      backgroundColor: COLORS.divider,
      marginVertical: SPACING.sm,
    }}
  />
);

// ─────────────────────────────────────────────────────────────────────────────
// InfoRow used in bound-data card
// ─────────────────────────────────────────────────────────────────────────────
const InfoRow = ({ label, value, COLORS, last }) => (
  <>
    <View style={ss.infoRow}>
      <Text style={[ss.infoKey, { color: COLORS.textTertiary }]}>{label}</Text>
      <Text
        style={[ss.infoVal, { color: COLORS.text }]}
        numberOfLines={1}
        ellipsizeMode="middle"
      >
        {value}
      </Text>
    </View>
    {!last && <Divider COLORS={COLORS} />}
  </>
);

// ─────────────────────────────────────────────────────────────────────────────
// Primary CTA button
// ─────────────────────────────────────────────────────────────────────────────
const PrimaryButton = ({ label, onPress, loading, disabled, COLORS }) => {
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const handlePressIn = () =>
    Animated.spring(scaleAnim, {
      toValue: 0.97,
      useNativeDriver: true,
      speed: 30,
    }).start();
  const handlePressOut = () =>
    Animated.spring(scaleAnim, {
      toValue: 1,
      useNativeDriver: true,
      speed: 30,
    }).start();

  return (
    <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
      <TouchableOpacity
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        disabled={disabled || loading}
        activeOpacity={1}
        style={[
          ss.primaryBtn,
          {
            backgroundColor: disabled ? COLORS.disabled : COLORS.primary,
            ...SHADOWS.medium,
            shadowColor: disabled ? "#000" : COLORS.primary,
          },
        ]}
      >
        {loading ? (
          <ActivityIndicator size="small" color={COLORS.background} />
        ) : (
          <Text
            style={[
              ss.primaryBtnLabel,
              { color: disabled ? COLORS.disabledText : COLORS.background },
            ]}
          >
            {label}
          </Text>
        )}
      </TouchableOpacity>
    </Animated.View>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Outline button (lookup)
// ─────────────────────────────────────────────────────────────────────────────
const OutlineButton = ({ label, onPress, loading, disabled, COLORS }) => (
  <TouchableOpacity
    onPress={onPress}
    disabled={disabled || loading}
    activeOpacity={0.75}
    style={[
      ss.outlineBtn,
      { borderColor: disabled ? COLORS.border : COLORS.primary },
    ]}
  >
    {loading ? (
      <ActivityIndicator size="small" color={COLORS.primary} />
    ) : (
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <Feather
          name="search"
          size={16}
          color={disabled ? COLORS.textTertiary : COLORS.primary}
        />
        <Text
          style={[
            ss.outlineBtnLabel,
            { color: disabled ? COLORS.textTertiary : COLORS.primary },
          ]}
        >
          {label}
        </Text>
      </View>
    )}
  </TouchableOpacity>
);

// ─────────────────────────────────────────────────────────────────────────────
// Static stylesheet (values that don't depend on COLORS)
// ─────────────────────────────────────────────────────────────────────────────
const ss = StyleSheet.create({
  // Header
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.md,
  },
  backTouch: {
    marginRight: SPACING.sm,
    padding: SPACING.xs,
    borderRadius: BORDER_RADIUS.round,
  },
  backIcon: { fontSize: 28, fontWeight: "300", lineHeight: 34 },
  headerTitle: {
    fontSize: FONTS.sizes.lg,
    fontWeight: "700",
    lineHeight: FONTS.sizes.lg * FONTS.lineHeights.tight,
  },
  headerSub: { fontSize: FONTS.sizes.xs, marginTop: 2 },
  statusDot: { width: 8, height: 8, borderRadius: BORDER_RADIUS.round },

  // Cards
  card: {
    borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.lg,
    marginBottom: SPACING.md,
  },

  // Section label
  sectionLabel: {
    fontSize: FONTS.sizes.xs,
    fontWeight: "700",
    letterSpacing: 1,
    textTransform: "uppercase",
    marginBottom: SPACING.md,
  },

  // Inputs
  inputLabel: {
    fontSize: FONTS.sizes.xs,
    fontWeight: "600",
    letterSpacing: 0.6,
    textTransform: "uppercase",
    marginBottom: 6,
  },
  inputWrap: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: BORDER_RADIUS.lg,
    borderWidth: 1.5,
    paddingHorizontal: SPACING.md,
  },
  inputIcon: { fontSize: 16, marginRight: SPACING.sm },
  inputText: {
    flex: 1,
    fontSize: FONTS.sizes.md,
    paddingVertical: SPACING.sm + 2,
    fontWeight: "400",
  },

  // Chain pills
  chainPill: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: BORDER_RADIUS.round,
    paddingVertical: 5,
    paddingHorizontal: 10,
    margin: 3,
    borderWidth: 1,
  },
  chainIcon: {
    width: 15,
    height: 15,
    borderRadius: BORDER_RADIUS.round,
    marginRight: 5,
  },
  chainLabel: { fontSize: 11, fontWeight: "500" },

  // Info rows
  infoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 10,
  },
  infoKey: { fontSize: FONTS.sizes.sm, fontWeight: "500" },
  infoVal: {
    fontSize: FONTS.sizes.sm,
    fontWeight: "600",
    maxWidth: "58%",
    textAlign: "right",
  },

  // Buttons
  primaryBtn: {
    borderRadius: BORDER_RADIUS.lg,
    paddingVertical: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryBtnLabel: {
    fontSize: FONTS.sizes.md,
    fontWeight: "700",
    letterSpacing: 0.3,
  },
  outlineBtn: {
    borderRadius: BORDER_RADIUS.lg,
    paddingVertical: 15,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
  },
  outlineBtnLabel: { fontSize: FONTS.sizes.md, fontWeight: "600" },

  // Wallet address row
  addressRow: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md,
    gap: SPACING.sm,
  },
  addressText: {
    flex: 1,
    fontSize: 13,
    letterSpacing: 0.4,
    fontFamily: Platform.OS === "ios" ? "Courier New" : "monospace",
  },

  // Lookup result / error
  resultCard: {
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.md,
    marginTop: SPACING.sm,
  },
  resultLabel: {
    fontSize: FONTS.sizes.xs,
    fontWeight: "700",
    letterSpacing: 1,
    textTransform: "uppercase",
    marginBottom: SPACING.sm,
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// Main screen
// ─────────────────────────────────────────────────────────────────────────────
const BindWalletScreen = ({ navigation }) => {
  const { wallet } = useWallet();
  const { COLORS, isDark } = useTheme();

  const [introReady, setIntroReady] = useState(false); // true once AsyncStorage check done
  const [showIntro, setShowIntro] = useState(false); // true only if not seen before
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [lookupQuery, setLookup] = useState("");
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(false);
  const [boundData, setBoundData] = useState(null);
  const [lookupResult, setLookupRes] = useState(null);
  const [lookupError, setLookupErr] = useState(null);

  const mainFade = useRef(new Animated.Value(0)).current;

  const walletAddress = wallet?.address || "";

  // ── On mount: check if intro has been seen before ─────────────────────────
  useEffect(() => {
    AsyncStorage.getItem(INTRO_SEEN_KEY)
      .then((val) => {
        if (val === "true") {
          // Already seen — skip intro, go straight to binding check
          setIntroReady(true);
          setShowIntro(false);
          setChecking(true);

          if (!walletAddress) {
            setChecking(false);
            return;
          }

          api
            .resolveByAddress(walletAddress)
            .then((json) => {
              setBoundData(json.data);
              setUsername(json.data.username || "");
              setEmail(json.data.email || "");
            })
            .catch((err) => {
              if (err.status !== 404) console.warn("Bind check:", err);
            })
            .finally(() => {
              setChecking(false);
              Animated.timing(mainFade, {
                toValue: 1,
                duration: 350,
                useNativeDriver: true,
              }).start();
            });
        } else {
          // First time — show intro
          setShowIntro(true);
          setIntroReady(true);
        }
      })
      .catch(() => {
        // AsyncStorage failed — default to showing intro
        setShowIntro(true);
        setIntroReady(true);
      });
  }, []);

  // ── Called when user taps "Set Up My Identity" on intro ──────────────────
  const handleIntroContinue = () => {
    // Persist so intro never shows again
    AsyncStorage.setItem(INTRO_SEEN_KEY, "true").catch(() => {});

    setShowIntro(false);
    setChecking(true);

    if (!walletAddress) {
      setChecking(false);
      return;
    }

    api
      .resolveByAddress(walletAddress)
      .then((json) => {
        setBoundData(json.data);
        setUsername(json.data.username || "");
        setEmail(json.data.email || "");
      })
      .catch((err) => {
        if (err.status !== 404) console.warn("Bind check:", err);
      })
      .finally(() => {
        setChecking(false);
        // Fade content in after skeleton disappears
        Animated.timing(mainFade, {
          toValue: 1,
          duration: 350,
          useNativeDriver: true,
        }).start();
      });
  };

  // ── Validation ──────────────────────────────────────────────────────────
  const validate = () => {
    if (!walletAddress) {
      Alert.alert("No Wallet", "Please create or import a wallet first.");
      return false;
    }
    if (username.trim().length < 3 || !/^[a-zA-Z0-9]+$/.test(username.trim())) {
      Alert.alert("Invalid Username", "3+ alphanumeric characters only.");
      return false;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      Alert.alert("Invalid Email", "Please enter a valid email address.");
      return false;
    }
    return true;
  };

  // ── Bind ────────────────────────────────────────────────────────────────
  const handleBind = () => {
    if (!validate()) return;
    Alert.alert(
      "Confirm Binding",
      `You are about to permanently link:\n\n  @${username.trim()}\n  ${email.trim()}\n\n…to this wallet across all ${MAINNET_CHAINS.length} EVM chains. This cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Confirm & Bind",
          onPress: async () => {
            setLoading(true);
            try {
              const result = await api.bind({
                username: username.trim(),
                email: email.trim(),
                wallet_address: walletAddress,
              });
              setBoundData(result.data);
              Alert.alert(
                "✅ Identity Bound",
                `@${result.data.username} is now linked to your wallet on all ${MAINNET_CHAINS.length} chains.`,
                [{ text: "Done", onPress: () => navigation.goBack() }],
              );
            } catch (err) {
              Alert.alert(
                "Binding Failed",
                ERROR_MESSAGES[err.code] ||
                  err.errors?.join("\n") ||
                  err.message ||
                  "Something went wrong.",
              );
            } finally {
              setLoading(false);
            }
          },
        },
      ],
    );
  };

  // ── Lookup ──────────────────────────────────────────────────────────────
  const handleLookup = async () => {
    const q = lookupQuery.trim();
    if (!q) return;
    setLoading(true);
    setLookupRes(null);
    setLookupErr(null);
    try {
      const result = await api.resolveByIdentity(q);
      setLookupRes(result.data);
    } catch (err) {
      setLookupErr(
        err.status === 404
          ? "No wallet found for that username or email."
          : err.message || "Lookup failed. Please try again.",
      );
    } finally {
      setLoading(false);
    }
  };

  // ── Wait for AsyncStorage check before rendering anything ────────────────
  if (!introReady) return null;

  // ── Render intro ─────────────────────────────────────────────────────────
  if (showIntro) {
    return (
      <>
        <StatusBar barStyle={isDark ? "light-content" : "dark-content"} />
        <BindWalletIntro
          onContinue={handleIntroContinue}
          chainCount={MAINNET_CHAINS.length}
          COLORS={COLORS}
          isDark={isDark}
        />
      </>
    );
  }

  const shortAddr = walletAddress
    ? `${walletAddress.slice(0, 10)}  ···  ${walletAddress.slice(-8)}`
    : null;

  const isBound = !!boundData;

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: COLORS.background }}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} />

      {/* ──────────────────────────────────────────────────
          HEADER
      ────────────────────────────────────────────────── */}
      <View
        style={{
          paddingTop: Platform.OS === "ios" ? 58 : 22,
          paddingBottom: SPACING.md,
          backgroundColor: COLORS.background,
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: COLORS.border,
          ...SHADOWS.small,
        }}
      >
        <View style={ss.header}>
          {/* Back */}
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            style={[ss.backTouch, { backgroundColor: COLORS.cardElevated }]}
            activeOpacity={0.7}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons name="chevron-back" size={22} color={COLORS.text} />
          </TouchableOpacity>

          {/* Title block */}
          <View style={{ flex: 1, marginLeft: SPACING.sm }}>
            <Text style={[ss.headerTitle, { color: COLORS.text }]}>
              Wallet Identity
            </Text>
            <Text style={[ss.headerSub, { color: COLORS.textTertiary }]}>
              {checking
                ? "Checking status…"
                : isBound
                  ? `Bound  ·  @${boundData.username}`
                  : `${MAINNET_CHAINS.length} EVM chains  ·  One binding`}
            </Text>
          </View>

          {/* Live status dot — hidden while skeleton showing */}
          {!checking && (
            <View
              style={[
                ss.statusDot,
                {
                  backgroundColor: isBound ? COLORS.success : COLORS.warning,
                  shadowColor: isBound ? COLORS.success : COLORS.warning,
                  shadowOpacity: 0.9,
                  shadowRadius: 6,
                  elevation: 4,
                },
              ]}
            />
          )}
        </View>
      </View>

      {/* ──────────────────────────────────────────────────
          SKELETON  or  REAL CONTENT
      ────────────────────────────────────────────────── */}
      {checking ? (
        <SkeletonScreen COLORS={COLORS} />
      ) : (
        <Animated.View style={{ flex: 1, opacity: mainFade }}>
          <ScrollView
            contentContainerStyle={{ padding: SPACING.lg, paddingBottom: 140 }}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {/* ── STATUS BANNER ── */}
            <AnimatedCard delay={50}>
              <View
                style={[
                  ss.card,
                  {
                    backgroundColor: isBound
                      ? COLORS.success + "18"
                      : COLORS.primaryMuted,
                    borderWidth: 1,
                    borderColor: isBound
                      ? COLORS.success + "40"
                      : COLORS.primaryLight + "60",
                    flexDirection: "row",
                    alignItems: "center",
                    gap: SPACING.md,
                    padding: SPACING.md,
                  },
                ]}
              >
                {/* Icon circle */}
                <View
                  style={{
                    width: 60,
                    height: 60,
                    borderRadius: BORDER_RADIUS.round,
                    backgroundColor: isBound
                      ? COLORS.success + "22"
                      : COLORS.primary + "22",
                    justifyContent: "center",
                    alignItems: "center",
                    borderWidth: 1,
                    borderColor: isBound
                      ? COLORS.success + "50"
                      : COLORS.primary + "50",
                  }}
                >
                  {isBound ? (
                    <Feather
                      name="check-circle"
                      size={28}
                      color={COLORS.success}
                    />
                  ) : (
                    <MaterialCommunityIcons
                      name="card-account-details-outline"
                      size={28}
                      color={COLORS.primary}
                    />
                  )}
                </View>
                <View style={{ flex: 1 }}>
                  <Text
                    style={{
                      fontSize: FONTS.sizes.base,
                      fontWeight: "700",
                      color: COLORS.text,
                    }}
                  >
                    {isBound ? "Identity Bound" : "Not Bound Yet"}
                  </Text>
                  <Text
                    style={{
                      fontSize: FONTS.sizes.sm,
                      color: COLORS.textSecondary,
                      marginTop: 3,
                      lineHeight: 18,
                    }}
                  >
                    {isBound
                      ? `@${boundData.username} · ${boundData.email}`
                      : "Link your username & email once — valid across all EVM chains"}
                  </Text>
                </View>
              </View>
            </AnimatedCard>

            {/* ── CHAIN COVERAGE ── */}
            <AnimatedCard delay={130}>
              <View
                style={[
                  ss.card,
                  { backgroundColor: COLORS.card, ...SHADOWS.small },
                ]}
              >
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    marginBottom: SPACING.md,
                  }}
                >
                  <Text
                    style={[
                      ss.sectionLabel,
                      {
                        color: COLORS.textTertiary,
                        marginBottom: 0,
                        flex: 1,
                      },
                    ]}
                  >
                    Supported Networks
                  </Text>
                  <View
                    style={{
                      backgroundColor: COLORS.primaryMuted,
                      borderRadius: BORDER_RADIUS.round,
                      paddingHorizontal: SPACING.sm,
                      paddingVertical: 3,
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 11,
                        fontWeight: "700",
                        color: COLORS.primaryDark,
                      }}
                    >
                      {MAINNET_CHAINS.length} chains
                    </Text>
                  </View>
                </View>

                <View
                  style={{
                    flexDirection: "row",
                    flexWrap: "wrap",
                    margin: -3,
                  }}
                >
                  {MAINNET_CHAINS.map((chain) => (
                    <ChainPill key={chain.id} chain={chain} COLORS={COLORS} />
                  ))}
                </View>

                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: SPACING.sm,
                    marginTop: SPACING.md,
                    paddingTop: SPACING.sm,
                    borderTopWidth: StyleSheet.hairlineWidth,
                    borderTopColor: COLORS.divider,
                  }}
                >
                  <View
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: 3,
                      backgroundColor: COLORS.success,
                    }}
                  />
                  <Text
                    style={{
                      fontSize: 11,
                      color: COLORS.textTertiary,
                      fontWeight: "500",
                    }}
                  >
                    One binding · Same address · Every EVM network
                  </Text>
                </View>
              </View>
            </AnimatedCard>

            {/* ── ACTIVE WALLET ── */}
            <AnimatedCard delay={210}>
              <View
                style={[
                  ss.card,
                  { backgroundColor: COLORS.card, ...SHADOWS.small },
                ]}
              >
                <Text style={[ss.sectionLabel, { color: COLORS.textTertiary }]}>
                  Active Wallet
                </Text>
                {walletAddress ? (
                  <View
                    style={[
                      ss.addressRow,
                      { backgroundColor: COLORS.cardElevated },
                    ]}
                  >
                    <FontAwesome5
                      name="wallet"
                      size={20}
                      color={COLORS.textSecondary}
                    />
                    <Text
                      style={[ss.addressText, { color: COLORS.textSecondary }]}
                      numberOfLines={1}
                    >
                      {shortAddr}
                    </Text>
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 5,
                      }}
                    >
                      <View
                        style={{
                          width: 6,
                          height: 6,
                          borderRadius: 3,
                          backgroundColor: COLORS.success,
                        }}
                      />
                      <Text
                        style={{
                          fontSize: 10,
                          color: COLORS.success,
                          fontWeight: "600",
                        }}
                      >
                        LIVE
                      </Text>
                    </View>
                  </View>
                ) : (
                  <Text
                    style={{ color: COLORS.error, fontSize: FONTS.sizes.sm }}
                  >
                    No wallet loaded — please create or import one first.
                  </Text>
                )}
              </View>
            </AnimatedCard>

            {/* ── BOUND SUMMARY  or  BIND FORM ── */}
            <AnimatedCard delay={290}>
              {isBound ? (
                // ── Bound state — show current binding details ──
                <View
                  style={[
                    ss.card,
                    {
                      backgroundColor: COLORS.card,
                      borderLeftWidth: 3,
                      borderLeftColor: COLORS.success,
                      ...SHADOWS.small,
                    },
                  ]}
                >
                  <Text
                    style={[ss.sectionLabel, { color: COLORS.textTertiary }]}
                  >
                    Current Binding
                  </Text>

                  <InfoRow
                    label="Username"
                    value={`@${boundData.username}`}
                    COLORS={COLORS}
                  />
                  <InfoRow
                    label="Email"
                    value={boundData.email}
                    COLORS={COLORS}
                  />
                  <InfoRow
                    label="Bound on"
                    value={new Date(boundData.created_at).toLocaleDateString(
                      "en-US",
                      {
                        year: "numeric",
                        month: "short",
                        day: "numeric",
                      },
                    )}
                    COLORS={COLORS}
                  />
                  <InfoRow
                    label="Coverage"
                    value={`All ${MAINNET_CHAINS.length} EVM chains`}
                    COLORS={COLORS}
                    last
                  />
                </View>
              ) : (
                // ── Unbound state — show bind form ──
                <View
                  style={[
                    ss.card,
                    { backgroundColor: COLORS.card, ...SHADOWS.small },
                  ]}
                >
                  <Text
                    style={[ss.sectionLabel, { color: COLORS.textTertiary }]}
                  >
                    Create Binding
                  </Text>

                  <ThemedInput
                    label="Username"
                    value={username}
                    onChangeText={setUsername}
                    placeholder="e.g. alice123"
                    iconName="user"
                    iconLib="Feather"
                    COLORS={COLORS}
                  />

                  <ThemedInput
                    label="Email Address"
                    value={email}
                    onChangeText={setEmail}
                    placeholder="e.g. alice@example.com"
                    keyboardType="email-address"
                    iconName="mail"
                    iconLib="Feather"
                    COLORS={COLORS}
                  />

                  {/* Permanent-action warning using theme warning colors */}
                  <View
                    style={{
                      flexDirection: "row",
                      gap: SPACING.sm,
                      backgroundColor: isDark
                        ? COLORS.warning + "18"
                        : COLORS.warning + "12",
                      borderRadius: BORDER_RADIUS.md,
                      padding: SPACING.sm + 2,
                      marginBottom: SPACING.md,
                      borderWidth: 1,
                      borderColor: COLORS.warning + "30",
                    }}
                  >
                    <Feather
                      name="alert-triangle"
                      size={14}
                      color={COLORS.warning}
                      style={{ marginTop: 1 }}
                    />
                    <Text
                      style={{
                        fontSize: FONTS.sizes.xs,
                        color: COLORS.textSecondary,
                        flex: 1,
                        lineHeight: 17,
                      }}
                    >
                      This binding is{" "}
                      <Text style={{ fontWeight: "700", color: COLORS.text }}>
                        permanent
                      </Text>
                      . Each username, email and wallet address can only be
                      linked once.
                    </Text>
                  </View>

                  <PrimaryButton
                    label={`Bind to All ${MAINNET_CHAINS.length} Chains`}
                    onPress={handleBind}
                    loading={loading}
                    disabled={!walletAddress}
                    COLORS={COLORS}
                  />
                </View>
              )}
            </AnimatedCard>

            {/* ── LOOKUP TOOL ── */}
            <AnimatedCard delay={370}>
              <View
                style={[
                  ss.card,
                  { backgroundColor: COLORS.card, ...SHADOWS.small },
                ]}
              >
                <Text style={[ss.sectionLabel, { color: COLORS.textTertiary }]}>
                  Resolve a Wallet
                </Text>

                <ThemedInput
                  label="Username or Email"
                  value={lookupQuery}
                  onChangeText={(v) => {
                    setLookup(v);
                    setLookupRes(null);
                    setLookupErr(null);
                  }}
                  placeholder="e.g. alice123 or alice@example.com"
                  iconName="search"
                  iconLib="Feather"
                  COLORS={COLORS}
                />

                <OutlineButton
                  label="Resolve Wallet Address"
                  onPress={handleLookup}
                  loading={loading}
                  disabled={!lookupQuery.trim()}
                  COLORS={COLORS}
                />

                {/* Result card */}
                {lookupResult && (
                  <View
                    style={[
                      ss.resultCard,
                      {
                        backgroundColor: COLORS.success + "18",
                        borderWidth: 1,
                        borderColor: COLORS.success + "40",
                        marginTop: SPACING.md,
                      },
                    ]}
                  >
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 6,
                        marginBottom: SPACING.sm,
                      }}
                    >
                      <Feather
                        name="check-circle"
                        size={13}
                        color={COLORS.success}
                      />
                      <Text
                        style={[
                          ss.resultLabel,
                          { color: COLORS.success, marginBottom: 0 },
                        ]}
                      >
                        Wallet Found
                      </Text>
                    </View>
                    {[
                      ["Username", `@${lookupResult.username}`],
                      ["Email", lookupResult.email],
                      [
                        "Address",
                        `${lookupResult.wallet_address.slice(0, 10)}···${lookupResult.wallet_address.slice(-8)}`,
                      ],
                    ].map(([k, v], i, arr) => (
                      <View key={k}>
                        <View style={ss.infoRow}>
                          <Text
                            style={[ss.infoKey, { color: COLORS.textTertiary }]}
                          >
                            {k}
                          </Text>
                          <Text style={[ss.infoVal, { color: COLORS.text }]}>
                            {v}
                          </Text>
                        </View>
                        {i < arr.length - 1 && <Divider COLORS={COLORS} />}
                      </View>
                    ))}
                  </View>
                )}

                {/* Error card */}
                {lookupError && (
                  <View
                    style={[
                      ss.resultCard,
                      {
                        backgroundColor: COLORS.error + "12",
                        borderWidth: 1,
                        borderColor: COLORS.error + "35",
                        flexDirection: "row",
                        alignItems: "center",
                        gap: SPACING.sm,
                        marginTop: SPACING.md,
                      },
                    ]}
                  >
                    <Feather name="x-circle" size={18} color={COLORS.error} />
                    <Text
                      style={{
                        fontSize: FONTS.sizes.sm,
                        color: COLORS.error,
                        flex: 1,
                      }}
                    >
                      {lookupError}
                    </Text>
                  </View>
                )}
              </View>
            </AnimatedCard>
          </ScrollView>
        </Animated.View>
      )}
    </KeyboardAvoidingView>
  );
};

export default BindWalletScreen;
