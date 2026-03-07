import { useMemo } from "react";

/**
 * Router Configuration Hook
 * Custom DEX Router integration with trusted logic contracts
 */

// ============================================
// CONTRACT ADDRESSES - REPLACE WITH YOUR ACTUAL ADDRESSES
// ============================================

// For Mantle blockchain
const ROUTER_CONFIG = {
  ROUTER_ADDRESS: "0x45A62B090DF48243F12A21897e7ed91863E2c86b",
  WNATIVE_ADDRESS: "0x78c1b0C915c4FAA5FffA6CAbf0219DA63d7f4cb8", // WMNT on Mantle
  TRUSTED_LOGICS: [
    "0xF961ee51015b1EfB4461D40D1f6b58a7832E931D", // The RouterLogic contract
  ],
  CHAIN_ID: 5000, // Mantle
  CHAIN_NAME: "Mantle",
  NATIVE_SYMBOL: "MNT",
};

// ============================================
// COMMON TOKEN ADDRESSES
// ============================================

const TOKENS = {
  // Native token placeholder (address(0) in contracts)
  NATIVE: "0xDeadDeAddeAddEAddeadDEaDDEAdDeaDDeAD0000",

  // Wrapped native token
  WNATIVE: ROUTER_CONFIG.WNATIVE_ADDRESS,

  // Add your commonly used tokens here
  // USDC: "0x...",
  // USDT: "0x...",
  // DAI: "0x...",
};

// ============================================
// SWAP CONFIGURATION
// ============================================

const SWAP_CONFIG = {
  // Default slippage tolerance (0.5%)
  DEFAULT_SLIPPAGE_TOLERANCE: 0.5,

  // Default deadline (20 minutes from now)
  DEFAULT_DEADLINE_MINUTES: 20,

  // Gas limits
  GAS_LIMITS: {
    SWAP_EXACT_IN: 500000n,
    SWAP_EXACT_OUT: 500000n,
    APPROVE: 100000n,
  },

  // Minimum amounts to consider (in wei)
  MIN_SWAP_AMOUNT: 1000n,
};

// ============================================
// ROUTER ABI
// ============================================

const ROUTER_ABI = [
  // View functions
  "function WNATIVE() external view returns (address)",
  "function getTrustedLogicAt(uint256 index) external view returns (address)",
  "function getTrustedLogicLength() external view returns (uint256)",

  // Swap functions
  "function swapExactIn(address logic, address tokenIn, address tokenOut, uint256 amountIn, uint256 amountOutMin, address to, uint256 deadline, bytes memory route) external payable returns (uint256, uint256)",
  "function swapExactOut(address logic, address tokenIn, address tokenOut, uint256 amountOut, uint256 amountInMax, address to, uint256 deadline, bytes memory route) external payable returns (uint256, uint256)",

  // Simulation functions for quotes
  "function simulate(address logic, address tokenIn, address tokenOut, uint256 amountIn, uint256 amountOut, address to, bool exactIn, bytes[] calldata route) external payable",
  "function simulateSingle(address logic, address tokenIn, address tokenOut, uint256 amountIn, uint256 amountOut, address to, bool exactIn, bytes calldata route) external payable",

  // Events
  "event SwapExactIn(address indexed sender, address to, address tokenIn, address tokenOut, uint256 amountIn, uint256 amountOut)",
  "event SwapExactOut(address indexed sender, address to, address tokenIn, address tokenOut, uint256 amountIn, uint256 amountOut)",
];

// ============================================
// ERC20 ABI
// ============================================

const ERC20_ABI = [
  "function approve(address spender, uint256 amount) external returns (bool)",
  "function allowance(address owner, address spender) external view returns (uint256)",
  "function balanceOf(address account) external view returns (uint256)",
  "function decimals() external view returns (uint8)",
  "function symbol() external view returns (string)",
  "function name() external view returns (string)",
  "function totalSupply() external view returns (uint256)",
];

// ============================================
// MERCHANT MOE CONFIG HOOK
// ============================================

/**
 * Main configuration hook for Router integration
 * Provides configuration values and helper functions
 */
export function useMerchantMoeConfig() {
  // Memoize configuration to prevent recreating on every render
  const config = useMemo(
    () => ({
      // Router configuration
      routerAddress: ROUTER_CONFIG.ROUTER_ADDRESS,
      wnativeAddress: ROUTER_CONFIG.WNATIVE_ADDRESS,
      trustedLogics: ROUTER_CONFIG.TRUSTED_LOGICS,
      chainId: ROUTER_CONFIG.CHAIN_ID,
      chainName: ROUTER_CONFIG.CHAIN_NAME,
      nativeSymbol: ROUTER_CONFIG.NATIVE_SYMBOL,

      // Token addresses
      tokens: TOKENS,

      // Swap configuration
      defaultSlippage: SWAP_CONFIG.DEFAULT_SLIPPAGE_TOLERANCE,
      defaultDeadlineMinutes: SWAP_CONFIG.DEFAULT_DEADLINE_MINUTES,
      gasLimits: SWAP_CONFIG.GAS_LIMITS,
      minSwapAmount: SWAP_CONFIG.MIN_SWAP_AMOUNT,

      // ABIs
      routerAbi: ROUTER_ABI,
      erc20Abi: ERC20_ABI,
    }),
    [],
  );

  /**
   * Get the default logic contract address
   * @returns {string} The first trusted logic contract address
   */
  const getDefaultLogic = useMemo(
    () => () => {
      if (config.trustedLogics.length === 0) {
        throw new Error("No trusted logic contracts configured");
      }
      return config.trustedLogics[0];
    },
    [config.trustedLogics],
  );

  /**
   * Calculate deadline timestamp
   * @param {number} minutes - Minutes from now
   * @returns {number} Unix timestamp
   */
  const getDeadline = useMemo(
    () =>
      (minutes = config.defaultDeadlineMinutes) => {
        return Math.floor(Date.now() / 1000) + minutes * 60;
      },
    [config.defaultDeadlineMinutes],
  );

  /**
   * Calculate minimum output amount with slippage
   * @param {bigint} amountOut - Expected output amount
   * @param {number} slippageTolerance - Slippage tolerance percentage (e.g., 0.5 for 0.5%)
   * @returns {bigint} Minimum output amount
   */
  const calculateMinAmountOut = useMemo(
    () =>
      (amountOut, slippageTolerance = config.defaultSlippage) => {
        const slippageBps = BigInt(Math.floor(slippageTolerance * 100));
        return (amountOut * (10000n - slippageBps)) / 10000n;
      },
    [config.defaultSlippage],
  );

  /**
   * Calculate maximum input amount with slippage
   * @param {bigint} amountIn - Expected input amount
   * @param {number} slippageTolerance - Slippage tolerance percentage (e.g., 0.5 for 0.5%)
   * @returns {bigint} Maximum input amount
   */
  const calculateMaxAmountIn = useMemo(
    () =>
      (amountIn, slippageTolerance = config.defaultSlippage) => {
        const slippageBps = BigInt(Math.floor(slippageTolerance * 100));
        return (amountIn * (10000n + slippageBps)) / 10000n;
      },
    [config.defaultSlippage],
  );

  /**
   * Check if an address is the native token
   * @param {string} address - Token address
   * @returns {boolean} True if native token
   */
  const isNativeToken = useMemo(
    () => (address) => {
      return (
        address === config.tokens.NATIVE ||
        address === "0x0000000000000000000000000000000000000000"
      );
    },
    [config.tokens.NATIVE],
  );

  /**
   * Validate router configuration
   * @throws {Error} If configuration is invalid
   */
  const validateConfig = useMemo(
    () => () => {
      const errors = [];

      if (
        config.routerAddress === "0x0000000000000000000000000000000000000000"
      ) {
        errors.push("ROUTER_ADDRESS is not configured");
      }

      if (
        config.wnativeAddress === "0x0000000000000000000000000000000000000000"
      ) {
        errors.push("WNATIVE_ADDRESS is not configured");
      }

      if (config.trustedLogics.length === 0) {
        errors.push("No TRUSTED_LOGICS configured");
      }

      if (
        config.trustedLogics.some(
          (addr) => addr === "0x0000000000000000000000000000000000000000",
        )
      ) {
        errors.push("One or more TRUSTED_LOGICS addresses are not configured");
      }

      if (errors.length > 0) {
        throw new Error(`Router configuration errors:\n${errors.join("\n")}`);
      }
    },
    [config],
  );

  return {
    // Configuration
    config,

    // Helper functions
    getDefaultLogic,
    getDeadline,
    calculateMinAmountOut,
    calculateMaxAmountIn,
    isNativeToken,
    validateConfig,
  };
}

export default useMerchantMoeConfig;
