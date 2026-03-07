import AsyncStorage from '@react-native-async-storage/async-storage';

const CACHE_KEYS = {
  NAVIGATION_STATE: '@navigation_state',
  USER_PREFERENCES: '@user_preferences',
  LAST_ACTIVE_TAB: '@last_active_tab',
  ONBOARDING_COMPLETE: '@onboarding_complete',
};

export const NavigationCache = {
  // Save navigation state
  saveNavigationState: async (state) => {
    try {
      await AsyncStorage.setItem(CACHE_KEYS.NAVIGATION_STATE, JSON.stringify(state));
    } catch (error) {
      console.error('Error saving navigation state:', error);
    }
  },

  // Get navigation state
  getNavigationState: async () => {
    try {
      const state = await AsyncStorage.getItem(CACHE_KEYS.NAVIGATION_STATE);
      return state ? JSON.parse(state) : null;
    } catch (error) {
      console.error('Error getting navigation state:', error);
      return null;
    }
  },

  // Save last active tab
  saveLastActiveTab: async (tabName) => {
    try {
      await AsyncStorage.setItem(CACHE_KEYS.LAST_ACTIVE_TAB, tabName);
    } catch (error) {
      console.error('Error saving last active tab:', error);
    }
  },

  // Get last active tab
  getLastActiveTab: async () => {
    try {
      return await AsyncStorage.getItem(CACHE_KEYS.LAST_ACTIVE_TAB);
    } catch (error) {
      console.error('Error getting last active tab:', error);
      return null;
    }
  },

  // Save user preferences
  saveUserPreferences: async (preferences) => {
    try {
      await AsyncStorage.setItem(CACHE_KEYS.USER_PREFERENCES, JSON.stringify(preferences));
    } catch (error) {
      console.error('Error saving user preferences:', error);
    }
  },

  // Get user preferences
  getUserPreferences: async () => {
    try {
      const prefs = await AsyncStorage.getItem(CACHE_KEYS.USER_PREFERENCES);
      return prefs ? JSON.parse(prefs) : null;
    } catch (error) {
      console.error('Error getting user preferences:', error);
      return null;
    }
  },

  // Check if onboarding is complete
  isOnboardingComplete: async () => {
    try {
      const complete = await AsyncStorage.getItem(CACHE_KEYS.ONBOARDING_COMPLETE);
      return complete === 'true';
    } catch (error) {
      console.error('Error checking onboarding status:', error);
      return false;
    }
  },

  // Mark onboarding as complete
  setOnboardingComplete: async () => {
    try {
      await AsyncStorage.setItem(CACHE_KEYS.ONBOARDING_COMPLETE, 'true');
    } catch (error) {
      console.error('Error setting onboarding complete:', error);
    }
  },

  // Clear all cache
  clearCache: async () => {
    try {
      await AsyncStorage.multiRemove([
        CACHE_KEYS.NAVIGATION_STATE,
        CACHE_KEYS.USER_PREFERENCES,
        CACHE_KEYS.LAST_ACTIVE_TAB,
      ]);
    } catch (error) {
      console.error('Error clearing cache:', error);
    }
  },
};