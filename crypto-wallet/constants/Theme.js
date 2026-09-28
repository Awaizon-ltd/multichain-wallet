// Theme.js — White / Charcoal, yellow-green brand accent
const lightTheme = {
  // Backgrounds
  background: "#FFFFFF",
  surface: "#F7F7F7",
  card: "#FFFFFF",
  cardElevated: "#F2F2F2",
  subCard: "#141414",

  welcome: "#D6FA1B", // brand yellow-green

  // Text
  text: "#0A0A0A",
  textSecondary: "#3F3F3F",
  textTertiary: "#767676",

  // Primary — yellow-green brand accent
  primary: "#99b60a",
  primaryDark: "#A8C700", // pressed / darker state
  primaryLight: "#c4dc37", // lighter highlight
  primaryMuted: "#F6FFD6", // very soft tint for pills/backgrounds

  // Semantic colors
  success: "#2E7D32",
  successLight: "#4CAF50",
  error: "#C62828",
  errorLight: "#EF5350",
  warning: "#E65100",
  warningLight: "#FF6D00",
  info: "#1565C0",
  infoLight: "#2196F3",

  // Borders & Dividers
  border: "#E6E6E6",
  borderStrong: "#D0D0D0",
  divider: "#EFEFEF",
  cardBorder: "#000000",

  // Interactive states
  hover: "#F6FFD6",
  pressed: "#E7FC70",
  disabled: "#E0E0E0",
  disabledText: "#9E9E9E",
};

const darkTheme = {
  // Backgrounds — charcoal, not pure black
  background: "#121212",
  surface: "#1A1A1A",
  card: "#1E1E1E",
  cardElevated: "#282828",
  subCard: "#F5F5F5",

  welcome: "#D6FA1B",

  // Text
  text: "#F5F5F5",
  textSecondary: "#C2C2C2",
  textTertiary: "#8A8A8A",

  // Primary — same brand yellow-green, tuned for dark
  primary: "#D6FA1B",
  primaryDark: "#A8C700",
  primaryLight: "#E7FC70",
  primaryMuted: "#242B00", // dark olive tint for subtle backgrounds

  // Semantic colors
  success: "#66BB6A",
  successLight: "#81C784",
  error: "#EF5350",
  errorLight: "#E57373",
  warning: "#FF6D00",
  warningLight: "#FF9E40",
  info: "#29B6F6",
  infoLight: "#4FC3F7",

  // Borders & Dividers
  border: "#2C2C2C",
  borderStrong: "#3C3C3C",
  divider: "#242424",
  cardBorder: "#3C3C3C",

  // Interactive states
  hover: "#242B00",
  pressed: "#2E3600",
  disabled: "#2A2A2A",
  disabledText: "#6B6B6B",
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
