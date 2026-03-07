// API Configuration
export const API_CONFIG = {
  // Development
  DEV_BASE_URL: "http://192.168.0.219:3000/api",

  // Production - Update this when you deploy your backend"http://192.168.0.219:3000/api" || "http://10.157.79.37:3000/api"
  PROD_BASE_URL: "https://backend.awarizon.com/api",

  // Use this in your code
  BASE_URL: __DEV__
    ? "http://192.168.0.219:3000/api"
    : "https://backend.awarizon.com/api",

  // Endpoints
  ENDPOINTS: {
    TOKENS: "/tokens",
    CHAINS: "/tokens/chains",
    TOKEN_BY_CHAIN: (chainId) => `/tokens/chain/${chainId}`,
    TOKEN_BY_ADDRESS: (chainId, address) =>
      `/tokens/chain/${chainId}/address/${address}`,
    SEARCH: (query, chainId) =>
      `/tokens/search?query=${query}${chainId ? `&chainId=${chainId}` : ""}`,
  },

  // Cache duration (1 hour)
  CACHE_DURATION: 60 * 60 * 1000,
};
