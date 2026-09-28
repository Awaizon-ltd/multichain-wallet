// screens/welcome/WelcomeScreen.js
import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  TouchableOpacity,
  Animated,
  Image,
  SafeAreaView,
  StatusBar,
} from "react-native";
import { VideoView, useVideoPlayer } from "expo-video";
import { BlurView } from "expo-blur";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../../contexts/ThemeContext";

const { width, height } = Dimensions.get("window");

// ─── Pill stat item ───────────────────────────────────────────────────────────
const StatPill = ({ label, COLORS }) => (
  <View style={[pill.wrap, { borderColor: "rgba(247,200,74,0.22)" }]}>
    <Text style={[pill.text, { color: COLORS.textSecondary }]}>{label}</Text>
  </View>
);
const pill = StyleSheet.create({
  wrap: {
    paddingVertical: 5,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
  },
  text: {
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },
});

// ─── Main ─────────────────────────────────────────────────────────────────────
const WelcomeScreen = ({ navigation }) => {
  const { COLORS, isDark } = useTheme();

  // ── Video ─────────────────────────────────────────────────────────────────
  const player = useVideoPlayer(require("../../assets/video.mp4"), (p) => {
    p.loop = true;
    p.muted = true;
    p.play();
  });

  // ── Animation refs ────────────────────────────────────────────────────────
  const overlayFade = useRef(new Animated.Value(0)).current; // dark overlay
  const logoFade = useRef(new Animated.Value(0)).current;
  const logoSlide = useRef(new Animated.Value(-20)).current;
  const panelSlide = useRef(new Animated.Value(120)).current; // bottom panel
  const panelFade = useRef(new Animated.Value(0)).current;
  const headlineFade = useRef(new Animated.Value(0)).current;
  const headlineSlide = useRef(new Animated.Value(18)).current;
  const subFade = useRef(new Animated.Value(0)).current;
  const btnFade = useRef(new Animated.Value(0)).current;
  const btnScale = useRef(new Animated.Value(0.94)).current;
  const scanAnim = useRef(new Animated.Value(0)).current; // amber scan line
  const glowPulse = useRef(new Animated.Value(0.55)).current;

  // ── Mounted state to handle scan loop ────────────────────────────────────
  const mounted = useRef(true);
  useEffect(() => {
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    // Staggered entry
    Animated.sequence([
      // 1. Overlay dims the video slightly
      Animated.timing(overlayFade, {
        toValue: 1,
        duration: 700,
        useNativeDriver: true,
      }),
      // 2. Logo slides in from top
      Animated.parallel([
        Animated.timing(logoFade, {
          toValue: 1,
          duration: 500,
          useNativeDriver: true,
        }),
        Animated.timing(logoSlide, {
          toValue: 0,
          duration: 460,
          useNativeDriver: true,
        }),
      ]),
      // 3. Panel rises
      Animated.parallel([
        Animated.timing(panelSlide, {
          toValue: 0,
          duration: 540,
          useNativeDriver: true,
        }),
        Animated.timing(panelFade, {
          toValue: 1,
          duration: 500,
          useNativeDriver: true,
        }),
      ]),
      // 4. Headline appears
      Animated.parallel([
        Animated.timing(headlineFade, {
          toValue: 1,
          duration: 400,
          useNativeDriver: true,
        }),
        Animated.timing(headlineSlide, {
          toValue: 0,
          duration: 380,
          useNativeDriver: true,
        }),
      ]),
      // 5. Sub + button
      Animated.parallel([
        Animated.timing(subFade, {
          toValue: 1,
          duration: 360,
          useNativeDriver: true,
        }),
        Animated.timing(btnFade, {
          toValue: 1,
          duration: 360,
          useNativeDriver: true,
        }),
        Animated.timing(btnScale, {
          toValue: 1,
          duration: 400,
          useNativeDriver: true,
        }),
      ]),
    ]).start();

    // Ambient amber glow pulse on the edge line
    Animated.loop(
      Animated.sequence([
        Animated.timing(glowPulse, {
          toValue: 1,
          duration: 2200,
          useNativeDriver: true,
        }),
        Animated.timing(glowPulse, {
          toValue: 0.45,
          duration: 2200,
          useNativeDriver: true,
        }),
      ]),
    ).start();

    // Horizontal scan line that sweeps across the panel periodically
    const runScan = () => {
      if (!mounted.current) return;
      scanAnim.setValue(0);
      Animated.timing(scanAnim, {
        toValue: 1,
        duration: 1800,
        useNativeDriver: true,
      }).start(() => {
        if (mounted.current) setTimeout(runScan, 4000);
      });
    };
    setTimeout(runScan, 2600);
  }, []);

  const scanTranslateX = scanAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [-width, width * 1.2],
  });

  const glowOpacity = glowPulse;

  return (
    <View style={s.root}>
      <StatusBar
        translucent
        backgroundColor="transparent"
        barStyle="light-content"
      />

      {/* ── Full-bleed video ── */}
      <VideoView
        player={player}
        style={s.video}
        contentFit="cover"
        nativeControls={false}
      />

      {/* ── Ambient dark gradient overlay (bottom-weighted) ── */}
      <Animated.View style={[s.overlay, { opacity: overlayFade }]}>
        {/* Top: very thin scrim so logo reads */}
        <View style={s.overlayTop} />
        {/* Bottom: heavy black to anchor the panel */}
        <View style={s.overlayBottom} />
      </Animated.View>

      {/* ── Safe area content ── */}
      <SafeAreaView style={s.safe}>
        {/* ── Logo / masthead — top left ── */}
        <Animated.View
          style={[
            s.masthead,
            { opacity: logoFade, transform: [{ translateY: logoSlide }] },
          ]}
        >
          <View style={[s.logoMark, { borderColor: "rgba(247,200,74,0.35)" }]}>
            <Image
              source={require("../../assets/icon.png")}
              style={s.logoImg}
              resizeMode="contain"
            />
          </View>
          <Text style={s.appName}>Awarizon</Text>
        </Animated.View>

        {/* ── Spacer pushes panel to bottom ── */}
        <View style={{ flex: 1 }} />

        {/* ── Bottom vault panel ── */}
        <Animated.View
          style={[
            s.panel,
            {
              opacity: panelFade,
              transform: [{ translateY: panelSlide }],
            },
          ]}
        >
          {/* Glowing amber top edge — THE signature element */}
          <Animated.View style={[s.edgeLine, { opacity: glowOpacity }]} />
          {/* Solid 1 px line always visible */}
          <View style={s.edgeLineSolid} />

          {/* Scan shimmer that crosses the top edge */}
          <Animated.View
            style={[
              s.scanLine,
              { transform: [{ translateX: scanTranslateX }] },
            ]}
          />

          <BlurView
            intensity={isDark ? 28 : 22}
            tint="dark"
            style={s.panelBlur}
          >
            <View
              style={[s.panelInner, { backgroundColor: "rgba(10,8,4,0.82)" }]}
            >
              {/* Micro-label */}
              <Text style={[s.microLabel, { color: COLORS.primary }]}>
                NON-CUSTODIAL WALLET
              </Text>

              {/* Headline */}
              <Animated.View
                style={{
                  opacity: headlineFade,
                  transform: [{ translateY: headlineSlide }],
                }}
              >
                <Text style={s.headline}>
                  Own the{"\n"}
                  <Text style={{ color: "#F7C84A" }}>chain.</Text>
                </Text>
              </Animated.View>

              {/* Sub */}
              <Animated.Text
                style={[
                  s.sub,
                  { color: COLORS.textSecondary, opacity: subFade },
                ]}
              >
                Your keys, your assets — secured locally, never shared.
              </Animated.Text>

              {/* Stat pills */}
              <Animated.View style={[s.pillRow, { opacity: subFade }]}>
                <StatPill label="256-bit AES" COLORS={COLORS} />
                <StatPill label="Multi-chain" COLORS={COLORS} />
                <StatPill label="Open source" COLORS={COLORS} />
              </Animated.View>

              {/* CTA */}
              <Animated.View
                style={{
                  opacity: btnFade,
                  transform: [{ scale: btnScale }],
                  marginTop: 24,
                }}
              >
                <TouchableOpacity
                  style={s.cta}
                  onPress={() => navigation.navigate("Setup")}
                  activeOpacity={0.82}
                >
                  <View style={s.ctaInner}>
                    <Text style={s.ctaText}>Get Started</Text>
                    <View style={s.ctaArrow}>
                      <Ionicons
                        name="arrow-forward"
                        size={18}
                        color="#0A0804"
                      />
                    </View>
                  </View>
                </TouchableOpacity>
              </Animated.View>

              {/* Bottom note */}
              <Animated.View style={[s.noteRow, { opacity: subFade }]}>
                <Ionicons
                  name="shield-checkmark"
                  size={12}
                  color="#F7C84A"
                  style={{ opacity: 0.7 }}
                />
                <Text style={s.note}>No account. No cloud. 100% local.</Text>
              </Animated.View>
            </View>
          </BlurView>
        </Animated.View>
      </SafeAreaView>
    </View>
  );
};

export default WelcomeScreen;

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#000",
  },
  video: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width,
    height,
  },

  // Overlay — two-layer gradient simulation
  overlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  overlayTop: {
    flex: 1,
    backgroundColor: "transparent",
  },
  overlayBottom: {
    height: height * 0.62,
    // Deep black fade from below
    backgroundColor: "rgba(4,3,2,0.72)",
  },

  safe: {
    flex: 1,
  },

  // Masthead
  masthead: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 22,
    paddingTop: 14,
  },
  logoMark: {
    width: 38,
    height: 38,
    borderRadius: 10,
    borderWidth: 1.5,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(15,12,6,0.55)",
  },
  logoImg: {
    width: 26,
    height: 26,
  },
  appName: {
    fontSize: 17,
    fontWeight: "800",
    color: "#F5EDD8",
    letterSpacing: 1.8,
    textTransform: "uppercase",
  },

  // Panel
  panel: {
    width: "100%",
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
    overflow: "hidden",
    position: "relative",
  },

  // Amber edge
  edgeLineSolid: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 1.5,
    backgroundColor: "#F7C84A",
    zIndex: 10,
  },
  edgeLine: {
    position: "absolute",
    top: -6,
    left: 0,
    right: 0,
    height: 14,
    backgroundColor: "#F7C84A",
    zIndex: 9,
    // Glow achieved via shadow
    shadowColor: "#F7C84A",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 14,
    elevation: 0,
  },

  // Scan shimmer
  scanLine: {
    position: "absolute",
    top: -2,
    left: 0,
    width: 80,
    height: 6,
    backgroundColor: "rgba(255, 220, 100, 0.55)",
    zIndex: 11,
    borderRadius: 3,
    shadowColor: "#FFD966",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 8,
  },

  panelBlur: { width: "100%" },
  panelInner: {
    paddingTop: 28,
    paddingBottom: 32,
    paddingHorizontal: 26,
  },

  microLabel: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 2.4,
    marginBottom: 14,
    opacity: 0.9,
  },

  headline: {
    fontSize: 52,
    fontWeight: "900",
    color: "#F5EDD8",
    letterSpacing: -1.5,
    lineHeight: 54,
    marginBottom: 16,
  },

  sub: {
    fontSize: 14,
    lineHeight: 21,
    fontWeight: "400",
    letterSpacing: 0.1,
    marginBottom: 20,
  },

  pillRow: {
    flexDirection: "row",
    gap: 8,
    flexWrap: "wrap",
  },

  // CTA
  cta: {
    borderRadius: 4,
    overflow: "hidden",
    backgroundColor: "#F7C84A",
    shadowColor: "#F7C84A",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 8,
  },
  ctaInner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 17,
    paddingHorizontal: 24,
  },
  ctaText: {
    fontSize: 16,
    fontWeight: "900",
    color: "#0A0804",
    letterSpacing: 0.4,
  },
  ctaArrow: {
    width: 32,
    height: 32,
    borderRadius: 2,
    backgroundColor: "rgba(10,8,4,0.12)",
    alignItems: "center",
    justifyContent: "center",
  },

  // Note
  noteRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 18,
    justifyContent: "center",
  },
  note: {
    fontSize: 11,
    color: "rgba(197,168,100,0.65)",
    fontWeight: "500",
    letterSpacing: 0.3,
  },
});
