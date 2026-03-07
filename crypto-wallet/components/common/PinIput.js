import React, { useRef, useState, useEffect, forwardRef, useImperativeHandle } from 'react';
import {
  View,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  Animated,
} from 'react-native';
import { useTheme } from '../../contexts/ThemeContext';

const PinInput = forwardRef(({ 
  length = 6, 
  value, 
  onChangeText, 
  error = false,
  editable = true,
}, ref) => {
  const { COLORS, SPACING } = useTheme();
  const inputRefs = useRef([]);
  const [focused, setFocused] = useState(-1);
  const shakeAnimation = useRef(new Animated.Value(0)).current;

  // Expose focus method to parent
  useImperativeHandle(ref, () => ({
    focus: () => {
      // Focus the first empty box or the first box
      const emptyIndex = value.length < length ? value.length : 0;
      inputRefs.current[emptyIndex]?.focus();
    }
  }));

  useEffect(() => {
    if (error) {
      // Shake animation on error
      Animated.sequence([
        Animated.timing(shakeAnimation, { toValue: 10, duration: 50, useNativeDriver: true }),
        Animated.timing(shakeAnimation, { toValue: -10, duration: 50, useNativeDriver: true }),
        Animated.timing(shakeAnimation, { toValue: 10, duration: 50, useNativeDriver: true }),
        Animated.timing(shakeAnimation, { toValue: 0, duration: 50, useNativeDriver: true }),
      ]).start();
    }
  }, [error]);

  const handleChangeText = (text, index) => {
    // Only allow numbers
    const numericText = text.replace(/[^0-9]/g, '');
    
    if (numericText.length === 0) {
      // Handle backspace
      const newValue = value.slice(0, index) + value.slice(index + 1);
      onChangeText(newValue);
      
      // Move to previous input
      if (index > 0) {
        inputRefs.current[index - 1]?.focus();
      }
    } else if (numericText.length === 1) {
      // Single digit entered
      const newValue = value.slice(0, index) + numericText + value.slice(index + 1);
      onChangeText(newValue);
      
      // Move to next input
      if (index < length - 1) {
        inputRefs.current[index + 1]?.focus();
      } else {
        // Last input, blur to hide keyboard
        inputRefs.current[index]?.blur();
      }
    } else {
      // Multiple digits pasted
      const pastedDigits = numericText.slice(0, length);
      onChangeText(pastedDigits);
      
      // Focus the next empty box or the last box
      const nextIndex = Math.min(pastedDigits.length, length - 1);
      inputRefs.current[nextIndex]?.focus();
    }
  };

  const handleKeyPress = (e, index) => {
    if (e.nativeEvent.key === 'Backspace' && !value[index] && index > 0) {
      // Move to previous input on backspace if current is empty
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handleBoxPress = (index) => {
    inputRefs.current[index]?.focus();
  };

  const styles = StyleSheet.create({
    container: {
      flexDirection: 'row',
      justifyContent: 'center',
      gap: SPACING.sm,
    },
    box: {
      width: 50,
      height: 60,
      borderRadius: 16,
      backgroundColor: COLORS.surface || '#F5F5F5',
      borderWidth: 2,
      borderColor: COLORS.border || '#E0E0E0',
      justifyContent: 'center',
      alignItems: 'center',
      position: 'relative',
    },
    boxFocused: {
      borderColor: COLORS.primary,
      backgroundColor: COLORS.primaryLight || `${COLORS.primary}10`,
    },
    boxFilled: {
      borderColor: COLORS.primary,
      backgroundColor: COLORS.primaryLight || `${COLORS.primary}10`,
    },
    boxError: {
      borderColor: COLORS.error || '#EF4444',
      backgroundColor: COLORS.errorLight || '#FEE2E2',
    },
    input: {
      position: 'absolute',
      width: '100%',
      height: '100%',
      fontSize: 24,
      fontWeight: 'bold',
      textAlign: 'center',
      color: 'transparent', // Hide the actual text
      caretColor: 'transparent', // Hide cursor
    },
    dot: {
      width: 12,
      height: 12,
      borderRadius: 6,
      backgroundColor: COLORS.text || '#1F2937',
    },
  });

  return (
    <Animated.View 
      style={[
        styles.container,
        { transform: [{ translateX: shakeAnimation }] }
      ]}
    >
      {Array.from({ length }).map((_, index) => {
        const isFilled = value[index] !== undefined;
        const isFocused = focused === index;
        
        return (
          <TouchableOpacity
            key={index}
            activeOpacity={0.7}
            onPress={() => handleBoxPress(index)}
            style={[
              styles.box,
              isFocused && styles.boxFocused,
              isFilled && styles.boxFilled,
              error && styles.boxError,
            ]}
          >
            <TextInput
              ref={(ref) => (inputRefs.current[index] = ref)}
              style={styles.input}
              value={value[index] || ''}
              onChangeText={(text) => handleChangeText(text, index)}
              onKeyPress={(e) => handleKeyPress(e, index)}
              onFocus={() => setFocused(index)}
              onBlur={() => setFocused(-1)}
              keyboardType="number-pad"
              maxLength={1}
              selectTextOnFocus
              editable={editable}
              secureTextEntry
              textContentType="oneTimeCode"
            />
            {isFilled && (
              <View style={styles.dot} />
            )}
          </TouchableOpacity>
        );
      })}
    </Animated.View>
  );
});

PinInput.displayName = 'PinInput';

export default PinInput;