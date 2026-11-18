// services/marketService.js
"use strict";

const axios = require("axios");
const { isSolanaChainId, WSOL_MINT } = require("../utils/solana");

// -----------------------------------------------------------------------------
// Config
// -----------------------------------------------------------------------------

// CoinGecko: source of truth for token ids, images, sparklines, details, charts.
const CG_KEY = process.env.COINGECKO_API_KEY || "CG-8UKkv1LcS37UbAGqUMHcTBZP";
const CG_IS_PRO = CG_KEY && process.env.COINGECKO_API_PLAN === "pro";
const CG_BASE_URL = CG_IS_PRO
  ? "https://pro-api.coingecko.com/api/v3"
  : "https://api.coingecko.com/api/v3";
const CG_KEY_HEADER = CG_IS_PRO ? "x-cg-pro-api-key" : "x-cg-demo-api-key";
const CG_MIN_GAP_MS = CG_KEY ? 2100 : 7000;

// CoinMarketCap: discovery signals (trending, gainers/losers, new listings).
// Optional. Without a key (or if a CMC endpoint is not on your plan) every
// source falls back to a CoinGecko equivalent.
const CMC_KEY =
  process.env.COINMARKETCAP_API_KEY || "de7513a1-739c-4cdc-85b8-f1adf5a107fc";
const CMC_BASE_URL = "https://pro-api.coinmarketcap.com";
const CMC_MIN_GAP_MS = 2200; // ~30 req/min

// Free "Basic" CMC keys only get listings/latest. The trending, gainers-losers
// and listings/new endpoints need a paid plan. Set COINMARKETCAP_API_PLAN to
// anything other than "basic" (e.g. "hobbyist") to use them.
const CMC_PAID =
  !!CMC_KEY &&
  (process.env.COINMARKETCAP_API_PLAN || "basic").toLowerCase() !== "basic";

const CMC_LISTINGS_PATH =
  process.env.COINMARKETCAP_LISTINGS_PATH ||
  "/v1/cryptocurrency/listings/latest";

const MIN = 60 * 1000;
const HOUR = 60 * MIN;

// A refresh costs ~14 CoinGecko calls. The free demo plan allows 10k calls per
// month, so default to every 2 hours there (~5k/month, leaving room for
// coin/chart/resolve requests). Paid plans default to 15 minutes.
const TRENDING_REFRESH_MS =
  Math.max(
    5,
    parseInt(process.env.MARKET_REFRESH_MINUTES, 10) || (CG_IS_PRO ? 15 : 120),
  ) * MIN;

const TTL = {
  TRENDING: TRENDING_REFRESH_MS + 5 * MIN,
  COIN: 5 * MIN,
  CHART: { 1: 5 * MIN, 7: 15 * MIN, 30: HOUR, 90: HOUR, 365: 6 * HOUR },
  COINS_LIST: 24 * HOUR,
  STABLECOINS: 24 * HOUR,
  RESOLVE: 24 * HOUR,
  CMC_ADDR: 24 * HOUR,
};

const MAX_STALE_MS = 48 * HOUR;

// CoinGecko asset-platform id -> wallet chain ID.
const PLATFORM_TO_CHAIN = {
  ethereum: 1,
  "binance-smart-chain": 56,
  "polygon-pos": 137,
  "arbitrum-one": 42161,
  base: 8453,
  avalanche: 43114,
  arc: 5042,
  robinhood: 4663,
  // Non-EVM: the app's Solana chain id is the string "SOLANA" (utils/solana.js)
  solana: "SOLANA",
};

const CHAIN_TO_PLATFORM = Object.fromEntries(
  Object.entries(PLATFORM_TO_CHAIN).map(([platform, chainId]) => [
    chainId,
    platform,
  ]),
);

// Gas tokens do not always have a contract address on CoinGecko.
const NATIVE_COINS = {
  ethereum: [1, 8453, 42161, 4663],
  binancecoin: [56],
  "avalanche-2": [43114],
  "polygon-ecosystem-token": [137],
  "usd-coin": [5042],
  solana: ["SOLANA"],
};

const NATIVE_BY_CHAIN = {};

for (const [id, chains] of Object.entries(NATIVE_COINS)) {
  chains.forEach((chainId) => {
    NATIVE_BY_CHAIN[chainId] = id;
  });
}

// CMC gives symbols for L1 coins (no contract). Map the ones we support.
const NATIVE_SYMBOL_TO_ID = {
  ETH: "ethereum",
  BNB: "binancecoin",
  AVAX: "avalanche-2",
  POL: "polygon-ecosystem-token",
};

// Category slug for tokenized stocks on CoinGecko. Verify yours with
// GET /coins/categories/list if the Stocks tab comes back empty. Other options:
// "robinhood-chain-stocks-ecosystem" (on a chain the wallet supports),
// "xstocks-ecosystem".
const STOCKS_CATEGORY = process.env.MARKET_STOCKS_CATEGORY || "tokenized-stock";

// Many tokenized stocks live on chains the wallet does not support (e.g. Solana).
// Set MARKET_STOCKS_ANY_CHAIN=true to list them anyway (chains will be []).
const STOCKS_REQUIRE_CHAIN = process.env.MARKET_STOCKS_ANY_CHAIN !== "true";

// Existing tab keys, labels and chain IDs are preserved. "all" is now every
// other tab merged into one deduplicated list (not the global market list).
// New tabs: trending, gainers, losers, stocks.
const TABS = [
  { key: "all", label: "All" },
  {
    key: "trending",
    label: "Trending",
    source: "trending",
    count: 30,
    tag: "hot",
  },
  {
    key: "gainers",
    label: "Gainers",
    source: "gainers",
    count: 30,
    tag: "gainer",
  },
  { key: "losers", label: "Losers", source: "losers", count: 30, tag: "loser" },
  { key: "new", label: "New Launch", source: "new", count: 40, tag: "new" },
  { key: "arc", label: "Arc", category: "arc-ecosystem", chainId: 5042 },
  {
    key: "robinhood",
    label: "Robinhood",
    category: "robinhood-ecosystem",
    chainId: 4663,
  },
  { key: "base", label: "Base", category: "base-ecosystem", chainId: 8453 },
  {
    key: "bnb",
    label: "BNB",
    category: "binance-smart-chain",
    chainId: 56,
  },
  {
    key: "polygon",
    label: "Polygon",
    category: "polygon-ecosystem",
    chainId: 137,
  },
  {
    key: "arbitrum",
    label: "Arbitrum",
    category: "arbitrum-ecosystem",
    chainId: 42161,
  },
  {
    key: "avalanche",
    label: "Avalanche",
    category: "avalanche-ecosystem",
    chainId: 43114,
  },
  // Categories are fetched ordered by 24h volume => "top trading".
  { key: "meme", label: "Meme", category: "meme-token", count: 50 },
  { key: "rwa", label: "RWA", category: "real-world-assets-rwa", count: 50 },
  { key: "stocks", label: "Stocks", category: STOCKS_CATEGORY, count: 50 },
];

// CoinGecko /coins/markets supports up to 250 rows per request.
const PER_TAB = Math.min(
  250,
  Math.max(1, parseInt(process.env.MARKET_PER_TAB, 10) || 100),
);

const FETCH_PER_PAGE = 250;

// Max tokens in the merged "all" tab (round-robin across the other tabs).
const ALL_MAX = Math.min(
  400,
  Math.max(10, parseInt(process.env.MARKET_ALL_MAX, 10) || 150),
);

// Tags added in "all" for tokens that came from tabs which do not tag their own.
const ALL_TAGS = { meme: "meme", rwa: "rwa", stocks: "stock" };

// Filtering to avoid stablecoins, wrapped assets, and low-quality market data.
const MIN_VOLUME_USD = 20_000;
const MIN_MARKET_CAP_USD = 1_000_000;
const MAX_ABS_CHANGE_PCT = 500;

// Per-tab filter overrides. Movers need to allow large % changes; new listings
// are tiny by nature.
const PROFILES = {
  gainers: {
    minVolume: 100_000,
    minCap: 250_000,
    maxChange: 2000,
    direction: "up",
  },
  losers: {
    minVolume: 100_000,
    minCap: 250_000,
    maxChange: 2000,
    direction: "down",
  },
  new: { minVolume: 0, minCap: 0, maxChange: Infinity },
  // Tokenized stocks often trade thinly and report small/zero market caps.
  stocks: { requireChain: STOCKS_REQUIRE_CHAIN, minVolume: 0, minCap: 0 },
};

const WRAPPED_ID = /(^|-)(wrapped|bridged|staked)(-|$)|-bridged-|^l2-standard/;

const WRAPPED_SYMBOLS = new Set([
  "weth",
  "wbtc",
  "wbnb",
  "wavax",
  "wpol",
  "wmatic",
  "cbbtc",
  "cirbtc",
  "steth",
  "wsteth",
  "reth",
  "cbeth",
  "weeth",
]);

const STABLE_SYMBOLS = new Set([
  "usdc",
  "usdt",
  "dai",
  "usde",
  "usdg",
  "usd1",
  "pyusd",
  "fdusd",
  "tusd",
  "usds",
  "usdb",
  "eurc",
  "bsc-usd",
  "rlusd",
  "gho",
  "frax",
  "lusd",
  "crvusd",
  "u",
]);

// -----------------------------------------------------------------------------
// Rate-limited request queues (one per provider)
// -----------------------------------------------------------------------------

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const createQueue = ({ baseUrl, headers, minGap }) => {
  const lanes = { high: [], low: [] };
  let nextSlotAt = 0;
  let draining = false;

  const drain = async () => {
    if (draining) return;

    draining = true;

    try {
      while (lanes.high.length || lanes.low.length) {
        const wait = nextSlotAt - Date.now();

        if (wait > 0) await sleep(wait);

        const job = lanes.high.shift() || lanes.low.shift();

        nextSlotAt = Date.now() + minGap;

        try {
          const response = await axios.get(`${baseUrl}${job.path}`, {
            params: job.params,
            timeout: 20_000,
            headers,
          });

          job.resolve(response.data);
        } catch (err) {
          // Transient network failure (ECONNRESET, timeout, DNS): retry shortly.
          if (!err.response && job.netRetries > 0) {
            job.netRetries -= 1;
            nextSlotAt = Date.now() + 3000;
            lanes.low.unshift(job);
            continue;
          }

          if (err.response?.status === 429) {
            const retryAfter = parseInt(
              err.response.headers?.["retry-after"],
              10,
            );

            nextSlotAt =
              Date.now() + (retryAfter > 0 ? retryAfter * 1000 : 60_000);

            if (job.retries > 0) {
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

      // Handle a job added at the end of the previous drain cycle.
      if (lanes.high.length || lanes.low.length) {
        drain();
      }
    }
  };

  return (path, params = {}, priority = "high") =>
    new Promise((resolve, reject) => {
      lanes[priority].push({
        path,
        params,
        resolve,
        reject,
        retries: priority === "low" ? 2 : 0,
        netRetries: 2,
      });

      drain();
    });
};

const cgGet = createQueue({
  baseUrl: CG_BASE_URL,
  headers: CG_KEY ? { [CG_KEY_HEADER]: CG_KEY } : {},
  minGap: CG_MIN_GAP_MS,
});

const cmcQueue = CMC_KEY
  ? createQueue({
      baseUrl: CMC_BASE_URL,
      headers: { "X-CMC_PRO_API_KEY": CMC_KEY, Accept: "application/json" },
      minGap: CMC_MIN_GAP_MS,
    })
  : null;

// CMC wraps payloads as { status, data }.
const cmcGet = async (path, params = {}) => {
  if (!cmcQueue) throw new Error("CoinMarketCap API key not configured");

  const body = await cmcQueue(path, params, "low");

  return body?.data;
};

// -----------------------------------------------------------------------------
// Cache: deduplication and stale-on-error fallback
// -----------------------------------------------------------------------------

const cache = new Map();
const inflight = new Map();

const cached = async (key, ttl, fetcher, { force = false } = {}) => {
  const hit = cache.get(key);

  if (!force && hit && Date.now() - hit.ts < ttl) {
    return hit.value;
  }

  if (inflight.has(key)) {
    return inflight.get(key);
  }

  const promise = (async () => {
    try {
      const value = await fetcher();

      cache.set(key, {
        value,
        ts: Date.now(),
      });

      return value;
    } catch (err) {
      if (hit && Date.now() - hit.ts < MAX_STALE_MS) {
        console.warn(
          `[market] ${key} refresh failed, serving stale:`,
          err.message,
        );

        return hit.value;
      }

      throw err;
    } finally {
      inflight.delete(key);
    }
  })();

  inflight.set(key, promise);

  return promise;
};

const cachedAt = (key) => cache.get(key)?.ts ?? null;

// Run a source; log and return null on failure so the tab keeps its snapshot.
const safe = async (label, fn) => {
  try {
    return await fn();
  } catch (err) {
    console.warn(`[market] ${label} failed:`, err.message);
    return null;
  }
};

// -----------------------------------------------------------------------------
// Reference data
// -----------------------------------------------------------------------------

const getPlatformIndex = (priority = "high") =>
  cached("coins-list", TTL.COINS_LIST, async () => {
    const list = await cgGet(
      "/coins/list",
      { include_platform: true },
      priority,
    );

    const byId = new Map();
    const byAddress = new Map(); // "chainId:address" -> coinId
    const byAddressAny = new Map(); // "address" -> coinId (used to map CMC items)

    for (const coin of list) {
      const chains = [];

      for (const [platform, address] of Object.entries(coin.platforms || {})) {
        const chainId = PLATFORM_TO_CHAIN[platform];

        if (!chainId || !address) continue;

        chains.push({ chainId, address });

        const lower = address.toLowerCase();
        const key = `${chainId}:${lower}`;

        if (!byAddress.has(key)) byAddress.set(key, coin.id);
        if (!byAddressAny.has(lower)) byAddressAny.set(lower, coin.id);
      }

      if (chains.length) {
        byId.set(coin.id, chains);
      }
    }

    return { byId, byAddress, byAddressAny };
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

    return new Set(rows.map((row) => row.id));
  });

const chainsFor = (id, index) => {
  const natives = (NATIVE_COINS[id] || []).map((chainId) => ({
    chainId,
    address: null,
    isNative: true,
  }));

  const tokens = (index?.byId.get(id) || []).filter(
    (chain) => !natives.some((native) => native.chainId === chain.chainId),
  );

  return [...natives, ...tokens];
};

// -----------------------------------------------------------------------------
// Market list helpers
// -----------------------------------------------------------------------------

const downsample = (arr, n) => {
  if (!Array.isArray(arr) || arr.length <= n) return arr || [];

  const step = (arr.length - 1) / (n - 1);

  return Array.from({ length: n }, (_, i) => arr[Math.round(i * step)]);
};

const hasSupportedChain = (id, index) => chainsFor(id, index).length > 0;

const isListable = (coin, stableIds, index, opts = {}) => {
  const {
    minVolume = MIN_VOLUME_USD,
    minCap = MIN_MARKET_CAP_USD,
    maxChange = MAX_ABS_CHANGE_PCT,
    requireChain = true,
    direction = null,
  } = opts;

  const symbol = (coin.symbol || "").toLowerCase();
  const change = coin.price_change_percentage_24h || 0;

  if (stableIds.has(coin.id) || STABLE_SYMBOLS.has(symbol)) return false;
  if (WRAPPED_ID.test(coin.id) || WRAPPED_SYMBOLS.has(symbol)) return false;
  if (!coin.current_price || (coin.total_volume || 0) < minVolume) return false;
  if (coin.market_cap && coin.market_cap < minCap) return false;
  if (Math.abs(change) > maxChange) return false;
  if (direction === "up" && change <= 0) return false;
  if (direction === "down" && change >= 0) return false;
  if (requireChain && !hasSupportedChain(coin.id, index)) return false;

  return true;
};

// Preserve the existing token object shape for frontend compatibility.
const toToken = (coin, index, extra = {}) => ({
  id: coin.id,
  symbol: (coin.symbol || "").toUpperCase(),
  name: coin.name,
  image: coin.image,
  price: coin.current_price,
  change24h: coin.price_change_percentage_24h ?? null,
  marketCap: coin.market_cap || null,
  volume24h: coin.total_volume || null,
  rank: coin.market_cap_rank ?? null,
  sparkline: downsample(coin.sparkline_in_7d?.price, 32),
  chains: chainsFor(coin.id, index),
  ...extra,
});

const fetchMarkets = (params = {}) =>
  cgGet(
    "/coins/markets",
    {
      vs_currency: "usd",
      order: "volume_desc",
      per_page: FETCH_PER_PAGE,
      page: 1,
      sparkline: true,
      price_change_percentage: "24h",
      ...params,
    },
    "low",
  );

const pick = (
  rows,
  stableIds,
  index,
  count,
  exclude = new Set(),
  opts = {},
) => {
  const output = [];

  for (const row of rows || []) {
    if (output.length >= count) break;
    if (exclude.has(row.id)) continue;
    if (!isListable(row, stableIds, index, opts)) continue;

    output.push(row);
  }

  return output;
};

// -----------------------------------------------------------------------------
// CoinMarketCap -> CoinGecko id mapping
// -----------------------------------------------------------------------------
// The app keys everything (details, charts, resolve) on CoinGecko ids, so CMC is
// only used to decide WHICH coins to show. Each CMC item is mapped to a
// CoinGecko id by contract address, then hydrated from CoinGecko /coins/markets.

const cmcAddrCache = new Map(); // cmcId -> { addrs: string[], ts }

const loadCmcAddresses = async (cmcIds) => {
  const stale = cmcIds.filter((id) => {
    const hit = cmcAddrCache.get(id);

    return !hit || Date.now() - hit.ts > TTL.CMC_ADDR;
  });

  for (let i = 0; i < stale.length; i += 100) {
    const chunk = stale.slice(i, i + 100);

    const data = await cmcGet("/v2/cryptocurrency/info", {
      id: chunk.join(","),
      aux: "platform,contract_address",
    });

    for (const id of chunk) {
      const raw = data?.[id];
      const info = Array.isArray(raw) ? raw[0] : raw;

      const addrs = [
        info?.platform?.token_address,
        ...(info?.contract_address || []).map((c) => c.contract_address),
      ]
        .filter(Boolean)
        .map((a) => a.toLowerCase());

      cmcAddrCache.set(id, { addrs, ts: Date.now() });
    }
  }
};

const cmcItemsToIds = async (items, index) => {
  const list = Array.isArray(items) ? items : [];

  // Some CMC endpoints omit `platform` entirely; look those up in one batch.
  const unknown = list
    .filter((item) => item.platform === undefined)
    .map((item) => item.id);

  if (unknown.length) {
    await loadCmcAddresses(unknown).catch((err) =>
      console.warn("[market] cmc info lookup failed:", err.message),
    );
  }

  const ids = [];

  for (const item of list) {
    const addrs = [
      item.platform?.token_address,
      ...(cmcAddrCache.get(item.id)?.addrs || []),
    ]
      .filter(Boolean)
      .map((a) => a.toLowerCase());

    let id = null;

    for (const addr of addrs) {
      id = index?.byAddressAny.get(addr) ?? null;
      if (id) break;
    }

    // No contract at all => L1/native coin.
    if (!id && !addrs.length) {
      id = NATIVE_SYMBOL_TO_ID[(item.symbol || "").toUpperCase()] ?? null;
    }

    if (id) ids.push(id);
  }

  return [...new Set(ids)];
};

// Fetch CoinGecko market rows for ids and store them in rowMap.
const hydrate = async (ids, rowMap) => {
  for (let i = 0; i < ids.length; i += 100) {
    const chunk = ids.slice(i, i + 100);

    const rows = await fetchMarkets({
      ids: chunk.join(","),
      per_page: chunk.length,
      order: "market_cap_desc",
    });

    rows.forEach((row) => rowMap.set(row.id, row));
  }
};

// -----------------------------------------------------------------------------
// Discovery sources (each returns an ordered list of CoinGecko ids)
// -----------------------------------------------------------------------------

const trendingIds = async (index) => {
  if (CMC_PAID) {
    const ids = await safe("cmc trending", async () =>
      cmcItemsToIds(
        await cmcGet("/v1/cryptocurrency/trending/latest", {
          limit: 100,
          time_period: "24h",
          convert: "USD",
        }),
        index,
      ),
    );

    if (ids?.length) return ids;
  }

  // Fallback: CoinGecko trending search (preserves CoinGecko order).
  const trending = await cgGet("/search/trending", {}, "low");

  return (trending.coins || []).map((coin) => coin.item.id).slice(0, 30);
};

// Free CMC plan: listings/latest sorted by 24h change, with floors on market
// cap and volume so micro-cap noise does not dominate.
const cmcListings = (params) =>
  cmcGet(CMC_LISTINGS_PATH, {
    start: 1,
    convert: "USD",
    cryptocurrency_type: "tokens",
    ...params,
  });

const moversIds = async (index, rowMap) => {
  if (CMC_KEY) {
    const result = await safe("cmc gainers/losers", async () => {
      let gainers;
      let losers;

      if (CMC_PAID) {
        const params = {
          limit: 200,
          time_period: "24h",
          convert: "USD",
          sort: "percent_change_24h",
        };

        gainers = await cmcGet("/v1/cryptocurrency/trending/gainers-losers", {
          ...params,
          sort_dir: "desc",
        });

        losers = await cmcGet("/v1/cryptocurrency/trending/gainers-losers", {
          ...params,
          sort_dir: "asc",
        });
      } else {
        const params = {
          limit: 200,
          sort: "percent_change_24h",
          market_cap_min: 250_000,
          volume_24h_min: 100_000,
        };

        gainers = await cmcListings({ ...params, sort_dir: "desc" });
        losers = await cmcListings({ ...params, sort_dir: "asc" });
      }

      return {
        gainers: await cmcItemsToIds(gainers, index),
        losers: await cmcItemsToIds(losers, index),
      };
    });

    if (result?.gainers.length || result?.losers.length) return result;
  }

  // Fallback: rank the 250 most-traded CoinGecko assets by 24h change.
  const rows = await fetchMarkets({ order: "volume_desc", per_page: 250 });

  rows.forEach((row) => rowMap.set(row.id, row));

  const sorted = rows
    .filter((row) => row.price_change_percentage_24h != null)
    .sort(
      (a, b) => b.price_change_percentage_24h - a.price_change_percentage_24h,
    );

  return {
    gainers: sorted
      .filter((r) => r.price_change_percentage_24h > 0)
      .map((r) => r.id),
    losers: sorted
      .filter((r) => r.price_change_percentage_24h < 0)
      .reverse()
      .map((r) => r.id),
  };
};

const newIds = async (index) => {
  const cmcIds = CMC_KEY
    ? await safe("cmc new listings", async () =>
        cmcItemsToIds(
          CMC_PAID
            ? await cmcGet("/v1/cryptocurrency/listings/new", {
                limit: 100,
                convert: "USD",
              })
            : await cmcListings({
                limit: 100,
                sort: "date_added",
                sort_dir: "desc",
                volume_24h_min: 10_000,
              }),
          index,
        ),
      )
    : null;

  // CoinGecko's /coins/list/new is a paid-plan endpoint.
  const cgIds = CG_IS_PRO
    ? await safe("coingecko new listings", async () => {
        const listings = await cgGet("/coins/list/new", {}, "low");

        return (listings || []).map((listing) => listing.id).slice(0, 60);
      })
    : null;

  if (!cmcIds && !cgIds) throw new Error("no new listings source available");

  // CMC first (it lists faster), then anything only CoinGecko knows.
  return [...new Set([...(cmcIds || []), ...(cgIds || [])])];
};

// -----------------------------------------------------------------------------
// Trending tabs
// -----------------------------------------------------------------------------

const buildTrending = async () => {
  const [stableIds, index] = await Promise.all([
    getStablecoinIds().catch(() => new Set()),
    getPlatformIndex("low").catch(() => null),
  ]);

  // Preserve each tab's last successful snapshot if its refresh fails.
  const previous = cache.get("trending")?.value;

  const previousTokens = (key) =>
    previous?.tabs?.find((tab) => tab.key === key)?.tokens ?? [];

  // 1) Discovery lists (ids) from CMC / CoinGecko.
  const rowMap = new Map();
  const lists = {};

  lists.trending = await safe("trending", () => trendingIds(index));

  const movers = await safe("movers", () => moversIds(index, rowMap));

  lists.gainers = movers?.gainers ?? null;
  lists.losers = movers?.losers ?? null;

  lists.new = await safe("new", () => newIds(index));

  // 2) One hydration pass for every id across all lists.
  const wanted = [
    ...new Set(Object.values(lists).flatMap((list) => list || [])),
  ].filter((id) => !rowMap.has(id));

  if (wanted.length) {
    await safe("hydrate markets", () => hydrate(wanted, rowMap));
  }

  const rowsFor = (key) => {
    if (!lists[key]) return null;

    const rows = lists[key].map((id) => rowMap.get(id)).filter(Boolean);

    return rows.length ? rows : null;
  };

  // 3) Category tabs (chain ecosystems, meme, rwa, stocks), ordered by volume.
  const rowsByKey = {
    trending: rowsFor("trending"),
    gainers: rowsFor("gainers"),
    losers: rowsFor("losers"),
    new: rowsFor("new"),
  };

  for (const tab of TABS) {
    if (!tab.category) continue;

    rowsByKey[tab.key] = await safe(`category ${tab.category}`, () =>
      fetchMarkets({
        category: tab.category,
        order: "volume_desc",
        per_page: FETCH_PER_PAGE,
      }),
    );
  }

  // 4) Assemble tabs.
  const usedByChainTabs = new Set();

  const tabs = TABS.map((tab) => {
    const base = {
      key: tab.key,
      label: tab.label,
      chainId: tab.chainId ?? null,
    };

    // "all" is filled below, once the other tabs are built.
    if (tab.key === "all") return { ...base, tokens: [] };

    const fallback = () => ({ ...base, tokens: previousTokens(tab.key) });

    const rows = rowsByKey[tab.key];

    if (!rows) return fallback();

    const exclude = tab.chainId ? usedByChainTabs : new Set();

    const picked = pick(
      rows,
      stableIds,
      index,
      tab.count ?? PER_TAB,
      exclude,
      PROFILES[tab.key],
    );

    if (!picked.length) return fallback();

    if (tab.chainId) {
      picked.forEach((coin) => usedByChainTabs.add(coin.id));
    }

    return {
      ...base,
      tokens: picked.map((coin) =>
        toToken(coin, index, tab.tag ? { tag: tab.tag } : {}),
      ),
    };
  });

  // Merge every other tab into "all": round-robin so each list is represented,
  // deduplicated by token id, capped at ALL_MAX.
  const allTab = tabs.find((tab) => tab.key === "all");

  if (allTab) {
    const sources = tabs.filter((tab) => tab.key !== "all");
    const seen = new Set();
    const merged = [];

    for (let i = 0; merged.length < ALL_MAX; i++) {
      let any = false;

      for (const source of sources) {
        const token = source.tokens[i];

        if (!token) continue;

        any = true;

        if (seen.has(token.id)) continue;

        seen.add(token.id);

        merged.push(
          !token.tag && ALL_TAGS[source.key]
            ? { ...token, tag: ALL_TAGS[source.key] }
            : token,
        );

        if (merged.length >= ALL_MAX) break;
      }

      if (!any) break;
    }

    allTab.tokens = merged;
  }

  if (!tabs.some((tab) => tab.tokens.length)) {
    throw new Error("No market data returned from CoinGecko or CoinMarketCap");
  }

  return {
    tabs,
    updatedAt: new Date().toISOString(),
  };
};

const getTrending = (opts) =>
  cached("trending", TTL.TRENDING, buildTrending, opts);

// -----------------------------------------------------------------------------
// Coin details
// -----------------------------------------------------------------------------

const stripHtml = (value) =>
  (value || "")
    .replace(/<[^>]*>/g, "")
    .replace(/\r\n/g, "\n")
    .trim();

const getCoin = (id) =>
  cached(`coin:${id}`, TTL.COIN, async () => {
    const coin = await cgGet(`/coins/${encodeURIComponent(id)}`, {
      localization: false,
      tickers: false,
      community_data: false,
      developer_data: false,
      sparkline: false,
    });

    const market = coin.market_data || {};

    const usd = (object) => (object && object.usd != null ? object.usd : null);

    const platforms = [];

    for (const [platform, info] of Object.entries(
      coin.detail_platforms || {},
    )) {
      const chainId = PLATFORM_TO_CHAIN[platform];

      if (!chainId || !info?.contract_address) continue;

      platforms.push({
        chainId,
        address: info.contract_address,
        decimals: info.decimal_place ?? null,
      });
    }

    for (const chainId of NATIVE_COINS[coin.id] || []) {
      if (!platforms.some((platform) => platform.chainId === chainId)) {
        platforms.unshift({
          chainId,
          address: null,
          decimals: 18,
          isNative: true,
        });
      }
    }

    return {
      id: coin.id,
      symbol: (coin.symbol || "").toUpperCase(),
      name: coin.name,
      image: coin.image?.large || coin.image?.small || null,
      categories: (coin.categories || []).filter(Boolean).slice(0, 6),
      description: stripHtml(coin.description?.en).slice(0, 1500),
      links: {
        homepage: (coin.links?.homepage || []).find(Boolean) || null,
        twitter: coin.links?.twitter_screen_name
          ? `https://x.com/${coin.links.twitter_screen_name}`
          : null,
        explorer: (coin.links?.blockchain_site || []).find(Boolean) || null,
      },
      market: {
        price: usd(market.current_price),
        rank: coin.market_cap_rank ?? null,
        marketCap: usd(market.market_cap),
        fdv: usd(market.fully_diluted_valuation),
        volume24h: usd(market.total_volume),
        high24h: usd(market.high_24h),
        low24h: usd(market.low_24h),
        change1h: usd(market.price_change_percentage_1h_in_currency),
        change24h: market.price_change_percentage_24h ?? null,
        change7d: market.price_change_percentage_7d ?? null,
        change30d: market.price_change_percentage_30d ?? null,
        change1y: market.price_change_percentage_1y ?? null,
        ath: usd(market.ath),
        athChange: usd(market.ath_change_percentage),
        athDate: market.ath_date ?? null,
        circulatingSupply: market.circulating_supply ?? null,
        totalSupply: market.total_supply ?? null,
        maxSupply: market.max_supply ?? null,
      },
      platforms,
      updatedAt: new Date().toISOString(),
    };
  });

// -----------------------------------------------------------------------------
// Charts
// -----------------------------------------------------------------------------

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
      prices: downsample(data.prices || [], 120).map(([timestamp, price]) => [
        Math.round(timestamp),
        price,
      ]),
    };
  });

// -----------------------------------------------------------------------------
// Resolve wallet tokens to CoinGecko IDs
// -----------------------------------------------------------------------------

const resolveCoinId = async ({ chainId, address, symbol }) => {
  const solana = isSolanaChainId(chainId);
  const cid = solana ? "SOLANA" : parseInt(chainId, 10);
  const addr = (address || "").toLowerCase();

  const isNative =
    !addr ||
    addr === "0x0000000000000000000000000000000000000000" ||
    addr === "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee" ||
    (solana && address === WSOL_MINT);

  if (isNative && NATIVE_BY_CHAIN[cid]) {
    return NATIVE_BY_CHAIN[cid];
  }

  if (!isNative && CHAIN_TO_PLATFORM[cid]) {
    const index = await getPlatformIndex("high").catch(() => null);
    const id = index?.byAddress.get(`${cid}:${addr}`);

    if (id) return id;
  }

  if (!symbol) return null;

  const normalizedSymbol = symbol.toLowerCase();

  return cached(`resolve-symbol:${normalizedSymbol}`, TTL.RESOLVE, async () => {
    const response = await cgGet("/search", {
      query: normalizedSymbol,
    });

    const exact = (response.coins || [])
      .filter((coin) => (coin.symbol || "").toLowerCase() === normalizedSymbol)
      .sort((a, b) => (a.market_cap_rank ?? 1e9) - (b.market_cap_rank ?? 1e9));

    return exact[0]?.id ?? null;
  });
};

// -----------------------------------------------------------------------------
// Batched token prices (browser extension portfolio)
// -----------------------------------------------------------------------------

// Resolves each address through the platform index (no API call), then prices
// every resolved id with a single /simple/price request — so a whole portfolio
// costs one CoinGecko call instead of one per token.
const getTokenPrices = async ({ chainId, addresses }) => {
  const solana = isSolanaChainId(chainId);
  const cid = solana ? "SOLANA" : parseInt(chainId, 10);
  const index = await getPlatformIndex("high").catch(() => null);

  // The index keys every address lower-cased ("chainId:address").
  const idByAddress = new Map();
  for (const raw of addresses) {
    const id = index?.byAddress.get(`${cid}:${raw.toLowerCase()}`);
    if (id) idByAddress.set(raw, id);
  }

  const ids = [...new Set(idByAddress.values())].sort();
  if (ids.length === 0) return {};

  const prices = await cached(`token-prices:${ids.join(",")}`, 60 * 1000, () =>
    cgGet("/simple/price", {
      ids: ids.join(","),
      vs_currencies: "usd",
      include_24hr_change: true,
    }),
  );

  const out = {};
  for (const [address, id] of idByAddress) {
    const p = prices?.[id];
    if (p?.usd !== undefined) {
      out[address] = { id, usd: p.usd, usd_24h_change: p.usd_24h_change ?? null };
    }
  }
  return out;
};

// Native coins of every chain the wallets support (ETH on Ethereum/Base/
// Arbitrum/Robinhood, USDC on Arc, SOL, BNB, AVAX, POL). One CoinGecko call,
// cached for a minute and shared by every wallet, so phones never hit
// CoinGecko's per-device rate limit for portfolio prices.
const NATIVE_COIN_IDS = [
  "arbitrum",
  "avalanche-2",
  "binancecoin",
  "ethereum",
  "optimism",
  "polygon-ecosystem-token",
  "solana",
  "usd-coin",
];

const getNativePrices = () =>
  cached("native-prices", 60 * 1000, () =>
    cgGet("/simple/price", {
      ids: NATIVE_COIN_IDS.join(","),
      vs_currencies: "usd",
      include_24hr_change: true,
    }),
  );

// -----------------------------------------------------------------------------
// Background refresh
// -----------------------------------------------------------------------------

let refreshTimer = null;

const startMarketRefresh = () => {
  if (refreshTimer) return;

  const refresh = (force) =>
    getTrending({ force }).catch((err) =>
      console.warn("[market] trending refresh failed:", err.message),
    );

  refresh(false);

  refreshTimer = setInterval(() => refresh(true), TRENDING_REFRESH_MS);

  refreshTimer.unref?.();
};

module.exports = {
  getTrending,
  getCoin,
  getChart,
  resolveCoinId,
  getTokenPrices,
  getNativePrices,
  startMarketRefresh,
  cachedAt,
  CHART_DAYS,
  // Shared with pairChartService so on-chain (GeckoTerminal) calls draw from
  // the same CoinGecko rate budget and cache instead of competing with it.
  cgGet,
  cached,
};
