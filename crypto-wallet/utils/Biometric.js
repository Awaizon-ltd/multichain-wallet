import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';

const BIOMETRIC_ENABLED_KEY = 'biometric_auth_enabled';
const BIOMETRIC_TYPE_KEY = 'biometric_auth_type';
const BIOMETRIC_PIN_KEY = 'biometric_stored_pin';

/**
 * Check if device has biometric hardware
 */
export const hasBiometricHardware = async () => {
  try {
    const hasHardware = await LocalAuthentication.hasHardwareAsync();
    return hasHardware;
  } catch (error) {
    console.error('[Biometric] Error checking hardware:', error);
    return false;
  }
};

/**
 * Check if user has enrolled biometrics
 */
export const isBiometricEnrolled = async () => {
  try {
    const isEnrolled = await LocalAuthentication.isEnrolledAsync();
    return isEnrolled;
  } catch (error) {
    console.error('[Biometric] Error checking enrollment:', error);
    return false;
  }
};

/**
 * Get the actual biometric type available on device
 */
export const getDeviceBiometricType = async () => {
  try {
    const types = await LocalAuthentication.supportedAuthenticationTypesAsync();
    
    console.log('[Biometric] Supported types:', types);
    
    // Priority: Face ID > Fingerprint > Iris
    if (types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) {
      return {
        type: 'FACIAL_RECOGNITION',
        name: 'Face ID',
        icon: 'scan',
      };
    }
    
    if (types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) {
      return {
        type: 'FINGERPRINT',
        name: 'Fingerprint',
        icon: 'finger-print',
      };
    }
    
    if (types.includes(LocalAuthentication.AuthenticationType.IRIS)) {
      return {
        type: 'IRIS',
        name: 'Iris Scan',
        icon: 'eye',
      };
    }
    
    return null;
  } catch (error) {
    console.error('[Biometric] Error getting type:', error);
    return null;
  }
};

/**
 * Legacy function name for backward compatibility
 */
export const getBiometricTypeName = async () => {
  const type = await getDeviceBiometricType();
  return type?.name || 'Biometric';
};

/**
 * Get supported biometric types (raw values)
 */
export const getSupportedBiometricTypes = async () => {
  try {
    const types = await LocalAuthentication.supportedAuthenticationTypesAsync();
    return types;
  } catch (error) {
    console.error('[Biometric] Error getting supported types:', error);
    return [];
  }
};

/**
 * Get biometric status
 */
export const getBiometricStatus = async () => {
  try {
    const hasHardware = await hasBiometricHardware();
    const isEnrolled = await isBiometricEnrolled();
    const deviceType = await getDeviceBiometricType();
    
    return {
      available: hasHardware && isEnrolled && deviceType !== null,
      hasHardware,
      isEnrolled,
      type: deviceType,
    };
  } catch (error) {
    console.error('[Biometric] Error getting status:', error);
    return {
      available: false,
      hasHardware: false,
      isEnrolled: false,
      type: null,
    };
  }
};

/**
 * Authenticate with biometrics
 */
export const authenticateWithBiometrics = async (promptMessage) => {
  try {
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: promptMessage || 'Authenticate to continue',
      cancelLabel: 'Cancel',
      disableDeviceFallback: true,
      fallbackLabel: 'Use PIN',
    });

    console.log('[Biometric] Auth result:', result);

    if (result.success) {
      return { success: true };
    }

    if (result.error === 'user_cancel') {
      return { success: false, error: 'user_cancel', message: 'Authentication cancelled' };
    }

    if (result.error === 'user_fallback') {
      return { success: false, error: 'user_fallback', message: 'Use PIN instead' };
    }

    if (result.error === 'lockout') {
      return { success: false, error: 'lockout', message: 'Too many attempts' };
    }

    return { success: false, error: result.error, message: 'Authentication failed' };
  } catch (error) {
    console.error('[Biometric] Authentication error:', error);
    return { success: false, error: 'exception', message: error.message };
  }
};

/**
 * Check if biometric is enabled
 */
export const isBiometricEnabled = async () => {
  try {
    const enabled = await SecureStore.getItemAsync(BIOMETRIC_ENABLED_KEY);
    return enabled === 'true';
  } catch (error) {
    console.error('[Biometric] Error checking enabled:', error);
    return false;
  }
};

/**
 * Get stored biometric type
 */
export const getStoredBiometricType = async () => {
  try {
    const typeJson = await SecureStore.getItemAsync(BIOMETRIC_TYPE_KEY);
    return typeJson ? JSON.parse(typeJson) : null;
  } catch (error) {
    console.error('[Biometric] Error getting stored type:', error);
    return null;
  }
};

/**
 * Setup biometric authentication - store PIN securely
 */
export const setupBiometric = async (pin, biometricType) => {
  try {
    console.log('[Biometric] Setting up biometric with PIN');
    
    // First, verify biometric works
    const authResult = await authenticateWithBiometrics(
      `Verify ${biometricType.name} to enable`
    );

    if (!authResult.success) {
      throw new Error(authResult.message || 'Biometric verification failed');
    }

    // Store PIN securely (encrypted by OS with biometric)
    await SecureStore.setItemAsync(
      BIOMETRIC_PIN_KEY,
      pin,
      {
        requireAuthentication: true,
        authenticationPrompt: 'Authenticate to unlock',
      }
    );

    // Store enabled flag
    await SecureStore.setItemAsync(BIOMETRIC_ENABLED_KEY, 'true');

    // Store biometric type
    await SecureStore.setItemAsync(
      BIOMETRIC_TYPE_KEY,
      JSON.stringify(biometricType)
    );

    console.log('[Biometric] Setup complete');
    return { success: true };
  } catch (error) {
    console.error('[Biometric] Setup error:', error);
    return { success: false, message: error.message };
  }
};

/**
 * Retrieve PIN using biometric authentication
 */
export const getPINWithBiometric = async (biometricType) => {
  try {
    console.log('[Biometric] Attempting to retrieve PIN with biometric');

    // Authenticate with biometric
    const authResult = await authenticateWithBiometrics(
      `Unlock with ${biometricType?.name || 'biometric'}`
    );

    if (!authResult.success) {
      return { success: false, error: authResult.error, message: authResult.message };
    }

    // Retrieve stored PIN
    const storedPIN = await SecureStore.getItemAsync(BIOMETRIC_PIN_KEY, {
      requireAuthentication: true,
      authenticationPrompt: 'Authenticate to retrieve PIN',
    });

    if (!storedPIN) {
      throw new Error('No PIN stored for biometric authentication');
    }

    console.log('[Biometric] Successfully retrieved PIN');
    return { success: true, pin: storedPIN };
  } catch (error) {
    console.error('[Biometric] Error retrieving PIN:', error);
    return { success: false, message: error.message };
  }
};

/**
 * Enable biometric (legacy - use setupBiometric instead)
 */
export const enableBiometric = async (biometricType) => {
  try {
    await SecureStore.setItemAsync(BIOMETRIC_ENABLED_KEY, 'true');
    await SecureStore.setItemAsync(
      BIOMETRIC_TYPE_KEY,
      JSON.stringify(biometricType)
    );
    console.log('[Biometric] Enabled:', biometricType.name);
    return true;
  } catch (error) {
    console.error('[Biometric] Error enabling:', error);
    return false;
  }
};

/**
 * Disable biometric authentication
 */
export const disableBiometric = async () => {
  try {
    await SecureStore.deleteItemAsync(BIOMETRIC_PIN_KEY);
    await SecureStore.deleteItemAsync(BIOMETRIC_ENABLED_KEY);
    await SecureStore.deleteItemAsync(BIOMETRIC_TYPE_KEY);
    console.log('[Biometric] Disabled and cleared');
    return true;
  } catch (error) {
    console.error('[Biometric] Error disabling:', error);
    return false;
  }
};

/**
 * Check if can use biometric (available + enabled)
 */
export const canUseBiometric = async () => {
  try {
    const status = await getBiometricStatus();
    const enabled = await isBiometricEnabled();
    
    return status.available && enabled;
  } catch (error) {
    console.error('[Biometric] Error checking can use:', error);
    return false;
  }
};

/**
 * Update stored PIN (when user changes PIN)
 */
export const updateBiometricPIN = async (newPin, biometricType) => {
  try {
    // Verify biometric first
    const authResult = await authenticateWithBiometrics(
      `Verify ${biometricType.name} to update PIN`
    );

    if (!authResult.success) {
      throw new Error('Biometric verification failed');
    }

    // Update stored PIN
    await SecureStore.setItemAsync(
      BIOMETRIC_PIN_KEY,
      newPin,
      {
        requireAuthentication: true,
        authenticationPrompt: 'Authenticate to unlock',
      }
    );

    console.log('[Biometric] PIN updated');
    return { success: true };
  } catch (error) {
    console.error('[Biometric] Error updating PIN:', error);
    return { success: false, message: error.message };
  }
};

/**
 * Legacy function - use setupBiometric instead
 */
export const setBiometricEnabled = async (enabled) => {
  try {
    if (enabled) {
      await SecureStore.setItemAsync(BIOMETRIC_ENABLED_KEY, 'true');
    } else {
      await disableBiometric();
    }
    return true;
  } catch (error) {
    console.error('[Biometric] Error setting enabled:', error);
    return false;
  }
};