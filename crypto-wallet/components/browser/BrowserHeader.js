import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Modal,
  Pressable,
  Animated,
  Share,
  Clipboard,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../../contexts/ThemeContext";

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Display-friendly URL: show just the hostname when the bar is not focused */
const getDisplayUrl = (url = "") => {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
};

/** true → HTTPS, false → HTTP or unknown */
const isSecure = (url = "") => url.startsWith("https://");

/** Favicon URL derived from the current page domain */
const getFaviconUrl = (url = "") => {
  try {
    const { origin } = new URL(url);
    return `${origin}/favicon.ico`;
  } catch {
    return null;
  }
};

// ─── Thin loading progress bar ────────────────────────────────────────────────

const ProgressBar = ({ progress = 0, color }) => {
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(anim, {
      toValue: progress,
      duration: 200,
      useNativeDriver: false,
    }).start();
  }, [progress]);

  if (progress <= 0 || progress >= 1) return null;

  return (
    <View style={pb.track}>
      <Animated.View
        style={[
          pb.bar,
          {
            backgroundColor: color,
            width: anim.interpolate({
              inputRange: [0, 1],
              outputRange: ["0%", "100%"],
            }),
          },
        ]}
      />
    </View>
  );
};

const pb = StyleSheet.create({
  track: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 2,
    backgroundColor: "transparent",
  },
  bar: { height: 2, borderRadius: 1 },
});

// ─── Favicon with fallback ────────────────────────────────────────────────────

const FaviconIcon = ({ url, size = 14 }) => {
  const [err, setErr] = useState(false);
  const faviconUri = getFaviconUrl(url);
  const secure = isSecure(url);

  if (!faviconUri || err) {
    return (
      <Ionicons
        name={secure ? "lock-closed" : "warning-outline"}
        size={size}
        color={secure ? "#4CAF50" : "#FF9800"}
      />
    );
  }

  // Use Image inline via a tiny wrapper
  // eslint-disable-next-line react-native/no-inline-styles
  return (
    <Animated.Image
      source={{ uri: faviconUri, cache: "force-cache" }}
      style={{ width: size, height: size, borderRadius: 3 }}
      onError={() => setErr(true)}
      fadeDuration={0}
    />
  );
};

// ─── Menu section ─────────────────────────────────────────────────────────────

const MenuSection = ({ title, items, COLORS, FONTS, SPACING }) => (
  <View style={ms.section}>
    {title && (
      <Text style={[ms.sectionTitle, { color: COLORS.textSecondary }]}>
        {title}
      </Text>
    )}
    {items.map((item, i) => (
      <TouchableOpacity
        key={i}
        style={[
          ms.item,
          i < items.length - 1 && {
            borderBottomWidth: StyleSheet.hairlineWidth,
            borderBottomColor: COLORS.divider,
          },
        ]}
        onPress={item.onPress}
        activeOpacity={0.7}
      >
        <View
          style={[
            ms.iconWrap,
            {
              backgroundColor: item.danger
                ? COLORS.error + "18"
                : COLORS.surface,
            },
          ]}
        >
          <Ionicons
            name={item.icon}
            size={18}
            color={item.danger ? COLORS.error : COLORS.text}
          />
        </View>
        <View style={ms.labelWrap}>
          <Text
            style={[
              ms.label,
              { color: item.danger ? COLORS.error : COLORS.text },
            ]}
          >
            {item.label}
          </Text>
          {item.sublabel && (
            <Text
              style={[ms.sublabel, { color: COLORS.textSecondary }]}
              numberOfLines={1}
            >
              {item.sublabel}
            </Text>
          )}
        </View>
        {item.badge && (
          <View style={[ms.badge, { backgroundColor: COLORS.primary }]}>
            <Text style={[ms.badgeText, { color: COLORS.background }]}>
              {item.badge}
            </Text>
          </View>
        )}
      </TouchableOpacity>
    ))}
  </View>
);

const ms = StyleSheet.create({
  section: { marginBottom: 8 },
  sectionTitle: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.8,
    textTransform: "uppercase",
    paddingHorizontal: 20,
    paddingVertical: 6,
  },
  item: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 13,
    gap: 14,
  },
  iconWrap: {
    width: 34,
    height: 34,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
  },
  labelWrap: { flex: 1 },
  label: { fontSize: 15, fontWeight: "500" },
  sublabel: { fontSize: 11, marginTop: 1, opacity: 0.7 },
  badge: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 999 },
  badgeText: { fontSize: 10, fontWeight: "800" },
});

// ─── Main component ───────────────────────────────────────────────────────────

const BrowserHeader = ({
  inputUrl,
  setInputUrl,
  canGoBack,
  canGoForward,
  isLoading,
  loadProgress = 0, // 0–1 float from WebView onLoadProgress
  webViewRef,
  handleGoHome,
  handleUrlSubmit,
  activeChain,
  isConnected,
  onChainPress,
  onDisconnect,
  onRefresh,
  onClose,
  onClearCache,
  onClearHistory,
}) => {
  const { COLORS, SPACING, FONTS, BORDER_RADIUS } = useTheme();

  const [showMenu, setShowMenu] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const [copied, setCopied] = useState(false);
  const inputRef = useRef(null);

  // When focused, show full URL; when blurred, show just domain
  const displayValue = isFocused ? inputUrl : getDisplayUrl(inputUrl);

  const handleFocus = useCallback(() => {
    setIsFocused(true);
    // Select all text so user can immediately type a new URL
    inputRef.current?.setNativeProps({
      selection: { start: 0, end: inputUrl.length },
    });
  }, [inputUrl]);

  const handleBlur = useCallback(() => setIsFocused(false), []);

  const handleCopyUrl = useCallback(async () => {
    Clipboard.setString(inputUrl);
    setCopied(true);
    setShowMenu(false);
    setTimeout(() => setCopied(false), 2000);
  }, [inputUrl]);

  const handleShare = useCallback(async () => {
    try {
      await Share.share({
        message: inputUrl,
        url: inputUrl,
        title: getDisplayUrl(inputUrl),
      });
    } catch {}
    setShowMenu(false);
  }, [inputUrl]);

  const secure = isSecure(inputUrl);

  // ── Menu sections ──────────────────────────────────────────────────────────
  const pageSection = [
    {
      icon: isLoading ? "stop-circle-outline" : "refresh",
      label: isLoading ? "Stop Loading" : "Refresh Page",
      onPress: () => {
        isLoading
          ? webViewRef.current?.stopLoading()
          : webViewRef.current?.reload();
        onRefresh?.();
        setShowMenu(false);
      },
    },
    {
      icon: "share-social-outline",
      label: "Share Page",
      sublabel: getDisplayUrl(inputUrl),
      onPress: handleShare,
    },
    {
      icon: copied ? "checkmark-circle-outline" : "copy-outline",
      label: copied ? "Copied!" : "Copy URL",
      onPress: handleCopyUrl,
    },
  ];

  const dataSection = [
    {
      icon: "cube-outline",
      label: "Clear Cache",
      onPress: () => {
        onClearCache?.();
        setShowMenu(false);
      },
    },
    {
      icon: "time-outline",
      label: "Clear History",
      onPress: () => {
        onClearHistory?.();
        setShowMenu(false);
      },
    },
  ];

  const dangerSection = [
    isConnected && {
      icon: "unlink-outline",
      label: "Disconnect Wallet",
      sublabel: `Connected to ${getDisplayUrl(inputUrl)}`,
      onPress: () => {
        webViewRef.current?.clearDappConnection?.();
        onDisconnect?.();
        setShowMenu(false);
      },
      danger: true,
    },
    {
      icon: "close-circle-outline",
      label: "Close Browser",
      onPress: () => {
        onClose?.();
        setShowMenu(false);
      },
      danger: true,
    },
  ].filter(Boolean);

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <View
      style={[
        s.container,
        {
          backgroundColor: COLORS.background,
          borderBottomColor: COLORS.border,
        },
      ]}
    >
      {/* ── Row ── */}
      <View style={s.row}>
        {/* Back / Forward / Home — collapse when URL bar is focused */}
        {!isFocused && (
          <View style={s.navGroup}>
            <TouchableOpacity
              style={[
                s.iconBtn,
                { backgroundColor: COLORS.card },
                !canGoBack && s.disabled,
              ]}
              onPress={() => webViewRef.current?.goBack()}
              disabled={!canGoBack}
            >
              <Ionicons name="chevron-back" size={19} color={COLORS.text} />
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                s.iconBtn,
                { backgroundColor: COLORS.card },
                !canGoForward && s.disabled,
              ]}
              onPress={() => webViewRef.current?.goForward()}
              disabled={!canGoForward}
            >
              <Ionicons name="chevron-forward" size={19} color={COLORS.text} />
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.iconBtn, { backgroundColor: COLORS.card }]}
              onPress={handleGoHome}
            >
              <Ionicons name="home-outline" size={17} color={COLORS.text} />
            </TouchableOpacity>
          </View>
        )}

        {/* URL bar */}
        <TouchableOpacity
          activeOpacity={1}
          style={[
            s.urlBar,
            {
              backgroundColor: COLORS.card,
              borderColor: isFocused ? COLORS.primary : COLORS.border,
            },
          ]}
          onPress={() => inputRef.current?.focus()}
        >
          {/* Left icon: favicon or security indicator */}
          {!isLoading ? (
            <FaviconIcon url={inputUrl} size={14} />
          ) : (
            <ActivityIndicator
              size="small"
              color={COLORS.primary}
              style={{ width: 14 }}
            />
          )}

          <TextInput
            ref={inputRef}
            style={[
              s.urlInput,
              { color: COLORS.text, fontSize: FONTS.sizes.sm },
            ]}
            value={displayValue}
            onChangeText={setInputUrl}
            onSubmitEditing={handleUrlSubmit}
            onFocus={handleFocus}
            onBlur={handleBlur}
            placeholder="Search or enter address"
            placeholderTextColor={COLORS.textSecondary}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            returnKeyType="go"
            selectTextOnFocus
          />

          {/* Clear / connection badge */}
          {isFocused && inputUrl.length > 0 ? (
            <TouchableOpacity
              onPress={() => setInputUrl("")}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons
                name="close-circle"
                size={16}
                color={COLORS.textSecondary}
              />
            </TouchableOpacity>
          ) : isConnected ? (
            <View
              style={[s.connectedDot, { backgroundColor: COLORS.success }]}
            />
          ) : null}
        </TouchableOpacity>

        {/* Chain pill — hidden while URL bar is focused */}
        {!isFocused && (
          <TouchableOpacity
            onPress={onChainPress}
            style={[
              s.chainPill,
              { backgroundColor: COLORS.card, borderColor: COLORS.border },
            ]}
          >
            <View
              style={[
                s.chainDot,
                {
                  backgroundColor: isConnected
                    ? COLORS.success
                    : COLORS.textSecondary,
                },
              ]}
            />
            <Text
              style={[
                s.chainText,
                { color: COLORS.text, fontSize: FONTS.sizes.xs },
              ]}
              numberOfLines={1}
            >
              {activeChain?.symbol}
            </Text>
          </TouchableOpacity>
        )}

        {/* Home / Cancel */}
        {isFocused ? (
          <TouchableOpacity
            onPress={() => inputRef.current?.blur()}
            style={s.cancelBtn}
          >
            <Text
              style={[
                s.cancelText,
                { color: COLORS.primary, fontSize: FONTS.sizes.sm },
              ]}
            >
              Cancel
            </Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={[s.iconBtn, { backgroundColor: COLORS.card }]}
            onPress={() => setShowMenu(true)}
          >
            <Ionicons name="ellipsis-vertical" size={18} color={COLORS.text} />
          </TouchableOpacity>
        )}
      </View>

      {/* ── Progress bar ── */}
      <ProgressBar
        progress={isLoading ? loadProgress : 0}
        color={COLORS.primary}
      />

      {/* ── Options sheet ── */}
      <Modal
        visible={showMenu}
        transparent
        animationType="slide"
        onRequestClose={() => setShowMenu(false)}
      >
        <Pressable style={s.overlay} onPress={() => setShowMenu(false)}>
          <Pressable
            style={[s.sheet, { backgroundColor: COLORS.card }]}
            onPress={() => {}}
          >
            {/* Handle */}
            <View style={[s.handle, { backgroundColor: COLORS.border }]} />

            {/* Current page info */}
            <View
              style={[s.sheetPageRow, { borderBottomColor: COLORS.border }]}
            >
              <View
                style={[s.sheetFavicon, { backgroundColor: COLORS.surface }]}
              >
                <FaviconIcon url={inputUrl} size={18} />
              </View>
              <View style={{ flex: 1 }}>
                <Text
                  style={[s.sheetPageTitle, { color: COLORS.text }]}
                  numberOfLines={1}
                >
                  {getDisplayUrl(inputUrl)}
                </Text>
                <Text
                  style={[s.sheetPageUrl, { color: COLORS.textSecondary }]}
                  numberOfLines={1}
                >
                  {inputUrl}
                </Text>
              </View>
              <View
                style={[
                  s.sheetSecureBadge,
                  {
                    backgroundColor: secure
                      ? COLORS.success + "18"
                      : COLORS.warning + "18",
                  },
                ]}
              >
                <Ionicons
                  name={secure ? "lock-closed" : "warning-outline"}
                  size={11}
                  color={secure ? COLORS.success : COLORS.warning}
                />
                <Text
                  style={[
                    s.sheetSecureText,
                    { color: secure ? COLORS.success : COLORS.warning },
                  ]}
                >
                  {secure ? "Secure" : "Not secure"}
                </Text>
              </View>
            </View>

            {/* Sections */}
            <MenuSection
              title="Page"
              items={pageSection}
              COLORS={COLORS}
              FONTS={FONTS}
              SPACING={SPACING}
            />
            <MenuSection
              title="Data"
              items={dataSection}
              COLORS={COLORS}
              FONTS={FONTS}
              SPACING={SPACING}
            />
            <MenuSection
              items={dangerSection}
              COLORS={COLORS}
              FONTS={FONTS}
              SPACING={SPACING}
            />
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
};

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  container: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingTop: 10,
    paddingBottom: 6,
    paddingHorizontal: 10,
    gap: 0,
    position: "relative",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },

  // Nav
  navGroup: { flexDirection: "row", gap: 4 },
  iconBtn: {
    width: 34,
    height: 34,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
  },
  disabled: { opacity: 0.3 },

  // URL bar
  urlBar: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    height: 36,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 10,
    gap: 7,
  },
  urlInput: { flex: 1, padding: 0, height: 36 },
  connectedDot: { width: 7, height: 7, borderRadius: 4 },

  // Chain pill
  chainPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 7,
    borderRadius: 9,
    borderWidth: 1,
  },
  chainDot: { width: 6, height: 6, borderRadius: 3 },
  chainText: { fontWeight: "700" },

  // Cancel
  cancelBtn: { paddingHorizontal: 4 },
  cancelText: { fontWeight: "600" },

  // Modal
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  sheet: {
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingBottom: 32,
    paddingTop: 10,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    alignSelf: "center",
    marginBottom: 14,
  },

  // Sheet page row
  sheetPageRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 20,
    paddingBottom: 14,
    marginBottom: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  sheetFavicon: {
    width: 38,
    height: 38,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  sheetPageTitle: { fontSize: 14, fontWeight: "600" },
  sheetPageUrl: { fontSize: 11, marginTop: 1, opacity: 0.7 },
  sheetSecureBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 999,
  },
  sheetSecureText: { fontSize: 10, fontWeight: "700" },
});

export default BrowserHeader;
