// screens/settings/BindingWalletScreen.js
// ─────────────────────────────────────────────────────────────────────────────
// Wallet identity — give this account a @username people can send to.
//
// No email, no password: the user proves they own the account by signing a
// one-time message with BOTH its EVM key and its Solana key
// (services/identity.js), and the backend verifies both before linking
// @username → { EVM address, Solana address }. Signatures are never saved —
// they live only for the duration of the request.
//
// Identities are per account: this screen always shows the ACTIVE account.
// Switch accounts and it shows that account's own link (or offers to create
// one) — each account is a separate identity with its own username.
//
//   linked   → identity card (+ change username, which re-proves ownership)
//   username → pick @name, checked live
//   prove    → see the exact message, unlock with PIN, sign with both keys
// ─────────────────────────────────────────────────────────────────────────────
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Animated,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import { useWallet } from "../../contexts/WalletContext";
import { useTheme } from "../../contexts/ThemeContext";
import PasscodeModal from "../../components/account/PasscodeModal";
import {
  getIdentityByAddress,
  checkUsername,
  requestChallenge,
  proveAndLink,
} from "../../services/identity";
import { rememberIdentity } from "../../hooks/useIdentity";

const USERNAME_RE = /^[a-z0-9_]{3,20}$/;
const short = (a, n = 6) => (a ? `${a.slice(0, n)}…${a.slice(-4)}` : "—");

const STEP_LABEL = {
  evm: "Signing with your EVM key…",
  solana: "Signing with your Solana key…",
  verify: "Verifying ownership…",
};

const FRIENDLY_ERROR = {
  USERNAME_TAKEN: "That username was just taken. Pick another.",
  CHALLENGE_EXPIRED: "The verification expired. Tap Sign to try again.",
  ADDRESS_ALREADY_BOUND: "This account is already linked to a different identity.",
  BAD_EVM_SIGNATURE: "Signature check failed. Make sure the right account is active.",
  BAD_SOLANA_SIGNATURE: "Signature check failed. Make sure the right account is active.",
};

export default function BindingWalletScreen({ navigation }) {
  const theme = useTheme();
  const { COLORS } = theme;
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const {
    address,
    solanaAddress,
    accounts,
    activeAccountIndex,
    createSignerForTransaction,
    createSolanaSignerForTransaction,
  } = useWallet();
  const accountName = accounts?.[activeAccountIndex]?.name ?? "This account";

  const [identity, setIdentity] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [mode, setMode] = useState("linked"); // linked | username | prove

  // Username step
  const [username, setUsername] = useState("");
  const [check, setCheck] = useState(null); // { available, reason } | null
  const [checking, setChecking] = useState(false);

  // Prove step
  const [challenge, setChallenge] = useState(null);
  const [preparing, setPreparing] = useState(false);
  const [showPin, setShowPin] = useState(false);
  const [signStep, setSignStep] = useState(null);
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(null);

  // Rests at 1; animates 0 → 1 only right after a successful link
  const celebrate = useRef(new Animated.Value(1)).current;

  // ── Load this account's identity (re-runs on account switch) ────────────────
  const load = useCallback(async () => {
    if (!address) return;
    setLoading(true);
    setLoadError(null);
    try {
      const found = await getIdentityByAddress(address);
      setIdentity(found);
      rememberIdentity(address, found);
      setMode(found ? "linked" : "username");
    } catch (err) {
      setLoadError(err.message || "Couldn't reach the server.");
    } finally {
      setLoading(false);
    }
  }, [address]);

  useEffect(() => {
    setUsername("");
    setCheck(null);
    setChallenge(null);
    setError(null);
    load();
  }, [address, solanaAddress, load]);

  // ── Live username check (debounced) ─────────────────────────────────────────
  const normalized = username.trim().replace(/^@/, "").toLowerCase();
  useEffect(() => {
    setCheck(null);
    if (!normalized) return;
    if (!USERNAME_RE.test(normalized)) {
      setCheck({ available: false, reason: "3–20 characters: letters, numbers and _" });
      return;
    }
    if (identity && normalized === identity.username) {
      setCheck({ available: false, reason: "That's already your username." });
      return;
    }
    setChecking(true);
    const t = setTimeout(() => {
      checkUsername(normalized, address)
        .then((r) => setCheck({ available: r.available, reason: r.reason }))
        .catch(() => setCheck(null))
        .finally(() => setChecking(false));
    }, 400);
    return () => {
      clearTimeout(t);
      setChecking(false);
    };
  }, [normalized, address, identity?.username]);

  // ── Prove step ──────────────────────────────────────────────────────────────
  const freshChallenge = useCallback(
    () => requestChallenge({ username: normalized, evmAddress: address, solanaAddress }),
    [normalized, address, solanaAddress],
  );

  const goProve = async () => {
    setError(null);
    setPreparing(true);
    try {
      setChallenge(await freshChallenge());
      setMode("prove");
    } catch (err) {
      setError(FRIENDLY_ERROR[err.code] || err.message);
    } finally {
      setPreparing(false);
    }
  };

  // PIN → both signers → sign → link. Wrong PIN throws here, which the
  // PasscodeModal shows; everything after that reports in-screen.
  const handlePin = async (passcode) => {
    const evmSigner = await createSignerForTransaction(passcode);
    const solanaKeypair = await createSolanaSignerForTransaction(passcode);
    setShowPin(false);
    setError(null);
    try {
      // The preview may have sat open past its 5-minute expiry
      let ch = challenge;
      if (!ch || Date.parse(ch.expiresAt) - Date.now() < 15_000) {
        ch = await freshChallenge();
        setChallenge(ch);
      }
      const linked = await proveAndLink({
        challenge: ch,
        evmSigner,
        solanaKeypair,
        onStep: setSignStep,
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      setIdentity(linked);
      rememberIdentity(address, linked); // Home / Accounts badges update now
      setChallenge(null);
      setUsername("");
      setMode("linked");
      celebrate.setValue(0);
      Animated.spring(celebrate, { toValue: 1, friction: 6, useNativeDriver: true }).start();
    } catch (err) {
      setError(FRIENDLY_ERROR[err.code] || err.message || "Linking failed. Please try again.");
      if (err.code === "USERNAME_TAKEN") setMode("username");
      if (err.code === "CHALLENGE_EXPIRED") setChallenge(null);
    } finally {
      setSignStep(null);
    }
  };

  const copy = async (label, value) => {
    await Clipboard.setStringAsync(value);
    setCopied(label);
    setTimeout(() => setCopied(null), 1500);
  };

  // ── Render ──────────────────────────────────────────────────────────────────
  const AccountPill = (
    <TouchableOpacity
      style={styles.accountPill}
      onPress={() => navigation.navigate("AccountManager")}
      activeOpacity={0.8}
    >
      <View style={styles.accountDot} />
      <Text style={styles.accountText} numberOfLines={1}>
        {accountName} · {short(address)}
      </Text>
      <Text style={styles.accountSwitch}>Switch</Text>
    </TouchableOpacity>
  );

  const renderLinked = () => {
    const scale = celebrate.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1] });
    return (
      <>
        <Animated.View style={[styles.idCard, { transform: [{ scale }] }]}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{identity.username[0].toUpperCase()}</Text>
          </View>
          <Text style={styles.handle}>@{identity.username}</Text>
          <View style={styles.verified}>
            <Ionicons name="shield-checkmark" size={13} color={COLORS.success} />
            <Text style={styles.verifiedText}>Ownership verified by signature</Text>
          </View>

          <View style={styles.addrList}>
            {[
              ["EVM", identity.evm_address, "Ethereum, Base, Robinhood & other EVM networks"],
              ["Solana", identity.solana_address, "Solana"],
            ].map(([label, value, sub]) => (
              <TouchableOpacity key={label} style={styles.addrRow} onPress={() => copy(label, value)} activeOpacity={0.7}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.addrLabel}>{label}</Text>
                  <Text style={styles.addrValue}>{short(value, 8)}</Text>
                  <Text style={styles.addrSub}>{sub}</Text>
                </View>
                <Ionicons
                  name={copied === label ? "checkmark" : "copy-outline"}
                  size={16}
                  color={copied === label ? COLORS.success : COLORS.textTertiary}
                />
              </TouchableOpacity>
            ))}
          </View>
        </Animated.View>

        <View style={styles.note}>
          <Ionicons name="paper-plane-outline" size={16} color={COLORS.primary} />
          <Text style={styles.noteText}>
            Anyone can now send to <Text style={styles.noteStrong}>@{identity.username}</Text> —
            it resolves to the right address on EVM networks and Solana.
          </Text>
        </View>
        <View style={styles.note}>
          <Ionicons name="people-outline" size={16} color={COLORS.primary} />
          <Text style={styles.noteText}>
            This username belongs to {accountName} only. Your other accounts link
            separately, each with its own username.
          </Text>
        </View>

        <TouchableOpacity
          style={styles.secondaryBtn}
          onPress={() => {
            setUsername("");
            setMode("username");
          }}
        >
          <Text style={styles.secondaryText}>Change username</Text>
        </TouchableOpacity>
      </>
    );
  };

  const renderUsername = () => {
    const canContinue = check?.available && !checking && !preparing;
    return (
      <>
        <Steps active={0} styles={styles} />
        <Text style={styles.h1}>{identity ? "Pick a new username" : "Claim your username"}</Text>
        <Text style={styles.lead}>
          A simple name people can send to instead of a long address — for this
          account's EVM and Solana wallets.
        </Text>

        <View
          style={[
            styles.inputWrap,
            check && { borderColor: check.available ? COLORS.success : COLORS.error },
          ]}
        >
          <Text style={styles.at}>@</Text>
          <TextInput
            value={username}
            onChangeText={(v) => setUsername(v.replace(/\s/g, ""))}
            placeholder="username"
            placeholderTextColor={COLORS.textTertiary}
            autoCapitalize="none"
            autoCorrect={false}
            maxLength={21}
            style={styles.input}
            returnKeyType="next"
            onSubmitEditing={() => canContinue && goProve()}
          />
          {checking ? (
            <ActivityIndicator size="small" color={COLORS.textTertiary} />
          ) : check ? (
            <Ionicons
              name={check.available ? "checkmark-circle" : "close-circle"}
              size={20}
              color={check.available ? COLORS.success : COLORS.error}
            />
          ) : null}
        </View>
        <Text style={[styles.hint, check && !check.available && { color: COLORS.error }]}>
          {check?.available
            ? `@${normalized} is available`
            : check?.reason ?? "3–20 characters · letters, numbers and _ · not case-sensitive"}
        </Text>

        {!!error && <Text style={styles.error}>{error}</Text>}

        <TouchableOpacity
          style={[styles.primaryBtn, !canContinue && styles.disabled]}
          onPress={goProve}
          disabled={!canContinue}
        >
          {preparing ? (
            <ActivityIndicator color={COLORS.background} />
          ) : (
            <Text style={styles.primaryText}>Continue</Text>
          )}
        </TouchableOpacity>
        {identity && (
          <TouchableOpacity style={styles.linkBtn} onPress={() => setMode("linked")}>
            <Text style={styles.linkText}>Keep @{identity.username}</Text>
          </TouchableOpacity>
        )}
      </>
    );
  };

  const renderProve = () => (
    <>
      <Steps active={1} styles={styles} />
      <Text style={styles.h1}>Prove it's your wallet</Text>
      <Text style={styles.lead}>
        You'll sign the message below with this account's EVM key and its
        Solana key. Rizon checks both signatures, then links them to{" "}
        <Text style={styles.noteStrong}>@{normalized}</Text>.
      </Text>

      <View style={styles.facts}>
        {[
          ["cash-outline", "Free — no transaction, no gas"],
          ["eye-off-outline", "The signature is checked once and never saved"],
          ["key-outline", "Your keys never leave this device"],
        ].map(([icon, text]) => (
          <View key={icon} style={styles.fact}>
            <Ionicons name={icon} size={15} color={COLORS.success} />
            <Text style={styles.factText}>{text}</Text>
          </View>
        ))}
      </View>

      <Text style={styles.sectionLabel}>Message you'll sign</Text>
      <View style={styles.messageBox}>
        <Text style={styles.message} selectable>
          {challenge?.message ?? "—"}
        </Text>
      </View>

      {!!error && <Text style={styles.error}>{error}</Text>}

      <TouchableOpacity
        style={[styles.primaryBtn, !!signStep && styles.disabled]}
        onPress={() => setShowPin(true)}
        disabled={!!signStep}
      >
        {signStep ? (
          <View style={styles.row}>
            <ActivityIndicator color={COLORS.background} />
            <Text style={styles.primaryText}>{STEP_LABEL[signStep]}</Text>
          </View>
        ) : (
          <View style={styles.row}>
            <Ionicons name="finger-print" size={18} color={COLORS.background} />
            <Text style={styles.primaryText}>Sign & link</Text>
          </View>
        )}
      </TouchableOpacity>
      <TouchableOpacity style={styles.linkBtn} onPress={() => setMode("username")} disabled={!!signStep}>
        <Text style={styles.linkText}>Back</Text>
      </TouchableOpacity>
    </>
  );

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn} hitSlop={8}>
          <Ionicons name="chevron-back" size={22} color={COLORS.text} />
        </TouchableOpacity>
        <Text style={styles.title}>Wallet identity</Text>
        <View style={styles.backBtn} />
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {AccountPill}

          {loading ? (
            <ActivityIndicator color={COLORS.primary} style={{ marginTop: 48 }} />
          ) : loadError ? (
            <View style={styles.center}>
              <Ionicons name="cloud-offline-outline" size={28} color={COLORS.textTertiary} />
              <Text style={styles.lead}>{loadError}</Text>
              <TouchableOpacity style={styles.secondaryBtn} onPress={load}>
                <Text style={styles.secondaryText}>Try again</Text>
              </TouchableOpacity>
            </View>
          ) : !solanaAddress ? (
            <View style={styles.center}>
              <Ionicons name="time-outline" size={28} color={COLORS.textTertiary} />
              <Text style={styles.lead}>
                This account's Solana address is still being set up. Lock and
                unlock your wallet, then come back.
              </Text>
            </View>
          ) : mode === "linked" && identity ? (
            renderLinked()
          ) : mode === "prove" ? (
            renderProve()
          ) : (
            renderUsername()
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      <PasscodeModal
        visible={showPin}
        title="Enter PIN"
        subtitle="Unlock your keys to sign"
        onClose={() => setShowPin(false)}
        onSuccess={handlePin}
      />
    </View>
  );
}

// ─── Step indicator ──────────────────────────────────────────────────────────
const Steps = ({ active, styles }) => (
  <View style={styles.steps}>
    {["Username", "Prove ownership", "Linked"].map((label, i) => (
      <View key={label} style={styles.stepItem}>
        <View style={[styles.stepDot, i <= active && styles.stepDotOn]}>
          <Text style={[styles.stepNum, i <= active && styles.stepNumOn]}>{i + 1}</Text>
        </View>
        <Text style={[styles.stepLabel, i === active && styles.stepLabelOn]}>{label}</Text>
      </View>
    ))}
  </View>
);

// ─── Styles ──────────────────────────────────────────────────────────────────
const makeStyles = ({ COLORS: C, SPACING, FONTS, BORDER_RADIUS }) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: C.background },
    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: SPACING.md,
      paddingVertical: SPACING.sm,
    },
    backBtn: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
    title: { fontSize: FONTS.sizes.lg, fontWeight: "800", color: C.text },
    content: { padding: SPACING.lg, paddingBottom: 64, gap: SPACING.md },
    center: { alignItems: "center", gap: SPACING.sm, marginTop: 40 },
    row: { flexDirection: "row", alignItems: "center", gap: 8 },

    accountPill: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      alignSelf: "center",
      paddingHorizontal: 14,
      height: 34,
      borderRadius: 17,
      backgroundColor: C.surface,
      borderWidth: 1,
      borderColor: C.border,
      maxWidth: "100%",
    },
    accountDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: C.success },
    accountText: { fontSize: 13, fontWeight: "600", color: C.text, flexShrink: 1 },
    accountSwitch: { fontSize: 12, fontWeight: "800", color: C.primaryDark ?? C.primary },

    steps: { flexDirection: "row", justifyContent: "space-between", marginTop: SPACING.sm },
    stepItem: { alignItems: "center", flex: 1, gap: 6 },
    stepDot: {
      width: 26,
      height: 26,
      borderRadius: 13,
      borderWidth: 1.5,
      borderColor: C.border,
      alignItems: "center",
      justifyContent: "center",
    },
    stepDotOn: { backgroundColor: C.primary, borderColor: C.primary },
    stepNum: { fontSize: 12, fontWeight: "800", color: C.textTertiary },
    stepNumOn: { color: C.background },
    stepLabel: { fontSize: 11, color: C.textTertiary, fontWeight: "600" },
    stepLabelOn: { color: C.text },

    h1: { fontSize: 26, fontWeight: "800", color: C.text, letterSpacing: -0.5, marginTop: SPACING.sm },
    lead: { fontSize: FONTS.sizes.sm, lineHeight: 20, color: C.textSecondary, textAlign: "left" },

    inputWrap: {
      flexDirection: "row",
      alignItems: "center",
      height: 58,
      paddingHorizontal: 16,
      borderRadius: 18,
      borderWidth: 1.5,
      borderColor: C.border,
      backgroundColor: C.surface,
      gap: 4,
    },
    at: { fontSize: 22, fontWeight: "800", color: C.textTertiary },
    input: { flex: 1, fontSize: 20, fontWeight: "700", color: C.text, paddingVertical: 0 },
    hint: { fontSize: 12, color: C.textTertiary, marginTop: -4 },
    error: { fontSize: 13, color: C.error },

    primaryBtn: {
      height: 54,
      borderRadius: 27,
      backgroundColor: C.primary,
      alignItems: "center",
      justifyContent: "center",
      marginTop: SPACING.sm,
    },
    primaryText: { fontSize: 16, fontWeight: "800", color: C.background },
    disabled: { opacity: 0.45 },
    secondaryBtn: {
      height: 48,
      borderRadius: 24,
      borderWidth: 1,
      borderColor: C.border,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 20,
    },
    secondaryText: { fontSize: 14, fontWeight: "700", color: C.text },
    linkBtn: { alignSelf: "center", padding: 8 },
    linkText: { fontSize: 13, fontWeight: "700", color: C.textSecondary },

    facts: {
      backgroundColor: C.surface,
      borderRadius: BORDER_RADIUS.lg,
      borderWidth: 1,
      borderColor: C.border,
      padding: SPACING.md,
      gap: 10,
    },
    fact: { flexDirection: "row", alignItems: "center", gap: 10 },
    factText: { fontSize: 13, color: C.text, flex: 1 },
    sectionLabel: {
      fontSize: 11,
      fontWeight: "800",
      letterSpacing: 0.6,
      textTransform: "uppercase",
      color: C.textTertiary,
    },
    messageBox: {
      borderRadius: BORDER_RADIUS.lg,
      borderWidth: 1,
      borderColor: C.border,
      backgroundColor: C.cardElevated ?? C.surface,
      padding: SPACING.md,
    },
    message: {
      fontFamily: Platform.select({ ios: "Menlo", default: "monospace" }),
      fontSize: 11,
      lineHeight: 16,
      color: C.textSecondary,
    },

    idCard: {
      alignItems: "center",
      padding: SPACING.lg,
      borderRadius: 28,
      backgroundColor: C.surface,
      borderWidth: 1,
      borderColor: C.border,
      gap: 8,
      marginTop: SPACING.sm,
    },
    avatar: {
      width: 72,
      height: 72,
      borderRadius: 36,
      backgroundColor: C.primary,
      alignItems: "center",
      justifyContent: "center",
    },
    avatarText: { fontSize: 32, fontWeight: "900", color: C.background },
    handle: { fontSize: 28, fontWeight: "900", color: C.text, letterSpacing: -0.6 },
    verified: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 10,
      backgroundColor: `${C.success}18`,
    },
    verifiedText: { fontSize: 12, fontWeight: "700", color: C.success },
    addrList: { alignSelf: "stretch", marginTop: SPACING.sm, gap: 8 },
    addrRow: {
      flexDirection: "row",
      alignItems: "center",
      padding: 12,
      borderRadius: 16,
      backgroundColor: C.background,
      gap: 10,
    },
    addrLabel: { fontSize: 11, fontWeight: "800", color: C.textTertiary, textTransform: "uppercase", letterSpacing: 0.6 },
    addrValue: {
      fontSize: 15,
      fontWeight: "700",
      color: C.text,
      fontFamily: Platform.select({ ios: "Menlo", default: "monospace" }),
      marginTop: 2,
    },
    addrSub: { fontSize: 11, color: C.textTertiary, marginTop: 2 },
    note: { flexDirection: "row", gap: 10, alignItems: "flex-start" },
    noteText: { flex: 1, fontSize: 13, lineHeight: 19, color: C.textSecondary },
    noteStrong: { fontWeight: "800", color: C.text },
  });
