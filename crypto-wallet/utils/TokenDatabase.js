// utils/TokenDatabase.js
/**
 * Token Database Helpers
 * Chain-scoped token queries for the wallet app.
 * user_id is a wallet address string, not a numeric ID.
 */

import { getDatabase } from "./Database";
import { waitForDatabase } from "./DatabaseReady";

// ─────────────────────────────────────────────────────────────────────────────
// Internal: wait for the DB to be fully initialised before running any query.
// Returns the db instance, or throws with a clear message if unavailable.
// ─────────────────────────────────────────────────────────────────────────────
const getReadyDb = async () => {
  const result = await waitForDatabase(); // resolves after markDatabaseReady() or timeout

  if (result?.timedOut) {
    console.warn(
      "[TokenDB] ⚠️  DB timed out — proceeding with best-effort query",
    );
  }

  const db = getDatabase();
  if (!db) {
    throw new Error(
      "[TokenDB] getDatabase() is null. " +
        "Ensure initDatabase() is awaited before rendering wallet screens.",
    );
  }
  return db;
};

// ─────────────────────────────────────────────────────────────────────────────
// Public helpers
// ─────────────────────────────────────────────────────────────────────────────

export const getTokensByChain = async (userAddress, chainId) => {
  try {
    const db = await getReadyDb();
    const addr = userAddress.toLowerCase();
    const cid = parseInt(chainId);
    console.log("[TokenDB] 🔍 getTokensByChain", { addr, cid });
    const tokens = await db.getAllAsync(
      `SELECT * FROM tokens WHERE LOWER(user_id) = ? AND chain_id = ? AND is_visible = 1 ORDER BY symbol ASC`,
      [addr, cid],
    );
    console.log("[TokenDB] ✅ Found tokens:", tokens?.length ?? 0);
    return tokens ?? [];
  } catch (error) {
    console.error("[TokenDB] ❌ getTokensByChain:", error);
    return [];
  }
};

export const getTokensGroupedByChain = async (userAddress) => {
  try {
    const db = await getReadyDb();
    const result = await db.getAllAsync(
      `SELECT chain_id, COUNT(*) as token_count,
        json_group_array(json_object('id',id,'address',address,'name',name,'symbol',symbol,'decimals',decimals,'logo',logo)) as tokens
       FROM tokens WHERE LOWER(user_id) = ? AND is_visible = 1
       GROUP BY chain_id ORDER BY chain_id`,
      [userAddress.toLowerCase()],
    );
    return result.map((row) => ({
      chainId: row.chain_id,
      tokenCount: row.token_count,
      tokens: JSON.parse(row.tokens),
    }));
  } catch (error) {
    console.error("[TokenDB] ❌ getTokensGroupedByChain:", error);
    return [];
  }
};

export const getTokenCountByChain = async (userAddress, chainId) => {
  try {
    const db = await getReadyDb();
    const result = await db.getFirstAsync(
      `SELECT COUNT(*) as count FROM tokens WHERE LOWER(user_id) = ? AND chain_id = ? AND is_visible = 1`,
      [userAddress.toLowerCase(), parseInt(chainId)],
    );
    return result?.count ?? 0;
  } catch (error) {
    console.error("[TokenDB] ❌ getTokenCountByChain:", error);
    return 0;
  }
};

export const tokenExists = async (userAddress, chainId, tokenAddress) => {
  try {
    const db = await getReadyDb();
    const result = await db.getFirstAsync(
      `SELECT COUNT(*) as count FROM tokens WHERE LOWER(user_id) = ? AND chain_id = ? AND LOWER(address) = ?`,
      [
        userAddress.toLowerCase(),
        parseInt(chainId),
        tokenAddress.toLowerCase(),
      ],
    );
    return (result?.count ?? 0) > 0;
  } catch (error) {
    console.error("[TokenDB] ❌ tokenExists:", error);
    return false;
  }
};

export const getTokenByAddress = async (userAddress, chainId, tokenAddress) => {
  try {
    const db = await getReadyDb();
    return await db.getFirstAsync(
      `SELECT * FROM tokens WHERE LOWER(user_id) = ? AND chain_id = ? AND LOWER(address) = ?`,
      [
        userAddress.toLowerCase(),
        parseInt(chainId),
        tokenAddress.toLowerCase(),
      ],
    );
  } catch (error) {
    console.error("[TokenDB] ❌ getTokenByAddress:", error);
    return null;
  }
};

export const getChainsWithTokens = async (userAddress) => {
  try {
    const db = await getReadyDb();
    const result = await db.getAllAsync(
      `SELECT DISTINCT chain_id, COUNT(*) as token_count FROM tokens WHERE LOWER(user_id) = ? AND is_visible = 1 GROUP BY chain_id ORDER BY chain_id`,
      [userAddress.toLowerCase()],
    );
    return result.map((row) => ({
      chainId: row.chain_id,
      tokenCount: row.token_count,
    }));
  } catch (error) {
    console.error("[TokenDB] ❌ getChainsWithTokens:", error);
    return [];
  }
};

export const getUserTokenAddresses = async (userAddress, chainId) => {
  try {
    const db = await getReadyDb();
    const tokens = await db.getAllAsync(
      `SELECT address FROM tokens WHERE LOWER(user_id) = ? AND chain_id = ? AND is_visible = 1`,
      [userAddress.toLowerCase(), parseInt(chainId)],
    );
    return tokens.map((t) => t.address.toLowerCase());
  } catch (error) {
    console.error("[TokenDB] ❌ getUserTokenAddresses:", error);
    return [];
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Enable / disable — the user-facing "which tokens do I want to see" toggle.
// A token catalog entry (from the backend's /api/swap/tokens) isn't
// necessarily a row in this table yet; enabling one for the first time
// inserts it, disabling one that was never saved is simply a no-op.
// ─────────────────────────────────────────────────────────────────────────────

export const enableToken = async (userAddress, chainId, token) => {
  try {
    const db = await getReadyDb();
    await db.runAsync(
      `INSERT INTO tokens (user_id, chain_id, address, name, symbol, decimals, logo, is_visible)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1)
       ON CONFLICT(user_id, chain_id, address) DO UPDATE SET is_visible = 1`,
      [
        userAddress.toLowerCase(),
        parseInt(chainId),
        token.address.toLowerCase(),
        token.name,
        token.symbol,
        parseInt(token.decimals),
        token.logoURI ?? token.logo ?? null,
      ],
    );
  } catch (error) {
    console.error("[TokenDB] ❌ enableToken:", error);
    throw error;
  }
};

export const disableToken = async (userAddress, chainId, tokenAddress) => {
  try {
    const db = await getReadyDb();
    await db.runAsync(
      `UPDATE tokens SET is_visible = 0
       WHERE LOWER(user_id) = ? AND chain_id = ? AND LOWER(address) = ?`,
      [
        userAddress.toLowerCase(),
        parseInt(chainId),
        tokenAddress.toLowerCase(),
      ],
    );
  } catch (error) {
    console.error("[TokenDB] ❌ disableToken:", error);
    throw error;
  }
};

/** Every enabled token address for this chain, lowercased — O(1) lookups for UI toggles. */
export const getEnabledAddressSet = async (userAddress, chainId) => {
  const addresses = await getUserTokenAddresses(userAddress, chainId);
  return new Set(addresses);
};

export const toggleTokensVisibility = async (tokenIds, isVisible) => {
  try {
    const db = await getReadyDb();
    const placeholders = tokenIds.map(() => "?").join(",");
    await db.runAsync(
      `UPDATE tokens SET is_visible = ? WHERE id IN (${placeholders})`,
      [isVisible ? 1 : 0, ...tokenIds],
    );
  } catch (error) {
    console.error("[TokenDB] ❌ toggleTokensVisibility:", error);
    throw error;
  }
};

export const deleteAllChainTokens = async (userAddress, chainId) => {
  try {
    const db = await getReadyDb();
    await db.runAsync(
      "DELETE FROM tokens WHERE LOWER(user_id) = ? AND chain_id = ?",
      [userAddress.toLowerCase(), parseInt(chainId)],
    );
  } catch (error) {
    console.error("[TokenDB] ❌ deleteAllChainTokens:", error);
    throw error;
  }
};

export const getRecentTokens = async (userAddress, limit = 5) => {
  try {
    const db = await getReadyDb();
    return await db.getAllAsync(
      `SELECT * FROM tokens WHERE LOWER(user_id) = ? AND is_visible = 1 ORDER BY created_at DESC LIMIT ?`,
      [userAddress.toLowerCase(), limit],
    );
  } catch (error) {
    console.error("[TokenDB] ❌ getRecentTokens:", error);
    return [];
  }
};

export const searchTokens = async (userAddress, searchQuery) => {
  try {
    const db = await getReadyDb();
    return await db.getAllAsync(
      `SELECT * FROM tokens WHERE LOWER(user_id) = ? AND is_visible = 1
       AND (LOWER(name) LIKE LOWER(?) OR LOWER(symbol) LIKE LOWER(?) OR LOWER(address) LIKE LOWER(?))
       ORDER BY symbol`,
      [
        userAddress.toLowerCase(),
        `%${searchQuery}%`,
        `%${searchQuery}%`,
        `%${searchQuery}%`,
      ],
    );
  } catch (error) {
    console.error("[TokenDB] ❌ searchTokens:", error);
    return [];
  }
};

export const getTokenStatistics = async (userAddress) => {
  try {
    const db = await getReadyDb();
    const stats = await db.getFirstAsync(
      `SELECT COUNT(*) as total_tokens, COUNT(DISTINCT chain_id) as chains_count,
        SUM(CASE WHEN is_visible=1 THEN 1 ELSE 0 END) as visible_tokens,
        SUM(CASE WHEN is_visible=0 THEN 1 ELSE 0 END) as hidden_tokens
       FROM tokens WHERE LOWER(user_id) = ?`,
      [userAddress.toLowerCase()],
    );
    return {
      totalTokens: stats?.total_tokens ?? 0,
      chainsCount: stats?.chains_count ?? 0,
      visibleTokens: stats?.visible_tokens ?? 0,
      hiddenTokens: stats?.hidden_tokens ?? 0,
    };
  } catch (error) {
    console.error("[TokenDB] ❌ getTokenStatistics:", error);
    return {
      totalTokens: 0,
      chainsCount: 0,
      visibleTokens: 0,
      hiddenTokens: 0,
    };
  }
};

export const updateTokenLogo = async (tokenId, logoUrl) => {
  try {
    const db = await getReadyDb();
    await db.runAsync("UPDATE tokens SET logo = ? WHERE id = ?", [
      logoUrl,
      tokenId,
    ]);
  } catch (error) {
    console.error("[TokenDB] ❌ updateTokenLogo:", error);
    throw error;
  }
};

export const batchUpdateTokenLogos = async (updates) => {
  try {
    const db = await getReadyDb();
    await db.withTransactionAsync(async () => {
      for (const { tokenId, logoUrl } of updates) {
        await db.runAsync("UPDATE tokens SET logo = ? WHERE id = ?", [
          logoUrl,
          tokenId,
        ]);
      }
    });
  } catch (error) {
    console.error("[TokenDB] ❌ batchUpdateTokenLogos:", error);
    throw error;
  }
};

export const getHiddenTokens = async (userAddress) => {
  try {
    const db = await getReadyDb();
    return await db.getAllAsync(
      `SELECT * FROM tokens WHERE LOWER(user_id) = ? AND is_visible = 0 ORDER BY symbol`,
      [userAddress.toLowerCase()],
    );
  } catch (error) {
    console.error("[TokenDB] ❌ getHiddenTokens:", error);
    return [];
  }
};

export const restoreToken = async (tokenId) => {
  try {
    const db = await getReadyDb();
    await db.runAsync("UPDATE tokens SET is_visible = 1 WHERE id = ?", [
      tokenId,
    ]);
  } catch (error) {
    console.error("[TokenDB] ❌ restoreToken:", error);
    throw error;
  }
};

export const cleanupOldHiddenTokens = async (userAddress, daysOld = 30) => {
  try {
    const db = await getReadyDb();
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysOld);
    await db.runAsync(
      `DELETE FROM tokens WHERE LOWER(user_id) = ? AND is_visible = 0 AND created_at < ?`,
      [userAddress.toLowerCase(), cutoffDate.toISOString()],
    );
  } catch (error) {
    console.error("[TokenDB] ❌ cleanupOldHiddenTokens:", error);
    throw error;
  }
};

export const userHoldsToken = async (userAddress, chainId, tokenAddress) => {
  try {
    const db = await getReadyDb();
    const result = await db.getFirstAsync(
      `SELECT COUNT(*) as count FROM tokens WHERE LOWER(user_id) = ? AND chain_id = ? AND LOWER(address) = ? AND is_visible = 1`,
      [
        userAddress.toLowerCase(),
        parseInt(chainId),
        tokenAddress.toLowerCase(),
      ],
    );
    return (result?.count ?? 0) > 0;
  } catch (error) {
    console.error("[TokenDB] ❌ userHoldsToken:", error);
    return false;
  }
};

export default {
  getTokensByChain,
  getTokensGroupedByChain,
  getTokenCountByChain,
  tokenExists,
  getTokenByAddress,
  getChainsWithTokens,
  getUserTokenAddresses,
  enableToken,
  disableToken,
  getEnabledAddressSet,
  toggleTokensVisibility,
  deleteAllChainTokens,
  getRecentTokens,
  searchTokens,
  getTokenStatistics,
  updateTokenLogo,
  batchUpdateTokenLogos,
  getHiddenTokens,
  restoreToken,
  cleanupOldHiddenTokens,
  userHoldsToken,
};
