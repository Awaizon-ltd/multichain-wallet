/**
 * CacheStore — Two-level TTL cache
 *
 * L1 — in-memory Map   : sync reads, zero latency, cleared on app restart
 * L2 — SQLite          : persists across restarts (utils/cache/SqlitePersistence.js),
 *                        loaded once via hydrate()
 *
 * Design decisions:
 *  • L2 writes are fire-and-forget (batched + debounced) — never block the caller
 *  • L2 entries older than PERSIST_MAX_AGE are ignored on hydration (too stale)
 *  • Only keys written with { persist: true } hit L2
 *  • invalidate() removes from L1 immediately AND queues the L2 delete —
 *    unlike the old AsyncStorage version, SQLite makes this cheap enough to
 *    do eagerly instead of waiting for TTL expiry.
 *
 * This is the same public API as the AsyncStorage-backed version it replaces —
 * every consumer (DataCache.js and, through it, Balances.js, coingecko.js,
 * Multicall.js, etc.) needed zero changes to pick up SQLite persistence.
 */

import * as persistence from "./SqlitePersistence";

const PERSIST_MAX_AGE = 24 * 60 * 60 * 1000; // ignore L2 entries older than 24h
const FLUSH_DEBOUNCE_MS = 600;
const PRUNE_INTERVAL_MS = 10 * 60 * 1000; // background hygiene every 10 min

class CacheStore {
  constructor() {
    this._l1 = new Map(); // key → { value, timestamp }
    this._dirty = new Set(); // keys queued for L2 upsert
    this._pendingDeletes = new Set(); // keys queued for L2 delete
    this._flushTimer = null;
    this._hydrated = false;
    this._hydratePromise = null;
    this._pruneTimer = null;
  }

  // ── Hydration ─────────────────────────────────────────────────────────────
  // Called once before any first read. Loads L2 entries into L1 so that
  // the app can show last-known data while fresh fetches are in flight.

  hydrate() {
    if (this._hydratePromise) return this._hydratePromise;
    this._hydratePromise = this._doHydrate();
    return this._hydratePromise;
  }

  async _doHydrate() {
    try {
      const cutoff = Date.now() - PERSIST_MAX_AGE;
      const rows = await persistence.loadFresh(cutoff);
      for (const { key, value, ts } of rows) {
        if (this._l1.has(key)) continue; // L1 is always fresher than L2
        try {
          this._l1.set(key, { value: JSON.parse(value), timestamp: ts });
        } catch {
          // Corrupt row — skip it, don't let one bad entry break hydration
        }
      }
    } catch {
      // L2 unavailable — start clean, will repopulate on next write
    } finally {
      this._hydrated = true;
      this._schedulePrune();
    }
  }

  get isHydrated() {
    return this._hydrated;
  }

  // ── Core read / write ─────────────────────────────────────────────────────

  /** Returns { value, timestamp } or undefined */
  get(key) {
    return this._l1.get(key);
  }

  /** True if the entry is missing or its timestamp is older than ttl ms */
  isStale(key, ttl) {
    const entry = this._l1.get(key);
    if (!entry) return true;
    return Date.now() - entry.timestamp > ttl;
  }

  /**
   * Store a value.
   * @param {string} key
   * @param {*}      value
   * @param {{ persist?: boolean }} opts   persist=true → queue L2 write
   */
  set(key, value, { persist = false } = {}) {
    const entry = { value, timestamp: Date.now() };
    this._l1.set(key, entry);
    if (persist) {
      this._pendingDeletes.delete(key);
      this._dirty.add(key);
      this._scheduleFlush();
    }
  }

  /** Remove one or more keys from L1 + queue their L2 deletion. */
  invalidate(...keys) {
    for (const k of keys) {
      this._l1.delete(k);
      this._dirty.delete(k);
      this._pendingDeletes.add(k);
    }
    this._scheduleFlush();
  }

  /** Remove every L1 key that starts with prefix (L2 cleaned in the background). */
  invalidateByPrefix(prefix) {
    for (const key of this._l1.keys()) {
      if (key.startsWith(prefix)) this._l1.delete(key);
    }
    persistence.deleteByPrefix(prefix).catch(() => {});
  }

  /** Wipe everything — call on logout. */
  clear() {
    this._l1.clear();
    this._dirty.clear();
    this._pendingDeletes.clear();
    clearTimeout(this._flushTimer);
    this._flushTimer = null;
    persistence.clearAll().catch(() => {});
  }

  // ── L2 flush (batched, debounced) ─────────────────────────────────────────

  _scheduleFlush() {
    if (this._flushTimer) return;
    this._flushTimer = setTimeout(() => this._flush(), FLUSH_DEBOUNCE_MS);
  }

  async _flush() {
    this._flushTimer = null;
    const upserts = [...this._dirty];
    const deletes = [...this._pendingDeletes];
    this._dirty.clear();
    this._pendingDeletes.clear();
    if (!upserts.length && !deletes.length) return;

    if (deletes.length) persistence.deleteKeys(deletes).catch(() => {});

    if (upserts.length) {
      const entries = upserts
        .map((key) => {
          const entry = this._l1.get(key);
          if (!entry) return null;
          try {
            return {
              key,
              value: JSON.stringify(entry.value),
              ts: entry.timestamp,
            };
          } catch {
            return null; // non-serializable value — skip persisting this one
          }
        })
        .filter(Boolean);
      persistence.upsertMany(entries).catch(() => {});
    }
  }

  // ── Background hygiene ─────────────────────────────────────────────────────
  // Keeps the SQLite table from growing unbounded across app restarts.

  _schedulePrune() {
    if (this._pruneTimer) return;
    this._pruneTimer = setInterval(() => {
      persistence.pruneExpired(Date.now() - PERSIST_MAX_AGE).catch(() => {});
    }, PRUNE_INTERVAL_MS);
  }
}

export default new CacheStore();
