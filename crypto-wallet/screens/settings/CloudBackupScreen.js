// screens/settings/CloudBackupScreen.js
// Back up the recovery phrase to Google Drive (encrypted), or remove it.
// See services/cloudBackup.js for the design.
import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../../contexts/ThemeContext";
import { useWallet } from "../../contexts/WalletContext";
import { useGoogleAuth } from "../../services/GoogleService";
import {
  backupMnemonic,
  deleteCloudBackup,
  getBackupStatus,
} from "../../services/cloudBackup";
import PasscodeModal from "../../components/account/PasscodeModal";
import Alert from "../../utils/Alert";

const formatDate = (iso) => {
  try {
    return new Date(iso).toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
};

const CloudBackupScreen = () => {
  const { COLORS, SPACING, FONTS, BORDER_RADIUS } = useTheme();
  const { wallet, getMnemonic } = useWallet();
  const google = useGoogleAuth({ withDrive: true });

  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState(null); // null | "backup" | "delete"
  const [showPin, setShowPin] = useState(false);

  const loadStatus = useCallback(async () => setStatus(await getBackupStatus()), []);
  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  // Google first (so a cancelled sign-in costs nothing), then Drive access
  // must actually have been granted.
  const signInWithDrive = async () => {
    const session = await google.signIn();
    if (!session) return null;
    if (!session.driveGranted) {
      Alert.alert(
        "Drive access needed",
        "Rizon only stores the backup in a private app folder in your Drive. Sign in again and allow Google Drive access.",
      );
      return null;
    }
    return session;
  };

  // PIN → decrypt phrase → Google → encrypt + upload. The phrase lives only
  // inside this function call.
  const handleBackup = async (passcode) => {
    const mnemonic = await getMnemonic(passcode); // throws on wrong PIN → modal shows error
    setShowPin(false);
    setBusy("backup");
    try {
      const session = await signInWithDrive();
      if (!session) return;
      await backupMnemonic({
        uid: session.uid,
        accessToken: session.accessToken,
        mnemonic,
        address: wallet?.address,
        email: session.email,
      });
      await loadStatus();
      Alert.alert("Backed up", `Your wallet is backed up to ${session.email}'s Google Drive.`);
    } catch (err) {
      Alert.alert("Backup failed", err?.message || "Please try again.");
    } finally {
      setBusy(null);
    }
  };

  const handleDelete = () => {
    Alert.alert(
      "Delete cloud backup?",
      "Your wallet stays on this device. Without the backup, signing in with Google won't restore it — keep your recovery phrase safe.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            setBusy("delete");
            try {
              const session = await signInWithDrive();
              if (!session) return;
              await deleteCloudBackup(session.accessToken);
              await loadStatus();
            } catch (err) {
              Alert.alert("Couldn't delete", err?.message || "Please try again.");
            } finally {
              setBusy(null);
            }
          },
        },
      ],
    );
  };

  const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: COLORS.background },
    content: { padding: SPACING.md, paddingBottom: 48, gap: SPACING.md },
    card: {
      backgroundColor: COLORS.surface,
      borderRadius: BORDER_RADIUS.xl,
      borderWidth: 1,
      borderColor: COLORS.border,
      padding: SPACING.md,
      gap: SPACING.sm,
    },
    statusRow: { flexDirection: "row", alignItems: "center", gap: SPACING.sm },
    statusIcon: {
      width: 44,
      height: 44,
      borderRadius: 22,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: status ? COLORS.primaryMuted : `${COLORS.warning}22`,
    },
    statusTitle: { fontSize: FONTS.sizes.lg, fontWeight: "800", color: COLORS.text },
    statusSub: { fontSize: FONTS.sizes.sm, color: COLORS.textSecondary, marginTop: 2 },
    primaryBtn: {
      height: 52,
      borderRadius: 26,
      backgroundColor: COLORS.primary,
      alignItems: "center",
      justifyContent: "center",
      flexDirection: "row",
      gap: 8,
    },
    primaryText: { fontSize: FONTS.sizes.md, fontWeight: "800", color: COLORS.background },
    dangerBtn: {
      height: 48,
      borderRadius: 24,
      borderWidth: 1,
      borderColor: `${COLORS.error}55`,
      alignItems: "center",
      justifyContent: "center",
    },
    dangerText: { fontSize: FONTS.sizes.sm, fontWeight: "700", color: COLORS.error },
    sectionTitle: { fontSize: FONTS.sizes.sm, fontWeight: "800", color: COLORS.text },
    point: { flexDirection: "row", gap: SPACING.sm, alignItems: "flex-start" },
    pointText: { flex: 1, fontSize: FONTS.sizes.sm, lineHeight: 19, color: COLORS.textSecondary },
  });

  const Point = ({ icon, children }) => (
    <View style={styles.point}>
      <Ionicons name={icon} size={16} color={COLORS.primary} style={{ marginTop: 1 }} />
      <Text style={styles.pointText}>{children}</Text>
    </View>
  );

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.card}>
        <View style={styles.statusRow}>
          <View style={styles.statusIcon}>
            <Ionicons
              name={status ? "cloud-done" : "cloud-offline-outline"}
              size={22}
              color={status ? COLORS.primary : COLORS.warning}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.statusTitle}>
              {status ? "Backed up" : "Not backed up"}
            </Text>
            <Text style={styles.statusSub}>
              {status
                ? `${status.email ?? "Google Drive"} · ${formatDate(status.backedUpAt)}`
                : "Only your recovery phrase can restore this wallet"}
            </Text>
          </View>
        </View>

        <TouchableOpacity
          style={[styles.primaryBtn, (!!busy || !google.ready) && { opacity: 0.6 }]}
          onPress={() => setShowPin(true)}
          disabled={!!busy || !google.ready}
          activeOpacity={0.85}
        >
          {busy === "backup" ? (
            <ActivityIndicator color={COLORS.background} />
          ) : (
            <Ionicons name="logo-google" size={18} color={COLORS.background} />
          )}
          <Text style={styles.primaryText}>
            {status ? "Back up again" : "Back up to Google Drive"}
          </Text>
        </TouchableOpacity>

        {status && (
          <TouchableOpacity
            style={[styles.dangerBtn, !!busy && { opacity: 0.6 }]}
            onPress={handleDelete}
            disabled={!!busy}
          >
            {busy === "delete" ? (
              <ActivityIndicator color={COLORS.error} />
            ) : (
              <Text style={styles.dangerText}>Delete cloud backup</Text>
            )}
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>How it's protected</Text>
        <Point icon="lock-closed-outline">
          Your phrase is encrypted on this device with AES-256-GCM before it
          leaves. Google only ever stores ciphertext.
        </Point>
        <Point icon="key-outline">
          The key lives in your Rizon account, separately from the file — and
          the file sits in a private app folder only Rizon can open.
        </Point>
        <Point icon="phone-portrait-outline">
          Signing in with this Google account on a new device restores the
          wallet automatically.
        </Point>
        <Point icon="alert-circle-outline">
          That also means anyone who takes over your Google account could
          restore it. Use a strong password and 2-step verification on Google.
        </Point>
      </View>

      <PasscodeModal
        visible={showPin}
        title="Enter PIN"
        subtitle="Unlock your recovery phrase to back it up"
        onClose={() => setShowPin(false)}
        onSuccess={handleBackup}
      />
    </ScrollView>
  );
};

export default CloudBackupScreen;
