import { ethers } from "ethers";
import { DEX_FLAGS } from "./RouteEncoder";

/**
 * Merchant Moe API Service
 * Fetches optimal routes from their aggregator API
 */

const API_BASE_URL = "https://router.lfj.gg/v2/aggregator/routes/mantle";
const AGGREGATOR = "jar"; // Their main aggregator

/**
 * Map API pair type to DEX flags
 */
function mapPairTypeToDexFlag(pairType, pairData) {
  if (pairType === "univ3") {
    return DEX_FLAGS.UNISWAP_V3;
  } else if (pairType === "v2") {
    // Check lbType for v2 variants
    if (pairData?.lbType === "v2.2") {
      return DEX_FLAGS.LFJ_LB; // v2.2
    } else if (pairData?.lbType === "v2.1") {
      return DEX_FLAGS.LFJ_LB; // v2.1
    } else if (pairData?.lbType === "v2.0") {
      return DEX_FLAGS.LFJ_LEGACY_LB; // v2.0
    }
    // Default to LFJ_LB if no lbType specified
    return DEX_FLAGS.LFJ_LB;
  }

  // Default fallback
  return DEX_FLAGS.UNISWAP_V2;
}

/**
 * Fetch route from Merchant Moe API
 *
 * @param {string} tokenIn - Input token address
 * @param {string} tokenOut - Output token address
 * @param {string} amountIn - Amount in wei (as string)
 * @returns {Promise<Object>} Route data from API
 */
export async function fetchMerchantMoeRoute(tokenIn, tokenOut, amountIn) {
  try {
    // Normalize addresses
    tokenIn = ethers.getAddress(tokenIn);
    tokenOut = ethers.getAddress(tokenOut);

    // Build API URL
    const url = new URL(`${API_BASE_URL}/${AGGREGATOR}/quote`);
    url.searchParams.append("tokenIn", tokenIn);
    url.searchParams.append("tokenOut", tokenOut);
    url.searchParams.append("amountIn", amountIn);

    console.log("[MerchantMoeAPI] Fetching route:", url.toString());

    const response = await fetch(url.toString(), {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(`API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();

    console.log("[MerchantMoeAPI] Route received:", data);

    return data;
  } catch (error) {
    console.error("[MerchantMoeAPI] Error fetching route:", error);
    throw error;
  }
}

/**
 * Parse API response into a flat list of swaps
 * Flattens the nested swap structure into a linear sequence
 *
 * @param {Object} apiResponse - Response from API
 * @returns {Array} Flat array of swaps with percentages
 */
export function parseApiRouteToSwaps(apiResponse) {
  const swaps = [];

  function traverseSwaps(tokenSwaps, parentPercent = 10000) {
    if (!tokenSwaps || tokenSwaps.length === 0) return;

    for (const swap of tokenSwaps) {
      const percent = Math.floor((swap.amountBp / 10000) * parentPercent);

      swaps.push({
        pair: swap.pair.address,
        tokenIn: swap.tokenIn.address,
        tokenOut: swap.tokenOut.address,
        dexType: mapPairTypeToDexFlag(swap.pair.type, swap.pair.data),
        percent,
        pairType: swap.pair.type,
        pairData: swap.pair.data,
      });

      // Recursively process nested swaps
      if (swap.tokenOut.swaps && swap.tokenOut.swaps.length > 0) {
        traverseSwaps(swap.tokenOut.swaps, percent);
      }
    }
  }

  traverseSwaps(apiResponse.tokenIn.swaps);

  return swaps;
}

/**
 * Build token list from parsed swaps
 *
 * @param {string} tokenIn - Input token address
 * @param {string} tokenOut - Output token address
 * @param {Array} swaps - Parsed swaps array
 * @returns {Array} Ordered array of unique token addresses
 */
export function buildTokenList(tokenIn, tokenOut, swaps) {
  const tokenSet = new Set([tokenIn]);

  for (const swap of swaps) {
    tokenSet.add(swap.tokenIn);
    tokenSet.add(swap.tokenOut);
  }

  tokenSet.add(tokenOut);

  return Array.from(tokenSet);
}

/**
 * Get token ID from token list
 *
 * @param {Array} tokens - Token list
 * @param {string} tokenAddress - Token address to find
 * @returns {number} Token index
 */
export function getTokenId(tokens, tokenAddress) {
  return tokens.indexOf(ethers.getAddress(tokenAddress));
}

/**
 * SIMPLIFIED: Convert API route to simple route (first path only)
 *
 * For complex split routes, we'll use only the first/main path
 * This avoids the complexity of encoding split routes
 *
 * @param {Object} apiResponse - API response
 * @returns {Object} Simplified route info
 */
export function simplifyApiRoute(apiResponse) {
  const tokenIn = apiResponse.tokenIn.address;
  const tokenOut = apiResponse.tokenOut.address;

  // Get the first swap path (usually the largest one)
  const firstSwapPath = apiResponse.tokenIn.swaps[0];

  if (!firstSwapPath) {
    throw new Error("No swap path found in API response");
  }

  // Build a linear path by following the first swap at each level
  const tokens = [tokenIn];
  const swaps = [];

  function followPath(currentSwap) {
    swaps.push({
      pair: currentSwap.pair.address,
      tokenIn: currentSwap.tokenIn.address,
      tokenOut: currentSwap.tokenOut.address,
      dexType: mapPairTypeToDexFlag(
        currentSwap.pair.type,
        currentSwap.pair.data,
      ),
      pairType: currentSwap.pair.type,
      pairData: currentSwap.pair.data,
    });

    tokens.push(currentSwap.tokenOut.address);

    // If there are nested swaps, follow the first one
    if (currentSwap.tokenOut.swaps && currentSwap.tokenOut.swaps.length > 0) {
      followPath(currentSwap.tokenOut.swaps[0]);
    }
  }

  followPath(firstSwapPath);

  return {
    tokens,
    swaps,
    amountIn: apiResponse.amountIn,
    amountOut: apiResponse.amountOut,
    isSimplified: apiResponse.tokenIn.swaps.length > 1, // True if we simplified a split route
  };
}

/**
 * Fetch and simplify route in one call
 *
 * @param {string} tokenIn - Input token address
 * @param {string} tokenOut - Output token address
 * @param {string} amountIn - Amount in wei
 * @returns {Promise<Object>} Simplified route
 */
export async function fetchSimplifiedRoute(tokenIn, tokenOut, amountIn) {
  const apiResponse = await fetchMerchantMoeRoute(tokenIn, tokenOut, amountIn);
  return simplifyApiRoute(apiResponse);
}

export default {
  fetchMerchantMoeRoute,
  parseApiRouteToSwaps,
  buildTokenList,
  getTokenId,
  simplifyApiRoute,
  fetchSimplifiedRoute,
};
