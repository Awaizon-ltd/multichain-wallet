// utils/blockchain/NftsCache.js
//
// Thin shim over the real cache layer (utils/cache/DataCache.js) so every
// NFTs.js call site keeps its existing withCache(key, fetcher) signature —
// this used to be its own in-memory-only cache (lost on every app restart,
// meaning a full re-scan across every Alchemy-supported chain on every cold
// launch). It now gets SQLite persistence and request dedup for free.

import { withCache as cachedFetch } from "../cache/DataCache";
import cacheStore from "../cache/CacheStore";

const DEFAULT_TTL = 5 * 60 * 1000; // matches the old NFTCache's 5-minute TTL

/**
 * @param {string}   cacheKey
 * @param {function} fetchFunction  async () => value
 */
export const withCache = async (cacheKey, fetchFunction) =>
  cachedFetch(`nft:${cacheKey}`, DEFAULT_TTL, fetchFunction, { persist: true });

// Legacy singleton API some call sites may still reference — backed by the
// same store now instead of a private, unpersisted Map.
export const nftCache = {
  generateKey: (method, ...args) =>
    `${method}:${args.map((a) => (typeof a === "object" ? JSON.stringify(a ?? null) : String(a))).join(":")}`,
  // withCache() namespaces keys under "nft:", so deletes must too
  cache: { delete: (key) => cacheStore.invalidate(`nft:${key}`) },
  clear: () => cacheStore.invalidateByPrefix("nft:"),
  clearExpired: () => {}, // handled automatically by CacheStore's background prune
  getStats: () => ({ backend: "sqlite (shared cache store)" }),
};
