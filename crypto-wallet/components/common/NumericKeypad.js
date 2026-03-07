import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { useTheme } from "../../contexts/ThemeContext";
import * as Haptics from "expo-haptics";

const NumericKeypad = ({ onPress, onDelete, onBiometric, showBiometric }) => {
  const { COLORS, SPACING, FONTS } = useTheme();

  const handlePress = (value) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onPress(value);
  };

  const handleDelete = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onDelete();
  };

  const handleBiometric = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    onBiometric?.();
  };

  const keys = [
    ["1", "2", "3"],
    ["4", "5", "6"],
    ["7", "8", "9"],
    [showBiometric ? "biometric" : "empty", "0", "delete"],
  ];

  const styles = StyleSheet.create({
    container: {
      width: "100%",
      paddingHorizontal: SPACING.lg,
    },
    row: {
      flexDirection: "row",
      justifyContent: "space-around",
      marginBottom: SPACING.lg,
    },
    key: {
      width: 65,
      height: 65,
      borderRadius: 32.5,
      backgroundColor: COLORS.surface,
      justifyContent: "center",
      alignItems: "center",
      borderWidth: 1,
      borderColor: COLORS.border,
    },
    keyPressed: {
      backgroundColor: COLORS.primaryLight,
      transform: [{ scale: 0.95 }],
    },
    keyText: {
      fontSize: FONTS.sizes.xxl,
      fontWeight: "600",
      color: COLORS.text,
    },
    emptyKey: {
      backgroundColor: "transparent",
      borderColor: "transparent",
    },
    deleteKey: {
      backgroundColor: COLORS.surface,
    },
    deleteText: {
      fontSize: FONTS.sizes.lg,
      color: COLORS.error,
      fontWeight: "600",
    },
    biometricKey: {
      backgroundColor: COLORS.surface,
    },
    biometricText: {
      fontSize: 32,
    },
  });

  const renderKey = (key) => {
    if (key === "empty") {
      return <View key={key} style={[styles.key, styles.emptyKey]} />;
    }

    if (key === "delete") {
      return (
        <TouchableOpacity
          key={key}
          style={[styles.key, styles.deleteKey]}
          onPress={handleDelete}
          activeOpacity={0.7}
        >
          <Text style={styles.deleteText}>⌫</Text>
        </TouchableOpacity>
      );
    }

    if (key === "biometric") {
      return (
        <TouchableOpacity
          key={key}
          style={[styles.key, styles.biometricKey]}
          onPress={handleBiometric}
          activeOpacity={0.7}
        >
          <Text style={styles.biometricText}>👆</Text>
        </TouchableOpacity>
      );
    }

    return (
      <TouchableOpacity
        key={key}
        style={styles.key}
        onPress={() => handlePress(key)}
        activeOpacity={0.7}
      >
        <Text style={styles.keyText}>{key}</Text>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      {keys.map((row, rowIndex) => (
        <View key={rowIndex} style={styles.row}>
          {row.map((key) => renderKey(key))}
        </View>
      ))}
    </View>
  );
};

export default NumericKeypad;
