// components/UpdateModal.js
import React from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Linking,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, FONTS, SPACING } from '../constants/Theme';

export const UpdateModal = ({ 
  visible, 
  updateInfo, 
  isMandatory = false,
  isOTA = false,
  onUpdate,
  onLater,
  updating = false,
}) => {
  const handleUpdate = () => {
    if (isOTA) {
      onUpdate?.();
    } else {
      Linking.openURL(updateInfo?.storeUrl);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={isMandatory ? null : onLater}
    >
      <View style={styles.overlay}>
        <View style={styles.modal}>
          {/* Icon */}
          <View style={styles.iconContainer}>
            <Ionicons name="download-outline" size={48} color={COLORS.primary} />
          </View>

          {/* Title */}
          <Text style={styles.title}>
            {isMandatory ? 'Update Required' : 'Update Available'}
          </Text>

          {/* Message */}
          <Text style={styles.message}>
            {isOTA
              ? 'A new update is ready to install. The app will restart after updating.'
              : `Version ${updateInfo?.latestVersion} is now available. You are currently using version ${updateInfo?.currentVersion}.`}
          </Text>

          {isMandatory && (
            <Text style={styles.mandatoryText}>
              This update is required to continue using the app.
            </Text>
          )}

          {/* Buttons */}
          {updating ? (
            <View style={styles.updatingContainer}>
              <ActivityIndicator size="large" color={COLORS.primary} />
              <Text style={styles.updatingText}>Updating...</Text>
            </View>
          ) : (
            <View style={styles.buttonContainer}>
              {!isMandatory && (
                <TouchableOpacity
                  style={[styles.button, styles.laterButton]}
                  onPress={onLater}
                >
                  <Text style={styles.laterButtonText}>Later</Text>
                </TouchableOpacity>
              )}
              
              <TouchableOpacity
                style={[styles.button, styles.updateButton]}
                onPress={handleUpdate}
              >
                <Text style={styles.updateButtonText}>
                  {isOTA ? 'Install Update' : 'Update Now'}
                </Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: SPACING.xl,
  },
  modal: {
    backgroundColor: COLORS.surface,
    borderRadius: 20,
    padding: SPACING.xl,
    width: '100%',
    maxWidth: 400,
    alignItems: 'center',
  },
  iconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: `${COLORS.primary}20`,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: SPACING.lg,
  },
  title: {
    fontSize: FONTS.sizes.xl,
    fontWeight: 'bold',
    color: COLORS.text,
    marginBottom: SPACING.md,
    textAlign: 'center',
  },
  message: {
    fontSize: FONTS.sizes.md,
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginBottom: SPACING.md,
    lineHeight: 22,
  },
  mandatoryText: {
    fontSize: FONTS.sizes.sm,
    color: COLORS.warning,
    textAlign: 'center',
    marginBottom: SPACING.lg,
    fontWeight: '600',
  },
  buttonContainer: {
    flexDirection: 'row',
    width: '100%',
    gap: SPACING.md,
    marginTop: SPACING.md,
  },
  button: {
    flex: 1,
    paddingVertical: SPACING.md,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  laterButton: {
    backgroundColor: COLORS.backgroundTertiary,
  },
  laterButtonText: {
    fontSize: FONTS.sizes.md,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  updateButton: {
    backgroundColor: COLORS.primary,
  },
  updateButtonText: {
    fontSize: FONTS.sizes.md,
    fontWeight: 'bold',
    color: '#000',
  },
  updatingContainer: {
    alignItems: 'center',
    marginTop: SPACING.lg,
  },
  updatingText: {
    fontSize: FONTS.sizes.md,
    color: COLORS.textSecondary,
    marginTop: SPACING.md,
  },
});