// utils/gas.js
import { ethers } from "ethers";
import { createProviderForChain, validateChain } from "./Providers";
import { ERC20_ABI } from "../../constants/abi";
import { withCache, Key, TTL } from "../cache/DataCache";

// ─── Constants ────────────────────────────────────────────────────────────────

// Safety multiplier on all gas estimates — prevents out-of-gas on complex txs
const GAS_BUFFER = 1.15; // +15%

// Legacy (non-EIP-1559) gas price tiers as multipliers of base
const TIER_SLOW = 10n; // 1.0x
const TIER_STANDARD = 12n; // 1.2x
const TIER_FAST = 15n; // 1.5x

// ABIs defined once at module level — not inside functions
const ERC721_ABI = [
  "function transferFrom(address from, address to, uint256 tokenId)",
];

const ERC1155_ABI = [
  "function safeTransferFrom(address from, address to, uint256 id, uint256 amount, bytes data)",
];

// Approximate block times per chain ID (seconds) — used for time estimates
const BLOCK_TIME_SECONDS = {
  1: 12, // Ethereum
  137: 2, // Polygon
  56: 3, // BSC
  42161: 0.3, // Arbitrum
  43114: 2, // Avalanche
  8453: 2, // Base
  5042: 1, // Arc (sub-second finality; 1s used as a conservative estimate)
  4663: 0.3, // Robinhood Chain (Arbitrum Orbit L2)
  10: 2, // Optimism
  11155111: 12, // Sepolia
  84532: 2, // Base Sepolia
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Apply GAS_BUFFER to a BigInt gas estimate */
const withBuffer = (gasEstimate) =>
  BigInt(Math.ceil(Number(gasEstimate) * GAS_BUFFER));

/**
 * Build a gas result object from a gas estimate + fee data.
 * Handles both EIP-1559 and legacy chains.
 */
const buildGasResult = (rawEstimate, feeData) => {
  const gasLimit = withBuffer(rawEstimate);
  const isEIP1559 = feeData.maxFeePerGas != null;
  const gasPrice = isEIP1559 ? feeData.maxFeePerGas : feeData.gasPrice;

  return {
    gasLimit: gasLimit.toString(),
    gasPrice: gasPrice.toString(),
    gasPriceGwei: ethers.formatUnits(gasPrice, "gwei"),
    isEIP1559,
    ...(isEIP1559 && {
      maxFeePerGas: feeData.maxFeePerGas.toString(),
      maxPriorityFeePerGas: feeData.maxPriorityFeePerGas.toString(),
    }),
    totalCost: ethers.formatEther(gasLimit * gasPrice),
    totalCostWei: (gasLimit * gasPrice).toString(),
  };
};

/**
 * Batch-fetch estimateGas + getFeeData in a single Promise.all.
 * Saves one RPC round-trip per estimate call.
 */
const batchEstimate = async (provider, txRequest) => {
  const [rawEstimate, feeData] = await Promise.all([
    provider.estimateGas(txRequest),
    provider.getFeeData(),
  ]);
  return buildGasResult(rawEstimate, feeData);
};

/**
 * Estimated confirmation time label based on real chain block times.
 * Falls back to generic labels for unknown chains.
 */
const getTimingLabels = (chainId) => {
  const blockSec = BLOCK_TIME_SECONDS[chainId] ?? 12;
  return {
    slow: `~${Math.round(blockSec * 10)} sec`,
    standard: `~${Math.round(blockSec * 4)} sec`,
    fast: `~${Math.round(blockSec * 1.5)} sec`,
  };
};

// ─── Fee data ─────────────────────────────────────────────────────────────────

/**
 * Raw fee data from the RPC node. Cached 15s.
 */
export const getFeeData = async (chain) => {
  validateChain(chain, "getFeeData");
  return withCache(Key.feeData(chain.id), TTL.GAS_PRICE, async () => {
    const feeData = await createProviderForChain(chain).getFeeData();
    return {
      gasPrice: feeData.gasPrice?.toString() ?? null,
      maxFeePerGas: feeData.maxFeePerGas?.toString() ?? null,
      maxPriorityFeePerGas: feeData.maxPriorityFeePerGas?.toString() ?? null,
      isEIP1559: feeData.maxFeePerGas != null,
      formatted: {
        gasPrice: feeData.gasPrice
          ? ethers.formatUnits(feeData.gasPrice, "gwei")
          : null,
        maxFeePerGas: feeData.maxFeePerGas
          ? ethers.formatUnits(feeData.maxFeePerGas, "gwei")
          : null,
        maxPriorityFeePerGas: feeData.maxPriorityFeePerGas
          ? ethers.formatUnits(feeData.maxPriorityFeePerGas, "gwei")
          : null,
      },
    };
  });
};

// ─── Gas price tiers ──────────────────────────────────────────────────────────

/**
 * Three-tier gas prices (slow / standard / fast). Cached 15s.
 * getRecommendedGasPrices() calls this and benefits automatically.
 */
export const getGasPrices = async (chain) => {
  validateChain(chain, "getGasPrices");
  return withCache(Key.gasPrice(chain.id), TTL.GAS_PRICE, async () => {
  const feeData = await createProviderForChain(chain).getFeeData();
  const isEIP1559 = feeData.maxFeePerGas != null;

  if (isEIP1559) {
    const base = feeData.maxFeePerGas;
    const priority = feeData.maxPriorityFeePerGas ?? 0n;

    const tier = (mul) => {
      const max = (base * mul) / 10n;
      return {
        maxFeePerGas: max.toString(),
        maxPriorityFeePerGas: priority.toString(),
        gwei: ethers.formatUnits(max, "gwei"),
        isEIP1559: true,
      };
    };

    return {
      slow: tier(TIER_SLOW),
      standard: tier(TIER_STANDARD),
      fast: tier(TIER_FAST),
    };
  }

  // Legacy
  const base = feeData.gasPrice;
  const tier = (mul) => {
    const price = (base * mul) / 10n;
    return {
      gasPrice: price.toString(),
      gwei: ethers.formatUnits(price, "gwei"),
      isEIP1559: false,
    };
  };

  return {
    slow: tier(TIER_SLOW),
    standard: tier(TIER_STANDARD),
    fast: tier(TIER_FAST),
  };
  }); // end withCache
};

/**
 * Gas price tiers with chain-aware time estimates and display labels.
 */
export const getRecommendedGasPrices = async (chain) => {
  validateChain(chain, "getRecommendedGasPrices");

  const [tiers, timing] = await Promise.all([
    getGasPrices(chain),
    Promise.resolve(getTimingLabels(chain.id)),
  ]);

  return {
    slow: { ...tiers.slow, label: "Slow", estimatedTime: timing.slow },
    standard: {
      ...tiers.standard,
      label: "Standard",
      estimatedTime: timing.standard,
    },
    fast: { ...tiers.fast, label: "Fast", estimatedTime: timing.fast },
  };
};

// ─── Gas estimates ────────────────────────────────────────────────────────────

/**
 * Estimate gas for a native token transfer.
 * estimateGas + getFeeData fetched in one round-trip.
 */
export const estimateNativeTransferGas = async (
  fromAddress,
  toAddress,
  amount,
  chain,
) => {
  validateChain(chain, "estimateNativeTransferGas");

  return batchEstimate(createProviderForChain(chain), {
    from: fromAddress,
    to: toAddress,
    value: ethers.parseEther(amount),
  });
};

/**
 * Estimate gas for an ERC-20 token transfer.
 */
export const estimateTokenTransferGas = async (
  fromAddress,
  tokenAddress,
  toAddress,
  amount,
  decimals,
  chain,
) => {
  validateChain(chain, "estimateTokenTransferGas");

  const provider = createProviderForChain(chain);
  const contract = new ethers.Contract(tokenAddress, ERC20_ABI, provider);

  const [rawEstimate, feeData] = await Promise.all([
    contract.transfer.estimateGas(
      toAddress,
      ethers.parseUnits(amount, decimals),
      { from: fromAddress },
    ),
    provider.getFeeData(),
  ]);

  return buildGasResult(rawEstimate, feeData);
};

/**
 * Estimate gas for an NFT transfer (ERC-721 or ERC-1155).
 */
export const estimateNFTTransferGas = async (
  fromAddress,
  contractAddress,
  toAddress,
  tokenId,
  tokenType = "ERC721",
  chain,
) => {
  validateChain(chain, "estimateNFTTransferGas");

  const provider = createProviderForChain(chain);
  const abi = tokenType === "ERC1155" ? ERC1155_ABI : ERC721_ABI;
  const contract = new ethers.Contract(contractAddress, abi, provider);

  const estimateCall =
    tokenType === "ERC1155"
      ? contract.safeTransferFrom.estimateGas(
          fromAddress,
          toAddress,
          tokenId,
          1,
          "0x",
          { from: fromAddress },
        )
      : contract.transferFrom.estimateGas(fromAddress, toAddress, tokenId, {
          from: fromAddress,
        });

  const [rawEstimate, feeData] = await Promise.all([
    estimateCall,
    provider.getFeeData(),
  ]);

  return buildGasResult(rawEstimate, feeData);
};

/**
 * Estimate gas for an arbitrary contract method call.
 */
export const estimateContractGas = async (
  contractAddress,
  abi,
  method,
  params,
  fromAddress,
  chain,
  value = "0",
) => {
  validateChain(chain, "estimateContractGas");

  const provider = createProviderForChain(chain);
  const contract = new ethers.Contract(contractAddress, abi, provider);

  const [rawEstimate, feeData] = await Promise.all([
    contract[method].estimateGas(...params, {
      from: fromAddress,
      value: ethers.parseEther(value),
    }),
    provider.getFeeData(),
  ]);

  return buildGasResult(rawEstimate, feeData);
};

// ─── USD cost calculation ─────────────────────────────────────────────────────

/**
 * Pure function — no async needed, no RPC calls.
 * @param {string|bigint} gasLimit
 * @param {string|bigint} gasPrice  - in wei
 * @param {number}        nativeTokenPriceUSD
 */
export const calculateTransactionCostUSD = (
  gasLimit,
  gasPrice,
  nativeTokenPriceUSD,
) => {
  const gasCostWei = BigInt(gasLimit) * BigInt(gasPrice);
  const gasCostEth = parseFloat(ethers.formatEther(gasCostWei));
  const costUSD = gasCostEth * nativeTokenPriceUSD;

  return {
    gasCostEth,
    costUSD: costUSD.toFixed(4),
    costUSDRaw: costUSD,
  };
};

// ─── Formatting / parsing ─────────────────────────────────────────────────────

/** Format a wei gas price for display: "12.34 gwei" */
export const formatGasPrice = (gasPrice, unit = "gwei") => {
  try {
    return `${parseFloat(ethers.formatUnits(gasPrice, unit)).toFixed(2)} ${unit}`;
  } catch {
    return `0 ${unit}`;
  }
};

/** Parse a human-readable gwei string to wei BigInt */
export const parseGasPrice = (gwei) =>
  ethers.parseUnits(gwei.toString(), "gwei");

/** Sensible default gas limits by transaction type */
export const getDefaultGasLimit = (transactionType) => {
  const defaults = {
    nativeTransfer: "21000",
    erc20Transfer: "65000",
    erc721Transfer: "85000",
    erc1155Transfer: "100000",
    contractInteraction: "150000",
  };
  return defaults[transactionType] ?? "150000";
};
