import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Image,
  FlatList,
  Animated,
} from "react-native";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useTheme } from "../../contexts/ThemeContext";

// ─── Static data ──────────────────────────────────────────────────────────────

const CATEGORIES = [
  { id: "defi", label: "DeFi", icon: "swap-horizontal-outline" },
  { id: "bridge", label: "Bridge", icon: "git-branch-outline" },
  { id: "nft", label: "NFTs", icon: "image-outline" },
  { id: "explore", label: "Explore", icon: "compass-outline" },
  { id: "earn", label: "Earn", icon: "trending-up-outline" },
  { id: "tools", label: "Tools", icon: "construct-outline" },
];

const ECOSYSTEM_LINKS = [
  {
    id: "uniswap",
    name: "Uniswap",
    url: "https://app.uniswap.org",
    favicon: "https://app.uniswap.org/favicon.ico",
    category: "defi",
    description: "Swap any token",
  },
  {
    id: "bridge",
    name: "Jumper",
    url: "https://jumper.exchange",
    favicon: "https://jumper.exchange/favicon.ico",
    category: "bridge",
    description: "Bridge any chain (LI.FI)",
  },
  {
    id: "merkly",
    name: "Merkly",
    url: "https://minter.merkly.com/gas",
    favicon: "https://minter.merkly.com/favicon.ico",
    category: "tools",
    description: "Gas refuel",
  },
  {
    id: "explorer",
    name: "Explorer",
    url: "https://etherscan.io",
    favicon: "https://etherscan.io/favicon.ico",
    category: "explore",
    description: "Block explorer",
  },
  {
    id: "aave",
    name: "Aave",
    url: "https://app.aave.com",
    favicon: "https://app.aave.com/favicon.ico",
    category: "earn",
    description: "Lend & borrow",
  },
  {
    id: "opensea",
    name: "OpenSea",
    url: "https://opensea.io",
    favicon: "https://opensea.io/favicon.ico",
    category: "nft",
    description: "NFT marketplace",
  },
];

const BRIDGE_HUB = [
  {
    id: "jumper-bridge",
    name: "Jumper",
    url: "https://jumper.exchange",
    favicon: "https://jumper.exchange/favicon.ico",
    description: "Bridge any chain (LI.FI)",
    icon: "swap-horizontal-outline",
  },
  {
    id: "arc-explorer",
    name: "Arc Explorer",
    url: "https://arc.etherscan.io",
    favicon: "https://arc.etherscan.io/favicon.ico",
    description: "Arc block explorer",
    icon: "search-outline",
  },
  {
    id: "robinhood-explorer",
    name: "Robinhood Chain",
    url: "https://robinhoodchain.blockscout.com",
    favicon: "https://robinhoodchain.blockscout.com/favicon.ico",
    description: "Robinhood Chain explorer",
    icon: "search-outline",
  },
  {
    id: "merkly-refuel",
    name: "Refuel",
    url: "https://minter.merkly.com/gas",
    favicon: "https://minter.merkly.com/favicon.ico",
    description: "Top up gas",
    icon: "flash-outline",
  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

const truncateUrl = (url = "") =>
  url.replace(/^https?:\/\/(www\.)?/, "").split("/")[0];

const fmtPrice = (p) => {
  if (!p && p !== 0) return "—";
  return p >= 1
    ? `$${p.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : `$${p.toFixed(6)}`;
};

// ─── Sub-components ───────────────────────────────────────────────────────────

const Favicon = ({ uri, name, size = 28, bg = "#1c1b19" }) => {
  const [err, setErr] = useState(false);
  if (!uri || err) {
    return (
      <View
        style={{
          width: size,
          height: size,
          borderRadius: 8,
          backgroundColor: bg,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Text
          style={{ fontSize: size * 0.45, fontWeight: "700", color: "#F7C84A" }}
        >
          {name?.charAt(0) ?? "?"}
        </Text>
      </View>
    );
  }
  return (
    <Image
      source={{ uri, cache: "force-cache" }}
      style={{ width: size, height: size, borderRadius: 8 }}
      onError={() => setErr(true)}
      fadeDuration={0}
    />
  );
};

const SectionHeader = ({ label, onSeeAll, COLORS, FONTS, SPACING }) => (
  <View
    style={{
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: SPACING.md,
      marginBottom: 10,
    }}
  >
    <Text
      style={{
        fontSize: FONTS.sizes.sm,
        fontWeight: "700",
        color: COLORS.text,
        letterSpacing: 0.2,
      }}
    >
      {label}
    </Text>
    {onSeeAll && (
      <TouchableOpacity
        onPress={onSeeAll}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Text
          style={{
            fontSize: FONTS.sizes.xs,
            color: COLORS.primary,
            fontWeight: "600",
          }}
        >
          See all
        </Text>
      </TouchableOpacity>
    )}
  </View>
);

// ─── Bridge Hub card — uses app theme exclusively ─────────────────────────────

const BridgeHubCard = ({ item, onPress, COLORS }) => {
  const [err, setErr] = useState(false);
  const scale = useRef(new Animated.Value(1)).current;

  const onPressIn = () =>
    Animated.spring(scale, {
      toValue: 0.95,
      useNativeDriver: true,
      speed: 30,
    }).start();
  const onPressOut = () =>
    Animated.spring(scale, {
      toValue: 1,
      useNativeDriver: true,
      speed: 30,
    }).start();

  return (
    <TouchableOpacity
      onPress={() => onPress(item.url)}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      activeOpacity={1}
    >
      <Animated.View
        style={[
          mh.card,
          {
            backgroundColor: COLORS.card,
            borderColor: COLORS.border,
            shadowColor: "#000",
          },
          { transform: [{ scale }] },
        ]}
      >
        {/* Thin primary accent line at top — same pattern as other cards in the app */}
        <View style={[mh.accentBar, { backgroundColor: COLORS.primary }]} />

        <View style={mh.body}>
          {/* Favicon + Bridge badge */}
          <View style={mh.topRow}>
            <View style={[mh.faviconWrap, { backgroundColor: COLORS.surface }]}>
              {item.favicon && !err ? (
                <Image
                  source={{ uri: item.favicon, cache: "force-cache" }}
                  style={mh.faviconImg}
                  onError={() => setErr(true)}
                  fadeDuration={0}
                />
              ) : (
                <Ionicons name={item.icon} size={18} color={COLORS.primary} />
              )}
            </View>
            <View
              style={[
                mh.badge,
                {
                  backgroundColor: COLORS.primary + "18",
                  borderColor: COLORS.primary + "33",
                },
              ]}
            >
              <Text style={[mh.badgeText, { color: COLORS.primary }]}>
                Bridge
              </Text>
            </View>
          </View>

          <Text style={[mh.name, { color: COLORS.text }]} numberOfLines={1}>
            {item.name}
          </Text>
          <Text
            style={[mh.desc, { color: COLORS.textSecondary }]}
            numberOfLines={1}
          >
            {item.description}
          </Text>

          <View style={mh.arrowRow}>
            <Ionicons name="arrow-forward" size={12} color={COLORS.primary} />
          </View>
        </View>
      </Animated.View>
    </TouchableOpacity>
  );
};

// ─── Main component ───────────────────────────────────────────────────────────

const BrowserHome = ({
  navigation,
  wallet,
  address,
  activeChain,
  inputUrl,
  setInputUrl,
  handleNavigate,
  handleUrlSubmit,
  onChainPress,
  recentPages = [],
}) => {
  const { COLORS, SPACING, FONTS } = useTheme();

  const [activeCategory, setActiveCategory] = useState("defi");
  const [trendingCoins, setTrendingCoins] = useState([]);
  const [topGainers, setTopGainers] = useState([]);
  const [loadingCoins, setLoadingCoins] = useState(true);
  const [searchFocused, setSearchFocused] = useState(false);

  const scrollY = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    fetchCryptoData();
    [...ECOSYSTEM_LINKS, ...BRIDGE_HUB].forEach(
      (l) => l.favicon && Image.prefetch(l.favicon).catch(() => {}),
    );
  }, []);

  const fetchCryptoData = useCallback(async () => {
    setLoadingCoins(true);
    try {
      const [trendRes, gainRes] = await Promise.all([
        fetch("https://api.coingecko.com/api/v3/search/trending"),
        fetch(
          "https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=100&page=1&sparkline=false&price_change_percentage=24h",
        ),
      ]);
      const [trendData, gainData] = await Promise.all([
        trendRes.json(),
        gainRes.json(),
      ]);
      setTrendingCoins(trendData.coins?.slice(0, 8) ?? []);
      setTopGainers(
        gainData
          .filter((c) => c.price_change_percentage_24h > 0)
          .sort(
            (a, b) =>
              b.price_change_percentage_24h - a.price_change_percentage_24h,
          )
          .slice(0, 8),
      );
    } catch (e) {
      console.error("[BrowserHome] fetchCryptoData:", e.message);
    } finally {
      setLoadingCoins(false);
    }
  }, []);

  const filteredLinks = ECOSYSTEM_LINKS.filter(
    (l) => l.category === activeCategory,
  );

  // ── Render helpers ──────────────────────────────────────────────────────────

  const renderRecentPage = ({ item }) => (
    <TouchableOpacity
      onPress={() => handleNavigate(item.url)}
      activeOpacity={0.75}
      style={[
        rs.card,
        { backgroundColor: COLORS.card, borderColor: COLORS.border },
      ]}
    >
      <Favicon
        uri={item.favicon}
        name={item.title}
        size={26}
        bg={COLORS.surface}
      />
      <Text style={[rs.domain, { color: COLORS.text }]} numberOfLines={1}>
        {truncateUrl(item.url)}
      </Text>
      <Text
        style={[rs.title, { color: COLORS.textSecondary }]}
        numberOfLines={1}
      >
        {item.title || "Untitled"}
      </Text>
    </TouchableOpacity>
  );

  const renderCategory = ({ item }) => {
    const active = item.id === activeCategory;
    return (
      <TouchableOpacity
        onPress={() => setActiveCategory(item.id)}
        activeOpacity={0.75}
        style={[
          cs.pill,
          {
            backgroundColor: active ? COLORS.primary : COLORS.card,
            borderColor: active ? COLORS.primary : COLORS.border,
          },
        ]}
      >
        <Ionicons
          name={item.icon}
          size={13}
          color={active ? COLORS.background : COLORS.textSecondary}
        />
        <Text
          style={[
            cs.label,
            { color: active ? COLORS.background : COLORS.textSecondary },
          ]}
        >
          {item.label}
        </Text>
      </TouchableOpacity>
    );
  };

  const renderDapp = ({ item }) => (
    <TouchableOpacity
      onPress={() => handleNavigate(item.url)}
      activeOpacity={0.75}
      style={[
        ds.card,
        { backgroundColor: COLORS.card, borderColor: COLORS.border },
      ]}
    >
      <Favicon
        uri={item.favicon}
        name={item.name}
        size={32}
        bg={COLORS.surface}
      />
      <Text style={[ds.name, { color: COLORS.text }]} numberOfLines={1}>
        {item.name}
      </Text>
      <Text
        style={[ds.desc, { color: COLORS.textSecondary }]}
        numberOfLines={1}
      >
        {item.description}
      </Text>
    </TouchableOpacity>
  );

  const renderCoin = ({ item, isTrending }) => {
    const d = isTrending ? item.item : item;
    const change = isTrending
      ? d.data?.price_change_percentage_24h?.usd
      : d.price_change_percentage_24h;
    const price = isTrending ? d.data?.price : d.current_price;
    const imgUri = isTrending ? d.large : d.image;
    const positive = (change ?? 0) >= 0;
    return (
      <TouchableOpacity
        onPress={() =>
          handleNavigate(`https://www.coingecko.com/en/coins/${d.id}`)
        }
        activeOpacity={0.75}
        style={[
          tk.card,
          { backgroundColor: COLORS.card, borderColor: COLORS.border },
        ]}
      >
        <Image
          source={{ uri: imgUri, cache: "force-cache" }}
          style={tk.img}
          fadeDuration={0}
        />
        <Text style={[tk.symbol, { color: COLORS.text }]}>
          {d.symbol?.toUpperCase()}
        </Text>
        <Text
          style={[tk.name, { color: COLORS.textSecondary }]}
          numberOfLines={1}
        >
          {d.name}
        </Text>
        {price != null && (
          <Text style={[tk.price, { color: COLORS.text }]}>
            {fmtPrice(price)}
          </Text>
        )}
        {change != null && (
          <View
            style={[
              tk.badge,
              {
                backgroundColor: positive
                  ? COLORS.success + "18"
                  : COLORS.error + "18",
              },
            ]}
          >
            <Ionicons
              name={positive ? "arrow-up" : "arrow-down"}
              size={9}
              color={positive ? COLORS.success : COLORS.error}
            />
            <Text
              style={[
                tk.change,
                { color: positive ? COLORS.success : COLORS.error },
              ]}
            >
              {Math.abs(change).toFixed(2)}%
            </Text>
          </View>
        )}
      </TouchableOpacity>
    );
  };

  // ── Layout ──────────────────────────────────────────────────────────────────
  return (
    <View style={{ flex: 1, backgroundColor: COLORS.background }}>
      {/* ── Fixed header ── */}
      <Animated.View
        style={[
          hd.wrap,
          {
            backgroundColor: COLORS.background,
            borderBottomColor: COLORS.border,
            borderBottomWidth: StyleSheet.hairlineWidth,
          },
        ]}
      >
        <View style={hd.titleRow}>
          <Text style={[hd.title, { color: COLORS.text }]}>Discover</Text>
          <TouchableOpacity
            onPress={onChainPress}
            activeOpacity={0.8}
            style={[
              hd.chainPill,
              { backgroundColor: COLORS.card, borderColor: COLORS.border },
            ]}
          >
            {activeChain?.icon ? (
              <Image
                source={{ uri: activeChain.icon, cache: "force-cache" }}
                style={hd.chainIcon}
                fadeDuration={0}
              />
            ) : (
              <View
                style={[
                  hd.chainIcon,
                  { backgroundColor: COLORS.primaryMuted, borderRadius: 8 },
                ]}
              />
            )}
            <Text style={[hd.chainName, { color: COLORS.text }]}>
              {activeChain?.name}
            </Text>
            <Ionicons
              name="chevron-down"
              size={11}
              color={COLORS.textSecondary}
            />
          </TouchableOpacity>
        </View>

        <View
          style={[
            hd.urlBar,
            {
              backgroundColor: COLORS.card,
              borderColor: searchFocused ? COLORS.primary : COLORS.border,
            },
          ]}
        >
          <Ionicons
            name={searchFocused ? "search" : "globe-outline"}
            size={14}
            color={searchFocused ? COLORS.primary : COLORS.textSecondary}
          />
          <TextInput
            style={[hd.urlInput, { color: COLORS.text }]}
            value={inputUrl}
            onChangeText={setInputUrl}
            onSubmitEditing={handleUrlSubmit}
            onFocus={() => setSearchFocused(true)}
            onBlur={() => setSearchFocused(false)}
            placeholder="Search or enter URL..."
            placeholderTextColor={COLORS.textSecondary}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="go"
          />
          {inputUrl.length > 0 && (
            <TouchableOpacity
              onPress={() => setInputUrl("")}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons
                name="close-circle"
                size={15}
                color={COLORS.textSecondary}
              />
            </TouchableOpacity>
          )}
        </View>
      </Animated.View>

      {/* ── Scrollable body ── */}
      <Animated.ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 40 }}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { y: scrollY } } }],
          { useNativeDriver: false },
        )}
        scrollEventThrottle={16}
      >
        {/* ── Wallet strip ── */}
        {wallet ? (
          <View
            style={[
              ws.strip,
              {
                backgroundColor: COLORS.success + "12",
                borderColor: COLORS.success + "30",
              },
            ]}
          >
            <View style={[ws.dot, { backgroundColor: COLORS.success }]} />
            <Text style={[ws.addr, { color: COLORS.success }]}>
              {address?.slice(0, 6)}…{address?.slice(-4)}
            </Text>
            <Text style={[ws.label, { color: COLORS.success + "90" }]}>
              Connected
            </Text>
          </View>
        ) : (
          <TouchableOpacity
            onPress={() => navigation.navigate("CreateWallet")}
            style={[
              ws.strip,
              {
                backgroundColor: COLORS.primaryMuted,
                borderColor: COLORS.border,
              },
            ]}
          >
            <Ionicons
              name="wallet-outline"
              size={13}
              color={COLORS.primaryDark}
            />
            <Text
              style={[
                ws.label,
                { color: COLORS.primaryDark, fontWeight: "600" },
              ]}
            >
              Create a wallet to interact with dApps
            </Text>
            <Ionicons
              name="chevron-forward"
              size={13}
              color={COLORS.primaryDark}
            />
          </TouchableOpacity>
        )}

        {/* ── Recent pages ── */}
        {recentPages.length > 0 && (
          <View style={sect.wrap}>
            <SectionHeader
              label="Recently Visited"
              COLORS={COLORS}
              FONTS={FONTS}
              SPACING={SPACING}
            />
            <FlatList
              data={recentPages}
              renderItem={renderRecentPage}
              keyExtractor={(item) => item.url}
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ paddingHorizontal: SPACING.md, gap: 10 }}
            />
          </View>
        )}

        {/* ── Bridge Hub — horizontal scroll, themed cards ── */}
        <View style={sect.wrap}>
          <SectionHeader
            label="⬡  Bridge Hub"
            COLORS={COLORS}
            FONTS={FONTS}
            SPACING={SPACING}
          />
          <FlatList
            data={BRIDGE_HUB}
            renderItem={({ item }) => (
              <BridgeHubCard
                item={item}
                onPress={handleNavigate}
                COLORS={COLORS}
              />
            )}
            keyExtractor={(item) => item.id}
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: SPACING.md, gap: 10 }}
          />
        </View>

        {/* ── Explore / Category dapps ── */}
        <View style={sect.wrap}>
          <SectionHeader
            label="Explore"
            COLORS={COLORS}
            FONTS={FONTS}
            SPACING={SPACING}
          />
          <FlatList
            data={CATEGORIES}
            renderItem={renderCategory}
            keyExtractor={(item) => item.id}
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: SPACING.md, gap: 8 }}
            style={{ marginBottom: 12 }}
          />
          {filteredLinks.length > 0 ? (
            <FlatList
              data={filteredLinks}
              renderItem={renderDapp}
              keyExtractor={(item) => item.id}
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ paddingHorizontal: SPACING.md, gap: 10 }}
            />
          ) : (
            <View style={{ paddingHorizontal: SPACING.md }}>
              <Text
                style={{ fontSize: FONTS.sizes.xs, color: COLORS.textTertiary }}
              >
                No apps in this category yet.
              </Text>
            </View>
          )}
        </View>

        {/* ── Trending ── */}
        <View style={sect.wrap}>
          <SectionHeader
            label="🔥 Trending"
            onSeeAll={fetchCryptoData}
            COLORS={COLORS}
            FONTS={FONTS}
            SPACING={SPACING}
          />
          {loadingCoins ? (
            <View
              style={{ paddingVertical: 20, paddingHorizontal: SPACING.md }}
            >
              <ActivityIndicator size="small" color={COLORS.primary} />
            </View>
          ) : (
            <FlatList
              data={trendingCoins}
              renderItem={({ item }) => renderCoin({ item, isTrending: true })}
              keyExtractor={(item) => item.item?.id ?? Math.random().toString()}
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ paddingHorizontal: SPACING.md, gap: 10 }}
            />
          )}
        </View>

        {/* ── Top Gainers ── */}
        <View style={sect.wrap}>
          <SectionHeader
            label="📈 Top Gainers (24h)"
            COLORS={COLORS}
            FONTS={FONTS}
            SPACING={SPACING}
          />
          {loadingCoins ? (
            <View
              style={{ paddingVertical: 20, paddingHorizontal: SPACING.md }}
            >
              <ActivityIndicator size="small" color={COLORS.primary} />
            </View>
          ) : (
            <FlatList
              data={topGainers}
              renderItem={({ item }) => renderCoin({ item, isTrending: false })}
              keyExtractor={(item) => item.id}
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ paddingHorizontal: SPACING.md, gap: 10 }}
            />
          )}
        </View>

        {/* ── Footer ── */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            paddingTop: 16,
            gap: 5,
          }}
        >
          <MaterialCommunityIcons
            name="shield-check-outline"
            size={12}
            color="#666"
          />
          <Text style={{ fontSize: 10, color: "#666", letterSpacing: 0.3 }}>
            Non-custodial · Stay safe
          </Text>
        </View>
      </Animated.ScrollView>
    </View>
  );
};

// ─── Style blocks ─────────────────────────────────────────────────────────────

const hd = StyleSheet.create({
  wrap: { paddingTop: 12, paddingBottom: 10, paddingHorizontal: 16, gap: 10 },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  title: { fontSize: 22, fontWeight: "800", letterSpacing: -0.5 },
  chainPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 999,
    borderWidth: 1,
  },
  chainIcon: { width: 16, height: 16, borderRadius: 8 },
  chainName: { fontSize: 12, fontWeight: "600" },
  urlBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  urlInput: { flex: 1, fontSize: 13, padding: 0 },
});

const ws = StyleSheet.create({
  strip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginHorizontal: 16,
    marginTop: 6,
    marginBottom: 4,
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
  },
  dot: { width: 6, height: 6, borderRadius: 3 },
  addr: { fontSize: 11, fontWeight: "700", fontFamily: "monospace", flex: 1 },
  label: { fontSize: 11, fontWeight: "500" },
});

const sect = StyleSheet.create({
  wrap: { marginTop: 20 },
});

const rs = StyleSheet.create({
  card: { width: 110, padding: 10, borderRadius: 10, borderWidth: 1, gap: 5 },
  domain: { fontSize: 11, fontWeight: "700", letterSpacing: 0.1 },
  title: { fontSize: 10, lineHeight: 14 },
});

const cs = StyleSheet.create({
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingVertical: 6,
    paddingHorizontal: 11,
    borderRadius: 999,
    borderWidth: 1,
  },
  label: { fontSize: 12, fontWeight: "600" },
});

const ds = StyleSheet.create({
  card: {
    width: 100,
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: "center",
    gap: 6,
  },
  name: { fontSize: 11, fontWeight: "700", textAlign: "center" },
  desc: { fontSize: 10, textAlign: "center", lineHeight: 13 },
});

const tk = StyleSheet.create({
  card: { width: 108, padding: 10, borderRadius: 10, borderWidth: 1, gap: 3 },
  img: { width: 30, height: 30, borderRadius: 15, marginBottom: 2 },
  symbol: { fontSize: 12, fontWeight: "800", letterSpacing: 0.2 },
  name: { fontSize: 10, lineHeight: 13 },
  price: { fontSize: 11, fontWeight: "700", marginTop: 3 },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 4,
    alignSelf: "flex-start",
    marginTop: 1,
  },
  change: { fontSize: 10, fontWeight: "700" },
});

const mh = StyleSheet.create({
  card: {
    width: 130,
    borderRadius: 14,
    borderWidth: 1,
    overflow: "hidden",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  accentBar: {
    height: 2,
    opacity: 0.55,
  },
  body: {
    padding: 12,
    gap: 4,
  },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  faviconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  faviconImg: {
    width: 36,
    height: 36,
    borderRadius: 10,
  },
  badge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
  },
  badgeText: {
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 0.3,
  },
  name: {
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: 0.1,
  },
  desc: {
    fontSize: 11,
    lineHeight: 15,
  },
  arrowRow: {
    alignSelf: "flex-end",
    marginTop: 6,
  },
});

export default BrowserHome;
