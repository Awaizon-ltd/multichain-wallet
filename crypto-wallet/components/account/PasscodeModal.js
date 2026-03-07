import React, { useState, useRef, useEffect } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  StyleSheet,
  Animated,
  Vibration,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../../contexts/ThemeContext";

const PasscodeModal = ({ visible, title, subtitle, onClose, onSuccess }) => {
  const { COLORS, SPACING, FONTS, BORDER_RADIUS } = useTheme();
  const [passcode, setPasscode] = useState("");
  const [error, setError] = useState("");
  const shakeAnimation = useRef(new Animated.Value(0)).current;

  const PASSCODE_LENGTH = 6;

  useEffect(() => {
    if (passcode.length === PASSCODE_LENGTH) {
      handleSubmit();
    }
  }, [passcode]);

  useEffect(() => {
    if (visible) {
      setPasscode("");
      setError("");
    }
  }, [visible]);

  const shake = () => {
    Animated.sequence([
      Animated.timing(shakeAnimation, {
        toValue: 8,
        duration: 50,
        useNativeDriver: true,
      }),
      Animated.timing(shakeAnimation, {
        toValue: -8,
        duration: 50,
        useNativeDriver: true,
      }),
      Animated.timing(shakeAnimation, {
        toValue: 8,
        duration: 50,
        useNativeDriver: true,
      }),
      Animated.timing(shakeAnimation, {
        toValue: 0,
        duration: 50,
        useNativeDriver: true,
      }),
    ]).start();
  };

  const handleNumberPress = (num) => {
    if (passcode.length < PASSCODE_LENGTH) {
      setPasscode((prev) => prev + num);
      setError("");
    }
  };

  const handleBackspace = () => {
    setPasscode((prev) => prev.slice(0, -1));
    setError("");
  };

  const handleSubmit = async () => {
    if (passcode.length < 4) {
      setError("Enter your PIN");
      return;
    }

    try {
      await onSuccess(passcode);
    } catch (err) {
      setError(err.message || "Invalid PIN");
      setPasscode("");
      Vibration.vibrate(400);
      shake();
    }
  };

  const styles = StyleSheet.create({
    overlay: {
      flex: 1,
      backgroundColor: "rgba(0, 0, 0, 0.5)",
      justifyContent: "flex-end",
    },
    content: {
      backgroundColor: COLORS.surface,
      borderTopLeftRadius: BORDER_RADIUS.xl,
      borderTopRightRadius: BORDER_RADIUS.xl,
      paddingTop: SPACING.md,
      paddingBottom: SPACING.xxl,
    },
    handle: {
      width: 36,
      height: 4,
      backgroundColor: COLORS.border,
      borderRadius: BORDER_RADIUS.sm,
      alignSelf: "center",
      marginBottom: SPACING.lg,
    },
    header: {
      paddingHorizontal: SPACING.md,
      marginBottom: SPACING.lg,
    },
    title: {
      fontSize: FONTS.sizes.xl,
      fontWeight: "700",
      color: COLORS.text,
      marginBottom: 4,
    },
    subtitle: {
      fontSize: FONTS.sizes.sm,
      color: COLORS.textSecondary,
    },
    dotsContainer: {
      flexDirection: "row",
      justifyContent: "center",
      gap: SPACING.sm,
      marginVertical: SPACING.lg,
    },
    dot: {
      width: 12,
      height: 12,
      borderRadius: 6,
      borderWidth: 1.5,
      borderColor: COLORS.border,
      backgroundColor: "transparent",
    },
    dotFilled: {
      backgroundColor: COLORS.primary,
      borderColor: COLORS.primary,
    },
    errorContainer: {
      height: 20,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 4,
      marginBottom: SPACING.md,
    },
    errorText: {
      fontSize: FONTS.sizes.sm,
      color: COLORS.error,
      fontWeight: "600",
    },
    keypad: {
      paddingHorizontal: SPACING.sm,
    },
    keypadRow: {
      flexDirection: "row",
      justifyContent: "center",
      marginBottom: SPACING.sm,
    },
    keyButton: {
      width: 68,
      height: 68,
      borderRadius: 34,
      backgroundColor: COLORS.cardElevated,
      justifyContent: "center",
      alignItems: "center",
      marginHorizontal: SPACING.xs,
    },
    keyText: {
      fontSize: FONTS.sizes.xxxl,
      fontWeight: "300",
      color: COLORS.text,
    },
    emptyKey: {
      width: 68,
      marginHorizontal: SPACING.xs,
    },
  });

  const renderDots = () => (
    <Animated.View
      style={[
        styles.dotsContainer,
        { transform: [{ translateX: shakeAnimation }] },
      ]}
    >
      {Array.from({ length: PASSCODE_LENGTH }).map((_, index) => (
        <View
          key={index}
          style={[styles.dot, index < passcode.length && styles.dotFilled]}
        />
      ))}
    </Animated.View>
  );

  const renderKeypad = () => {
    const numbers = [
      ["1", "2", "3"],
      ["4", "5", "6"],
      ["7", "8", "9"],
      [null, "0", "backspace"],
    ];

    return (
      <View style={styles.keypad}>
        {numbers.map((row, rowIndex) => (
          <View key={rowIndex} style={styles.keypadRow}>
            {row.map((key, keyIndex) => {
              if (key === null) {
                return <View key={keyIndex} style={styles.emptyKey} />;
              }

              if (key === "backspace") {
                return (
                  <TouchableOpacity
                    key={keyIndex}
                    style={styles.keyButton}
                    onPress={handleBackspace}
                    activeOpacity={0.7}
                  >
                    <Ionicons
                      name="backspace-outline"
                      size={24}
                      color={COLORS.text}
                    />
                  </TouchableOpacity>
                );
              }

              return (
                <TouchableOpacity
                  key={keyIndex}
                  style={styles.keyButton}
                  onPress={() => handleNumberPress(key)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.keyText}>{key}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        ))}
      </View>
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
        style={styles.overlay}
        activeOpacity={1}
        onPress={onClose}
      >
        <TouchableOpacity
          activeOpacity={1}
          onPress={(e) => e.stopPropagation()}
        >
          <View style={styles.content}>
            <View style={styles.handle} />

            <View style={styles.header}>
              <Text style={styles.title}>{title}</Text>
              <Text style={styles.subtitle}>{subtitle}</Text>
            </View>

            {renderDots()}

            {error ? (
              <View style={styles.errorContainer}>
                <Ionicons name="alert-circle" size={16} color={COLORS.error} />
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ) : (
              <View style={styles.errorContainer} />
            )}

            {renderKeypad()}
          </View>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
};

export default PasscodeModal;
