import React, { useState } from 'react';
import { View, TextInput, Text, StyleSheet, Pressable } from 'react-native';
import { useTheme } from '../../contexts/ThemeContext';

const Input = ({
  label,
  value,
  onChangeText,
  placeholder,
  secureTextEntry = false,
  error,
  disabled = false,
  multiline = false,
  numberOfLines = 1,
  keyboardType = 'default',
  autoCapitalize = 'none',
  leftIcon,
  rightIcon,
  style,
  inputStyle,
}) => {
  const { COLORS, SPACING, FONTS, BORDER_RADIUS } = useTheme();
  const [isFocused, setIsFocused] = useState(false);
  const [isSecure, setIsSecure] = useState(secureTextEntry);

  const styles = StyleSheet.create({
    container: {
      marginBottom: SPACING.md,
    },
    label: {
      fontSize: FONTS.sizes.sm,
      color: COLORS.textSecondary,
      marginBottom: SPACING.sm,
      fontWeight: '500',
    },
    inputContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: COLORS.surface,
      borderRadius: BORDER_RADIUS.md,
      borderWidth: 2,
      borderColor: COLORS.border,
    },
    inputContainerFocused: {
      borderColor: COLORS.primary,
    },
    inputContainerError: {
      borderColor: COLORS.error,
    },
    inputContainerDisabled: {
      opacity: 0.5,
    },
    input: {
      flex: 1,
      fontSize: FONTS.sizes.md,
      color: COLORS.text,
      paddingVertical: SPACING.md,
      paddingHorizontal: SPACING.md,
    },
    inputWithLeftIcon: {
      paddingLeft: 0,
    },
    inputWithRightIcon: {
      paddingRight: 0,
    },
    multilineInput: {
      minHeight: 100,
      textAlignVertical: 'top',
    },
    iconContainer: {
      paddingHorizontal: SPACING.md,
      justifyContent: 'center',
      alignItems: 'center',
    },
    eyeIcon: {
      fontSize: 20,
    },
    errorText: {
      fontSize: FONTS.sizes.xs,
      color: COLORS.error,
      marginTop: SPACING.xs,
    },
  });

  return (
    <View style={[styles.container, style]}>
      {label && <Text style={styles.label}>{label}</Text>}
      
      <View style={[
        styles.inputContainer,
        isFocused && styles.inputContainerFocused,
        error && styles.inputContainerError,
        disabled && styles.inputContainerDisabled,
      ]}>
        {leftIcon && (
          <View style={styles.iconContainer}>
            {leftIcon}
          </View>
        )}
        
        <TextInput
          style={[
            styles.input,
            leftIcon && styles.inputWithLeftIcon,
            rightIcon && styles.inputWithRightIcon,
            multiline && styles.multilineInput,
            inputStyle,
          ]}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={COLORS.textTertiary}
          secureTextEntry={isSecure}
          editable={!disabled}
          multiline={multiline}
          numberOfLines={numberOfLines}
          keyboardType={keyboardType}
          autoCapitalize={autoCapitalize}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
        />
        
        {secureTextEntry && (
          <Pressable
            style={styles.iconContainer}
            onPress={() => setIsSecure(!isSecure)}
          >
            <Text style={styles.eyeIcon}>{isSecure ? '👁️' : '🙈'}</Text>
          </Pressable>
        )}
        
        {rightIcon && !secureTextEntry && (
          <View style={styles.iconContainer}>
            {rightIcon}
          </View>
        )}
      </View>
      
      {error && <Text style={styles.errorText}>{error}</Text>}
    </View>
  );
};

export default Input;