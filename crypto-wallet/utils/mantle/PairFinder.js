import { ethers } from "ethers";
import { DEX_FLAGS } from "./RouteEncoder";

/**
 * Merchant Moe Pair Finder
 * Finds pair/pool addresses for token swaps on different DEXs
 */

// ============================================
// FACTORY ADDRESSES (Mantle - Chain ID 5000)
// ============================================

// TODO: Replace with actual Merchant Moe factory addresses on Mantle
export const FACTORIES = {
  // Uniswap V2 style factory
  UNISWAP_V2: "0x0000000000000000000000000000000000000000", // TODO: Get actual address

  // Liquidity Book factory (v2.1/v2.2)
  LB_FACTORY: "0x0000000000000000000000000000000000000000", // TODO: Get actual address

  // Legacy LB factory (v2.0)
  LEGACY_LB_FACTORY: "0x0000000000000000000000000000000000000000", // TODO: Get actual address
};

// ============================================
// FACTORY ABIs
// ============================================

const UNISWAP_V2_FACTORY_ABI = [
  "function getPair(address tokenA, address tokenB) external view returns (address pair)",
];

const LB_FACTORY_ABI = [
  "function getLBPairInformation(address tokenA, address tokenB, uint256 binStep) external view returns (address lbPair, uint256 binStep)",
  "function getAllLBPairs(address tokenX, address tokenY) external view returns (tuple(uint16 binStep, address lbPair)[] memory)",
];

// ============================================
// PAIR FINDER
// ============================================

/**
 * Find Uniswap V2 style pair
 *
 * @param {Object} provider - Ethers provider
 * @param {string} tokenA - First token address
 * @param {string} tokenB - Second token address
 * @param {string} factoryAddress - Factory contract address
 * @returns {Promise<string|null>} Pair address or null if not found
 */
export async function findUniswapV2Pair(
  provider,
  tokenA,
  tokenB,
  factoryAddress = FACTORIES.UNISWAP_V2,
) {
  try {
    if (factoryAddress === "0x0000000000000000000000000000000000000000") {
      console.warn("Uniswap V2 factory address not configured");
      return null;
    }

    const factory = new ethers.Contract(
      factoryAddress,
      UNISWAP_V2_FACTORY_ABI,
      provider,
    );

    const pairAddress = await factory.getPair(tokenA, tokenB);

    if (pairAddress === ethers.ZeroAddress) {
      return null;
    }

    return pairAddress;
  } catch (error) {
    console.error("Error finding Uniswap V2 pair:", error);
    return null;
  }
}

/**
 * Find Liquidity Book pair
 *
 * @param {Object} provider - Ethers provider
 * @param {string} tokenA - First token address
 * @param {string} tokenB - Second token address
 * @param {number} binStep - Bin step (default 25 for standard pools)
 * @param {string} factoryAddress - LB Factory address
 * @returns {Promise<string|null>} LB pair address or null
 */
export async function findLBPair(
  provider,
  tokenA,
  tokenB,
  binStep = 25,
  factoryAddress = FACTORIES.LB_FACTORY,
) {
  try {
    if (factoryAddress === "0x0000000000000000000000000000000000000000") {
      console.warn("LB factory address not configured");
      return null;
    }

    const factory = new ethers.Contract(
      factoryAddress,
      LB_FACTORY_ABI,
      provider,
    );

    const [lbPair] = await factory.getLBPairInformation(
      tokenA,
      tokenB,
      binStep,
    );

    if (lbPair === ethers.ZeroAddress) {
      return null;
    }

    return lbPair;
  } catch (error) {
    console.error("Error finding LB pair:", error);
    return null;
  }
}

/**
 * Find all available LB pairs for a token pair
 *
 * @param {Object} provider - Ethers provider
 * @param {string} tokenA - First token address
 * @param {string} tokenB - Second token address
 * @param {string} factoryAddress - LB Factory address
 * @returns {Promise<Array>} Array of {binStep, pairAddress} objects
 */
export async function findAllLBPairs(
  provider,
  tokenA,
  tokenB,
  factoryAddress = FACTORIES.LB_FACTORY,
) {
  try {
    if (factoryAddress === "0x0000000000000000000000000000000000000000") {
      console.warn("LB factory address not configured");
      return [];
    }

    const factory = new ethers.Contract(
      factoryAddress,
      LB_FACTORY_ABI,
      provider,
    );

    const pairs = await factory.getAllLBPairs(tokenA, tokenB);

    return pairs
      .filter((p) => p.lbPair !== ethers.ZeroAddress)
      .map((p) => ({
        binStep: Number(p.binStep),
        pairAddress: p.lbPair,
      }));
  } catch (error) {
    console.error("Error finding all LB pairs:", error);
    return [];
  }
}

/**
 * Find the best available pair for a token swap
 * Tries different DEX types in order of preference
 *
 * @param {Object} provider - Ethers provider
 * @param {string} tokenIn - Input token address
 * @param {string} tokenOut - Output token address
 * @returns {Promise<Object|null>} Pair info or null
 */
export async function findBestPair(provider, tokenIn, tokenOut) {
  try {
    // Try LB pairs first (usually better for volatile pairs)
    const lbPairs = await findAllLBPairs(provider, tokenIn, tokenOut);
    if (lbPairs.length > 0) {
      // Return the first LB pair (typically the most liquid)
      return {
        pairAddress: lbPairs[0].pairAddress,
        dexType: DEX_FLAGS.LFJ_LB,
        binStep: lbPairs[0].binStep,
      };
    }

    // Try Uniswap V2 style pair
    const v2Pair = await findUniswapV2Pair(provider, tokenIn, tokenOut);
    if (v2Pair) {
      return {
        pairAddress: v2Pair,
        dexType: DEX_FLAGS.UNISWAP_V2,
      };
    }

    // No pair found
    return null;
  } catch (error) {
    console.error("Error finding best pair:", error);
    return null;
  }
}

/**
 * Find route with intermediate token (multi-hop)
 * Useful when no direct pair exists
 *
 * @param {Object} provider - Ethers provider
 * @param {string} tokenIn - Input token address
 * @param {string} tokenOut - Output token address
 * @param {string} intermediateToken - Intermediate token (like WETH, USDC)
 * @returns {Promise<Object|null>} Route info with two pairs
 */
export async function findMultiHopRoute(
  provider,
  tokenIn,
  tokenOut,
  intermediateToken,
) {
  try {
    // Find pair1: tokenIn → intermediate
    const pair1 = await findBestPair(provider, tokenIn, intermediateToken);
    if (!pair1) {
      return null;
    }

    // Find pair2: intermediate → tokenOut
    const pair2 = await findBestPair(provider, intermediateToken, tokenOut);
    if (!pair2) {
      return null;
    }

    return {
      tokens: [tokenIn, intermediateToken, tokenOut],
      pairs: [pair1, pair2],
    };
  } catch (error) {
    console.error("Error finding multi-hop route:", error);
    return null;
  }
}

/**
 * Check if a pair has sufficient liquidity
 *
 * @param {Object} provider - Ethers provider
 * @param {string} pairAddress - Pair address
 * @param {number} dexType - DEX type
 * @returns {Promise<boolean>} True if has liquidity
 */
export async function checkPairLiquidity(provider, pairAddress, dexType) {
  try {
    if (dexType === DEX_FLAGS.UNISWAP_V2) {
      // Check Uniswap V2 reserves
      const pairAbi = [
        "function getReserves() external view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)",
      ];
      const pair = new ethers.Contract(pairAddress, pairAbi, provider);
      const [reserve0, reserve1] = await pair.getReserves();

      return reserve0 > 0n && reserve1 > 0n;
    } else if (dexType === DEX_FLAGS.LFJ_LB) {
      // Check LB active bin
      const lbPairAbi = [
        "function getActiveId() external view returns (uint24)",
      ];
      const pair = new ethers.Contract(pairAddress, lbPairAbi, provider);
      const activeId = await pair.getActiveId();

      return activeId > 0;
    }

    // Default to true for unknown types
    return true;
  } catch (error) {
    console.error("Error checking pair liquidity:", error);
    return false;
  }
}

/**
 * Get pair reserves for price estimation
 *
 * @param {Object} provider - Ethers provider
 * @param {string} pairAddress - Pair address
 * @param {number} dexType - DEX type
 * @returns {Promise<Object|null>} {reserve0, reserve1} or null
 */
export async function getPairReserves(provider, pairAddress, dexType) {
  try {
    if (dexType === DEX_FLAGS.UNISWAP_V2) {
      const pairAbi = [
        "function getReserves() external view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)",
        "function token0() external view returns (address)",
        "function token1() external view returns (address)",
      ];
      const pair = new ethers.Contract(pairAddress, pairAbi, provider);
      const [reserve0, reserve1] = await pair.getReserves();
      const token0 = await pair.token0();
      const token1 = await pair.token1();

      return {
        reserve0,
        reserve1,
        token0,
        token1,
      };
    }

    // LB pairs have different liquidity structure
    // Would need more complex queries

    return null;
  } catch (error) {
    console.error("Error getting pair reserves:", error);
    return null;
  }
}

export default {
  findUniswapV2Pair,
  findLBPair,
  findAllLBPairs,
  findBestPair,
  findMultiHopRoute,
  checkPairLiquidity,
  getPairReserves,
  FACTORIES,
};
