import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  Modal,
  FlatList,
  TouchableOpacity,
  Image,
  SectionList,
} from "react-native";
import { useChain } from "../../contexts/ChainContext";
import { useTheme } from "../../contexts/ThemeContext";
import { DEFAULT_CHAIN } from "../../constants/Chain";

// ─── Prefetch all chain icons on first load ───────────────────────────────────
const prefetchChainIcons = (chains) => {
  chains.forEach((chain) => {
    if (chain.icon) Image.prefetch(chain.icon).catch(() => {});
  });
};

// Chain IDs that get the "featured" treatment at the top
const FEATURED_CHAIN_IDS = [DEFAULT_CHAIN.id, 1]; // Default chain, Ethereum

const ChainSwitcher = ({ visible, onClose }) => {
  const { COLORS, SPACING, FONTS, BORDER_RADIUS, SHADOWS } = useTheme();
  const { activeChain, switchChain, getAllChains } = useChain();
  const chains = getAllChains();

  useEffect(() => {
    if (chains.length > 0) prefetchChainIcons(chains);
  }, [chains.length]);

  // ── Split into featured vs other ──────────────────────────────────────────
  const featuredChains = FEATURED_CHAIN_IDS.map((id) =>
    chains.find((c) => c.id === id),
  ).filter(Boolean);

  const otherChains = chains.filter((c) => !FEATURED_CHAIN_IDS.includes(c.id));

  const sections = [
    { title: "Main Networks", data: featuredChains },
    ...(otherChains.length > 0
      ? [{ title: "Other EVM Chains", data: otherChains }]
      : []),
  ];

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

  // ── Chain icon with fallback ──────────────────────────────────────────────
  const ChainIcon = ({ uri, name, size = 36 }) => {
    const [err, setErr] = useState(false);
    if (!uri || err) {
      return (
        <View
          style={[
            styles.iconFallback,
            { width: size, height: size, borderRadius: size / 2 },
          ]}
        >
          <Text style={styles.iconFallbackText}>{name?.[0] ?? "?"}</Text>
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

  // ── Featured card (larger, more prominent) ────────────────────────────────
  const FeaturedChainCard = ({ item }) => {
    const isSelected = item.id === activeChain?.id;
    const isPrimary = item.id === DEFAULT_CHAIN.id;

    return (
      <TouchableOpacity
        onPress={() => handleSelectChain(item)}
        activeOpacity={0.75}
        style={styles.featuredCardWrapper}
      >
        <View
          style={[
            styles.featuredCard,
            isSelected && { borderColor: COLORS.primary, borderWidth: 2 },
            isPrimary && styles.featuredCardHighlight,
          ]}
        >
          {/* Top-right selected badge */}
          {isSelected && (
            <View style={styles.featuredSelectedBadge}>
              <Text style={styles.checkmark}>✓</Text>
            </View>
          )}

          {/* "Primary" label for Mantle */}
          {isPrimary && (
            <View style={styles.primaryLabel}>
              <Text style={styles.primaryLabelText}>Primary</Text>
            </View>
          )}

          <ChainIcon uri={item.icon} name={item.name} size={44} />

          <Text
            style={[
              styles.featuredName,
              isSelected && { color: COLORS.primary },
            ]}
            numberOfLines={1}
          >
            {item.name}
          </Text>
          <Text style={styles.featuredSymbol}>{item.symbol}</Text>

          {item.testnet && (
            <View style={[styles.testnetBadge, { marginTop: 4 }]}>
              <Text style={styles.testnetText}>TESTNET</Text>
            </View>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  // ── Regular list row (other chains) ──────────────────────────────────────
  const ChainRow = ({ item }) => {
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
                    isSelected && { color: COLORS.primary },
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

  // ── Section header ────────────────────────────────────────────────────────
  const SectionHeader = ({ title }) => (
    <View style={styles.sectionHeader}>
      <View style={styles.sectionHeaderLine} />
      <Text style={styles.sectionHeaderText}>{title}</Text>
      <View style={styles.sectionHeaderLine} />
    </View>
  );

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

          <SectionList
            sections={sections}
            keyExtractor={(item) => item.id.toString()}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.listContent}
            renderSectionHeader={({ section }) => (
              <SectionHeader title={section.title} />
            )}
            renderItem={({ item, section }) => {
              if (section.title === "Main Networks") {
                // Render featured cards side-by-side via a row wrapper
                // SectionList calls renderItem once per item, so we render
                // a full-width featured card per item and use flexbox row
                // via a surrounding view in the section header render.
                // Simpler: just render each as a full-width featured row.
                return <FeaturedChainCard item={item} />;
              }
              return <ChainRow item={item} />;
            }}
            // Wrap the two featured cards in a horizontal row
            renderSectionFooter={() => null}
            stickySectionHeadersEnabled={false}
          />
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
};

// ─── We render featured cards in a horizontal pair by overriding the section ──
// Replace the SectionList with a custom scroll so we can control the
// featured row layout precisely.
const ChainSwitcherInner = ({ visible, onClose }) => {
  const { COLORS, SPACING, FONTS, BORDER_RADIUS, SHADOWS } = useTheme();
  const { activeChain, switchChain, getAllChains } = useChain();
  const chains = getAllChains();

  useEffect(() => {
    if (chains.length > 0) prefetchChainIcons(chains);
  }, [chains.length]);

  const featuredChains = FEATURED_CHAIN_IDS.map((id) =>
    chains.find((c) => c.id === id),
  ).filter(Boolean);

  const otherChains = chains.filter((c) => !FEATURED_CHAIN_IDS.includes(c.id));

  const handleSelectChain = async (chain) => {
    if (chain.id === activeChain.id) {
      onClose();
      return;
    }
    try {
      await switchChain(chain);
      onClose();
    } catch (e) {
      console.error("Error switching chain:", e);
    }
  };

  const styles = createStyles({
    COLORS,
    SPACING,
    FONTS,
    BORDER_RADIUS,
    SHADOWS,
  });

  const ChainIcon = ({ uri, name, size = 36 }) => {
    const [err, setErr] = useState(false);
    if (!uri || err) {
      return (
        <View
          style={[
            styles.iconFallback,
            { width: size, height: size, borderRadius: size / 2 },
          ]}
        >
          <Text style={styles.iconFallbackText}>{name?.[0] ?? "?"}</Text>
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

  const FeaturedCard = ({ chain }) => {
    const isSelected = chain.id === activeChain?.id;
    const isPrimary = chain.id === DEFAULT_CHAIN.id;

    return (
      <TouchableOpacity
        onPress={() => handleSelectChain(chain)}
        activeOpacity={0.75}
        style={{ flex: 1 }}
      >
        <View
          style={[
            styles.featuredCard,
            isSelected && { borderColor: COLORS.primary, borderWidth: 2 },
          ]}
        >
          {isSelected && (
            <View style={styles.featuredSelectedBadge}>
              <Text style={styles.checkmark}>✓</Text>
            </View>
          )}
          {isPrimary && (
            <View style={styles.primaryLabel}>
              <Text style={styles.primaryLabelText}>Primary</Text>
            </View>
          )}
          <ChainIcon uri={chain.icon} name={chain.name} size={48} />
          <Text
            style={[
              styles.featuredName,
              isSelected && { color: COLORS.primary },
            ]}
            numberOfLines={1}
          >
            {chain.name}
          </Text>
          <Text style={styles.featuredSymbol}>{chain.symbol}</Text>
        </View>
      </TouchableOpacity>
    );
  };

  const ChainRow = ({ chain }) => {
    const isSelected = chain.id === activeChain?.id;
    return (
      <TouchableOpacity
        onPress={() => handleSelectChain(chain)}
        activeOpacity={0.7}
      >
        <View
          style={[styles.chainItem, isSelected && styles.chainItemSelected]}
        >
          <View style={styles.chainLeft}>
            <ChainIcon uri={chain.icon} name={chain.name} size={32} />
            <View style={styles.chainInfo}>
              <View style={styles.chainNameRow}>
                <Text
                  style={[
                    styles.chainName,
                    isSelected && { color: COLORS.primary },
                  ]}
                >
                  {chain.name}
                </Text>
                {chain.testnet && (
                  <View style={styles.testnetBadge}>
                    <Text style={styles.testnetText}>TEST</Text>
                  </View>
                )}
              </View>
              <Text style={styles.chainSymbol}>{chain.symbol}</Text>
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

  // Build a flat data array for FlatList so we avoid SectionList layout quirks
  const listData = [
    { type: "sectionHeader", title: "Main Networks", key: "header-main" },
    { type: "featuredRow", chains: featuredChains, key: "featured-row" },
    ...(otherChains.length > 0
      ? [
          {
            type: "sectionHeader",
            title: "Other EVM Chains",
            key: "header-evm",
          },
          ...otherChains.map((c) => ({
            type: "chainRow",
            chain: c,
            key: `chain-${c.id}`,
          })),
        ]
      : []),
  ];

  const renderItem = ({ item }) => {
    if (item.type === "sectionHeader") {
      return (
        <View style={styles.sectionHeader}>
          <View style={styles.sectionHeaderLine} />
          <Text style={styles.sectionHeaderText}>{item.title}</Text>
          <View style={styles.sectionHeaderLine} />
        </View>
      );
    }
    if (item.type === "featuredRow") {
      return (
        <View style={styles.featuredRow}>
          {item.chains.map((c) => (
            <FeaturedCard key={c.id} chain={c} />
          ))}
        </View>
      );
    }
    return <ChainRow chain={item.chain} />;
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

          <FlatList
            data={listData}
            keyExtractor={(item) => item.key}
            renderItem={renderItem}
            contentContainerStyle={styles.listContent}
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
      backgroundColor: "rgba(0,0,0,0.6)",
      justifyContent: "flex-end",
    },
    modalContent: {
      backgroundColor: COLORS.card,
      borderTopLeftRadius: BORDER_RADIUS.xxl,
      borderTopRightRadius: BORDER_RADIUS.xxl,
      maxHeight: "75%",
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
    },
    subtitle: {
      fontSize: FONTS.sizes.sm,
      color: COLORS.textSecondary,
      marginTop: SPACING.xs,
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
    listContent: {
      paddingHorizontal: SPACING.lg,
      paddingTop: SPACING.sm,
      paddingBottom: SPACING.xl,
    },

    // ── Section header ──────────────────────────────────────────────────────
    sectionHeader: {
      flexDirection: "row",
      alignItems: "center",
      gap: SPACING.sm,
      marginTop: SPACING.md,
      marginBottom: SPACING.sm,
    },
    sectionHeaderLine: {
      flex: 1,
      height: 1,
      backgroundColor: COLORS.border,
    },
    sectionHeaderText: {
      fontSize: FONTS.sizes.xs,
      fontWeight: "700",
      color: COLORS.textSecondary,
      textTransform: "uppercase",
      letterSpacing: 1,
    },

    // ── Featured row ────────────────────────────────────────────────────────
    featuredRow: {
      flexDirection: "row",
      gap: SPACING.sm,
      marginBottom: SPACING.xs,
    },
    featuredCard: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: COLORS.surface,
      borderRadius: BORDER_RADIUS.lg,
      paddingVertical: SPACING.md + 4,
      paddingHorizontal: SPACING.sm,
      borderWidth: 2,
      borderColor: "transparent",
      position: "relative",
      minHeight: 120,
    },
    featuredSelectedBadge: {
      position: "absolute",
      top: 8,
      right: 8,
      width: 20,
      height: 20,
      borderRadius: 10,
      backgroundColor: COLORS.primary,
      justifyContent: "center",
      alignItems: "center",
    },
    primaryLabel: {
      position: "absolute",
      top: 8,
      left: 8,
      backgroundColor: COLORS.primary + "22",
      borderRadius: 6,
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderWidth: 1,
      borderColor: COLORS.primary + "44",
    },
    primaryLabelText: {
      fontSize: 9,
      fontWeight: "700",
      color: COLORS.primary,
      textTransform: "uppercase",
      letterSpacing: 0.5,
    },
    featuredName: {
      fontSize: FONTS.sizes.sm,
      fontWeight: "700",
      color: COLORS.text,
      marginTop: SPACING.sm,
      textAlign: "center",
    },
    featuredSymbol: {
      fontSize: FONTS.sizes.xs,
      color: COLORS.textSecondary,
      fontWeight: "500",
      marginTop: 2,
      textTransform: "uppercase",
      letterSpacing: 0.5,
    },

    // ── Regular chain row ───────────────────────────────────────────────────
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
    },
    iconFallbackText: {
      color: COLORS.surface,
      fontSize: FONTS.sizes.md,
      fontWeight: "bold",
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
    },
    chainSymbol: {
      fontSize: FONTS.sizes.xs,
      color: COLORS.textSecondary,
      marginTop: 2,
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

export default ChainSwitcherInner;
