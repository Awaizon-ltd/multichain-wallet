// utils/nftCache.js

/**
 * Simple in-memory cache with TTL support
 * Reduces API calls by caching responses for 5 minutes
 */
class NFTCache {
  constructor(ttlMinutes = 10) {
    this.cache = new Map();
    this.ttl = ttlMinutes * 60 * 1000; // Convert to milliseconds
  }

  /**
   * Generate cache key from function name and arguments
   */
  generateKey(functionName, ...args) {
    return `${functionName}:${JSON.stringify(args)}`;
  }

  /**
   * Get cached value if still valid
   */
  get(key) {
    const cached = this.cache.get(key);

    if (!cached) {
      return null;
    }

    const now = Date.now();
    if (now - cached.timestamp > this.ttl) {
      // Cache expired
      this.cache.delete(key);
      return null;
    }

    console.log(`[NFTCache] Cache HIT for ${key}`);
    return cached.data;
  }

  /**
   * Set cache value with current timestamp
   */
  set(key, data) {
    console.log(`[NFTCache] Cache SET for ${key}`);
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
    });
  }

  /**
   * Clear all cache
   */
  clear() {
    console.log("[NFTCache] Clearing all cache");
    this.cache.clear();
  }

  /**
   * Clear expired entries
   */
  clearExpired() {
    const now = Date.now();
    let cleared = 0;

    for (const [key, value] of this.cache.entries()) {
      if (now - value.timestamp > this.ttl) {
        this.cache.delete(key);
        cleared++;
      }
    }

    if (cleared > 0) {
      console.log(`[NFTCache] Cleared ${cleared} expired entries`);
    }
  }

  /**
   * Get cache statistics
   */
  getStats() {
    const now = Date.now();
    const entries = Array.from(this.cache.values());
    const expired = entries.filter((e) => now - e.timestamp > this.ttl).length;

    return {
      total: this.cache.size,
      active: this.cache.size - expired,
      expired,
    };
  }
}

// Create singleton instance with 5-minute TTL
const nftCache = new NFTCache(5);

// Clear expired entries every minute
setInterval(() => {
  nftCache.clearExpired();
}, 60 * 1000);

/**
 * Wrapper function to cache any async function call
 */
export const withCache = async (cacheKey, fetchFunction) => {
  // Try to get from cache first
  const cached = nftCache.get(cacheKey);
  if (cached !== null) {
    return cached;
  }

  // Cache miss - fetch fresh data
  console.log(`[NFTCache] Cache MISS for ${cacheKey}`);
  const data = await fetchFunction();

  // Store in cache
  nftCache.set(cacheKey, data);

  return data;
};

export { nftCache };
