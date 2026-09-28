// AssetListComponent.js
// Reusable asset picker modal for BridgeScreen.
// To add new assets: append to BRIDGE_ASSETS array.

import React, { useMemo, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  FlatList,
  Image,
  StyleSheet,
  TextInput,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../../contexts/ThemeContext";
import { SPACING, FONTS, BORDER_RADIUS } from "../../constants/Theme";

/* ─── Asset registry ────────────────────────────────────────────────────────
   Add new assets here. Fields:
     id          — unique key
     symbol      — ticker shown in UI
     name        — full name
     type        — "native" | "token"
     l1Address   — ERC-20 address on Ethereum (null for native)
     l2Address   — ERC-20 address on Mantle   (null for native)
     logo        — remote image URI
─────────────────────────────────────────────────────────────────────────── */
export const BRIDGE_ASSETS = [
  {
    id: "eth",
    symbol: "ETH",
    name: "Ethereum",
    type: "native",
    l1Address: null,
    l2Address: null,
    logo: "https://cryptologos.cc/logos/ethereum-eth-logo.png?v=024",
  },
  {
    id: "usdt",
    symbol: "USDT",
    name: "Tether USD",
    type: "token",
    l1Address: "0xdAC17F958D2ee523a2206206994597C13D831ec7",
    l2Address: "0x201EBa5CC46D216Ce6DC03F6a759e8E766e956aE",
    logo: "https://cryptologos.cc/logos/tether-usdt-logo.png?v=024",
  },
  {
    id: "usdc",
    symbol: "USDC",
    name: "USD Coin",
    type: "token",
    l1Address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
    l2Address: "0x09Bc4E0D864854c6aFB6eB9A9cdF58aC190D0dF9",
    logo: "https://cryptologos.cc/logos/usd-coin-usdc-logo.png?v=024",
  },
  // ── Add more assets below ──────────────────────────────────────────────────
];

/* ─── AssetRow ───────────────────────────────────────────────────────────── */
const AssetRow = ({ asset, balance, isSelected, onSelect, COLORS }) => {
  const [imgErr, setImgErr] = useState(false);

  return (
    <TouchableOpacity
      onPress={() => onSelect(asset)}
      activeOpacity={0.7}
      style={[
        ar.row,
        {
          backgroundColor: isSelected ? COLORS.primary + "12" : "transparent",
          borderColor: isSelected ? COLORS.primary + "40" : "transparent",
        },
      ]}
    >
      {/* Logo */}
      <View style={[ar.logoWrap, { backgroundColor: COLORS.surface }]}>
        {(asset.logo || asset.logoURI) && !imgErr ? (
          <Image
            source={{ uri: asset.logo || asset.logoURI }}
            style={ar.logo}
            onError={() => setImgErr(true)}
          />
        ) : (
          <Text style={[ar.logoFallback, { color: COLORS.primary }]}>
            {asset.symbol[0]}
          </Text>
        )}
      </View>

      {/* Info */}
      <View style={ar.info}>
        <Text style={[ar.symbol, { color: COLORS.text }]}>{asset.symbol}</Text>
        <Text style={[ar.name, { color: COLORS.textSecondary }]}>
          {asset.name}
        </Text>
      </View>

      {/* Balance + check */}
      <View style={ar.right}>
        {balance != null && (
          <Text style={[ar.balance, { color: COLORS.textSecondary }]}>
            {parseFloat(balance).toFixed(4)}
          </Text>
        )}
        {isSelected && (
          <Ionicons
            name="checkmark-circle"
            size={18}
            color={COLORS.primary}
            style={{ marginTop: 2 }}
          />
        )}
      </View>
    </TouchableOpacity>
  );
};

const ar = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: SPACING.md,
    borderRadius: BORDER_RADIUS.md,
    borderWidth: 1,
    marginBottom: 4,
    gap: SPACING.sm,
  },
  logoWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  logo: { width: 40, height: 40, borderRadius: 20 },
  logoFallback: { fontSize: 16, fontWeight: "800" },
  info: { flex: 1 },
  symbol: { fontSize: FONTS.sizes.md, fontWeight: "700" },
  name: { fontSize: FONTS.sizes.xs, marginTop: 1 },
  right: { alignItems: "flex-end", gap: 2 },
  balance: { fontSize: FONTS.sizes.xs, fontWeight: "500" },
});

/* ─── AssetListComponent (modal) ─────────────────────────────────────────── */
// A stable key for an asset regardless of shape — the static BRIDGE_ASSETS
// registry uses `id`, while tokens fetched from the backend use `address`.
const assetKey = (a) => a?.id ?? a?.address ?? a?.symbol;

const AssetListComponent = ({
  visible,
  onClose,
  onSelect,
  selectedAsset,
  assets, // optional — falls back to the static BRIDGE_ASSETS registry
  balances = {}, // { [assetKey]: formatted balance string }
  title = "Select Asset",
}) => {
  const { COLORS } = useTheme();
  const [query, setQuery] = useState("");
  const source = assets && assets.length > 0 ? assets : BRIDGE_ASSETS;

  const filtered = useMemo(
    () =>
      query.trim()
        ? source.filter(
            (a) =>
              a.symbol.toLowerCase().includes(query.toLowerCase()) ||
              a.name.toLowerCase().includes(query.toLowerCase()),
          )
        : source,
    [query, source],
  );

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <TouchableOpacity
        style={m.backdrop}
        activeOpacity={1}
        onPress={onClose}
      />

      <View style={[m.sheet, { backgroundColor: COLORS.card }]}>
        {/* Handle */}
        <View style={[m.handle, { backgroundColor: COLORS.border }]} />

        {/* Header */}
        <View style={m.header}>
          <Text style={[m.title, { color: COLORS.text }]}>{title}</Text>
          <TouchableOpacity
            onPress={onClose}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons name="close" size={22} color={COLORS.textSecondary} />
          </TouchableOpacity>
        </View>

        {/* Search */}
        <View
          style={[
            m.searchWrap,
            { backgroundColor: COLORS.surface, borderColor: COLORS.border },
          ]}
        >
          <Ionicons
            name="search-outline"
            size={14}
            color={COLORS.textTertiary}
          />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search assets..."
            placeholderTextColor={COLORS.textTertiary}
            style={[m.searchInput, { color: COLORS.text }]}
            autoCorrect={false}
          />
          {query.length > 0 && (
            <TouchableOpacity onPress={() => setQuery("")}>
              <Ionicons
                name="close-circle"
                size={14}
                color={COLORS.textTertiary}
              />
            </TouchableOpacity>
          )}
        </View>

        {/* List */}
        <FlatList
          data={filtered}
          keyExtractor={(item) => assetKey(item)}
          renderItem={({ item }) => (
            <AssetRow
              asset={item}
              balance={balances[assetKey(item)]}
              isSelected={assetKey(selectedAsset) === assetKey(item)}
              onSelect={(a) => {
                onSelect(a);
                onClose();
              }}
              COLORS={COLORS}
            />
          )}
          contentContainerStyle={{
            paddingHorizontal: SPACING.md,
            paddingBottom: 24,
          }}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <Text style={[m.empty, { color: COLORS.textTertiary }]}>
              No assets found
            </Text>
          }
        />
      </View>
    </Modal>
  );
};

const m = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "#00000060",
  },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 12,
    maxHeight: "65%",
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
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: SPACING.md,
    marginBottom: SPACING.sm,
  },
  title: {
    fontSize: FONTS.sizes.lg,
    fontWeight: "700",
  },
  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginHorizontal: SPACING.md,
    marginBottom: SPACING.sm,
    borderWidth: 1,
    borderRadius: BORDER_RADIUS.md,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: FONTS.sizes.sm,
    padding: 0,
  },
  empty: {
    textAlign: "center",
    fontSize: FONTS.sizes.sm,
    marginTop: SPACING.lg,
  },
});

export default AssetListComponent;
