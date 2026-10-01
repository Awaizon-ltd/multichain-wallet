// Enhanced CoinGecko Service - Handles both native assets and ERC20 tokens

import { withCache, TTL, invalidatePrices } from "../utils/cache/DataCache";
import queue from "../utils/cache/RequestQueue";

const COINGECKO_API_BASE = "https://api.coingecko.com/api/v3";

// CoinGecko-specific TTLs not shared with blockchain data
const DETAILS_TTL = 60 * 60 * 1000; // 1h — coin metadata rarely changes

// Map chain symbols to CoinGecko IDs (for native assets)
const COIN_ID_MAP = {
  ETH: "ethereum",
  POL: "polygon-ecosystem-token",
  MATIC: "polygon-ecosystem-token",
  BNB: "binancecoin",
  AVAX: "avalanche-2",
  OP: "optimism",
  ARB: "arbitrum",
  // Arc's native gas asset is USDC itself — reuse the same CoinGecko id.
  USDC: "usd-coin",
};

// Map chain IDs to CoinGecko platform IDs (for ERC20 tokens)
const PLATFORM_ID_MAP = {
  1: "ethereum", // Ethereum
  56: "binance-smart-chain", // BSC
  137: "polygon-pos", // Polygon
  42161: "arbitrum-one", // Arbitrum
  10: "optimistic-ethereum", // Optimism
  43114: "avalanche", // Avalanche
  8453: "base", // Base
  // NOTE: Arc (5042) and Robinhood Chain (4663) aren't indexed as CoinGecko
  // "platforms" yet — contract-address price lookups fall back to the
  // symbol-based strategy in getTokenPrice() until CoinGecko adds them.
};

// Common token symbol to CoinGecko ID mapping (for popular tokens)
const TOKEN_ID_MAP = {
  // Stablecoins
  USDT: "tether",
  USDC: "usd-coin",
  DAI: "dai",
  BUSD: "binance-usd",
  USDD: "usdd",
  TUSD: "true-usd",
  FRAX: "frax",

  // DeFi Tokens
  UNI: "uniswap",
  AAVE: "aave",
  COMP: "compound-governance-token",
  MKR: "maker",
  SNX: "havven",
  CRV: "curve-dao-token",
  SUSHI: "sushi",
  "1INCH": "1inch",
  YFI: "yearn-finance",

  // Major Tokens
  LINK: "chainlink",
  WBTC: "wrapped-bitcoin",
  SHIB: "shiba-inu",
  APE: "apecoin",
  LDO: "lido-dao",
  GRT: "the-graph",
  SAND: "the-sandbox",
  MANA: "decentraland",
  AXS: "axie-infinity",
  CHZ: "chiliz",

  // Exchange Tokens
  CRO: "crypto-com-chain",
  LEO: "leo-token",
  HT: "huobi-token",
  OKB: "okb",
  FTT: "ftx-token",

  // Wrapped Tokens
  WETH: "weth",
  WPOL: "wmatic",
  WMATIC: "wmatic",
  WBNB: "wbnb",
  WAVAX: "wrapped-avax",
};

/** Clear all CoinGecko price data from the cache */
export const clearCache = () => invalidatePrices();

/**
 * Get CoinGecko platform ID from chain ID
 */
export const getPlatformId = (chainId) => {
  return PLATFORM_ID_MAP[chainId] || null;
};

/**
 * Get CoinGecko ID from token symbol (for known tokens)
 */
export const getCoinIdFromSymbol = (symbol) => {
  const upperSymbol = symbol?.toUpperCase();
  return COIN_ID_MAP[upperSymbol] || TOKEN_ID_MAP[upperSymbol] || null;
};

/**
 * Get token price and data by contract address (for ERC20 tokens).
 * Cached 60s, persisted to AsyncStorage.
 */
export const getTokenPriceByContract = async (contractAddress, platformId) => {
  const cacheKey = `cgtoken:${platformId}:${contractAddress.toLowerCase()}`;
  try {
    return await withCache(cacheKey, TTL.PRICE_TOKEN, async () => {
      const response = await fetch(
        `${COINGECKO_API_BASE}/simple/token_price/${platformId}?contract_addresses=${contractAddress}&vs_currencies=usd&include_24hr_change=true&include_24hr_vol=true&include_market_cap=true`,
      );
      if (!response.ok) return null;
      const data = await response.json();
      const tokenData = data[contractAddress.toLowerCase()];
      if (!tokenData) return null;
      return {
        usd: tokenData.usd,
        usd_24h_change: tokenData.usd_24h_change,
        usd_24h_vol: tokenData.usd_24h_vol,
        usd_market_cap: tokenData.usd_market_cap,
      };
    }, { persist: true });
  } catch {
    return null;
  }
};

/**
 * Get token price by symbol (tries multiple strategies)
 */
export const getTokenPrice = async (symbolOrAddress, chainId) => {
  try {
    // Strategy 1: known symbol → CoinGecko ID
    const coinId = getCoinIdFromSymbol(symbolOrAddress);
    if (coinId) {
      const prices = await getCoinPrices(coinId);
      return prices[coinId] || null;
    }

    // Strategy 2: contract address lookup
    if (symbolOrAddress.startsWith("0x") && symbolOrAddress.length === 42) {
      const platformId = getPlatformId(chainId);
      if (platformId) return getTokenPriceByContract(symbolOrAddress, platformId);
    }

    // Strategy 3: search
    const searchResult = await searchToken(symbolOrAddress);
    if (searchResult) {
      const prices = await getCoinPrices(searchResult.id);
      return prices[searchResult.id] || null;
    }

    return null;
  } catch {
    return null;
  }
};

/**
 * Get current prices for multiple coins by ID.
 * Cached 60s (persisted), deduplicated so concurrent callers share one request.
 * IDs are sorted so call order doesn't create separate cache entries.
 */
export const getCoinPrices = async (coinIds) => {
  const idArray = Array.isArray(coinIds) ? coinIds : [coinIds];
  const sorted = [...idArray].sort();
  const ids = sorted.join(",");
  const cacheKey = `cgprices:${ids}`;

  return queue.execute(cacheKey, () =>
    withCache(cacheKey, TTL.PRICE_BATCH, async () => {
      const response = await fetch(
        `${COINGECKO_API_BASE}/simple/price?ids=${ids}&vs_currencies=usd&include_24hr_change=true&include_24hr_vol=true&include_market_cap=true`,
      );
      if (!response.ok) throw new Error(`CoinGecko ${response.status}`);
      return response.json();
    }, { persist: true }),
  ).catch(() => ({}));
};

/**
 * Get price for a single coin by symbol
 */
export const getCoinPriceBySymbol = async (symbol) => {
  const coinId = getCoinIdFromSymbol(symbol);
  if (!coinId) {
    console.warn(`[CoinGecko] No CoinGecko ID found for symbol: ${symbol}`);
    return null;
  }

  const prices = await getCoinPrices(coinId);
  return prices[coinId];
};

/**
 * Get prices for all supported native tokens
 */
export const getAllNativePrices = async () => {
  const coinIds = Object.values(COIN_ID_MAP);
  const prices = await getCoinPrices(coinIds);

  // Convert back to symbol-based object
  const pricesBySymbol = {};
  Object.entries(COIN_ID_MAP).forEach(([symbol, coinId]) => {
    if (prices[coinId]) {
      pricesBySymbol[symbol] = prices[coinId];
    }
  });

  return pricesBySymbol;
};

/**
 * Search for a token by name or symbol
 */
export const searchToken = async (query) => {
  try {
    const response = await fetch(
      `${COINGECKO_API_BASE}/search?query=${encodeURIComponent(query)}`,
    );
    if (!response.ok) return null;
    const data = await response.json();
    if (data.coins?.length > 0) {
      return { id: data.coins[0].id, symbol: data.coins[0].symbol, name: data.coins[0].name };
    }
    return null;
  } catch {
    return null;
  }
};

/**
 * Get token logo URL
 */
export const getTokenLogo = async (symbolOrAddress, platformId = null) => {
  try {
    // Try by symbol first
    const coinId = getCoinIdFromSymbol(symbolOrAddress);
    if (coinId) {
      const details = await getCoinDetails(coinId);
      return details?.image?.large || details?.image?.small || null;
    }

    // Try by contract address
    if (symbolOrAddress.startsWith("0x") && platformId) {
      const response = await fetch(
        `${COINGECKO_API_BASE}/coins/${platformId}/contract/${symbolOrAddress}`,
      );

      if (response.ok) {
        const data = await response.json();
        return data?.image?.large || data?.image?.small || null;
      }
    }

    // Try search
    const searchResult = await searchToken(symbolOrAddress);
    if (searchResult) {
      const details = await getCoinDetails(searchResult.id);
      return details?.image?.large || details?.image?.small || null;
    }

    return null;
  } catch (error) {
    console.error("[CoinGecko] Error fetching token logo:", error);
    return null;
  }
};

/**
 * Get detailed coin information. Cached 1h (persisted) — metadata rarely changes.
 */
export const getCoinDetails = async (coinId) => {
  const cacheKey = `cgdetails:${coinId}`;
  try {
    return await withCache(cacheKey, DETAILS_TTL, async () => {
      const response = await fetch(
        `${COINGECKO_API_BASE}/coins/${coinId}?localization=false&tickers=false&community_data=false&developer_data=false`,
      );
      if (!response.ok) throw new Error(`CoinGecko ${response.status}`);
      return response.json();
    }, { persist: true });
  } catch {
    return null;
  }
};

/**
 * Get coin market chart (price history)
 */
export const getCoinChart = async (coinId, days = 7) => {
  try {
    console.log("[CoinGecko] Fetching chart for:", coinId, "days:", days);

    const response = await fetch(
      `${COINGECKO_API_BASE}/coins/${coinId}/market_chart?vs_currency=usd&days=${days}&interval=${days === 1 ? "hourly" : "daily"}`,
    );

    if (!response.ok) {
      throw new Error("Failed to fetch chart data");
    }

    return await response.json();
  } catch (error) {
    console.error("[CoinGecko] Error fetching chart data:", error);
    return null;
  }
};

/**
 * Format price change percentage
 */
export const formatPriceChange = (change) => {
  if (!change && change !== 0) return { text: "0.00%", isPositive: true };

  const isPositive = change >= 0;
  const formatted = Math.abs(change).toFixed(2);

  return {
    text: `${isPositive ? "+" : "-"}${formatted}%`,
    isPositive,
    value: change,
  };
};

/**
 * Get token info by contract address (detailed)
 */
export const getTokenInfoByContract = async (contractAddress, platformId) => {
  try {
    console.log("[CoinGecko] Fetching token info for:", contractAddress);

    const response = await fetch(
      `${COINGECKO_API_BASE}/coins/${platformId}/contract/${contractAddress}`,
    );

    if (!response.ok) {
      return null;
    }

    const data = await response.json();

    return {
      id: data.id,
      symbol: data.symbol,
      name: data.name,
      description: data.description?.en,
      image: data.image?.large || data.image?.small,
      market_data: data.market_data,
      contract_address: data.contract_address,
      platforms: data.platforms,
    };
  } catch (error) {
    console.error("[CoinGecko] Error fetching token info:", error);
    return null;
  }
};

// Export default object with all functions
export default {
  // Price functions
  getTokenPrice,
  getTokenPriceByContract,
  getCoinPrices,
  getCoinPriceBySymbol,
  getAllNativePrices,

  // Token info
  getCoinDetails,
  getTokenInfoByContract,
  searchToken,
  getTokenLogo,

  // Chart data
  getCoinChart,

  // Utilities
  getCoinIdFromSymbol,
  getPlatformId,
  formatPriceChange,
  clearCache,
};
