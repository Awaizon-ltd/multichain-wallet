// utils/TokenBalanceHelper.js
import { getTokenBalance } from './blockchain';
import { getTokensByChain, getAllTokens } from '../utils/Database';

/**
 * Token Balance Helper
 * Centralized utility for managing token balances across chains
 */

/**
 * Fetch balance for a single token
 */
export const fetchTokenBalance = async (tokenAddress, walletAddress, chain) => {
  try {
    console.log(`[TokenBalance] Fetching balance for ${tokenAddress} on ${chain.name}`);
    const balance = await getTokenBalance(tokenAddress, walletAddress, chain);
    return {
      success: true,
      address: tokenAddress,
      balance,
    };
  } catch (error) {
    console.error(`[TokenBalance] Error fetching balance for ${tokenAddress}:`, error);
    return {
      success: false,
      address: tokenAddress,
      balance: { formatted: '0', symbol: 'UNKNOWN' },
      error: error.message,
    };
  }
};

/**
 * Fetch balances for multiple tokens on a specific chain
 */
export const fetchMultipleTokenBalances = async (tokens, walletAddress, chain) => {
  console.log(`[TokenBalance] Fetching ${tokens.length} token balances on ${chain.name}`);
  
  const balances = {};
  
  // Fetch all balances in parallel
  const results = await Promise.allSettled(
    tokens.map(token => 
      getTokenBalance(token.address, walletAddress, chain)
    )
  );
  
  // Process results
  tokens.forEach((token, index) => {
    const result = results[index];
    
    if (result.status === 'fulfilled') {
      balances[token.address] = result.value;
    } else {
      console.error(`[TokenBalance] Failed to fetch ${token.symbol}:`, result.reason);
      balances[token.address] = {
        formatted: '0',
        symbol: token.symbol,
        error: result.reason?.message || 'Unknown error',
      };
    }
  });
  
  console.log(`[TokenBalance] ✅ Fetched ${Object.keys(balances).length} balances`);
  return balances;
};

/**
 * Fetch all token balances for a user across all chains
 */
export const fetchAllTokenBalances = async (userId, walletAddress, currentChain) => {
  try {
    console.log('[TokenBalance] Fetching all tokens for user:', userId);
    
    // Get all tokens from database
    const allTokens = await getAllTokens(userId);
    
    // Group tokens by chain
    const tokensByChain = allTokens.reduce((acc, token) => {
      if (!acc[token.chain_id]) {
        acc[token.chain_id] = [];
      }
      acc[token.chain_id].push(token);
      return acc;
    }, {});
    
    console.log('[TokenBalance] Tokens grouped by chain:', Object.keys(tokensByChain));
    
    // For now, only fetch balances for current chain to avoid API rate limits
    // You can extend this to fetch all chains if needed
    const balances = {};
    
    if (tokensByChain[currentChain.id]) {
      const chainBalances = await fetchMultipleTokenBalances(
        tokensByChain[currentChain.id],
        walletAddress,
        currentChain
      );
      balances[currentChain.id] = chainBalances;
    }
    
    return {
      success: true,
      balances,
      tokensByChain,
    };
  } catch (error) {
    console.error('[TokenBalance] Error fetching all balances:', error);
    return {
      success: false,
      balances: {},
      tokensByChain: {},
      error: error.message,
    };
  }
};

/**
 * Get tokens with balances for current chain
 */
export const getTokensWithBalances = async (userId, chainId, walletAddress, chain) => {
  try {
    // Get tokens for this chain
    const tokens = await getTokensByChain(userId, chainId);
    
    if (tokens.length === 0) {
      return {
        success: true,
        tokens: [],
        balances: {},
      };
    }
    
    // Fetch balances
    const balances = await fetchMultipleTokenBalances(tokens, walletAddress, chain);
    
    // Combine tokens with their balances
    const tokensWithBalances = tokens.map(token => ({
      ...token,
      balance: balances[token.address],
      hasBalance: parseFloat(balances[token.address]?.formatted || '0') > 0,
    }));
    
    // Sort: tokens with balance first, then alphabetically
    tokensWithBalances.sort((a, b) => {
      if (a.hasBalance && !b.hasBalance) return -1;
      if (!a.hasBalance && b.hasBalance) return 1;
      return a.symbol.localeCompare(b.symbol);
    });
    
    return {
      success: true,
      tokens: tokensWithBalances,
      balances,
    };
  } catch (error) {
    console.error('[TokenBalance] Error getting tokens with balances:', error);
    return {
      success: false,
      tokens: [],
      balances: {},
      error: error.message,
    };
  }
};

/**
 * Format token balance for display
 */
export const formatTokenBalance = (balance, options = {}) => {
  const {
    decimals = 4,
    showSymbol = true,
    compact = false,
  } = options;
  
  if (!balance || !balance.formatted) return '0.0000';
  
  const num = parseFloat(balance.formatted);
  
  if (num === 0) {
    return showSymbol ? `0.0000 ${balance.symbol}` : '0.0000';
  }
  
  if (num < 0.0001) {
    return showSymbol ? `< 0.0001 ${balance.symbol}` : '< 0.0001';
  }
  
  // Compact notation for large numbers
  if (compact && num >= 1000000) {
    return showSymbol 
      ? `${(num / 1000000).toFixed(2)}M ${balance.symbol}`
      : `${(num / 1000000).toFixed(2)}M`;
  }
  
  if (compact && num >= 1000) {
    return showSymbol 
      ? `${(num / 1000).toFixed(2)}K ${balance.symbol}`
      : `${(num / 1000).toFixed(2)}K`;
  }
  
  const formatted = num.toFixed(decimals);
  return showSymbol ? `${formatted} ${balance.symbol}` : formatted;
};

/**
 * Calculate total portfolio value (requires price data)
 * This is a placeholder - you'll need to integrate with a price API
 */
export const calculatePortfolioValue = (tokensWithBalances, prices = {}) => {
  let totalValue = 0;
  
  tokensWithBalances.forEach(token => {
    if (token.balance && prices[token.address]) {
      const amount = parseFloat(token.balance.formatted);
      const price = prices[token.address];
      totalValue += amount * price;
    }
  });
  
  return totalValue;
};

/**
 * Check if token has sufficient balance for transaction
 */
export const hasSufficientBalance = (balance, requiredAmount, decimals = 18) => {
  if (!balance || !balance.formatted) return false;
  
  const available = parseFloat(balance.formatted);
  const required = parseFloat(requiredAmount);
  
  return available >= required;
};

/**
 * Get token balance summary
 */
export const getBalanceSummary = (balances) => {
  const tokensWithBalance = Object.values(balances).filter(
    b => parseFloat(b.formatted || '0') > 0
  );
  
  const totalTokens = Object.keys(balances).length;
  const activeTokens = tokensWithBalance.length;
  
  return {
    totalTokens,
    activeTokens,
    inactiveTokens: totalTokens - activeTokens,
    hasAnyBalance: activeTokens > 0,
  };
};

export default {
  fetchTokenBalance,
  fetchMultipleTokenBalances,
  fetchAllTokenBalances,
  getTokensWithBalances,
  formatTokenBalance,
  calculatePortfolioValue,
  hasSufficientBalance,
  getBalanceSummary,
};