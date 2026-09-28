// screens/WalletSetupScreen.js
import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  TouchableOpacity,
  Clipboard,
  Modal,
  ActivityIndicator,
  Animated,
  SafeAreaView,
  Vibration,
  TextInput,
  Dimensions,
} from "react-native";
import { BlurView } from "expo-blur";
import { Ionicons } from "@expo/vector-icons";
import { useWallet } from "../../contexts/WalletContext";
import { useTheme } from "../../contexts/ThemeContext";
import { isValidMnemonic } from "../../utils/Wallet";
import Alert from "../../utils/Alert";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

// ─── PIN length ───────────────────────────────────────────────────────────────
const PIN_LENGTH = 6;

// ─── PinKeypadModal ───────────────────────────────────────────────────────────
// Reusable full-screen modal keypad — same feel as PasscodeScreen
const PinKeypadModal = ({
  visible,
  title,
  subtitle,
  onComplete,
  onClose,
  COLORS,
  isDark,
}) => {
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const shakeAnim = useRef(new Animated.Value(0)).current;
  const dotsScale = useRef(
    Array.from({ length: PIN_LENGTH }, () => new Animated.Value(1)),
  ).current;

  // Reset on open
  useEffect(() => {
    if (visible) {
      setPin("");
      setError("");
    }
  }, [visible]);

  // Auto-submit when full
  useEffect(() => {
    if (pin.length === PIN_LENGTH) {
      onComplete(pin, () => {
        // Error callback — shake and clear
        Vibration.vibrate(400);
        triggerShake();
        setTimeout(() => setPin(""), 500);
        setError("PINs do not match. Try again.");
      });
    }
  }, [pin]);

  const triggerShake = () => {
    Animated.sequence([
      Animated.timing(shakeAnim, {
        toValue: 10,
        duration: 60,
        useNativeDriver: true,
      }),
      Animated.timing(shakeAnim, {
        toValue: -10,
        duration: 60,
        useNativeDriver: true,
      }),
      Animated.timing(shakeAnim, {
        toValue: 8,
        duration: 60,
        useNativeDriver: true,
      }),
      Animated.timing(shakeAnim, {
        toValue: -8,
        duration: 60,
        useNativeDriver: true,
      }),
      Animated.timing(shakeAnim, {
        toValue: 0,
        duration: 60,
        useNativeDriver: true,
      }),
    ]).start();
  };

  const handlePress = (key) => {
    setError("");
    if (key === "del") {
      setPin((p) => p.slice(0, -1));
      return;
    }
    if (pin.length < PIN_LENGTH) {
      const next = pin + key;
      setPin(next);
      // Pop the dot
      const idx = next.length - 1;
      Animated.sequence([
        Animated.timing(dotsScale[idx], {
          toValue: 1.35,
          duration: 80,
          useNativeDriver: true,
        }),
        Animated.timing(dotsScale[idx], {
          toValue: 1,
          duration: 80,
          useNativeDriver: true,
        }),
      ]).start();
    }
  };

  const KEYS = [
    ["1", "2", "3"],
    ["4", "5", "6"],
    ["7", "8", "9"],
    [null, "0", "del"],
  ];

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      statusBarTranslucent
    >
      <BlurView
        intensity={isDark ? 90 : 70}
        tint={isDark ? "dark" : "light"}
        style={{ flex: 1 }}
      >
        <SafeAreaView
          style={[
            s.pinModal,
            {
              backgroundColor: isDark
                ? "rgba(0,0,0,0.6)"
                : "rgba(253,248,238,0.85)",
            },
          ]}
        >
          {/* Close */}
          {onClose && (
            <TouchableOpacity
              style={s.pinCloseBtn}
              onPress={onClose}
              activeOpacity={0.7}
            >
              <Ionicons name="close" size={22} color={COLORS.textSecondary} />
            </TouchableOpacity>
          )}

          {/* Title block */}
          <View style={s.pinHeader}>
            <View style={[s.pinIconRing, { borderColor: COLORS.primary }]}>
              <Ionicons name="lock-closed" size={28} color={COLORS.primary} />
            </View>
            <Text style={[s.pinTitle, { color: COLORS.text }]}>{title}</Text>
            {subtitle ? (
              <Text style={[s.pinSubtitle, { color: COLORS.textSecondary }]}>
                {subtitle}
              </Text>
            ) : null}
          </View>

          {/* Dots */}
          <Animated.View
            style={[s.pinDots, { transform: [{ translateX: shakeAnim }] }]}
          >
            {Array.from({ length: PIN_LENGTH }).map((_, i) => (
              <Animated.View
                key={i}
                style={[
                  s.pinDot,
                  {
                    borderColor: COLORS.primary,
                    backgroundColor:
                      i < pin.length ? COLORS.primary : "transparent",
                    transform: [{ scale: dotsScale[i] }],
                  },
                ]}
              />
            ))}
          </Animated.View>

          {/* Error */}
          <View style={s.pinErrorRow}>
            {error ? (
              <>
                <Ionicons name="alert-circle" size={14} color={COLORS.error} />
                <Text style={[s.pinErrorText, { color: COLORS.error }]}>
                  {error}
                </Text>
              </>
            ) : null}
          </View>

          {/* Keypad */}
          <View style={s.keypad}>
            {KEYS.map((row, ri) => (
              <View key={ri} style={s.keypadRow}>
                {row.map((key, ki) => {
                  if (key === null) return <View key={ki} style={s.keyBtn} />;
                  if (key === "del")
                    return (
                      <TouchableOpacity
                        key={ki}
                        style={[s.keyBtn, { backgroundColor: COLORS.surface }]}
                        onPress={() => handlePress("del")}
                        activeOpacity={0.65}
                      >
                        <Ionicons
                          name="backspace-outline"
                          size={26}
                          color={COLORS.text}
                        />
                      </TouchableOpacity>
                    );
                  return (
                    <TouchableOpacity
                      key={ki}
                      style={[s.keyBtn, { backgroundColor: COLORS.surface }]}
                      onPress={() => handlePress(key)}
                      activeOpacity={0.65}
                    >
                      <Text style={[s.keyText, { color: COLORS.text }]}>
                        {key}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            ))}
          </View>
        </SafeAreaView>
      </BlurView>
    </Modal>
  );
};

// ─── ProgressModal ────────────────────────────────────────────────────────────
const STAGE_META = {
  generating: { label: "Creating Wallet", icon: "sparkles-outline" },
  importing: { label: "Restoring Wallet", icon: "cloud-download-outline" },
  encrypting: { label: "Encrypting", icon: "shield-checkmark-outline" },
  deriving: { label: "Securing Keys", icon: "lock-closed-outline" },
  saving: { label: "Saving", icon: "save-outline" },
  complete: { label: "Done", icon: "checkmark-circle-outline" },
};

const ProgressModal = ({ visible, stage, COLORS, isDark }) => {
  const progressAnim = useRef(new Animated.Value(0)).current;
  const spinAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      progressAnim.setValue(0);
      Animated.timing(progressAnim, {
        toValue: 0.85,
        duration: 3200,
        useNativeDriver: false,
      }).start();
      Animated.loop(
        Animated.timing(spinAnim, {
          toValue: 1,
          duration: 1400,
          useNativeDriver: true,
        }),
      ).start();
    } else {
      spinAnim.stopAnimation();
    }
  }, [visible]);

  const meta = STAGE_META[stage] || {
    label: "Processing…",
    icon: "hourglass-outline",
  };
  const barWidth = progressAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ["0%", "100%"],
  });
  const spin = spinAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "360deg"],
  });

  if (!visible) return null;

  return (
    <Modal visible transparent animationType="fade" statusBarTranslucent>
      <BlurView
        intensity={isDark ? 85 : 65}
        tint={isDark ? "dark" : "light"}
        style={{ flex: 1 }}
      >
        <View style={s.progressOverlay}>
          <View
            style={[
              s.progressCard,
              { backgroundColor: COLORS.surface, borderColor: COLORS.border },
            ]}
          >
            {/* Spinner ring */}
            <View style={[s.spinnerRing, { borderColor: COLORS.primaryMuted }]}>
              <Animated.View style={{ transform: [{ rotate: spin }] }}>
                <Ionicons name={meta.icon} size={38} color={COLORS.primary} />
              </Animated.View>
            </View>

            <Text style={[s.progressLabel, { color: COLORS.text }]}>
              {meta.label}
            </Text>
            <Text style={[s.progressSub, { color: COLORS.textSecondary }]}>
              Please don't close the app
            </Text>

            {/* Progress bar */}
            <View
              style={[
                s.progressTrack,
                { backgroundColor: COLORS.primaryMuted },
              ]}
            >
              <Animated.View
                style={[
                  s.progressFill,
                  { width: barWidth, backgroundColor: COLORS.primary },
                ]}
              />
            </View>

            <ActivityIndicator
              size="small"
              color={COLORS.primary}
              style={{ marginTop: 16 }}
            />
          </View>
        </View>
      </BlurView>
    </Modal>
  );
};

// ─── Main component ───────────────────────────────────────────────────────────
const WalletSetupScreen = ({ navigation }) => {
  const theme = useTheme();
  const { COLORS, isDark, SPACING, FONTS, BORDER_RADIUS } = theme;
  const { createWallet, importWallet, loading, encryptionProgress } =
    useWallet();

  // ── View state ────────────────────────────────────────────────────────────
  const [mode, setMode] = useState(null); // null | 'create' | 'import'
  const [walletName, setWalletName] = useState("");
  const [mnemonic, setMnemonic] = useState("");
  const [nameError, setNameError] = useState("");
  const [mnemonicError, setMnemonicError] = useState("");

  // ── PIN modal state ───────────────────────────────────────────────────────
  const [pinStep, setPinStep] = useState(null); // null | 'enter' | 'confirm'
  const [firstPin, setFirstPin] = useState("");

  // ── Post-create ───────────────────────────────────────────────────────────
  const [generatedMnemonic, setGeneratedMnemonic] = useState("");
  const [copied, setCopied] = useState(false);

  // ── Progress modal ────────────────────────────────────────────────────────
  const [progressStage, setProgressStage] = useState("generating");
  const showProgress = !!encryptionProgress;

  useEffect(() => {
    if (encryptionProgress?.stage) setProgressStage(encryptionProgress.stage);
  }, [encryptionProgress]);

  // ── Entry animation ───────────────────────────────────────────────────────
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(32)).current;

  useEffect(() => {
    fadeAnim.setValue(0);
    slideAnim.setValue(32);
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 420,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 380,
        useNativeDriver: true,
      }),
    ]).start();
  }, [mode, generatedMnemonic]);

  // ── Validation before opening PIN modal ──────────────────────────────────
  const openPinFlow = () => {
    let valid = true;
    if (!walletName.trim()) {
      setNameError("Wallet name is required");
      valid = false;
    } else setNameError("");
    if (mode === "import") {
      if (!isValidMnemonic(mnemonic.trim())) {
        setMnemonicError("Invalid recovery phrase");
        valid = false;
      } else setMnemonicError("");
    }
    if (valid) setPinStep("enter");
  };

  // ── PIN flow handlers ─────────────────────────────────────────────────────
  const handleFirstPin = (pin, onError) => {
    // No error possible on first entry — just store and advance
    setFirstPin(pin);
    setPinStep("confirm");
  };

  const handleConfirmPin = async (pin, onError) => {
    if (pin !== firstPin) {
      onError();
      return;
    }
    setPinStep(null);
    try {
      if (mode === "create") {
        const result = await createWallet(pin, walletName.trim());
        setGeneratedMnemonic(result.mnemonic);
        Alert.alert(
          "Important",
          "Write down your recovery phrase and keep it safe.",
          [{ text: "Got it" }],
        );
      } else {
        await importWallet(mnemonic.trim(), pin, walletName.trim());
        Alert.alert("Success", "Wallet imported successfully!");
        navigation.replace("Home");
      }
    } catch (err) {
      Alert.alert(
        "Error",
        mode === "create"
          ? "Failed to create wallet. Please try again."
          : "Failed to import wallet. Check your recovery phrase.",
      );
    }
  };

  // ── Copy mnemonic ─────────────────────────────────────────────────────────
  const handleCopy = () => {
    Clipboard.setString(generatedMnemonic);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // ── Styles (inline, theme-aware) ──────────────────────────────────────────
  const themed = {
    safeArea: { flex: 1, backgroundColor: COLORS.background },
    screen: { flex: 1 },
    scroll: { flexGrow: 1, padding: SPACING.lg },

    // Chip label above options
    chipLabel: {
      fontSize: FONTS.sizes.xs,
      fontWeight: "700",
      color: COLORS.primary,
      letterSpacing: 1.5,
      textTransform: "uppercase",
      marginBottom: SPACING.sm,
    },

    // Hero headline
    heroTitle: {
      fontSize: FONTS.sizes.xxxl,
      fontWeight: "900",
      color: COLORS.text,
      letterSpacing: -1,
      lineHeight: FONTS.sizes.xxxl * 1.12,
    },
    heroAccent: { color: COLORS.primary },
    heroSub: {
      fontSize: FONTS.sizes.md,
      color: COLORS.textSecondary,
      marginTop: SPACING.sm,
      lineHeight: FONTS.sizes.md * 1.6,
    },

    // Cards
    modeCard: {
      borderRadius: BORDER_RADIUS.xl,
      borderWidth: 1,
      borderColor: COLORS.border,
      backgroundColor: COLORS.surface,
      marginBottom: SPACING.md,
      overflow: "hidden",
    },
    modeCardInner: {
      padding: SPACING.lg,
      flexDirection: "row",
      alignItems: "center",
      gap: SPACING.md,
    },
    modeIconBox: {
      width: 52,
      height: 52,
      borderRadius: BORDER_RADIUS.md,
      backgroundColor: COLORS.primaryMuted,
      alignItems: "center",
      justifyContent: "center",
    },
    modeTitle: {
      fontSize: FONTS.sizes.lg,
      fontWeight: "800",
      color: COLORS.text,
    },
    modeSub: {
      fontSize: FONTS.sizes.sm,
      color: COLORS.textSecondary,
      marginTop: 3,
      lineHeight: 19,
    },

    // Badge
    badge: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: COLORS.primaryMuted,
      paddingVertical: 10,
      paddingHorizontal: 18,
      borderRadius: BORDER_RADIUS.round,
      gap: 7,
      alignSelf: "center",
      marginTop: SPACING.md,
    },
    badgeText: {
      fontSize: FONTS.sizes.xs,
      fontWeight: "700",
      color: COLORS.primaryDark,
      letterSpacing: 0.4,
    },

    // Form
    backRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: SPACING.sm,
      marginBottom: SPACING.xl,
    },
    backBtnBox: {
      width: 40,
      height: 40,
      borderRadius: BORDER_RADIUS.md,
      borderWidth: 1,
      borderColor: COLORS.border,
      backgroundColor: COLORS.surface,
      alignItems: "center",
      justifyContent: "center",
    },
    formTitle: {
      fontSize: FONTS.sizes.xxl,
      fontWeight: "900",
      color: COLORS.text,
      letterSpacing: -0.5,
    },
    formSub: {
      fontSize: FONTS.sizes.sm,
      color: COLORS.textSecondary,
      marginTop: 3,
    },

    fieldLabel: {
      fontSize: FONTS.sizes.xs,
      fontWeight: "700",
      color: COLORS.textSecondary,
      textTransform: "uppercase",
      letterSpacing: 1,
      marginBottom: SPACING.xs,
    },
    fieldWrap: {
      borderRadius: BORDER_RADIUS.lg,
      borderWidth: 1,
      borderColor: COLORS.border,
      backgroundColor: COLORS.surface,
      marginBottom: SPACING.md,
    },
    fieldWrapErr: { borderColor: COLORS.error },
    fieldInput: {
      paddingHorizontal: SPACING.md,
      paddingVertical: 14,
      fontSize: FONTS.sizes.md,
      color: COLORS.text,
    },
    fieldErr: {
      fontSize: FONTS.sizes.xs,
      color: COLORS.error,
      marginBottom: SPACING.sm,
      marginTop: -SPACING.xs + 2,
    },

    pinSummaryRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: SPACING.sm,
      backgroundColor: COLORS.primaryMuted,
      borderRadius: BORDER_RADIUS.lg,
      padding: SPACING.md,
      marginBottom: SPACING.md,
    },
    pinSummaryText: {
      flex: 1,
      fontSize: FONTS.sizes.sm,
      color: COLORS.primaryDark,
      fontWeight: "600",
    },

    actionBtn: {
      backgroundColor: COLORS.primary,
      borderRadius: BORDER_RADIUS.lg,
      paddingVertical: 16,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: SPACING.sm,
    },
    actionBtnText: {
      fontSize: FONTS.sizes.md,
      fontWeight: "800",
      color: COLORS.background,
      letterSpacing: 0.3,
    },
    outlineBtn: {
      borderRadius: BORDER_RADIUS.lg,
      paddingVertical: 16,
      alignItems: "center",
      borderWidth: 1,
      borderColor: COLORS.border,
      backgroundColor: COLORS.surface,
    },
    outlineBtnText: {
      fontSize: FONTS.sizes.md,
      fontWeight: "700",
      color: COLORS.textSecondary,
    },

    // Mnemonic success
    successCrown: { alignItems: "center", marginBottom: SPACING.xl },
    crownRing: {
      width: 88,
      height: 88,
      borderRadius: 44,
      borderWidth: 2,
      borderColor: COLORS.primary,
      backgroundColor: COLORS.primaryMuted,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: SPACING.md,
    },
    successTitle: {
      fontSize: FONTS.sizes.xxl,
      fontWeight: "900",
      color: COLORS.text,
      letterSpacing: -0.5,
    },
    successSub: {
      fontSize: FONTS.sizes.sm,
      color: COLORS.textSecondary,
      marginTop: 4,
      textAlign: "center",
    },

    phraseCard: {
      backgroundColor: COLORS.surface,
      borderRadius: BORDER_RADIUS.xl,
      borderWidth: 1,
      borderColor: COLORS.border,
      padding: SPACING.lg,
      marginBottom: SPACING.lg,
    },
    phraseHdr: {
      flexDirection: "row",
      alignItems: "center",
      gap: SPACING.sm,
      marginBottom: SPACING.lg,
    },
    phraseTitleT: {
      fontSize: FONTS.sizes.md,
      fontWeight: "800",
      color: COLORS.text,
    },
    phraseSubT: { fontSize: FONTS.sizes.xs, color: COLORS.textSecondary },

    wordGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
      marginBottom: SPACING.lg,
    },
    wordChip: {
      flexDirection: "row",
      alignItems: "center",
      gap: 7,
      paddingVertical: 9,
      paddingHorizontal: 11,
      borderRadius: BORDER_RADIUS.md,
      borderWidth: 1,
      borderColor: COLORS.border,
      backgroundColor: COLORS.background,
      width: (SCREEN_WIDTH - SPACING.lg * 2 - SPACING.lg * 2 - 8 * 2) / 3,
    },
    wordNum: {
      width: 18,
      height: 18,
      borderRadius: 9,
      backgroundColor: COLORS.primaryMuted,
      alignItems: "center",
      justifyContent: "center",
    },
    wordNumT: { fontSize: 9, fontWeight: "800", color: COLORS.primaryDark },
    wordT: { fontSize: 12, fontWeight: "600", color: COLORS.text, flex: 1 },

    copyBtn: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: SPACING.sm,
      paddingVertical: 14,
      borderRadius: BORDER_RADIUS.md,
      borderWidth: 1,
      borderColor: COLORS.border,
      backgroundColor: COLORS.primaryMuted,
    },
    copyBtnActive: {
      backgroundColor: COLORS.success,
      borderColor: COLORS.success,
    },
    copyBtnText: {
      fontSize: FONTS.sizes.sm,
      fontWeight: "700",
      color: COLORS.primaryDark,
    },
    copyBtnTextA: { color: "#FFF" },

    warnBox: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: SPACING.sm,
      backgroundColor: isDark ? "rgba(255,109,0,0.12)" : "rgba(230,81,0,0.08)",
      borderRadius: BORDER_RADIUS.lg,
      padding: SPACING.md,
      marginBottom: SPACING.lg,
      borderWidth: 1,
      borderColor: isDark ? "rgba(255,109,0,0.25)" : "rgba(230,81,0,0.2)",
    },
    warnTitle: {
      fontSize: FONTS.sizes.sm,
      fontWeight: "800",
      color: COLORS.warning,
      marginBottom: 3,
    },
    warnText: {
      fontSize: FONTS.sizes.xs,
      color: COLORS.warning,
      lineHeight: 17,
    },

    continueBtn: {
      backgroundColor: COLORS.primary,
      borderRadius: BORDER_RADIUS.lg,
      paddingVertical: 16,
      alignItems: "center",
    },
    continueBtnT: {
      fontSize: FONTS.sizes.md,
      fontWeight: "800",
      color: COLORS.background,
    },
  };

  // ──────────────────────────────────────────────────────────────────────────
  // Mnemonic Success Screen
  // ──────────────────────────────────────────────────────────────────────────
  if (generatedMnemonic) {
    return (
      <SafeAreaView style={themed.safeArea}>
        <Animated.ScrollView
          contentContainerStyle={themed.scroll}
          showsVerticalScrollIndicator={false}
          style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}
        >
          <View style={themed.successCrown}>
            <View style={themed.crownRing}>
              <Ionicons name="checkmark" size={40} color={COLORS.primary} />
            </View>
            <Text style={themed.successTitle}>Wallet Created</Text>
            <Text style={themed.successSub}>
              Back up your recovery phrase now
            </Text>
          </View>

          <View style={themed.phraseCard}>
            <View style={themed.phraseHdr}>
              <View
                style={[
                  themed.modeIconBox,
                  { backgroundColor: COLORS.primaryMuted },
                ]}
              >
                <Ionicons name="key" size={22} color={COLORS.primary} />
              </View>
              <View>
                <Text style={themed.phraseTitleT}>Recovery Phrase</Text>
                <Text style={themed.phraseSubT}>
                  Write these 12 words in order
                </Text>
              </View>
            </View>

            <View style={themed.wordGrid}>
              {generatedMnemonic.split(" ").map((word, i) => (
                <View key={i} style={themed.wordChip}>
                  <View style={themed.wordNum}>
                    <Text style={themed.wordNumT}>{i + 1}</Text>
                  </View>
                  <Text style={themed.wordT}>{word}</Text>
                </View>
              ))}
            </View>

            <TouchableOpacity
              style={[themed.copyBtn, copied && themed.copyBtnActive]}
              onPress={handleCopy}
              activeOpacity={0.75}
            >
              <Ionicons
                name={copied ? "checkmark-circle" : "copy-outline"}
                size={17}
                color={copied ? "#FFF" : COLORS.primaryDark}
              />
              <Text style={[themed.copyBtnText, copied && themed.copyBtnTextA]}>
                {copied ? "Copied!" : "Copy to Clipboard"}
              </Text>
            </TouchableOpacity>
          </View>

          <View style={themed.warnBox}>
            <Ionicons name="warning" size={18} color={COLORS.warning} />
            <View style={{ flex: 1 }}>
              <Text style={themed.warnTitle}>Never share this phrase</Text>
              <Text style={themed.warnText}>
                Anyone who has these 12 words can access your funds. Store them
                offline.
              </Text>
            </View>
          </View>

          <TouchableOpacity
            style={themed.continueBtn}
            onPress={() => navigation.replace("Home")}
            activeOpacity={0.85}
          >
            <Text style={themed.continueBtnT}>Continue to Wallet</Text>
          </TouchableOpacity>
        </Animated.ScrollView>
      </SafeAreaView>
    );
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Mode Selection Screen
  // ──────────────────────────────────────────────────────────────────────────
  if (!mode) {
    return (
      <SafeAreaView style={themed.safeArea}>
        <Animated.ScrollView
          contentContainerStyle={[
            themed.scroll,
            { justifyContent: "center", flex: 1 },
          ]}
          showsVerticalScrollIndicator={false}
          style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}
        >
          {/* Hero */}
          <Text style={themed.chipLabel}>Get Started</Text>
          <Text style={themed.heroTitle}>
            Your keys,{"\n"}
            <Text style={themed.heroAccent}>your crypto.</Text>
          </Text>
          <Text style={themed.heroSub}>
            Non-custodial — you hold full ownership of your assets.
          </Text>

          <View style={{ height: SPACING.xl }} />

          {/* Create card */}
          <TouchableOpacity
            style={themed.modeCard}
            onPress={() => setMode("create")}
            activeOpacity={0.8}
          >
            <View style={themed.modeCardInner}>
              <View
                style={[
                  themed.modeIconBox,
                  { backgroundColor: COLORS.primaryMuted },
                ]}
              >
                <Ionicons
                  name="add-circle-outline"
                  size={26}
                  color={COLORS.primary}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={themed.modeTitle}>New Wallet</Text>
                <Text style={themed.modeSub}>
                  Generate a fresh wallet with a new seed phrase
                </Text>
              </View>
              <Ionicons
                name="chevron-forward"
                size={20}
                color={COLORS.textTertiary}
              />
            </View>
          </TouchableOpacity>

          {/* Import card */}
          <TouchableOpacity
            style={themed.modeCard}
            onPress={() => setMode("import")}
            activeOpacity={0.8}
          >
            <View style={themed.modeCardInner}>
              <View
                style={[
                  themed.modeIconBox,
                  { backgroundColor: COLORS.primaryMuted },
                ]}
              >
                <Ionicons
                  name="download-outline"
                  size={26}
                  color={COLORS.primary}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={themed.modeTitle}>Import Wallet</Text>
                <Text style={themed.modeSub}>
                  Restore with an existing 12-word phrase
                </Text>
              </View>
              <Ionicons
                name="chevron-forward"
                size={20}
                color={COLORS.textTertiary}
              />
            </View>
          </TouchableOpacity>

          <View style={themed.badge}>
            <Ionicons
              name="shield-checkmark"
              size={14}
              color={COLORS.primaryDark}
            />
            <Text style={themed.badgeText}>256-bit encrypted · Local only</Text>
          </View>
        </Animated.ScrollView>
      </SafeAreaView>
    );
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Setup Form Screen
  // ──────────────────────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={themed.safeArea}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <Animated.ScrollView
          contentContainerStyle={themed.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}
        >
          {/* Back row */}
          <View style={themed.backRow}>
            <TouchableOpacity
              style={themed.backBtnBox}
              onPress={() => setMode(null)}
              disabled={loading}
              activeOpacity={0.75}
            >
              <Ionicons name="arrow-back" size={20} color={COLORS.text} />
            </TouchableOpacity>
            <View>
              <Text style={themed.formTitle}>
                {mode === "create" ? "New Wallet" : "Import Wallet"}
              </Text>
              <Text style={themed.formSub}>
                {mode === "create"
                  ? "Set a name and a PIN"
                  : "Enter your phrase and a PIN"}
              </Text>
            </View>
          </View>

          {/* Wallet name */}
          <Text style={themed.fieldLabel}>Wallet Name</Text>
          <View style={[themed.fieldWrap, nameError && themed.fieldWrapErr]}>
            <TextInput
              style={themed.fieldInput}
              placeholder="e.g. Main Wallet"
              placeholderTextColor={COLORS.textTertiary}
              value={walletName}
              onChangeText={(t) => {
                setWalletName(t);
                setNameError("");
              }}
              editable={!loading}
            />
          </View>
          {nameError ? <Text style={themed.fieldErr}>{nameError}</Text> : null}

          {/* Mnemonic (import only) */}
          {mode === "import" && (
            <>
              <Text style={themed.fieldLabel}>Recovery Phrase</Text>
              <View
                style={[themed.fieldWrap, mnemonicError && themed.fieldWrapErr]}
              >
                <TextInput
                  style={[
                    themed.fieldInput,
                    { minHeight: 100, textAlignVertical: "top" },
                  ]}
                  placeholder="Enter your 12-word phrase separated by spaces"
                  placeholderTextColor={COLORS.textTertiary}
                  value={mnemonic}
                  onChangeText={(t) => {
                    setMnemonic(t);
                    setMnemonicError("");
                  }}
                  multiline
                  autoCapitalize="none"
                  autoCorrect={false}
                  editable={!loading}
                />
              </View>
              {mnemonicError ? (
                <Text style={themed.fieldErr}>{mnemonicError}</Text>
              ) : null}
            </>
          )}

          {/* PIN info row */}
          <View style={themed.pinSummaryRow}>
            <Ionicons
              name="lock-closed-outline"
              size={18}
              color={COLORS.primary}
            />
            <Text style={themed.pinSummaryText}>
              You'll set a 6-digit PIN on the next step to secure your wallet.
            </Text>
          </View>

          {/* CTA */}
          <TouchableOpacity
            style={[themed.actionBtn, loading && { opacity: 0.5 }]}
            onPress={openPinFlow}
            disabled={loading}
            activeOpacity={0.85}
          >
            <Text style={themed.actionBtnText}>
              {mode === "create" ? "Set PIN & Create" : "Set PIN & Import"}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={themed.outlineBtn}
            onPress={() => setMode(null)}
            disabled={loading}
            activeOpacity={0.75}
          >
            <Text style={themed.outlineBtnText}>Back</Text>
          </TouchableOpacity>
        </Animated.ScrollView>
      </KeyboardAvoidingView>

      {/* ── PIN enter modal ── */}
      <PinKeypadModal
        visible={pinStep === "enter"}
        title="Create PIN"
        subtitle="Enter a 6-digit PIN for your wallet"
        onComplete={handleFirstPin}
        onClose={() => setPinStep(null)}
        COLORS={COLORS}
        isDark={isDark}
      />

      {/* ── PIN confirm modal ── */}
      <PinKeypadModal
        visible={pinStep === "confirm"}
        title="Confirm PIN"
        subtitle="Re-enter your PIN to verify"
        onComplete={handleConfirmPin}
        onClose={() => setPinStep("enter")}
        COLORS={COLORS}
        isDark={isDark}
      />

      {/* ── Encryption progress ── */}
      <ProgressModal
        visible={showProgress}
        stage={progressStage}
        COLORS={COLORS}
        isDark={isDark}
      />
    </SafeAreaView>
  );
};

export default WalletSetupScreen;

// ─── Shared styles for PinKeypadModal ────────────────────────────────────────
const s = StyleSheet.create({
  // ── PIN modal ──────────────────────────────────────────────────────────────
  pinModal: {
    flex: 1,
    justifyContent: "space-between",
    paddingVertical: 32,
    paddingHorizontal: 24,
  },
  pinCloseBtn: { alignSelf: "flex-end", padding: 6 },
  pinHeader: { alignItems: "center", paddingTop: 16 },
  pinIconRing: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 18,
  },
  pinTitle: {
    fontSize: 26,
    fontWeight: "900",
    letterSpacing: -0.5,
    marginBottom: 6,
  },
  pinSubtitle: { fontSize: 14, textAlign: "center", lineHeight: 20 },

  pinDots: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 14,
    paddingVertical: 12,
  },
  pinDot: { width: 18, height: 18, borderRadius: 4, borderWidth: 2 },

  pinErrorRow: {
    height: 22,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
  },
  pinErrorText: { fontSize: 13, fontWeight: "600" },

  // ── Keypad ─────────────────────────────────────────────────────────────────
  keypad: { paddingBottom: 8 },
  keypadRow: {
    flexDirection: "row",
    justifyContent: "center",
    marginBottom: 12,
  },
  keyBtn: {
    width: 72,
    height: 72,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    marginHorizontal: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  keyText: { fontSize: 26, fontWeight: "500" },

  // ── Progress modal ─────────────────────────────────────────────────────────
  progressOverlay: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 32,
  },
  progressCard: {
    width: "100%",
    maxWidth: 320,
    borderRadius: 24,
    padding: 32,
    alignItems: "center",
    borderWidth: 1,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 16,
    elevation: 10,
  },
  spinnerRing: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 20,
  },
  progressLabel: { fontSize: 20, fontWeight: "800", marginBottom: 6 },
  progressSub: { fontSize: 13, marginBottom: 20, textAlign: "center" },
  progressTrack: {
    width: "100%",
    height: 5,
    borderRadius: 3,
    overflow: "hidden",
  },
  progressFill: { height: "100%", borderRadius: 3 },
});
