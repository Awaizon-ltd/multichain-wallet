// screens/welcome/WelcomeScreen.js
import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  TouchableOpacity,
  Animated,
  Easing,
  Image,
  SafeAreaView,
  ScrollView,
  StatusBar,
  ActivityIndicator,
  Pressable,
} from "react-native";
import { VideoView, useVideoPlayer } from "expo-video";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../../contexts/ThemeContext";
import { useGoogleAuth } from "../../services/GoogleService";
import {
  restoreMnemonic,
  setGoogleSession,
} from "../../services/cloudBackup";

const { width } = Dimensions.get("window");
const CIRCLE = Math.min(width * 0.42, 170);

// Carousel geometry
const SIDE = 20;
const GAP = 12;
const CARD_W = width - SIDE * 2 - 24; // leaves a peek of the next card
const INTERVAL = CARD_W + GAP;

// ─── Feature highlights ───────────────────────────────────────────────────────
const FEATURES = [
  {
    icon: "sparkles",
    title: "AI assistant",
    text: "Ask in plain language. Get answers, plans and actions for your portfolio.",
  },
  {
    icon: "hardware-chip",
    title: "Agentic wallet",
    text: "Let agents trade, rebalance and manage positions for you, within limits you set.",
  },
  {
    icon: "swap-horizontal",
    title: "Advanced DEX",
    text: "Pro-grade trading tools and deep liquidity, built right into your wallet.",
  },
  {
    icon: "pricetag",
    title: "Low swap fees",
    text: "Keep more of every trade with some of the lowest swap fees around.",
  },
  {
    icon: "repeat",
    title: "Cross-chain",
    text: "Move value between networks in a few taps, with no manual bridging.",
  },
  {
    icon: "layers",
    title: "Top chains",
    text: "All the major networks supported, side by side in one portfolio.",
  },
  {
    icon: "trending-up",
    title: "Stocks & RWA",
    text: "Trade tokenized stocks and real-world assets, onchain, around the clock.",
  },
  {
    icon: "globe",
    title: "Onchain economy",
    text: "Explore apps, assets and yield across the onchain economy.",
  },
];

// ─── Feature card ─────────────────────────────────────────────────────────────
const FeatureCard = ({ item, index, scrollX, COLORS }) => {
  const range = [
    (index - 1) * INTERVAL,
    index * INTERVAL,
    (index + 1) * INTERVAL,
  ];
  const scale = scrollX.interpolate({
    inputRange: range,
    outputRange: [0.93, 1, 0.93],
    extrapolate: "clamp",
  });
  const opacity = scrollX.interpolate({
    inputRange: range,
    outputRange: [0.55, 1, 0.55],
    extrapolate: "clamp",
  });

  return (
    <Animated.View
      style={[
        c.card,
        {
          backgroundColor: COLORS.surface,
          borderColor: COLORS.primary + "30",
          opacity,
          transform: [{ scale }],
        },
      ]}
    >
      {/* Large watermark icon */}
      <Ionicons
        name={item.icon}
        size={150}
        color={COLORS.primary}
        style={c.watermark}
      />

      <View style={[c.iconWrap, { backgroundColor: COLORS.primary }]}>
        <Ionicons name={item.icon} size={30} color="#000" />
      </View>

      <View>
        <Text style={[c.title, { color: COLORS.text }]}>{item.title}</Text>
        <Text style={[c.text, { color: COLORS.textSecondary }]}>
          {item.text}
        </Text>
      </View>
    </Animated.View>
  );
};

const c = StyleSheet.create({
  card: {
    width: CARD_W,
    height: 196,
    borderRadius: 28,
    borderWidth: 1,
    padding: 22,
    justifyContent: "space-between",
    overflow: "hidden",
  },
  watermark: {
    position: "absolute",
    right: -22,
    top: -18,
    opacity: 0.07,
  },
  iconWrap: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: "center",
    justifyContent: "center",
  },
  title: { fontSize: 22, fontWeight: "900", letterSpacing: -0.4 },
  text: { fontSize: 14, lineHeight: 20, marginTop: 4, maxWidth: "92%" },
});

// ─── Main ─────────────────────────────────────────────────────────────────────
const WelcomeScreen = ({ navigation }) => {
  const { COLORS, isDark } = useTheme();
  const [notice, setNotice] = useState("");

  // ── Video (shown in the circle) ──
  const player = useVideoPlayer(require("../../assets/video.mp4"), (p) => {
    p.loop = true;
    p.muted = true;
    p.play();
  });

  // ── Animations ──
  const circleScale = useRef(new Animated.Value(0.85)).current;
  const circleFade = useRef(new Animated.Value(0)).current;
  const bodyFade = useRef(new Animated.Value(0)).current;
  const bodySlide = useRef(new Animated.Value(28)).current;
  const pulse = useRef(new Animated.Value(0)).current;

  // ── Carousel ──
  const scrollX = useRef(new Animated.Value(0)).current;
  const carouselRef = useRef(null);
  const indexRef = useRef(0);
  const pausedUntil = useRef(0);

  useEffect(() => {
    Animated.sequence([
      Animated.parallel([
        Animated.timing(circleFade, {
          toValue: 1,
          duration: 500,
          useNativeDriver: true,
        }),
        Animated.spring(circleScale, {
          toValue: 1,
          friction: 6,
          useNativeDriver: true,
        }),
      ]),
      Animated.parallel([
        Animated.timing(bodyFade, {
          toValue: 1,
          duration: 450,
          useNativeDriver: true,
        }),
        Animated.timing(bodySlide, {
          toValue: 0,
          duration: 420,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]),
    ]).start();

    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 2400,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: 2400,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();

    // Track current card from scroll position
    const id = scrollX.addListener(({ value }) => {
      indexRef.current = Math.round(value / INTERVAL);
    });

    // Auto-advance, paused briefly after the user touches the carousel
    const timer = setInterval(() => {
      if (Date.now() < pausedUntil.current) return;
      const next = (indexRef.current + 1) % FEATURES.length;
      carouselRef.current?.scrollTo({ x: next * INTERVAL, animated: true });
    }, 3800);

    return () => {
      loop.stop();
      scrollX.removeListener(id);
      clearInterval(timer);
    };
  }, []);

  // ── Keep the video playing (resume if it pauses or screen regains focus) ──
  useEffect(() => {
    let active = true;
    const playingSub = player.addListener("playingChange", ({ isPlaying }) => {
      if (!isPlaying && active) player.play();
    });
    const unsubFocus = navigation.addListener("focus", () => {
      active = true;
      player.play();
    });
    const unsubBlur = navigation.addListener("blur", () => {
      active = false;
      player.pause();
    });
    return () => {
      active = false;
      playingSub.remove();
      unsubFocus();
      unsubBlur();
    };
  }, [player, navigation]);

  const haloScale = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.12],
  });
  const haloOpacity = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0.9, 0.35],
  });

  // ── Google sign-up / sign-in ──
  // Signs in to Firebase; with Drive allowed, an existing Rizon backup is
  // decrypted and the wallet restored, otherwise a new wallet is created and
  // backed up. Either way the user finishes in Setup (name + PIN).
  const [driveBackup, setDriveBackup] = useState(true);
  const [googleStage, setGoogleStage] = useState(null); // null | "signin" | "restore"
  const google = useGoogleAuth({ withDrive: driveBackup });

  const flash = (msg) => {
    setNotice(msg);
    setTimeout(() => setNotice(""), 4000);
  };

  const handleGoogle = async () => {
    if (googleStage || !google.ready) return;
    try {
      setGoogleStage("signin");
      const session = await google.signIn();
      if (!session) return; // cancelled

      let restored = null;
      if (session.driveGranted) {
        setGoogleStage("restore");
        try {
          restored = await restoreMnemonic(session);
        } catch (err) {
          // A backup exists but can't be used — say so, and don't silently
          // create a second wallet over the top of it.
          flash(err.message);
          return;
        }
      } else if (driveBackup) {
        flash("Drive access wasn't granted — your wallet won't be backed up.");
      }

      setGoogleSession({ ...session, restored });
      navigation.navigate("Setup", { google: true });
    } catch (err) {
      flash(err?.message || "Google sign-in failed. Please try again.");
    } finally {
      setGoogleStage(null);
    }
  };

  const styles = getStyles(COLORS);

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar
        translucent
        backgroundColor="transparent"
        barStyle={isDark ? "light-content" : "dark-content"}
      />

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Masthead ── */}
        <Text style={styles.appName}></Text>

        {/* ── Video circle ── */}
        <Animated.View
          style={[
            styles.circleStage,
            { opacity: circleFade, transform: [{ scale: circleScale }] },
          ]}
        >
          <Animated.View
            style={[
              styles.halo,
              { opacity: haloOpacity, transform: [{ scale: haloScale }] },
            ]}
          />
          <View style={styles.circleRing}>
            <View style={styles.circleClip}>
              <VideoView
                player={player}
                style={styles.video}
                contentFit="cover"
                nativeControls={false}
                surfaceType="textureView"
                allowsPictureInPicture={false}
              />
            </View>
          </View>

          <View style={styles.logoBadge}>
            <Image
              source={require("../../assets/icon.png")}
              style={styles.logoImg}
              resizeMode="contain"
            />
          </View>
        </Animated.View>

        {/* ── Body ── */}
        <Animated.View
          style={{ opacity: bodyFade, transform: [{ translateY: bodySlide }] }}
        >
          <Text style={styles.headline}>
            The smart wallet for the onchain economy.
          </Text>
          <Text style={styles.sub}>
            Trade, swap and bridge across chains, with AI agents working for
            you.
          </Text>

          {/* ── Feature carousel ── */}
          <Animated.ScrollView
            ref={carouselRef}
            horizontal
            showsHorizontalScrollIndicator={false}
            snapToInterval={INTERVAL}
            snapToAlignment="start"
            decelerationRate="fast"
            contentContainerStyle={styles.carousel}
            scrollEventThrottle={16}
            onScroll={Animated.event(
              [{ nativeEvent: { contentOffset: { x: scrollX } } }],
              { useNativeDriver: true },
            )}
            onScrollBeginDrag={() => {
              pausedUntil.current = Date.now() + 8000;
            }}
          >
            {FEATURES.map((item, i) => (
              <FeatureCard
                key={item.title}
                item={item}
                index={i}
                scrollX={scrollX}
                COLORS={COLORS}
              />
            ))}
          </Animated.ScrollView>

          {/* ── Dots ── */}
          <View style={styles.dots}>
            {FEATURES.map((_, i) => {
              const range = [
                (i - 1) * INTERVAL,
                i * INTERVAL,
                (i + 1) * INTERVAL,
              ];
              const opacity = scrollX.interpolate({
                inputRange: range,
                outputRange: [0.3, 1, 0.3],
                extrapolate: "clamp",
              });
              const scaleX = scrollX.interpolate({
                inputRange: range,
                outputRange: [1, 3, 1],
                extrapolate: "clamp",
              });
              return (
                <Animated.View
                  key={i}
                  style={[styles.dot, { opacity, transform: [{ scaleX }] }]}
                />
              );
            })}
          </View>
        </Animated.View>
      </ScrollView>

      {/* ── Pinned actions ── */}
      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.googleBtn, !google.ready && { opacity: 0.6 }]}
          onPress={handleGoogle}
          disabled={!!googleStage || !google.ready}
          activeOpacity={0.8}
        >
          {googleStage ? (
            <ActivityIndicator size="small" color={COLORS.text} />
          ) : (
            <Ionicons name="logo-google" size={19} color={COLORS.text} />
          )}
          <Text style={styles.googleText}>
            {googleStage === "restore"
              ? "Checking Google Drive for a backup…"
              : googleStage === "signin"
                ? "Signing in…"
                : "Continue with Google"}
          </Text>
        </TouchableOpacity>

        <Pressable
          style={styles.driveRow}
          onPress={() => setDriveBackup((v) => !v)}
          disabled={!!googleStage}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: driveBackup }}
          hitSlop={6}
        >
          <View style={[styles.checkbox, driveBackup && styles.checkboxOn]}>
            {driveBackup && <Ionicons name="checkmark" size={13} color="#000" />}
          </View>
          <Text style={styles.driveText}>
            Back up my wallet to Google Drive (encrypted, restores automatically)
          </Text>
        </Pressable>

        {!!notice && (
          <View style={styles.noticeRow}>
            <Ionicons
              name="information-circle-outline"
              size={14}
              color={COLORS.textSecondary}
            />
            <Text style={styles.noticeText}>{notice}</Text>
          </View>
        )}

        <TouchableOpacity
          style={styles.primaryBtn}
          onPress={() => navigation.navigate("Setup")}
          activeOpacity={0.85}
        >
          <Text style={styles.primaryText}>Others</Text>
          <Ionicons name="arrow-forward" size={20} color="#000" />
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
};

export default WelcomeScreen;

// ─── Theme-aware styles ───────────────────────────────────────────────────────
const getStyles = (COLORS) =>
  StyleSheet.create({
    safe: { flex: 1, backgroundColor: COLORS.background },
    scroll: { flexGrow: 1, paddingTop: 16, paddingBottom: 16 },

    appName: {
      textAlign: "center",
      fontSize: 15,
      fontWeight: "800",
      color: COLORS.text,
      letterSpacing: 1.5,
    },

    // Circle
    circleStage: {
      alignSelf: "center",
      alignItems: "center",
      justifyContent: "center",
      width: CIRCLE * 1.35,
      height: CIRCLE * 1.35,
      marginTop: 6,
      marginBottom: 8,
    },
    halo: {
      position: "absolute",
      width: CIRCLE * 1.25,
      height: CIRCLE * 1.25,
      borderRadius: CIRCLE,
      backgroundColor: COLORS.primary + "22",
    },
    circleRing: {
      width: CIRCLE + 12,
      height: CIRCLE + 12,
      borderRadius: (CIRCLE + 12) / 2,
      borderWidth: 2,
      borderColor: COLORS.primary,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: COLORS.background,
    },
    circleClip: {
      width: CIRCLE,
      height: CIRCLE,
      borderRadius: CIRCLE / 2,
      overflow: "hidden",
      backgroundColor: COLORS.surface,
    },
    video: { width: CIRCLE, height: CIRCLE },
    logoBadge: {
      position: "absolute",
      right: CIRCLE * 0.1,
      bottom: CIRCLE * 0.12,
      width: 42,
      height: 42,
      borderRadius: 21,
      backgroundColor: COLORS.surface,
      borderWidth: 3,
      borderColor: COLORS.background,
      alignItems: "center",
      justifyContent: "center",
    },
    logoImg: { width: 24, height: 24 },

    // Copy
    headline: {
      fontSize: 27,
      lineHeight: 32,
      fontWeight: "900",
      letterSpacing: -0.8,
      textAlign: "center",
      color: COLORS.text,
      paddingHorizontal: 28,
    },
    sub: {
      fontSize: 14,
      lineHeight: 21,
      textAlign: "center",
      color: COLORS.textSecondary,
      marginTop: 8,
      marginBottom: 22,
      paddingHorizontal: 28,
    },

    // Carousel
    carousel: { paddingHorizontal: SIDE, gap: GAP, paddingVertical: 4 },
    dots: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
      marginTop: 14,
    },
    dot: {
      width: 6,
      height: 6,
      borderRadius: 3,
      backgroundColor: COLORS.primary,
    },

    // Footer actions
    footer: {
      paddingHorizontal: 20,
      paddingTop: 12,
      paddingBottom: 16,
      gap: 10,
      backgroundColor: COLORS.background,
      borderTopWidth: 1,
      borderTopColor: COLORS.primary + "18",
    },
    googleBtn: {
      height: 54,
      borderRadius: 27,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 10,
      backgroundColor: COLORS.surface,
      borderWidth: 1,
      borderColor: COLORS.border,
    },
    googleText: { fontSize: 15, fontWeight: "700", color: COLORS.text },
    driveRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      paddingHorizontal: 6,
    },
    checkbox: {
      width: 18,
      height: 18,
      borderRadius: 5,
      borderWidth: 1.5,
      borderColor: COLORS.border,
      alignItems: "center",
      justifyContent: "center",
    },
    checkboxOn: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
    driveText: { flex: 1, fontSize: 12, lineHeight: 16, color: COLORS.textSecondary },
    noticeRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 5,
    },
    noticeText: { fontSize: 12, color: COLORS.textSecondary },
    primaryBtn: {
      height: 54,
      borderRadius: 27,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      backgroundColor: COLORS.primary,
    },
    primaryText: { fontSize: 16, fontWeight: "800", color: "#000" },
  });
