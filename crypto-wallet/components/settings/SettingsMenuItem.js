// components/settings/SettingsMenuItem.js
// Shared building blocks for every settings page: a bordered/shadowed group
// card, a plain navigable row, and a row with a toggle. Used by the main
// Settings screen (which now only lists groups) and each group's own page.
import React from "react";
import { View, Text, StyleSheet, Pressable, Switch } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../../contexts/ThemeContext";

export const SettingsSection = ({ title, children, style }) => {
  const { COLORS, SPACING, FONTS, isDark } = useTheme();
  const styles = StyleSheet.create({
    section: {
      backgroundColor: isDark ? COLORS.card : "#FFFFFF",
      borderRadius: 16,
      overflow: "hidden",
      borderWidth: 1,
      borderColor: isDark ? COLORS.borderStrong : COLORS.border,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: isDark ? 0.5 : 0.18,
      shadowRadius: 16,
      elevation: 12,
    },
    header: {
      paddingHorizontal: SPACING.md,
      paddingTop: SPACING.md,
      paddingBottom: SPACING.sm,
      borderBottomWidth: 1,
      borderBottomColor: COLORS.divider,
    },
    title: {
      fontSize: FONTS.sizes.xs,
      fontWeight: "700",
      color: COLORS.primary,
      textTransform: "uppercase",
      letterSpacing: 1.2,
    },
  });

  return (
    <View style={[styles.section, style]}>
      {title && (
        <View style={styles.header}>
          <Text style={styles.title}>{title}</Text>
        </View>
      )}
      {children}
    </View>
  );
};

export const MenuItem = ({
  iconName,
  iconColor,
  title,
  subtitle,
  onPress,
  showArrow = true,
  isLast = false,
}) => {
  const { COLORS, SPACING, FONTS } = useTheme();
  const styles = StyleSheet.create({
    menuItem: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      paddingHorizontal: SPACING.md,
      paddingVertical: SPACING.md,
    },
    menuDivider: {
      height: 1,
      backgroundColor: COLORS.divider,
      marginLeft: SPACING.md + 28 + SPACING.md,
    },
    menuLeft: { flexDirection: "row", alignItems: "center", gap: SPACING.md, flex: 1 },
    iconContainer: {
      width: 32,
      height: 32,
      borderRadius: 8,
      justifyContent: "center",
      alignItems: "center",
      backgroundColor: `${COLORS.primary}15`,
    },
    menuTextBlock: { flex: 1 },
    menuTitle: { fontSize: FONTS.sizes.md, fontWeight: "500", color: COLORS.text },
    menuSubtitle: { fontSize: FONTS.sizes.sm, color: COLORS.textSecondary, marginTop: 2 },
  });

  return (
    <>
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [
          styles.menuItem,
          pressed && onPress && { backgroundColor: COLORS.hover },
        ]}
      >
        <View style={styles.menuLeft}>
          <View
            style={[styles.iconContainer, iconColor && { backgroundColor: `${iconColor}18` }]}
          >
            <Ionicons name={iconName} size={18} color={iconColor || COLORS.primary} />
          </View>
          <View style={styles.menuTextBlock}>
            <Text style={styles.menuTitle}>{title}</Text>
            {subtitle && <Text style={styles.menuSubtitle}>{subtitle}</Text>}
          </View>
        </View>
        {showArrow && onPress && (
          <Ionicons name="chevron-forward" size={18} color={COLORS.textTertiary} />
        )}
      </Pressable>
      {!isLast && <View style={styles.menuDivider} />}
    </>
  );
};

export const ToggleMenuItem = ({
  iconName,
  iconColor,
  title,
  subtitle,
  value,
  onValueChange,
  disabled,
  isLast = false,
}) => {
  const { COLORS, SPACING, FONTS } = useTheme();
  const styles = StyleSheet.create({
    menuItem: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      paddingHorizontal: SPACING.md,
      paddingVertical: SPACING.md,
    },
    menuDivider: {
      height: 1,
      backgroundColor: COLORS.divider,
      marginLeft: SPACING.md + 28 + SPACING.md,
    },
    menuLeft: { flexDirection: "row", alignItems: "center", gap: SPACING.md, flex: 1 },
    iconContainer: {
      width: 32,
      height: 32,
      borderRadius: 8,
      justifyContent: "center",
      alignItems: "center",
      backgroundColor: `${COLORS.primary}15`,
    },
    toggleTextContainer: { flex: 1 },
    menuTitle: { fontSize: FONTS.sizes.md, fontWeight: "500", color: COLORS.text },
    menuSubtitle: { fontSize: FONTS.sizes.sm, color: COLORS.textSecondary, marginTop: 2 },
  });

  return (
    <>
      <View style={styles.menuItem}>
        <View style={styles.menuLeft}>
          <View
            style={[styles.iconContainer, iconColor && { backgroundColor: `${iconColor}18` }]}
          >
            <Ionicons name={iconName} size={18} color={iconColor || COLORS.primary} />
          </View>
          <View style={styles.toggleTextContainer}>
            <Text style={styles.menuTitle}>{title}</Text>
            {subtitle && <Text style={styles.menuSubtitle}>{subtitle}</Text>}
          </View>
        </View>
        <Switch
          value={value}
          onValueChange={onValueChange}
          disabled={disabled}
          trackColor={{ false: COLORS.surface, true: COLORS.primaryDark }}
          thumbColor={value ? COLORS.primary : COLORS.textTertiary}
        />
      </View>
      {!isLast && <View style={styles.menuDivider} />}
    </>
  );
};
