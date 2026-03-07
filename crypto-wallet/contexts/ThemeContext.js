// ThemeContext.js
import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { THEMES, SPACING, FONTS, BORDER_RADIUS, SHADOWS } from '../constants/Theme';

const ThemeContext = createContext();
const THEME_STORAGE_KEY = '@app_theme_preference';

export const ThemeProvider = ({ children }) => {
  const [isDark, setIsDark] = useState(true);
  const [isLoading, setIsLoading] = useState(true);

  // Load saved theme preference on mount
  useEffect(() => {
    loadThemePreference();
  }, []);

  const loadThemePreference = async () => {
    try {
      const savedTheme = await AsyncStorage.getItem(THEME_STORAGE_KEY);
      if (savedTheme !== null) {
        setIsDark(savedTheme === 'dark');
      }
    } catch (error) {
      console.error('Error loading theme preference:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const toggleTheme = async () => {
    try {
      const newTheme = !isDark;
      setIsDark(newTheme);
      await AsyncStorage.setItem(THEME_STORAGE_KEY, newTheme ? 'dark' : 'light');
    } catch (error) {
      console.error('Error saving theme preference:', error);
    }
  };

  const theme = {
    COLORS: isDark ? THEMES.dark : THEMES.light,
    SPACING: SPACING,
    FONTS: FONTS,
    BORDER_RADIUS: BORDER_RADIUS,
    SHADOWS: SHADOWS,
    isDark,
    isLoading,
    toggleTheme,
  };

  return (
    <ThemeContext.Provider value={theme}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within ThemeProvider');
  }
  return context;
};