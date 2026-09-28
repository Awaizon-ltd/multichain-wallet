import React, { useState, useCallback, useMemo, useRef } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  Platform,
  Animated,
  Dimensions,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import {
  useTheme,
  deriveAccentColors,
  deriveBgColors,
  hexToRgb,
  toHex,
} from "../../contexts/ThemeContext";

const { width: SCREEN_W } = Dimensions.get("window");
const H_PAD      = 16;
const COLS       = 5;
const SWATCH_GAP = 10;
const SWATCH_SZ  = Math.floor((SCREEN_W - H_PAD * 2 - SWATCH_GAP * (COLS - 1)) / COLS);

// ── Palettes ──────────────────────────────────────────────────────────────────

const ACCENT_PALETTE = [
  { name: "Brand",    hex: "#D6FA1B" },
  { name: "Golden",   hex: "#FACC15" },
  { name: "Amber",    hex: "#F59E0B" },
  { name: "Orange",   hex: "#F97316" },
  { name: "Coral",    hex: "#FF6B6B" },
  { name: "Red",      hex: "#EF4444" },
  { name: "Rose",     hex: "#F43F5E" },
  { name: "Pink",     hex: "#EC4899" },
  { name: "Fuchsia",  hex: "#D946EF" },
  { name: "Purple",   hex: "#A855F7" },
  { name: "Violet",   hex: "#8B5CF6" },
  { name: "Indigo",   hex: "#6366F1" },
  { name: "Blue",     hex: "#3B82F6" },
  { name: "Sky",      hex: "#0EA5E9" },
  { name: "Cyan",     hex: "#06B6D4" },
  { name: "Electric", hex: "#0088FF" },
  { name: "Teal",     hex: "#14B8A6" },
  { name: "Emerald",  hex: "#10B981" },
  { name: "Green",    hex: "#22C55E" },
  { name: "Mint",     hex: "#00D4AA" },
];

const BG_PALETTE = [
  { name: "Ocean",    hex: "#0EA5E9" },
  { name: "Midnight", hex: "#6366F1" },
  { name: "Nebula",   hex: "#8B5CF6" },
  { name: "Forest",   hex: "#10B981" },
  { name: "Crimson",  hex: "#EF4444" },
  { name: "Sunset",   hex: "#F97316" },
  { name: "Berry",    hex: "#EC4899" },
  { name: "Arctic",   hex: "#06B6D4" },
  { name: "Jade",     hex: "#14B8A6" },
  { name: "Rose",     hex: "#F43F5E" },
  { name: "Violet",   hex: "#7C3AED" },
  { name: "Copper",   hex: "#B45309" },
  { name: "Slate",    hex: "#475569" },
  { name: "Plum",     hex: "#9333EA" },
  { name: "Sapphire", hex: "#1D4ED8" },
];

// ── Hex utilities ─────────────────────────────────────────────────────────────

const isValidHex = (h) => /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/.test(h);

const normalizeHex = (input) => {
  let h = input.trim();
  if (!h.startsWith("#")) h = "#" + h;
  if (/^#[A-Fa-f0-9]{3}$/.test(h))
    h = "#" + h[1]+h[1]+h[2]+h[2]+h[3]+h[3];
  return h.toUpperCase();
};

const contrastText = (hex) => {
  try {
    const { r, g, b } = hexToRgb(hex);
    return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.55 ? "#000000" : "#FFFFFF";
  } catch { return "#000000"; }
};

// ── Swatch ────────────────────────────────────────────────────────────────────

const Swatch = React.memo(({ hex, name, selected, onPress, COLORS }) => {
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const onIn  = () => Animated.spring(scaleAnim, { toValue: 0.86, useNativeDriver: true, speed: 60 }).start();
  const onOut = () => Animated.spring(scaleAnim, { toValue: 1,    useNativeDriver: true, speed: 60 }).start();

  return (
    <TouchableOpacity onPress={() => onPress(hex)} onPressIn={onIn} onPressOut={onOut} activeOpacity={1}>
      <Animated.View style={[sw.circle, {
        width: SWATCH_SZ, height: SWATCH_SZ,
        backgroundColor: hex,
        borderWidth: selected ? 3 : 1.5,
        borderColor:  selected ? COLORS.text : hex + "55",
        transform: [{ scale: scaleAnim }],
      }]}>
        {selected && <Ionicons name="checkmark" size={SWATCH_SZ * 0.38} color={contrastText(hex)} />}
      </Animated.View>
      <Text style={[sw.label, { color: COLORS.textTertiary }]} numberOfLines={1}>{name}</Text>
    </TouchableOpacity>
  );
});

const sw = StyleSheet.create({
  circle: { borderRadius: 999, justifyContent: "center", alignItems: "center" },
  label:  { fontSize: 9, textAlign: "center", marginTop: 4, fontWeight: "600", letterSpacing: 0.2 },
});

// ── Hex input row ─────────────────────────────────────────────────────────────

const HexInput = ({ value, onChange, onConfirm, error, COLORS }) => {
  const valid = isValidHex(normalizeHex(value));
  return (
    <>
      <View style={[hi.row, {
        backgroundColor: COLORS.card,
        borderColor: error ? COLORS.error : valid ? COLORS.primary + "66" : COLORS.border,
      }]}>
        <View style={[hi.preview, {
          backgroundColor: valid ? normalizeHex(value) : COLORS.surface,
          borderColor: COLORS.border,
        }]} />
        <TextInput
          style={[hi.input, { color: COLORS.text }]}
          value={value}
          onChangeText={onChange}
          placeholder="#000000"
          placeholderTextColor={COLORS.textTertiary}
          autoCapitalize="characters"
          autoCorrect={false}
          maxLength={7}
          returnKeyType="done"
        />
        {valid && (
          <TouchableOpacity
            onPress={() => onConfirm(normalizeHex(value))}
            style={[hi.checkBtn, { backgroundColor: normalizeHex(value) }]}
            activeOpacity={0.8}
          >
            <Ionicons name="checkmark" size={14} color={contrastText(normalizeHex(value))} />
          </TouchableOpacity>
        )}
      </View>
      {error && <Text style={[hi.error, { color: COLORS.error }]}>Invalid hex — use #RRGGBB</Text>}
    </>
  );
};

const hi = StyleSheet.create({
  row: {
    flexDirection: "row", alignItems: "center", gap: 10,
    borderRadius: 12, borderWidth: 1.5,
    paddingHorizontal: 12, paddingVertical: 10,
  },
  preview: { width: 28, height: 28, borderRadius: 8, borderWidth: 1 },
  input: {
    flex: 1, fontSize: 15, fontWeight: "700", padding: 0,
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
    letterSpacing: 1,
  },
  checkBtn: { width: 28, height: 28, borderRadius: 8, justifyContent: "center", alignItems: "center" },
  error: { fontSize: 11, marginTop: 5, fontWeight: "500" },
});

// ── Live preview card ─────────────────────────────────────────────────────────

// Sample assets shown in the live preview only — Ethereum + USDC, the app's
// default chain and its most universal token.
const PREVIEW_ASSETS = [
  { sym: "ETH", name: "Ethereum" },
  { sym: "USDC", name: "USD Coin" },
];

const PreviewCard = React.memo(({ accent, bgTint, isDark }) => {
  const bg   = bgTint ? deriveBgColors(bgTint, isDark) : null;
  const cardBg  = bg?.card    ?? (isDark ? "#1E1E1E" : "#F2F2F2");
  const cardBg2 = bg?.surface ?? (isDark ? "#282828" : "#E8E8E8");
  const cardBdr = bg?.border  ?? (isDark ? "#2C2C2C" : "#E6E6E6");
  const rootBg  = isDark ? "#121212" : "#FFFFFF";
  const txt     = isDark ? "#F5F5F5" : "#0A0A0A";
  const txt2    = isDark ? "#A1A1AA" : "#52525B";
  const btnTxt  = contrastText(accent);

  const gradientColors = bgTint
    ? [bgTint, bgTint + "88", "transparent"]
    : null;

  return (
    // Outer wrapper provides the solid base background
    <View style={[pv.root, { backgroundColor: rootBg, borderColor: cardBdr, overflow: "hidden" }]}>
      {/* Gradient overlay at the top — mirrors the real app effect */}
      {gradientColors && (
        <LinearGradient
          colors={gradientColors}
          locations={[0, 0.35, 0.75]}
          style={{ position: "absolute", top: 0, left: 0, right: 0, height: "75%" }}
          pointerEvents="none"
        />
      )}
      {/* Header */}
      <View style={[pv.header, { backgroundColor: cardBg, borderBottomColor: cardBdr }]}>
        <View style={[pv.chainPill, { backgroundColor: cardBg2 }]}>
          <View style={[pv.dot, { backgroundColor: accent }]} />
          <Text style={[pv.chainTxt, { color: txt2 }]}>Ethereum</Text>
        </View>
        <View style={[pv.activeBadge, { backgroundColor: accent + "22", borderColor: accent + "55" }]}>
          <Text style={[pv.activeTxt, { color: accent }]}>Active</Text>
        </View>
      </View>

      {/* Balance block */}
      <View style={[pv.balanceBlock, { backgroundColor: cardBg }]}>
        <Text style={[pv.balLabel, { color: txt2 }]}>Total Balance</Text>
        <Text style={[pv.balance, { color: txt }]}>$12,450.00</Text>
        <View style={pv.changeRow}>
          <Ionicons name="trending-up" size={12} color={accent} />
          <Text style={[pv.change, { color: accent }]}>+2.45% today</Text>
        </View>
        {/* Progress bar showing theme color */}
        <View style={[pv.barTrack, { backgroundColor: cardBg2, marginTop: 10 }]}>
          <View style={[pv.barFill, { backgroundColor: accent, width: "72%" }]} />
        </View>
      </View>

      {/* Action buttons */}
      <View style={[pv.btnRow, { backgroundColor: cardBg }]}>
        {["Send", "Receive", "Swap"].map((lbl) => (
          <View key={lbl} style={[pv.btn, { backgroundColor: accent }]}>
            <Text style={[pv.btnTxt, { color: btnTxt }]}>{lbl}</Text>
          </View>
        ))}
      </View>

      {/* Asset rows */}
      {PREVIEW_ASSETS.map((a) => (
        <View key={a.sym} style={[pv.assetRow, { backgroundColor: cardBg, borderTopColor: cardBdr }]}>
          <View style={[pv.assetIcon, { backgroundColor: accent + "22", borderColor: accent + "44" }]}>
            <Text style={[pv.assetIconTxt, { color: accent }]}>{a.sym[0]}</Text>
          </View>
          <Text style={[pv.assetName, { color: txt }]}>{a.name}</Text>
          <Text style={[pv.assetBal, { color: txt2 }]}>0.0000 {a.sym}</Text>
        </View>
      ))}
    </View>
  );
});

const pv = StyleSheet.create({
  root:        { borderRadius: 16, borderWidth: 1, overflow: "hidden" },
  header:      { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  chainPill:   { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 20 },
  dot:         { width: 7, height: 7, borderRadius: 4 },
  chainTxt:    { fontSize: 11, fontWeight: "600" },
  activeBadge: { paddingHorizontal: 7, paddingVertical: 3, borderRadius: 6, borderWidth: 1 },
  activeTxt:   { fontSize: 9, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.3 },
  balanceBlock:{ padding: 14, gap: 4 },
  balLabel:    { fontSize: 9, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.7 },
  balance:     { fontSize: 24, fontWeight: "800", letterSpacing: -0.8 },
  changeRow:   { flexDirection: "row", alignItems: "center", gap: 4 },
  change:      { fontSize: 11, fontWeight: "600" },
  barTrack:    { height: 4, borderRadius: 2, overflow: "hidden" },
  barFill:     { height: 4, borderRadius: 2 },
  btnRow:      { flexDirection: "row", gap: 8, padding: 12, paddingTop: 0 },
  btn:         { flex: 1, paddingVertical: 8, borderRadius: 10, alignItems: "center" },
  btnTxt:      { fontSize: 11, fontWeight: "700" },
  assetRow:    { flexDirection: "row", alignItems: "center", gap: 10, padding: 10, borderTopWidth: StyleSheet.hairlineWidth },
  assetIcon:   { width: 30, height: 30, borderRadius: 15, justifyContent: "center", alignItems: "center", borderWidth: 1 },
  assetIconTxt:{ fontSize: 11, fontWeight: "800" },
  assetName:   { flex: 1, fontSize: 12, fontWeight: "600" },
  assetBal:    { fontSize: 11 },
});

// ── Section header ────────────────────────────────────────────────────────────

const SectionLabel = ({ children, COLORS }) => (
  <Text style={[sl.text, { color: COLORS.textTertiary }]}>{children}</Text>
);

const sl = StyleSheet.create({
  text: { fontSize: 10, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.9, marginTop: 22, marginBottom: 12 },
});

// ── "No Tint" reset chip ──────────────────────────────────────────────────────

const NoTintChip = React.memo(({ selected, onPress, COLORS }) => (
  <TouchableOpacity
    onPress={onPress}
    style={[nt.chip, {
      borderColor:     selected ? COLORS.primary : COLORS.border,
      backgroundColor: selected ? COLORS.primary + "18" : COLORS.card,
    }]}
    activeOpacity={0.75}
  >
    <Ionicons name="close-circle-outline" size={14} color={selected ? COLORS.primary : COLORS.textSecondary} />
    <Text style={[nt.text, { color: selected ? COLORS.primary : COLORS.textSecondary }]}>No tint</Text>
    {selected && <Ionicons name="checkmark" size={12} color={COLORS.primary} />}
  </TouchableOpacity>
));

const nt = StyleSheet.create({
  chip: {
    flexDirection: "row", alignItems: "center", gap: 5,
    paddingHorizontal: 12, paddingVertical: 8,
    borderRadius: 20, borderWidth: 1.5, alignSelf: "flex-start",
  },
  text: { fontSize: 12, fontWeight: "600" },
});

// ── Main screen ───────────────────────────────────────────────────────────────

const AccentColorScreen = ({ navigation }) => {
  const { COLORS, isDark, accentColor, bgTintColor, setAccentColor, setBgTintColor } = useTheme();
  const insets = useSafeAreaInsets();

  // Falls back to the app's brand yellow-green default, not an arbitrary color.
  const defaultAccent = "#D6FA1B";

  const [selAccent,      setSelAccent]      = useState(accentColor ?? defaultAccent);
  const [selBg,          setSelBg]          = useState(bgTintColor ?? null);
  const [hexAccent,      setHexAccent]      = useState(accentColor ?? defaultAccent);
  const [hexBg,          setHexBg]          = useState(bgTintColor ?? "");
  const [accentErr,      setAccentErr]      = useState(false);
  const [bgErr,          setBgErr]          = useState(false);

  // Live preview accent — use hex input if valid, else fallback to selected
  const previewAccent = useMemo(() => {
    const n = normalizeHex(hexAccent);
    return isValidHex(n) ? n : selAccent;
  }, [hexAccent, selAccent]);

  const previewBg = useMemo(() => {
    if (!hexBg || !hexBg.trim()) return selBg;
    const n = normalizeHex(hexBg);
    return isValidHex(n) ? n : selBg;
  }, [hexBg, selBg]);

  // ── Accent handlers ──
  const onAccentSwatch = useCallback((hex) => {
    setSelAccent(hex); setHexAccent(hex); setAccentErr(false);
  }, []);

  const onAccentHex = useCallback((text) => {
    let v = text; if (v && !v.startsWith("#")) v = "#" + v;
    setHexAccent(v.toUpperCase());
    const n = normalizeHex(v);
    if (isValidHex(n)) { setSelAccent(n); setAccentErr(false); }
    else setAccentErr(v.length > 1);
  }, []);

  // ── Bg handlers ──
  const onBgSwatch = useCallback((hex) => {
    setSelBg(hex); setHexBg(hex); setBgErr(false);
  }, []);

  const onNoTint = useCallback(() => {
    setSelBg(null); setHexBg(""); setBgErr(false);
  }, []);

  const onBgHex = useCallback((text) => {
    let v = text; if (v && !v.startsWith("#")) v = "#" + v;
    setHexBg(v.toUpperCase());
    const n = normalizeHex(v);
    if (isValidHex(n)) { setSelBg(n); setBgErr(false); }
    else setBgErr(v.length > 1);
  }, []);

  // ── Apply / Reset ──
  const handleApply = async () => {
    await setAccentColor(previewAccent === defaultAccent && !accentColor ? null : previewAccent);
    await setBgTintColor(previewBg ?? null);
    navigation.goBack();
  };

  const handleReset = async () => {
    await setAccentColor(null);
    await setBgTintColor(null);
    navigation.goBack();
  };

  const hasChanges = previewAccent !== (accentColor ?? defaultAccent) || previewBg !== bgTintColor;
  const hasAnyCustom = !!accentColor || !!bgTintColor;

  return (
    <View style={[s.container, { backgroundColor: COLORS.background }]}>

      {/* ── Header ── */}
      <View style={[s.header, { backgroundColor: COLORS.card, borderBottomColor: COLORS.border, paddingTop: insets.top + 5 }]}>
        <TouchableOpacity
          style={[s.backBtn, { backgroundColor: COLORS.surface }]}
          onPress={() => navigation.goBack()}
          activeOpacity={0.7}
        >
          <Ionicons name="arrow-back" size={20} color={COLORS.text} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={[s.title, { color: COLORS.text }]}>Theme Color</Text>
          <Text style={[s.subtitle, { color: COLORS.textSecondary }]}>
            Accent &amp; background tint
          </Text>
        </View>
        {/* Two live indicator dots */}
        <View style={s.dotRow}>
          <View style={[s.dot, { backgroundColor: previewAccent, borderColor: COLORS.border }]} />
          {previewBg && (
            <View style={[s.dot, { backgroundColor: previewBg, borderColor: COLORS.border }]} />
          )}
        </View>
      </View>

      <ScrollView
        contentContainerStyle={s.scroll}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* ── Live preview ── */}
        <SectionLabel COLORS={COLORS}>Preview</SectionLabel>
        <PreviewCard accent={previewAccent} bgTint={previewBg} isDark={isDark} />

        {/* ══ ACCENT COLOR section ══ */}
        <SectionLabel COLORS={COLORS}>Theme Color</SectionLabel>
        <Text style={[s.sectionDesc, { color: COLORS.textTertiary }]}>
          Buttons, badges, highlights &amp; interactive elements
        </Text>

        <View style={s.swatchGrid}>
          {ACCENT_PALETTE.map((c) => (
            <Swatch
              key={c.hex}
              hex={c.hex}
              name={c.name}
              selected={selAccent.toUpperCase() === c.hex.toUpperCase()}
              onPress={onAccentSwatch}
              COLORS={COLORS}
            />
          ))}
        </View>

        <View style={{ marginTop: 12 }}>
          <HexInput
            value={hexAccent}
            onChange={onAccentHex}
            onConfirm={onAccentSwatch}
            error={accentErr}
            COLORS={COLORS}
          />
        </View>

        {/* ══ BACKGROUND TINT section ══ */}
        <SectionLabel COLORS={COLORS}>Background Tint</SectionLabel>
        <Text style={[s.sectionDesc, { color: COLORS.textTertiary }]}>
          A gradient fades from this color at the top of every screen downward
        </Text>

        <NoTintChip selected={!selBg} onPress={onNoTint} COLORS={COLORS} />

        <View style={[s.swatchGrid, { marginTop: 12 }]}>
          {BG_PALETTE.map((c) => (
            <Swatch
              key={c.hex}
              hex={c.hex}
              name={c.name}
              selected={!!selBg && selBg.toUpperCase() === c.hex.toUpperCase()}
              onPress={onBgSwatch}
              COLORS={COLORS}
            />
          ))}
        </View>

        <View style={{ marginTop: 12 }}>
          <HexInput
            value={hexBg}
            onChange={onBgHex}
            onConfirm={onBgSwatch}
            error={bgErr}
            COLORS={COLORS}
          />
        </View>

        <View style={{ height: 110 }} />
      </ScrollView>

      {/* ── Sticky footer ── */}
      <View style={[s.footer, { backgroundColor: COLORS.background, borderTopColor: COLORS.border }]}>
        {hasAnyCustom && (
          <TouchableOpacity
            style={[s.resetBtn, { borderColor: COLORS.border, backgroundColor: COLORS.card }]}
            onPress={handleReset}
            activeOpacity={0.75}
          >
            <Ionicons name="refresh-outline" size={16} color={COLORS.textSecondary} />
            <Text style={[s.resetTxt, { color: COLORS.textSecondary }]}>Reset</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity
          style={[
            s.applyBtn,
            { backgroundColor: previewAccent },
            !hasAnyCustom && !hasChanges && { opacity: 0.7 },
          ]}
          onPress={handleApply}
          activeOpacity={0.85}
        >
          <Ionicons name="color-palette-outline" size={18} color={contrastText(previewAccent)} />
          <Text style={[s.applyTxt, { color: contrastText(previewAccent) }]}>Apply Theme</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  container: { flex: 1 },

  header: {
    flexDirection: "row", alignItems: "center", gap: 12,
    paddingBottom: 14, paddingHorizontal: H_PAD,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: { width: 36, height: 36, borderRadius: 18, justifyContent: "center", alignItems: "center" },
  title:      { fontSize: 20, fontWeight: "800", letterSpacing: -0.4 },
  subtitle:   { fontSize: 12, marginTop: 2 },
  dotRow:     { flexDirection: "row", gap: 6 },
  dot:        { width: 26, height: 26, borderRadius: 13, borderWidth: 2 },

  scroll: { padding: H_PAD },

  sectionDesc: { fontSize: 11, lineHeight: 16, marginBottom: 14, marginTop: -6 },

  swatchGrid: { flexDirection: "row", flexWrap: "wrap", gap: SWATCH_GAP },

  footer: {
    position: "absolute", bottom: 0, left: 0, right: 0,
    flexDirection: "row", gap: 10,
    paddingHorizontal: H_PAD, paddingTop: 12,
    paddingBottom: Platform.OS === "ios" ? 36 : 20,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  resetBtn: {
    flexDirection: "row", alignItems: "center", gap: 6,
    paddingVertical: 13, paddingHorizontal: 16,
    borderRadius: 14, borderWidth: 1,
  },
  resetTxt:  { fontSize: 14, fontWeight: "600" },
  applyBtn: {
    flex: 1, flexDirection: "row", alignItems: "center",
    justifyContent: "center", gap: 8,
    paddingVertical: 14, borderRadius: 14,
  },
  applyTxt: { fontSize: 15, fontWeight: "800", letterSpacing: -0.2 },
});

export default AccentColorScreen;
