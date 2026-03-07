// utils/UpdateChecker.js
import { Platform } from 'react-native';
import * as Updates from 'expo-updates';
import * as Application from 'expo-application';
import SpInAppUpdates, {
  NeedsUpdateResponse,
  IAUUpdateKind,
  StartUpdateOptions,
} from 'sp-react-native-in-app-updates';

export class UpdateChecker {
  /**
   * Check for updates - Google Play handles Store, Expo handles OTA
   */
  static async checkForUpdates() {
    if (__DEV__) {

      return { type: null };
    }

    try {
      // Android: Use Google Play's In-App Update API
      if (Platform.OS === 'android') {
        const playStoreUpdate = await this.checkGooglePlayUpdate();
        if (playStoreUpdate) {
          return {
            type: 'playstore',
            ...playStoreUpdate,
          };
        }
      }

      // iOS or if no Play Store update: Check OTA
      const otaUpdate = await this.checkOTAUpdate();
      if (otaUpdate) {
        return {
          type: 'ota',
          ...otaUpdate,
        };
      }

      return { type: null };
    } catch (error) {
      console.error('Update check failed:', error);
      return { type: null };
    }
  }

  /**
   * Check Google Play for updates (Native API)
   */
  static async checkGooglePlayUpdate() {
    if (Platform.OS !== 'android') return null;

    try {
      const inAppUpdates = new SpInAppUpdates(false); // false = not in debug mode
      
      const result = await inAppUpdates.checkNeedsUpdate();
      
      if (result.shouldUpdate) {
        return {
          shouldUpdate: true,
          stalenessDays: result.stalenessDays,
          updateAvailability: result.updateAvailability,
          isFlexibleUpdateAllowed: result.flexibleUpdateAllowed,
          isImmediateUpdateAllowed: result.immediateUpdateAllowed,
          inAppUpdates, // Pass the instance for later use
        };
      }
      
      return null;
    } catch (error) {
      console.error('Google Play update check failed:', error);
      return null;
    }
  }

  /**
   * Start Google Play update flow
   */
  static async startGooglePlayUpdate(updateInfo, isFlexible = true) {
    try {
      const updateOptions = {
        updateType: isFlexible 
          ? IAUUpdateKind.FLEXIBLE  // User can continue using app
          : IAUUpdateKind.IMMEDIATE, // Blocks app until updated
      };

      await updateInfo.inAppUpdates.startUpdate(updateOptions);
      
      // If flexible, install when ready
      if (isFlexible) {
        await updateInfo.inAppUpdates.installUpdate();
      }
    } catch (error) {
      console.error('Google Play update failed:', error);
      throw error;
    }
  }

  /**
   * Check for OTA updates (Expo)
   */
  static async checkOTAUpdate() {
    if (!Updates.isEnabled) {
      return null;
    }

    try {
      const update = await Updates.checkForUpdateAsync();
      
      if (update.isAvailable) {
        return {
          isAvailable: true,
          manifest: update.manifest,
        };
      }
      
      return null;
    } catch (error) {
      console.error('OTA update check failed:', error);
      return null;
    }
  }

  /**
   * Install OTA update
   */
  static async installOTAUpdate() {
    try {
      const result = await Updates.fetchUpdateAsync();
      
      if (result.isNew) {
        await Updates.reloadAsync();
      }
      
      return result;
    } catch (error) {
      console.error('OTA update installation failed:', error);
      throw error;
    }
  }

  /**
   * Get app info
   */
  static getAppInfo() {
    return {
      version: Application.nativeApplicationVersion,
      buildNumber: Application.nativeBuildVersion,
      updateId: Updates.updateId,
      channel: Updates.channel,
      runtimeVersion: Updates.runtimeVersion,
    };
  }
}