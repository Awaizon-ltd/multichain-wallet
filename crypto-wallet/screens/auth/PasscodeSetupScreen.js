import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Vibration,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useWallet } from '../../contexts/WalletContext';
import { useLoading } from '../../contexts/LoadingContext';
import { useTheme } from '../../contexts/ThemeContext';
import Alert from '../../utils/Alert';


const PasscodeSetupScreen = ({ navigation, route }) => {
  const { setupLocalPasscode, decryptedWalletData } = useWallet();
  const { showLoading, updateLoading, hideLoading } = useLoading();

  const { COLORS, SPACING, FONTS } = useTheme();

  const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
    padding: SPACING.lg,
    justifyContent: 'space-between',
  },
  header: {
    alignItems: 'center',
    marginTop: SPACING.xxl * 2,
  },
  logoContainer: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: COLORS.surface,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: SPACING.lg,
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 5,
  },
  stepIndicator: {
    flexDirection: 'row',
    gap: SPACING.sm,
    marginBottom: SPACING.md,
  },
  stepDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.border || '#E0E0E0',
  },
  stepDotActive: {
    backgroundColor: COLORS.primary,
    width: 24,
  },
  title: {
    fontSize: FONTS.sizes.xxl,
    fontWeight: 'bold',
    color: COLORS.text,
    marginBottom: SPACING.sm,
  },
  subtitle: {
    fontSize: FONTS.sizes.sm,
    color: COLORS.textSecondary,
    textAlign: 'center',
    paddingHorizontal: SPACING.lg,
  },
  dotsContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: SPACING.md,
    marginVertical: SPACING.xl,
  },
  dot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: COLORS.textSecondary,
    backgroundColor: 'transparent',
  },
  dotFilled: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  errorContainer: {
    height: 30,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.xs,
  },
  errorText: {
    fontSize: FONTS.sizes.sm,
    color: COLORS.error,
    fontWeight: '500',
  },
  keypad: {
    marginBottom: SPACING.lg,
  },
  keypadRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginBottom: SPACING.md,
  },
  keyButton: {
    width: 65,
    height: 65,
    borderRadius: 32.5,
    backgroundColor: COLORS.surface,
    justifyContent: 'center',
    alignItems: 'center',
    marginHorizontal: SPACING.sm,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  keyText: {
    fontSize: FONTS.sizes.xxl,
    fontWeight: '400',
    color: COLORS.text,
  },
  footer: {
    alignItems: 'center',
    paddingBottom: SPACING.lg,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    padding: SPACING.md,
    marginBottom: SPACING.md,
  },
  backButtonText: {
    fontSize: FONTS.sizes.md,
    color: COLORS.primary,
    fontWeight: '500',
  },
  tipsContainer: {
    backgroundColor: COLORS.surface || '#F5F5F5',
    padding: SPACING.md,
    borderRadius: 12,
    marginBottom: SPACING.md,
    gap: SPACING.sm,
  },
  tip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  tipText: {
    fontSize: FONTS.sizes.sm,
    color: COLORS.textSecondary,
  },
  securityFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
  },
  securityText: {
    fontSize: FONTS.sizes.xs,
    color: COLORS.textTertiary,
  },
});
  
  const [step, setStep] = useState(1); // 1 = create, 2 = confirm
  const [newPasscode, setNewPasscode] = useState('');
  const [confirmPasscode, setConfirmPasscode] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const shakeAnimation = useRef(new Animated.Value(0)).current;

  const PASSCODE_LENGTH = 6;

  const currentPasscode = step === 1 ? newPasscode : confirmPasscode;
  const setCurrentPasscode = step === 1 ? setNewPasscode : setConfirmPasscode;

  const handleNumberPress = (num) => {
    if (currentPasscode.length < PASSCODE_LENGTH && !isLoading) {
      const newValue = currentPasscode + num;
      setCurrentPasscode(newValue);
      setError('');

      // Auto-advance when reaching max length
      if (newValue.length === PASSCODE_LENGTH) {
        setTimeout(() => {
          if (step === 1) {
            handleContinue(newValue);
          } else {
            handleConfirm(newValue);
          }
        }, 200);
      }
    }
  };

  const handleBackspace = () => {
    if (!isLoading) {
      setCurrentPasscode(prev => prev.slice(0, -1));
      setError('');
    }
  };

  const handleContinue = (passcode = newPasscode) => {
    if (passcode.length !== PASSCODE_LENGTH) {
      setError('PIN must be exactly 6 digits');
      shake();
      return;
    }

    console.log('[PasscodeSetup] Step 1 PIN:', passcode);
    setStep(2);
  };

  const handleConfirm = async (passcode = confirmPasscode) => {
    if (passcode.length !== PASSCODE_LENGTH) {
      setError('PIN must be exactly 6 digits');
      shake();
      return;
    }

    console.log('[PasscodeSetup] Step 1 PIN:', newPasscode);
    console.log('[PasscodeSetup] Step 2 PIN:', passcode);
    console.log('[PasscodeSetup] Match:', newPasscode === passcode);

    if (newPasscode !== passcode) {
      setError('PINs do not match');
      setConfirmPasscode('');
      Vibration.vibrate(500);
      shake();
      return;
    }

    try {
      setIsLoading(true);
      
      // Step 1/3: Encrypting wallet
      showLoading('Encrypting your wallet...', { step: 1, totalSteps: 3 });
      
      // Step 2/3: Securing data
      updateLoading('Securing your data...', 2);
      
      await setupLocalPasscode(newPasscode, decryptedWalletData);
      
      // Step 3/3: Finalizing
      updateLoading('Finalizing setup...', 3);
      await new Promise(resolve => setTimeout(resolve, 300));
      
      hideLoading();
      
      Alert.alert(
        '✓ Success',
        'Your PIN has been set up successfully! You can now use this PIN for quick unlocks on this device.',
        [
          {
            text: 'Continue',
            onPress: () => {
              // Navigation will automatically route to Main app
            }
          }
        ]
      );
    } catch (error) {
      console.error('Error setting up passcode:', error);
      hideLoading();
      setError('Failed to set up PIN');
      shake();
      Alert.alert(
        'Setup Failed',
        'Failed to set up PIN. Please try again.',
        [
          {
            text: 'OK',
            onPress: () => {
              setStep(1);
              setNewPasscode('');
              setConfirmPasscode('');
            }
          }
        ]
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleBack = () => {
    if (step === 2 && !isLoading) {
      setStep(1);
      setConfirmPasscode('');
      setError('');
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
              index < currentPasscode.length && styles.dotFilled
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
      [null, '0', 'backspace'],
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
                    disabled={isLoading}
                  >
                    <Ionicons name="backspace-outline" size={28} color={COLORS.text} />
                  </TouchableOpacity>
                );
              }

              return (
                <TouchableOpacity
                  key={keyIndex}
                  style={styles.keyButton}
                  onPress={() => handleNumberPress(key)}
                  activeOpacity={0.7}
                  disabled={isLoading}
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
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.logoContainer}>
          <Ionicons 
            name={step === 1 ? "keypad" : "checkmark-circle"} 
            size={48} 
            color={COLORS.primary} 
          />
        </View>
        
        <View style={styles.stepIndicator}>
          <View style={[styles.stepDot, styles.stepDotActive]} />
          <View style={[styles.stepDot, step === 2 && styles.stepDotActive]} />
        </View>

        <Text style={styles.title}>
          {step === 1 ? 'Create Your PIN' : 'Confirm Your PIN'}
        </Text>
        <Text style={styles.subtitle}>
          {step === 1 
            ? 'Enter exactly 6 digits for quick access' 
            : 'Re-enter your 6-digit PIN to confirm'}
        </Text>
      </View>

      {renderDots()}

      {error ? (
        <View style={styles.errorContainer}>
          <Ionicons name="alert-circle" size={20} color={COLORS.error} />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : (
        <View style={styles.errorContainer} />
      )}

      {renderKeypad()}

      <View style={styles.footer}>
        {step === 2 && (
          <TouchableOpacity
            style={styles.backButton}
            onPress={handleBack}
            activeOpacity={0.7}
            disabled={isLoading}
          >
            <Ionicons name="arrow-back" size={20} color={COLORS.primary} />
            <Text style={styles.backButtonText}>Back</Text>
          </TouchableOpacity>
        )}
        
        {step === 1 && (
          <View style={styles.tipsContainer}>
            <View style={styles.tip}>
              <Ionicons name="checkmark-circle-outline" size={16} color={COLORS.success || '#10B981'} />
              <Text style={styles.tipText}>Must be exactly 6 digits</Text>
            </View>
            <View style={styles.tip}>
              <Ionicons name="checkmark-circle-outline" size={16} color={COLORS.success || '#10B981'} />
              <Text style={styles.tipText}>Avoid patterns like 123456</Text>
            </View>
          </View>
        )}

        <View style={styles.securityFooter}>
          <Ionicons name="shield-checkmark-outline" size={16} color={COLORS.textTertiary} />
          <Text style={styles.securityText}>Your PIN is encrypted and secure</Text>
        </View>
      </View>
    </View>
  );
};



export default PasscodeSetupScreen;