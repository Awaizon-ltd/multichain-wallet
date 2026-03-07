// utils/TokenEnhancer.js
/**
 * Token Enhancer Utility
 * Updates existing tokens with CoinGecko data (logos, prices)
 */

import { getTokensByChain, getAllTokens } from './Database';
import { updateTokenLogo } from './TokenDatabase';
import coinGeckoService from '../services/coingec';

/**
 * Update a single token with CoinGecko data
 */
export const enhanceTokenWithCoinGecko = async (token, chainId) => {
  try {
    const platform = coinGeckoService.getPlatformId(chainId);
    
    
    // Fetch logo from CoinGecko
    const logo = await coinGeckoService.getTokenLogo(token.address, platform);
    
    if (logo && logo !== token.logo) {
      // Update in database
      await updateTokenLogo(token.id, logo);
      
      return {
        ...token,
        logo,
        enhanced: true,
      };
    }
    
    return {
      ...token,
      enhanced: false,
    };
  } catch (error) {
    console.error(`[TokenEnhancer] ❌ Failed to enhance ${token.symbol}:`, error.message);
    return {
      ...token,
      enhanced: false,
      error: error.message,
    };
  }
};

/**
 * Update all tokens for a specific chain with CoinGecko data
 */
export const enhanceChainTokens = async (userId, chainId) => {
  try {
    
    const tokens = await getTokensByChain(userId, chainId);
    
    if (tokens.length === 0) {
      return {
        success: true,
        enhanced: 0,
        failed: 0,
        total: 0,
      };
    }
    
    let enhanced = 0;
    let failed = 0;
    
    // Enhance tokens one by one (with small delay to respect rate limits)
    for (const token of tokens) {
      // Skip if already has logo
      if (token.logo) {
        continue;
      }
      
      const result = await enhanceTokenWithCoinGecko(token, chainId);
      
      if (result.enhanced) {
        enhanced++;
      } else if (result.error) {
        failed++;
      }
      
      // Small delay to avoid rate limiting (free tier: ~50 calls/minute)
      await new Promise(resolve => setTimeout(resolve, 1200)); // ~50/min
    }
    

    
    return {
      success: true,
      enhanced,
      failed,
      total: tokens.length,
    };
  } catch (error) {
    console.error('[TokenEnhancer] ❌ Error enhancing chain tokens:', error);
    return {
      success: false,
      enhanced: 0,
      failed: 0,
      total: 0,
      error: error.message,
    };
  }
};

/**
 * Update all tokens across all chains with CoinGecko data
 */
export const enhanceAllTokens = async (userId) => {
  try {
    
    const allTokens = await getAllTokens(userId);
    
    if (allTokens.length === 0) {
      return {
        success: true,
        enhanced: 0,
        failed: 0,
        total: 0,
      };
    }
    
    // Group by chain
    const tokensByChain = allTokens.reduce((acc, token) => {
      if (!acc[token.chain_id]) {
        acc[token.chain_id] = [];
      }
      acc[token.chain_id].push(token);
      return acc;
    }, {});
    
    let totalEnhanced = 0;
    let totalFailed = 0;
    
    // Enhance each chain's tokens
    for (const [chainId, tokens] of Object.entries(tokensByChain)) {
      const result = await enhanceChainTokens(userId, parseInt(chainId));
      totalEnhanced += result.enhanced;
      totalFailed += result.failed;
    }
    
    
    return {
      success: true,
      enhanced: totalEnhanced,
      failed: totalFailed,
      total: allTokens.length,
    };
  } catch (error) {
    console.error('[TokenEnhancer] ❌ Error enhancing all tokens:', error);
    return {
      success: false,
      enhanced: 0,
      failed: 0,
      total: 0,
      error: error.message,
    };
  }
};

/**
 * Get tokens that need enhancement (missing logos)
 */
export const getTokensNeedingEnhancement = async (userId, chainId = null) => {
  try {
    const tokens = chainId 
      ? await getTokensByChain(userId, chainId)
      : await getAllTokens(userId);
    
    return tokens.filter(token => !token.logo);
  } catch (error) {
    console.error('[TokenEnhancer] Error getting tokens needing enhancement:', error);
    return [];
  }
};

/**
 * Check enhancement status
 */
export const getEnhancementStatus = async (userId) => {
  try {
    const allTokens = await getAllTokens(userId);
    const withLogos = allTokens.filter(t => t.logo).length;
    const withoutLogos = allTokens.length - withLogos;
    
    return {
      total: allTokens.length,
      enhanced: withLogos,
      needsEnhancement: withoutLogos,
      percentage: allTokens.length > 0 
        ? ((withLogos / allTokens.length) * 100).toFixed(1)
        : 0,
    };
  } catch (error) {
    console.error('[TokenEnhancer] Error getting enhancement status:', error);
    return {
      total: 0,
      enhanced: 0,
      needsEnhancement: 0,
      percentage: 0,
    };
  }
};

export default {
  enhanceTokenWithCoinGecko,
  enhanceChainTokens,
  enhanceAllTokens,
  getTokensNeedingEnhancement,
  getEnhancementStatus,
};

/**
 * USAGE EXAMPLES:
 * 
 * // Enhance all tokens for current chain
 * const result = await enhanceChainTokens(userId, selectedChain.id);
 * console.log(`Enhanced ${result.enhanced} tokens`);
 * 
 * // Enhance all tokens across all chains (use sparingly - rate limits!)
 * const result = await enhanceAllTokens(userId);
 * 
 * // Check which tokens need enhancement
 * const needsWork = await getTokensNeedingEnhancement(userId);
 * console.log(`${needsWork.length} tokens need logos`);
 * 
 * // Get enhancement status
 * const status = await getEnhancementStatus(userId);
 * console.log(`${status.percentage}% of tokens have logos`);
 */