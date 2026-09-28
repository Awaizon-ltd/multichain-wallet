// utils/providers.js
import { ethers } from "ethers";
import { AppState } from "react-native";

// ─── Cache TTLs ───────────────────────────────────────────────────────────────

const NETWORK_INFO_TTL = 60_000; // 1 min — chain metadata rarely changes
const BLOCK_NUMBER_TTL = 12_000; // 12 s  — one ETH block
const CLEANUP_INTERVAL = 60_000; // how often to evict expired cache entries

// ─── Storage ──────────────────────────────────────────────────────────────────

// Providers are keyed by `${chainId}-${rpcUrl}` so swapping RPC on the same
// chain creates a fresh provider rather than reusing a stale one.
const providerPool = new Map(); // cacheKey → ethers.JsonRpcProvider
const networkInfoCache = new Map(); // cacheKey → { value, timestamp }
const blockNumberCache = new Map(); // cacheKey → { value, timestamp }

// ─── Validation ───────────────────────────────────────────────────────────────

/**
 * Throws if `chain` is missing required fields.
 * No logging — callers log if they need to.
 */
export const validateChain = (chain, fnName = "validateChain") => {
  if (!chain) throw new Error(`[${fnName}] chain is null/undefined`);
  if (!chain.id) throw new Error(`[${fnName}] chain.id is missing`);
  if (!chain.rpcUrl) throw new Error(`[${fnName}] chain.rpcUrl is missing`);
};

// ─── Provider factory ─────────────────────────────────────────────────────────

/**
 * Get (or create) a cached JsonRpcProvider for a chain.
 *
 * Passing `{ chainId, name }` to JsonRpcProvider tells ethers the network
 * upfront — this avoids an automatic eth_chainId call on first use, saving
 * one RPC round-trip per new provider.
 */
export const createProviderForChain = (chain) => {
  validateChain(chain, "createProviderForChain");

  const cacheKey = `${chain.id}-${chain.rpcUrl}`;
  const existing = providerPool.get(cacheKey);
  if (existing) return existing;

  const provider = new ethers.JsonRpcProvider(chain.rpcUrl, {
    chainId: chain.id,
    name: chain.name ?? String(chain.id),
  });

  // Evict provider on network errors so the next call gets a fresh one
  provider.on("error", (error) => {
    __DEV__ && console.warn(`[Provider:${chain.name}] error:`, error?.code);
    if (error?.code === "NETWORK_ERROR") {
      provider.removeAllListeners();
      providerPool.delete(cacheKey);
    }
  });

  providerPool.set(cacheKey, provider);
  __DEV__ && console.log(`[Provider] created for ${chain.name}`);
  return provider;
};

// ─── Wallet factory ───────────────────────────────────────────────────────────

/**
 * Create a signing wallet. Never cached — wallets hold private keys.
 */
export const createWalletForChain = (chain, privateKey) => {
  validateChain(chain, "createWalletForChain");
  return new ethers.Wallet(privateKey, createProviderForChain(chain));
};

// ─── Safe provider (with connectivity test) ───────────────────────────────────

/**
 * Returns a provider for `chain`, testing connectivity for newly created ones.
 * Uses the cached provider directly if it already exists.
 */
export const getProviderSafe = async (chain) => {
  validateChain(chain, "getProviderSafe");

  const cacheKey = `${chain.id}-${chain.rpcUrl}`;
  const isNew = !providerPool.has(cacheKey); // check BEFORE creating
  const provider = createProviderForChain(chain);

  if (isNew) {
    try {
      // One eth_chainId call to confirm the endpoint is reachable
      await provider.getNetwork();
    } catch (error) {
      provider.removeAllListeners();
      providerPool.delete(cacheKey);
      throw new Error(
        `[getProviderSafe] ${chain.name} unreachable: ${error.message}`,
      );
    }
  }

  return provider;
};

// ─── Block number ─────────────────────────────────────────────────────────────

/**
 * Current block number, cached for BLOCK_NUMBER_TTL ms.
 * One eth_blockNumber call per cache miss.
 */
export const getCurrentBlockNumber = async (chain) => {
  validateChain(chain, "getCurrentBlockNumber");

  const cacheKey = `block-${chain.id}`;
  const cached = blockNumberCache.get(cacheKey);

  if (cached && Date.now() - cached.timestamp < BLOCK_NUMBER_TTL) {
    return cached.value;
  }

  const provider = createProviderForChain(chain);
  const blockNumber = await provider.getBlockNumber();

  blockNumberCache.set(cacheKey, { value: blockNumber, timestamp: Date.now() });
  return blockNumber;
};

// ─── Network info ─────────────────────────────────────────────────────────────

/**
 * Chain metadata, cached for NETWORK_INFO_TTL ms.
 * One eth_chainId call per cache miss — does NOT also fetch block number
 * (call getCurrentBlockNumber separately if you need it).
 */
export const getNetworkInfo = async (chain) => {
  validateChain(chain, "getNetworkInfo");

  const cacheKey = `network-${chain.id}`;
  const cached = networkInfoCache.get(cacheKey);

  if (cached && Date.now() - cached.timestamp < NETWORK_INFO_TTL) {
    return cached.value;
  }

  const provider = createProviderForChain(chain);
  const network = await provider.getNetwork();

  const result = {
    chainId: Number(network.chainId),
    name: network.name,
  };

  networkInfoCache.set(cacheKey, { value: result, timestamp: Date.now() });
  return result;
};

// ─── Pool management ──────────────────────────────────────────────────────────

/**
 * Destroy all cached providers and clear all caches.
 * Call on logout or when switching accounts.
 */
export const clearProviderPool = () => {
  for (const provider of providerPool.values()) {
    provider.removeAllListeners();
  }
  providerPool.clear();
  networkInfoCache.clear();
  blockNumberCache.clear();
  __DEV__ && console.log("[Provider] pool cleared");
};

export const getProviderPoolStats = () => ({
  providers: providerPool.size,
  networkInfoCached: networkInfoCache.size,
  blockNumbersCached: blockNumberCache.size,
  chains: Array.from(providerPool.keys()),
});

// ─── Warmup ───────────────────────────────────────────────────────────────────

/**
 * Pre-establish connections for multiple chains on app start.
 * Uses getProviderSafe so each new provider is connectivity-tested once.
 * Failures are swallowed — warmup is best-effort.
 */
export const warmupProviders = async (chains) => {
  await Promise.allSettled(
    chains.map((chain) =>
      getProviderSafe(chain).catch((err) => {
        __DEV__ && console.warn(`[warmup] ${chain.name} failed:`, err.message);
      }),
    ),
  );
  __DEV__ && console.log("[warmup] done.", getProviderPoolStats());
};

// ─── Cache cleanup ────────────────────────────────────────────────────────────
// Only runs while the app is active — stops when backgrounded.
// Cleaned up on module disposal (dev fast-refresh, etc.) via the returned handle.

let _cleanupTimer = null;

const scheduleCleanup = () => {
  _cleanupTimer = setInterval(() => {
    const now = Date.now();

    for (const [key, val] of networkInfoCache.entries()) {
      if (now - val.timestamp > NETWORK_INFO_TTL) networkInfoCache.delete(key);
    }
    for (const [key, val] of blockNumberCache.entries()) {
      if (now - val.timestamp > BLOCK_NUMBER_TTL) blockNumberCache.delete(key);
    }
  }, CLEANUP_INTERVAL);
};

const stopCleanup = () => {
  clearInterval(_cleanupTimer);
  _cleanupTimer = null;
};

// Pause cleanup when app is backgrounded, resume when foregrounded
AppState.addEventListener("change", (state) => {
  if (state === "active" && !_cleanupTimer) scheduleCleanup();
  if (state === "background" || state === "inactive") stopCleanup();
});

scheduleCleanup(); // start immediately on import
