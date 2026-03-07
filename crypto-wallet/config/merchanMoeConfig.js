// config/merchantMoeConfig.js
import { ethers } from "ethers";

/**
 * MERCHANT MOE (TRADER JOE LIQUIDITY BOOK) CONFIGURATION
 * Complete ABIs extracted from actual smart contracts
 */

// ============================================================================
// ROUTER ADDRESSES
// ============================================================================
export const MERCHANT_MOE_ROUTERS = {
  5000: "0x5991A2dF15A8F6A256D3Ec51E99254Cd3fb576A9", // Mantle Mainnet
  5003: "0x...", // Mantle Sepolia (if available)
};

// ============================================================================
// FACTORY ADDRESSES
// ============================================================================
export const MERCHANT_MOE_FACTORIES = {
  5000: "0x5bEf015CA9424A7C07B68490616a4C1F094BEdEc", // Mantle Mainnet
  5003: "0x...", // Mantle Sepolia (if available)
};

// ============================================================================
// WMNT ADDRESSES (for routing)
// ============================================================================
export const WMNT_ADDRESSES = {
  5000: "0x78c1b0C915c4FAA5FffA6CAbf0219DA63d7f4cb8", // Mantle Mainnet WMNT
  5003: "0x...", // Mantle Sepolia
};

// ============================================================================
// LIQUIDITY BOOK VERSIONS
// ============================================================================
export const LB_VERSION = {
  V1: 0,
  V2: 1,
  V2_1: 2,
};

// ============================================================================
// COMMON BIN STEPS (fee tiers)
// ============================================================================
export const COMMON_BIN_STEPS = [
  { value: 1, fee: "0.01%", name: "Ultra Low" },
  { value: 5, fee: "0.05%", name: "Very Low" },
  { value: 10, fee: "0.10%", name: "Low" },
  { value: 15, fee: "0.15%", name: "Low-Medium" },
  { value: 20, fee: "0.20%", name: "Medium" },
  { value: 25, fee: "0.25%", name: "Standard" }, // Most common
  { value: 50, fee: "0.50%", name: "High" },
  { value: 100, fee: "1.00%", name: "Very High" },
];

// ============================================================================
// COMPLETE ROUTER ABI (only swap functions)
// ============================================================================
export const MERCHANT_MOE_ROUTER_ABI = [
  // Get factory
  {
    inputs: [],
    name: "getFactory",
    outputs: [
      {
        internalType: "contract ILBFactory",
        name: "lbFactory",
        type: "address",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  // Get WNATIVE
  {
    inputs: [],
    name: "getWNATIVE",
    outputs: [
      { internalType: "contract IWNATIVE", name: "wnative", type: "address" },
    ],
    stateMutability: "view",
    type: "function",
  },
  // Get swap out (for quotes)
  {
    inputs: [
      { internalType: "contract ILBPair", name: "pair", type: "address" },
      { internalType: "uint128", name: "amountIn", type: "uint128" },
      { internalType: "bool", name: "swapForY", type: "bool" },
    ],
    name: "getSwapOut",
    outputs: [
      { internalType: "uint128", name: "amountInLeft", type: "uint128" },
      { internalType: "uint128", name: "amountOut", type: "uint128" },
      { internalType: "uint128", name: "fee", type: "uint128" },
    ],
    stateMutability: "view",
    type: "function",
  },
  // Swap exact tokens for tokens
  {
    inputs: [
      { internalType: "uint256", name: "amountIn", type: "uint256" },
      { internalType: "uint256", name: "amountOutMin", type: "uint256" },
      {
        components: [
          {
            internalType: "uint256[]",
            name: "pairBinSteps",
            type: "uint256[]",
          },
          { internalType: "uint8[]", name: "versions", type: "uint8[]" },
          { internalType: "address[]", name: "tokenPath", type: "address[]" },
        ],
        internalType: "struct ILBRouter.Path",
        name: "path",
        type: "tuple",
      },
      { internalType: "address", name: "to", type: "address" },
      { internalType: "uint256", name: "deadline", type: "uint256" },
    ],
    name: "swapExactTokensForTokens",
    outputs: [{ internalType: "uint256", name: "amountOut", type: "uint256" }],
    stateMutability: "nonpayable",
    type: "function",
  },
  // Swap exact NATIVE for tokens
  {
    inputs: [
      { internalType: "uint256", name: "amountOutMin", type: "uint256" },
      {
        components: [
          {
            internalType: "uint256[]",
            name: "pairBinSteps",
            type: "uint256[]",
          },
          { internalType: "uint8[]", name: "versions", type: "uint8[]" },
          { internalType: "address[]", name: "tokenPath", type: "address[]" },
        ],
        internalType: "struct ILBRouter.Path",
        name: "path",
        type: "tuple",
      },
      { internalType: "address", name: "to", type: "address" },
      { internalType: "uint256", name: "deadline", type: "uint256" },
    ],
    name: "swapExactNATIVEForTokens",
    outputs: [{ internalType: "uint256", name: "amountOut", type: "uint256" }],
    stateMutability: "payable",
    type: "function",
  },
  // Swap exact tokens for NATIVE
  {
    inputs: [
      { internalType: "uint256", name: "amountIn", type: "uint256" },
      { internalType: "uint256", name: "amountOutMinNATIVE", type: "uint256" },
      {
        components: [
          {
            internalType: "uint256[]",
            name: "pairBinSteps",
            type: "uint256[]",
          },
          { internalType: "uint8[]", name: "versions", type: "uint8[]" },
          { internalType: "address[]", name: "tokenPath", type: "address[]" },
        ],
        internalType: "struct ILBRouter.Path",
        name: "path",
        type: "tuple",
      },
      { internalType: "address payable", name: "to", type: "address" },
      { internalType: "uint256", name: "deadline", type: "uint256" },
    ],
    name: "swapExactTokensForNATIVE",
    outputs: [{ internalType: "uint256", name: "amountOut", type: "uint256" }],
    stateMutability: "nonpayable",
    type: "function",
  },
];

// ============================================================================
// COMPLETE FACTORY ABI (only what we need to find pairs)
// ============================================================================
export const MERCHANT_MOE_FACTORY_ABI = [
  // Get LB Pair information
  {
    inputs: [
      { internalType: "contract IERC20", name: "tokenA", type: "address" },
      { internalType: "contract IERC20", name: "tokenB", type: "address" },
      { internalType: "uint256", name: "binStep", type: "uint256" },
    ],
    name: "getLBPairInformation",
    outputs: [
      {
        components: [
          { internalType: "uint16", name: "binStep", type: "uint16" },
          { internalType: "contract ILBPair", name: "LBPair", type: "address" },
          { internalType: "bool", name: "createdByOwner", type: "bool" },
          { internalType: "bool", name: "ignoredForRouting", type: "bool" },
        ],
        internalType: "struct ILBFactory.LBPairInformation",
        name: "lbPairInformation",
        type: "tuple",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  // Get all LB pairs for token pair
  {
    inputs: [
      { internalType: "contract IERC20", name: "tokenX", type: "address" },
      { internalType: "contract IERC20", name: "tokenY", type: "address" },
    ],
    name: "getAllLBPairs",
    outputs: [
      {
        components: [
          { internalType: "uint16", name: "binStep", type: "uint16" },
          { internalType: "contract ILBPair", name: "LBPair", type: "address" },
          { internalType: "bool", name: "createdByOwner", type: "bool" },
          { internalType: "bool", name: "ignoredForRouting", type: "bool" },
        ],
        internalType: "struct ILBFactory.LBPairInformation[]",
        name: "lbPairsAvailable",
        type: "tuple[]",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  // Get all available bin steps
  {
    inputs: [],
    name: "getAllBinSteps",
    outputs: [
      {
        internalType: "uint256[]",
        name: "binStepWithPreset",
        type: "uint256[]",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
];

// ============================================================================
// COMPLETE LB PAIR ABI (only what we need for quotes)
// ============================================================================
export const MERCHANT_MOE_PAIR_ABI = [
  // Get token X
  {
    inputs: [],
    name: "getTokenX",
    outputs: [
      { internalType: "contract IERC20", name: "tokenX", type: "address" },
    ],
    stateMutability: "pure",
    type: "function",
  },
  // Get token Y
  {
    inputs: [],
    name: "getTokenY",
    outputs: [
      { internalType: "contract IERC20", name: "tokenY", type: "address" },
    ],
    stateMutability: "pure",
    type: "function",
  },
  // Get bin step
  {
    inputs: [],
    name: "getBinStep",
    outputs: [{ internalType: "uint16", name: "", type: "uint16" }],
    stateMutability: "pure",
    type: "function",
  },
  // Get active ID (current bin)
  {
    inputs: [],
    name: "getActiveId",
    outputs: [{ internalType: "uint24", name: "activeId", type: "uint24" }],
    stateMutability: "view",
    type: "function",
  },
  // Get reserves
  {
    inputs: [],
    name: "getReserves",
    outputs: [
      { internalType: "uint128", name: "reserveX", type: "uint128" },
      { internalType: "uint128", name: "reserveY", type: "uint128" },
    ],
    stateMutability: "view",
    type: "function",
  },
  // Get swap out (for quotes) - THIS IS THE KEY FUNCTION
  {
    inputs: [
      { internalType: "uint128", name: "amountIn", type: "uint128" },
      { internalType: "bool", name: "swapForY", type: "bool" },
    ],
    name: "getSwapOut",
    outputs: [
      { internalType: "uint128", name: "amountInLeft", type: "uint128" },
      { internalType: "uint128", name: "amountOut", type: "uint128" },
      { internalType: "uint128", name: "fee", type: "uint128" },
    ],
    stateMutability: "view",
    type: "function",
  },
  // Swap function (for actual swaps)
  {
    inputs: [
      { internalType: "bool", name: "swapForY", type: "bool" },
      { internalType: "address", name: "to", type: "address" },
    ],
    name: "swap",
    outputs: [{ internalType: "bytes32", name: "amountsOut", type: "bytes32" }],
    stateMutability: "nonpayable",
    type: "function",
  },
];

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get router address for chain
 */
export const getMerchantMoeRouter = (chainId) => {
  return MERCHANT_MOE_ROUTERS[chainId] || null;
};

/**
 * Get factory address for chain
 */
export const getMerchantMoeFactory = (chainId) => {
  return MERCHANT_MOE_FACTORIES[chainId] || null;
};

/**
 * Get WMNT address for chain
 */
export const getWMNTAddress = (chainId) => {
  return WMNT_ADDRESSES[chainId] || null;
};

/**
 * Check if Merchant Moe is available on chain
 */
export const isMerchantMoeAvailable = (chainId) => {
  return !!MERCHANT_MOE_ROUTERS[chainId] && !!MERCHANT_MOE_FACTORIES[chainId];
};

/**
 * Check if token is native (MNT/ETH)
 */
export const isNativeToken = (address) => {
  return (
    address === "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE" ||
    address === "0x0000000000000000000000000000000000000000" ||
    address.toLowerCase() === "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"
  );
};

/**
 * Get deadline timestamp (20 minutes from now)
 */
export const getDeadline = () => {
  return Math.floor(Date.now() / 1000) + 60 * 20; // 20 minutes
};

/**
 * Build Path struct for swaps
 * @param {Object} fromToken - From token object
 * @param {Object} toToken - To token object
 * @param {number} binStep - Bin step for the pair
 * @param {number} version - LB version (default: V2_1)
 */
export const buildPath = (
  fromToken,
  toToken,
  binStep,
  version = LB_VERSION.V2_1,
) => {
  // Convert native tokens to WMNT
  const fromAddress = isNativeToken(fromToken.address)
    ? getWMNTAddress(fromToken.chainId)
    : fromToken.address;

  const toAddress = isNativeToken(toToken.address)
    ? getWMNTAddress(toToken.chainId)
    : toToken.address;

  return {
    pairBinSteps: [binStep],
    versions: [version],
    tokenPath: [fromAddress, toAddress],
  };
};

/**
 * Calculate price impact
 */
export const calculatePriceImpact = (
  amountIn,
  amountOut,
  reserveIn,
  reserveOut,
) => {
  try {
    const exactQuote =
      (parseFloat(amountIn) * parseFloat(reserveOut)) / parseFloat(reserveIn);
    const priceImpact =
      ((exactQuote - parseFloat(amountOut)) / exactQuote) * 100;
    return Math.max(0, priceImpact);
  } catch (err) {
    return 0;
  }
};

export default {
  MERCHANT_MOE_ROUTERS,
  MERCHANT_MOE_FACTORIES,
  WMNT_ADDRESSES,
  LB_VERSION,
  COMMON_BIN_STEPS,
  MERCHANT_MOE_ROUTER_ABI,
  MERCHANT_MOE_FACTORY_ABI,
  MERCHANT_MOE_PAIR_ABI,
  getMerchantMoeRouter,
  getMerchantMoeFactory,
  getWMNTAddress,
  isMerchantMoeAvailable,
  isNativeToken,
  getDeadline,
  buildPath,
  calculatePriceImpact,
};
