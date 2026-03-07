// Theme.js - Yellow & Orange Accent Overhaul
const lightTheme = {
  // Backgrounds
  background: "#FDF8EE", // Warm cream
  surface: "#FFFFFF",
  card: "#FFFFFF",
  cardElevated: "#FFFBF2",
  subCard: "#1E1A12",

  welcome: "#F0A500", // Rich amber-yellow

  // Text
  text: "#1F1A0E", // Warm near-black
  textSecondary: "#5C4D2A", // Dark warm brown
  textTertiary: "#7A6840", // Medium warm brown

  // Primary colors - Yellow/Amber palette
  primary: "#F0A500", // Rich amber-yellow
  primaryDark: "#C47F00", // Deep amber
  primaryLight: "#F7C84A", // Soft golden yellow
  primaryMuted: "#FDE8A8", // Very soft yellow for backgrounds

  // Semantic colors
  success: "#2E7D32",
  successLight: "#4CAF50",
  error: "#C62828",
  errorLight: "#EF5350",
  warning: "#E65100", // Deep burnt orange
  warningLight: "#FF6D00",
  info: "#1565C0",
  infoLight: "#2196F3",

  // Borders & Dividers
  border: "#EDD89A",
  borderStrong: "#D9BF72",
  divider: "#F2E5C0",

  // Interactive states
  hover: "#FDF0C8",
  pressed: "#F7E0A0",
  disabled: "#E0E0E0",
  disabledText: "#9E9E9E",
};

const darkTheme = {
  // Backgrounds - Deep warm darks
  background: "#000000", // Very dark warm black
  surface: "#22211f", // Warm dark surface
  card: "#1c1b19", // Warm card
  cardElevated: "#1c1a18", // Higher elevation
  subCard: "#FDF8EE",

  welcome: "#F7C84A", // Bright golden yellow

  // Text
  text: "#F5EDD8", // Warm off-white
  textSecondary: "#C9A96E", // Muted gold (high visibility)
  textTertiary: "#8C7040", // Deep warm tan

  // Primary colors - Warm yellow/orange optimized for dark
  primary: "#F7C84A", // Bright golden yellow
  primaryDark: "#F0A500", // Amber
  primaryLight: "#FFE080", // Light gold
  primaryMuted: "#3D2E00", // Very dark amber for subtle backgrounds

  // Semantic colors
  success: "#66BB6A",
  successLight: "#81C784",
  error: "#EF5350",
  errorLight: "#E57373",
  warning: "#FF6D00", // Vivid burnt orange
  warningLight: "#FF9E40",
  info: "#29B6F6",
  infoLight: "#4FC3F7",

  // Borders & Dividers
  border: "#3D2E0A", // Dark amber border
  borderStrong: "#5C4510",
  divider: "#261F08",

  // Interactive states
  hover: "#3D2E0A",
  pressed: "#2E2106",
  disabled: "#2A2A2A",
  disabledText: "#666666",
};

export const SPACING = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
  xxxl: 64,
};

export const FONTS = {
  regular: "System",
  medium: "System",
  semiBold: "System",
  bold: "System",
  sizes: {
    xs: 11,
    sm: 13,
    md: 15,
    base: 16,
    lg: 18,
    xl: 22,
    xxl: 28,
    xxxl: 34,
  },
  lineHeights: {
    tight: 1.2,
    normal: 1.5,
    relaxed: 1.75,
  },
};

export const BORDER_RADIUS = {
  xs: 2,
  sm: 6,
  md: 10,
  lg: 14,
  xl: 20,
  xxl: 28,
  round: 999,
};

export const SHADOWS = {
  none: {
    shadowColor: "transparent",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0,
    shadowRadius: 0,
    elevation: 0,
  },
  small: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 1,
  },
  medium: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 4,
    elevation: 3,
  },
  large: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.16,
    shadowRadius: 8,
    elevation: 6,
  },
  xl: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 10,
  },
};

export const OPACITY = {
  disabled: 0.38,
  inactive: 0.54,
  active: 0.87,
  full: 1,
};

export const THEMES = {
  light: lightTheme,
  dark: darkTheme,
};

export const COLORS = lightTheme;
