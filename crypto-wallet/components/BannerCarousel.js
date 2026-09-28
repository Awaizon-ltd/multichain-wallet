// components/BannerCarousel.js
// Compact promotional banner strip for the Home screen — title + description
// on the left, a small square image on the right, and a dismiss button so a
// banner the user has closed stays closed (persisted locally, per banner id).
// Content itself is managed entirely server-side (see crypto-backend's
// /api/banners CRUD + the admin tool) — this component only renders whatever
// is currently active.
import React, { useEffect, useRef, useState, useCallback } from "react";
import {
  View,
  FlatList,
  Image,
  Text,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  ActivityIndicator,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useNavigation } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { API_CONFIG } from "../config/api";
import { useTheme } from "../contexts/ThemeContext";
import { SPACING, FONTS, BORDER_RADIUS } from "../constants/Theme";

const { width: SCREEN_W } = Dimensions.get("window");
const CARD_W = SCREEN_W - SPACING.md * 2; // matches HomeScreen's screen padding
const BANNER_H = 84;
const IMAGE_SIZE = 64; // displayed square image — comfortably under the 70px cap
const AUTO_SCROLL_MS = 5000;
const DISMISSED_KEY = "@dismissed_banners";

// ─── Dot indicator ────────────────────────────────────────────────────────────
const Dots = ({ count, activeIndex, COLORS }) => (
  <View style={styles.dotsRow}>
    {Array.from({ length: count }).map((_, i) => (
      <View
        key={i}
        style={[
          styles.dot,
          {
            backgroundColor: i === activeIndex ? COLORS.primary : COLORS.border,
            width: i === activeIndex ? 14 : 5,
          },
        ]}
      />
    ))}
  </View>
);

// ─── Single banner card ───────────────────────────────────────────────────────
const BannerCard = ({ item, onPress, onDismiss, COLORS }) => {
  const imageUri = item.imageUrl
    ? `${API_CONFIG.BASE_URL.replace(/\/api$/, "")}${item.imageUrl}`
    : `${API_CONFIG.BASE_URL}/banners/image/${item._id}`;

  return (
    <TouchableOpacity
      activeOpacity={0.85}
      style={[
        styles.card,
        { backgroundColor: COLORS.card, borderColor: COLORS.border },
      ]}
      onPress={() => onPress(item)}
      accessibilityRole="button"
      accessibilityLabel={`Banner: ${item.title}`}
    >
      <View style={styles.textBlock}>
        {!!item.badge && (
          <Text style={[styles.badgeText, { color: COLORS.primary }]}>
            {item.badge.toUpperCase()}
          </Text>
        )}
        <Text
          style={[styles.cardTitle, { color: COLORS.text }]}
          numberOfLines={1}
        >
          {item.title}
        </Text>
        {!!item.description && (
          <Text
            style={[styles.cardDesc, { color: COLORS.textSecondary }]}
            numberOfLines={2}
          >
            {item.description}
          </Text>
        )}
      </View>

      <Image
        source={{ uri: imageUri }}
        style={[styles.image, { backgroundColor: COLORS.surface }]}
        resizeMode="cover"
      />

      {/* Dismiss — stopPropagation so it doesn't also trigger onPress */}
      <TouchableOpacity
        onPress={(e) => {
          e.stopPropagation();
          onDismiss(item._id);
        }}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        style={[styles.closeBtn, { backgroundColor: COLORS.surface + "E6" }]}
        accessibilityLabel="Dismiss banner"
        accessibilityRole="button"
      >
        <Ionicons name="close" size={13} color={COLORS.textSecondary} />
      </TouchableOpacity>
    </TouchableOpacity>
  );
};

// ─── Main BannerCarousel ──────────────────────────────────────────────────────
const BannerCarousel = ({ containerStyle }) => {
  const { COLORS } = useTheme();
  const navigation = useNavigation();

  const [banners, setBanners] = useState([]);
  const [dismissedIds, setDismissedIds] = useState(null); // null until loaded
  const [loading, setLoading] = useState(true);
  const [activeIndex, setActiveIndex] = useState(0);
  const flatListRef = useRef(null);
  const timerRef = useRef(null);

  const loadDismissed = useCallback(async () => {
    try {
      const raw = await AsyncStorage.getItem(DISMISSED_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }, []);

  const fetchBanners = useCallback(async () => {
    try {
      setLoading(true);
      const [res, dismissed] = await Promise.all([
        fetch(`${API_CONFIG.BASE_URL}/banners`),
        loadDismissed(),
      ]);
      const json = await res.json();
      setDismissedIds(dismissed);
      if (json.success) setBanners(json.data);
    } catch {
      // silent fail — don't break the Home screen over a promo banner
      setDismissedIds((prev) => prev ?? []);
    } finally {
      setLoading(false);
    }
  }, [loadDismissed]);

  useEffect(() => {
    fetchBanners();
  }, [fetchBanners]);

  const visibleBanners = banners.filter(
    (b) => !dismissedIds?.includes(b._id),
  );

  // Auto-scroll timer
  useEffect(() => {
    if (visibleBanners.length <= 1) return;
    timerRef.current = setInterval(() => {
      setActiveIndex((prev) => {
        const next = (prev + 1) % visibleBanners.length;
        flatListRef.current?.scrollToIndex({ index: next, animated: true });
        return next;
      });
    }, AUTO_SCROLL_MS);
    return () => clearInterval(timerRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleBanners.length]);

  const onMomentumScrollEnd = (e) => {
    const idx = Math.round(e.nativeEvent.contentOffset.x / CARD_W);
    setActiveIndex(idx);
    clearInterval(timerRef.current);
  };

  const handlePress = (item) => {
    navigation.navigate("BannerDetail", { banner: item });
  };

  const handleDismiss = useCallback(
    async (id) => {
      setDismissedIds((prev) => {
        const next = [...(prev ?? []), id];
        AsyncStorage.setItem(DISMISSED_KEY, JSON.stringify(next)).catch(
          () => {},
        );
        return next;
      });
      setActiveIndex(0);
    },
    [],
  );

  if (loading || dismissedIds === null) {
    return (
      <View
        style={[
          styles.loadingContainer,
          { backgroundColor: COLORS.surface },
          containerStyle,
        ]}
      >
        <ActivityIndicator size="small" color={COLORS.primary} />
      </View>
    );
  }

  if (visibleBanners.length === 0) return null;

  return (
    <View style={[styles.root, containerStyle]}>
      <FlatList
        ref={flatListRef}
        data={visibleBanners}
        keyExtractor={(item) => item._id}
        renderItem={({ item }) => (
          <BannerCard
            item={item}
            onPress={handlePress}
            onDismiss={handleDismiss}
            COLORS={COLORS}
          />
        )}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={onMomentumScrollEnd}
        getItemLayout={(_, index) => ({
          length: CARD_W,
          offset: CARD_W * index,
          index,
        })}
      />

      {visibleBanners.length > 1 && (
        <Dots
          count={visibleBanners.length}
          activeIndex={Math.min(activeIndex, visibleBanners.length - 1)}
          COLORS={COLORS}
        />
      )}
    </View>
  );
};

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root: { width: CARD_W },

  loadingContainer: {
    width: CARD_W,
    height: BANNER_H,
    borderRadius: BORDER_RADIUS.lg,
    justifyContent: "center",
    alignItems: "center",
  },

  card: {
    width: CARD_W,
    height: BANNER_H,
    flexDirection: "row",
    alignItems: "center",
    borderRadius: BORDER_RADIUS.lg,
    borderWidth: 1,
    paddingVertical: SPACING.sm,
    paddingLeft: SPACING.md,
    paddingRight: SPACING.sm,
    gap: SPACING.sm,
  },

  textBlock: { flex: 1, gap: 2 },
  badgeText: {
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 0.6,
  },
  cardTitle: {
    fontSize: FONTS.sizes.sm,
    fontWeight: "700",
  },
  cardDesc: {
    fontSize: FONTS.sizes.xs,
    lineHeight: FONTS.sizes.xs * FONTS.lineHeights.normal,
  },

  image: {
    width: IMAGE_SIZE,
    height: IMAGE_SIZE,
    borderRadius: BORDER_RADIUS.md,
  },

  closeBtn: {
    position: "absolute",
    top: 6,
    right: 6,
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },

  dotsRow: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    paddingTop: SPACING.xs,
    gap: 4,
  },
  dot: {
    height: 5,
    borderRadius: BORDER_RADIUS.round,
  },
});

export default BannerCarousel;
