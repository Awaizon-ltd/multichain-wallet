// screens/wallet/ReceiveScreen.js
// Receive: pick an asset (native coin or token, on any enabled network), then
// show the address + QR for that network.
//
// The asset list is every enabled network's catalog — natives first (built
// from the chain list, so they're there instantly), then each chain's tokens
// as its catalog arrives. It's one FlatList with fixed-height rows
// (getItemLayout) that renders a page at a time and grows on scroll, so a
// ~1,000-token list costs the same to open as a 30-token one. No balances are
// fetched here — receiving needs none, so this screen makes no RPC calls.
//
// Opened from a token's page (route params { token, chain }), it skips
// straight to that asset's receive details.
import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  TextInput,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import QRCode from "react-native-qrcode-svg";
import { useWallet } from "../../contexts/WalletContext";
import { useChain, isSolanaChain } from "../../contexts/ChainContext";
import { useTheme } from "../../contexts/ThemeContext";
import { formatAddress } from "../../utils/Wallet";
import useMultiChainTokens from "../../hooks/useMultiChainTokens";
import ChainBadge from "../../components/common/ChainBadge";
import * as Clipboard from "expo-clipboard";
import Alert from "../../utils/Alert";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const QR_SIZE = SCREEN_WIDTH * 0.55;
const ROW_HEIGHT = 64;
const PAGE_SIZE = 30;

// ── Asset row ─────────────────────────────────────────────────────────────────
const AssetRow = memo(({ item, onPress, styles, COLORS }) => {
  const [imgErr, setImgErr] = useState(false);
  const logo = item.logoURI || item.logo;
  return (
    <TouchableOpacity style={styles.assetRow} onPress={() => onPress(item)} activeOpacity={0.7}>
      <View style={styles.assetIconWrap}>
        {logo && !imgErr ? (
          <Image
            source={{ uri: logo, cache: "force-cache" }}
            style={styles.assetIcon}
            onError={() => setImgErr(true)}
            fadeDuration={0}
          />
        ) : (
          <View style={[styles.assetIcon, styles.assetIconFallback]}>
            <Text style={styles.assetIconText}>{item.symbol?.slice(0, 2).toUpperCase()}</Text>
          </View>
        )}
        {!item.isNative && <ChainBadge uri={item.chain.icon} borderColor={COLORS.background} />}
      </View>
      <View style={styles.assetText}>
        <Text style={styles.assetSymbol} numberOfLines={1}>
          {item.symbol}
        </Text>
        <Text style={styles.assetName} numberOfLines={1}>
          {item.name} · {item.chain.name}
        </Text>
      </View>
      <Ionicons name="qr-code-outline" size={18} color={COLORS.textTertiary} />
    </TouchableOpacity>
  );
});

const ReceiveScreen = ({ navigation, route }) => {
  const theme = useTheme();
  const { COLORS } = theme;
  const styles = useMemo(() => createStyles(theme), [theme]);
  const { wallet, solanaAddress } = useWallet();
  const { getEnabledNetworks } = useChain();

  const networks = useMemo(() => getEnabledNetworks(), [getEnabledNetworks]);
  const { byChain } = useMultiChainTokens({ networks, withBalances: false });

  const [selected, setSelected] = useState(null); // { token, chain }
  const [query, setQuery] = useState("");
  const [chainFilter, setChainFilter] = useState("all");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [copied, setCopied] = useState(false);

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(24)).current;
  const copyScale = useRef(new Animated.Value(1)).current;

  const receiveChain = selected?.chain ?? null;
  const receiveAddress = receiveChain
    ? isSolanaChain(receiveChain)
      ? solanaAddress
      : wallet?.address
    : null;

  // ── All assets, flattened: natives first, then tokens chain by chain ────────
  const allAssets = useMemo(() => {
    const natives = networks.map((chain) => ({
      key: `${chain.id}:native`,
      chain,
      isNative: true,
      symbol: chain.symbol,
      name: chain.nativeTokenName || chain.name,
      logoURI: chain.icon,
    }));
    const tokens = networks.flatMap((chain) =>
      (byChain[chain.id]?.tokens ?? [])
        .filter((t) => !t.isNative)
        .map((t) => ({ ...t, key: `${chain.id}:${t.address}`, chain })),
    );
    return [...natives, ...tokens];
  }, [networks, byChain]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return allAssets.filter(
      (a) =>
        (chainFilter === "all" || a.chain.id === chainFilter) &&
        (!q ||
          a.symbol?.toLowerCase().includes(q) ||
          a.name?.toLowerCase().includes(q) ||
          a.chain.name.toLowerCase().includes(q) ||
          a.address?.toLowerCase() === q),
    );
  }, [allAssets, query, chainFilter]);

  // New search / filter → start from the first page again
  useEffect(() => setVisibleCount(PAGE_SIZE), [query, chainFilter]);

  const page = useMemo(() => filtered.slice(0, visibleCount), [filtered, visibleCount]);
  const loadingChains = networks.filter((c) => byChain[c.id]?.loading).length;

  // ── Details stage ───────────────────────────────────────────────────────────
  const reveal = useCallback(() => {
    fadeAnim.setValue(0);
    slideAnim.setValue(24);
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 450, useNativeDriver: true }),
      Animated.spring(slideAnim, { toValue: 0, tension: 60, friction: 10, useNativeDriver: true }),
    ]).start();
  }, [fadeAnim, slideAnim]);

  const selectAsset = useCallback(
    (asset) => {
      if (isSolanaChain(asset.chain) && !solanaAddress) {
        Alert.alert(
          "Solana not ready",
          "Your Solana address is still being set up. Unlock your wallet again and retry.",
        );
        return;
      }
      setSelected({ token: asset, chain: asset.chain });
      setCopied(false);
      reveal();
    },
    [solanaAddress, reveal],
  );

  // Deep link from a token page: { chain, token? } → straight to details
  useEffect(() => {
    const chainParam = route?.params?.chain;
    if (!chainParam) return;
    const chain = networks.find((c) => c.id === chainParam.id) ?? chainParam;
    const t = route.params.token;
    selectAsset(
      t?.address
        ? { ...t, chain, isNative: false }
        : { chain, isNative: true, symbol: chain.symbol, name: chain.nativeTokenName || chain.name, logoURI: chain.icon },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const copyAddress = async () => {
    if (!receiveAddress) return;
    await Clipboard.setStringAsync(receiveAddress);
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
        message: `My ${receiveChain.name} address for ${selected.token.symbol}:\n${receiveAddress}`,
        title: "Share Wallet Address",
      });
    } catch (error) {
      console.error("Error sharing:", error);
    }
  };

  const handleBack = () => {
    if (selected && !route?.params?.chain) setSelected(null);
    else navigation.goBack();
  };

  const renderItem = useCallback(
    ({ item }) => <AssetRow item={item} onPress={selectAsset} styles={styles} COLORS={COLORS} />,
    [selectAsset, styles, COLORS],
  );
  const getItemLayout = useCallback(
    (_, index) => ({ length: ROW_HEIGHT, offset: ROW_HEIGHT * index, index }),
    [],
  );

  if (!wallet) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>No wallet found</Text>
      </View>
    );
  }

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

      {!selected ? (
        <>
          <View style={styles.search}>
            <Ionicons name="search-outline" size={16} color={COLORS.textTertiary} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Search assets or networks"
              placeholderTextColor={COLORS.textTertiary}
              style={styles.searchInput}
              autoCorrect={false}
              autoCapitalize="none"
            />
            {query.length > 0 && (
              <TouchableOpacity onPress={() => setQuery("")}>
                <Ionicons name="close-circle" size={16} color={COLORS.textTertiary} />
              </TouchableOpacity>
            )}
          </View>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.chipsWrap}
            contentContainerStyle={styles.chips}
          >
            {[{ id: "all", name: "All" }, ...networks].map((c) => {
              const active = chainFilter === c.id;
              return (
                <TouchableOpacity
                  key={String(c.id)}
                  onPress={() => setChainFilter(c.id)}
                  style={[styles.chip, active && styles.chipActive]}
                >
                  {c.icon ? <Image source={{ uri: c.icon }} style={styles.chipIcon} /> : null}
                  <Text style={[styles.chipText, active && { color: COLORS.text }]}>
                    {c.name.replace(" Chain", "")}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          <FlatList
            data={page}
            keyExtractor={(a) => a.key}
            renderItem={renderItem}
            getItemLayout={getItemLayout}
            initialNumToRender={14}
            maxToRenderPerBatch={14}
            windowSize={7}
            removeClippedSubviews
            onEndReachedThreshold={0.6}
            onEndReached={() =>
              visibleCount < filtered.length && setVisibleCount((n) => n + PAGE_SIZE)
            }
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.assetList}
            ListFooterComponent={
              loadingChains > 0 ? (
                <View style={styles.footer}>
                  <ActivityIndicator size="small" color={COLORS.primary} />
                  <Text style={styles.footerText}>Loading more tokens…</Text>
                </View>
              ) : null
            }
            ListEmptyComponent={
              <Text style={styles.empty}>No assets match “{query}”</Text>
            }
          />
        </>
      ) : (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          <Animated.View
            style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }], alignItems: "center" }}
          >
            <TouchableOpacity
              style={styles.networkLabel}
              onPress={() => !route?.params?.chain && setSelected(null)}
              activeOpacity={0.7}
            >
              <Image source={{ uri: receiveChain.icon }} style={styles.networkLabelIcon} />
              <Text style={styles.networkLabelText}>
                Receive {selected.token.symbol} on {receiveChain.name}
              </Text>
              {!route?.params?.chain && <Text style={styles.networkLabelChevron}>⌄</Text>}
            </TouchableOpacity>

            <View style={styles.qrWrap}>
              <QRCode
                value={receiveAddress}
                size={QR_SIZE}
                backgroundColor="transparent"
                color={COLORS.text}
                logo={require("../../assets/logo.png")}
                logoSize={36}
                logoBackgroundColor={COLORS.background}
              />
            </View>

            <View style={styles.addressRow}>
              <Text style={styles.addressSliced} numberOfLines={1}>
                {formatAddress(receiveAddress, 6)}
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

            {/* Sending on the wrong network is unrecoverable — say it plainly */}
            <View style={styles.warn}>
              <Ionicons name="warning-outline" size={16} color={COLORS.warning} />
              <Text style={styles.warnText}>
                Only send {selected.token.symbol} on {receiveChain.name} to this address.
                {isSolanaChain(receiveChain)
                  ? " This is a Solana address — EVM networks can't send to it."
                  : " Make sure the sender picks the same network."}
              </Text>
            </View>
          </Animated.View>
        </ScrollView>
      )}
    </View>
  );
};

const createStyles = (theme) => {
  const C = theme.COLORS;
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: C.background },
    scroll: { flex: 1 },

    navHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: theme.SPACING.md,
      paddingTop: theme.SPACING.xl,
      paddingBottom: theme.SPACING.md,
    },
    backBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
    backArrow: { fontSize: 20, color: C.text, lineHeight: 22 },
    navTitle: {
      fontSize: theme.FONTS.sizes.lg,
      fontWeight: "700",
      color: C.text,
      letterSpacing: -0.3,
    },
    navSpacer: { width: 40 },

    errorContainer: {
      flex: 1,
      justifyContent: "center",
      alignItems: "center",
      backgroundColor: C.background,
    },
    errorText: { fontSize: theme.FONTS.sizes.lg, color: C.error },

    // ── Asset list ──
    search: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      marginHorizontal: theme.SPACING.md,
      paddingHorizontal: 14,
      height: 44,
      borderRadius: 22,
      backgroundColor: C.surface,
      borderWidth: 1,
      borderColor: C.border,
    },
    searchInput: { flex: 1, fontSize: 15, color: C.text, paddingVertical: 0 },
    chipsWrap: { flexGrow: 0 },
    chips: { paddingHorizontal: theme.SPACING.md, paddingVertical: 10, gap: 8 },
    chip: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      height: 32,
      paddingHorizontal: 12,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: C.border,
      backgroundColor: C.surface,
    },
    chipActive: { borderColor: C.primary, backgroundColor: C.primaryMuted },
    chipIcon: { width: 16, height: 16, borderRadius: 8 },
    chipText: { fontSize: 13, fontWeight: "700", color: C.textSecondary },
    assetList: { paddingHorizontal: theme.SPACING.md, paddingBottom: theme.SPACING.xl },
    assetRow: {
      height: ROW_HEIGHT,
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
    },
    assetIconWrap: { width: 38, height: 38 },
    assetIcon: { width: 38, height: 38, borderRadius: 19 },
    assetIconFallback: {
      backgroundColor: C.primaryMuted,
      alignItems: "center",
      justifyContent: "center",
    },
    assetIconText: { fontSize: 12, fontWeight: "800", color: C.text },
    assetText: { flex: 1, minWidth: 0 },
    assetSymbol: { fontSize: theme.FONTS.sizes.md, fontWeight: "700", color: C.text },
    assetName: { fontSize: 12, color: C.textSecondary, marginTop: 2 },
    footer: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, padding: 16 },
    footerText: { fontSize: 12, color: C.textTertiary },
    empty: { textAlign: "center", color: C.textSecondary, paddingVertical: 40 },

    // ── Receive details ──
    content: {
      flexGrow: 1,
      paddingHorizontal: theme.SPACING.lg,
      paddingBottom: 48,
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
      color: C.textSecondary,
      fontWeight: "600",
    },
    networkLabelChevron: { fontSize: 12, color: C.textTertiary, fontWeight: "700" },
    qrWrap: { alignItems: "center", justifyContent: "center", marginBottom: theme.SPACING.xl },
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
      color: C.text,
      letterSpacing: 0.3,
    },
    iconBtn: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: C.surface,
    },
    iconBtnSuccess: { backgroundColor: C.success ?? "#22c55e" },
    iconBtnGlyph: { fontSize: 15, color: C.text },
    warn: {
      flexDirection: "row",
      gap: 8,
      marginTop: theme.SPACING.xl,
      padding: theme.SPACING.md,
      borderRadius: 14,
      backgroundColor: `${C.warning}14`,
      alignSelf: "stretch",
    },
    warnText: { flex: 1, fontSize: 12, lineHeight: 17, color: C.textSecondary },
  });
};

export default ReceiveScreen;
