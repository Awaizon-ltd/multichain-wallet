// services/CoinGeckoService.js
import axios from 'axios';

const COINGECKO_API_BASE = 'https://api.coingecko.com/api/v3';
const COINGECKO_PRO_API_BASE = 'https://pro-api.coingecko.com/api/v3';

// Free API doesn't require key, but rate limited to 10-50 calls/minute
// Pro API requires key: https://www.coingecko.com/en/api/pricing

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
      'Accept': 'application/json',
    };
    
    if (this.apiKey) {
      headers['x-cg-pro-api-key'] = this.apiKey;
    }
    
    return headers;
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
   * Search for token by contract address
   * Returns coin ID needed for other API calls
   */
  async searchTokenByContract(contractAddress, platform = 'ethereum') {
    try {
      const cacheKey = `search_${platform}_${contractAddress.toLowerCase()}`;
      const cached = this.getFromCache(cacheKey);
      if (cached) return cached;

      console.log('[CoinGecko] Searching for token:', contractAddress);

      const response = await axios.get(
        `${this.baseURL}/coins/${platform}/contract/${contractAddress}`,
        { headers: this.getHeaders() }
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
      console.error('[CoinGecko] Error searching token:', error.response?.data || error.message);
      return null;
    }
  }

  /**
   * Get token price in USD
   */
  async getTokenPrice(contractAddress, platform = 'ethereum') {
    try {
      const cacheKey = `price_${platform}_${contractAddress.toLowerCase()}`;
      const cached = this.getFromCache(cacheKey);
      if (cached) return cached;

      console.log('[CoinGecko] Fetching price for:', contractAddress);

      const response = await axios.get(
        `${this.baseURL}/simple/token_price/${platform}`,
        {
          params: {
            contract_addresses: contractAddress,
            vs_currencies: 'usd',
            include_24hr_change: true,
          },
          headers: this.getHeaders(),
        }
      );

      const data = response.data[contractAddress.toLowerCase()];
      
      if (!data) {
        console.log('[CoinGecko] No price data found');
        return null;
      }

      const priceData = {
        usd: data.usd,
        usd_24h_change: data.usd_24h_change,
      };

      this.setCache(cacheKey, priceData);
      return priceData;
    } catch (error) {
      console.error('[CoinGecko] Error fetching price:', error.response?.data || error.message);
      return null;
    }
  }

  /**
   * Get multiple token prices at once (more efficient)
   */
  async getMultipleTokenPrices(contractAddresses, platform = 'ethereum') {
    try {
      if (!contractAddresses || contractAddresses.length === 0) {
        return {};
      }

      console.log('[CoinGecko] Fetching prices for', contractAddresses.length, 'tokens');

      // Check cache first
      const prices = {};
      const uncachedAddresses = [];

      for (const address of contractAddresses) {
        const cacheKey = `price_${platform}_${address.toLowerCase()}`;
        const cached = this.getFromCache(cacheKey);
        if (cached) {
          prices[address.toLowerCase()] = cached;
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
                contract_addresses: chunk.join(','),
                vs_currencies: 'usd',
                include_24hr_change: true,
              },
              headers: this.getHeaders(),
            }
          );

          // Store in cache and results
          for (const [address, data] of Object.entries(response.data)) {
            const priceData = {
              usd: data.usd,
              usd_24h_change: data.usd_24h_change,
            };
            prices[address] = priceData;
            this.setCache(`price_${platform}_${address}`, priceData);
          }
        }
      }

      console.log('[CoinGecko] ✅ Fetched prices for', Object.keys(prices).length, 'tokens');
      return prices;
    } catch (error) {
      console.error('[CoinGecko] Error fetching multiple prices:', error.response?.data || error.message);
      return {};
    }
  }

  /**
   * Get token logo/image
   */
  async getTokenLogo(contractAddress, platform = 'ethereum') {
    try {
      const tokenData = await this.searchTokenByContract(contractAddress, platform);
      return tokenData?.image || null;
    } catch (error) {
      console.error('[CoinGecko] Error fetching logo:', error.message);
      return null;
    }
  }

  /**
   * Get platform ID for chain
   */
  getPlatformId(chainId) {
    const platformMap = {
      1: 'ethereum',
      56: 'binance-smart-chain',
      137: 'polygon-pos',
      42161: 'arbitrum-one',
      10: 'optimistic-ethereum',
      8453: 'base',
      43114: 'avalanche',
      250: 'fantom',
      100: 'xdai',
      42220: 'celo',
      1284: 'moonbeam',
      1285: 'moonriver',
      25: 'cronos',
      // Testnets (CoinGecko doesn't have testnet data)
      11155111: 'ethereum', // Sepolia
      84532: 'base', // Base Sepolia
      80001: 'polygon-pos', // Mumbai
    };

    return platformMap[chainId] || 'ethereum';
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
    if (!change && change !== 0) return { text: 'N/A', color: 'gray' };
    
    const formatted = change.toFixed(2);
    const text = change > 0 ? `+${formatted}%` : `${formatted}%`;
    const color = change > 0 ? 'green' : change < 0 ? 'red' : 'gray';
    
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
 */