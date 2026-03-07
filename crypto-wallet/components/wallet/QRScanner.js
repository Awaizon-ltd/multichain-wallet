import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { COLORS, SPACING, FONTS } from '../../constants/Theme';

const QRScanner = ({ visible, onClose, onScan }) => {
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);

  useEffect(() => {
    if (visible && !permission?.granted) {
      requestPermission();
    }
  }, [visible]);

  const handleBarCodeScanned = ({ type, data }) => {
    if (scanned) return;
    
    setScanned(true);
    
    // Extract address from QR code data
    // Supports ethereum:0x... format or plain address
    let address = data;
    if (data.startsWith('ethereum:')) {
      address = data.replace('ethereum:', '').split('@')[0].split('?')[0];
    }
    
    onScan(address);
    onClose();
    
    // Reset scanned state after a delay
    setTimeout(() => setScanned(false), 2000);
  };

  if (!permission) {
    // Camera permissions are still loading
    return null;
  }

  if (!permission.granted) {
    return (
      <Modal visible={visible} animationType="slide">
        <View style={styles.container}>
          <View style={styles.permissionContainer}>
            <Text style={styles.permissionTitle}>Camera Access Required</Text>
            <Text style={styles.permissionText}>
              We need camera permission to scan QR codes
            </Text>
            <TouchableOpacity
              style={styles.permissionButton}
              onPress={requestPermission}
            >
              <Text style={styles.permissionButtonText}>Grant Permission</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.closeButton}
              onPress={onClose}
            >
              <Text style={styles.closeButtonText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    );
  }

  return (
    <Modal visible={visible} animationType="slide">
      <View style={styles.container}>
        <CameraView
          style={styles.camera}
          facing="back"
          onBarcodeScanned={scanned ? undefined : handleBarCodeScanned}
          barcodeScannerSettings={{
            barcodeTypes: ['qr'],
          }}
        >
          <View style={styles.overlay}>
            <View style={styles.header}>
              <Text style={styles.headerText}>Scan QR Code</Text>
              <TouchableOpacity
                style={styles.closeIcon}
                onPress={onClose}
              >
                <Text style={styles.closeIconText}>✕</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.scanArea}>
              <View style={styles.cornerTopLeft} />
              <View style={styles.cornerTopRight} />
              <View style={styles.cornerBottomLeft} />
              <View style={styles.cornerBottomRight} />
            </View>

            <View style={styles.footer}>
              <Text style={styles.footerText}>
                Position the QR code within the frame
              </Text>
            </View>
          </View>
        </CameraView>
      </View>
    </Modal>
  );
};

const cornerStyle = {
  position: 'absolute',
  width: 40,
  height: 40,
  borderColor: COLORS.primary,
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  camera: {
    flex: 1,
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: SPACING.lg,
    paddingTop: SPACING.xl + 20,
  },
  headerText: {
    fontSize: FONTS.sizes.xl,
    fontWeight: 'bold',
    color: COLORS.background,
  },
  closeIcon: {
    padding: SPACING.sm,
  },
  closeIconText: {
    fontSize: FONTS.sizes.xl,
    color: COLORS.background,
    fontWeight: 'bold',
  },
  scanArea: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  cornerTopLeft: {
    ...cornerStyle,
    top: -120,
    left: -120,
    borderTopWidth: 4,
    borderLeftWidth: 4,
  },
  cornerTopRight: {
    ...cornerStyle,
    top: -120,
    right: -120,
    borderTopWidth: 4,
    borderRightWidth: 4,
  },
  cornerBottomLeft: {
    ...cornerStyle,
    bottom: -120,
    left: -120,
    borderBottomWidth: 4,
    borderLeftWidth: 4,
  },
  cornerBottomRight: {
    ...cornerStyle,
    bottom: -120,
    right: -120,
    borderBottomWidth: 4,
    borderRightWidth: 4,
  },
  footer: {
    padding: SPACING.xl,
    paddingBottom: SPACING.xl + 40,
  },
  footerText: {
    fontSize: FONTS.sizes.md,
    color: COLORS.background,
    textAlign: 'center',
  },
  permissionContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: SPACING.xl,
  },
  permissionTitle: {
    fontSize: FONTS.sizes.xl,
    fontWeight: 'bold',
    color: COLORS.text,
    marginBottom: SPACING.md,
    textAlign: 'center',
  },
  permissionText: {
    fontSize: FONTS.sizes.md,
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginBottom: SPACING.xl,
  },
  permissionButton: {
    backgroundColor: COLORS.primary,
    padding: SPACING.md,
    paddingHorizontal: SPACING.xl,
    borderRadius: 12,
    marginBottom: SPACING.md,
    minWidth: 200,
  },
  permissionButtonText: {
    fontSize: FONTS.sizes.md,
    fontWeight: 'bold',
    color: COLORS.background,
    textAlign: 'center',
  },
  closeButton: {
    padding: SPACING.md,
    paddingHorizontal: SPACING.xl,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    minWidth: 200,
  },
  closeButtonText: {
    fontSize: FONTS.sizes.md,
    fontWeight: '600',
    color: COLORS.text,
    textAlign: 'center',
  },
});

export default QRScanner;