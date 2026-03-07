import React, { useEffect, useRef } from "react";
import { View, Animated, StyleSheet } from "react-native";
import { useTheme } from "../../contexts/ThemeContext";

const PinDots = ({ length = 6, filledCount = 0, error = false }) => {
  const { COLORS, SPACING } = useTheme();
  const shakeAnimation = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (error) {
      Animated.sequence([
        Animated.timing(shakeAnimation, {
          toValue: 10,
          duration: 50,
          useNativeDriver: true,
        }),
        Animated.timing(shakeAnimation, {
          toValue: -10,
          duration: 50,
          useNativeDriver: true,
        }),
        Animated.timing(shakeAnimation, {
          toValue: 10,
          duration: 50,
          useNativeDriver: true,
        }),
        Animated.timing(shakeAnimation, {
          toValue: 0,
          duration: 50,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [error]);

  const styles = StyleSheet.create({
    container: {
      flexDirection: "row",
      justifyContent: "center",
      alignItems: "center",
      paddingVertical: SPACING.xl,
      gap: SPACING.md,
    },
    dot: {
      width: 16,
      height: 16,
      borderRadius: 8,
      borderWidth: 2,
      borderColor: error ? COLORS.error : COLORS.border,
      backgroundColor: COLORS.background,
    },
    filledDot: {
      backgroundColor: error ? COLORS.error : COLORS.primary,
      borderColor: error ? COLORS.error : COLORS.primary,
    },
  });

  return (
    <Animated.View
      style={[
        styles.container,
        {
          transform: [{ translateX: shakeAnimation }],
        },
      ]}
    >
      {Array.from({ length }).map((_, index) => (
        <View
          key={index}
          style={[styles.dot, index < filledCount && styles.filledDot]}
        />
      ))}
    </Animated.View>
  );
};

export default PinDots;
