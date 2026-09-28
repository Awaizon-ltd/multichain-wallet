import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  Image,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  Linking,
  ActivityIndicator,
  Platform,
  StatusBar,
} from "react-native";
import { API_CONFIG } from "../../config/api";
import {
  THEMES,
  SPACING,
  FONTS,
  BORDER_RADIUS,
  SHADOWS,
} from "../../constants/Theme";

const { width: SCREEN_W } = Dimensions.get("window");
const HERO_H = 270;
const STATUS_H = Platform.OS === "ios" ? 44 : StatusBar.currentHeight || 0;

// ─── Back Button ─────────────────────────────────────────────────────────────
const BackButton = ({ onPress, colors }) => (
  <TouchableOpacity
    style={[styles.backBtn, { backgroundColor: `${colors.background}CC` }]}
    onPress={onPress}
    accessibilityLabel="Go back"
    accessibilityRole="button"
  >
    <Text style={[styles.backIcon, { color: colors.text }]}>‹</Text>
  </TouchableOpacity>
);

// ─── Screen ───────────────────────────────────────────────────────────────────
const BannerDetailScreen = ({ route, navigation, isDark = false }) => {
  const colors = isDark ? THEMES.dark : THEMES.light;
  const { banner: bannerPreview } = route.params;

  const [banner, setBanner] = useState(bannerPreview);
  const [loading, setLoading] = useState(false);

  // Fetch full detail (description may not be in the list payload)
  useEffect(() => {
    const fetchDetail = async () => {
      try {
        setLoading(true);
        const res = await fetch(
          `${API_CONFIG.BASE_URL}/banners/${bannerPreview._id}`,
        );
        const json = await res.json();
        if (json.success) setBanner(json.data);
      } catch {
        // fallback to preview data
      } finally {
        setLoading(false);
      }
    };
    fetchDetail();
  }, [bannerPreview._id]);

  const imageUri = `${API_CONFIG.BASE_URL}/banners/image/${banner._id}`;

  const handleCTA = () => {
    if (banner.ctaUrl) Linking.openURL(banner.ctaUrl).catch(() => {});
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <StatusBar
        barStyle={isDark ? "light-content" : "dark-content"}
        translucent
        backgroundColor="transparent"
      />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Hero ─────────────────────────────────────────────────────── */}
        <View style={styles.heroContainer}>
          <Image
            source={{ uri: imageUri }}
            style={StyleSheet.absoluteFill}
            resizeMode="cover"
          />

          {/* Warm dark scrim */}
          <View style={styles.heroScrim} />

          {/* Amber bottom gradient strip */}
          <View
            style={[styles.heroAccentBar, { backgroundColor: colors.primary }]}
          />

          {/* Back button */}
          <BackButton onPress={() => navigation.goBack()} colors={colors} />

          {/* Badge */}
          {!!banner.badge && (
            <View
              style={[styles.heroBadge, { backgroundColor: colors.primary }]}
            >
              <Text
                style={[styles.heroBadgeText, { color: colors.background }]}
              >
                {banner.badge}
              </Text>
            </View>
          )}
        </View>

        {/* ── Content Card ─────────────────────────────────────────────── */}
        <View
          style={[
            styles.contentCard,
            {
              backgroundColor: colors.card,
              borderColor: colors.border,
              ...SHADOWS.medium,
            },
          ]}
        >
          {/* Title */}
          <Text style={[styles.title, { color: colors.text }]}>
            {banner.title}
          </Text>

          {/* Subtitle */}
          {!!banner.subtitle && (
            <Text style={[styles.subtitle, { color: colors.primary }]}>
              {banner.subtitle}
            </Text>
          )}

          {/* Amber divider */}
          <View style={[styles.divider, { backgroundColor: colors.divider }]} />

          {/* Description */}
          {loading ? (
            <ActivityIndicator
              color={colors.primary}
              style={{ marginTop: SPACING.lg }}
            />
          ) : (
            <Text style={[styles.description, { color: colors.textSecondary }]}>
              {banner.description || "No additional details available."}
            </Text>
          )}

          {/* CTA Button */}
          {!!banner.ctaUrl && (
            <TouchableOpacity
              style={[
                styles.ctaButton,
                {
                  backgroundColor: colors.primary,
                  ...SHADOWS.medium,
                },
              ]}
              onPress={handleCTA}
              activeOpacity={0.82}
            >
              <Text style={[styles.ctaText, { color: colors.background }]}>
                {banner.ctaLabel || "Learn More"}
              </Text>
              <Text style={[styles.ctaArrow, { color: colors.background }]}>
                {" "}
                →
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </ScrollView>
    </View>
  );
};

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: SPACING.xxl,
  },

  // ── Hero ──────────────────────────────────────────────────────────────────
  heroContainer: {
    width: SCREEN_W,
    height: HERO_H,
    backgroundColor: "#1F1A0E",
  },
  heroScrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(26, 14, 0, 0.42)",
  },
  heroAccentBar: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 4,
  },

  // Hero badge
  heroBadge: {
    position: "absolute",
    bottom: SPACING.lg,
    right: SPACING.md,
    borderRadius: BORDER_RADIUS.sm,
    paddingHorizontal: SPACING.sm + SPACING.xs,
    paddingVertical: SPACING.xs,
  },
  heroBadgeText: {
    fontSize: FONTS.sizes.xs,
    fontWeight: "800",
    letterSpacing: 1,
    textTransform: "uppercase",
  },

  // ── Back button ───────────────────────────────────────────────────────────
  backBtn: {
    position: "absolute",
    top: STATUS_H + SPACING.sm,
    left: SPACING.md,
    width: 40,
    height: 40,
    borderRadius: BORDER_RADIUS.round,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(240,165,0,0.3)",
  },
  backIcon: {
    fontSize: 30,
    lineHeight: 34,
    marginTop: -2,
    fontWeight: "300",
  },

  // ── Content card ──────────────────────────────────────────────────────────
  contentCard: {
    marginTop: -BORDER_RADIUS.xl,
    marginHorizontal: 0,
    borderTopLeftRadius: BORDER_RADIUS.xl,
    borderTopRightRadius: BORDER_RADIUS.xl,
    borderTopWidth: 1,
    borderLeftWidth: 0,
    borderRightWidth: 0,
    borderBottomWidth: 0,
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.xl,
    minHeight: 380,
  },
  title: {
    fontSize: FONTS.sizes.xxl,
    fontWeight: "800",
    lineHeight: FONTS.sizes.xxl * FONTS.lineHeights.tight,
    letterSpacing: -0.4,
  },
  subtitle: {
    fontSize: FONTS.sizes.sm,
    fontWeight: "700",
    letterSpacing: 0.4,
    marginTop: SPACING.sm,
    textTransform: "uppercase",
  },
  divider: {
    height: 1,
    marginVertical: SPACING.lg,
    borderRadius: BORDER_RADIUS.round,
  },
  description: {
    fontSize: FONTS.sizes.md,
    lineHeight: FONTS.sizes.md * FONTS.lineHeights.relaxed,
  },

  // ── CTA ───────────────────────────────────────────────────────────────────
  ctaButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginTop: SPACING.xl,
    borderRadius: BORDER_RADIUS.lg,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.xl,
  },
  ctaText: {
    fontSize: FONTS.sizes.base,
    fontWeight: "800",
    letterSpacing: 0.3,
  },
  ctaArrow: {
    fontSize: FONTS.sizes.lg,
    fontWeight: "800",
  },
});

export default BannerDetailScreen;
