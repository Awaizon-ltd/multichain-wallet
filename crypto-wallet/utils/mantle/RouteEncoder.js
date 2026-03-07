import { ethers } from "ethers";

/**
 * Merchant Moe Route Encoder
 * Encodes routes in the PackedRoute format for the Router
 *
 * Route Format:
 * [nbTokens][isTransferTax, token0, token1, ..., tokenN]
 * [{pair, percent, flags, tokenInId, tokenOutId}, ...]
 */

// ============================================
// DEX TYPE FLAGS (from Flags library)
// ============================================
export const DEX_FLAGS = {
  UNISWAP_V2: 0x0000, // 0
  LFJ_LEGACY_LB: 0x0001, // 1 (v2.0)
  LFJ_LB: 0x0002, // 2 (v2.1, v2.2)
  UNISWAP_V3: 0x0003, // 3
  TOKEN_MILL: 0x0004, // 4
  TOKEN_MILL_V2: 0x0005, // 5
  UNISWAP_V4: 0x0006, // 6
  BYREAL: 0x0007, // 7
  FEE_ID: 0x0008, // 8 (for fee routes)
};

// Additional flags
export const SWAP_FLAGS = {
  ZERO_FOR_ONE: 0x0100, // Swap token0 for token1
  ONE_FOR_ZERO: 0x0000, // Swap token1 for token0
  CALLBACK: 0x0200, // Requires callback (for Uniswap V3/V4)
};

// Basis points (for percentages)
const BPS = 10000; // 100% = 10000

/**
 * Encode a simple direct swap route
 *
 * @param {string} tokenIn - Input token address
 * @param {string} tokenOut - Output token address
 * @param {string} pairAddress - Pair/pool address
 * @param {number} dexType - DEX type flag (from DEX_FLAGS)
 * @param {boolean} zeroForOne - True if tokenIn is token0 in the pair
 * @param {boolean} isTransferTax - True if tokenIn has transfer tax
 * @returns {string} Encoded route as hex string
 */
export function encodeSimpleRoute(
  tokenIn,
  tokenOut,
  pairAddress,
  dexType = DEX_FLAGS.UNISWAP_V2,
  zeroForOne = true,
  isTransferTax = false,
) {
  // Number of tokens (2 for direct swap)
  const nbTokens = 2;

  // Build flags
  let flags = dexType;
  if (zeroForOne) {
    flags |= SWAP_FLAGS.ZERO_FOR_ONE;
  }

  // Add callback flag for Uniswap V3
  if (dexType === DEX_FLAGS.UNISWAP_V3) {
    flags |= SWAP_FLAGS.CALLBACK;
  }

  // Encode route
  const abiCoder = ethers.AbiCoder.defaultAbiCoder();

  // Format:
  // uint8 nbTokens
  // bool isTransferTax
  // address[] tokens (token0, token1)
  // For each swap:
  //   address pair
  //   uint16 percent (10000 = 100%)
  //   uint16 flags
  //   uint8 tokenInId
  //   uint8 tokenOutId

  const encoded = ethers.concat([
    // Number of tokens (1 byte)
    ethers.toBeHex(nbTokens, 1),

    // Transfer tax flag (1 byte)
    ethers.toBeHex(isTransferTax ? 1 : 0, 1),

    // Token addresses (20 bytes each)
    ethers.getAddress(tokenIn),
    ethers.getAddress(tokenOut),

    // Swap data (26 bytes total):
    // - pair address (20 bytes)
    // - percent (2 bytes)
    // - flags (2 bytes)
    // - tokenInId (1 byte)
    // - tokenOutId (1 byte)
    ethers.getAddress(pairAddress),
    ethers.toBeHex(BPS, 2), // 10000 = 100%
    ethers.toBeHex(flags, 2),
    ethers.toBeHex(0, 1), // tokenInId = 0
    ethers.toBeHex(1, 1), // tokenOutId = 1
  ]);

  return encoded;
}

/**
 * Encode a multi-hop route (e.g., Token A → Token B → Token C)
 *
 * @param {Array<string>} tokens - Array of token addresses [tokenA, tokenB, tokenC]
 * @param {Array<Object>} swaps - Array of swap configs
 * @param {boolean} isTransferTax - True if first token has transfer tax
 * @returns {string} Encoded route
 */
export function encodeMultiHopRoute(tokens, swaps, isTransferTax = false) {
  if (tokens.length < 2) {
    throw new Error("Need at least 2 tokens");
  }

  if (swaps.length !== tokens.length - 1) {
    throw new Error("Number of swaps must be tokens.length - 1");
  }

  // Start with token count and transfer tax flag
  let encoded = ethers.concat([
    ethers.toBeHex(tokens.length, 1),
    ethers.toBeHex(isTransferTax ? 1 : 0, 1),
  ]);

  // Add all token addresses
  for (const token of tokens) {
    encoded = ethers.concat([encoded, ethers.getAddress(token)]);
  }

  // Add swap data
  for (let i = 0; i < swaps.length; i++) {
    const swap = swaps[i];

    let flags = swap.dexType || DEX_FLAGS.UNISWAP_V2;
    if (swap.zeroForOne) {
      flags |= SWAP_FLAGS.ZERO_FOR_ONE;
    }
    if (swap.callback || swap.dexType === DEX_FLAGS.UNISWAP_V3) {
      flags |= SWAP_FLAGS.CALLBACK;
    }

    // Default to 100% for last swap, otherwise use provided percent
    const percent = i === swaps.length - 1 ? BPS : swap.percent || BPS;

    encoded = ethers.concat([
      encoded,
      ethers.getAddress(swap.pair),
      ethers.toBeHex(percent, 2),
      ethers.toBeHex(flags, 2),
      ethers.toBeHex(i, 1), // tokenInId
      ethers.toBeHex(i + 1, 1), // tokenOutId
    ]);
  }

  return encoded;
}

/**
 * Decode a route (for debugging)
 *
 * @param {string} encodedRoute - Hex string route
 * @returns {Object} Decoded route data
 */
export function decodeRoute(encodedRoute) {
  const bytes = ethers.getBytes(encodedRoute);

  const nbTokens = bytes[0];
  const isTransferTax = bytes[1] !== 0;

  let offset = 2;
  const tokens = [];

  // Read tokens
  for (let i = 0; i < nbTokens; i++) {
    const tokenBytes = bytes.slice(offset, offset + 20);
    tokens.push(ethers.hexlify(tokenBytes));
    offset += 20;
  }

  // Read swaps
  const swaps = [];
  while (offset < bytes.length - 3) {
    // -3 for potential extra data length
    const pairBytes = bytes.slice(offset, offset + 20);
    const pair = ethers.hexlify(pairBytes);
    offset += 20;

    const percent = (bytes[offset] << 8) | bytes[offset + 1];
    offset += 2;

    const flags = (bytes[offset] << 8) | bytes[offset + 1];
    offset += 2;

    const tokenInId = bytes[offset];
    offset += 1;

    const tokenOutId = bytes[offset];
    offset += 1;

    swaps.push({
      pair,
      percent,
      flags,
      tokenInId,
      tokenOutId,
      dexType: flags & 0xff,
      zeroForOne: (flags & SWAP_FLAGS.ZERO_FOR_ONE) !== 0,
      callback: (flags & SWAP_FLAGS.CALLBACK) !== 0,
    });
  }

  return {
    nbTokens,
    isTransferTax,
    tokens,
    swaps,
  };
}

/**
 * Helper to determine token order in a pair
 * Uniswap V2 style pairs order tokens by address
 *
 * @param {string} tokenA - First token address
 * @param {string} tokenB - Second token address
 * @returns {boolean} True if tokenA is token0 (comes first)
 */
export function isToken0(tokenA, tokenB) {
  return tokenA.toLowerCase() < tokenB.toLowerCase();
}

/**
 * Example usage:
 *
 * // Simple direct swap
 * const route = encodeSimpleRoute(
 *   "0xTokenInAddress",
 *   "0xTokenOutAddress",
 *   "0xPairAddress",
 *   DEX_FLAGS.UNISWAP_V2,
 *   true,  // zeroForOne
 *   false  // isTransferTax
 * );
 *
 * // Multi-hop swap: USDC → WETH → MNT
 * const route = encodeMultiHopRoute(
 *   ["0xUSDC", "0xWETH", "0xMNT"],
 *   [
 *     { pair: "0xUSDC-WETH-Pair", dexType: DEX_FLAGS.UNISWAP_V2, zeroForOne: true },
 *     { pair: "0xWETH-MNT-Pair", dexType: DEX_FLAGS.LFJ_LB, zeroForOne: false }
 *   ]
 * );
 */

export default {
  encodeSimpleRoute,
  encodeMultiHopRoute,
  decodeRoute,
  isToken0,
  DEX_FLAGS,
  SWAP_FLAGS,
};
