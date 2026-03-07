import React, { useEffect, useRef, useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  Image,
  Dimensions,
  ScrollView,
} from 'react-native';
import { useTheme } from '../../contexts/ThemeContext';
import { LinearGradient } from 'expo-linear-gradient';
import logo from '../../assets/logo.png';

const { width, height } = Dimensions.get('window');

const AuthLoadingScreen = () => {
  const { COLORS, SPACING, FONTS } = useTheme();
  const [showSkeleton, setShowSkeleton] = useState(false);
  
  // Animation values
  const scaleAnimation = useRef(new Animated.Value(1)).current;
  const glowAnimation = useRef(new Animated.Value(0)).current;
  const fadeAnimation = useRef(new Animated.Value(1)).current;

  const styles = useMemo(
    () =>
      StyleSheet.create({
        container: {
          flex: 1,
          backgroundColor: COLORS.background,
        },
        centerContainer: {
          flex: 1,
          justifyContent: 'center',
          alignItems: 'center',
        },
        logoContainer: {
          alignItems: 'center',
          justifyContent: 'center',
        },
        logo: {
          width: 100,
          height: 100,
          resizeMode: 'contain',
        },
        captionContainer: {
          marginTop: SPACING.md,
          alignItems: 'center',
        },
        caption: {
          fontSize: FONTS.sizes.xxl || 32,
          fontWeight: 'bold',
          color: COLORS.primary,
          letterSpacing: 8,
          textShadowColor: COLORS.primary,
          textShadowOffset: { width: 0, height: 0 },
          textShadowRadius: 20,
        },
        // Skeleton styles
        skeletonWrapper: {
          flex: 1,
        },
        skeletonHeader: {
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          paddingHorizontal: SPACING.lg,
          paddingVertical: SPACING.md,
          backgroundColor: COLORS.surface,
          borderBottomWidth: 1,
          borderBottomColor: COLORS.border,
        },
        skeletonHeaderLeft: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: SPACING.sm,
        },
        skeletonHeaderRight: {
          flexDirection: 'row',
          gap: SPACING.md,
        },
        skeletonAvatar: {
          width: 40,
          height: 40,
          borderRadius: 20,
          backgroundColor: COLORS.background,
        },
        skeletonHeaderText: {
          width: 80,
          height: 20,
          borderRadius: 10,
          backgroundColor: COLORS.background,
        },
        skeletonIcon: {
          width: 24,
          height: 24,
          borderRadius: 12,
          backgroundColor: COLORS.background,
        },
        skeletonTabs: {
          flexDirection: 'row',
          backgroundColor: COLORS.surface,
          paddingHorizontal: SPACING.lg,
          paddingVertical: SPACING.sm,
          gap: SPACING.lg,
          borderBottomWidth: 1,
          borderBottomColor: COLORS.border,
        },
        skeletonTab: {
          width: 60,
          height: 32,
          borderRadius: 16,
          backgroundColor: COLORS.background,
        },
        skeletonContent: {
          flex: 1,
        },
        skeletonStories: {
          paddingVertical: SPACING.md,
          paddingHorizontal: SPACING.lg,
          backgroundColor: COLORS.surface,
          marginBottom: SPACING.xs,
        },
        skeletonStoriesRow: {
          flexDirection: 'row',
          gap: SPACING.md,
        },
        skeletonStoryItem: {
          alignItems: 'center',
        },
        skeletonStoryCircle: {
          width: 64,
          height: 64,
          borderRadius: 32,
          backgroundColor: COLORS.background,
          marginBottom: SPACING.xs,
        },
        skeletonStoryName: {
          width: 50,
          height: 10,
          borderRadius: 5,
          backgroundColor: COLORS.background,
        },
        skeletonFeed: {
          paddingHorizontal: SPACING.lg,
          paddingTop: SPACING.md,
        },
        skeletonPost: {
          backgroundColor: COLORS.surface,
          borderRadius: 12,
          padding: SPACING.md,
          marginBottom: SPACING.md,
        },
        skeletonPostHeader: {
          flexDirection: 'row',
          alignItems: 'center',
          marginBottom: SPACING.md,
        },
        skeletonPostAvatar: {
          width: 40,
          height: 40,
          borderRadius: 20,
          backgroundColor: COLORS.background,
          marginRight: SPACING.sm,
        },
        skeletonPostInfo: {
          flex: 1,
        },
        skeletonPostName: {
          width: 120,
          height: 14,
          borderRadius: 7,
          backgroundColor: COLORS.background,
          marginBottom: 6,
        },
        skeletonPostTime: {
          width: 80,
          height: 10,
          borderRadius: 5,
          backgroundColor: COLORS.background,
        },
        skeletonPostText: {
          marginBottom: SPACING.md,
        },
        skeletonPostLine: {
          height: 12,
          borderRadius: 6,
          backgroundColor: COLORS.background,
          marginBottom: 6,
        },
        skeletonPostImage: {
          width: '100%',
          height: 200,
          borderRadius: 12,
          backgroundColor: COLORS.background,
          marginBottom: SPACING.sm,
        },
        skeletonPostActions: {
          flexDirection: 'row',
          gap: SPACING.lg,
          paddingTop: SPACING.sm,
          borderTopWidth: 1,
          borderTopColor: COLORS.border,
        },
        skeletonActionButton: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: SPACING.xs,
        },
        skeletonActionIcon: {
          width: 20,
          height: 20,
          borderRadius: 10,
          backgroundColor: COLORS.background,
        },
        skeletonActionText: {
          width: 40,
          height: 12,
          borderRadius: 6,
          backgroundColor: COLORS.background,
        },
        skeletonGrid: {
          paddingHorizontal: SPACING.lg,
          paddingVertical: SPACING.md,
        },
        skeletonGridRow: {
          flexDirection: 'row',
          gap: SPACING.sm,
          marginBottom: SPACING.sm,
        },
        skeletonGridItem: {
          flex: 1,
          aspectRatio: 1,
          borderRadius: 12,
          backgroundColor: COLORS.surface,
        },
        skeletonBottomNav: {
          flexDirection: 'row',
          justifyContent: 'space-around',
          alignItems: 'center',
          paddingVertical: SPACING.md,
          backgroundColor: COLORS.surface,
          borderTopWidth: 1,
          borderTopColor: COLORS.border,
        },
        skeletonNavItem: {
          alignItems: 'center',
          gap: 4,
        },
        skeletonNavIcon: {
          width: 24,
          height: 24,
          borderRadius: 12,
          backgroundColor: COLORS.background,
        },
        skeletonNavLabel: {
          width: 40,
          height: 8,
          borderRadius: 4,
          backgroundColor: COLORS.background,
        },
      }),
    [COLORS, SPACING, FONTS]
  );

  useEffect(() => {
    // Logo scale animation - breathing effect
    Animated.loop(
      Animated.sequence([
        Animated.timing(scaleAnimation, {
          toValue: 1.15,
          duration: 1000,
          useNativeDriver: true,
        }),
        Animated.timing(scaleAnimation, {
          toValue: 1,
          duration: 1000,
          useNativeDriver: true,
        }),
      ])
    ).start();

    // Glow animation for caption
    Animated.loop(
      Animated.sequence([
        Animated.timing(glowAnimation, {
          toValue: 1,
          duration: 1500,
          useNativeDriver: false,
        }),
        Animated.timing(glowAnimation, {
          toValue: 0,
          duration: 1500,
          useNativeDriver: false,
        }),
      ])
    ).start();

    // Switch to skeleton after 2 seconds
    const timer = setTimeout(() => {
      Animated.timing(fadeAnimation, {
        toValue: 0,
        duration: 500,
        useNativeDriver: true,
      }).start(() => {
        setShowSkeleton(true);
        Animated.timing(fadeAnimation, {
          toValue: 1,
          duration: 500,
          useNativeDriver: true,
        }).start();
      });
    }, 2000);

    return () => clearTimeout(timer);
  }, []);

  const glowRadius = glowAnimation.interpolate({
    inputRange: [0, 1],
    outputRange: [10, 25],
  });

  const glowOpacity = glowAnimation.interpolate({
    inputRange: [0, 1],
    outputRange: [0.5, 1],
  });

  if (showSkeleton) {
    return (
      <View style={styles.container}>
        <Animated.View style={[styles.skeletonWrapper, { opacity: fadeAnimation }]}>
          {/* Header */}
          <View style={styles.skeletonHeader}>
            <View style={styles.skeletonHeaderLeft}>
              <ShimmerEffect style={styles.skeletonAvatar} />
              <ShimmerEffect style={styles.skeletonHeaderText} />
            </View>
            <View style={styles.skeletonHeaderRight}>
              <ShimmerEffect style={styles.skeletonIcon} />
              <ShimmerEffect style={styles.skeletonIcon} />
            </View>
          </View>

          {/* Tabs */}
          <View style={styles.skeletonTabs}>
            <ShimmerEffect style={styles.skeletonTab} />
            <ShimmerEffect style={styles.skeletonTab} />
            <ShimmerEffect style={styles.skeletonTab} />
            <ShimmerEffect style={styles.skeletonTab} />
          </View>

          <ScrollView style={styles.skeletonContent} showsVerticalScrollIndicator={false}>
            {/* Stories */}
            <View style={styles.skeletonStories}>
              <View style={styles.skeletonStoriesRow}>
                {[1, 2, 3, 4, 5].map((i) => (
                  <View key={i} style={styles.skeletonStoryItem}>
                    <ShimmerEffect style={styles.skeletonStoryCircle} />
                    <ShimmerEffect style={styles.skeletonStoryName} />
                  </View>
                ))}
              </View>
            </View>

            {/* Feed Posts */}
            <View style={styles.skeletonFeed}>
              {[1, 2, 3].map((i) => (
                <SkeletonPost key={i} styles={styles} />
              ))}
            </View>

            {/* Grid Section */}
            <View style={styles.skeletonGrid}>
              <View style={styles.skeletonGridRow}>
                <ShimmerEffect style={styles.skeletonGridItem} />
                <ShimmerEffect style={styles.skeletonGridItem} />
                <ShimmerEffect style={styles.skeletonGridItem} />
              </View>
              <View style={styles.skeletonGridRow}>
                <ShimmerEffect style={styles.skeletonGridItem} />
                <ShimmerEffect style={styles.skeletonGridItem} />
                <ShimmerEffect style={styles.skeletonGridItem} />
              </View>
            </View>
          </ScrollView>

          {/* Bottom Navigation */}
          <View style={styles.skeletonBottomNav}>
            {[1, 2, 3, 4, 5].map((i) => (
              <View key={i} style={styles.skeletonNavItem}>
                <ShimmerEffect style={styles.skeletonNavIcon} />
                <ShimmerEffect style={styles.skeletonNavLabel} />
              </View>
            ))}
          </View>
        </Animated.View>
      </View>
    );
  }

  return (
    <View style={styles.centerContainer}>
      <Animated.View
        style={[
          styles.logoContainer,
          {
            opacity: fadeAnimation,
            transform: [{ scale: scaleAnimation }],
          },
        ]}
      >
        <Image source={logo} style={styles.logo} />
        
        <View style={styles.captionContainer}>
          <Animated.Text
            style={[
              styles.caption,
              {
                textShadowRadius: glowRadius,
                opacity: glowOpacity,
              },
            ]}
          >
            NEXUS
          </Animated.Text>
        </View>
      </Animated.View>
    </View>
  );
};

// Shimmer Effect Component with Wave Animation
const ShimmerEffect = ({ style }) => {
  const { COLORS } = useTheme();
  const shimmerAnimation = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.timing(shimmerAnimation, {
        toValue: 1,
        duration: 1500,
        useNativeDriver: true,
      })
    ).start();
  }, []);

  const translateX = shimmerAnimation.interpolate({
    inputRange: [0, 1],
    outputRange: [-width, width],
  });

  return (
    <View style={[style, { overflow: 'hidden' }]}>
      <Animated.View
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          transform: [{ translateX }],
        }}
      >
        <LinearGradient
          colors={[
            'transparent',
            COLORS.border + '40',
            COLORS.border + '80',
            COLORS.border + '40',
            'transparent',
          ]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={{ flex: 1, width: width }}
        />
      </Animated.View>
    </View>
  );
};

// Skeleton Post Component
const SkeletonPost = ({ styles }) => {
  return (
    <View style={styles.skeletonPost}>
      {/* Post Header */}
      <View style={styles.skeletonPostHeader}>
        <ShimmerEffect style={styles.skeletonPostAvatar} />
        <View style={styles.skeletonPostInfo}>
          <ShimmerEffect style={styles.skeletonPostName} />
          <ShimmerEffect style={styles.skeletonPostTime} />
        </View>
      </View>

      {/* Post Text */}
      <View style={styles.skeletonPostText}>
        <ShimmerEffect style={[styles.skeletonPostLine, { width: '100%' }]} />
        <ShimmerEffect style={[styles.skeletonPostLine, { width: '90%' }]} />
        <ShimmerEffect style={[styles.skeletonPostLine, { width: '70%' }]} />
      </View>

      {/* Post Image */}
      <ShimmerEffect style={styles.skeletonPostImage} />

      {/* Post Actions */}
      <View style={styles.skeletonPostActions}>
        <View style={styles.skeletonActionButton}>
          <ShimmerEffect style={styles.skeletonActionIcon} />
          <ShimmerEffect style={styles.skeletonActionText} />
        </View>
        <View style={styles.skeletonActionButton}>
          <ShimmerEffect style={styles.skeletonActionIcon} />
          <ShimmerEffect style={styles.skeletonActionText} />
        </View>
        <View style={styles.skeletonActionButton}>
          <ShimmerEffect style={styles.skeletonActionIcon} />
          <ShimmerEffect style={styles.skeletonActionText} />
        </View>
      </View>
    </View>
  );
};

export default AuthLoadingScreen;