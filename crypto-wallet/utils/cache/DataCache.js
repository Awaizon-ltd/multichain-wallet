/**
 * DataCache — Main caching facade for the entire app
 *
 * Wraps CacheStore (TTL storage) + RequestQueue (deduplication) into
 * a typed API. Every data-fetching module routes through here.
 *
 * Key design:
 *   • withCache()  — stale-while-revalidate: return cached value instantly,
 *                    then revalidate in the background when stale
 *   • Key.*        — typed key factories (no magic strings at call sites)
 *   • TTL constants — tuned to balance freshness vs. Alchemy CU spend
 */

import store from "./CacheStore";
import queue from "./RequestQueue";

// ─── TTL constants (milliseconds) ────────────────────────────────────────────

export const TTL = {
  NATIVE_BALANCE:  30_000,   // 30s  — balance changes after sends/receives
  TOKEN_BALANCE:   30_000,   // 30s
  TOKEN_LIST:     300_000,   // 5min — user's token list changes rarely
  GAS_PRICE:       15_000,   // 15s  — gas moves fast during congestion
  PRICE_NATIVE:    60_000,   // 60s  — CoinGecko rate-limits aggressively
  PRICE_TOKEN:     60_000,   // 60s
  PRICE_BATCH:     60_000,   // 60s
  ALLOWANCE:       30_000,   // 30s

  // Backend REST calls (services/apiClient.js). These hit our own server, not
  // Alchemy directly, but caching them still avoids re-fetching on every
  // screen focus / chain switch and takes load off the backend.
  API_TOKEN_CATALOG: 600_000, // 10min — a chain's supported token list barely changes
  API_SHORT:          30_000, // 30s   — anything that can move within a session
};

// ─── Typed key factories ──────────────────────────────────────────────────────

export const Key = {
  nativeBalance:  (address, chainId)          => `nb:${chainId}:${address.toLowerCase()}`,
  tokenBalance:   (tokenAddr, walletAddr, chainId) => `tb:${chainId}:${tokenAddr.toLowerCase()}:${walletAddr.toLowerCase()}`,
  tokenBalances:  (walletAddr, chainId)        => `tbs:${chainId}:${walletAddr.toLowerCase()}`,
  // Distinct from tokenBalances() above — that one caches log-discovered
  // balances; this one caches the Multicall-batched lookup for a specific,
  // caller-supplied token list (e.g. the user's saved/enabled tokens).
  knownTokenBalances: (walletAddr, chainId)    => `ktb:${chainId}:${walletAddr.toLowerCase()}`,
  tokenList:      (walletAddr, chainId)        => `tl:${chainId}:${walletAddr.toLowerCase()}`,
  gasPrice:       (chainId)                    => `gas:${chainId}`,
  feeData:        (chainId)                    => `fee:${chainId}`,
  priceNative:    (coinId)                     => `pn:${coinId}`,
  priceToken:     (tokenAddr, chainId)         => `pt:${chainId}:${tokenAddr.toLowerCase()}`,
  priceBatch:     (coinIds)                    => `pb:${[...coinIds].sort().join(',')}`,
  allowance:      (tokenAddr, owner, spender, chainId) => `al:${chainId}:${tokenAddr.toLowerCase()}:${owner.toLowerCase()}:${spender.toLowerCase()}`,
  api:            (urlWithQuery)                       => `api:${urlWithQuery}`,
  // The fully-assembled Home screen portfolio (native + token assets, totals).
  // Persisted so the app can paint last-known balances instantly on cold
  // start instead of a skeleton, while a fresh fetch runs in the background.
  portfolioSnapshot: (walletAddr, enabledKey) => `pfsnap:${walletAddr.toLowerCase()}:${enabledKey}`,
};

// ─── Core API ─────────────────────────────────────────────────────────────────

/**
 * Stale-while-revalidate cache wrapper.
 *
 * @param {string}   cacheKey    — from Key.*
 * @param {number}   ttl         — from TTL.*
 * @param {function} fetcher     — async () => value
 * @param {object}   opts
 * @param {boolean}  opts.persist       — persist to SQLite (L2), survives app restarts
 * @param {function} opts.onRefresh     — (freshValue) => void — called when bg refresh completes
 * @param {boolean}  opts.forceRefresh  — skip cache entirely
 *
 * @returns {Promise<*>} cached value (possibly stale), or fresh value on first load
 */
export const withCache = async (cacheKey, ttl, fetcher, opts = {}) => {
  const { persist = false, onRefresh, forceRefresh = false } = opts;

  await store.hydrate(); // no-op after first call

  const cached = store.get(cacheKey);
  const isStale = forceRefresh || store.isStale(cacheKey, ttl);

  if (cached && !isStale) {
    // Cache is fresh — return immediately
    return cached.value;
  }

  if (cached && isStale && !forceRefresh) {
    // Stale-while-revalidate: return stale data now, refresh in background
    _revalidate(cacheKey, ttl, fetcher, { persist, onRefresh });
    return cached.value;
  }

  // No cache at all — must await the fetch
  return queue.execute(cacheKey, async () => {
    const value = await fetcher();
    store.set(cacheKey, value, { persist });
    return value;
  });
};

const _revalidate = (cacheKey, ttl, fetcher, { persist, onRefresh }) => {
  if (queue.has(cacheKey)) return; // already in-flight

  queue.execute(cacheKey, async () => {
    const value = await fetcher();
    store.set(cacheKey, value, { persist });
    onRefresh?.(value);
    return value;
  }).catch(() => {}); // background refresh — never throw to caller
};

// ─── Invalidation helpers ─────────────────────────────────────────────────────

/** Call after a successful send or receive to force fresh balance on next load */
export const invalidateBalance = (address, chainId) => {
  store.invalidate(
    Key.nativeBalance(address, chainId),
    Key.tokenBalances(address, chainId),
  );
  // Also wipe individual token balances for this chain
  store.invalidateByPrefix(`tb:${chainId}:`);
};

/** Wipe balances across ALL chains for this wallet address */
export const invalidateAllBalances = (address) => {
  store.invalidateByPrefix(`nb:`);
  store.invalidateByPrefix(`tb:`);
  store.invalidateByPrefix(`tbs:`);
};

/** Force fresh price data (e.g., after user manually refreshes) */
export const invalidatePrices = () => {
  store.invalidateByPrefix("pn:");
  store.invalidateByPrefix("pt:");
  store.invalidateByPrefix("pb:");
};

/** Force fresh gas on next read (e.g., user is about to send) */
export const invalidateGas = (chainId) => {
  store.invalidate(Key.gasPrice(chainId), Key.feeData(chainId));
};

/** Wipe cached backend responses whose URL starts with this path — call after a mutation. */
export const invalidateApi = (pathPrefix) => {
  store.invalidateByPrefix(Key.api(pathPrefix));
};

/** Full wipe — call on logout or wallet reset */
export const clearAll = () => {
  store.clear();
};

// ─── Re-exports for convenience ───────────────────────────────────────────────
// Consumers import from DataCache only — they don't need to know CacheStore exists
export { store as cacheStore };
