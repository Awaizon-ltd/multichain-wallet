import * as LocalAuthentication from "expo-local-authentication";
import * as SecureStore from "expo-secure-store";
import { AppState } from "react-native";

/**
 * =====================================================
 * CONSTANTS
 * =====================================================
 */
const BIOMETRIC_KEY_PREFIX = "wallet-key-";
const BIOMETRIC_ENABLED_KEY = "biometric-enabled";

/**
 * =====================================================
 * APP STATE LISTENER (CLEAR CACHE ON BACKGROUND)
 * =====================================================
 */
let appStateSubscription = null;

export const initializeBiometricListener = (clearCacheCallback) => {
  if (appStateSubscription) return;

  appStateSubscription = AppState.addEventListener("change", (state) => {
    if (state !== "active" && clearCacheCallback) {
      clearCacheCallback();
    }
  });
};

export const cleanupBiometricListener = () => {
  if (appStateSubscription) {
    appStateSubscription.remove();
    appStateSubscription = null;
  }
};

/**
 * =====================================================
 * BIOMETRIC CAPABILITY CHECKS
 * =====================================================
 */
export const hasBiometricHardware = async () => {
  try {
    return await LocalAuthentication.hasHardwareAsync();
  } catch (error) {
    console.error("Error checking biometric hardware:", error);
    return false;
  }
};

export const isBiometricEnrolled = async () => {
  try {
    return await LocalAuthentication.isEnrolledAsync();
  } catch (error) {
    console.error("Error checking biometric enrollment:", error);
    return false;
  }
};

export const isBiometricAvailable = async () => {
  try {
    const hasHardware = await hasBiometricHardware();
    const isEnrolled = await isBiometricEnrolled();
    return hasHardware && isEnrolled;
  } catch (error) {
    console.error("Error checking biometric availability:", error);
    return false;
  }
};

export const getBiometricTypeName = async () => {
  try {
    const types = await LocalAuthentication.supportedAuthenticationTypesAsync();

    if (
      types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)
    ) {
      return "Face ID";
    }
    if (types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) {
      return "Fingerprint";
    }
    if (types.includes(LocalAuthentication.AuthenticationType.IRIS)) {
      return "Iris";
    }

    return "Biometric";
  } catch (error) {
    console.error("Error getting biometric type:", error);
    return "Biometric";
  }
};

/**
 * =====================================================
 * BIOMETRIC ENABLED STATE
 * =====================================================
 */
export const isBiometricEnabled = async () => {
  try {
    const enabled = await SecureStore.getItemAsync(BIOMETRIC_ENABLED_KEY);
    return enabled === "true";
  } catch (error) {
    console.error("Error checking biometric enabled state:", error);
    return false;
  }
};

export const setBiometricEnabled = async (enabled) => {
  try {
    if (enabled) {
      await SecureStore.setItemAsync(BIOMETRIC_ENABLED_KEY, "true");
    } else {
      await SecureStore.deleteItemAsync(BIOMETRIC_ENABLED_KEY);
    }
  } catch (error) {
    console.error("Error setting biometric enabled state:", error);
    throw error;
  }
};

/**
 * =====================================================
 * PROMPT BIOMETRIC AUTH
 * =====================================================
 */
export const authenticateWithBiometrics = async (
  reason = "Unlock your wallet",
) => {
  try {
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: reason,
      cancelLabel: "Cancel",
      disableDeviceFallback: false,
      requireConfirmation: false,
    });

    return result.success === true;
  } catch (error) {
    console.error("Biometric authentication error:", error);
    return false;
  }
};

// Alias for backward compatibility
export const authenticateBiometric = authenticateWithBiometrics;

/**
 * =====================================================
 * SECURE ENCLAVE KEY STORAGE
 * =====================================================
 */
export const saveKeyToEnclave = async (keyHex, salt) => {
  try {
    console.log("[BiometricAuth] Attempting to save key to enclave...");

    const authenticated = await authenticateWithBiometrics(
      "Enable biometric unlock",
    );

    if (!authenticated) {
      throw new Error("Biometric authentication was cancelled or failed");
    }

    await SecureStore.setItemAsync(`${BIOMETRIC_KEY_PREFIX}${salt}`, keyHex, {
      keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
      requireAuthentication: true,
    });

    // Mark biometric as enabled after successful key storage
    await setBiometricEnabled(true);

    console.log("[BiometricAuth] ✅ Key saved to enclave successfully");
  } catch (error) {
    console.error("[BiometricAuth] ❌ Error saving key to enclave:", error);
    throw error;
  }
};

/**
 * =====================================================
 * LOAD KEY FROM ENCLAVE (BIOMETRIC GATED)
 * =====================================================
 */
export const loadKeyFromEnclave = async (salt) => {
  try {
    const authenticated = await authenticateWithBiometrics("Unlock wallet");

    if (!authenticated) {
      return null;
    }

    return await SecureStore.getItemAsync(`${BIOMETRIC_KEY_PREFIX}${salt}`);
  } catch (error) {
    console.error("Error loading key from enclave:", error);
    return null;
  }
};

/**
 * =====================================================
 * REMOVE KEY (LOGOUT / RESET)
 * =====================================================
 */
export const removeKeyFromEnclave = async (salt) => {
  try {
    await SecureStore.deleteItemAsync(`${BIOMETRIC_KEY_PREFIX}${salt}`);
    await setBiometricEnabled(false);
  } catch (error) {
    console.error("Error removing key from enclave:", error);
    throw error;
  }
};
