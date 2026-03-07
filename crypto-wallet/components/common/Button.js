import React from 'react';
import { Pressable, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { useTheme } from '../../contexts/ThemeContext';

const Button = ({ 
  title, 
  onPress, 
  variant = 'primary', 
  size = 'medium',
  loading = false,
  disabled = false,
  fullWidth = false,
  style,
  textStyle,
  icon,
}) => {
  const { COLORS, SPACING, FONTS, BORDER_RADIUS } = useTheme();
  const isDisabled = disabled || loading;

  const styles = StyleSheet.create({
    button: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: BORDER_RADIUS.md,
      gap: SPACING.sm,
    },
    fullWidth: {
      width: '100%',
    },
    
    // Sizes
    small: {
      paddingVertical: SPACING.sm,
      paddingHorizontal: SPACING.md,
    },
    medium: {
      paddingVertical: SPACING.md,
      paddingHorizontal: SPACING.lg,
    },
    large: {
      paddingVertical: SPACING.lg,
      paddingHorizontal: SPACING.xl,
    },

    // Variants
    primary: {
      backgroundColor: COLORS.primary,
    },
    secondary: {
      backgroundColor: COLORS.surface,
    },
    outline: {
      backgroundColor: 'transparent',
      borderWidth: 2,
      borderColor: COLORS.primary,
    },
    danger: {
      backgroundColor: COLORS.error,
    },

    // Text sizes
    smallText: {
      fontSize: FONTS.sizes.sm,
    },
    mediumText: {
      fontSize: FONTS.sizes.md,
    },
    largeText: {
      fontSize: FONTS.sizes.lg,
    },

    // Text variants
    text: {
      fontWeight: 'bold',
      color: COLORS.text,
    },
    primaryText: {
      color: COLORS.background,
    },
    secondaryText: {
      color: COLORS.primary,
    },
    outlineText: {
      color: COLORS.primary,
    },

    // States
    pressed: {
      opacity: 0.7,
    },
    disabled: {
      backgroundColor: COLORS.surface,
      opacity: 0.5,
    },
    disabledText: {
      color: COLORS.textTertiary,
    },
  });

  const getButtonStyle = () => {
    const baseStyle = [styles.button, styles[size]];
    
    if (fullWidth) {
      baseStyle.push(styles.fullWidth);
    }

    if (isDisabled) {
      baseStyle.push(styles.disabled);
    } else {
      baseStyle.push(styles[variant]);
    }

    if (style) {
      baseStyle.push(style);
    }

    return baseStyle;
  };

  const getTextStyle = () => {
    const baseStyle = [styles.text, styles[`${size}Text`]];
    
    if (variant === 'primary' && !isDisabled) {
      baseStyle.push(styles.primaryText);
    } else if (variant === 'secondary' && !isDisabled) {
      baseStyle.push(styles.secondaryText);
    } else if (variant === 'outline' && !isDisabled) {
      baseStyle.push(styles.outlineText);
    }

    if (isDisabled) {
      baseStyle.push(styles.disabledText);
    }

    if (textStyle) {
      baseStyle.push(textStyle);
    }

    return baseStyle;
  };

  return (
    <Pressable
      style={({ pressed }) => [
        ...getButtonStyle(),
        pressed && !isDisabled && styles.pressed,
      ]}
      onPress={onPress}
      disabled={isDisabled}
    >
      {loading ? (
        <ActivityIndicator 
          color={variant === 'primary' ? COLORS.background : COLORS.primary} 
        />
      ) : (
        <>
          {icon && <>{icon}</>}
          <Text style={getTextStyle()}>{title}</Text>
        </>
      )}
    </Pressable>
  );
};

export default Button;