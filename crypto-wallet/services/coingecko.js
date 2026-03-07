// Enhanced CoinGecko Service - Handles both native assets and ERC20 tokens

const COINGECKO_API_BASE = "https://api.coingecko.com/api/v3";

// Map chain symbols to CoinGecko IDs (for native assets)
const COIN_ID_MAP = {
  ETH: "ethereum",
  MATIC: "matic-network",
  BNB: "binancecoin",
  AVAX: "avalanche-2",
  OP: "optimism",
  ARB: "arbitrum",
  MNT: "mantle",
};

// Map chain IDs to CoinGecko platform IDs (for ERC20 tokens)
const PLATFORM_ID_MAP = {
  1: "ethereum", // Ethereum
  56: "binance-smart-chain", // BSC
  137: "polygon-pos", // Polygon
  42161: "arbitrum-one", // Arbitrum
  10: "optimistic-ethereum", // Optimism
  43114: "avalanche", // Avalanche
  5000: "mantle", // Mantle
  8453: "base", // Base
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
  WMATIC: "wmatic",
  WBNB: "wbnb",
  WAVAX: "wrapped-avax",
};

// Cache for token prices (5 minute cache)
let priceCache = new Map();
let cacheTimestamps = new Map();
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

/**
 * Clear the price cache
 */
export const clearCache = () => {
  priceCache.clear();
  cacheTimestamps.clear();
};

/**
 * Check if cache is still valid
 */
const isCacheValid = (key) => {
  const timestamp = cacheTimestamps.get(key);
  if (!timestamp) return false;
  return Date.now() - timestamp < CACHE_DURATION;
};

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
 * Get token price and data by contract address (for ERC20 tokens)
 */
export const getTokenPriceByContract = async (contractAddress, platformId) => {
  try {
    const cacheKey = `${platformId}:${contractAddress.toLowerCase()}`;

    // Check cache first
    if (isCacheValid(cacheKey)) {
      console.log("[CoinGecko] Cache hit for:", cacheKey);
      return priceCache.get(cacheKey);
    }

    console.log(
      "[CoinGecko] Fetching price for contract:",
      contractAddress,
      "on",
      platformId,
    );

    const response = await fetch(
      `${COINGECKO_API_BASE}/simple/token_price/${platformId}?contract_addresses=${contractAddress}&vs_currencies=usd&include_24hr_change=true&include_24hr_vol=true&include_market_cap=true`,
    );

    if (!response.ok) {
      console.warn("[CoinGecko] Failed to fetch token price:", response.status);
      return null;
    }

    const data = await response.json();
    const tokenData = data[contractAddress.toLowerCase()];

    if (!tokenData) {
      console.warn("[CoinGecko] No data found for token:", contractAddress);
      return null;
    }

    const result = {
      usd: tokenData.usd,
      usd_24h_change: tokenData.usd_24h_change,
      usd_24h_vol: tokenData.usd_24h_vol,
      usd_market_cap: tokenData.usd_market_cap,
    };

    // Cache the result
    priceCache.set(cacheKey, result);
    cacheTimestamps.set(cacheKey, Date.now());

    return result;
  } catch (error) {
    console.error("[CoinGecko] Error fetching token price by contract:", error);
    return null;
  }
};

/**
 * Get token price by symbol (tries multiple strategies)
 */
export const getTokenPrice = async (symbolOrAddress, chainId) => {
  try {
    // Strategy 1: Try as native token or known token by symbol
    const coinId = getCoinIdFromSymbol(symbolOrAddress);
    if (coinId) {
      console.log(
        "[CoinGecko] Fetching price by symbol:",
        symbolOrAddress,
        "→",
        coinId,
      );
      const prices = await getCoinPrices(coinId);
      return prices[coinId] || null;
    }

    // Strategy 2: If it looks like an address, try contract lookup
    if (symbolOrAddress.startsWith("0x") && symbolOrAddress.length === 42) {
      const platformId = getPlatformId(chainId);
      if (platformId) {
        console.log("[CoinGecko] Fetching price by contract address");
        return await getTokenPriceByContract(symbolOrAddress, platformId);
      }
    }

    // Strategy 3: Try to search for the token
    console.log("[CoinGecko] Trying to search for token:", symbolOrAddress);
    const searchResult = await searchToken(symbolOrAddress);
    if (searchResult) {
      const prices = await getCoinPrices(searchResult.id);
      return prices[searchResult.id] || null;
    }

    console.warn("[CoinGecko] Could not find price for:", symbolOrAddress);
    return null;
  } catch (error) {
    console.error("[CoinGecko] Error in getTokenPrice:", error);
    return null;
  }
};

/**
 * Get current prices for multiple coins by ID
 */
export const getCoinPrices = async (coinIds) => {
  try {
    const ids = Array.isArray(coinIds) ? coinIds.join(",") : coinIds;
    const cacheKey = `prices:${ids}`;

    // Check cache first
    if (isCacheValid(cacheKey)) {
      console.log("[CoinGecko] Cache hit for prices:", ids);
      return priceCache.get(cacheKey);
    }

    console.log("[CoinGecko] Fetching prices for coins:", ids);

    const response = await fetch(
      `${COINGECKO_API_BASE}/simple/price?ids=${ids}&vs_currencies=usd&include_24hr_change=true&include_24hr_vol=true&include_market_cap=true`,
    );

    if (!response.ok) {
      throw new Error("Failed to fetch prices");
    }

    const data = await response.json();

    // Cache the result
    priceCache.set(cacheKey, data);
    cacheTimestamps.set(cacheKey, Date.now());

    return data;
  } catch (error) {
    console.error("[CoinGecko] Error fetching coin prices:", error);
    return {};
  }
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
    console.log("[CoinGecko] Searching for:", query);

    const response = await fetch(
      `${COINGECKO_API_BASE}/search?query=${encodeURIComponent(query)}`,
    );

    if (!response.ok) {
      return null;
    }

    const data = await response.json();

    // Return the first coin match
    if (data.coins && data.coins.length > 0) {
      return {
        id: data.coins[0].id,
        symbol: data.coins[0].symbol,
        name: data.coins[0].name,
      };
    }

    return null;
  } catch (error) {
    console.error("[CoinGecko] Error searching token:", error);
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
 * Get detailed coin information
 */
export const getCoinDetails = async (coinId) => {
  try {
    const cacheKey = `details:${coinId}`;

    // Check cache (longer cache for details - 1 hour)
    const timestamp = cacheTimestamps.get(cacheKey);
    if (timestamp && Date.now() - timestamp < 60 * 60 * 1000) {
      console.log("[CoinGecko] Cache hit for details:", coinId);
      return priceCache.get(cacheKey);
    }

    console.log("[CoinGecko] Fetching details for:", coinId);

    const response = await fetch(
      `${COINGECKO_API_BASE}/coins/${coinId}?localization=false&tickers=false&community_data=false&developer_data=false`,
    );

    if (!response.ok) {
      throw new Error("Failed to fetch coin details");
    }

    const data = await response.json();

    // Cache the result
    priceCache.set(cacheKey, data);
    cacheTimestamps.set(cacheKey, Date.now());

    return data;
  } catch (error) {
    console.error("[CoinGecko] Error fetching coin details:", error);
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
