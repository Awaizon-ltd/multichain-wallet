import React, { useState, useRef } from "react";
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
  FlatList,
} from "react-native";
import QRCode from "react-native-qrcode-svg";
import { useWallet } from "../../contexts/WalletContext";
import { useChain } from "../../contexts/ChainContext";
import { useTheme } from "../../contexts/ThemeContext";
import { formatAddress } from "../../utils/Wallet";
import * as Clipboard from "expo-clipboard";
import Alert from "../../utils/Alert";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const QR_SIZE = SCREEN_WIDTH * 0.55;

const ReceiveScreen = ({ navigation }) => {
  const theme = useTheme();
  const styles = createStyles(theme);
  const { wallet } = useWallet();
  const { activeChain, switchChain, getAllChains } = useChain();

  // Two-stage flow: pick a network first, then reveal the receive details
  // for it — picking the wrong network to receive on is unrecoverable, so
  // it's a deliberate step rather than something shown by default.
  const [stage, setStage] = useState("network"); // "network" | "details"
  const [switchingId, setSwitchingId] = useState(null);
  const [copied, setCopied] = useState(false);

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(24)).current;
  const copyScale = useRef(new Animated.Value(1)).current;

  const revealDetails = () => {
    setStage("details");
    fadeAnim.setValue(0);
    slideAnim.setValue(24);
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 450, useNativeDriver: true }),
      Animated.spring(slideAnim, {
        toValue: 0,
        tension: 60,
        friction: 10,
        useNativeDriver: true,
      }),
    ]).start();
  };

  const selectNetwork = async (chain) => {
    if (switchingId) return;
    if (chain.id === activeChain?.id) {
      revealDetails();
      return;
    }
    setSwitchingId(chain.id);
    try {
      await switchChain(chain);
      revealDetails();
    } catch (error) {
      Alert.alert("Couldn't switch network", error?.message || "Please try again.");
    } finally {
      setSwitchingId(null);
    }
  };

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
        message: `My ${activeChain.name} Address:\n${wallet.address}`,
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

  const handleBack = () => {
    if (stage === "details") {
      setStage("network");
    } else {
      navigation.goBack();
    }
  };

  const chains = getAllChains();

  return (
    <View style={styles.container}>
      {/* ── Navigation Header ── */}
      <View style={styles.navHeader}>
        <TouchableOpacity style={styles.backBtn} onPress={handleBack} activeOpacity={0.7}>
          <Text style={styles.backArrow}>←</Text>
        </TouchableOpacity>
        <Text style={styles.navTitle}>Receive</Text>
        <View style={styles.navSpacer} />
      </View>

      {stage === "network" ? (
        <>
          <Text style={styles.networkStageSubtitle}>
            Choose a network to receive on
          </Text>
          <FlatList
            data={chains}
            keyExtractor={(c) => String(c.id)}
            contentContainerStyle={styles.networkList}
            ItemSeparatorComponent={() => <View style={styles.networkDivider} />}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={styles.networkRow}
                onPress={() => selectNetwork(item)}
                activeOpacity={0.7}
                disabled={!!switchingId}
              >
                <Image source={{ uri: item.icon }} style={styles.networkRowIcon} />
                <View style={styles.networkRowText}>
                  <Text style={styles.networkRowName}>{item.name}</Text>
                  <Text style={styles.networkRowSymbol}>{item.symbol}</Text>
                </View>
                <Text style={styles.networkRowChevron}>
                  {switchingId === item.id ? "…" : "›"}
                </Text>
              </TouchableOpacity>
            )}
          />
        </>
      ) : (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          <Animated.View
            style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}
          >
            <TouchableOpacity
              style={styles.networkLabel}
              onPress={() => setStage("network")}
              activeOpacity={0.7}
            >
              <Image source={{ uri: activeChain.icon }} style={styles.networkLabelIcon} />
              <Text style={styles.networkLabelText}>
                Receiving on {activeChain.name}
              </Text>
              <Text style={styles.networkLabelChevron}>⌄</Text>
            </TouchableOpacity>

            <View style={styles.qrWrap}>
              <QRCode
                value={wallet.address}
                size={QR_SIZE}
                backgroundColor="transparent"
                color={theme.COLORS.text}
                logo={require("../../assets/logo.png")}
                logoSize={36}
                logoBackgroundColor={theme.COLORS.background}
              />
            </View>

            <View style={styles.addressRow}>
              <Text style={styles.addressSliced} numberOfLines={1}>
                {formatAddress(wallet.address, 6)}
              </Text>

              <Animated.View style={{ transform: [{ scale: copyScale }] }}>
                <TouchableOpacity
                  style={[styles.iconBtn, copied && styles.iconBtnSuccess]}
                  onPress={copyAddress}
                  activeOpacity={0.7}
                  accessibilityLabel="Copy address"
                >
                  <Text style={styles.iconBtnGlyph}>{copied ? "✓" : "⎘"}</Text>
                </TouchableOpacity>
              </Animated.View>

              <TouchableOpacity
                style={styles.iconBtn}
                onPress={shareAddress}
                activeOpacity={0.7}
                accessibilityLabel="Share address"
              >
                <Text style={styles.iconBtnGlyph}>↑</Text>
              </TouchableOpacity>
            </View>
          </Animated.View>
        </ScrollView>
      )}
    </View>
  );
};

const createStyles = (theme) => {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.COLORS.background },
    scroll: { flex: 1 },

    navHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: theme.SPACING.md,
      paddingTop: theme.SPACING.xl,
      paddingBottom: theme.SPACING.md,
    },
    backBtn: {
      width: 40,
      height: 40,
      alignItems: "center",
      justifyContent: "center",
    },
    backArrow: { fontSize: 20, color: theme.COLORS.text, lineHeight: 22 },
    navTitle: {
      fontSize: theme.FONTS.sizes.lg,
      fontWeight: "700",
      color: theme.COLORS.text,
      letterSpacing: -0.3,
    },
    navSpacer: { width: 40 },

    errorContainer: {
      flex: 1,
      justifyContent: "center",
      alignItems: "center",
      backgroundColor: theme.COLORS.background,
    },
    errorText: { fontSize: theme.FONTS.sizes.lg, color: theme.COLORS.error },

    // ── Stage 1: network selection ──
    networkStageSubtitle: {
      fontSize: theme.FONTS.sizes.sm,
      color: theme.COLORS.textSecondary,
      paddingHorizontal: theme.SPACING.md,
      marginBottom: theme.SPACING.sm,
    },
    networkList: { paddingHorizontal: theme.SPACING.md, paddingBottom: theme.SPACING.xl },
    networkRow: {
      flexDirection: "row",
      alignItems: "center",
      paddingVertical: theme.SPACING.md,
      gap: theme.SPACING.md,
    },
    networkRowIcon: { width: 34, height: 34, borderRadius: 17 },
    networkRowText: { flex: 1 },
    networkRowName: {
      fontSize: theme.FONTS.sizes.md,
      fontWeight: "600",
      color: theme.COLORS.text,
    },
    networkRowSymbol: {
      fontSize: theme.FONTS.sizes.xs ?? 11,
      color: theme.COLORS.textSecondary,
      marginTop: 2,
    },
    networkRowChevron: {
      fontSize: 20,
      color: theme.COLORS.textTertiary,
      fontWeight: "600",
    },
    networkDivider: {
      height: 1,
      backgroundColor: theme.COLORS.divider,
    },

    // ── Stage 2: receive details ──
    content: {
      flexGrow: 1,
      paddingHorizontal: theme.SPACING.lg,
      paddingBottom: 48,
      alignItems: "center",
      justifyContent: "center",
    },
    networkLabel: {
      flexDirection: "row",
      alignItems: "center",
      alignSelf: "center",
      gap: 6,
      marginTop: theme.SPACING.sm,
      marginBottom: theme.SPACING.xl,
    },
    networkLabelIcon: { width: 16, height: 16, borderRadius: 8 },
    networkLabelText: {
      fontSize: theme.FONTS.sizes.sm,
      color: theme.COLORS.textSecondary,
      fontWeight: "600",
    },
    networkLabelChevron: {
      fontSize: 12,
      color: theme.COLORS.textTertiary,
      fontWeight: "700",
    },

    qrWrap: {
      alignItems: "center",
      justifyContent: "center",
      marginBottom: theme.SPACING.xl,
    },

    addressRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 10,
    },
    addressSliced: {
      fontFamily: "Courier",
      fontSize: theme.FONTS.sizes.md,
      fontWeight: "600",
      color: theme.COLORS.text,
      letterSpacing: 0.3,
    },
    iconBtn: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: theme.COLORS.surface,
    },
    iconBtnSuccess: { backgroundColor: theme.COLORS.success ?? "#22c55e" },
    iconBtnGlyph: { fontSize: 15, color: theme.COLORS.text },
  });
};

export default ReceiveScreen;
