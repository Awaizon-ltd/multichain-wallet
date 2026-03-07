import React, { useState, useRef, useEffect } from "react";
import {
  View,
  Text,
  Image,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Vibration,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useWallet } from "../../contexts/WalletContext";
import { useLoading } from "../../contexts/LoadingContext";
import { useTheme } from "../../contexts/ThemeContext";

// ─── Logo asset ────────────────────────────────────────────────────────────
import Logo from "../../assets/logo.png";

const PasscodeScreen = ({ navigation }) => {
  const { authenticateWithPasscode, wallet } = useWallet();
  const { showLoading, updateLoading, hideLoading } = useLoading();
  const { COLORS, SPACING, FONTS } = useTheme();

  const [passcode, setPasscode] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const shakeAnimation = useRef(new Animated.Value(0)).current;

  const PASSCODE_LENGTH = 6;

  useEffect(() => {
    if (passcode.length === PASSCODE_LENGTH) handleSubmit();
  }, [passcode]);

  const handleNumberPress = (num) => {
    if (passcode.length < PASSCODE_LENGTH && !isLoading) {
      setPasscode((prev) => prev + num);
      setError("");
    }
  };

  const handleBackspace = () => {
    if (!isLoading) {
      setPasscode((prev) => prev.slice(0, -1));
      setError("");
    }
  };

  const handleSubmit = async () => {
    if (passcode.length < 4) {
      setError("Please enter your PIN");
      return;
    }

    setIsLoading(true);
    try {
      showLoading("Verifying PIN...", { step: 1, totalSteps: 3 });
      await authenticateWithPasscode(passcode);

      updateLoading("Unlocking wallet...", 2);
      await new Promise((r) => setTimeout(r, 300));

      updateLoading("Loading your data...", 3);
      await new Promise((r) => setTimeout(r, 300));

      hideLoading();
    } catch (err) {
      console.error("Unlock error:", err);
      hideLoading();
      setError("Incorrect PIN");
      setPasscode("");
      Vibration.vibrate(500);
      shake();
    } finally {
      setIsLoading(false);
    }
  };

  const shake = () => {
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
  };

  const renderDots = () => (
    <Animated.View
      style={[
        styles.dotsContainer,
        { transform: [{ translateX: shakeAnimation }] },
      ]}
    >
      {Array.from({ length: PASSCODE_LENGTH }).map((_, i) => (
        <View
          key={i}
          style={[
            styles.dot,
            { borderColor: COLORS.textSecondary },
            i < passcode.length && {
              backgroundColor: COLORS.primary,
              borderColor: COLORS.primary,
            },
          ]}
        />
      ))}
    </Animated.View>
  );

  const renderKeypad = () => {
    const rows = [
      ["1", "2", "3"],
      ["4", "5", "6"],
      ["7", "8", "9"],
      [null, "0", "backspace"],
    ];
    return (
      <View style={styles.keypad}>
        {rows.map((row, ri) => (
          <View key={ri} style={styles.keypadRow}>
            {row.map((key, ki) => {
              if (key === null)
                return <View key={ki} style={styles.keyButton} />;
              if (key === "backspace")
                return (
                  <TouchableOpacity
                    key={ki}
                    style={[
                      styles.keyButton,
                      { backgroundColor: COLORS.surface },
                    ]}
                    onPress={handleBackspace}
                    activeOpacity={0.7}
                    disabled={isLoading}
                  >
                    <Ionicons
                      name="backspace-outline"
                      size={28}
                      color={COLORS.text}
                    />
                  </TouchableOpacity>
                );
              return (
                <TouchableOpacity
                  key={ki}
                  style={[
                    styles.keyButton,
                    { backgroundColor: COLORS.surface },
                  ]}
                  onPress={() => handleNumberPress(key)}
                  activeOpacity={0.7}
                  disabled={isLoading}
                >
                  <Text
                    style={[
                      styles.keyText,
                      { color: COLORS.text, fontSize: FONTS.sizes.xxl },
                    ]}
                  >
                    {key}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        ))}
      </View>
    );
  };

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: COLORS.background, padding: SPACING.lg },
      ]}
    >
      {/* Header */}
      <View style={[styles.header, { marginTop: SPACING.xl }]}>
        {/* Logo — replaces the lock icon */}
        <View
          style={[
            styles.logoContainer,
            { backgroundColor: COLORS.surface, borderColor: COLORS.primary },
          ]}
        >
          <Image source={Logo} style={styles.logoImage} resizeMode="contain" />
        </View>

        <Text
          style={[
            styles.title,
            {
              color: COLORS.text,
              fontSize: FONTS.sizes.lg,
              marginBottom: SPACING.sm,
            },
          ]}
        >
          Enter Passcode
        </Text>
      </View>

      {renderDots()}

      {/* Error row */}
      <View style={styles.errorContainer}>
        {error ? (
          <>
            <Ionicons name="alert-circle" size={16} color={COLORS.error} />
            <Text
              style={[
                styles.errorText,
                { color: COLORS.error, fontSize: FONTS.sizes.sm },
              ]}
            >
              {error}
            </Text>
          </>
        ) : null}
      </View>

      {renderKeypad()}
    </View>
  );
};

export default PasscodeScreen;

// ─── Styles ──────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "space-between",
  },
  header: {
    alignItems: "center",
  },
  logoContainer: {
    width: 80,
    height: 80,
    borderRadius: 20,
    borderWidth: 2,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  logoImage: {
    width: 56,
    height: 56,
  },
  title: {
    fontWeight: "bold",
  },
  subtitle: {},

  // Dots
  dotsContainer: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 12,
    marginVertical: 28,
  },
  dot: {
    width: 26,
    height: 26,
    borderRadius: 5,
    borderWidth: 2,
    backgroundColor: "transparent",
  },

  // Error
  errorContainer: {
    height: 24,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  errorText: {
    fontWeight: "500",
  },

  // Keypad
  keypad: {
    marginBottom: 8,
  },
  keypadRow: {
    flexDirection: "row",
    justifyContent: "center",
    marginBottom: 14,
  },
  keyButton: {
    width: 65,
    height: 65,
    borderRadius: 37.5,
    justifyContent: "center",
    alignItems: "center",
    marginHorizontal: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  keyText: {
    fontWeight: "400",
  },
});
