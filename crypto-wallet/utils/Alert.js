import { Alert as RNAlert } from "react-native";

// This will be set by the AlertProvider
let customAlertRef = null;

export const setCustomAlertRef = (ref) => {
  customAlertRef = ref;
};

/**
 * Custom Alert wrapper that uses our custom alert when available,
 * falls back to React Native's Alert otherwise
 */
export const Alert = {
  alert: (title, message, buttons, options) => {
    if (customAlertRef) {
      // Use custom alert
      customAlertRef.showAlert(title, message, buttons);
    } else {
      // Fallback to React Native's Alert
      RNAlert.alert(title, message, buttons, options);
    }
  },
};

export default Alert;
