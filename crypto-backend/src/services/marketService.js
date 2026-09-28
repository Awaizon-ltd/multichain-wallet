// services/marketService.js
// ─────────────────────────────────────────────────────────────────────────────
// Market data (trending lists, coin details, price charts) sourced from
// CoinGecko and cached here, so every wallet reads one shared copy instead of
// each device hitting CoinGecko itself (and getting rate-limited).
//
//   • All upstream calls go through one serialized queue with spacing, so a
//     burst of cache misses can't trip CoinGecko's per-minute limit.
//   • Cache entries are served stale when a refresh fails — a CoinGecko 429
//     degrades to "slightly old prices", never to an empty screen.
//   • Trending is refreshed on a timer, so client requests always hit a warm
//     cache and never wait on 8 sequential upstream calls.
//
// Optional env: COINGECKO_API_KEY (+ COINGECKO_API_PLAN=pro for pro keys;
// default is a free "demo" key). Works without a key on the public tier.
// ─────────────────────────────────────────────────────────────────────────────
"use strict";

const axios = require("axios");

const API_KEY = process.env.COINGECKO_API_KEY || "";
const IS_PRO = API_KEY && process.env.COINGECKO_API_PLAN === "pro";
const BASE_URL = IS_PRO
  ? "https://pro-api.coingecko.com/api/v3"
  : "https://api.coingecko.com/api/v3";
const KEY_HEADER = IS_PRO ? "x-cg-pro-api-key" : "x-cg-demo-api-key";

// The keyless public tier allows only ~5-10 calls/min; a demo key allows 30.
const MIN_GAP_MS = API_KEY ? 2100 : 7000;

const MIN = 60 * 1000;
const HOUR = 60 * MIN;
// Each trending rebuild costs ~9 upstream calls. 15 min keeps a free demo
// key comfortably inside its monthly quota; override with MARKET_REFRESH_MINUTES.
const TRENDING_REFRESH_MS =
  Math.max(5, parseInt(process.env.MARKET_REFRESH_MINUTES) || 15) * MIN;
const TTL = {
  TRENDING: TRENDING_REFRESH_MS + 5 * MIN,
  COIN: 5 * MIN,
  CHART: { 1: 5 * MIN, 7: 15 * MIN, 30: HOUR, 90: HOUR, 365: 6 * HOUR },
  COINS_LIST: 24 * HOUR,
  STABLECOINS: 24 * HOUR,
  RESOLVE: 24 * HOUR,
};
// How long stale data may still be served when upstream keeps failing
const MAX_STALE_MS = 48 * HOUR;

// CoinGecko asset-platform id → our chainId (only chains the wallet supports)
const PLATFORM_TO_CHAIN = {
  ethereum: 1,
  "binance-smart-chain": 56,
  "polygon-pos": 137,
  "arbitrum-one": 42161,
  base: 8453,
  avalanche: 43114,
  arc: 5042,
  robinhood: 4663,
};
const CHAIN_TO_PLATFORM = Object.fromEntries(
  Object.entries(PLATFORM_TO_CHAIN).map(([p, c]) => [c, p]),
);

// Gas tokens have no contract address, so CoinGecko lists no platform for them
const NATIVE_COINS = {
  ethereum: [1, 8453, 42161, 4663],
  binancecoin: [56],
  "avalanche-2": [43114],
  "polygon-ecosystem-token": [137],
  "usd-coin": [5042],
};
const NATIVE_BY_CHAIN = {};
for (const [id, chains] of Object.entries(NATIVE_COINS)) {
  chains.forEach((c) => (NATIVE_BY_CHAIN[c] = id));
}

// Trending tabs. Order here is the order the app renders them in.
const TABS = [
  { key: "all", label: "All" },
  { key: "arc", label: "Arc", category: "arc-ecosystem", chainId: 5042 },
  {
    key: "robinhood",
    label: "Robinhood",
    category: "robinhood-ecosystem",
    chainId: 4663,
  },
  { key: "base", label: "Base", category: "base-ecosystem", chainId: 8453 },
  { key: "bnb", label: "BNB", category: "binance-smart-chain", chainId: 56 },
  { key: "meme", label: "Meme", category: "meme-token" },
  { key: "rwa", label: "RWA", category: "real-world-assets-rwa" },
];
const PER_TAB = 4;
const ALL_TRENDING = 5;
const ALL_RWA = 5;

// Filters that keep "trending" meaningful: stablecoins, wrapped/bridged
// copies and dust-cap tokens dominate raw volume rankings otherwise.
const MIN_VOLUME_USD = 50_000;
const MIN_MARKET_CAP_USD = 1_000_000;
const MAX_ABS_CHANGE_PCT = 500;
const WRAPPED_ID = /(^|-)(wrapped|bridged|staked)(-|$)|-bridged-|^l2-standard/;
const WRAPPED_SYMBOLS = new Set([
  "weth", "wbtc", "wbnb", "wavax", "wpol", "wmatic", "cbbtc", "cirbtc",
  "steth", "wsteth", "reth", "cbeth", "weeth",
]);
// Symbols of major stablecoins — also catches impostor tokens reusing them
const STABLE_SYMBOLS = new Set([
  "usdc", "usdt", "dai", "usde", "usdg", "usd1", "pyusd", "fdusd", "tusd",
  "usds", "usdb", "eurc", "bsc-usd", "rlusd", "gho", "frax", "lusd", "crvusd",
  "u",
]);

// ─── Upstream client ─────────────────────────────────────────────────────────

// Two-lane scheduler: interactive requests (a user opening a token) always
// go before background work (trending rebuilds), and every call is spaced
// MIN_GAP_MS apart. After a 429 the whole queue pauses for the cool-down.
const lanes = { high: [], low: [] };
let nextSlotAt = 0;
let draining = false;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const drain = async () => {
  if (draining) return;
  draining = true;
  try {
    while (lanes.high.length || lanes.low.length) {
      const wait = nextSlotAt - Date.now();
      if (wait > 0) await sleep(wait);
      const job = lanes.high.shift() || lanes.low.shift();
      nextSlotAt = Date.now() + MIN_GAP_MS;
      try {
        const res = await axios.get(`${BASE_URL}${job.path}`, {
          params: job.params,
          timeout: 20_000,
          headers: API_KEY ? { [KEY_HEADER]: API_KEY } : {},
        });
        job.resolve(res.data);
      } catch (err) {
        if (err.response?.status === 429) {
          const retryAfter = parseInt(err.response.headers?.["retry-after"]);
          nextSlotAt = Date.now() + (retryAfter > 0 ? retryAfter * 1000 : 60_000);
          if (job.retries > 0) {
            // Background work waits out the cool-down; interactive calls
            // fail fast so the caller can fall back to stale data.
            job.retries -= 1;
            lanes.low.unshift(job);
            continue;
          }
        }
        job.reject(err);
      }
    }
  } finally {
    draining = false;
  }
};

/**
 * Queued GET against CoinGecko.
 * @param {"high"|"low"} [priority] high = a user is waiting on it
 */
const cgGet = (path, params = {}, priority = "high") =>
  new Promise((resolve, reject) => {
    lanes[priority].push({
      path,
      params,
      resolve,
      reject,
      retries: priority === "low" ? 2 : 0,
    });
    drain();
  });

// ─── Cache (in-flight dedupe + stale-on-error) ───────────────────────────────

const cache = new Map(); // key → { value, ts }
const inflight = new Map(); // key → Promise

const cached = async (key, ttl, fetcher, { force = false } = {}) => {
  const hit = cache.get(key);
  if (!force && hit && Date.now() - hit.ts < ttl) return hit.value;
  if (inflight.has(key)) return inflight.get(key);

  const p = (async () => {
    try {
      const value = await fetcher();
      cache.set(key, { value, ts: Date.now() });
      return value;
    } catch (err) {
      if (hit && Date.now() - hit.ts < MAX_STALE_MS) {
        console.warn(`[market] ${key} refresh failed, serving stale:`, err.message);
        return hit.value;
      }
      throw err;
    } finally {
      inflight.delete(key);
    }
  })();
  inflight.set(key, p);
  return p;
};

const cachedAt = (key) => cache.get(key)?.ts ?? null;

// ─── Reference data ──────────────────────────────────────────────────────────

/** id → [{ chainId, address }] and "chainId:address" → id, for supported chains. */
const getPlatformIndex = (priority) =>
  cached("coins-list", TTL.COINS_LIST, async () => {
    const list = await cgGet("/coins/list", { include_platform: true }, priority);
    const byId = new Map();
    const byAddress = new Map();
    for (const coin of list) {
      const chains = [];
      for (const [platform, address] of Object.entries(coin.platforms || {})) {
        const chainId = PLATFORM_TO_CHAIN[platform];
        if (!chainId || !address) continue;
        chains.push({ chainId, address });
        const k = `${chainId}:${address.toLowerCase()}`;
        if (!byAddress.has(k)) byAddress.set(k, coin.id);
      }
      if (chains.length) byId.set(coin.id, chains);
    }
    return { byId, byAddress };
  });

const getStablecoinIds = () =>
  cached("stablecoins", TTL.STABLECOINS, async () => {
    const rows = await cgGet(
      "/coins/markets",
      {
        vs_currency: "usd",
        category: "stablecoins",
        order: "market_cap_desc",
        per_page: 250,
        page: 1,
      },
      "low",
    );
    return new Set(rows.map((r) => r.id));
  });

/** Supported chains a coin can be swapped on, natives first. */
const chainsFor = (id, index) => {
  const natives = (NATIVE_COINS[id] || []).map((chainId) => ({
    chainId,
    address: null,
    isNative: true,
  }));
  const tokens = (index?.byId.get(id) || []).filter(
    (c) => !natives.some((n) => n.chainId === c.chainId),
  );
  return [...natives, ...tokens];
};

// ─── Trending ────────────────────────────────────────────────────────────────

/** Downsample a series to at most n points, always keeping the last one. */
const downsample = (arr, n) => {
  if (!Array.isArray(arr) || arr.length <= n) return arr || [];
  const step = (arr.length - 1) / (n - 1);
  return Array.from({ length: n }, (_, i) => arr[Math.round(i * step)]);
};

const isListable = (c, stableIds) => {
  const sym = (c.symbol || "").toLowerCase();
  if (stableIds.has(c.id) || STABLE_SYMBOLS.has(sym)) return false;
  if (WRAPPED_ID.test(c.id) || WRAPPED_SYMBOLS.has(sym)) return false;
  if (!c.current_price || (c.total_volume || 0) < MIN_VOLUME_USD) return false;
  // market_cap is 0 when CoinGecko can't verify supply — allow on volume alone
  if (c.market_cap && c.market_cap < MIN_MARKET_CAP_USD) return false;
  // +29,000% in a day is a fresh launch / thin-liquidity artifact, not a trend
  if (Math.abs(c.price_change_percentage_24h || 0) > MAX_ABS_CHANGE_PCT) return false;
  return true;
};

const toToken = (c, index, extra = {}) => ({
  id: c.id,
  symbol: (c.symbol || "").toUpperCase(),
  name: c.name,
  image: c.image,
  price: c.current_price,
  change24h: c.price_change_percentage_24h ?? null,
  marketCap: c.market_cap || null,
  volume24h: c.total_volume || null,
  rank: c.market_cap_rank ?? null,
  sparkline: downsample(c.sparkline_in_7d?.price, 32),
  chains: chainsFor(c.id, index),
  ...extra,
});

// Only trending uses this, so it always runs in the background lane
const fetchMarkets = (params) =>
  cgGet(
    "/coins/markets",
    {
      vs_currency: "usd",
      order: "volume_desc",
      per_page: 50,
      page: 1,
      sparkline: true,
      price_change_percentage: "24h",
      ...params,
    },
    "low",
  );

const pick = (rows, stableIds, n, exclude = new Set()) => {
  const out = [];
  for (const r of rows) {
    if (out.length >= n) break;
    if (exclude.has(r.id) || !isListable(r, stableIds)) continue;
    out.push(r);
  }
  return out;
};

const buildTrending = async () => {
  // Reference data first — both are cached for a day, so usually free
  const [stableIds, index] = await Promise.all([
    getStablecoinIds().catch(() => new Set()),
    getPlatformIndex("low").catch(() => null),
  ]);
  // A tab whose upstream call fails keeps its last good tokens instead of
  // going blank — a 429 on one category shouldn't empty that tab in the app.
  const previous = cache.get("trending")?.value;
  const previousTokens = (key) =>
    previous?.tabs.find((t) => t.key === key)?.tokens ?? [];

  const rowsByCategory = {};
  for (const tab of TABS) {
    if (!tab.category) continue;
    try {
      rowsByCategory[tab.key] = await fetchMarkets({ category: tab.category });
    } catch (err) {
      console.warn(`[market] category ${tab.category} failed:`, err.message);
      rowsByCategory[tab.key] = null;
    }
  }

  // "All" = CoinGecko's global trending searches + top RWA
  let trendingRows = null;
  try {
    const trending = await cgGet("/search/trending", {}, "low");
    const ids = (trending.coins || []).map((c) => c.item.id).slice(0, 15);
    const rows = ids.length
      ? await fetchMarkets({ ids: ids.join(","), per_page: 15 })
      : [];
    // keep CoinGecko's trending order, not volume order
    trendingRows = ids
      .map((id) => rows.find((r) => r.id === id))
      .filter(Boolean);
  } catch (err) {
    console.warn("[market] search/trending failed:", err.message);
  }

  // Big multichain tokens (LINK, AAVE…) sit in several ecosystem categories;
  // show each in only the first chain tab that lists it, so every chain tab
  // surfaces that chain's own tokens.
  const usedByChainTabs = new Set();

  const tabs = TABS.map((tab) => {
    const base = { key: tab.key, label: tab.label, chainId: tab.chainId ?? null };

    if (tab.key === "all") {
      if (!trendingRows || !rowsByCategory.rwa) {
        return { ...base, tokens: previousTokens(tab.key) };
      }
      const hot = pick(trendingRows, stableIds, ALL_TRENDING);
      const rwa = pick(
        rowsByCategory.rwa,
        stableIds,
        ALL_RWA,
        new Set(hot.map((r) => r.id)),
      );
      return {
        ...base,
        tokens: [
          ...hot.map((r) => toToken(r, index, { tag: "hot" })),
          ...rwa.map((r) => toToken(r, index, { tag: "rwa" })),
        ],
      };
    }

    const rows = rowsByCategory[tab.key];
    if (!rows) return { ...base, tokens: previousTokens(tab.key) };

    const exclude = tab.chainId ? usedByChainTabs : new Set();
    const picked = pick(rows, stableIds, PER_TAB, exclude);
    if (tab.chainId) picked.forEach((r) => usedByChainTabs.add(r.id));
    return { ...base, tokens: picked.map((r) => toToken(r, index)) };
  });

  // Don't cache a fully empty result (e.g. rate-limited on every call) —
  // throwing lets cached() fall back to the previous good snapshot instead.
  if (!tabs.some((t) => t.tokens.length)) {
    throw new Error("CoinGecko returned no trending data");
  }

  return { tabs, updatedAt: new Date().toISOString() };
};

const getTrending = (opts) =>
  cached("trending", TTL.TRENDING, buildTrending, opts);

// ─── Coin details ────────────────────────────────────────────────────────────

const stripHtml = (s) =>
  (s || "").replace(/<[^>]*>/g, "").replace(/\r\n/g, "\n").trim();

const getCoin = (id) =>
  cached(`coin:${id}`, TTL.COIN, async () => {
    const c = await cgGet(`/coins/${encodeURIComponent(id)}`, {
      localization: false,
      tickers: false,
      community_data: false,
      developer_data: false,
      sparkline: false,
    });
    const m = c.market_data || {};
    const usd = (o) => (o && o.usd != null ? o.usd : null);

    const platforms = [];
    for (const [platform, info] of Object.entries(c.detail_platforms || {})) {
      const chainId = PLATFORM_TO_CHAIN[platform];
      if (!chainId || !info?.contract_address) continue;
      platforms.push({
        chainId,
        address: info.contract_address,
        decimals: info.decimal_place ?? null,
      });
    }
    for (const chainId of NATIVE_COINS[c.id] || []) {
      if (!platforms.some((p) => p.chainId === chainId)) {
        platforms.unshift({ chainId, address: null, decimals: 18, isNative: true });
      }
    }

    return {
      id: c.id,
      symbol: (c.symbol || "").toUpperCase(),
      name: c.name,
      image: c.image?.large || c.image?.small || null,
      categories: (c.categories || []).filter(Boolean).slice(0, 6),
      description: stripHtml(c.description?.en).slice(0, 1500),
      links: {
        homepage: (c.links?.homepage || []).find(Boolean) || null,
        twitter: c.links?.twitter_screen_name
          ? `https://x.com/${c.links.twitter_screen_name}`
          : null,
        explorer: (c.links?.blockchain_site || []).find(Boolean) || null,
      },
      market: {
        price: usd(m.current_price),
        rank: c.market_cap_rank ?? null,
        marketCap: usd(m.market_cap),
        fdv: usd(m.fully_diluted_valuation),
        volume24h: usd(m.total_volume),
        high24h: usd(m.high_24h),
        low24h: usd(m.low_24h),
        change1h: usd(m.price_change_percentage_1h_in_currency),
        change24h: m.price_change_percentage_24h ?? null,
        change7d: m.price_change_percentage_7d ?? null,
        change30d: m.price_change_percentage_30d ?? null,
        change1y: m.price_change_percentage_1y ?? null,
        ath: usd(m.ath),
        athChange: usd(m.ath_change_percentage),
        athDate: usd(m.ath_date),
        circulatingSupply: m.circulating_supply ?? null,
        totalSupply: m.total_supply ?? null,
        maxSupply: m.max_supply ?? null,
      },
      platforms,
      updatedAt: new Date().toISOString(),
    };
  });

// ─── Charts ──────────────────────────────────────────────────────────────────

const CHART_DAYS = [1, 7, 30, 90, 365];

const getChart = (id, days) =>
  cached(`chart:${id}:${days}`, TTL.CHART[days], async () => {
    const data = await cgGet(`/coins/${encodeURIComponent(id)}/market_chart`, {
      vs_currency: "usd",
      days,
    });
    return {
      id,
      days,
      prices: downsample(data.prices || [], 120).map(([t, p]) => [
        Math.round(t),
        p,
      ]),
    };
  });

// ─── Resolve a wallet token to a CoinGecko id ────────────────────────────────

const resolveCoinId = async ({ chainId, address, symbol }) => {
  const cid = parseInt(chainId);
  const addr = (address || "").toLowerCase();
  const isNative =
    !addr ||
    addr === "0x0000000000000000000000000000000000000000" ||
    addr === "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";

  if (isNative && NATIVE_BY_CHAIN[cid]) return NATIVE_BY_CHAIN[cid];

  if (!isNative && CHAIN_TO_PLATFORM[cid]) {
    const index = await getPlatformIndex("high").catch(() => null);
    const id = index?.byAddress.get(`${cid}:${addr}`);
    if (id) return id;
  }

  if (!symbol) return null;
  const sym = symbol.toLowerCase();
  return cached(`resolve-symbol:${sym}`, TTL.RESOLVE, async () => {
    const res = await cgGet("/search", { query: sym });
    const exact = (res.coins || [])
      .filter((c) => (c.symbol || "").toLowerCase() === sym)
      .sort((a, b) => (a.market_cap_rank ?? 1e9) - (b.market_cap_rank ?? 1e9));
    return exact[0]?.id ?? null;
  });
};

// ─── Background refresh ──────────────────────────────────────────────────────

let refreshTimer = null;

const startMarketRefresh = () => {
  if (refreshTimer) return;
  const refresh = (force) =>
    getTrending({ force }).catch((err) =>
      console.warn("[market] trending refresh failed:", err.message),
    );
  refresh(false);
  // Slightly under the TTL so client requests never find the cache cold
  refreshTimer = setInterval(() => refresh(true), TRENDING_REFRESH_MS);
  refreshTimer.unref?.();
};

module.exports = {
  getTrending,
  getCoin,
  getChart,
  resolveCoinId,
  startMarketRefresh,
  cachedAt,
  CHART_DAYS,
};
