import React, { useState, useRef, useEffect } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Vibration,
  Alert,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as SecureStore from "expo-secure-store";
import { useTheme } from "../../contexts/ThemeContext";
import { useLoading } from "../../contexts/LoadingContext";
import { APP_CONFIG } from "../../constants/Config";
import { decryptWallet, encryptWallet } from "../../utils/Encryption";

/**
 * Change Passcode Screen
 * Follows security protocol:
 * 1. Verify current passcode
 * 2. Enter new passcode
 * 3. Confirm new passcode
 * 4. Re-encrypt wallet with new passcode
 */
const ChangePasscodeScreen = ({ navigation }) => {
  const { COLORS, SPACING, FONTS, BORDER_RADIUS, SHADOWS } = useTheme();
  const { showLoading, updateLoading, hideLoading } = useLoading();

  // Step management
  const [step, setStep] = useState(1); // 1: current, 2: new, 3: confirm
  const [currentPasscode, setCurrentPasscode] = useState("");
  const [newPasscode, setNewPasscode] = useState("");
  const [confirmPasscode, setConfirmPasscode] = useState("");
  const [error, setError] = useState("");

  const shakeAnimation = useRef(new Animated.Value(0)).current;
  const PASSCODE_LENGTH = 6;

  const styles = StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: COLORS.background,
    },
    header: {
      backgroundColor: COLORS.surface,
      paddingTop: Platform.OS === "ios" ? 56 : 44,
      paddingBottom: SPACING.lg,
      paddingHorizontal: SPACING.md,
      ...SHADOWS.small,
    },
    headerTop: {
      flexDirection: "row",
      alignItems: "center",
      marginBottom: SPACING.xs,
    },
    backButton: {
      padding: SPACING.xs,
      marginRight: SPACING.sm,
    },
    title: {
      fontSize: FONTS.sizes.xl,
      fontWeight: "700",
      color: COLORS.text,
      flex: 1,
    },
    subtitle: {
      fontSize: FONTS.sizes.sm,
      color: COLORS.textSecondary,
      marginTop: 2,
      paddingLeft: 36,
    },
    content: {
      flex: 1,
      paddingHorizontal: SPACING.md,
      paddingTop: SPACING.xl,
      alignItems: "center",
    },
    stepIndicator: {
      flexDirection: "row",
      gap: SPACING.sm,
      marginBottom: SPACING.xl,
    },
    stepDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: COLORS.border,
    },
    stepDotActive: {
      backgroundColor: COLORS.primary,
      width: 24,
    },
    iconContainer: {
      width: 64,
      height: 64,
      borderRadius: BORDER_RADIUS.lg,
      backgroundColor: COLORS.primaryMuted,
      justifyContent: "center",
      alignItems: "center",
      marginBottom: SPACING.lg,
    },
    stepTitle: {
      fontSize: FONTS.sizes.xl,
      fontWeight: "700",
      color: COLORS.text,
      marginBottom: SPACING.xs,
    },
    stepSubtitle: {
      fontSize: FONTS.sizes.sm,
      color: COLORS.textSecondary,
      textAlign: "center",
      marginBottom: SPACING.xl,
      paddingHorizontal: SPACING.lg,
    },
    dotsContainer: {
      flexDirection: "row",
      justifyContent: "center",
      gap: SPACING.sm,
      marginBottom: SPACING.lg,
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
    dotError: {
      backgroundColor: COLORS.error,
      borderColor: COLORS.error,
    },
    errorContainer: {
      height: 24,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 4,
      marginBottom: SPACING.lg,
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
      backgroundColor: COLORS.surface,
      justifyContent: "center",
      alignItems: "center",
      marginHorizontal: SPACING.xs,
      ...SHADOWS.small,
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
    warningBox: {
      backgroundColor: COLORS.warning + "15",
      borderWidth: 1,
      borderColor: COLORS.warning,
      borderRadius: BORDER_RADIUS.sm,
      padding: SPACING.md,
      marginBottom: SPACING.xl,
      flexDirection: "row",
      gap: SPACING.sm,
    },
    warningText: {
      flex: 1,
      fontSize: FONTS.sizes.sm,
      color: COLORS.text,
      lineHeight: 18,
    },
  });

  // Get current passcode for the current step
  const getCurrentPasscodeValue = () => {
    switch (step) {
      case 1:
        return currentPasscode;
      case 2:
        return newPasscode;
      case 3:
        return confirmPasscode;
      default:
        return "";
    }
  };

  // Auto-submit when passcode is complete
  useEffect(() => {
    const currentValue = getCurrentPasscodeValue();
    if (currentValue.length === PASSCODE_LENGTH) {
      handleSubmit();
    }
  }, [currentPasscode, newPasscode, confirmPasscode]);

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
    const currentValue = getCurrentPasscodeValue();
    if (currentValue.length < PASSCODE_LENGTH) {
      switch (step) {
        case 1:
          setCurrentPasscode((prev) => prev + num);
          break;
        case 2:
          setNewPasscode((prev) => prev + num);
          break;
        case 3:
          setConfirmPasscode((prev) => prev + num);
          break;
      }
      setError("");
    }
  };

  const handleBackspace = () => {
    switch (step) {
      case 1:
        setCurrentPasscode((prev) => prev.slice(0, -1));
        break;
      case 2:
        setNewPasscode((prev) => prev.slice(0, -1));
        break;
      case 3:
        setConfirmPasscode((prev) => prev.slice(0, -1));
        break;
    }
    setError("");
  };

  const handleSubmit = async () => {
    try {
      if (step === 1) {
        // Verify current passcode
        await verifyCurrentPasscode();
      } else if (step === 2) {
        // Validate new passcode
        validateNewPasscode();
      } else if (step === 3) {
        // Confirm and update passcode
        await confirmAndUpdatePasscode();
      }
    } catch (err) {
      setError(err.message || "An error occurred");
      clearCurrentStepPasscode();
      Vibration.vibrate(400);
      shake();
    }
  };

  const verifyCurrentPasscode = async () => {
    if (currentPasscode.length < 4) {
      throw new Error("Enter current PIN");
    }

    showLoading("Verifying...", { step: 1, totalSteps: 3 });

    try {
      const localWalletJson = await SecureStore.getItemAsync(
        APP_CONFIG.STORAGE_KEYS.LOCAL_WALLET,
      );

      if (!localWalletJson) {
        throw new Error("No wallet found");
      }

      const localWallet = JSON.parse(localWalletJson);

      // Verify by attempting to decrypt
      await decryptWallet(
        localWallet.encrypted,
        currentPasscode,
        localWallet.salt,
      );

      hideLoading();
      setStep(2);
    } catch (err) {
      hideLoading();
      throw new Error("Invalid current PIN");
    }
  };

  const validateNewPasscode = () => {
    if (newPasscode.length < PASSCODE_LENGTH) {
      throw new Error("PIN must be 6 digits");
    }

    if (newPasscode === currentPasscode) {
      throw new Error("New PIN must be different");
    }

    setStep(3);
  };

  const confirmAndUpdatePasscode = async () => {
    if (confirmPasscode !== newPasscode) {
      throw new Error("PINs do not match");
    }

    showLoading("Updating PIN...", { step: 1, totalSteps: 3 });

    try {
      const localWalletJson = await SecureStore.getItemAsync(
        APP_CONFIG.STORAGE_KEYS.LOCAL_WALLET,
      );

      if (!localWalletJson) {
        throw new Error("No wallet found");
      }

      const localWallet = JSON.parse(localWalletJson);

      updateLoading("Decrypting wallet...", 2);

      // Decrypt with current passcode
      const { wallet: decryptedData } = await decryptWallet(
        localWallet.encrypted,
        currentPasscode,
        localWallet.salt,
      );

      updateLoading("Encrypting with new PIN...", 3);

      // Re-encrypt with new passcode
      const { encrypted: newEncrypted, salt: newSalt } = await encryptWallet(
        decryptedData,
        newPasscode,
      );

      // Update SecureStore
      await SecureStore.setItemAsync(
        APP_CONFIG.STORAGE_KEYS.LOCAL_WALLET,
        JSON.stringify({
          ...localWallet,
          encrypted: newEncrypted,
          salt: newSalt,
        }),
      );

      hideLoading();

      Alert.alert("Success", "Your PIN has been changed successfully", [
        {
          text: "OK",
          onPress: () => navigation.goBack(),
        },
      ]);
    } catch (err) {
      hideLoading();
      throw new Error("Failed to update PIN");
    }
  };

  const clearCurrentStepPasscode = () => {
    switch (step) {
      case 1:
        setCurrentPasscode("");
        break;
      case 2:
        setNewPasscode("");
        break;
      case 3:
        setConfirmPasscode("");
        break;
    }
  };

  const getStepInfo = () => {
    switch (step) {
      case 1:
        return {
          icon: "lock-closed",
          title: "Current PIN",
          subtitle: "Enter your current PIN to continue",
        };
      case 2:
        return {
          icon: "key",
          title: "New PIN",
          subtitle: "Enter your new 6-digit PIN",
        };
      case 3:
        return {
          icon: "checkmark-circle",
          title: "Confirm PIN",
          subtitle: "Re-enter your new PIN to confirm",
        };
      default:
        return {
          icon: "lock-closed",
          title: "",
          subtitle: "",
        };
    }
  };

  const renderDots = () => {
    const currentValue = getCurrentPasscodeValue();
    const hasError = !!error;

    return (
      <Animated.View
        style={[
          styles.dotsContainer,
          { transform: [{ translateX: shakeAnimation }] },
        ]}
      >
        {Array.from({ length: PASSCODE_LENGTH }).map((_, index) => (
          <View
            key={index}
            style={[
              styles.dot,
              index < currentValue.length && styles.dotFilled,
              hasError && index < currentValue.length && styles.dotError,
            ]}
          />
        ))}
      </Animated.View>
    );
  };

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

  const stepInfo = getStepInfo();

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => navigation.goBack()}
            activeOpacity={0.6}
          >
            <Ionicons name="arrow-back" size={24} color={COLORS.text} />
          </TouchableOpacity>
          <Text style={styles.title}>Change PIN</Text>
        </View>
        <Text style={styles.subtitle}>Update your security PIN</Text>
      </View>

      {/* Content */}
      <View style={styles.content}>
        {/* Step Indicator */}
        <View style={styles.stepIndicator}>
          {[1, 2, 3].map((s) => (
            <View
              key={s}
              style={[styles.stepDot, s === step && styles.stepDotActive]}
            />
          ))}
        </View>

        {/* Icon */}
        <View style={styles.iconContainer}>
          <Ionicons name={stepInfo.icon} size={32} color={COLORS.primary} />
        </View>

        {/* Title & Subtitle */}
        <Text style={styles.stepTitle}>{stepInfo.title}</Text>
        <Text style={styles.stepSubtitle}>{stepInfo.subtitle}</Text>

        {/* Warning for new PIN */}
        {step === 2 && (
          <View style={styles.warningBox}>
            <Ionicons name="warning" size={20} color={COLORS.warning} />
            <Text style={styles.warningText}>
              Make sure to remember your new PIN. You'll need it to access your
              wallet.
            </Text>
          </View>
        )}

        {/* Passcode Dots */}
        {renderDots()}

        {/* Error Display */}
        {error ? (
          <View style={styles.errorContainer}>
            <Ionicons name="alert-circle" size={16} color={COLORS.error} />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : (
          <View style={styles.errorContainer} />
        )}

        {/* Keypad */}
        {renderKeypad()}
      </View>
    </View>
  );
};

export default ChangePasscodeScreen;
