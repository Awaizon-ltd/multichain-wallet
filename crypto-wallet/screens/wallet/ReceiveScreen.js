import React, { useState, useRef, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Share,
  Image,
  TouchableOpacity,
  Animated,
  Dimensions,
} from "react-native";
import QRCode from "react-native-qrcode-svg";
import { useWallet } from "../../contexts/WalletContext";
import { useTheme } from "../../contexts/ThemeContext";
import { formatAddress } from "../../utils/Wallet";
import * as Clipboard from "expo-clipboard";
import Alert from "../../utils/Alert";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const QR_SIZE = SCREEN_WIDTH * 0.52;

const ReceiveScreen = ({ navigation }) => {
  const theme = useTheme();
  const styles = createStyles(theme);
  const { wallet, selectedChain } = useWallet();

  const [copied, setCopied] = useState(false);
  const [warningExpanded, setWarningExpanded] = useState(false);

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(30)).current;
  const copyScale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 500,
        useNativeDriver: true,
      }),
      Animated.spring(slideAnim, {
        toValue: 0,
        tension: 60,
        friction: 10,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  const copyAddress = async () => {
    if (!wallet?.address) return;
    await Clipboard.setStringAsync(wallet.address);
    setCopied(true);

    Animated.sequence([
      Animated.spring(copyScale, { toValue: 0.92, useNativeDriver: true }),
      Animated.spring(copyScale, { toValue: 1, useNativeDriver: true }),
    ]).start();

    setTimeout(() => setCopied(false), 2200);
  };

  const shareAddress = async () => {
    try {
      await Share.share({
        message: `My ${selectedChain.name} Address:\n${wallet.address}`,
        title: "Share Wallet Address",
      });
    } catch (error) {
      console.error("Error sharing:", error);
    }
  };

  if (!wallet) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>No wallet found</Text>
      </View>
    );
  }

  const shortAddress = formatAddress(wallet.address);

  return (
    <View style={styles.container}>
      {/* ── Navigation Header ── */}
      <View style={styles.navHeader}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => navigation.goBack()}
          activeOpacity={0.7}
        >
          <Text style={styles.backArrow}>←</Text>
        </TouchableOpacity>
        <Text style={styles.navTitle}>Receive</Text>
        <View style={styles.navSpacer} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Top Header ── */}
        <Animated.View
          style={[
            styles.header,
            { opacity: fadeAnim, transform: [{ translateY: slideAnim }] },
          ]}
        >
          <View style={styles.headerMeta}>
            <Image
              style={styles.chainIconSmall}
              source={{ uri: selectedChain.icon }}
            />
            <Text style={styles.chainLabel}>{selectedChain.name}</Text>
          </View>
          <Text style={styles.subtitle}>
            Scan or share your address to get paid
          </Text>
        </Animated.View>

        {/* ── QR Hero ── */}
        <Animated.View
          style={[
            styles.qrHeroWrapper,
            { opacity: fadeAnim, transform: [{ translateY: slideAnim }] },
          ]}
        >
          {/* QR frame */}
          <View style={styles.qrFrame}>
            {/* Corner accents */}
            <View style={[styles.corner, styles.cornerTL]} />
            <View style={[styles.corner, styles.cornerTR]} />
            <View style={[styles.corner, styles.cornerBL]} />
            <View style={[styles.corner, styles.cornerBR]} />

            <View style={styles.qrInner}>
              <QRCode
                value={wallet.address}
                size={QR_SIZE}
                backgroundColor="transparent"
                color={theme.COLORS.text}
                logo={require("../../assets/logo.png")}
                logoSize={36}
                logoBackgroundColor={theme.COLORS.card}
              />
            </View>
          </View>

          {/* Chain pill */}
          <View style={styles.chainPill}>
            <Image
              style={styles.chainPillIcon}
              source={{ uri: selectedChain.icon }}
            />
            <Text style={styles.chainPillText}>{selectedChain.name}</Text>
            <View style={styles.chainPillDot} />
            <Text style={styles.chainPillSymbol}>{selectedChain.symbol}</Text>
          </View>
        </Animated.View>

        {/* ── Address Strip ── */}
        <Animated.View
          style={[
            styles.addressSection,
            {
              opacity: fadeAnim,
              transform: [{ translateY: slideAnim }],
            },
          ]}
        >
          <Text style={styles.addressLabel}>YOUR ADDRESS</Text>

          <View style={styles.addressBox}>
            <Text style={styles.addressText} numberOfLines={2}>
              {wallet.address}
            </Text>
          </View>

          {/* Action Row */}
          <View style={styles.actionRow}>
            <Animated.View
              style={{ transform: [{ scale: copyScale }], flex: 1 }}
            >
              <TouchableOpacity
                style={[
                  styles.actionBtn,
                  styles.actionBtnPrimary,
                  copied && styles.actionBtnSuccess,
                ]}
                onPress={copyAddress}
                activeOpacity={0.85}
              >
                <Text style={styles.actionBtnIcon}>{copied ? "✓" : "⎘"}</Text>
                <Text
                  style={[styles.actionBtnText, styles.actionBtnTextPrimary]}
                >
                  {copied ? "Copied!" : "Copy Address"}
                </Text>
              </TouchableOpacity>
            </Animated.View>

            <TouchableOpacity
              style={[styles.actionBtn, styles.actionBtnSecondary]}
              onPress={shareAddress}
              activeOpacity={0.85}
            >
              <Text style={styles.actionBtnIcon}>↑</Text>
              <Text
                style={[styles.actionBtnText, styles.actionBtnTextSecondary]}
              >
                Share
              </Text>
            </TouchableOpacity>
          </View>
        </Animated.View>

        {/* ── Network Info ── */}
        <Animated.View style={[styles.infoGrid, { opacity: fadeAnim }]}>
          <View style={styles.infoCell}>
            <Text style={styles.infoCellLabel}>Network</Text>
            <Text style={styles.infoCellValue}>{selectedChain.name}</Text>
          </View>
          <View style={styles.infoDivider} />
          <View style={styles.infoCell}>
            <Text style={styles.infoCellLabel}>Token</Text>
            <Text style={styles.infoCellValue}>{selectedChain.symbol}</Text>
          </View>
          <View style={styles.infoDivider} />
          <View style={styles.infoCell}>
            <Text style={styles.infoCellLabel}>Wallet</Text>
            <Text style={styles.infoCellValue} numberOfLines={1}>
              {wallet.name}
            </Text>
          </View>
        </Animated.View>

        {/* ── Collapsible Warning ── */}
        <Animated.View style={[styles.warningWrapper, { opacity: fadeAnim }]}>
          <TouchableOpacity
            style={styles.warningHeader}
            onPress={() => setWarningExpanded(!warningExpanded)}
            activeOpacity={0.8}
          >
            <View style={styles.warningHeaderLeft}>
              <Text style={styles.warningIcon}>⚠</Text>
              <Text style={styles.warningTitle}>Important Notice</Text>
            </View>
            <Text style={styles.warningChevron}>
              {warningExpanded ? "˄" : "˅"}
            </Text>
          </TouchableOpacity>

          {warningExpanded && (
            <View style={styles.warningBody}>
              {[
                `Only send ${selectedChain.symbol} and ${selectedChain.name} compatible tokens to this address.`,
                "Sending tokens from other networks will result in permanent, unrecoverable loss.",
                "Always double-check the network before initiating a transfer.",
              ].map((msg, i) => (
                <View key={i} style={styles.warningItem}>
                  <View style={styles.warningBullet} />
                  <Text style={styles.warningText}>{msg}</Text>
                </View>
              ))}
            </View>
          )}
        </Animated.View>
      </ScrollView>
    </View>
  );
};

const createStyles = (theme) => {
  const ACCENT = theme.COLORS.primary;
  const WARNING = theme.COLORS.warning;

  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.COLORS.background,
    },
    scroll: {
      flex: 1,
    },
    navHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: theme.SPACING.lg,
      paddingTop: theme.SPACING.xl,
      paddingBottom: theme.SPACING.md,
      backgroundColor: theme.COLORS.background,
      borderBottomWidth: 1,
      borderBottomColor: theme.COLORS.border,
    },
    backBtn: {
      width: 40,
      height: 40,
      borderRadius: 12,
      backgroundColor: theme.COLORS.surface,
      borderWidth: 1,
      borderColor: theme.COLORS.border,
      alignItems: "center",
      justifyContent: "center",
    },
    backArrow: {
      fontSize: 18,
      color: theme.COLORS.text,
      lineHeight: 22,
    },
    navTitle: {
      fontSize: theme.FONTS.sizes.lg,
      fontWeight: "700",
      color: theme.COLORS.text,
      letterSpacing: -0.3,
    },
    navSpacer: {
      width: 40,
    },
    content: {
      paddingBottom: 48,
    },
    errorContainer: {
      flex: 1,
      justifyContent: "center",
      alignItems: "center",
      backgroundColor: theme.COLORS.background,
    },
    errorText: {
      fontSize: theme.FONTS.sizes.lg,
      color: theme.COLORS.error,
    },

    // ── Header ──
    header: {
      alignItems: "center",
      paddingTop: theme.SPACING.xl,
      paddingBottom: theme.SPACING.lg,
      paddingHorizontal: theme.SPACING.lg,
    },
    headerMeta: {
      flexDirection: "row",
      alignItems: "center",
      marginBottom: theme.SPACING.md,
      backgroundColor: theme.COLORS.surface,
      paddingHorizontal: 12,
      paddingVertical: 5,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: theme.COLORS.border,
    },
    chainIconSmall: {
      width: 16,
      height: 16,
      borderRadius: 8,
      marginRight: 6,
    },
    chainLabel: {
      fontSize: theme.FONTS.sizes.xs ?? 11,
      color: theme.COLORS.textSecondary,
      fontWeight: "600",
      letterSpacing: 0.5,
      textTransform: "uppercase",
    },
    subtitle: {
      fontSize: theme.FONTS.sizes.sm,
      color: theme.COLORS.textSecondary,
      textAlign: "center",
      lineHeight: 20,
    },

    // ── QR Hero ──
    qrHeroWrapper: {
      alignItems: "center",
      marginVertical: theme.SPACING.lg,
      paddingHorizontal: theme.SPACING.xl,
    },
    qrFrame: {
      padding: 20,
      backgroundColor: theme.COLORS.card,
      borderRadius: 28,
      borderWidth: 1,
      borderColor: theme.COLORS.border,
      shadowColor: ACCENT,
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.15,
      shadowRadius: 24,
      elevation: 12,
      position: "relative",
    },
    corner: {
      position: "absolute",
      width: 22,
      height: 22,
      borderColor: ACCENT,
      zIndex: 10,
    },
    cornerTL: {
      top: 8,
      left: 8,
      borderTopWidth: 2.5,
      borderLeftWidth: 2.5,
      borderTopLeftRadius: 6,
    },
    cornerTR: {
      top: 8,
      right: 8,
      borderTopWidth: 2.5,
      borderRightWidth: 2.5,
      borderTopRightRadius: 6,
    },
    cornerBL: {
      bottom: 8,
      left: 8,
      borderBottomWidth: 2.5,
      borderLeftWidth: 2.5,
      borderBottomLeftRadius: 6,
    },
    cornerBR: {
      bottom: 8,
      right: 8,
      borderBottomWidth: 2.5,
      borderRightWidth: 2.5,
      borderBottomRightRadius: 6,
    },
    qrInner: {
      borderRadius: 12,
      overflow: "hidden",
    },
    chainPill: {
      flexDirection: "row",
      alignItems: "center",
      marginTop: theme.SPACING.lg,
      backgroundColor: theme.COLORS.surface,
      borderWidth: 1,
      borderColor: theme.COLORS.border,
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: 24,
      gap: 6,
    },
    chainPillIcon: {
      width: 18,
      height: 18,
      borderRadius: 9,
    },
    chainPillText: {
      fontSize: theme.FONTS.sizes.sm,
      color: theme.COLORS.text,
      fontWeight: "600",
    },
    chainPillDot: {
      width: 3,
      height: 3,
      borderRadius: 1.5,
      backgroundColor: theme.COLORS.textSecondary,
    },
    chainPillSymbol: {
      fontSize: theme.FONTS.sizes.sm,
      color: theme.COLORS.textSecondary,
      fontWeight: "500",
    },

    // ── Address Section ──
    addressSection: {
      marginHorizontal: theme.SPACING.lg,
      marginTop: theme.SPACING.sm,
      marginBottom: theme.SPACING.lg,
      backgroundColor: theme.COLORS.card,
      borderRadius: 20,
      padding: theme.SPACING.lg,
      borderWidth: 1,
      borderColor: theme.COLORS.border,
    },
    addressLabel: {
      fontSize: 10,
      fontWeight: "700",
      letterSpacing: 1.5,
      color: theme.COLORS.textSecondary,
      marginBottom: theme.SPACING.sm,
    },
    addressBox: {
      backgroundColor: theme.COLORS.surface,
      borderRadius: 12,
      paddingHorizontal: 14,
      paddingVertical: 12,
      marginBottom: theme.SPACING.md,
      borderWidth: 1,
      borderColor: theme.COLORS.border,
    },
    addressText: {
      fontFamily: "Courier",
      fontSize: theme.FONTS.sizes.sm,
      color: theme.COLORS.text,
      lineHeight: 22,
      letterSpacing: 0.3,
    },
    actionRow: {
      flexDirection: "row",
      gap: 10,
    },
    actionBtn: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      paddingVertical: 13,
      paddingHorizontal: 16,
      borderRadius: 14,
      gap: 7,
    },
    actionBtnPrimary: {
      backgroundColor: ACCENT,
    },
    actionBtnSuccess: {
      backgroundColor: theme.COLORS.success ?? "#22c55e",
    },
    actionBtnSecondary: {
      flex: 0,
      width: 76,
      backgroundColor: theme.COLORS.surface,
      borderWidth: 1,
      borderColor: theme.COLORS.border,
    },
    actionBtnIcon: {
      fontSize: 16,
      color: theme.COLORS.text,
    },
    actionBtnText: {
      fontSize: theme.FONTS.sizes.sm,
      fontWeight: "700",
      letterSpacing: 0.2,
    },
    actionBtnTextPrimary: {
      color: "#fff",
    },
    actionBtnTextSecondary: {
      color: theme.COLORS.text,
    },

    // ── Network Info Grid ──
    infoGrid: {
      flexDirection: "row",
      marginHorizontal: theme.SPACING.lg,
      marginBottom: theme.SPACING.lg,
      backgroundColor: theme.COLORS.card,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: theme.COLORS.border,
      overflow: "hidden",
    },
    infoCell: {
      flex: 1,
      paddingVertical: 16,
      paddingHorizontal: 10,
      alignItems: "center",
      gap: 4,
    },
    infoCellLabel: {
      fontSize: 10,
      fontWeight: "700",
      letterSpacing: 1.2,
      color: theme.COLORS.textSecondary,
      textTransform: "uppercase",
    },
    infoCellValue: {
      fontSize: theme.FONTS.sizes.sm,
      color: theme.COLORS.text,
      fontWeight: "600",
    },
    infoDivider: {
      width: 1,
      backgroundColor: theme.COLORS.border,
      marginVertical: 12,
    },

    // ── Warning ──
    warningWrapper: {
      marginHorizontal: theme.SPACING.lg,
      backgroundColor: `${WARNING}0d`,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: `${WARNING}30`,
      overflow: "hidden",
    },
    warningHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      padding: theme.SPACING.md,
    },
    warningHeaderLeft: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },
    warningIcon: {
      fontSize: 14,
      color: WARNING,
    },
    warningTitle: {
      fontSize: theme.FONTS.sizes.sm,
      fontWeight: "700",
      color: WARNING,
    },
    warningChevron: {
      fontSize: 12,
      color: WARNING,
      fontWeight: "700",
    },
    warningBody: {
      paddingHorizontal: theme.SPACING.md,
      paddingBottom: theme.SPACING.md,
      gap: 8,
    },
    warningItem: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 10,
    },
    warningBullet: {
      width: 5,
      height: 5,
      borderRadius: 2.5,
      backgroundColor: WARNING,
      marginTop: 7,
      flexShrink: 0,
    },
    warningText: {
      flex: 1,
      fontSize: theme.FONTS.sizes.xs ?? 12,
      color: theme.COLORS.textSecondary,
      lineHeight: 18,
    },
  });
};

export default ReceiveScreen;
