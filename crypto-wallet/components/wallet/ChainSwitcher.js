// components/wallet/ChainSwitcher.js
// Network picker bottom sheet + the pill button that opens it.
//
//   <ChainSelectorButton chain={chain} onPress={open} />
//   <ChainSwitcher visible onClose chains? selectedChain? onSelect? title? />
//
// Default mode switches ChainContext's active (EVM) chain — what the dApp
// browser uses. Pass `chains` + `selectedChain` + `onSelect` to pick from your
// own list without touching it (Swap / Advanced Swap do this so Solana can be
// offered too).
//
// Layout: search, then the default networks as a horizontal strip, then
// "Popular" / "More networks" / "Testnets" — every row showing the user's
// native balance on that network, so picking a chain to act on is informed.
import React, { memo, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Modal,
  FlatList,
  ScrollView,
  Pressable,
  Image,
  TextInput,
  Animated,
  Easing,
  ActivityIndicator,
  Dimensions,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { useChain } from "../../contexts/ChainContext";
import { useWallet } from "../../contexts/WalletContext";
import { useTheme } from "../../contexts/ThemeContext";
import { DEFAULT_NETWORK_IDS } from "../../constants/Chain";

const SCREEN_H = Dimensions.get("window").height;

// Compact native balance: 0 → "0", tiny → "<0.0001", else ≤ 4 decimals
const formatBalance = (formatted) => {
  const n = parseFloat(formatted);
  if (!n) return "0";
  if (n < 0.0001) return "<0.0001";
  if (n >= 1000) return n.toLocaleString(undefined, { maximumFractionDigits: 0 });
  return n.toLocaleString(undefined, { maximumFractionDigits: 4 });
};

// ── Chain icon with letter fallback ───────────────────────────────────────────
export const ChainIcon = memo(({ uri, name, size, COLORS }) => {
  const [failed, setFailed] = useState(false);
  if (!uri || failed) {
    return (
      <View
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: COLORS.primaryMuted,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Text style={{ fontSize: size * 0.42, fontWeight: "800", color: COLORS.text }}>
          {name?.[0] ?? "?"}
        </Text>
      </View>
    );
  }
  return (
    <Image
      source={{ uri, cache: "force-cache" }}
      onError={() => setFailed(true)}
      fadeDuration={0}
      style={{ width: size, height: size, borderRadius: size / 2 }}
    />
  );
});

// ── Trigger button ────────────────────────────────────────────────────────────
// `compact` = icon + chevron only (tight headers); default shows the name.
export const ChainSelectorButton = memo(({ chain, onPress, compact = false, style }) => {
  const { COLORS } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      hitSlop={6}
      accessibilityRole="button"
      accessibilityLabel={`Network: ${chain?.name ?? "none"}. Change network`}
      style={({ pressed }) => [
        {
          flexDirection: "row",
          alignItems: "center",
          gap: 6,
          paddingLeft: 4,
          paddingRight: 10,
          height: 34,
          borderRadius: 17,
          backgroundColor: COLORS.surface,
          borderWidth: 1,
          borderColor: COLORS.border,
        },
        pressed && { opacity: 0.75 },
        style,
      ]}
    >
      <View
        style={{
          padding: 2,
          borderRadius: 14,
          borderWidth: 1.5,
          borderColor: COLORS.primary,
        }}
      >
        <ChainIcon uri={chain?.icon} name={chain?.name} size={20} COLORS={COLORS} />
      </View>
      {!compact && (
        <Text
          numberOfLines={1}
          style={{ maxWidth: 110, fontSize: 13, fontWeight: "700", color: COLORS.text }}
        >
          {chain?.name?.replace(" Chain", "") ?? "Network"}
        </Text>
      )}
      <Ionicons name="chevron-down" size={13} color={COLORS.textSecondary} />
    </Pressable>
  );
});

// ── Sheet ─────────────────────────────────────────────────────────────────────
const ChainSwitcher = ({
  visible,
  onClose,
  chains: chainsProp,
  selectedChain,
  onSelect,
  title = "Select network",
}) => {
  const { COLORS } = useTheme();
  const insets = useSafeAreaInsets();
  const { activeChain: contextChain, switchChain, getAllChains } = useChain();
  const { getBalanceForChain } = useWallet();
  const chains = chainsProp ?? getAllChains();
  const activeChain = selectedChain ?? contextChain;

  const [query, setQuery] = useState("");
  const [pendingId, setPendingId] = useState(null);
  const [error, setError] = useState(null);

  const overlay = useRef(new Animated.Value(0)).current;
  const sheetY = useRef(new Animated.Value(SCREEN_H)).current;

  const styles = useMemo(() => makeStyles(COLORS), [COLORS]);

  useEffect(() => {
    chains.forEach((c) => c.icon && Image.prefetch(c.icon).catch(() => {}));
  }, [chains.length]);

  // ── Open / close animation ──────────────────────────────────────────────────
  useEffect(() => {
    if (!visible) return;
    setQuery("");
    setError(null);
    setPendingId(null);
    overlay.setValue(0);
    sheetY.setValue(SCREEN_H);
    Animated.parallel([
      Animated.timing(overlay, { toValue: 1, duration: 220, useNativeDriver: true }),
      Animated.spring(sheetY, { toValue: 0, tension: 70, friction: 13, useNativeDriver: true }),
    ]).start();
  }, [visible]);

  const close = () => {
    Animated.parallel([
      Animated.timing(overlay, { toValue: 0, duration: 180, useNativeDriver: true }),
      Animated.timing(sheetY, {
        toValue: SCREEN_H,
        duration: 220,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start(() => onClose());
  };

  const select = async (chain) => {
    if (pendingId) return;
    Haptics.selectionAsync().catch(() => {});
    if (chain.id === activeChain?.id) return close();
    setError(null);
    setPendingId(chain.id);
    try {
      await (onSelect ? onSelect(chain) : switchChain(chain));
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      close();
    } catch (e) {
      setError(e?.message || `Couldn't switch to ${chain.name}`);
    } finally {
      setPendingId(null);
    }
  };

  const balanceOf = (chain) => {
    const b = getBalanceForChain?.(chain.id);
    return b?.formatted != null ? formatBalance(b.formatted) : null;
  };

  // ── List data ───────────────────────────────────────────────────────────────
  const { featured, rows } = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q) {
      const hits = chains.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          c.symbol?.toLowerCase().includes(q) ||
          String(c.id).toLowerCase() === q,
      );
      return {
        featured: [],
        rows: hits.map((c) => ({ type: "row", chain: c, key: `r-${c.id}` })),
      };
    }

    const isDefault = (c) => DEFAULT_NETWORK_IDS.includes(c.id);
    const popular = DEFAULT_NETWORK_IDS.map((id) => chains.find((c) => c.id === id)).filter(Boolean);
    const more = chains.filter((c) => !isDefault(c) && !c.testnet);
    const testnets = chains.filter((c) => c.testnet);
    const section = (title, list, key) =>
      list.length
        ? [
            { type: "header", title, key: `h-${key}` },
            ...list.map((c) => ({ type: "row", chain: c, key: `r-${c.id}` })),
          ]
        : [];

    return {
      featured: popular,
      rows: [
        ...section("Popular", popular, "popular"),
        ...section("More networks", more, "more"),
        ...section("Testnets", testnets, "test"),
      ],
    };
  }, [chains, query]);

  // ── Renderers ───────────────────────────────────────────────────────────────
  const Chip = ({ chain }) => {
    const selected = chain.id === activeChain?.id;
    const pending = chain.id === pendingId;
    return (
      <Pressable
        onPress={() => select(chain)}
        style={({ pressed }) => [
          styles.chip,
          selected && styles.chipSelected,
          pressed && { transform: [{ scale: 0.96 }] },
        ]}
      >
        <View style={[styles.chipRing, selected && { borderColor: COLORS.primary }]}>
          <ChainIcon uri={chain.icon} name={chain.name} size={30} COLORS={COLORS} />
          {pending ? (
            <View style={styles.chipBadge}>
              <ActivityIndicator size="small" color={COLORS.text} />
            </View>
          ) : selected ? (
            <View style={[styles.check, styles.chipBadge]}>
              <Ionicons name="checkmark" size={10} color="#000" />
            </View>
          ) : null}
        </View>
        <Text style={styles.chipName} numberOfLines={1}>
          {chain.name.replace(" Chain", "")}
        </Text>
      </Pressable>
    );
  };

  const Row = ({ chain }) => {
    const selected = chain.id === activeChain?.id;
    const pending = chain.id === pendingId;
    const balance = balanceOf(chain);
    return (
      <Pressable
        onPress={() => select(chain)}
        style={({ pressed }) => [
          styles.row,
          selected && styles.rowSelected,
          pressed && !selected && { backgroundColor: COLORS.cardElevated },
        ]}
      >
        <ChainIcon uri={chain.icon} name={chain.name} size={38} COLORS={COLORS} />
        <View style={styles.rowText}>
          <View style={styles.rowTitleLine}>
            <Text style={styles.rowName} numberOfLines={1}>
              {chain.name}
            </Text>
            {chain.testnet ? (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>TESTNET</Text>
              </View>
            ) : chain.type === "solana" ? (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>SVM</Text>
              </View>
            ) : null}
          </View>
          <Text style={styles.rowSub} numberOfLines={1}>
            {chain.nativeTokenName || chain.symbol}
          </Text>
        </View>
        <View style={styles.rowRight}>
          {balance != null && (
            <Text style={[styles.rowBalance, balance === "0" && { color: COLORS.textTertiary }]}>
              {balance} <Text style={styles.rowSymbol}>{chain.symbol}</Text>
            </Text>
          )}
          {pending ? (
            <ActivityIndicator size="small" color={COLORS.text} />
          ) : selected ? (
            <View style={styles.check}>
              <Ionicons name="checkmark" size={13} color="#000" />
            </View>
          ) : (
            <View style={styles.radio} />
          )}
        </View>
      </Pressable>
    );
  };

  const renderItem = ({ item }) =>
    item.type === "header" ? (
      <Text style={styles.sectionTitle}>{item.title}</Text>
    ) : (
      <Row chain={item.chain} />
    );

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={close}
    >
      <Animated.View style={[styles.backdrop, { opacity: overlay }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={close} />
      </Animated.View>

      <Animated.View
        style={[
          styles.sheet,
          { paddingBottom: insets.bottom + 12, transform: [{ translateY: sheetY }] },
        ]}
      >
        <View style={styles.grabber} />

        {/* Header */}
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>{title}</Text>
            {activeChain ? (
              <View style={styles.connectedLine}>
                <View style={styles.dot} />
                <Text style={styles.connectedText} numberOfLines={1}>
                  On {activeChain.name}
                </Text>
              </View>
            ) : null}
          </View>
          <Pressable onPress={close} style={styles.closeBtn} hitSlop={8}>
            <Ionicons name="close" size={20} color={COLORS.text} />
          </Pressable>
        </View>

        {/* Search */}
        <View style={styles.search}>
          <Ionicons name="search" size={17} color={COLORS.textTertiary} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search networks"
            placeholderTextColor={COLORS.textTertiary}
            style={styles.searchInput}
            autoCorrect={false}
            autoCapitalize="none"
            returnKeyType="search"
          />
          {query ? (
            <Pressable onPress={() => setQuery("")} hitSlop={8}>
              <Ionicons name="close-circle" size={17} color={COLORS.textTertiary} />
            </Pressable>
          ) : null}
        </View>

        {/* Default networks strip */}
        {featured.length > 0 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chips}
            keyboardShouldPersistTaps="handled"
          >
            {featured.map((c) => (
              <Chip key={String(c.id)} chain={c} />
            ))}
          </ScrollView>
        )}

        {error ? (
          <View style={styles.error}>
            <Ionicons name="alert-circle" size={15} color={COLORS.error} />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        <FlatList
          data={rows}
          keyExtractor={(item) => item.key}
          renderItem={renderItem}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.list}
          initialNumToRender={12}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="globe-outline" size={28} color={COLORS.textTertiary} />
              <Text style={styles.emptyText}>No networks match “{query}”</Text>
            </View>
          }
        />
      </Animated.View>
    </Modal>
  );
};

const makeStyles = (C) =>
  StyleSheet.create({
    backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.55)" },
    sheet: {
      position: "absolute",
      left: 0,
      right: 0,
      bottom: 0,
      maxHeight: "86%",
      backgroundColor: C.background,
      borderTopLeftRadius: 28,
      borderTopRightRadius: 28,
      paddingTop: 8,
    },
    grabber: {
      alignSelf: "center",
      width: 40,
      height: 5,
      borderRadius: 3,
      backgroundColor: C.borderStrong ?? C.border,
      marginBottom: 6,
    },
    header: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 20,
      paddingVertical: 8,
      gap: 12,
    },
    title: { fontSize: 22, fontWeight: "800", color: C.text, letterSpacing: -0.4 },
    connectedLine: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 2 },
    dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: C.success },
    connectedText: { fontSize: 12, color: C.textSecondary, fontWeight: "600" },
    closeBtn: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: C.surface,
      alignItems: "center",
      justifyContent: "center",
    },
    search: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      marginHorizontal: 20,
      marginTop: 6,
      paddingHorizontal: 14,
      height: 44,
      borderRadius: 22,
      backgroundColor: C.surface,
      borderWidth: 1,
      borderColor: C.border,
    },
    searchInput: { flex: 1, fontSize: 15, color: C.text, paddingVertical: 0 },
    chips: { paddingHorizontal: 20, paddingTop: 14, paddingBottom: 4, gap: 10 },
    chip: {
      width: 76,
      alignItems: "center",
      paddingVertical: 10,
      borderRadius: 18,
      backgroundColor: C.surface,
      borderWidth: 1,
      borderColor: C.border,
      gap: 6,
    },
    chipSelected: { borderColor: C.primary, backgroundColor: C.primaryMuted },
    chipRing: {
      padding: 3,
      borderRadius: 22,
      borderWidth: 1.5,
      borderColor: "transparent",
    },
    chipBadge: { position: "absolute", right: -4, bottom: -4 },
    chipName: { fontSize: 12, fontWeight: "700", color: C.text, maxWidth: 68 },
    error: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      marginHorizontal: 20,
      marginTop: 10,
      padding: 10,
      borderRadius: 12,
      backgroundColor: `${C.error}14`,
    },
    errorText: { flex: 1, fontSize: 13, color: C.error },
    list: { paddingHorizontal: 12, paddingTop: 4, paddingBottom: 8 },
    sectionTitle: {
      fontSize: 12,
      fontWeight: "800",
      letterSpacing: 0.6,
      textTransform: "uppercase",
      color: C.textTertiary,
      paddingHorizontal: 8,
      paddingTop: 16,
      paddingBottom: 6,
    },
    row: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      paddingVertical: 10,
      paddingHorizontal: 8,
      borderRadius: 16,
    },
    rowSelected: { backgroundColor: C.primaryMuted },
    rowText: { flex: 1, minWidth: 0 },
    rowTitleLine: { flexDirection: "row", alignItems: "center", gap: 6 },
    rowName: { fontSize: 15, fontWeight: "700", color: C.text, flexShrink: 1 },
    rowSub: { fontSize: 12, color: C.textSecondary, marginTop: 2 },
    rowRight: { flexDirection: "row", alignItems: "center", gap: 10 },
    rowBalance: { fontSize: 13, fontWeight: "700", color: C.text, fontVariant: ["tabular-nums"] },
    rowSymbol: { fontSize: 11, fontWeight: "600", color: C.textSecondary },
    badge: {
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 6,
      backgroundColor: C.cardElevated,
    },
    badgeText: { fontSize: 9, fontWeight: "800", letterSpacing: 0.5, color: C.textSecondary },
    check: {
      width: 22,
      height: 22,
      borderRadius: 11,
      backgroundColor: C.primary,
      alignItems: "center",
      justifyContent: "center",
    },
    radio: {
      width: 22,
      height: 22,
      borderRadius: 11,
      borderWidth: 1.5,
      borderColor: C.border,
    },
    empty: { alignItems: "center", paddingVertical: 40, gap: 8 },
    emptyText: { fontSize: 14, color: C.textSecondary },
  });

export default ChainSwitcher;
