import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
} from "react-native";
import { useTheme } from "../../contexts/ThemeContext";
import { useWallet } from "../../contexts/WalletContext";
import NumericKeypad from "../../components/common/NumericKeypad";
import PinDots from "../../components/common/PinDots";
import Alert from "../../utils/Alert";
import * as Haptics from "expo-haptics";

const SetupBiometricScreen = ({ navigation }) => {
  const { COLORS, SPACING, FONTS } = useTheme();
  const { enableBiometric } = useWallet();
  const [pin, setPin] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const fadeAnim = useState(new Animated.Value(0))[0];

  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 300,
      useNativeDriver: true,
    }).start();
  }, []);

  useEffect(() => {
    if (pin.length === 6 && !loading) {
      handleEnableBiometric();
    }
  }, [pin]);

  const handleEnableBiometric = async () => {
    setLoading(true);
    try {
      console.log("[SetupBiometric] Starting biometric setup...");

      await enableBiometric(pin);

      console.log("[SetupBiometric] ✅ Biometric setup successful");

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      Alert.alert("Success", "Biometric authentication has been enabled!", [
        {
          text: "OK",
          onPress: () => navigation.goBack(),
        },
      ]);
    } catch (err) {
      console.error("[SetupBiometric] ❌ Error:", err.message);

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setError(true);
      setPin("");

      setTimeout(() => {
        setError(false);

        // Determine error message
        let errorMessage =
          "Failed to enable biometric authentication. Please try again.";

        if (
          err.message.includes("Invalid password") ||
          err.message.includes("Authentication failed")
        ) {
          errorMessage = "Incorrect PIN. Please try again.";
        } else if (err.message.includes("cancelled")) {
          errorMessage =
            "Biometric authentication was cancelled. Please try again.";
        } else if (err.message.includes("not available")) {
          errorMessage =
            "Biometric authentication is not available on this device.";
        }

        Alert.alert("Error", errorMessage);
      }, 200);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyPress = (value) => {
    if (pin.length < 6 && !loading) {
      setPin((prev) => prev + value);
      setError(false);
    }
  };

  const handleDelete = () => {
    if (!loading) {
      setPin((prev) => prev.slice(0, -1));
      setError(false);
    }
  };

  const styles = StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: COLORS.background,
    },
    content: {
      flex: 1,
      justifyContent: "space-between",
      paddingVertical: SPACING.md,
    },
    header: {
      alignItems: "center",
      paddingHorizontal: SPACING.xl,
      paddingTop: SPACING.xl,
    },
    icon: {
      fontSize: 64,
      marginBottom: SPACING.lg,
    },
    title: {
      fontSize: FONTS.sizes.xxl,
      fontWeight: "bold",
      color: COLORS.text,
      textAlign: "center",
      marginBottom: SPACING.md,
    },
    description: {
      fontSize: FONTS.sizes.md,
      color: COLORS.textSecondary,
      textAlign: "center",
      lineHeight: 22,
      paddingHorizontal: SPACING.md,
    },
    pinContainer: {
      alignItems: "center",
      paddingVertical: SPACING.md,
    },
    statusText: {
      fontSize: FONTS.sizes.sm,
      color: COLORS.textTertiary,
      textAlign: "center",
      marginTop: SPACING.xs,
      height: 10,
    },
    errorText: {
      color: COLORS.error,
    },
    keypadContainer: {
      paddingBottom: SPACING.xl,
    },
    cancelButton: {
      alignSelf: "center",
      paddingVertical: SPACING.md,
      paddingHorizontal: SPACING.xl,
      marginTop: SPACING.md,
    },
    cancelText: {
      fontSize: FONTS.sizes.md,
      color: COLORS.textSecondary,
      fontWeight: "600",
    },
    loadingOverlay: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: "rgba(0,0,0,0.3)",
      justifyContent: "center",
      alignItems: "center",
    },
    loadingText: {
      color: COLORS.text,
      fontSize: FONTS.sizes.lg,
      fontWeight: "600",
      marginTop: SPACING.md,
    },
  });

  return (
    <View style={styles.container}>
      <Animated.View style={[styles.content, { opacity: fadeAnim }]}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.icon}>🔐</Text>
          <Text style={styles.title}>Enable Biometric</Text>
          <Text style={styles.description}>
            Enter your 6-digit PIN to link it with biometric authentication.
            You'll be able to unlock using biometrics instead of typing your
            PIN.
          </Text>
        </View>

        {/* PIN Display */}
        <View style={styles.pinContainer}>
          <PinDots length={6} filledCount={pin.length} error={error} />
          <Text style={[styles.statusText, error && styles.errorText]}>
            {loading
              ? "Verifying..."
              : error
                ? "Incorrect PIN"
                : pin.length === 6
                  ? "Validating..."
                  : ""}
          </Text>
        </View>

        {/* Keypad */}
        <View style={styles.keypadContainer}>
          <NumericKeypad
            onPress={handleKeyPress}
            onDelete={handleDelete}
            showBiometric={false}
          />

          <TouchableOpacity
            style={styles.cancelButton}
            onPress={() => navigation.goBack()}
            disabled={loading}
          >
            <Text style={styles.cancelText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </Animated.View>

      {/* Loading Overlay */}
      {loading && (
        <View style={styles.loadingOverlay}>
          <Text style={styles.loadingText}>Setting up biometric...</Text>
        </View>
      )}
    </View>
  );
};

export default SetupBiometricScreen;
