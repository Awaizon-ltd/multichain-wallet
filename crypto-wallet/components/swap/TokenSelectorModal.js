// components/swap/TokenSelectorModal.js
import React, { useState, useCallback, useEffect, useMemo, memo } from "react";
import {
  Modal,
  View,
  Text,
  TextInput,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Image,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../../contexts/ThemeContext";
import ChainBadge from "../common/ChainBadge";

// ─── Multi-source logo fallback ───────────────────────────────────────────────
// Mirrors the same logic in SwapScreen's TokenLogo so icons are consistent
// across the selector and the main swap card.
const NATIVE_SENTINEL = "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";

const buildLogoSources = (logoURI, address) => {
  const sources = [];
  if (logoURI) sources.push(logoURI);
  if (address && address.toLowerCase() !== NATIVE_SENTINEL) {
    const addr = address.toLowerCase();
    sources.push(`https://tokens.1inch.io/${addr}.png`);
    sources.push(
      `https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/${address}/logo.png`,
    );
    sources.push(`https://assets.coingecko.com/coins/images/small/${addr}.png`);
  }
  return sources;
};

// ─── TokenIcon ────────────────────────────────────────────────────────────────
const TokenIcon = memo(({ logoURI, address, symbol, size = 44, theme }) => {
  const { COLORS, FONTS } = theme;
  const sources = useMemo(
    () => buildLogoSources(logoURI, address),
    [logoURI, address],
  );
  const [srcIndex, setSrcIndex] = useState(0);

  // Reset when token changes
  useEffect(() => {
    setSrcIndex(0);
  }, [logoURI, address]);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        image: { width: size, height: size },
        fallback: {
          width: size,
          height: size,
          backgroundColor: COLORS.primaryMuted,
          alignItems: "center",
          justifyContent: "center",
        },
        fallbackText: {
          fontSize: size * 0.38,
          fontWeight: "800",
          color: COLORS.primaryDark,
        },
      }),
    [size, COLORS],
  );

  const currentSrc = sources[srcIndex];

  if (currentSrc) {
    return (
      <Image
        source={{ uri: currentSrc }}
        style={styles.image}
        onError={() => {
          if (__DEV__)
            console.log(
              `[TokenIcon] ${symbol} src[${srcIndex}] failed: ${currentSrc}`,
            );
          setSrcIndex((i) => i + 1);
        }}
        fadeDuration={150}
      />
    );
  }

  return (
    <View style={styles.fallback}>
      <Text style={styles.fallbackText}>{symbol?.charAt(0) ?? "?"}</Text>
    </View>
  );
});

// ─── TokenItem ────────────────────────────────────────────────────────────────
const TokenItem = memo(({ token, chainIcon, onSelect, isSelected, theme }) => {
  const styles = createStyles(theme);
  const { COLORS } = theme;

  return (
    <TouchableOpacity
      style={[styles.tokenItem, isSelected && styles.tokenItemSelected]}
      onPress={() => onSelect(token)}
      activeOpacity={0.7}
    >
      <View style={styles.iconOuterWrap}>
        <View style={styles.iconWrap}>
          <TokenIcon
            logoURI={token.logoURI}
            address={token.address}
            symbol={token.symbol}
            size={44}
            theme={theme}
          />
        </View>
        {!token.isNative && (
          <ChainBadge uri={chainIcon} borderColor={COLORS.background} />
        )}
      </View>

      <View style={styles.tokenInfo}>
        <Text style={styles.tokenSymbol}>{token.symbol}</Text>
        <Text style={styles.tokenName} numberOfLines={1}>
          {token.name}
        </Text>
      </View>

      {isSelected && (
        <Ionicons name="checkmark-circle" size={22} color={COLORS.primary} />
      )}
    </TouchableOpacity>
  );
});

// ─── TokenSelectorModal ───────────────────────────────────────────────────────
export const TokenSelectorModal = ({
  visible,
  onClose,
  onSelect,
  tokens = [],
  selectedToken = null,
  excludeToken = null,
  chainIcon = null,
  title = "Select Token",
}) => {
  const theme = useTheme();
  const styles = createStyles(theme);
  const { COLORS } = theme;

  const [searchQuery, setSearchQuery] = useState("");
  const [filteredTokens, setFilteredTokens] = useState([]);

  useEffect(() => {
    if (visible) {
      setSearchQuery("");
      setFilteredTokens(
        tokens.filter((t) => t.address !== excludeToken?.address),
      );
    }
  }, [visible, tokens, excludeToken]);

  const handleSearch = useCallback(
    (query) => {
      setSearchQuery(query);
      const q = query.toLowerCase().trim();
      const available = tokens.filter(
        (t) => t.address !== excludeToken?.address,
      );
      if (!q) {
        setFilteredTokens(available);
        return;
      }
      setFilteredTokens(
        available.filter(
          (t) =>
            t.symbol.toLowerCase().includes(q) ||
            t.name.toLowerCase().includes(q) ||
            t.address.toLowerCase().includes(q),
        ),
      );
    },
    [tokens, excludeToken],
  );

  const handleSelect = useCallback(
    (token) => {
      onSelect(token);
      onClose();
    },
    [onSelect, onClose],
  );

  const renderToken = useCallback(
    ({ item }) => (
      <TokenItem
        token={item}
        chainIcon={chainIcon}
        onSelect={handleSelect}
        isSelected={selectedToken?.address === item.address}
        theme={theme}
      />
    ),
    [selectedToken, handleSelect, theme, chainIcon],
  );

  const renderEmpty = () => (
    <View style={styles.emptyContainer}>
      <View style={styles.emptyIconWrap}>
        <Ionicons name="search-outline" size={32} color={COLORS.textTertiary} />
      </View>
      <Text style={styles.emptyText}>No tokens found</Text>
      <Text style={styles.emptySubtext}>
        Try searching by name, symbol, or contract address
      </Text>
    </View>
  );

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={false}
      onRequestClose={onClose}
    >
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>{title}</Text>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
            <Ionicons name="close" size={26} color={COLORS.textSecondary} />
          </TouchableOpacity>
        </View>

        {/* Search */}
        <View style={styles.searchContainer}>
          <Ionicons
            name="search"
            size={18}
            color={COLORS.textSecondary}
            style={styles.searchIcon}
          />
          <TextInput
            style={styles.searchInput}
            placeholder="Search name, symbol, or address..."
            placeholderTextColor={COLORS.textTertiary}
            value={searchQuery}
            onChangeText={handleSearch}
            autoCapitalize="none"
            autoCorrect={false}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => handleSearch("")}>
              <Ionicons
                name="close-circle"
                size={18}
                color={COLORS.textSecondary}
              />
            </TouchableOpacity>
          )}
        </View>

        {/* Token list */}
        <FlatList
          data={filteredTokens}
          keyExtractor={(item) => item.address}
          renderItem={renderToken}
          ListEmptyComponent={renderEmpty}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.listContent}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          // Performance: tokens list can be long
          initialNumToRender={20}
          maxToRenderPerBatch={20}
          windowSize={10}
          removeClippedSubviews
        />
      </View>
    </Modal>
  );
};

// ─── Styles ───────────────────────────────────────────────────────────────────
const createStyles = (theme) => {
  const { COLORS, SPACING, FONTS, BORDER_RADIUS, SHADOWS } = theme;

  return StyleSheet.create({
    container: { flex: 1, backgroundColor: COLORS.background },

    // Header
    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: SPACING.lg,
      paddingTop: 56,
      paddingBottom: SPACING.md,
      borderBottomWidth: 1,
      borderBottomColor: COLORS.divider,
    },
    headerTitle: {
      fontSize: FONTS.sizes.xl,
      fontWeight: "700",
      color: COLORS.text,
    },
    closeBtn: {
      padding: SPACING.xs,
      borderRadius: BORDER_RADIUS.md,
      backgroundColor: COLORS.surface,
      borderWidth: 1,
      borderColor: COLORS.border,
    },

    // Search
    searchContainer: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: COLORS.surface,
      borderRadius: BORDER_RADIUS.lg,
      margin: SPACING.md,
      paddingHorizontal: SPACING.md,
      paddingVertical: SPACING.sm + 2,
      borderWidth: 1,
      borderColor: COLORS.border,
      ...SHADOWS.small,
    },
    searchIcon: { marginRight: SPACING.sm },
    searchInput: {
      flex: 1,
      fontSize: FONTS.sizes.md,
      color: COLORS.text,
      padding: 0,
    },

    // List
    listContent: {
      paddingHorizontal: SPACING.md,
      paddingBottom: SPACING.xxxl,
    },
    tokenItem: {
      flexDirection: "row",
      alignItems: "center",
      paddingVertical: SPACING.sm + 2,
      paddingHorizontal: SPACING.sm,
      borderRadius: BORDER_RADIUS.lg,
    },
    tokenItemSelected: { backgroundColor: COLORS.primaryMuted },
    iconOuterWrap: { position: "relative", marginRight: SPACING.md },
    iconWrap: {
      width: 44,
      height: 44,
      borderRadius: 22,
      overflow: "hidden",
      backgroundColor: COLORS.surface,
      borderWidth: 1,
      borderColor: COLORS.border,
    },
    tokenInfo: { flex: 1 },
    tokenSymbol: {
      fontSize: FONTS.sizes.base,
      fontWeight: "700",
      color: COLORS.text,
      marginBottom: 2,
    },
    tokenName: {
      fontSize: FONTS.sizes.sm,
      color: COLORS.textSecondary,
    },
    separator: {
      height: 1,
      backgroundColor: COLORS.divider,
      marginLeft: 44 + SPACING.md,
    },

    // Empty
    emptyContainer: {
      alignItems: "center",
      paddingTop: SPACING.xxxl,
      paddingHorizontal: SPACING.xl,
    },
    emptyIconWrap: {
      width: 64,
      height: 64,
      borderRadius: 32,
      backgroundColor: COLORS.surface,
      borderWidth: 1,
      borderColor: COLORS.border,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: SPACING.md,
    },
    emptyText: {
      fontSize: FONTS.sizes.lg,
      fontWeight: "700",
      color: COLORS.text,
      marginBottom: SPACING.xs,
    },
    emptySubtext: {
      fontSize: FONTS.sizes.sm,
      color: COLORS.textSecondary,
      textAlign: "center",
      lineHeight: FONTS.sizes.sm * FONTS.lineHeights.relaxed,
    },
  });
};

export default TokenSelectorModal;
