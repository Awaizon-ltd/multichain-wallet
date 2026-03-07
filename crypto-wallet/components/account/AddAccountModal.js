import React from "react";
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  Modal,
  StyleSheet,
} from "react-native";
import { useTheme } from "../../contexts/ThemeContext";

const AddAccountModal = ({
  visible,
  accountName,
  accountNumber,
  onClose,
  onNameChange,
  onContinue,
}) => {
  const { COLORS, SPACING, FONTS, BORDER_RADIUS } = useTheme();

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
      paddingHorizontal: SPACING.md,
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
    inputSection: {
      marginBottom: SPACING.lg,
    },
    inputLabel: {
      fontSize: FONTS.sizes.xs,
      color: COLORS.textSecondary,
      marginBottom: SPACING.xs,
      fontWeight: "600",
      textTransform: "uppercase",
      letterSpacing: 0.5,
    },
    input: {
      backgroundColor: COLORS.cardElevated,
      borderWidth: 1,
      borderColor: COLORS.border,
      borderRadius: BORDER_RADIUS.sm,
      padding: SPACING.md,
      fontSize: FONTS.sizes.md,
      color: COLORS.text,
    },
    actions: {
      flexDirection: "row",
      gap: SPACING.xs,
    },
    button: {
      flex: 1,
      paddingVertical: SPACING.md,
      borderRadius: BORDER_RADIUS.sm,
      alignItems: "center",
    },
    cancelButton: {
      backgroundColor: COLORS.cardElevated,
      borderWidth: 1,
      borderColor: COLORS.border,
    },
    continueButton: {
      backgroundColor: COLORS.primary,
    },
    cancelText: {
      color: COLORS.text,
      fontWeight: "600",
      fontSize: FONTS.sizes.md,
    },
    continueText: {
      color: "#FFFFFF",
      fontWeight: "600",
      fontSize: FONTS.sizes.md,
    },
  });

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
              <Text style={styles.title}>New Account</Text>
              <Text style={styles.subtitle}>
                Choose a name for your account
              </Text>
            </View>

            <View style={styles.inputSection}>
              <Text style={styles.inputLabel}>Account Name</Text>
              <TextInput
                style={styles.input}
                placeholder={`Account ${accountNumber}`}
                placeholderTextColor={COLORS.textTertiary}
                value={accountName}
                onChangeText={onNameChange}
                autoFocus
                maxLength={30}
              />
            </View>

            <View style={styles.actions}>
              <TouchableOpacity
                style={[styles.button, styles.cancelButton]}
                onPress={onClose}
                activeOpacity={0.7}
              >
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.button, styles.continueButton]}
                onPress={onContinue}
                activeOpacity={0.7}
              >
                <Text style={styles.continueText}>Continue</Text>
              </TouchableOpacity>
            </View>
          </View>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
};

export default AddAccountModal;
