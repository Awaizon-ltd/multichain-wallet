import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  Modal,
  FlatList,
  TouchableOpacity,
  Image,
  Switch,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useChain } from "../../contexts/ChainContext";
import { useTheme } from "../../contexts/ThemeContext";

const prefetchIcons = (chains) => {
  chains.forEach((c) => c.icon && Image.prefetch(c.icon).catch(() => {}));
};

// ─── Sub-components ───────────────────────────────────────────────────────────

const ChainIcon = ({ uri, name, size = 36, COLORS }) => {
  const [err, setErr] = useState(false);
  if (!uri || err) {
    return (
      <View
        style={[
          styles.iconFallback,
          { width: size, height: size, borderRadius: size / 2, backgroundColor: COLORS.primary },
        ]}
      >
        <Text style={[styles.iconFallbackText, { color: COLORS.surface }]}>
          {name?.[0] ?? "?"}
        </Text>
      </View>
    );
  }
  return (
    <Image
      source={{ uri, cache: "force-cache" }}
      style={{ width: size, height: size, borderRadius: size / 2 }}
      onError={() => setErr(true)}
      fadeDuration={0}
    />
  );
};

const NetworkRow = React.memo(({ chain, enabled, onToggle, COLORS }) => (
  <View
    style={[
      styles.row,
      {
        backgroundColor: COLORS.surface,
        borderColor: enabled ? COLORS.primary + "30" : COLORS.border,
      },
    ]}
  >
    <ChainIcon uri={chain.icon} name={chain.name} size={36} COLORS={COLORS} />
    <View style={styles.rowInfo}>
      <View style={styles.rowNameRow}>
        <Text style={[styles.rowName, { color: COLORS.text }]}>{chain.name}</Text>
        {chain.testnet && (
          <View style={[styles.testnetBadge, { backgroundColor: COLORS.warning + "20" }]}>
            <Text style={[styles.testnetText, { color: COLORS.warning }]}>TESTNET</Text>
          </View>
        )}
      </View>
      <Text style={[styles.rowSymbol, { color: COLORS.textSecondary }]}>{chain.symbol}</Text>
    </View>
    <Switch
      value={enabled}
      onValueChange={onToggle}
      trackColor={{ false: COLORS.disabled, true: COLORS.primary + "60" }}
      thumbColor={enabled ? COLORS.primary : COLORS.textTertiary}
      ios_backgroundColor={COLORS.disabled}
    />
  </View>
));

const SectionHeader = ({ title, count, COLORS }) => (
  <View style={styles.sectionHeader}>
    <Text style={[styles.sectionTitle, { color: COLORS.textSecondary }]}>{title}</Text>
    <Text style={[styles.sectionCount, { color: COLORS.textTertiary }]}>{count}</Text>
  </View>
);

// ─── Main component ───────────────────────────────────────────────────────────

const NetworkManager = ({ visible, onClose }) => {
  const { COLORS } = useTheme();
  const { getAllChains, isNetworkEnabled, toggleNetwork } = useChain();
  const chains = getAllChains();

  useEffect(() => {
    if (visible && chains.length > 0) prefetchIcons(chains);
  }, [visible]);

  const mainnetChains = chains.filter((c) => !c.testnet);
  const testnetChains = chains.filter((c) => c.testnet);

  const listData = [
    { type: "header", title: "EVM Networks", count: mainnetChains.length, key: "h-main" },
    ...mainnetChains.map((c) => ({ type: "chain", chain: c, key: `c-${c.id}` })),
    ...(testnetChains.length > 0
      ? [
          { type: "header", title: "Testnet", count: testnetChains.length, key: "h-test" },
          ...testnetChains.map((c) => ({ type: "chain", chain: c, key: `c-${c.id}` })),
        ]
      : []),
  ];

  const renderItem = useCallback(
    ({ item }) => {
      if (item.type === "header") {
        return <SectionHeader title={item.title} count={item.count} COLORS={COLORS} />;
      }
      return (
        <NetworkRow
          chain={item.chain}
          enabled={isNetworkEnabled(item.chain.id)}
          onToggle={() => toggleNetwork(item.chain.id)}
          COLORS={COLORS}
        />
      );
    },
    [COLORS, isNetworkEnabled, toggleNetwork],
  );

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity
        style={styles.overlay}
        activeOpacity={1}
        onPress={onClose}
      >
        <TouchableOpacity
          activeOpacity={1}
          style={[styles.sheet, { backgroundColor: COLORS.card }]}
          onPress={(e) => e.stopPropagation()}
        >
          {/* Handle bar */}
          <View style={[styles.handle, { backgroundColor: COLORS.border }]} />

          {/* Header */}
          <View style={[styles.header, { borderBottomColor: COLORS.border }]}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.title, { color: COLORS.text }]}>Networks</Text>
              <Text style={[styles.subtitle, { color: COLORS.textSecondary }]}>
                Toggle which networks appear in your portfolio
              </Text>
            </View>
            <TouchableOpacity
              onPress={onClose}
              style={[styles.closeBtn, { backgroundColor: COLORS.surface }]}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="close" size={17} color={COLORS.textSecondary} />
            </TouchableOpacity>
          </View>

          <FlatList
            data={listData}
            keyExtractor={(item) => item.key}
            contentContainerStyle={styles.list}
            showsVerticalScrollIndicator={false}
            renderItem={renderItem}
            removeClippedSubviews
          />
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "flex-end",
  },
  sheet: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    maxHeight: "80%",
    paddingTop: 10,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    alignSelf: "center",
    marginBottom: 12,
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
  },
  title: { fontSize: 18, fontWeight: "700" },
  subtitle: { fontSize: 12, marginTop: 3, lineHeight: 18 },
  closeBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 12,
  },
  list: {
    paddingHorizontal: 16,
    paddingBottom: 36,
    paddingTop: 8,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 20,
    marginBottom: 10,
    paddingHorizontal: 2,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  sectionCount: { fontSize: 11 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 14,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    gap: 12,
  },
  rowInfo: { flex: 1 },
  rowNameRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  rowName: { fontSize: 15, fontWeight: "600" },
  rowSymbol: { fontSize: 12, marginTop: 2 },
  testnetBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  testnetText: { fontSize: 9, fontWeight: "700", textTransform: "uppercase" },
  iconFallback: { alignItems: "center", justifyContent: "center" },
  iconFallbackText: { fontWeight: "bold", fontSize: 14 },
});

export default NetworkManager;
