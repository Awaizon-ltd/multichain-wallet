// services/CoinGeckoService.js
import axios from "axios";

const COINGECKO_API_BASE = "https://api.coingecko.com/api/v3";
const COINGECKO_PRO_API_BASE = "https://pro-api.coingecko.com/api/v3";

// Free API doesn't require key, but rate limited to 10-50 calls/minute
// Pro API requires key: https://www.coingecko.com/en/api/pricing

// Platforms whose contract/mint addresses are case-sensitive (base58).
// Lowercasing these corrupts the address, so they must be left as-is.
const CASE_SENSITIVE_PLATFORMS = new Set(["solana"]);

class CoinGeckoService {
  constructor(apiKey = null) {
    this.apiKey = apiKey;
    this.baseURL = apiKey ? COINGECKO_PRO_API_BASE : COINGECKO_API_BASE;
    this.cache = new Map();
    this.cacheExpiry = 5 * 60 * 1000; // 5 minutes
  }

  /**
   * Get headers for API requests
   */
  getHeaders() {
    const headers = {
      Accept: "application/json",
    };

    if (this.apiKey) {
      headers["x-cg-pro-api-key"] = this.apiKey;
    }

    return headers;
  }

  /**
   * Normalize a contract address for cache keys and result maps.
   * EVM addresses are case-insensitive (lowercased); Solana mints are not.
   */
  normalizeAddress(address, platform = "ethereum") {
    return CASE_SENSITIVE_PLATFORMS.has(platform)
      ? address
      : address.toLowerCase();
  }

  /**
   * Check if cached data is still valid
   */
  isCacheValid(key) {
    const cached = this.cache.get(key);
    if (!cached) return false;
    return Date.now() - cached.timestamp < this.cacheExpiry;
  }

  /**
   * Get from cache or return null
   */
  getFromCache(key) {
    if (this.isCacheValid(key)) {
      return this.cache.get(key).data;
    }
    return null;
  }

  /**
   * Set cache
   */
  setCache(key, data) {
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
    });
  }

  /**
   * Search for token by contract address (or SPL mint when platform = 'solana')
   * Returns coin ID needed for other API calls
   */
  async searchTokenByContract(contractAddress, platform = "ethereum") {
    try {
      const cacheKey = `search_${platform}_${this.normalizeAddress(contractAddress, platform)}`;
      const cached = this.getFromCache(cacheKey);
      if (cached) return cached;

      console.log("[CoinGecko] Searching for token:", contractAddress);

      const response = await axios.get(
        `${this.baseURL}/coins/${platform}/contract/${contractAddress}`,
        { headers: this.getHeaders() },
      );

      const data = {
        id: response.data.id,
        symbol: response.data.symbol,
        name: response.data.name,
        image: response.data.image?.large || response.data.image?.small,
        marketData: response.data.market_data,
      };

      this.setCache(cacheKey, data);
      return data;
    } catch (error) {
      console.error(
        "[CoinGecko] Error searching token:",
        error.response?.data || error.message,
      );
      return null;
    }
  }

  /**
   * Get token price in USD
   */
  async getTokenPrice(contractAddress, platform = "ethereum") {
    try {
      const normalized = this.normalizeAddress(contractAddress, platform);
      const cacheKey = `price_${platform}_${normalized}`;
      const cached = this.getFromCache(cacheKey);
      if (cached) return cached;

      console.log("[CoinGecko] Fetching price for:", contractAddress);

      const response = await axios.get(
        `${this.baseURL}/simple/token_price/${platform}`,
        {
          params: {
            contract_addresses: contractAddress,
            vs_currencies: "usd",
            include_24hr_change: true,
          },
          headers: this.getHeaders(),
        },
      );

      // Exact match first (Solana), then case-insensitive (EVM returns lowercase keys)
      const data =
        response.data[contractAddress] ||
        response.data[contractAddress.toLowerCase()];

      if (!data) {
        console.log("[CoinGecko] No price data found");
        return null;
      }

      const priceData = {
        usd: data.usd,
        usd_24h_change: data.usd_24h_change,
      };

      this.setCache(cacheKey, priceData);
      return priceData;
    } catch (error) {
      console.error(
        "[CoinGecko] Error fetching price:",
        error.response?.data || error.message,
      );
      return null;
    }
  }

  /**
   * Get multiple token prices at once (more efficient)
   * Result is keyed by normalized address: lowercase for EVM, original case for Solana.
   */
  async getMultipleTokenPrices(contractAddresses, platform = "ethereum") {
    try {
      if (!contractAddresses || contractAddresses.length === 0) {
        return {};
      }

      console.log(
        "[CoinGecko] Fetching prices for",
        contractAddresses.length,
        "tokens",
      );

      // Check cache first
      const prices = {};
      const uncachedAddresses = [];

      for (const address of contractAddresses) {
        const key = this.normalizeAddress(address, platform);
        const cached = this.getFromCache(`price_${platform}_${key}`);
        if (cached) {
          prices[key] = cached;
        } else {
          uncachedAddresses.push(address);
        }
      }

      // Fetch uncached prices
      if (uncachedAddresses.length > 0) {
        // CoinGecko allows up to 100 addresses per call
        const chunks = [];
        for (let i = 0; i < uncachedAddresses.length; i += 100) {
          chunks.push(uncachedAddresses.slice(i, i + 100));
        }

        for (const chunk of chunks) {
          const response = await axios.get(
            `${this.baseURL}/simple/token_price/${platform}`,
            {
              params: {
                contract_addresses: chunk.join(","),
                vs_currencies: "usd",
                include_24hr_change: true,
              },
              headers: this.getHeaders(),
            },
          );

          // Match response entries back to the addresses we asked for
          const byLowerKey = {};
          for (const [respKey, respData] of Object.entries(response.data)) {
            byLowerKey[respKey.toLowerCase()] = respData;
          }

          for (const address of chunk) {
            const data =
              response.data[address] || byLowerKey[address.toLowerCase()];
            if (!data) continue;

            const key = this.normalizeAddress(address, platform);
            const priceData = {
              usd: data.usd,
              usd_24h_change: data.usd_24h_change,
            };
            prices[key] = priceData;
            this.setCache(`price_${platform}_${key}`, priceData);
          }
        }
      }

      console.log(
        "[CoinGecko] ✅ Fetched prices for",
        Object.keys(prices).length,
        "tokens",
      );
      return prices;
    } catch (error) {
      console.error(
        "[CoinGecko] Error fetching multiple prices:",
        error.response?.data || error.message,
      );
      return {};
    }
  }

  /**
   * Get prices for native/major coins by CoinGecko coin id
   * (e.g. ['solana', 'ethereum']). Token-contract endpoints don't cover these.
   * Returns { [coinId]: { usd, usd_24h_change } }
   */
  async getCoinPrices(coinIds) {
    try {
      if (!coinIds || coinIds.length === 0) {
        return {};
      }

      const prices = {};
      const uncachedIds = [];

      for (const id of coinIds) {
        const cached = this.getFromCache(`coin_${id}`);
        if (cached) {
          prices[id] = cached;
        } else {
          uncachedIds.push(id);
        }
      }

      if (uncachedIds.length > 0) {
        const response = await axios.get(`${this.baseURL}/simple/price`, {
          params: {
            ids: uncachedIds.join(","),
            vs_currencies: "usd",
            include_24hr_change: true,
          },
          headers: this.getHeaders(),
        });

        for (const [id, data] of Object.entries(response.data)) {
          const priceData = {
            usd: data.usd,
            usd_24h_change: data.usd_24h_change,
          };
          prices[id] = priceData;
          this.setCache(`coin_${id}`, priceData);
        }
      }

      return prices;
    } catch (error) {
      console.error(
        "[CoinGecko] Error fetching coin prices:",
        error.response?.data || error.message,
      );
      return {};
    }
  }

  /**
   * Get SOL price in USD
   */
  async getSolPrice() {
    const prices = await this.getCoinPrices(["solana"]);
    return prices.solana || null;
  }

  /**
   * Get token logo/image
   */
  async getTokenLogo(contractAddress, platform = "ethereum") {
    try {
      const tokenData = await this.searchTokenByContract(
        contractAddress,
        platform,
      );
      return tokenData?.image || null;
    } catch (error) {
      console.error("[CoinGecko] Error fetching logo:", error.message);
      return null;
    }
  }

  /**
   * Get platform ID for chain.
   * Accepts a numeric EVM chain id, or a non-EVM chain key such as 'SOLANA'.
   */
  getPlatformId(chainId) {
    const platformMap = {
      1: "ethereum",
      56: "binance-smart-chain",
      137: "polygon-pos",
      42161: "arbitrum-one",
      10: "optimistic-ethereum",
      8453: "base",
      43114: "avalanche",
      250: "fantom",
      100: "xdai",
      42220: "celo",
      1284: "moonbeam",
      1285: "moonriver",
      25: "cronos",
      // Non-EVM
      SOLANA: "solana",
      // Testnets (CoinGecko doesn't have testnet data)
      11155111: "ethereum", // Sepolia
      84532: "base", // Base Sepolia
      80001: "polygon-pos", // Mumbai
    };

    const key = typeof chainId === "string" ? chainId.toUpperCase() : chainId;
    return platformMap[key] || "ethereum";
  }

  /**
   * Calculate USD value for token amount
   */
  calculateUSDValue(tokenAmount, priceData) {
    if (!priceData || !priceData.usd) return 0;
    const amount = parseFloat(tokenAmount);
    return amount * priceData.usd;
  }

  /**
   * Format price change with color indicator
   */
  formatPriceChange(change) {
    if (!change && change !== 0) return { text: "N/A", color: "gray" };

    const formatted = change.toFixed(2);
    const text = change > 0 ? `+${formatted}%` : `${formatted}%`;
    const color = change > 0 ? "green" : change < 0 ? "red" : "gray";

    return { text, color };
  }

  /**
   * Clear cache
   */
  clearCache() {
    this.cache.clear();
  }

  /**
   * Get cache size
   */
  getCacheSize() {
    return this.cache.size;
  }
}

// Export singleton instance
const coinGeckoService = new CoinGeckoService();

export default coinGeckoService;

// Export class for custom instances
export { CoinGeckoService };

/**
 * USAGE EXAMPLES:
 *
 * // Get single token price
 * const price = await coinGeckoService.getTokenPrice('0x...', 'ethereum');
 * console.log('Price:', price.usd);
 *
 * // Get multiple prices
 * const prices = await coinGeckoService.getMultipleTokenPrices(['0x...', '0x...'], 'ethereum');
 *
 * // Get token logo
 * const logo = await coinGeckoService.getTokenLogo('0x...', 'ethereum');
 *
 * // Calculate USD value
 * const usdValue = coinGeckoService.calculateUSDValue('123.456', price);
 *
 * // Get platform ID from chain ID
 * const platform = coinGeckoService.getPlatformId(1); // 'ethereum'
 *
 * // SOLANA
 * const sol = await coinGeckoService.getSolPrice(); // native SOL
 * const platformId = coinGeckoService.getPlatformId('SOLANA'); // 'solana'
 * const splPrices = await coinGeckoService.getMultipleTokenPrices(
 *   ['EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'], // USDC mint
 *   'solana'
 * );
 * // Keys keep the mint's original case: splPrices['EPjF...Dt1v']
 */
