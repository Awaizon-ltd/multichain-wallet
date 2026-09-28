// utils/alchemy.js
import { Alchemy, Network } from "alchemy-sdk";

// Alchemy API Keys
const ALCHEMY_API_KEYS = {
  ethereum: "tlYzVPHTMFIk9YDQyrzrQ",
  base: "tlYzVPHTMFIk9YDQyrzrQ",
  arbitrum: "tlYzVPHTMFIk9YDQyrzrQ",
  polygon: "tlYzVPHTMFIk9YDQyrzrQ",
  avalanche: "tlYzVPHTMFIk9YDQyrzrQ",
  bsc: "tlYzVPHTMFIk9YDQyrzrQ",
};

// Map chain IDs to Alchemy Networks
export const ALCHEMY_NETWORK_MAP = {
  1: Network.ETH_MAINNET,
  8453: Network.BASE_MAINNET,
  // Arc (5042) / Robinhood Chain (4663): not yet in alchemy-sdk's Network
  // enum — see CHAINS_WITHOUT_NFT_API_SUPPORT / MANUAL_FETCH_CHAINS, which
  // route around Alchemy entirely for these two chains.
  42161: Network.ARB_MAINNET,
  137: Network.MATIC_MAINNET,
  43114: Network.AVAX_MAINNET,
  56: Network.BNB_MAINNET,
};

// Cache for Alchemy instances
const alchemyInstanceCache = new Map();

/**
 * Get Alchemy instance for a specific chain (cached)
 */
export const getAlchemyInstance = (chainId) => {
  console.log(
    "[getAlchemyInstance] Received chainId:",
    chainId,
    "Type:",
    typeof chainId,
  );

  // Check cache first
  if (alchemyInstanceCache.has(chainId)) {
    console.log(
      "[getAlchemyInstance] Returning cached instance for chain:",
      chainId,
    );
    return alchemyInstanceCache.get(chainId);
  }

  const network = ALCHEMY_NETWORK_MAP[chainId];

  if (!network) {
    console.error(
      "[getAlchemyInstance] Available chain IDs:",
      Object.keys(ALCHEMY_NETWORK_MAP),
    );
    throw new Error(`Alchemy not supported for chain ${chainId}`);
  }

  const apiKey = Object.values(ALCHEMY_API_KEYS)[0];
  console.log(
    "[getAlchemyInstance] Creating Alchemy instance for network:",
    network,
  );

  const instance = new Alchemy({
    apiKey,
    network,
  });

  // Cache the instance
  alchemyInstanceCache.set(chainId, instance);

  return instance;
};

/**
 * Clear Alchemy instance cache
 */
export const clearAlchemyCache = (chainId = null) => {
  if (chainId !== null) {
    alchemyInstanceCache.delete(chainId);
    console.log(`[clearAlchemyCache] Cleared cache for chain ${chainId}`);
  } else {
    alchemyInstanceCache.clear();
    console.log("[clearAlchemyCache] Cleared all cached instances");
  }
};

/**
 * Check if chain is supported by Alchemy
 */
export const isAlchemySupported = (chainId) => {
  return ALCHEMY_NETWORK_MAP.hasOwnProperty(chainId);
};

/**
 * Get all supported chain IDs
 */
export const getAlchemySupportedChainIds = () => {
  return Object.keys(ALCHEMY_NETWORK_MAP).map(Number);
};

/**
 * Get Alchemy network for chain ID
 */
export const getAlchemyNetwork = (chainId) => {
  return ALCHEMY_NETWORK_MAP[chainId] || null;
};
