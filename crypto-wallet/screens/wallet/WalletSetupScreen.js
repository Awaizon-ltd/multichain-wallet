// screens/WalletSetupScreen.js
import React, { useState, useRef, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  TouchableOpacity,
  Clipboard,
  Modal,
  Animated,
  Easing,
  SafeAreaView,
  Vibration,
  TextInput,
  Image,
} from "react-native";
import { BlurView } from "expo-blur";
import { Ionicons } from "@expo/vector-icons";
import { useWallet } from "../../contexts/WalletContext";
import { useTheme } from "../../contexts/ThemeContext";
import { isValidMnemonic, EVM_DERIVATION } from "../../utils/Wallet";
import { detectEvmDerivation } from "../../utils/evmDerivationDetect";
import Alert from "../../utils/Alert";
import { backupMnemonic, takeGoogleSession } from "../../services/cloudBackup";

// ─── Floating icon image ──────────────────────────────────────────────────────
// Placeholder from cryptologos.cc. When your own image is ready, replace with:
//   const HERO_ICON = require("../../assets/hero-icon.png");
const HERO_ICON = { uri: "https://logos.cryptologos.io/solana-sol-logo.png" };

// ─── PIN length ───────────────────────────────────────────────────────────────
const PIN_LENGTH = 6;

// ─── FloatingIcon ─────────────────────────────────────────────────────────────
// Image that bobs gently over a soft glow, with a shadow that reacts to height.
const FloatingIcon = ({ size = 120, COLORS, badge }) => {
  const float = useRef(new Animated.Value(0)).current;
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(float, {
          toValue: 1,
          duration: 2200,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(float, {
          toValue: 0,
          duration: 2200,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [float]);

  const translateY = float.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -size * 0.12],
  });
  const rotate = float.interpolate({
    inputRange: [0, 1],
    outputRange: ["-4deg", "4deg"],
  });
  const shadowScale = float.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 0.7],
  });
  const shadowOpacity = float.interpolate({
    inputRange: [0, 1],
    outputRange: [0.22, 0.1],
  });

  const stage = size * 1.9;

  return (
    <View
      style={{
        width: stage,
        height: stage,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {/* Glow rings */}
      <View
        style={{
          position: "absolute",
          width: stage,
          height: stage,
          borderRadius: stage / 2,
          backgroundColor: COLORS.primary + "10",
        }}
      />
      <View
        style={{
          position: "absolute",
          width: size * 1.45,
          height: size * 1.45,
          borderRadius: size,
          backgroundColor: COLORS.primary + "1C",
        }}
      />

      {/* Ground shadow */}
      <Animated.View
        style={{
          position: "absolute",
          bottom: stage * 0.14,
          width: size * 0.7,
          height: size * 0.1,
          borderRadius: size,
          backgroundColor: "#000",
          opacity: shadowOpacity,
          transform: [{ scaleX: shadowScale }],
        }}
      />

      {/* Icon */}
      <Animated.View style={{ transform: [{ translateY }, { rotate }] }}>
        {failed ? (
          <Ionicons name="wallet" size={size * 0.8} color={COLORS.primary} />
        ) : (
          <Image
            source={HERO_ICON}
            style={{ width: size, height: size }}
            resizeMode="contain"
            onError={() => setFailed(true)}
          />
        )}
        {badge ? (
          <View
            style={{
              position: "absolute",
              right: -4,
              bottom: -4,
              width: size * 0.36,
              height: size * 0.36,
              borderRadius: size * 0.18,
              backgroundColor: COLORS.success,
              borderWidth: 3,
              borderColor: COLORS.background,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Ionicons name={badge} size={size * 0.2} color="#FFF" />
          </View>
        ) : null}
      </Animated.View>
    </View>
  );
};

// ─── PinKeypadModal ───────────────────────────────────────────────────────────
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
        Vibration.vibrate(400);
        triggerShake();
        setTimeout(() => setPin(""), 500);
        setError("PINs do not match. Try again.");
      });
    }
  }, [pin]);

  const triggerShake = () => {
    Animated.sequence(
      [10, -10, 8, -8, 0].map((v) =>
        Animated.timing(shakeAnim, {
          toValue: v,
          duration: 60,
          useNativeDriver: true,
        }),
      ),
    ).start();
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
          {onClose && (
            <TouchableOpacity
              style={[s.pinCloseBtn, { backgroundColor: COLORS.surface }]}
              onPress={onClose}
              activeOpacity={0.7}
            >
              <Ionicons name="close" size={20} color={COLORS.textSecondary} />
            </TouchableOpacity>
          )}

          <View style={s.pinHeader}>
            <Text style={[s.pinTitle, { color: COLORS.text }]}>{title}</Text>
            {subtitle ? (
              <Text style={[s.pinSubtitle, { color: COLORS.textSecondary }]}>
                {subtitle}
              </Text>
            ) : null}
          </View>

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

          <View style={s.keypad}>
            {KEYS.map((row, ri) => (
              <View key={ri} style={s.keypadRow}>
                {row.map((key, ki) => {
                  if (key === null) return <View key={ki} style={s.keyBtn} />;
                  return (
                    <TouchableOpacity
                      key={ki}
                      style={[
                        s.keyBtn,
                        key !== "del" && { backgroundColor: COLORS.surface },
                      ]}
                      onPress={() => handlePress(key)}
                      activeOpacity={0.6}
                    >
                      {key === "del" ? (
                        <Ionicons
                          name="backspace-outline"
                          size={26}
                          color={COLORS.text}
                        />
                      ) : (
                        <Text style={[s.keyText, { color: COLORS.text }]}>
                          {key}
                        </Text>
                      )}
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
  generating: { label: "Creating wallet", icon: "sparkles-outline" },
  importing: { label: "Restoring wallet", icon: "cloud-download-outline" },
  checking: { label: "Finding your accounts", icon: "search-outline" },
  encrypting: { label: "Encrypting", icon: "shield-checkmark-outline" },
  deriving: { label: "Securing keys", icon: "lock-closed-outline" },
  saving: { label: "Saving", icon: "save-outline" },
  backing_up: {
    label: "Backing up to Google Drive",
    icon: "cloud-upload-outline",
  },
  complete: { label: "Done", icon: "checkmark-circle-outline" },
};

const ProgressModal = ({ visible, stage, COLORS, isDark }) => {
  const progressAnim = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!visible) return;
    progressAnim.setValue(0);
    Animated.timing(progressAnim, {
      toValue: 0.85,
      duration: 3200,
      useNativeDriver: false,
    }).start();
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 700,
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: 700,
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [visible]);

  const meta = STAGE_META[stage] || {
    label: "Processing…",
    icon: "hourglass-outline",
  };
  const barWidth = progressAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ["0%", "100%"],
  });
  const scale = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.12],
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
            <Animated.View
              style={[
                s.spinnerRing,
                {
                  backgroundColor: COLORS.primaryMuted,
                  transform: [{ scale }],
                },
              ]}
            >
              <Ionicons name={meta.icon} size={34} color={COLORS.primary} />
            </Animated.View>

            <Text style={[s.progressLabel, { color: COLORS.text }]}>
              {meta.label}
            </Text>
            <Text style={[s.progressSub, { color: COLORS.textSecondary }]}>
              Keep the app open until this finishes.
            </Text>

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
          </View>
        </View>
      </BlurView>
    </Modal>
  );
};

// ─── Main component ───────────────────────────────────────────────────────────
const WalletSetupScreen = ({ navigation, route }) => {
  const theme = useTheme();
  const { COLORS, isDark, SPACING, FONTS, BORDER_RADIUS } = theme;
  const { createWallet, importWallet, loading, encryptionProgress } =
    useWallet();

  // ── View state ──
  const [mode, setMode] = useState(null); // null | 'create' | 'import'
  const [walletName, setWalletName] = useState("");
  const [mnemonic, setMnemonic] = useState("");
  const [nameError, setNameError] = useState("");
  const [mnemonicError, setMnemonicError] = useState("");

  // ── PIN modal state ──
  const [pinStep, setPinStep] = useState(null); // null | 'enter' | 'confirm'
  const [firstPin, setFirstPin] = useState("");

  // ── Post-create ──
  const [generatedMnemonic, setGeneratedMnemonic] = useState("");
  const [copied, setCopied] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [saved, setSaved] = useState(false);

  // ── Google sign-up (from WelcomeScreen) ──
  // Held in a ref, read once from the in-memory hand-off — never route params.
  const googleRef = useRef(null);
  const restoredHintRef = useRef(null); // first EVM address recorded in a Drive backup
  const [restoredFrom, setRestoredFrom] = useState(null); // email when restoring from Drive
  const [cloudBackedUp, setCloudBackedUp] = useState(false);
  const [backingUp, setBackingUp] = useState(false);

  useEffect(() => {
    if (!route?.params?.google) return;
    const session = takeGoogleSession();
    if (!session) return;
    googleRef.current = session;
    if (session.restored) {
      setMode("import");
      setMnemonic(session.restored.mnemonic);
      restoredHintRef.current = session.restored.addressHint || null;
      setWalletName("Restored wallet");
      setRestoredFrom(session.email || "Google Drive");
    } else {
      setMode("create");
      setWalletName("Main wallet");
    }
  }, []);

  // Back up a freshly created wallet to Drive. Non-fatal: the wallet exists
  // either way, and Settings → Cloud Backup can retry.
  const autoBackup = async (phrase, walletAddress) => {
    const g = googleRef.current;
    if (!g?.driveGranted || !g.accessToken || g.restored) return;
    try {
      setBackingUp(true);
      setProgressStage("backing_up");
      await backupMnemonic({
        uid: g.uid,
        accessToken: g.accessToken,
        mnemonic: phrase,
        address: walletAddress,
        email: g.email,
      });
      setCloudBackedUp(true);
    } catch (err) {
      Alert.alert(
        "Backup didn't finish",
        `${err.message}\n\nYour wallet is ready. You can retry in Settings → Cloud Backup.`,
      );
    } finally {
      setBackingUp(false);
      googleRef.current = null; // drop the access token
    }
  };

  // ── Progress modal ──
  const [progressStage, setProgressStage] = useState("generating");
  const [checkingAccounts, setCheckingAccounts] = useState(false);
  const showProgress = !!encryptionProgress || backingUp || checkingAccounts;

  // Older Rizon versions derived EVM addresses differently from MetaMask.
  // When we can't tell which one this phrase uses, let the user pick.
  const askEvmDerivation = (detected) =>
    new Promise((resolve) => {
      const short = (a) => `${a.slice(0, 6)}…${a.slice(-4)}`;
      const bothUsed = detected.legacy.used && detected.standard.used;
      Alert.alert(
        "Which accounts should we open?",
        bothUsed
          ? `This recovery phrase has been used at two addresses.\n\nRizon wallet (created in Rizon before this update): ${short(detected.legacy.address)}\n\nStandard (MetaMask and most wallets): ${short(detected.standard.address)}`
          : `We couldn't check the network. If you created this wallet in the Rizon app before this update, choose Rizon wallet. If it came from MetaMask or another wallet, choose Standard.\n\nRizon wallet: ${short(detected.legacy.address)}\nStandard: ${short(detected.standard.address)}`,
        [
          { text: "Rizon wallet", onPress: () => resolve(EVM_DERIVATION.LEGACY) },
          { text: "Standard", onPress: () => resolve(EVM_DERIVATION.STANDARD) },
          { text: "Cancel", style: "cancel", onPress: () => resolve(null) },
        ],
      );
    });

  useEffect(() => {
    if (encryptionProgress?.stage) setProgressStage(encryptionProgress.stage);
  }, [encryptionProgress]);

  // ── Entry animation ──
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

  const wordCount = mnemonic.trim() ? mnemonic.trim().split(/\s+/).length : 0;

  // ── Validation before opening PIN modal ──
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

  // ── PIN flow handlers ──
  const handleFirstPin = (pin) => {
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
        await autoBackup(result.mnemonic, result.wallet?.address);
        setGeneratedMnemonic(result.mnemonic);
      } else {
        // Work out whether this phrase's EVM accounts use Rizon's original
        // derivation or the standard (MetaMask) one, so funds show up.
        setProgressStage("checking");
        setCheckingAccounts(true);
        let detected;
        try {
          detected = await detectEvmDerivation(mnemonic.trim(), {
            addressHint: restoredHintRef.current,
          });
        } finally {
          setCheckingAccounts(false);
        }
        const evmDerivation = detected.ambiguous
          ? await askEvmDerivation(detected)
          : detected.derivation;
        if (!evmDerivation) return; // cancelled
        await importWallet(mnemonic.trim(), pin, walletName.trim(), evmDerivation);
        setMnemonic(""); // don't keep the phrase in state once it's encrypted
        Alert.alert(
          "Success",
          restoredFrom
            ? "Your wallet was restored from Google Drive."
            : "Wallet imported successfully!",
        );
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

  // ── Clipboard ──
  const handleCopy = () => {
    Clipboard.setString(generatedMnemonic);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handlePaste = async () => {
    try {
      const text = await Clipboard.getString();
      if (text) {
        setMnemonic(text.trim());
        setMnemonicError("");
      }
    } catch (e) {}
  };

  // ── Styles (theme-aware) ──
  const t = {
    safeArea: { flex: 1, backgroundColor: COLORS.background },
    scroll: { flexGrow: 1, padding: SPACING.lg },
    animWrap: { opacity: fadeAnim, transform: [{ translateY: slideAnim }] },

    // Welcome
    heroWrap: { alignItems: "center", marginTop: SPACING.md },
    heroTitle: {
      fontSize: FONTS.sizes.xxxl,
      fontWeight: "900",
      color: COLORS.text,
      letterSpacing: -1,
      textAlign: "center",
      lineHeight: FONTS.sizes.xxxl * 1.12,
    },
    heroSub: {
      fontSize: FONTS.sizes.md,
      color: COLORS.textSecondary,
      textAlign: "center",
      marginTop: SPACING.sm,
      lineHeight: FONTS.sizes.md * 1.5,
      maxWidth: 300,
    },
    bottomBlock: { marginTop: "auto", paddingTop: SPACING.xl },
    primaryBtn: {
      backgroundColor: COLORS.primary,
      borderRadius: BORDER_RADIUS.round,
      height: 56,
      alignItems: "center",
      justifyContent: "center",
      flexDirection: "row",
      gap: 8,
      marginBottom: SPACING.sm,
    },
    primaryBtnText: {
      fontSize: FONTS.sizes.md,
      fontWeight: "800",
      color: COLORS.background,
    },
    secondaryBtn: {
      borderRadius: BORDER_RADIUS.round,
      height: 56,
      alignItems: "center",
      justifyContent: "center",
      flexDirection: "row",
      gap: 8,
      borderWidth: 1,
      borderColor: COLORS.border,
      backgroundColor: COLORS.surface,
    },
    secondaryBtnText: {
      fontSize: FONTS.sizes.md,
      fontWeight: "700",
      color: COLORS.text,
    },
    trustRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
      marginTop: SPACING.md,
    },
    trustText: {
      fontSize: FONTS.sizes.xs,
      fontWeight: "600",
      color: COLORS.textSecondary,
    },

    // Form
    backRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: SPACING.md,
      marginBottom: SPACING.lg,
    },
    backBtnBox: {
      width: 44,
      height: 44,
      borderRadius: 22,
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
      marginTop: 2,
    },
    formIconWrap: { alignItems: "center", marginBottom: SPACING.sm },

    fieldLabelRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: SPACING.xs,
    },
    fieldLabel: {
      fontSize: FONTS.sizes.sm,
      fontWeight: "700",
      color: COLORS.text,
    },
    fieldMeta: {
      fontSize: FONTS.sizes.xs,
      fontWeight: "600",
      color: COLORS.textSecondary,
    },
    pasteBtn: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: BORDER_RADIUS.round,
      backgroundColor: COLORS.primaryMuted,
    },
    pasteText: {
      fontSize: FONTS.sizes.xs,
      fontWeight: "700",
      color: COLORS.primaryDark,
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
      marginTop: -SPACING.xs,
    },
    pinHint: {
      flexDirection: "row",
      alignItems: "center",
      gap: SPACING.sm,
      backgroundColor: COLORS.primaryMuted,
      borderRadius: BORDER_RADIUS.lg,
      padding: SPACING.md,
      marginBottom: SPACING.lg,
    },
    pinHintText: {
      flex: 1,
      fontSize: FONTS.sizes.sm,
      color: COLORS.primaryDark,
      fontWeight: "600",
    },

    // Success
    successWrap: { alignItems: "center" },
    successTitle: {
      fontSize: FONTS.sizes.xxl,
      fontWeight: "900",
      color: COLORS.text,
      letterSpacing: -0.5,
      marginTop: -SPACING.sm,
    },
    successSub: {
      fontSize: FONTS.sizes.sm,
      color: COLORS.textSecondary,
      marginTop: 4,
      textAlign: "center",
      marginBottom: SPACING.lg,
    },
    phraseCard: {
      backgroundColor: COLORS.surface,
      borderRadius: 24,
      borderWidth: 1,
      borderColor: COLORS.border,
      padding: SPACING.md,
      marginBottom: SPACING.md,
    },
    wordGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      justifyContent: "space-between",
      rowGap: 8,
    },
    wordChip: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      width: "31.5%",
      paddingVertical: 9,
      paddingHorizontal: 9,
      borderRadius: BORDER_RADIUS.md,
      backgroundColor: COLORS.background,
    },
    wordNumT: {
      fontSize: 10,
      fontWeight: "800",
      color: COLORS.primary,
      minWidth: 14,
    },
    wordT: { fontSize: 13, fontWeight: "700", color: COLORS.text, flex: 1 },
    phraseActions: {
      flexDirection: "row",
      gap: SPACING.sm,
      marginTop: SPACING.md,
    },
    phraseBtn: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
      height: 44,
      borderRadius: BORDER_RADIUS.round,
      backgroundColor: COLORS.primaryMuted,
    },
    phraseBtnActive: { backgroundColor: COLORS.success },
    phraseBtnText: {
      fontSize: FONTS.sizes.sm,
      fontWeight: "700",
      color: COLORS.primaryDark,
    },
    warnBox: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: SPACING.sm,
      backgroundColor: isDark ? "rgba(255,109,0,0.12)" : "rgba(230,81,0,0.08)",
      borderRadius: BORDER_RADIUS.lg,
      padding: SPACING.md,
      marginBottom: SPACING.md,
      borderWidth: 1,
      borderColor: isDark ? "rgba(255,109,0,0.25)" : "rgba(230,81,0,0.2)",
    },
    warnTitle: {
      fontSize: FONTS.sizes.sm,
      fontWeight: "800",
      color: COLORS.warning,
      marginBottom: 2,
    },
    warnText: {
      fontSize: FONTS.sizes.xs,
      color: COLORS.warning,
      lineHeight: 17,
    },
    checkRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: SPACING.sm,
      marginBottom: SPACING.md,
      paddingHorizontal: 2,
    },
    checkBox: {
      width: 24,
      height: 24,
      borderRadius: 7,
      borderWidth: 2,
      borderColor: COLORS.primary,
      alignItems: "center",
      justifyContent: "center",
    },
    checkText: {
      flex: 1,
      fontSize: FONTS.sizes.sm,
      color: COLORS.text,
      fontWeight: "600",
    },
  };

  // ──────────────────────────────────────────────────────────────────────────
  // Success screen: back up recovery phrase
  // ──────────────────────────────────────────────────────────────────────────
  if (generatedMnemonic) {
    const words = generatedMnemonic.split(" ");
    return (
      <SafeAreaView style={t.safeArea}>
        <Animated.ScrollView
          contentContainerStyle={t.scroll}
          showsVerticalScrollIndicator={false}
          style={t.animWrap}
        >
          <View style={t.successWrap}>
            <FloatingIcon size={84} COLORS={COLORS} badge="checkmark" />
            <Text style={t.successTitle}>Wallet created</Text>
            <Text style={t.successSub}>
              Write down these {words.length} words in order. They are the only
              way to recover your wallet.
            </Text>
          </View>

          <View style={t.phraseCard}>
            <View style={t.wordGrid}>
              {words.map((word, i) => (
                <View key={i} style={t.wordChip}>
                  <Text style={t.wordNumT}>{i + 1}</Text>
                  <Text style={t.wordT}>{revealed ? word : "•••••"}</Text>
                </View>
              ))}
            </View>

            <View style={t.phraseActions}>
              <TouchableOpacity
                style={t.phraseBtn}
                onPress={() => setRevealed((r) => !r)}
                activeOpacity={0.75}
              >
                <Ionicons
                  name={revealed ? "eye-off-outline" : "eye-outline"}
                  size={17}
                  color={COLORS.primaryDark}
                />
                <Text style={t.phraseBtnText}>
                  {revealed ? "Hide" : "Reveal"}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[t.phraseBtn, copied && t.phraseBtnActive]}
                onPress={handleCopy}
                activeOpacity={0.75}
              >
                <Ionicons
                  name={copied ? "checkmark-circle" : "copy-outline"}
                  size={17}
                  color={copied ? "#FFF" : COLORS.primaryDark}
                />
                <Text style={[t.phraseBtnText, copied && { color: "#FFF" }]}>
                  {copied ? "Copied" : "Copy"}
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {cloudBackedUp && (
            <View style={t.pinHint}>
              <Ionicons
                name="cloud-done-outline"
                size={18}
                color={COLORS.primary}
              />
              <Text style={t.pinHintText}>
                Encrypted and backed up to your Google Drive. Signing in with
                Google on a new device restores this wallet.
              </Text>
            </View>
          )}

          <View style={t.warnBox}>
            <Ionicons name="warning" size={18} color={COLORS.warning} />
            <View style={{ flex: 1 }}>
              <Text style={t.warnTitle}>Never share this phrase</Text>
              <Text style={t.warnText}>
                Anyone with these words can take your funds. Store them offline.
              </Text>
            </View>
          </View>

          <TouchableOpacity
            style={t.checkRow}
            onPress={() => setSaved((v) => !v)}
            activeOpacity={0.8}
          >
            <View
              style={[t.checkBox, saved && { backgroundColor: COLORS.primary }]}
            >
              {saved && (
                <Ionicons
                  name="checkmark"
                  size={16}
                  color={COLORS.background}
                />
              )}
            </View>
            <Text style={t.checkText}>I've saved my recovery phrase</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[t.primaryBtn, !saved && { opacity: 0.4 }]}
            onPress={() => navigation.replace("Home")}
            disabled={!saved}
            activeOpacity={0.85}
          >
            <Text style={t.primaryBtnText}>Open wallet</Text>
          </TouchableOpacity>
        </Animated.ScrollView>
      </SafeAreaView>
    );
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Welcome screen
  // ──────────────────────────────────────────────────────────────────────────
  if (!mode) {
    return (
      <SafeAreaView style={t.safeArea}>
        <Animated.ScrollView
          contentContainerStyle={t.scroll}
          showsVerticalScrollIndicator={false}
          style={t.animWrap}
        >
          <View style={t.heroWrap}>
            <FloatingIcon size={130} COLORS={COLORS} />
            <Text style={t.heroTitle}>Your keys,{"\n"}your crypto.</Text>
            <Text style={t.heroSub}>
              A non-custodial wallet. Only you hold access to your assets.
            </Text>
          </View>

          <View style={t.bottomBlock}>
            <TouchableOpacity
              style={t.primaryBtn}
              onPress={() => setMode("create")}
              activeOpacity={0.85}
            >
              <Ionicons name="add" size={22} color={COLORS.background} />
              <Text style={t.primaryBtnText}>Create new wallet</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={t.secondaryBtn}
              onPress={() => setMode("import")}
              activeOpacity={0.8}
            >
              <Ionicons name="download-outline" size={20} color={COLORS.text} />
              <Text style={t.secondaryBtnText}>I already have a wallet</Text>
            </TouchableOpacity>

            <View style={t.trustRow}>
              <Ionicons
                name="shield-checkmark"
                size={14}
                color={COLORS.primary}
              />
              <Text style={t.trustText}>
                Encrypted and stored only on this device
              </Text>
            </View>
          </View>
        </Animated.ScrollView>
      </SafeAreaView>
    );
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Setup form
  // ──────────────────────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={t.safeArea}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <Animated.ScrollView
          contentContainerStyle={t.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          style={t.animWrap}
        >
          <View style={t.backRow}>
            <TouchableOpacity
              style={t.backBtnBox}
              onPress={() => setMode(null)}
              disabled={loading}
              activeOpacity={0.75}
            >
              <Ionicons name="arrow-back" size={20} color={COLORS.text} />
            </TouchableOpacity>
            <View style={{ flex: 1 }}>
              <Text style={t.formTitle}>
                {mode === "create" ? "New wallet" : "Import wallet"}
              </Text>
              <Text style={t.formSub}>
                {mode === "create"
                  ? "Name it, then set a PIN"
                  : "Enter your phrase, then set a PIN"}
              </Text>
            </View>
          </View>

          <View style={t.formIconWrap}>
            <FloatingIcon size={72} COLORS={COLORS} />
          </View>

          {/* Wallet name */}
          <View style={t.fieldLabelRow}>
            <Text style={t.fieldLabel}>Wallet name</Text>
          </View>
          <View style={[t.fieldWrap, nameError && t.fieldWrapErr]}>
            <TextInput
              style={t.fieldInput}
              placeholder="e.g. Main wallet"
              placeholderTextColor={COLORS.textTertiary}
              value={walletName}
              onChangeText={(v) => {
                setWalletName(v);
                setNameError("");
              }}
              editable={!loading}
            />
          </View>
          {nameError ? <Text style={t.fieldErr}>{nameError}</Text> : null}

          {/* Mnemonic (import only) */}
          {mode === "import" && restoredFrom && (
            <View style={t.pinHint}>
              <Ionicons
                name="cloud-done-outline"
                size={18}
                color={COLORS.primary}
              />
              <Text style={t.pinHintText}>
                Found your encrypted backup in Google Drive ({restoredFrom}).
                Set a PIN to finish restoring it on this device.
              </Text>
            </View>
          )}

          {mode === "import" && !restoredFrom && (
            <>
              <View style={t.fieldLabelRow}>
                <Text style={t.fieldLabel}>Recovery phrase</Text>
                <View
                  style={{ flexDirection: "row", alignItems: "center", gap: 8 }}
                >
                  <Text style={t.fieldMeta}>{wordCount}/12 words</Text>
                  <TouchableOpacity
                    style={t.pasteBtn}
                    onPress={handlePaste}
                    activeOpacity={0.75}
                  >
                    <Ionicons
                      name="clipboard-outline"
                      size={12}
                      color={COLORS.primaryDark}
                    />
                    <Text style={t.pasteText}>Paste</Text>
                  </TouchableOpacity>
                </View>
              </View>
              <View style={[t.fieldWrap, mnemonicError && t.fieldWrapErr]}>
                <TextInput
                  style={[
                    t.fieldInput,
                    { minHeight: 110, textAlignVertical: "top" },
                  ]}
                  placeholder="Enter your 12 words, separated by spaces"
                  placeholderTextColor={COLORS.textTertiary}
                  value={mnemonic}
                  onChangeText={(v) => {
                    setMnemonic(v);
                    setMnemonicError("");
                  }}
                  multiline
                  autoCapitalize="none"
                  autoCorrect={false}
                  editable={!loading}
                />
              </View>
              {mnemonicError ? (
                <Text style={t.fieldErr}>{mnemonicError}</Text>
              ) : null}
            </>
          )}

          <View style={t.pinHint}>
            <Ionicons
              name="lock-closed-outline"
              size={18}
              color={COLORS.primary}
            />
            <Text style={t.pinHintText}>
              Next, you'll set a 6-digit PIN to protect this wallet.
            </Text>
          </View>

          <TouchableOpacity
            style={[t.primaryBtn, loading && { opacity: 0.5 }]}
            onPress={openPinFlow}
            disabled={loading}
            activeOpacity={0.85}
          >
            <Text style={t.primaryBtnText}>
              {mode === "create" ? "Continue to PIN" : "Continue to PIN"}
            </Text>
          </TouchableOpacity>
        </Animated.ScrollView>
      </KeyboardAvoidingView>

      {/* ── PIN enter modal ── */}
      <PinKeypadModal
        visible={pinStep === "enter"}
        title="Create PIN"
        subtitle="Choose a 6-digit PIN"
        onComplete={handleFirstPin}
        onClose={() => setPinStep(null)}
        COLORS={COLORS}
        isDark={isDark}
      />

      {/* ── PIN confirm modal ── */}
      <PinKeypadModal
        visible={pinStep === "confirm"}
        title="Confirm PIN"
        subtitle="Enter the same PIN again"
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

// ─── Static styles for modals ─────────────────────────────────────────────────
const s = StyleSheet.create({
  // PIN modal
  pinModal: {
    flex: 1,
    justifyContent: "space-between",
    paddingVertical: 32,
    paddingHorizontal: 24,
  },
  pinCloseBtn: {
    alignSelf: "flex-end",
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  pinHeader: { alignItems: "center", paddingTop: 8 },
  pinTitle: {
    fontSize: 28,
    fontWeight: "900",
    letterSpacing: -0.5,
    marginBottom: 6,
  },
  pinSubtitle: { fontSize: 14, textAlign: "center", lineHeight: 20 },
  pinDots: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 16,
    paddingVertical: 12,
  },
  pinDot: { width: 16, height: 16, borderRadius: 8, borderWidth: 2 },
  pinErrorRow: {
    height: 22,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
  },
  pinErrorText: { fontSize: 13, fontWeight: "600" },

  // Keypad
  keypad: { paddingBottom: 8 },
  keypadRow: {
    flexDirection: "row",
    justifyContent: "center",
    marginBottom: 14,
  },
  keyBtn: {
    width: 76,
    height: 76,
    borderRadius: 38,
    alignItems: "center",
    justifyContent: "center",
    marginHorizontal: 12,
  },
  keyText: { fontSize: 28, fontWeight: "500" },

  // Progress modal
  progressOverlay: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 32,
  },
  progressCard: {
    width: "100%",
    maxWidth: 320,
    borderRadius: 28,
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
    width: 76,
    height: 76,
    borderRadius: 38,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 20,
  },
  progressLabel: { fontSize: 20, fontWeight: "800", marginBottom: 6 },
  progressSub: { fontSize: 13, marginBottom: 22, textAlign: "center" },
  progressTrack: {
    width: "100%",
    height: 6,
    borderRadius: 3,
    overflow: "hidden",
  },
  progressFill: { height: "100%", borderRadius: 3 },
});
