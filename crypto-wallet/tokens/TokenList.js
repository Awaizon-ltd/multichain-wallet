// Unified Token List
// Combines tokens from Ethereum, Mantle, Arbitrum, Polygon, Avalanche, and BSC

import { ethereumTokens, ethereumMetadata } from "./tokens/mainnet.js";
import { mantleTokens, mantleMetadata } from "./tokens/mantle.js";
import { arbitrumTokens, arbitrumMetadata } from "./tokens/arbitrum.js";
import { polygonTokens, polygonMetadata } from "./tokens/polygon.js";
import { avalancheTokens, avalancheMetadata } from "./tokens/avalanche.js";
import { bscTokens, bscMetadata } from "./tokens/bsc.js";

/**
 * Token List Configuration
 */
export const tokenListConfig = {
  name: "Multi-Chain Token List",
  version: "1.0.0",
  timestamp: new Date().toISOString(),
  chains: [
    {
      chainId: 1,
      name: "Ethereum Mainnet",
      tokens: ethereumTokens.length,
    },
    {
      chainId: 5000,
      name: "Mantle Network",
      tokens: mantleTokens.length,
    },
    {
      chainId: 42161,
      name: "Arbitrum",
      tokens: arbitrumTokens.length,
    },
    {
      chainId: 137,
      name: "Polygon",
      tokens: polygonTokens.length,
    },
    {
      chainId: 43114,
      name: "Avalanche C-Chain",
      tokens: avalancheTokens.length,
    },
    {
      chainId: 56,
      name: "BNB Smart Chain",
      tokens: bscTokens.length,
    },
  ],
};

/**
 * Combined token list from all chains
 */
export const allTokens = [
  ...ethereumTokens,
  ...mantleTokens,
  ...arbitrumTokens,
  ...polygonTokens,
  ...avalancheTokens,
  ...bscTokens,
];

/**
 * Tokens organized by chain ID
 */
export const tokensByChain = {
  1: ethereumTokens,
  5000: mantleTokens,
  42161: arbitrumTokens,
  137: polygonTokens,
  43114: avalancheTokens,
  56: bscTokens,
};

/**
 * Chain metadata
 */
export const chainMetadata = {
  1: ethereumMetadata,
  5000: mantleMetadata,
  42161: arbitrumMetadata,
  137: polygonMetadata,
  43114: avalancheMetadata,
  56: bscMetadata,
};

/**
 * Get tokens for a specific chain
 * @param {number} chainId - The chain ID
 * @returns {Array} Array of tokens for the specified chain
 */
export function getTokensByChain(chainId) {
  return tokensByChain[chainId] || [];
}

/**
 * Search tokens by symbol
 * @param {string} symbol - Token symbol to search for
 * @param {number} [chainId] - Optional chain ID to filter results
 * @returns {Array} Matching tokens
 */
export function searchBySymbol(symbol, chainId = null) {
  const tokens = chainId ? getTokensByChain(chainId) : allTokens;
  return tokens.filter((token) =>
    token.symbol.toLowerCase().includes(symbol.toLowerCase()),
  );
}

/**
 * Search tokens by name
 * @param {string} name - Token name to search for
 * @param {number} [chainId] - Optional chain ID to filter results
 * @returns {Array} Matching tokens
 */
export function searchByName(name, chainId = null) {
  const tokens = chainId ? getTokensByChain(chainId) : allTokens;
  return tokens.filter((token) =>
    token.name.toLowerCase().includes(name.toLowerCase()),
  );
}

/**
 * Get token by address
 * @param {string} address - Token contract address
 * @param {number} chainId - Chain ID
 * @returns {Object|null} Token object or null if not found
 */
export function getTokenByAddress(address, chainId) {
  const tokens = getTokensByChain(chainId);
  return (
    tokens.find(
      (token) => token.address.toLowerCase() === address.toLowerCase(),
    ) || null
  );
}

/**
 * Get tokens by tag (Mantle only)
 * @param {string} tag - Tag to filter by (e.g., "Top", "Stablecoins", "DeFi")
 * @returns {Array} Tokens with the specified tag
 */
export function getTokensByTag(tag) {
  return mantleTokens.filter((token) => token.tags && token.tags.includes(tag));
}

/**
 * Get common tokens across all chains by symbol
 * @param {number[]} [chainIds] - Optional array of chain IDs to compare (defaults to all)
 * @returns {Object} Object with symbol as key and a map of chainId -> token as value
 */
export function getCommonTokens(chainIds = null) {
  const targetChainIds = chainIds || Object.keys(tokensByChain).map(Number);
  const chainTokenSets = targetChainIds.map((id) => ({
    chainId: id,
    symbols: new Set(tokensByChain[id]?.map((t) => t.symbol) || []),
  }));

  // Find symbols present on every specified chain
  const [first, ...rest] = chainTokenSets;
  const commonSymbols = [...first.symbols].filter((symbol) =>
    rest.every(({ symbols }) => symbols.has(symbol)),
  );

  const commonTokens = {};
  commonSymbols.forEach((symbol) => {
    commonTokens[symbol] = {};
    targetChainIds.forEach((chainId) => {
      const token = tokensByChain[chainId]?.find((t) => t.symbol === symbol);
      if (token) commonTokens[symbol][chainId] = token;
    });
  });

  return commonTokens;
}

/**
 * Get token statistics
 * @returns {Object} Statistics about the token list
 */
export function getStatistics() {
  const commonTokens = getCommonTokens();
  const commonSymbols = Object.keys(commonTokens);

  // Count tags (Mantle only)
  const tagCounts = {};
  mantleTokens.forEach((token) => {
    if (token.tags) {
      token.tags.forEach((tag) => {
        tagCounts[tag] = (tagCounts[tag] || 0) + 1;
      });
    }
  });

  return {
    totalTokens: allTokens.length,
    tokensByChain: {
      ethereum: ethereumTokens.length,
      mantle: mantleTokens.length,
      arbitrum: arbitrumTokens.length,
      polygon: polygonTokens.length,
      avalanche: avalancheTokens.length,
      bsc: bscTokens.length,
    },
    commonTokens: {
      count: commonSymbols.length,
      symbols: commonSymbols.sort(),
    },
    mantleTags: tagCounts,
    chains: [
      {
        chainId: 1,
        name: "Ethereum Mainnet",
        tokenCount: ethereumTokens.length,
      },
      {
        chainId: 5000,
        name: "Mantle Network",
        tokenCount: mantleTokens.length,
        tags: Object.keys(tagCounts),
      },
      { chainId: 42161, name: "Arbitrum", tokenCount: arbitrumTokens.length },
      { chainId: 137, name: "Polygon", tokenCount: polygonTokens.length },
      {
        chainId: 43114,
        name: "Avalanche C-Chain",
        tokenCount: avalancheTokens.length,
      },
      { chainId: 56, name: "BNB Smart Chain", tokenCount: bscTokens.length },
    ],
  };
}

/**
 * Export a subset of tokens (useful for pagination)
 * @param {number} chainId - Chain ID
 * @param {number} limit - Number of tokens to return
 * @param {number} offset - Starting index
 * @returns {Array} Subset of tokens
 */
export function getTokensPage(chainId, limit = 7, offset = 0) {
  const tokens = getTokensByChain(chainId);
  return tokens.slice(offset, offset + limit);
}

// Default export
export default {
  config: tokenListConfig,
  allTokens,
  tokensByChain,
  chainMetadata,
  getTokensByChain,
  searchBySymbol,
  searchByName,
  getTokenByAddress,
  getTokensByTag,
  getCommonTokens,
  getStatistics,
  getTokensPage,
};
