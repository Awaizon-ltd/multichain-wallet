/**
 * CoinGecko API Service
 * Fetches cryptocurrency prices, logos, and market data
 */

const COINGECKO_API_BASE = 'https://api.coingecko.com/api/v3';

// Common token mappings to CoinGecko IDs
const TOKEN_ID_MAP = {
  // Ethereum
  'ETH': 'ethereum',
  'WETH': 'weth',
  'USDC': 'usd-coin',
  'USDT': 'tether',
  'DAI': 'dai',
  'LINK': 'chainlink',
  'UNI': 'uniswap',
  'AAVE': 'aave',
  'COMP': 'compound-governance-token',
  'MKR': 'maker',
  'SNX': 'havven',
  'WBTC': 'wrapped-bitcoin',
  
  // Binance Smart Chain
  'BNB': 'binancecoin',
  'WBNB': 'wbnb',
  'CAKE': 'pancakeswap-token',
  'BUSD': 'binance-usd',
  
  // Polygon
  'MATIC': 'matic-network',
  'WMATIC': 'wmatic',
  
  // Arbitrum
  'ARB': 'arbitrum',
  
  // Optimism
  'OP': 'optimism',
  
  // Avalanche
  'AVAX': 'avalanche-2',
  'WAVAX': 'wrapped-avax',
  
  // Fantom
  'FTM': 'fantom',
  'WFTM': 'wrapped-fantom',
};

// Token logo fallback URLs
const LOGO_URLS = {
  'ETH': 'https://assets.coingecko.com/coins/images/279/small/ethereum.png',
  'BNB': 'https://assets.coingecko.com/coins/images/825/small/bnb-icon2_2x.png',
  'MATIC': 'https://assets.coingecko.com/coins/images/4713/small/matic-token-icon.png',
  'AVAX': 'https://assets.coingecko.com/coins/images/12559/small/coin-round-red.png',
  'FTM': 'https://assets.coingecko.com/coins/images/4001/small/Fantom.png',
  'ARB': 'https://assets.coingecko.com/coins/images/16547/small/photo_2023-03-29_21.47.00.jpeg',
  'OP': 'https://assets.coingecko.com/coins/images/25244/small/Optimism.png',
};

class CoinGeckoService {
  constructor() {
    this.cache = new Map();
    this.cacheExpiry = 60000; // 1 minute
    this.lastRequestTime = 0;
    this.requestDelay = 1000; // 1 second between requests (free tier limit)
  }

  /**
   * Get CoinGecko ID from token symbol
   */
  getCoinGeckoId(symbol) {
    return TOKEN_ID_MAP[symbol.toUpperCase()] || symbol.toLowerCase();
  }

  /**
   * Rate limiting helper
   */
  async waitForRateLimit() {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;
    if (timeSinceLastRequest < this.requestDelay) {
      await new Promise(resolve => 
        setTimeout(resolve, this.requestDelay - timeSinceLastRequest)
      );
    }
    this.lastRequestTime = Date.now();
  }

  /**
   * Fetch token price in USD
   */
  async getTokenPrice(symbol, contractAddress = null) {
    const cacheKey = `price_${symbol}_${contractAddress || 'native'}`;
    
    // Check cache
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.cacheExpiry) {
      return cached.data;
    }

    try {
      await this.waitForRateLimit();
      
      const coinId = this.getCoinGeckoId(symbol);
      const response = await fetch(
        `${COINGECKO_API_BASE}/simple/price?ids=${coinId}&vs_currencies=usd&include_24hr_change=true`
      );

      if (!response.ok) {
        throw new Error('Failed to fetch price');
      }

      const data = await response.json();
      const priceData = data[coinId];

      if (!priceData) {
        return null;
      }

      const result = {
        usd: priceData.usd,
        usd_24h_change: priceData.usd_24h_change || 0,
      };

      // Cache the result
      this.cache.set(cacheKey, {
        data: result,
        timestamp: Date.now(),
      });

      return result;
    } catch (error) {
      console.error(`Error fetching price for ${symbol}:`, error);
      return null;
    }
  }

  /**
   * Fetch multiple token prices at once
   */
  async getMultipleTokenPrices(tokens) {
    const coinIds = tokens
      .map(t => this.getCoinGeckoId(t.symbol))
      .filter((id, index, self) => self.indexOf(id) === index) // Remove duplicates
      .join(',');

    try {
      await this.waitForRateLimit();
      
      const response = await fetch(
        `${COINGECKO_API_BASE}/simple/price?ids=${coinIds}&vs_currencies=usd&include_24hr_change=true`
      );

      if (!response.ok) {
        throw new Error('Failed to fetch prices');
      }

      const data = await response.json();

      // Map prices back to tokens
      return tokens.map(token => {
        const coinId = this.getCoinGeckoId(token.symbol);
        const priceData = data[coinId];

        return {
          ...token,
          price: priceData ? {
            usd: priceData.usd,
            usd_24h_change: priceData.usd_24h_change || 0,
          } : null,
        };
      });
    } catch (error) {
      console.error('Error fetching multiple prices:', error);
      return tokens.map(t => ({ ...t, price: null }));
    }
  }

  /**
   * Get token logo URL
   */
  async getTokenLogo(symbol, contractAddress = null) {
    // Check if we have a hardcoded logo
    if (LOGO_URLS[symbol.toUpperCase()]) {
      return LOGO_URLS[symbol.toUpperCase()];
    }

    try {
      await this.waitForRateLimit();
      
      const coinId = this.getCoinGeckoId(symbol);
      const response = await fetch(
        `${COINGECKO_API_BASE}/coins/${coinId}`
      );

      if (!response.ok) {
        return null;
      }

      const data = await response.json();
      return data.image?.small || data.image?.thumb || null;
    } catch (error) {
      console.error(`Error fetching logo for ${symbol}:`, error);
      return null;
    }
  }

  /**
   * Get token info including logo and price
   */
  async getTokenInfo(symbol, contractAddress = null) {
    const cacheKey = `info_${symbol}_${contractAddress || 'native'}`;
    
    // Check cache
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.cacheExpiry) {
      return cached.data;
    }

    try {
      await this.waitForRateLimit();
      
      const coinId = this.getCoinGeckoId(symbol);
      const response = await fetch(
        `${COINGECKO_API_BASE}/coins/${coinId}?localization=false&tickers=false&community_data=false&developer_data=false`
      );

      if (!response.ok) {
        return null;
      }

      const data = await response.json();
      
      const result = {
        logo: data.image?.small || data.image?.thumb || LOGO_URLS[symbol.toUpperCase()] || null,
        price: {
          usd: data.market_data?.current_price?.usd || 0,
          usd_24h_change: data.market_data?.price_change_percentage_24h || 0,
        },
        name: data.name,
        symbol: data.symbol?.toUpperCase(),
      };

      // Cache the result
      this.cache.set(cacheKey, {
        data: result,
        timestamp: Date.now(),
      });

      return result;
    } catch (error) {
      console.error(`Error fetching info for ${symbol}:`, error);
      return null;
    }
  }

  /**
   * Search for token by contract address
   */
  async searchTokenByContract(contractAddress, platform = 'ethereum') {
    try {
      await this.waitForRateLimit();
      
      const response = await fetch(
        `${COINGECKO_API_BASE}/coins/${platform}/contract/${contractAddress}`
      );

      if (!response.ok) {
        return null;
      }

      const data = await response.json();
      
      return {
        logo: data.image?.small || data.image?.thumb || null,
        price: {
          usd: data.market_data?.current_price?.usd || 0,
          usd_24h_change: data.market_data?.price_change_percentage_24h || 0,
        },
        name: data.name,
        symbol: data.symbol?.toUpperCase(),
      };
    } catch (error) {
      console.error(`Error searching token by contract:`, error);
      return null;
    }
  }

  /**
   * Get platform ID for CoinGecko based on chain ID
   */
  getPlatformId(chainId) {
    const platformMap = {
      1: 'ethereum',
      56: 'binance-smart-chain',
      137: 'polygon-pos',
      42161: 'arbitrum-one',
      10: 'optimistic-ethereum',
      43114: 'avalanche',
      250: 'fantom',
    };
    return platformMap[chainId] || 'ethereum';
  }

  /**
   * Clear cache
   */
  clearCache() {
    this.cache.clear();
  }
}

// Export singleton instance
export default new CoinGeckoService();