import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../../contexts/ThemeContext";

const EmptyState = () => {
  const { COLORS, SPACING, FONTS, BORDER_RADIUS } = useTheme();

  const styles = StyleSheet.create({
    container: {
      alignItems: "center",
      justifyContent: "center",
      paddingVertical: SPACING.xxxl,
      paddingHorizontal: SPACING.lg,
    },
    iconContainer: {
      width: 80,
      height: 80,
      borderRadius: BORDER_RADIUS.lg,
      backgroundColor: COLORS.cardElevated,
      justifyContent: "center",
      alignItems: "center",
      marginBottom: SPACING.lg,
    },
    title: {
      fontSize: FONTS.sizes.xl,
      fontWeight: "700",
      color: COLORS.text,
      marginBottom: SPACING.xs,
    },
    subtitle: {
      fontSize: FONTS.sizes.sm,
      color: COLORS.textSecondary,
      textAlign: "center",
      lineHeight: 20,
    },
  });

  return (
    <View style={styles.container}>
      <View style={styles.iconContainer}>
        <Ionicons name="wallet-outline" size={40} color={COLORS.primary} />
      </View>
      <Text style={styles.title}>No Accounts</Text>
      <Text style={styles.subtitle}>
        Create your first account to get started
      </Text>
    </View>
  );
};

export default EmptyState;
