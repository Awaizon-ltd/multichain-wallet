// utils/TokenDatabase.js
/**
 * Additional Token Database Helpers
 * These functions extend the Database.js token operations
 * with more specific queries for chain-based token management
 *
 * NOTE: user_id is now a wallet address (string), not a numeric ID
 */

import { getDatabase } from "./Database";

/**
 * Get all tokens for a user on a specific chain
 * @param {string} userAddress - Wallet address (0x...)
 * @param {number|string} chainId - Chain ID
 */
export const getTokensByChain = async (userAddress, chainId) => {
  const db = getDatabase();

  try {
    // Normalize inputs
    const normalizedAddress = userAddress.toLowerCase();
    const normalizedChainId = parseInt(chainId);

    console.log("[TokenDB] 🔍 ========== GET TOKENS BY CHAIN ==========");
    console.log("[TokenDB] 🔍 Query params:", {
      userAddress: normalizedAddress,
      chainId: {
        original: chainId,
        normalized: normalizedChainId,
        type: typeof normalizedChainId,
      },
    });

    const tokens = await db.getAllAsync(
      `SELECT * FROM tokens 
       WHERE LOWER(user_id) = ? AND chain_id = ? AND is_visible = 1
       ORDER BY symbol ASC`,
      [normalizedAddress, normalizedChainId],
    );

    console.log("[TokenDB] ✅ Found tokens:", tokens?.length || 0);
    if (tokens && tokens.length > 0) {
      console.log(
        "[TokenDB] ✅ Token details:",
        tokens.map((t) => ({
          id: t.id,
          symbol: t.symbol,
          chainId: t.chain_id,
        })),
      );
    }

    return tokens || [];
  } catch (error) {
    console.error("[TokenDB] ❌ Error getting tokens by chain:", error);
    return [];
  }
};

/**
 * Get all tokens grouped by chain for a user
 */
export const getTokensGroupedByChain = async (userAddress) => {
  const db = getDatabase();

  try {
    const normalizedAddress = userAddress.toLowerCase();

    const result = await db.getAllAsync(
      `SELECT 
        chain_id,
        COUNT(*) as token_count,
        json_group_array(
          json_object(
            'id', id,
            'address', address,
            'name', name,
            'symbol', symbol,
            'decimals', decimals,
            'logo', logo
          )
        ) as tokens
      FROM tokens 
      WHERE LOWER(user_id) = ? AND is_visible = 1
      GROUP BY chain_id
      ORDER BY chain_id`,
      [normalizedAddress],
    );

    return result.map((row) => ({
      chainId: row.chain_id,
      tokenCount: row.token_count,
      tokens: JSON.parse(row.tokens),
    }));
  } catch (error) {
    console.error("[TokenDB] ❌ Error getting tokens grouped by chain:", error);
    return [];
  }
};

/**
 * Get token count for a specific chain
 */
export const getTokenCountByChain = async (userAddress, chainId) => {
  const db = getDatabase();

  try {
    const normalizedAddress = userAddress.toLowerCase();
    const normalizedChainId = parseInt(chainId);

    const result = await db.getFirstAsync(
      `SELECT COUNT(*) as count 
       FROM tokens 
       WHERE LOWER(user_id) = ? AND chain_id = ? AND is_visible = 1`,
      [normalizedAddress, normalizedChainId],
    );

    return result?.count || 0;
  } catch (error) {
    console.error("[TokenDB] ❌ Error getting token count:", error);
    return 0;
  }
};

/**
 * Check if a token already exists for user on specific chain
 */
export const tokenExists = async (userAddress, chainId, tokenAddress) => {
  const db = getDatabase();

  try {
    const normalizedUserAddress = userAddress.toLowerCase();
    const normalizedChainId = parseInt(chainId);
    const normalizedTokenAddress = tokenAddress.toLowerCase();

    const result = await db.getFirstAsync(
      `SELECT COUNT(*) as count 
       FROM tokens 
       WHERE LOWER(user_id) = ? AND chain_id = ? AND LOWER(address) = ?`,
      [normalizedUserAddress, normalizedChainId, normalizedTokenAddress],
    );

    return result.count > 0;
  } catch (error) {
    console.error("[TokenDB] ❌ Error checking token exists:", error);
    return false;
  }
};

/**
 * Get token by address on specific chain
 */
export const getTokenByAddress = async (userAddress, chainId, tokenAddress) => {
  const db = getDatabase();

  try {
    const normalizedUserAddress = userAddress.toLowerCase();
    const normalizedChainId = parseInt(chainId);
    const normalizedTokenAddress = tokenAddress.toLowerCase();

    return await db.getFirstAsync(
      `SELECT * FROM tokens 
       WHERE LOWER(user_id) = ? AND chain_id = ? AND LOWER(address) = ?`,
      [normalizedUserAddress, normalizedChainId, normalizedTokenAddress],
    );
  } catch (error) {
    console.error("[TokenDB] ❌ Error getting token by address:", error);
    return null;
  }
};

/**
 * Get all unique chains where user has tokens
 */
export const getChainsWithTokens = async (userAddress) => {
  const db = getDatabase();

  try {
    const normalizedAddress = userAddress.toLowerCase();

    const result = await db.getAllAsync(
      `SELECT DISTINCT chain_id, COUNT(*) as token_count
       FROM tokens 
       WHERE LOWER(user_id) = ? AND is_visible = 1
       GROUP BY chain_id
       ORDER BY chain_id`,
      [normalizedAddress],
    );

    return result.map((row) => ({
      chainId: row.chain_id,
      tokenCount: row.token_count,
    }));
  } catch (error) {
    console.error("[TokenDB] ❌ Error getting chains with tokens:", error);
    return [];
  }
};

/**
 * Get token addresses for user on specific chain (for filtering)
 */
export const getUserTokenAddresses = async (userAddress, chainId) => {
  const db = getDatabase();

  try {
    const normalizedUserAddress = userAddress.toLowerCase();
    const normalizedChainId = parseInt(chainId);

    const tokens = await db.getAllAsync(
      `SELECT address FROM tokens 
       WHERE LOWER(user_id) = ? AND chain_id = ? AND is_visible = 1`,
      [normalizedUserAddress, normalizedChainId],
    );

    return tokens.map((t) => t.address.toLowerCase());
  } catch (error) {
    console.error("[TokenDB] ❌ Error getting token addresses:", error);
    return [];
  }
};

/**
 * Bulk hide/show tokens
 */
export const toggleTokensVisibility = async (tokenIds, isVisible) => {
  const db = getDatabase();

  try {
    const placeholders = tokenIds.map(() => "?").join(",");
    await db.runAsync(
      `UPDATE tokens SET is_visible = ? WHERE id IN (${placeholders})`,
      [isVisible ? 1 : 0, ...tokenIds],
    );
  } catch (error) {
    console.error("[TokenDB] ❌ Error toggling token visibility:", error);
    throw error;
  }
};

/**
 * Delete all tokens for a specific chain (for user)
 */
export const deleteAllChainTokens = async (userAddress, chainId) => {
  const db = getDatabase();

  try {
    const normalizedAddress = userAddress.toLowerCase();
    const normalizedChainId = parseInt(chainId);

    await db.runAsync(
      "DELETE FROM tokens WHERE LOWER(user_id) = ? AND chain_id = ?",
      [normalizedAddress, normalizedChainId],
    );
  } catch (error) {
    console.error("[TokenDB] ❌ Error deleting chain tokens:", error);
    throw error;
  }
};

/**
 * Get recently added tokens
 */
export const getRecentTokens = async (userAddress, limit = 5) => {
  const db = getDatabase();

  try {
    const normalizedAddress = userAddress.toLowerCase();

    return await db.getAllAsync(
      `SELECT * FROM tokens 
       WHERE LOWER(user_id) = ? AND is_visible = 1
       ORDER BY created_at DESC
       LIMIT ?`,
      [normalizedAddress, limit],
    );
  } catch (error) {
    console.error("[TokenDB] ❌ Error getting recent tokens:", error);
    return [];
  }
};

/**
 * Search tokens across all chains
 */
export const searchTokens = async (userAddress, searchQuery) => {
  const db = getDatabase();

  try {
    const normalizedAddress = userAddress.toLowerCase();

    return await db.getAllAsync(
      `SELECT * FROM tokens 
       WHERE LOWER(user_id) = ? 
       AND is_visible = 1
       AND (
         LOWER(name) LIKE LOWER(?) 
         OR LOWER(symbol) LIKE LOWER(?)
         OR LOWER(address) LIKE LOWER(?)
       )
       ORDER BY symbol`,
      [
        normalizedAddress,
        `%${searchQuery}%`,
        `%${searchQuery}%`,
        `%${searchQuery}%`,
      ],
    );
  } catch (error) {
    console.error("[TokenDB] ❌ Error searching tokens:", error);
    return [];
  }
};

/**
 * Get token statistics for a user
 */
export const getTokenStatistics = async (userAddress) => {
  const db = getDatabase();

  try {
    const normalizedAddress = userAddress.toLowerCase();

    const stats = await db.getFirstAsync(
      `
      SELECT 
        COUNT(*) as total_tokens,
        COUNT(DISTINCT chain_id) as chains_count,
        SUM(CASE WHEN is_visible = 1 THEN 1 ELSE 0 END) as visible_tokens,
        SUM(CASE WHEN is_visible = 0 THEN 1 ELSE 0 END) as hidden_tokens
      FROM tokens
      WHERE LOWER(user_id) = ?
    `,
      [normalizedAddress],
    );

    return {
      totalTokens: stats?.total_tokens || 0,
      chainsCount: stats?.chains_count || 0,
      visibleTokens: stats?.visible_tokens || 0,
      hiddenTokens: stats?.hidden_tokens || 0,
    };
  } catch (error) {
    console.error("[TokenDB] ❌ Error getting token statistics:", error);
    return {
      totalTokens: 0,
      chainsCount: 0,
      visibleTokens: 0,
      hiddenTokens: 0,
    };
  }
};

/**
 * Update token logo
 */
export const updateTokenLogo = async (tokenId, logoUrl) => {
  const db = getDatabase();

  try {
    await db.runAsync("UPDATE tokens SET logo = ? WHERE id = ?", [
      logoUrl,
      tokenId,
    ]);
  } catch (error) {
    console.error("[TokenDB] ❌ Error updating token logo:", error);
    throw error;
  }
};

/**
 * Batch update token logos
 */
export const batchUpdateTokenLogos = async (updates) => {
  const db = getDatabase();

  try {
    await db.withTransactionAsync(async () => {
      for (const { tokenId, logoUrl } of updates) {
        await db.runAsync("UPDATE tokens SET logo = ? WHERE id = ?", [
          logoUrl,
          tokenId,
        ]);
      }
    });
  } catch (error) {
    console.error("[TokenDB] ❌ Error batch updating logos:", error);
    throw error;
  }
};

/**
 * Get hidden tokens
 */
export const getHiddenTokens = async (userAddress) => {
  const db = getDatabase();

  try {
    const normalizedAddress = userAddress.toLowerCase();

    return await db.getAllAsync(
      `SELECT * FROM tokens 
       WHERE LOWER(user_id) = ? AND is_visible = 0
       ORDER BY symbol`,
      [normalizedAddress],
    );
  } catch (error) {
    console.error("[TokenDB] ❌ Error getting hidden tokens:", error);
    return [];
  }
};

/**
 * Restore (unhide) a token
 */
export const restoreToken = async (tokenId) => {
  const db = getDatabase();

  try {
    await db.runAsync("UPDATE tokens SET is_visible = 1 WHERE id = ?", [
      tokenId,
    ]);
  } catch (error) {
    console.error("[TokenDB] ❌ Error restoring token:", error);
    throw error;
  }
};

/**
 * Permanently delete hidden tokens older than X days
 */
export const cleanupOldHiddenTokens = async (userAddress, daysOld = 30) => {
  const db = getDatabase();

  try {
    const normalizedAddress = userAddress.toLowerCase();
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysOld);

    await db.runAsync(
      `DELETE FROM tokens 
       WHERE LOWER(user_id) = ? 
       AND is_visible = 0 
       AND created_at < ?`,
      [normalizedAddress, cutoffDate.toISOString()],
    );
  } catch (error) {
    console.error("[TokenDB] ❌ Error cleaning up old tokens:", error);
    throw error;
  }
};

/**
 * Check if user holds a specific token
 */
export const userHoldsToken = async (userAddress, chainId, tokenAddress) => {
  const db = getDatabase();

  try {
    const normalizedUserAddress = userAddress.toLowerCase();
    const normalizedChainId = parseInt(chainId);
    const normalizedTokenAddress = tokenAddress.toLowerCase();

    const result = await db.getFirstAsync(
      `SELECT COUNT(*) as count 
       FROM tokens 
       WHERE LOWER(user_id) = ? 
       AND chain_id = ? 
       AND LOWER(address) = ?
       AND is_visible = 1`,
      [normalizedUserAddress, normalizedChainId, normalizedTokenAddress],
    );

    return result.count > 0;
  } catch (error) {
    console.error("[TokenDB] ❌ Error checking if user holds token:", error);
    return false;
  }
};

// Default export with all functions
export default {
  getTokensByChain,
  getTokensGroupedByChain,
  getTokenCountByChain,
  tokenExists,
  getTokenByAddress,
  getChainsWithTokens,
  getUserTokenAddresses,
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
