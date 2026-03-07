import React from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import { useTheme } from '../../contexts/ThemeContext';

const Card = ({ 
  children, 
  style, 
  onPress,
  variant = 'default',
  noPadding = false,
}) => {
  const { COLORS, SPACING, BORDER_RADIUS, SHADOWS } = useTheme();
  
  const styles = StyleSheet.create({
    card: {
      backgroundColor: COLORS.card,
      borderRadius: BORDER_RADIUS.lg,
      padding: SPACING.md,
      ...SHADOWS.small,
    },
    default: {
      borderWidth: 0,
      borderColor: COLORS.border,
    },
    elevated: {
      ...SHADOWS.medium,
    },
    outlined: {
      borderWidth: 2,
      borderColor: COLORS.primary,
    },
    noPadding: {
      padding: 0,
    },
    pressed: {
      opacity: 0.7,
    },
  });

  const content = (
    <View style={[
      styles.card,
      styles[variant],
      noPadding && styles.noPadding,
      style,
    ]}>
      {children}
    </View>
  );

  if (onPress) {
    return (
      <Pressable 
        onPress={onPress}
        style={({ pressed }) => [
          pressed && styles.pressed,
        ]}
      >
        {content}
      </Pressable>
    );
  }

  return content;
};

export default Card;