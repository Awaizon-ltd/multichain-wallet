import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Modal,
  FlatList,
  TouchableOpacity,
  Image,
} from "react-native";
import { useChain } from "../../contexts/ChainContext";
import { useTheme } from "../../contexts/ThemeContext";

const ChainSwitcher = ({ visible, onClose }) => {
  const { COLORS, SPACING, FONTS, BORDER_RADIUS, SHADOWS } = useTheme();
  const { activeChain, switchChain, getAllChains } = useChain();
  const chains = getAllChains();

  const handleSelectChain = async (chain) => {
    if (chain.id === activeChain.id) {
      onClose();
      return;
    }

    try {
      await switchChain(chain);
      onClose();
    } catch (error) {
      console.error("Error switching chain:", error);
    }
  };

  const styles = createStyles({
    COLORS,
    SPACING,
    FONTS,
    BORDER_RADIUS,
    SHADOWS,
  });

  // Chain icon with fallback
  const ChainIcon = ({ uri, name, size = 32 }) => {
    const [imageError, setImageError] = useState(false);

    if (!uri || imageError) {
      return (
        <View
          style={[
            styles.iconFallback,
            { width: size, height: size, borderRadius: size / 2 },
          ]}
        >
          <Text style={styles.iconFallbackText}>{name?.[0] || "?"}</Text>
        </View>
      );
    }

    return (
      <Image
        source={{ uri }}
        style={{ width: size, height: size, borderRadius: size / 2 }}
        onError={() => setImageError(true)}
      />
    );
  };

  const renderChain = ({ item }) => {
    const isSelected = item.id === activeChain?.id;

    return (
      <TouchableOpacity
        onPress={() => handleSelectChain(item)}
        activeOpacity={0.7}
      >
        <View
          style={[styles.chainItem, isSelected && styles.chainItemSelected]}
        >
          <View style={styles.chainLeft}>
            <ChainIcon uri={item.icon} name={item.name} size={32} />

            <View style={styles.chainInfo}>
              <View style={styles.chainNameRow}>
                <Text
                  style={[
                    styles.chainName,
                    isSelected && styles.chainNameSelected,
                  ]}
                >
                  {item.name}
                </Text>
                {item.testnet && (
                  <View style={styles.testnetBadge}>
                    <Text style={styles.testnetText}>TEST</Text>
                  </View>
                )}
              </View>
              <Text style={styles.chainSymbol}>{item.symbol}</Text>
            </View>
          </View>

          {isSelected && (
            <View style={styles.selectedBadge}>
              <Text style={styles.checkmark}>✓</Text>
            </View>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <TouchableOpacity
        style={styles.modalOverlay}
        activeOpacity={1}
        onPress={onClose}
      >
        <TouchableOpacity
          activeOpacity={1}
          style={styles.modalContent}
          onPress={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <View style={styles.header}>
            <View>
              <Text style={styles.title}>Select Network</Text>
              <Text style={styles.subtitle}>
                {chains.length} networks available
              </Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Text style={styles.closeText}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* Chains List */}
          <FlatList
            data={chains}
            renderItem={renderChain}
            keyExtractor={(item) => item.id.toString()}
            contentContainerStyle={styles.list}
            showsVerticalScrollIndicator={false}
          />
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
};

const createStyles = ({ COLORS, SPACING, FONTS, BORDER_RADIUS, SHADOWS }) =>
  StyleSheet.create({
    modalOverlay: {
      flex: 1,
      backgroundColor: "rgba(0, 0, 0, 0.6)",
      justifyContent: "flex-end",
    },
    modalContent: {
      backgroundColor: COLORS.card,
      borderTopLeftRadius: BORDER_RADIUS.xxl,
      borderTopRightRadius: BORDER_RADIUS.xxl,
      maxHeight: "70%",
      paddingTop: SPACING.lg,
      ...SHADOWS.xl,
    },
    header: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "flex-start",
      paddingHorizontal: SPACING.lg,
      paddingBottom: SPACING.md,
      borderBottomWidth: 1,
      borderBottomColor: COLORS.border,
    },
    title: {
      fontSize: FONTS.sizes.xl,
      fontWeight: "bold",
      color: COLORS.text,
      fontFamily: FONTS.bold,
    },
    subtitle: {
      fontSize: FONTS.sizes.sm,
      color: COLORS.textSecondary,
      marginTop: SPACING.xs,
      fontFamily: FONTS.regular,
    },
    closeButton: {
      width: 32,
      height: 32,
      borderRadius: BORDER_RADIUS.round,
      backgroundColor: COLORS.surface,
      justifyContent: "center",
      alignItems: "center",
    },
    closeText: {
      fontSize: FONTS.sizes.xl,
      color: COLORS.textSecondary,
      fontWeight: "300",
    },
    list: {
      paddingHorizontal: SPACING.lg,
      paddingTop: SPACING.md,
      paddingBottom: SPACING.xl,
    },
    chainItem: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      backgroundColor: COLORS.surface,
      paddingVertical: SPACING.sm,
      paddingHorizontal: SPACING.md,
      borderRadius: BORDER_RADIUS.md,
      marginBottom: SPACING.xs,
      borderWidth: 2,
      borderColor: "transparent",
    },
    chainItemSelected: {
      borderColor: COLORS.primary,
      backgroundColor: COLORS.cardElevated,
    },
    chainLeft: {
      flexDirection: "row",
      alignItems: "center",
      flex: 1,
    },
    iconFallback: {
      backgroundColor: COLORS.primary,
      justifyContent: "center",
      alignItems: "center",
      marginRight: SPACING.md,
    },
    iconFallbackText: {
      color: COLORS.surface,
      fontSize: FONTS.sizes.md,
      fontWeight: "bold",
      fontFamily: FONTS.bold,
    },
    chainInfo: {
      flex: 1,
      marginLeft: SPACING.md,
    },
    chainNameRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: SPACING.sm,
    },
    chainName: {
      fontSize: FONTS.sizes.md,
      fontWeight: "600",
      color: COLORS.text,
      fontFamily: FONTS.semiBold,
    },
    chainNameSelected: {
      color: COLORS.primary,
    },
    chainSymbol: {
      fontSize: FONTS.sizes.xs,
      color: COLORS.textSecondary,
      marginTop: 2,
      fontFamily: FONTS.regular,
    },
    testnetBadge: {
      backgroundColor: COLORS.warning,
      paddingHorizontal: SPACING.sm,
      paddingVertical: 2,
      borderRadius: SPACING.xs,
    },
    testnetText: {
      fontSize: FONTS.sizes.xs,
      color: COLORS.surface,
      fontWeight: "bold",
      fontFamily: FONTS.bold,
    },
    selectedBadge: {
      width: 22,
      height: 22,
      borderRadius: BORDER_RADIUS.round,
      backgroundColor: COLORS.primary,
      justifyContent: "center",
      alignItems: "center",
      marginLeft: SPACING.sm,
    },
    checkmark: {
      fontSize: FONTS.sizes.sm,
      color: COLORS.surface,
      fontWeight: "bold",
    },
  });

export default ChainSwitcher;
