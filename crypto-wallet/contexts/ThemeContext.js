// ThemeContext.js
import React, { createContext, useContext, useState, useEffect, useMemo } from 'react';
import { Appearance } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { THEMES, SPACING, FONTS, BORDER_RADIUS, SHADOWS } from '../constants/Theme';

const ThemeContext = createContext();
const THEME_STORAGE_KEY = '@app_theme_preference';
const ACCENT_COLOR_KEY  = '@accent_color';
const BG_TINT_KEY       = '@bg_tint_color';

// ── Color utilities (exported so screens can use them for live preview) ────────

export const hexToRgb = (hex) => {
  const clean = hex.replace('#', '');
  const full  = clean.length === 3
    ? clean.split('').map((c) => c + c).join('')
    : clean;
  return {
    r: parseInt(full.slice(0, 2), 16),
    g: parseInt(full.slice(2, 4), 16),
    b: parseInt(full.slice(4, 6), 16),
  };
};

export const toHex = (r, g, b) =>
  '#' + [r, g, b]
    .map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0'))
    .join('');

// Blend tint color into base color: weight = how much of the tint to apply (0–1)
const blendColor = (tR, tG, tB, bR, bG, bB, weight) => ({
  r: Math.round(tR * weight + bR * (1 - weight)),
  g: Math.round(tG * weight + bG * (1 - weight)),
  b: Math.round(tB * weight + bB * (1 - weight)),
});

/**
 * Derive primary accent color variants from a single hex.
 * Returns: primary, primaryDark, primaryLight, primaryMuted
 */
export const deriveAccentColors = (hex, isDark) => {
  const { r, g, b } = hexToRgb(hex);
  return {
    primary:      hex,
    primaryDark:  toHex(r * 0.78, g * 0.78, b * 0.78),
    primaryLight: toHex(r + (255 - r) * 0.38, g + (255 - g) * 0.38, b + (255 - b) * 0.38),
    primaryMuted: isDark
      ? toHex(r * 0.09, g * 0.09, b * 0.09)
      : toHex(r + (255 - r) * 0.91, g + (255 - g) * 0.91, b + (255 - b) * 0.91),
  };
};

/**
 * Derive SOLID background/surface/card colors that harmonise with the chosen
 * gradient tint. All values are fully opaque — no transparent colors.
 *
 * Screens remain opaque so React Navigation transitions never flash white.
 * The gradient effect is achieved by a LinearGradient overlay inside each
 * screen (behind the scroll content), not by making containers transparent.
 *
 * Dark:  ~14% tint → deep coloured darks (navy, crimson, etc.)
 * Light: ~7%  tint → airy pastel tones
 */
export const deriveBgColors = (hex, isDark) => {
  const { r, g, b } = hexToRgb(hex);

  if (isDark) {
    const tw = 0.14;
    const bgC = blendColor(r, g, b,   9,   9,  11, tw);
    const sfC = blendColor(r, g, b,  17,  17,  19, tw);
    const cdC = blendColor(r, g, b,  24,  24,  27, tw);
    const ceC = blendColor(r, g, b,  39,  39,  42, tw);
    const boC = blendColor(r, g, b,  39,  39,  42, tw * 0.55);
    const dvC = blendColor(r, g, b,  24,  24,  27, tw * 0.40);
    return {
      background:   toHex(bgC.r, bgC.g, bgC.b),
      surface:      toHex(sfC.r, sfC.g, sfC.b),
      card:         toHex(cdC.r, cdC.g, cdC.b),
      cardElevated: toHex(ceC.r, ceC.g, ceC.b),
      border:       toHex(boC.r, boC.g, boC.b),
      divider:      toHex(dvC.r, dvC.g, dvC.b),
      // Keep text at maximum contrast — tinting the background must never
      // soften the text. Pure white on any dark tinted background.
      text:          '#FFFFFF',
      textSecondary: '#E4E4E7',
      textTertiary:  '#9CA3AF',
    };
  } else {
    const tw = 0.07;
    const bgC = blendColor(r, g, b, 255, 255, 255, tw);
    const sfC = blendColor(r, g, b, 240, 240, 240, tw);
    const cdC = blendColor(r, g, b, 240, 240, 240, tw);
    const ceC = blendColor(r, g, b, 238, 238, 243, tw);
    const boC = blendColor(r, g, b, 228, 228, 231, tw * 0.5);
    const dvC = blendColor(r, g, b, 244, 244, 245, tw * 0.4);
    return {
      background:   toHex(bgC.r, bgC.g, bgC.b),
      surface:      toHex(sfC.r, sfC.g, sfC.b),
      card:         toHex(cdC.r, cdC.g, cdC.b),
      cardElevated: toHex(ceC.r, ceC.g, ceC.b),
      border:       toHex(boC.r, boC.g, boC.b),
      divider:      toHex(dvC.r, dvC.g, dvC.b),
      // Pure black on any light tinted background.
      text:          '#000000',
      textSecondary: '#1C1C1E',
      textTertiary:  '#6B7280',
    };
  }
};

// ── Provider ──────────────────────────────────────────────────────────────────

export const ThemeProvider = ({ children }) => {
  // Initialize from system color scheme synchronously — no flash on first launch.
  // A saved user preference loaded from AsyncStorage overrides this below.
  const [isDark,          setIsDark]           = useState(
    () => Appearance.getColorScheme() === 'dark',
  );
  const [accentColor,     setAccentColorState] = useState(null);
  const [bgTintColor,     setBgTintColorState] = useState(null);
  const [isLoading,       setIsLoading]        = useState(true);
  // Track whether the user has an explicit saved preference (vs. following system)
  const [hasUserPreference, setHasUserPreference] = useState(false);

  useEffect(() => {
    loadPreferences();

    // Follow system theme changes when the user has no manual preference saved.
    const sub = Appearance.addChangeListener(({ colorScheme }) => {
      if (!hasUserPreference) setIsDark(colorScheme === 'dark');
    });
    return () => sub.remove();
  }, [hasUserPreference]);

  const loadPreferences = async () => {
    try {
      const [savedTheme, savedAccent, savedBgTint] = await Promise.all([
        AsyncStorage.getItem(THEME_STORAGE_KEY),
        AsyncStorage.getItem(ACCENT_COLOR_KEY),
        AsyncStorage.getItem(BG_TINT_KEY),
      ]);
      if (savedTheme) {
        setIsDark(savedTheme === 'dark');
        setHasUserPreference(true);
      }
      if (savedAccent)  setAccentColorState(savedAccent);
      if (savedBgTint)  setBgTintColorState(savedBgTint);
    } catch {}
    finally { setIsLoading(false); }
  };

  const toggleTheme = async () => {
    try {
      const next = !isDark;
      setIsDark(next);
      setHasUserPreference(true);
      await AsyncStorage.setItem(THEME_STORAGE_KEY, next ? 'dark' : 'light');
    } catch {}
  };

  const setAccentColor = async (hex) => {
    setAccentColorState(hex);
    hex
      ? await AsyncStorage.setItem(ACCENT_COLOR_KEY, hex)
      : await AsyncStorage.removeItem(ACCENT_COLOR_KEY);
  };

  const setBgTintColor = async (hex) => {
    setBgTintColorState(hex);
    hex
      ? await AsyncStorage.setItem(BG_TINT_KEY, hex)
      : await AsyncStorage.removeItem(BG_TINT_KEY);
  };

  // Merge accent + background tint overrides on top of base theme
  const COLORS = useMemo(() => {
    const base = isDark ? THEMES.dark : THEMES.light;
    let colors = accentColor
      ? { ...base, ...deriveAccentColors(accentColor, isDark) }
      : base;
    if (bgTintColor) colors = { ...colors, ...deriveBgColors(bgTintColor, isDark) };
    return colors;
  }, [isDark, accentColor, bgTintColor]);

  const theme = {
    COLORS,
    SPACING,
    FONTS,
    BORDER_RADIUS,
    SHADOWS,
    isDark,
    isLoading,
    accentColor,
    bgTintColor,
    toggleTheme,
    setAccentColor,
    setBgTintColor,
    // Derived StatusBar values — use these everywhere instead of inline ternaries
    statusBarStyle: isDark ? 'light' : 'dark',  // expo-status-bar 'style' prop
    statusBarBg: COLORS.background,              // matches current theme background
  };

  return (
    <ThemeContext.Provider value={theme}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useTheme must be used within ThemeProvider');
  return context;
};
