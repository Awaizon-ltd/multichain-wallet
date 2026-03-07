import React from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../contexts/ThemeContext';

const { width } = Dimensions.get('window');

const CustomAlert = ({ visible, title, message, buttons, onDismiss }) => {
  const { COLORS, SPACING, FONTS, SHADOWS } = useTheme();

  const styles = StyleSheet.create({
    overlay: {
      flex: 1,
      backgroundColor: 'rgba(0, 0, 0, 0.6)',
      justifyContent: 'center',
      alignItems: 'center',
      padding: SPACING.xl,
    },
    alertContainer: {
      width: width - SPACING.xl * 2,
      maxWidth: 400,
      backgroundColor: COLORS.surface,
      borderRadius: 16,
      overflow: 'hidden',
      ...SHADOWS.large,
    },
    content: {
      padding: SPACING.xl,
    },
    iconContainer: {
      alignItems: 'center',
      marginBottom: SPACING.md,
    },
    title: {
      fontSize: FONTS.sizes.lg,
      fontWeight: 'bold',
      color: COLORS.text,
      textAlign: 'center',
      marginBottom: SPACING.sm,
    },
    message: {
      fontSize: FONTS.sizes.md,
      color: COLORS.textSecondary,
      textAlign: 'center',
      lineHeight: 22,
    },
    buttonContainer: {
      flexDirection: 'row',
      borderTopWidth: 1,
      borderTopColor: COLORS.border,
    },
    button: {
      flex: 1,
      paddingVertical: SPACING.md,
      alignItems: 'center',
      justifyContent: 'center',
    },
    buttonDivider: {
      width: 1,
      backgroundColor: COLORS.border,
    },
    buttonText: {
      fontSize: FONTS.sizes.md,
      fontWeight: '600',
      color: COLORS.primary,
    },
    buttonTextCancel: {
      color: COLORS.textSecondary,
    },
    buttonTextDestructive: {
      color: COLORS.error,
    },
  });

  // Get icon based on button style or title keywords
  const getIcon = () => {
    const titleLower = title?.toLowerCase() || '';
    if (titleLower.includes('success')) {
      return { name: 'checkmark-circle', color: COLORS.success };
    } else if (titleLower.includes('error') || titleLower.includes('fail')) {
      return { name: 'close-circle', color: COLORS.error };
    } else if (titleLower.includes('warning')) {
      return { name: 'warning', color: COLORS.warning };
    }
    return { name: 'information-circle', color: COLORS.primary };
  };

  const icon = getIcon();

  // Default button if none provided
  const defaultButtons = [{ text: 'OK', onPress: onDismiss }];
  const alertButtons = buttons && buttons.length > 0 ? buttons : defaultButtons;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onDismiss}
    >
      <View style={styles.overlay}>
        <View style={styles.alertContainer}>
          <View style={styles.content}>
            <View style={styles.iconContainer}>
              <Ionicons name={icon.name} size={48} color={icon.color} />
            </View>
            {title && <Text style={styles.title}>{title}</Text>}
            {message && <Text style={styles.message}>{message}</Text>}
          </View>

          <View style={styles.buttonContainer}>
            {alertButtons.map((button, index) => (
              <React.Fragment key={index}>
                {index > 0 && <View style={styles.buttonDivider} />}
                <TouchableOpacity
                  style={styles.button}
                  onPress={() => {
                    button.onPress?.();
                    onDismiss();
                  }}
                >
                  <Text
                    style={[
                      styles.buttonText,
                      button.style === 'cancel' && styles.buttonTextCancel,
                      button.style === 'destructive' && styles.buttonTextDestructive,
                    ]}
                  >
                    {button.text}
                  </Text>
                </TouchableOpacity>
              </React.Fragment>
            ))}
          </View>
        </View>
      </View>
    </Modal>
  );
};

export default CustomAlert;