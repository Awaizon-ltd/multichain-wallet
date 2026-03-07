import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Animated,
  Vibration,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import * as SecureStore from 'expo-secure-store';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../contexts/ThemeContext'; // Adjust path as needed
import { APP_CONFIG } from '../../constants/Config';
import Button from '../../components/common/Button';
import { decryptWallet } from '../../utils/Encryption';
import Alert from '../../utils/Alert';

const RecoveryPhraseScreen = ({ navigation }) => {
  const theme = useTheme();
  const styles = createStyles(theme);
  const [showWarning, setShowWarning] = useState(true);
  const [pin, setPin] = useState('');
  const [pinError, setPinError] = useState(false);
  const [mnemonic, setMnemonic] = useState(null);
  const [isUnlocking, setIsUnlocking] = useState(false);
  const [showMnemonic, setShowMnemonic] = useState(false);
  const shakeAnimation = useRef(new Animated.Value(0)).current;

  const PASSCODE_LENGTH = 6;

  const handleNumberPress = (num) => {
    if (pin.length < PASSCODE_LENGTH && !isUnlocking) {
      const newPin = pin + num;
      setPin(newPin);
      setPinError(false);
      
      // Auto-submit when complete
      if (newPin.length === PASSCODE_LENGTH) {
        unlockWallet(newPin);
      }
    }
  };

  const handleBackspace = () => {
    if (!isUnlocking) {
      setPin(prev => prev.slice(0, -1));
      setPinError(false);
    }
  };

  const shake = () => {
    Animated.sequence([
      Animated.timing(shakeAnimation, { toValue: 10, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnimation, { toValue: -10, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnimation, { toValue: 10, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnimation, { toValue: 0, duration: 50, useNativeDriver: true }),
    ]).start();
  };

 const unlockWallet = async (passcode) => {
   try {
     setIsUnlocking(true);

     const localWalletJson = await SecureStore.getItemAsync(
       APP_CONFIG.STORAGE_KEYS.LOCAL_WALLET,
     );

     if (!localWalletJson) {
       Alert.alert("Error", "No wallet found on this device");
       setPin("");
       setPinError(true);
       shake();
       Vibration.vibrate(500);
       return;
     }

     const localWallet = JSON.parse(localWalletJson);

     // ✅ FIX: decryptWallet now returns { wallet, migrated, upgradedPayload }
     const { wallet: decryptedData } = await decryptWallet(
       localWallet.encrypted,
       passcode,
       localWallet.salt,
     );

     if (decryptedData && decryptedData.mnemonic) {
       setMnemonic(decryptedData.mnemonic);
       setShowMnemonic(true);
     } else {
       throw new Error("Invalid wallet data");
     }
   } catch (err) {
     console.error("Error unlocking wallet:", err);
     Alert.alert(
       "Invalid PIN",
       "The PIN you entered is incorrect. Please try again.",
       [
         {
           text: "OK",
           onPress: () => {
             setPin("");
             setPinError(true);
             shake();
             Vibration.vibrate(500);
           },
         },
       ],
     );
   } finally {
     setIsUnlocking(false);
   }
 };

  const handleCopyToClipboard = async () => {
    try {
      await Clipboard.setStringAsync(mnemonic);
      Alert.alert(
        'Copied!',
        'Recovery phrase copied to clipboard. Remember to never share this with anyone!',
        [{ text: 'OK' }]
      );
    } catch (err) {
      Alert.alert('Error', 'Failed to copy to clipboard');
    }
  };

  const handleProceedFromWarning = () => {
    setShowWarning(false);
  };

  const handleGoBack = () => {
    if (showMnemonic) {
      Alert.alert(
        'Are you sure?',
        'Make sure you have safely stored your recovery phrase.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Go Back', onPress: () => navigation.goBack() },
        ]
      );
    } else {
      navigation.goBack();
    }
  };

  const mnemonicWords = mnemonic ? mnemonic.split(' ') : [];

  const renderDots = () => {
    return (
      <Animated.View 
        style={[
          styles.dotsContainer,
          { transform: [{ translateX: shakeAnimation }] }
        ]}
      >
        {Array.from({ length: PASSCODE_LENGTH }).map((_, index) => (
          <View
            key={index}
            style={[
              styles.dot,
              index < pin.length && styles.dotFilled,
              pinError && styles.dotError,
            ]}
          />
        ))}
      </Animated.View>
    );
  };

  const renderKeypad = () => {
    const numbers = [
      ['1', '2', '3'],
      ['4', '5', '6'],
      ['7', '8', '9'],
      ['', '0', 'backspace'],
    ];

    return (
      <View style={styles.keypad}>
        {numbers.map((row, rowIndex) => (
          <View key={rowIndex} style={styles.keypadRow}>
            {row.map((key, keyIndex) => {
              if (key === '') {
                return <View key={keyIndex} style={styles.keyButton} />;
              }

              if (key === 'backspace') {
                return (
                  <TouchableOpacity
                    key={keyIndex}
                    style={styles.keyButton}
                    onPress={handleBackspace}
                    activeOpacity={0.7}
                    disabled={isUnlocking}
                  >
                    <Ionicons name="backspace-outline" size={28} color={theme.COLORS.text} />
                  </TouchableOpacity>
                );
              }

              return (
                <TouchableOpacity
                  key={keyIndex}
                  style={styles.keyButton}
                  onPress={() => handleNumberPress(key)}
                  activeOpacity={0.7}
                  disabled={isUnlocking}
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

  // Warning Modal
  if (showWarning) {
    return (
      <View style={styles.container}>
        <ScrollView contentContainerStyle={styles.warningContainer}>
          <View style={styles.warningIcon}>
            <Ionicons name="warning" size={64} color={theme.COLORS.warning} />
          </View>

          <Text style={styles.warningTitle}>Security Warning</Text>
          
          <View style={styles.warningBox}>
            <Text style={styles.warningText}>
              Your recovery phrase is the ONLY way to recover your wallet if you lose access to this device.
            </Text>
          </View>

          <View style={styles.warningList}>
            <WarningItem 
              icon="shield-checkmark"
              text="Never share your recovery phrase with anyone"
              theme={theme}
            />
            <WarningItem 
              icon="camera-reverse"
              text="Be careful of cameras and screen recording"
              theme={theme}
            />
            <WarningItem 
              icon="cloud-offline"
              text="Store it offline in a secure location"
              theme={theme}
            />
            <WarningItem 
              icon="people"
              text="Anyone with this phrase can access your funds"
              theme={theme}
            />
          </View>

          <View style={styles.warningButtons}>
            <Button
              title="I Understand"
              onPress={handleProceedFromWarning}
              variant="primary"
              fullWidth
            />
            <Button
              title="Go Back"
              onPress={() => navigation.goBack()}
              variant="secondary"
              fullWidth
              style={{ marginTop: theme.SPACING.md }}
            />
          </View>
        </ScrollView>
      </View>
    );
  }

  // PIN Input Screen
  if (!showMnemonic) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={handleGoBack} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color={theme.COLORS.text} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Enter PIN</Text>
          <View style={{ width: 24 }} />
        </View>

        <View style={styles.pinContainer}>
          <View style={styles.lockIcon}>
            <Ionicons name="lock-closed" size={40} color={theme.COLORS.primary} />
          </View>

          <Text style={styles.pinTitle}>Enter your PIN</Text>
          <Text style={styles.pinSubtitle}>
            Required to view recovery phrase
          </Text>

          {renderDots()}

          {pinError ? (
            <View style={styles.errorContainer}>
              <Ionicons name="alert-circle" size={18} color={theme.COLORS.error} />
              <Text style={styles.errorText}>Incorrect PIN</Text>
            </View>
          ) : (
            <View style={styles.errorContainer} />
          )}

          {renderKeypad()}

          {isUnlocking && (
            <View style={styles.unlockingContainer}>
              <Text style={styles.unlockingText}>Unlocking...</Text>
            </View>
          )}
        </View>
      </View>
    );
  }

  // Recovery Phrase Display
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={handleGoBack} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={theme.COLORS.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Recovery Phrase</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.securityAlert}>
          <Ionicons name="warning" size={24} color={theme.COLORS.warning} />
          <Text style={styles.securityAlertText}>
            Never share this phrase with anyone!
          </Text>
        </View>

        <Text style={styles.instructionText}>
          Write down these 12 words in order and store them in a safe place.
          This is the only way to recover your wallet.
        </Text>

        {/* Mnemonic Grid */}
        <View style={styles.mnemonicGrid}>
          {mnemonicWords.map((word, index) => (
            <View key={index} style={styles.wordBox}>
              <Text style={styles.wordNumber}>{index + 1}</Text>
              <Text style={styles.wordText}>{word}</Text>
            </View>
          ))}
        </View>

        {/* Copy Button */}
        <Button
          title="Copy to Clipboard"
          onPress={handleCopyToClipboard}
          variant="secondary"
          fullWidth
          icon={<Ionicons name="copy-outline" size={20} color={theme.COLORS.text} />}
        />

        {/* Additional Warning */}
        <View style={styles.bottomWarning}>
          <Ionicons name="lock-closed" size={20} color={theme.COLORS.textSecondary} />
          <Text style={styles.bottomWarningText}>
            Store this phrase offline. Anyone with access to it can steal your funds.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
};

const WarningItem = ({ icon, text, theme }) => {
  const styles = createStyles(theme);
  
  return (
    <View style={styles.warningItem}>
      <View style={styles.warningItemIcon}>
        <Ionicons name={icon} size={24} color={theme.COLORS.warning} />
      </View>
      <Text style={styles.warningItemText}>{text}</Text>
    </View>
  );
};

const createStyles = (theme) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.COLORS.background,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: theme.SPACING.md,
      borderBottomWidth: 1,
      borderBottomColor: theme.COLORS.border,
      backgroundColor: theme.COLORS.surface,
    },
    backButton: {
      padding: theme.SPACING.xs,
    },
    headerTitle: {
      fontSize: theme.FONTS.sizes.xl,
      fontWeight: 'bold',
      color: theme.COLORS.text,
    },
    
    // Warning Screen
    warningContainer: {
      padding: theme.SPACING.lg,
      alignItems: 'center',
    },
    warningIcon: {
      marginTop: theme.SPACING.xl,
      marginBottom: theme.SPACING.lg,
    },
    warningTitle: {
      fontSize: theme.FONTS.sizes.xxl,
      fontWeight: 'bold',
      color: theme.COLORS.text,
      marginBottom: theme.SPACING.md,
    },
    warningBox: {
      backgroundColor: `${theme.COLORS.warning}20`,
      padding: theme.SPACING.md,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: theme.COLORS.warning,
      marginBottom: theme.SPACING.lg,
    },
    warningText: {
      fontSize: theme.FONTS.sizes.md,
      color: theme.COLORS.text,
      textAlign: 'center',
      lineHeight: 22,
    },
    warningList: {
      width: '100%',
      marginBottom: theme.SPACING.lg,
    },
    warningItem: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: theme.SPACING.md,
      paddingVertical: theme.SPACING.xs,
    },
    warningItemIcon: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: `${theme.COLORS.warning}20`,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: theme.SPACING.md,
    },
    warningItemText: {
      flex: 1,
      fontSize: theme.FONTS.sizes.md,
      color: theme.COLORS.text,
      lineHeight: 20,
    },
    warningButtons: {
      width: '100%',
    },

    // PIN Screen
    pinContainer: {
      flex: 1,
      padding: theme.SPACING.md,
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingTop: theme.SPACING.xl,
    },
    lockIcon: {
      width: 70,
      height: 70,
      borderRadius: 35,
      backgroundColor: theme.COLORS.primaryLight,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: theme.SPACING.md,
    },
    pinTitle: {
      fontSize: theme.FONTS.sizes.xl,
      fontWeight: 'bold',
      color: theme.COLORS.text,
      marginBottom: theme.SPACING.xs,
    },
    pinSubtitle: {
      fontSize: theme.FONTS.sizes.sm,
      color: theme.COLORS.textSecondary,
      textAlign: 'center',
      marginBottom: theme.SPACING.lg,
    },
    dotsContainer: {
      flexDirection: 'row',
      justifyContent: 'center',
      gap: theme.SPACING.sm,
      marginBottom: theme.SPACING.md,
    },
    dot: {
      width: 14,
      height: 14,
      borderRadius: 7,
      borderWidth: 2,
      borderColor: theme.COLORS.textSecondary,
      backgroundColor: 'transparent',
    },
    dotFilled: {
      backgroundColor: theme.COLORS.primary,
      borderColor: theme.COLORS.primary,
    },
    dotError: {
      borderColor: theme.COLORS.error,
      backgroundColor: `${theme.COLORS.error}30`,
    },
    errorContainer: {
      height: 28,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: theme.SPACING.xs,
    },
    errorText: {
      fontSize: theme.FONTS.sizes.sm,
      color: theme.COLORS.error,
      fontWeight: '500',
    },
    keypad: {
      marginBottom: theme.SPACING.md,
    },
    keypadRow: {
      flexDirection: 'row',
      justifyContent: 'center',
      marginBottom: theme.SPACING.sm,
    },
    keyButton: {
      width: 70,
      height: 70,
      borderRadius: 35,
      backgroundColor: theme.COLORS.surface,
      justifyContent: 'center',
      alignItems: 'center',
      marginHorizontal: theme.SPACING.sm,
      ...theme.SHADOWS.small,
    },
    keyText: {
      fontSize: theme.FONTS.sizes.xxl,
      fontWeight: '400',
      color: theme.COLORS.text,
    },
    unlockingContainer: {
      marginBottom: theme.SPACING.lg,
    },
    unlockingText: {
      fontSize: theme.FONTS.sizes.sm,
      color: theme.COLORS.primary,
      fontWeight: '600',
    },

    // Recovery Phrase Display
    content: {
      padding: theme.SPACING.md,
      paddingBottom: 120,
    },
    securityAlert: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: `${theme.COLORS.warning}20`,
      padding: theme.SPACING.md,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: theme.COLORS.warning,
      marginBottom: theme.SPACING.md,
      gap: theme.SPACING.sm,
    },
    securityAlertText: {
      flex: 1,
      fontSize: theme.FONTS.sizes.md,
      fontWeight: '600',
      color: theme.COLORS.text,
    },
    instructionText: {
      fontSize: theme.FONTS.sizes.sm,
      color: theme.COLORS.textSecondary,
      textAlign: 'center',
      marginBottom: theme.SPACING.lg,
      lineHeight: 20,
    },
    mnemonicGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: theme.SPACING.sm,
      marginBottom: theme.SPACING.lg,
    },
    wordBox: {
      width: '47.5%',
      backgroundColor: theme.COLORS.surface,
      padding: theme.SPACING.md,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: theme.COLORS.border,
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.SPACING.sm,
    },
    wordNumber: {
      fontSize: theme.FONTS.sizes.xs,
      fontWeight: '600',
      color: theme.COLORS.textTertiary,
      minWidth: 18,
    },
    wordText: {
      fontSize: theme.FONTS.sizes.md,
      fontWeight: '600',
      color: theme.COLORS.text,
      flex: 1,
    },
    bottomWarning: {
      flexDirection: 'row',
      alignItems: 'center',
      marginTop: theme.SPACING.md,
      padding: theme.SPACING.md,
      gap: theme.SPACING.xs,
    },
    bottomWarningText: {
      flex: 1,
      fontSize: theme.FONTS.sizes.xs,
      color: theme.COLORS.textSecondary,
      lineHeight: 18,
    },
  });

export default RecoveryPhraseScreen;