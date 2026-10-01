// API Configuration
export const API_CONFIG = {
  // Development
  DEV_BASE_URL: "http://10.245.212.189:3030/api",

  // Production - Update this when you deploy your backend"http://192.168.0.219:3000/api" || "http://10.157.79.37:3000/api"
  PROD_BASE_URL: "https://api.awarizon.com/api",

  // Use this in your code
  BASE_URL: __DEV__
    ? "http://10.245.212.189:3030/api"
    : "https://api.awarizon.com/api",

  // Endpoints
  ENDPOINTS: {
    TOKENS: "/tokens",
    CHAINS: "/tokens/chains",
    TOKEN_BY_CHAIN: (chainId) => `/tokens/chain/${chainId}`,
    TOKEN_BY_ADDRESS: (chainId, address) =>
      `/tokens/chain/${chainId}/address/${address}`,
    SEARCH: (query, chainId) =>
      `/tokens/search?query=${query}${chainId ? `&chainId=${chainId}` : ""}`,
    // Bridge — LI.FI powered, works between any two supported chains
    BRIDGE_CHAINS: "/bridge/chains",
    BRIDGE_CONNECTIONS: "/bridge/connections",
    BRIDGE_QUOTE: "/bridge/quote",
    BRIDGE_STATUS_QUERY: "/bridge/status",

    // Swap (0x, same-chain) + aggregated (0x vs LI.FI, best price)
    SWAP_TOKENS: "/swap/tokens",
    SWAP_PRICE: "/swap/price",
    SWAP_PRICE_BEST: "/swap/price/best",
    SWAP_QUOTE: "/swap/quote",

    // Market data — CoinGecko, fetched + cached once by the backend for all wallets
    MARKET_TRENDING: "/market/trending",
    MARKET_RESOLVE: "/market/resolve",
    MARKET_COIN: (id) => `/market/coins/${encodeURIComponent(id)}`,
    MARKET_CHART: (id) => `/market/coins/${encodeURIComponent(id)}/chart`,
  },

  // Cache duration (1 hour)
  CACHE_DURATION: 60 * 60 * 1000,
};
