import React, { useState, useRef, useEffect } from "react";
import {
  View,
  Text,
  Modal,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Keyboard,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../../contexts/ThemeContext";

const PasscodeModal = ({
  visible,
  onClose,
  onSubmit,
  title = "Enter Passcode",
  subtitle = "Enter your passcode to continue",
}) => {
  const { COLORS, SPACING, FONTS, BORDER_RADIUS } = useTheme();
  const [passcode, setPasscode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const inputRef = useRef(null);

  useEffect(() => {
    if (visible) {
      setPasscode("");
      setError("");
      // Auto-focus input when modal opens
      setTimeout(() => {
        inputRef.current?.focus();
      }, 100);
    }
  }, [visible]);

  const handleSubmit = async () => {
    if (passcode.length < 4) {
      setError("Passcode must be at least 4 characters");
      return;
    }

    setLoading(true);
    setError("");

    try {
      await onSubmit(passcode);
      setPasscode("");
    } catch (err) {
      setError(err.message || "Invalid passcode");
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setPasscode("");
    setError("");
    Keyboard.dismiss();
    onClose();
  };

  const styles = createStyles(COLORS, SPACING, FONTS, BORDER_RADIUS);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={handleClose}
    >
      <View style={styles.overlay}>
        <View style={styles.container}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.iconContainer}>
              <Ionicons name="lock-closed" size={24} color={COLORS.primary} />
            </View>
            <TouchableOpacity
              style={styles.closeButton}
              onPress={handleClose}
              disabled={loading}
            >
              <Ionicons name="close" size={24} color={COLORS.textSecondary} />
            </TouchableOpacity>
          </View>

          {/* Title */}
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.subtitle}>{subtitle}</Text>

          {/* Passcode Input */}
          <View style={styles.inputContainer}>
            <Ionicons
              name="key"
              size={20}
              color={COLORS.textTertiary}
              style={styles.inputIcon}
            />
            <TextInput
              ref={inputRef}
              style={styles.input}
              value={passcode}
              onChangeText={(text) => {
                setPasscode(text);
                setError("");
              }}
              onSubmitEditing={handleSubmit}
              placeholder="Enter passcode"
              placeholderTextColor={COLORS.textTertiary}
              secureTextEntry
              autoFocus
              returnKeyType="done"
              editable={!loading}
            />
          </View>

          {/* Error Message */}
          {error ? (
            <View style={styles.errorContainer}>
              <Ionicons name="alert-circle" size={16} color={COLORS.error} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          {/* Buttons */}
          <View style={styles.buttonContainer}>
            <TouchableOpacity
              style={[styles.button, styles.cancelButton]}
              onPress={handleClose}
              disabled={loading}
            >
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.button,
                styles.confirmButton,
                loading && styles.buttonDisabled,
              ]}
              onPress={handleSubmit}
              disabled={loading || passcode.length < 4}
            >
              {loading ? (
                <ActivityIndicator size="small" color={COLORS.background} />
              ) : (
                <Text style={styles.confirmButtonText}>Confirm</Text>
              )}
            </TouchableOpacity>
          </View>

          {/* Security Note */}
          <View style={styles.securityNote}>
            <Ionicons
              name="shield-checkmark"
              size={14}
              color={COLORS.textTertiary}
            />
            <Text style={styles.securityText}>
              Your passcode is used to decrypt your wallet securely
            </Text>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const createStyles = (COLORS, SPACING, FONTS, BORDER_RADIUS) =>
  StyleSheet.create({
    overlay: {
      flex: 1,
      backgroundColor: "rgba(0, 0, 0, 0.7)",
      justifyContent: "center",
      alignItems: "center",
      padding: SPACING.lg,
    },
    container: {
      width: "100%",
      maxWidth: 400,
      backgroundColor: COLORS.surface,
      borderRadius: BORDER_RADIUS.xl,
      padding: SPACING.xl,
    },
    header: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: SPACING.lg,
    },
    iconContainer: {
      width: 48,
      height: 48,
      borderRadius: BORDER_RADIUS.lg,
      backgroundColor: COLORS.primary + "20",
      alignItems: "center",
      justifyContent: "center",
    },
    closeButton: {
      width: 40,
      height: 40,
      alignItems: "center",
      justifyContent: "center",
    },
    title: {
      fontSize: FONTS.sizes.xl,
      fontWeight: "bold",
      color: COLORS.text,
      marginBottom: SPACING.xs,
    },
    subtitle: {
      fontSize: FONTS.sizes.sm,
      color: COLORS.textSecondary,
      marginBottom: SPACING.lg,
    },
    inputContainer: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: COLORS.card,
      borderRadius: BORDER_RADIUS.lg,
      borderWidth: 1,
      borderColor: COLORS.border,
      paddingHorizontal: SPACING.md,
      marginBottom: SPACING.md,
    },
    inputIcon: {
      marginRight: SPACING.sm,
    },
    input: {
      flex: 1,
      fontSize: FONTS.sizes.md,
      color: COLORS.text,
      paddingVertical: SPACING.md,
    },
    errorContainer: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: COLORS.error + "15",
      borderRadius: BORDER_RADIUS.md,
      padding: SPACING.sm,
      marginBottom: SPACING.md,
      gap: SPACING.xs,
    },
    errorText: {
      fontSize: FONTS.sizes.sm,
      color: COLORS.error,
      flex: 1,
    },
    buttonContainer: {
      flexDirection: "row",
      gap: SPACING.sm,
      marginBottom: SPACING.md,
    },
    button: {
      flex: 1,
      paddingVertical: SPACING.md,
      borderRadius: BORDER_RADIUS.lg,
      alignItems: "center",
      justifyContent: "center",
    },
    cancelButton: {
      backgroundColor: COLORS.card,
      borderWidth: 1,
      borderColor: COLORS.border,
    },
    cancelButtonText: {
      fontSize: FONTS.sizes.md,
      fontWeight: "600",
      color: COLORS.text,
    },
    confirmButton: {
      backgroundColor: COLORS.primary,
    },
    confirmButtonText: {
      fontSize: FONTS.sizes.md,
      fontWeight: "600",
      color: COLORS.background,
    },
    buttonDisabled: {
      opacity: 0.5,
    },
    securityNote: {
      flexDirection: "row",
      alignItems: "center",
      gap: SPACING.xs,
      paddingTop: SPACING.sm,
      borderTopWidth: 1,
      borderTopColor: COLORS.border,
    },
    securityText: {
      fontSize: FONTS.sizes.xs,
      color: COLORS.textTertiary,
      flex: 1,
    },
  });

export default PasscodeModal;
