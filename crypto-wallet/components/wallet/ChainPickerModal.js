// components/wallet/ChainPickerModal.js
// Small, local "pick one chain from this list" sheet — used by BridgeScreen
// for its From/To chain pickers. Unlike ChainSwitcher, selecting a chain here
// does not change the app's active chain; the caller owns the selected value.
import React, { useState } from "react";
import { View, Text, StyleSheet, Modal, TouchableOpacity, FlatList, Image } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../../contexts/ThemeContext";
import { SPACING, FONTS, BORDER_RADIUS } from "../../constants/Theme";

const ChainRow = ({ chain, isSelected, onPress, COLORS }) => {
  const [err, setErr] = useState(false);
  return (
    <TouchableOpacity
      style={[styles.row, { borderBottomColor: COLORS.border }]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      {chain.icon && !err ? (
        <Image
          source={{ uri: chain.icon }}
          style={styles.icon}
          onError={() => setErr(true)}
        />
      ) : (
        <View style={[styles.iconFallback, { backgroundColor: COLORS.border }]} />
      )}
      <View style={{ flex: 1 }}>
        <Text style={[styles.name, { color: COLORS.text }]}>{chain.name}</Text>
        <Text style={[styles.symbol, { color: COLORS.textSecondary }]}>{chain.symbol}</Text>
      </View>
      {isSelected && <Ionicons name="checkmark-circle" size={20} color={COLORS.primary} />}
    </TouchableOpacity>
  );
};

export default function ChainPickerModal({
  visible,
  onClose,
  onSelect,
  chains = [],
  selectedChainId,
  title = "Select Chain",
}) {
  const { COLORS } = useTheme();

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={[styles.sheet, { backgroundColor: COLORS.background }]}>
          <View style={[styles.header, { borderBottomColor: COLORS.border }]}>
            <Text style={[styles.title, { color: COLORS.text }]}>{title}</Text>
            <TouchableOpacity onPress={onClose} style={styles.close}>
              <Ionicons name="close" size={22} color={COLORS.text} />
            </TouchableOpacity>
          </View>
          <FlatList
            data={chains}
            keyExtractor={(c) => String(c.id)}
            renderItem={({ item }) => (
              <ChainRow
                chain={item}
                isSelected={item.id === selectedChainId}
                onPress={() => onSelect(item)}
                COLORS={COLORS}
              />
            )}
            style={{ maxHeight: 420 }}
          />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "flex-end" },
  sheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingBottom: 24 },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: SPACING.md,
    borderBottomWidth: 1,
  },
  title: { fontSize: FONTS.sizes.md, fontWeight: "700" },
  close: { padding: 4 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: SPACING.md,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  icon: { width: 30, height: 30, borderRadius: 15 },
  iconFallback: { width: 30, height: 30, borderRadius: 15 },
  name: { fontSize: FONTS.sizes.sm, fontWeight: "700" },
  symbol: { fontSize: FONTS.sizes.xs, marginTop: 1 },
});
