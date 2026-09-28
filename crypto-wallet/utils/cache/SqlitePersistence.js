// utils/cache/SqlitePersistence.js
// ─────────────────────────────────────────────────────────────────────────────
// L2 persistence backend for CacheStore, on the same expo-sqlite database the
// rest of the app already uses (WAL mode, one row per cache key in
// `cache_entries`). Replaces the old single-JSON-blob-in-AsyncStorage
// approach: reads/writes only touch the keys that actually changed, and
// stale rows can be pruned with an indexed query instead of loading
// everything into memory to filter it.
//
// Every function is best-effort — a cache is never allowed to break the app.
// Callers get [] / undefined / silently-swallowed failures instead of throws.
// ─────────────────────────────────────────────────────────────────────────────

import { getDatabase } from "../Database";
import { waitForDatabase } from "../DatabaseReady";

const getReadyDb = async () => {
  await waitForDatabase(); // resolves once markDatabaseReady() has run (or times out)
  try {
    return getDatabase();
  } catch {
    return null; // DB genuinely never initialised — caller degrades to L1-only
  }
};

/**
 * Load every entry newer than `cutoff` (epoch ms). Used once at hydrate time.
 * @returns {Promise<Array<{key: string, value: string, ts: number}>>}
 */
export const loadFresh = async (cutoff) => {
  const db = await getReadyDb();
  if (!db) return [];
  try {
    return await db.getAllAsync(
      "SELECT key, value, ts FROM cache_entries WHERE ts > ?",
      [cutoff],
    );
  } catch (err) {
    console.warn("[SqlitePersistence] loadFresh failed:", err.message);
    return [];
  }
};

/**
 * Upsert a batch of {key, value, ts} rows in one transaction.
 * `value` must already be a JSON string.
 */
export const upsertMany = async (entries) => {
  if (!entries.length) return;
  const db = await getReadyDb();
  if (!db) return;
  try {
    await db.withTransactionAsync(async () => {
      for (const { key, value, ts } of entries) {
        await db.runAsync(
          "INSERT OR REPLACE INTO cache_entries (key, value, ts) VALUES (?, ?, ?)",
          [key, value, ts],
        );
      }
    });
  } catch (err) {
    console.warn("[SqlitePersistence] upsertMany failed:", err.message);
  }
};

/** Delete specific keys (used when an in-memory entry is invalidated). */
export const deleteKeys = async (keys) => {
  if (!keys.length) return;
  const db = await getReadyDb();
  if (!db) return;
  try {
    const placeholders = keys.map(() => "?").join(",");
    await db.runAsync(
      `DELETE FROM cache_entries WHERE key IN (${placeholders})`,
      keys,
    );
  } catch (err) {
    console.warn("[SqlitePersistence] deleteKeys failed:", err.message);
  }
};

/** Delete every row whose key starts with `prefix`. */
export const deleteByPrefix = async (prefix) => {
  const db = await getReadyDb();
  if (!db) return;
  try {
    await db.runAsync("DELETE FROM cache_entries WHERE key LIKE ?", [
      `${prefix}%`,
    ]);
  } catch (err) {
    console.warn("[SqlitePersistence] deleteByPrefix failed:", err.message);
  }
};

/** Wipe the whole cache table — logout / manual reset. */
export const clearAll = async () => {
  const db = await getReadyDb();
  if (!db) return;
  try {
    await db.execAsync("DELETE FROM cache_entries;");
  } catch (err) {
    console.warn("[SqlitePersistence] clearAll failed:", err.message);
  }
};

/** Delete rows older than `cutoff` — background hygiene, keeps the table small. */
export const pruneExpired = async (cutoff) => {
  const db = await getReadyDb();
  if (!db) return;
  try {
    await db.runAsync("DELETE FROM cache_entries WHERE ts < ?", [cutoff]);
  } catch (err) {
    console.warn("[SqlitePersistence] pruneExpired failed:", err.message);
  }
};
