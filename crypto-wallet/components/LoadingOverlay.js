import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  ActivityIndicator,
  Animated,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, FONTS } from '../constants/Theme';
import { useLoading } from '../contexts/LoadingContext';

const { width } = Dimensions.get('window');

const LoadingOverlay = () => {
  const {
    isLoading,
    loadingMessage,
    currentStep,
    totalSteps,
    loadingType,
  } = useLoading();

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.8)).current;
  const progressAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (isLoading) {
      // Fade in and scale up
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }),
        Animated.spring(scaleAnim, {
          toValue: 1,
          friction: 8,
          tension: 40,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      // Fade out
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }).start();
    }
  }, [isLoading]);

  useEffect(() => {
    if (totalSteps > 0) {
      const progress = currentStep / totalSteps;
      Animated.timing(progressAnim, {
        toValue: progress,
        duration: 300,
        useNativeDriver: false,
      }).start();
    }
  }, [currentStep, totalSteps]);

  if (!isLoading) return null;

  const progressWidth = progressAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  return (
    <Modal
      transparent
      visible={isLoading}
      animationType="none"
      statusBarTranslucent
    >
      <Animated.View
        style={[
          styles.overlay,
          {
            opacity: fadeAnim,
          },
        ]}
      >
        <Animated.View
          style={[
            styles.container,
            {
              transform: [{ scale: scaleAnim }],
            },
          ]}
        >
          {/* Icon */}
          <View style={styles.iconContainer}>
            <ActivityIndicator size="large" color={COLORS.primary} />
          </View>

          {/* Message */}
          <Text style={styles.message}>{loadingMessage}</Text>

          {/* Progress Indicator */}
          {totalSteps > 0 && (
            <View style={styles.progressSection}>
              <View style={styles.progressBar}>
                <Animated.View
                  style={[
                    styles.progressFill,
                    { width: progressWidth },
                  ]}
                />
              </View>
              <Text style={styles.progressText}>
                Step {currentStep} of {totalSteps}
              </Text>
            </View>
          )}

          {/* Loading dots animation */}
          <LoadingDots />
        </Animated.View>
      </Animated.View>
    </Modal>
  );
};

const LoadingDots = () => {
  const dot1 = useRef(new Animated.Value(0)).current;
  const dot2 = useRef(new Animated.Value(0)).current;
  const dot3 = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animateDot = (dotAnim, delay) => {
      return Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(dotAnim, {
            toValue: 1,
            duration: 400,
            useNativeDriver: true,
          }),
          Animated.timing(dotAnim, {
            toValue: 0,
            duration: 400,
            useNativeDriver: true,
          }),
        ])
      );
    };

    Animated.parallel([
      animateDot(dot1, 0),
      animateDot(dot2, 200),
      animateDot(dot3, 400),
    ]).start();
  }, []);

  return (
    <View style={styles.dotsContainer}>
      {[dot1, dot2, dot3].map((dot, index) => (
        <Animated.View
          key={index}
          style={[
            styles.dot,
            {
              opacity: dot,
            },
          ]}
        />
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  container: {
    backgroundColor: COLORS.surface || COLORS.card || '#1a1a1a',
    borderRadius: 20,
    padding: SPACING.xxl,
    width: width * 0.8,
    maxWidth: 320,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 10,
  },
  iconContainer: {
    marginBottom: SPACING.lg,
  },
  message: {
    fontSize: FONTS.sizes.md,
    color: COLORS.text,
    textAlign: 'center',
    marginBottom: SPACING.md,
    fontWeight: '600',
  },
  progressSection: {
    width: '100%',
    marginTop: SPACING.lg,
  },
  progressBar: {
    width: '100%',
    height: 6,
    backgroundColor: COLORS.border || '#333',
    borderRadius: 3,
    overflow: 'hidden',
    marginBottom: SPACING.sm,
  },
  progressFill: {
    height: '100%',
    backgroundColor: COLORS.primary,
    borderRadius: 3,
  },
  progressText: {
    fontSize: FONTS.sizes.xs,
    color: COLORS.textSecondary,
    textAlign: 'center',
    fontWeight: '500',
  },
  dotsContainer: {
    flexDirection: 'row',
    marginTop: SPACING.md,
    gap: SPACING.sm,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.primary,
  },
});

export default LoadingOverlay;