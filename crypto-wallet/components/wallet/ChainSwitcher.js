// components/wallet/ChainSwitcher.js
// Bottom-sheet network picker: search, the connected network up top,
// featured networks as tiles, then every other network (testnets last).
import React, { memo, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Modal,
  FlatList,
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
import { useTheme } from "../../contexts/ThemeContext";
import { DEFAULT_CHAIN } from "../../constants/Chain";

// Networks shown as large tiles at the top (when not searching)
const FEATURED_IDS = [DEFAULT_CHAIN.id, 4663, 1, 8453];

const SCREEN_H = Dimensions.get("window").height;

// ── Chain icon with letter fallback ───────────────────────────────────────────
const ChainIcon = memo(({ uri, name, size, COLORS }) => {
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

const ChainSwitcher = ({ visible, onClose }) => {
  const { COLORS } = useTheme();
  const insets = useSafeAreaInsets();
  const { activeChain, switchChain, getAllChains } = useChain();
  const chains = getAllChains();

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
      await switchChain(chain);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      close();
    } catch (e) {
      setError(e?.message || `Couldn't switch to ${chain.name}`);
    } finally {
      setPendingId(null);
    }
  };

  // ── List data ───────────────────────────────────────────────────────────────
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q) {
      const hits = chains.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          c.symbol?.toLowerCase().includes(q) ||
          String(c.id) === q,
      );
      return hits.map((c) => ({ type: "row", chain: c, key: `r-${c.id}` }));
    }

    const featured = FEATURED_IDS.map((id) => chains.find((c) => c.id === id)).filter(Boolean);
    const rest = chains.filter((c) => !FEATURED_IDS.includes(c.id));
    const mainnets = rest.filter((c) => !c.testnet);
    const testnets = rest.filter((c) => c.testnet);

    return [
      ...(featured.length ? [{ type: "featured", chains: featured, key: "featured" }] : []),
      ...(mainnets.length ? [{ type: "header", title: "All networks", key: "h-all" }] : []),
      ...mainnets.map((c) => ({ type: "row", chain: c, key: `r-${c.id}` })),
      ...(testnets.length ? [{ type: "header", title: "Testnets", key: "h-test" }] : []),
      ...testnets.map((c) => ({ type: "row", chain: c, key: `r-${c.id}` })),
    ];
  }, [chains, query]);

  // ── Renderers ───────────────────────────────────────────────────────────────
  const Tile = ({ chain }) => {
    const selected = chain.id === activeChain?.id;
    const pending = chain.id === pendingId;
    return (
      <Pressable
        onPress={() => select(chain)}
        style={({ pressed }) => [
          styles.tile,
          selected && styles.tileSelected,
          pressed && { transform: [{ scale: 0.97 }] },
        ]}
      >
        <ChainIcon uri={chain.icon} name={chain.name} size={34} COLORS={COLORS} />
        <Text style={styles.tileName} numberOfLines={1}>
          {chain.name.replace(" Chain", "")}
        </Text>
        {pending ? (
          <ActivityIndicator size="small" color={COLORS.text} style={styles.tileCorner} />
        ) : selected ? (
          <View style={[styles.check, styles.tileCorner]}>
            <Ionicons name="checkmark" size={11} color="#000" />
          </View>
        ) : null}
      </Pressable>
    );
  };

  const Row = ({ chain }) => {
    const selected = chain.id === activeChain?.id;
    const pending = chain.id === pendingId;
    return (
      <Pressable
        onPress={() => select(chain)}
        style={({ pressed }) => [
          styles.row,
          selected && styles.rowSelected,
          pressed && !selected && { backgroundColor: COLORS.cardElevated },
        ]}
      >
        <ChainIcon uri={chain.icon} name={chain.name} size={36} COLORS={COLORS} />
        <View style={styles.rowText}>
          <View style={styles.rowTitleLine}>
            <Text style={styles.rowName} numberOfLines={1}>
              {chain.name}
            </Text>
            {chain.testnet ? (
              <View style={styles.testBadge}>
                <Text style={styles.testText}>TESTNET</Text>
              </View>
            ) : null}
          </View>
          <Text style={styles.rowSub}>
            {chain.symbol} · Chain ID {chain.id}
          </Text>
        </View>
        {pending ? (
          <ActivityIndicator size="small" color={COLORS.text} />
        ) : selected ? (
          <View style={styles.check}>
            <Ionicons name="checkmark" size={13} color="#000" />
          </View>
        ) : (
          <View style={styles.radio} />
        )}
      </Pressable>
    );
  };

  const renderItem = ({ item }) => {
    if (item.type === "featured") {
      return (
        <View style={styles.tiles}>
          {item.chains.map((c) => (
            <Tile key={c.id} chain={c} />
          ))}
        </View>
      );
    }
    if (item.type === "header") {
      return <Text style={styles.sectionTitle}>{item.title}</Text>;
    }
    return <Row chain={item.chain} />;
  };

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
          <Text style={styles.title}>Select network</Text>
          <Pressable onPress={close} style={styles.closeBtn} hitSlop={8}>
            <Ionicons name="close" size={20} color={COLORS.text} />
          </Pressable>
        </View>

        {/* Connected network */}
        {activeChain ? (
          <View style={styles.current}>
            <ChainIcon uri={activeChain.icon} name={activeChain.name} size={40} COLORS={COLORS} />
            <View style={{ flex: 1 }}>
              <View style={styles.connectedLine}>
                <View style={styles.dot} />
                <Text style={styles.connectedText}>Connected</Text>
              </View>
              <Text style={styles.currentName} numberOfLines={1}>
                {activeChain.name}
              </Text>
            </View>
            <View style={styles.symbolPill}>
              <Text style={styles.symbolText}>{activeChain.symbol}</Text>
            </View>
          </View>
        ) : null}

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
      backgroundColor: C.borderStrong,
      marginBottom: 8,
    },
    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 20,
      paddingVertical: 8,
    },
    title: { fontSize: 22, fontWeight: "800", color: C.text, letterSpacing: -0.4 },
    closeBtn: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: C.surface,
      alignItems: "center",
      justifyContent: "center",
    },

    current: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      marginHorizontal: 16,
      marginTop: 6,
      padding: 14,
      borderRadius: 20,
      backgroundColor: C.primaryMuted,
      borderWidth: 1,
      borderColor: C.primary + "55",
    },
    connectedLine: { flexDirection: "row", alignItems: "center", gap: 6 },
    dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: C.success },
    connectedText: { fontSize: 12, fontWeight: "700", color: C.textSecondary },
    currentName: { fontSize: 17, fontWeight: "800", color: C.text, marginTop: 2 },
    symbolPill: {
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: 999,
      backgroundColor: C.background,
    },
    symbolText: { fontSize: 12, fontWeight: "800", color: C.text },

    search: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      marginHorizontal: 16,
      marginTop: 14,
      marginBottom: 6,
      paddingHorizontal: 14,
      height: 46,
      borderRadius: 14,
      backgroundColor: C.surface,
      borderWidth: 1,
      borderColor: C.border,
    },
    searchInput: { flex: 1, fontSize: 15, color: C.text, paddingVertical: 0 },

    error: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      marginHorizontal: 16,
      marginTop: 6,
      padding: 10,
      borderRadius: 12,
      backgroundColor: C.error + "14",
    },
    errorText: { flex: 1, fontSize: 13, color: C.error },

    list: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 8 },
    sectionTitle: {
      fontSize: 12,
      fontWeight: "800",
      color: C.textTertiary,
      textTransform: "uppercase",
      letterSpacing: 0.8,
      marginTop: 16,
      marginBottom: 8,
      marginLeft: 4,
    },

    tiles: { flexDirection: "row", gap: 8, marginTop: 4 },
    tile: {
      flex: 1,
      alignItems: "center",
      gap: 8,
      paddingVertical: 14,
      paddingHorizontal: 4,
      borderRadius: 18,
      backgroundColor: C.surface,
      borderWidth: 1.5,
      borderColor: C.border,
    },
    tileSelected: { borderColor: C.primary, backgroundColor: C.primaryMuted },
    tileName: { fontSize: 12, fontWeight: "700", color: C.text, maxWidth: "100%" },
    tileCorner: { position: "absolute", top: 6, right: 6 },

    row: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      paddingVertical: 11,
      paddingHorizontal: 12,
      borderRadius: 16,
      marginBottom: 4,
      borderWidth: 1.5,
      borderColor: "transparent",
    },
    rowSelected: { backgroundColor: C.primaryMuted, borderColor: C.primary },
    rowText: { flex: 1, minWidth: 0 },
    rowTitleLine: { flexDirection: "row", alignItems: "center", gap: 8 },
    rowName: { fontSize: 15, fontWeight: "700", color: C.text, flexShrink: 1 },
    rowSub: { fontSize: 12, color: C.textTertiary, marginTop: 2 },
    testBadge: {
      paddingHorizontal: 6,
      paddingVertical: 1,
      borderRadius: 6,
      backgroundColor: C.warning + "22",
    },
    testText: { fontSize: 9, fontWeight: "800", color: C.warning, letterSpacing: 0.5 },
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
      borderColor: C.borderStrong,
    },

    empty: { alignItems: "center", paddingVertical: 36, gap: 10 },
    emptyText: { fontSize: 14, color: C.textSecondary },
  });

export default ChainSwitcher;
