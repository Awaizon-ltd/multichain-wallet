// Uniswap V2 Router ABI (minimal - only functions we need)
export const UNISWAP_V2_ROUTER_ABI = [
  // Get amounts out for exact input
  {
    inputs: [
      { internalType: "uint256", name: "amountIn", type: "uint256" },
      { internalType: "address[]", name: "path", type: "address[]" },
    ],
    name: "getAmountsOut",
    outputs: [
      { internalType: "uint256[]", name: "amounts", type: "uint256[]" },
    ],
    stateMutability: "view",
    type: "function",
  },
  // Swap exact tokens for tokens
  {
    inputs: [
      { internalType: "uint256", name: "amountIn", type: "uint256" },
      { internalType: "uint256", name: "amountOutMin", type: "uint256" },
      { internalType: "address[]", name: "path", type: "address[]" },
      { internalType: "address", name: "to", type: "address" },
      { internalType: "uint256", name: "deadline", type: "uint256" },
    ],
    name: "swapExactTokensForTokens",
    outputs: [
      { internalType: "uint256[]", name: "amounts", type: "uint256[]" },
    ],
    stateMutability: "nonpayable",
    type: "function",
  },
  // Swap exact ETH for tokens
  {
    inputs: [
      { internalType: "uint256", name: "amountOutMin", type: "uint256" },
      { internalType: "address[]", name: "path", type: "address[]" },
      { internalType: "address", name: "to", type: "address" },
      { internalType: "uint256", name: "deadline", type: "uint256" },
    ],
    name: "swapExactETHForTokens",
    outputs: [
      { internalType: "uint256[]", name: "amounts", type: "uint256[]" },
    ],
    stateMutability: "payable",
    type: "function",
  },
  // Swap exact tokens for ETH
  {
    inputs: [
      { internalType: "uint256", name: "amountIn", type: "uint256" },
      { internalType: "uint256", name: "amountOutMin", type: "uint256" },
      { internalType: "address[]", name: "path", type: "address[]" },
      { internalType: "address", name: "to", type: "address" },
      { internalType: "uint256", name: "deadline", type: "uint256" },
    ],
    name: "swapExactTokensForETH",
    outputs: [
      { internalType: "uint256[]", name: "amounts", type: "uint256[]" },
    ],
    stateMutability: "nonpayable",
    type: "function",
  },
  // WETH address
  {
    inputs: [],
    name: "WETH",
    outputs: [{ internalType: "address", name: "", type: "address" }],
    stateMutability: "view",
    type: "function",
  },
];

// ERC20 Token ABI (minimal)
export const ERC20_ABI = [
  // Approve
  {
    inputs: [
      { internalType: "address", name: "spender", type: "address" },
      { internalType: "uint256", name: "amount", type: "uint256" },
    ],
    name: "approve",
    outputs: [{ internalType: "bool", name: "", type: "bool" }],
    stateMutability: "nonpayable",
    type: "function",
  },
  // Allowance
  {
    inputs: [
      { internalType: "address", name: "owner", type: "address" },
      { internalType: "address", name: "spender", type: "address" },
    ],
    name: "allowance",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  // Balance
  {
    inputs: [{ internalType: "address", name: "account", type: "address" }],
    name: "balanceOf",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  // Decimals
  {
    inputs: [],
    name: "decimals",
    outputs: [{ internalType: "uint8", name: "", type: "uint8" }],
    stateMutability: "view",
    type: "function",
  },
];

// Router addresses by chain
export const SWAP_ROUTERS = {
  // Ethereum Mainnet - Uniswap V2
  1: {
    router: "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D",
    factory: "0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f",
    version: "V2",
    name: "Uniswap V2",
  },
  // Ethereum Sepolia - Uniswap V2
  11155111: {
    router: "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D",
    factory: "0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f",
    version: "V2",
    name: "Uniswap V2",
  },
  // BNB Chain - PancakeSwap V2
  56: {
    router: "0x10ED43C718714eb63d5aA57B78B54704E256024E",
    factory: "0xcA143Ce32Fe78f1f7019d7d551a6402fC5350c73",
    version: "V2",
    name: "PancakeSwap V2",
  },
  // BNB Testnet - PancakeSwap V2
  97: {
    router: "0xD99D1c33F9fC3444f8101754aBC46c52416550D1",
    factory: "0x6725F303b657a9451d8BA641348b6761A6CC7a17",
    version: "V2",
    name: "PancakeSwap V2",
  },
  // Polygon - QuickSwap V2 (more liquidity than Uniswap V3)
  137: {
    router: "0xa5E0829CaCEd8fFDD4De3c43696c57F7D7A678ff",
    factory: "0x5757371414417b8C6CAad45bAeF941aBc7d3Ab32",
    version: "V2",
    name: "QuickSwap",
  },
  // Polygon Mumbai
  80001: {
    router: "0x8954AfA98594b838bda56FE4C12a09D7739D179b",
    factory: "0x5757371414417b8C6CAad45bAeF941aBc7d3Ab32",
    version: "V2",
    name: "QuickSwap",
  },
  // Base - Uniswap V2 (BaseSwap has better liquidity)
  8453: {
    router: "0x327Df1E6de05895d2ab08513aaDD9313Fe505d86",
    factory: "0xFDa619b6d20975be80A10332cD39b9a4b0FAa8BB",
    version: "V2",
    name: "BaseSwap",
  },
  // Base Sepolia - Uniswap V2
  84532: {
    router: "0x4752ba5dbc23f44d87826276bf6fd6b1c372ad24",
    factory: "0x8909Dc15e40173Ff4699343b6eB8132c65e18eC6",
    version: "V2",
    name: "Uniswap V2",
  },
  // Arbitrum - Uniswap V2 (SushiSwap)
  42161: {
    router: "0x1b02dA8Cb0d097eB8D57A175b88c7D8b47997506",
    factory: "0xc35DADB65012eC5796536bD9864eD8773aBc74C4",
    version: "V2",
    name: "SushiSwap",
  },
  // Optimism - Uniswap V2 (Velodrome has better liquidity, but uses V2 interface)
  10: {
    router: "0xa062aE8A9c5e11aaA026fc2670B0D65cCc8B2858",
    factory: "0x25CbdDb98b35ab1FF77413456B31EC81A6B6B746",
    version: "V2",
    name: "Velodrome",
  },
};

// WETH addresses by chain
export const WETH_ADDRESSES = {
  1: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", // Ethereum (WETH)
  11155111: "0x7b79995e5f793A07Bc00c21412e50Ecae098E7f9", // Sepolia (WETH)
  56: "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c", // BSC (WBNB)
  97: "0xae13d989daC2f0dEbFf460aC112a837C89BAa7cd", // BSC Testnet (WBNB)
  137: "0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270", // Polygon (WMATIC)
  80001: "0x9c3C9283D3e44854697Cd22D3Faa240Cfb032889", // Mumbai (WMATIC)
  8453: "0x4200000000000000000000000000000000000006", // Base (WETH)
  84532: "0x4200000000000000000000000000000000000006", // Base Sepolia (WETH)
  42161: "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1", // Arbitrum (WETH)
  10: "0x4200000000000000000000000000000000000006", // Optimism (WETH)
};

// Default slippage tolerance (0.5%)
export const DEFAULT_SLIPPAGE = 0.5;

// Deadline (20 minutes from now)
export const getDeadline = () => Math.floor(Date.now() / 1000) + 60 * 20;

// Check if token is native ETH/BNB/MATIC
export const isNativeToken = (address) => {
  if (!address) return false;
  const addr = address.toLowerCase();
  return (
    addr === "0x0000000000000000000000000000000000000000" ||
    addr === "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"
  );
};

// Get router config for chain
export const getRouterConfig = (chainId) => {
  const config = SWAP_ROUTERS[chainId];
  if (!config) {
    console.warn(`⚠️ No swap router configured for chain ID: ${chainId}`);
  }
  return config || null;
};

// Get WETH address for chain
export const getWETHAddress = (chainId) => {
  const weth = WETH_ADDRESSES[chainId];
  if (!weth) {
    console.warn(`⚠️ No WETH address configured for chain ID: ${chainId}`);
  }
  return weth || null;
};
