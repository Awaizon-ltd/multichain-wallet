// utils/providers.js
import { ethers } from "ethers";

/**
 * Provider pool - reuse provider instances per chain
 * This prevents creating multiple connections to the same RPC endpoint
 */
const providerPool = new Map();

/**
 * Cached network info with TTL
 */
const networkInfoCache = new Map();
const NETWORK_INFO_TTL = 60000; // 1 minute (block number changes frequently)

/**
 * Block number cache with short TTL
 */
const blockNumberCache = new Map();
const BLOCK_NUMBER_TTL = 12000; // 12 seconds (approximate block time)

/**
 * Validate chain object
 */
export const validateChain = (chain, functionName) => {
  console.log(`[${functionName}] Received chain:`, chain);

  if (!chain) {
    throw new Error(`[${functionName}] Chain object is undefined or null`);
  }

  if (!chain.id) {
    console.error(
      `[${functionName}] Chain object missing 'id' property:`,
      JSON.stringify(chain),
    );
    throw new Error(`[${functionName}] Chain object is missing 'id' property`);
  }

  console.log(`[${functionName}] Chain ID:`, chain.id);
  return true;
};

/**
 * Create provider for reading blockchain data
 * CACHED - Reuses provider instances per chain
 */
export const createProviderForChain = (chain) => {
  validateChain(chain, "createProviderForChain");

  // Check if provider already exists in pool
  const cacheKey = `${chain.id}-${chain.rpcUrl}`;

  if (providerPool.has(cacheKey)) {
    console.log(
      `[createProviderForChain] Reusing cached provider for ${chain.name}`,
    );
    return providerPool.get(cacheKey);
  }

  // Create new provider and add to pool
  console.log(
    `[createProviderForChain] Creating new provider for ${chain.name}`,
  );
  const provider = new ethers.JsonRpcProvider(chain.rpcUrl);

  // Add error event listener to detect stale connections
  provider.on("error", (error) => {
    console.error(`[Provider] Error on ${chain.name}:`, error);
    // Remove from pool on persistent errors
    if (error.code === "NETWORK_ERROR") {
      providerPool.delete(cacheKey);
    }
  });

  providerPool.set(cacheKey, provider);
  return provider;
};

/**
 * Create wallet for signing transactions
 * NOTE: Wallets are NOT cached (they contain private keys)
 */
export const createWalletForChain = (chain, privateKey) => {
  validateChain(chain, "createWalletForChain");
  const provider = createProviderForChain(chain);
  // Don't cache wallets - they're lightweight and contain sensitive data
  return new ethers.Wallet(privateKey, provider);
};

/**
 * Get provider instance with error handling
 * CACHED - Reuses existing provider
 */
export const getProviderSafe = async (chain) => {
  try {
    const provider = createProviderForChain(chain);
    // Test connection only if provider is new (not cached)
    const cacheKey = `${chain.id}-${chain.rpcUrl}`;
    const isNewProvider = !providerPool.has(cacheKey);

    if (isNewProvider) {
      console.log(`[getProviderSafe] Testing new connection to ${chain.name}`);
      await provider.getNetwork();
    }

    return provider;
  } catch (error) {
    console.error(
      `[getProviderSafe] Error connecting to ${chain.name}:`,
      error,
    );
    // Remove failed provider from pool
    const cacheKey = `${chain.id}-${chain.rpcUrl}`;
    providerPool.delete(cacheKey);
    throw new Error(`Failed to connect to ${chain.name}: ${error.message}`);
  }
};

/**
 * Get current block number
 * CACHED - 12 second TTL (approximate block time)
 */
export const getCurrentBlockNumber = async (chain) => {
  try {
    validateChain(chain, "getCurrentBlockNumber");

    const cacheKey = `block-${chain.id}`;
    const cached = blockNumberCache.get(cacheKey);

    // Check if cache is still valid
    if (cached && Date.now() - cached.timestamp < BLOCK_NUMBER_TTL) {
      console.log(
        `[getCurrentBlockNumber] Cache HIT for ${chain.name}: ${cached.value}`,
      );
      return cached.value;
    }

    // Fetch fresh block number
    const provider = createProviderForChain(chain);
    const blockNumber = await provider.getBlockNumber();

    // Cache the result
    blockNumberCache.set(cacheKey, {
      value: blockNumber,
      timestamp: Date.now(),
    });

    console.log(
      `[getCurrentBlockNumber] Cache MISS for ${chain.name}: ${blockNumber}`,
    );
    return blockNumber;
  } catch (error) {
    console.error("[getCurrentBlockNumber] Error:", error);
    throw error;
  }
};

/**
 * Get network information
 * CACHED - 1 minute TTL
 */
export const getNetworkInfo = async (chain) => {
  try {
    validateChain(chain, "getNetworkInfo");

    const cacheKey = `network-${chain.id}`;
    const cached = networkInfoCache.get(cacheKey);

    // Check if cache is still valid
    if (cached && Date.now() - cached.timestamp < NETWORK_INFO_TTL) {
      console.log(`[getNetworkInfo] Cache HIT for ${chain.name}`);
      return cached.value;
    }

    // Fetch fresh network info
    const provider = createProviderForChain(chain);
    const network = await provider.getNetwork();
    const blockNumber = await provider.getBlockNumber();

    const result = {
      chainId: Number(network.chainId),
      name: network.name,
      blockNumber,
    };

    // Cache the result
    networkInfoCache.set(cacheKey, {
      value: result,
      timestamp: Date.now(),
    });

    console.log(`[getNetworkInfo] Cache MISS for ${chain.name}`);
    return result;
  } catch (error) {
    console.error("[getNetworkInfo] Error:", error);
    throw error;
  }
};

/**
 * Clear provider pool (useful for testing or resetting connections)
 */
export const clearProviderPool = () => {
  console.log("[clearProviderPool] Clearing all cached providers");

  // Remove all event listeners before clearing
  for (const provider of providerPool.values()) {
    provider.removeAllListeners();
  }

  providerPool.clear();
  networkInfoCache.clear();
  blockNumberCache.clear();
};

/**
 * Get provider pool statistics
 */
export const getProviderPoolStats = () => {
  return {
    providers: providerPool.size,
    networkInfoCached: networkInfoCache.size,
    blockNumbersCached: blockNumberCache.size,
    chains: Array.from(providerPool.keys()),
  };
};

/**
 * Periodic cleanup of expired caches
 */
setInterval(() => {
  const now = Date.now();

  // Clean expired network info
  for (const [key, value] of networkInfoCache.entries()) {
    if (now - value.timestamp > NETWORK_INFO_TTL) {
      networkInfoCache.delete(key);
    }
  }

  // Clean expired block numbers
  for (const [key, value] of blockNumberCache.entries()) {
    if (now - value.timestamp > BLOCK_NUMBER_TTL) {
      blockNumberCache.delete(key);
    }
  }
}, 60000); // Clean every minute

/**
 * Warmup provider connections for multiple chains
 * Useful on app initialization to pre-establish connections
 */
export const warmupProviders = async (chains) => {
  console.log(`[warmupProviders] Warming up ${chains.length} providers...`);

  const warmupPromises = chains.map(async (chain) => {
    try {
      await getProviderSafe(chain);
      console.log(`[warmupProviders] ✓ ${chain.name} ready`);
    } catch (error) {
      console.error(`[warmupProviders] ✗ ${chain.name} failed:`, error.message);
    }
  });

  await Promise.allSettled(warmupPromises);
  console.log(
    `[warmupProviders] Warmup complete. Stats:`,
    getProviderPoolStats(),
  );
};
