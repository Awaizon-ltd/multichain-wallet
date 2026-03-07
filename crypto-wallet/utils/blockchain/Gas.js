// utils/gas.js
import { ethers } from "ethers";
import { createProviderForChain, validateChain } from "./Providers";
import { ERC20_ABI } from "../../constants/abi";

/**
 * Get current gas prices
 */
export const getGasPrices = async (chain) => {
  try {
    validateChain(chain, "getGasPrices");

    const provider = createProviderForChain(chain);
    const feeData = await provider.getFeeData();
    const gasPrice = feeData.gasPrice;

    const basePrice = gasPrice;

    return {
      slow: {
        gasPrice: basePrice,
        gwei: ethers.formatUnits(basePrice, "gwei"),
      },
      standard: {
        gasPrice: (basePrice * 12n) / 10n, // 1.2x base
        gwei: ethers.formatUnits((basePrice * 12n) / 10n, "gwei"),
      },
      fast: {
        gasPrice: (basePrice * 15n) / 10n, // 1.5x base
        gwei: ethers.formatUnits((basePrice * 15n) / 10n, "gwei"),
      },
    };
  } catch (error) {
    console.error("[getGasPrices] Error:", error);
    throw error;
  }
};

/**
 * Get detailed fee data (EIP-1559)
 */
export const getFeeData = async (chain) => {
  try {
    validateChain(chain, "getFeeData");

    const provider = createProviderForChain(chain);
    const feeData = await provider.getFeeData();

    return {
      gasPrice: feeData.gasPrice?.toString(),
      maxFeePerGas: feeData.maxFeePerGas?.toString(),
      maxPriorityFeePerGas: feeData.maxPriorityFeePerGas?.toString(),
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
  } catch (error) {
    console.error("[getFeeData] Error:", error);
    throw error;
  }
};

/**
 * Estimate gas for native token transfer
 */
export const estimateNativeTransferGas = async (
  fromAddress,
  toAddress,
  amount,
  chain,
) => {
  try {
    validateChain(chain, "estimateNativeTransferGas");

    const provider = createProviderForChain(chain);

    const gasEstimate = await provider.estimateGas({
      from: fromAddress,
      to: toAddress,
      value: ethers.parseEther(amount),
    });

    const feeData = await provider.getFeeData();
    const gasPrice = feeData.gasPrice;

    return {
      gasLimit: gasEstimate.toString(),
      gasPrice: gasPrice.toString(),
      gasPriceGwei: ethers.formatUnits(gasPrice, "gwei"),
      totalCost: ethers.formatEther(gasEstimate * gasPrice),
      totalCostWei: (gasEstimate * gasPrice).toString(),
    };
  } catch (error) {
    console.error("[estimateNativeTransferGas] Error:", error);
    throw error;
  }
};

/**
 * Estimate gas for token transfer
 */
export const estimateTokenTransferGas = async (
  fromAddress,
  tokenAddress,
  toAddress,
  amount,
  decimals,
  chain,
) => {
  try {
    validateChain(chain, "estimateTokenTransferGas");

    const provider = createProviderForChain(chain);
    const contract = new ethers.Contract(tokenAddress, ERC20_ABI, provider);

    const gasEstimate = await contract.transfer.estimateGas(
      toAddress,
      ethers.parseUnits(amount, decimals),
      { from: fromAddress },
    );

    const feeData = await provider.getFeeData();
    const gasPrice = feeData.gasPrice;

    return {
      gasLimit: gasEstimate.toString(),
      gasPrice: gasPrice.toString(),
      gasPriceGwei: ethers.formatUnits(gasPrice, "gwei"),
      totalCost: ethers.formatEther(gasEstimate * gasPrice),
      totalCostWei: (gasEstimate * gasPrice).toString(),
    };
  } catch (error) {
    console.error("[estimateTokenTransferGas] Error:", error);
    throw error;
  }
};

/**
 * Estimate gas for NFT transfer (ERC-721 or ERC-1155)
 */
export const estimateNFTTransferGas = async (
  fromAddress,
  contractAddress,
  toAddress,
  tokenId,
  tokenType = "ERC721",
  chain,
) => {
  try {
    validateChain(chain, "estimateNFTTransferGas");

    const provider = createProviderForChain(chain);

    const ERC721_TRANSFER_ABI = [
      "function transferFrom(address from, address to, uint256 tokenId)",
    ];

    const ERC1155_TRANSFER_ABI = [
      "function safeTransferFrom(address from, address to, uint256 id, uint256 amount, bytes data)",
    ];

    const abi =
      tokenType === "ERC1155" ? ERC1155_TRANSFER_ABI : ERC721_TRANSFER_ABI;
    const contract = new ethers.Contract(contractAddress, abi, provider);

    let gasEstimate;
    if (tokenType === "ERC1155") {
      gasEstimate = await contract.safeTransferFrom.estimateGas(
        fromAddress,
        toAddress,
        tokenId,
        1,
        "0x",
        { from: fromAddress },
      );
    } else {
      gasEstimate = await contract.transferFrom.estimateGas(
        fromAddress,
        toAddress,
        tokenId,
        { from: fromAddress },
      );
    }

    const feeData = await provider.getFeeData();
    const gasPrice = feeData.gasPrice;

    return {
      gasLimit: gasEstimate.toString(),
      gasPrice: gasPrice.toString(),
      gasPriceGwei: ethers.formatUnits(gasPrice, "gwei"),
      totalCost: ethers.formatEther(gasEstimate * gasPrice),
      totalCostWei: (gasEstimate * gasPrice).toString(),
    };
  } catch (error) {
    console.error("[estimateNFTTransferGas] Error:", error);
    throw error;
  }
};

/**
 * Estimate gas for contract interaction
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
  try {
    validateChain(chain, "estimateContractGas");

    const provider = createProviderForChain(chain);
    const contract = new ethers.Contract(contractAddress, abi, provider);

    const gasEstimate = await contract[method].estimateGas(...params, {
      from: fromAddress,
      value: ethers.parseEther(value),
    });

    const feeData = await provider.getFeeData();
    const gasPrice = feeData.gasPrice;

    return {
      gasLimit: gasEstimate.toString(),
      gasPrice: gasPrice.toString(),
      gasPriceGwei: ethers.formatUnits(gasPrice, "gwei"),
      totalCost: ethers.formatEther(gasEstimate * gasPrice),
      totalCostWei: (gasEstimate * gasPrice).toString(),
    };
  } catch (error) {
    console.error("[estimateContractGas] Error:", error);
    throw error;
  }
};

/**
 * Calculate transaction cost in USD
 */
export const calculateTransactionCostUSD = async (
  gasLimit,
  gasPrice,
  nativeTokenPriceUSD,
) => {
  try {
    const gasCostWei = BigInt(gasLimit) * BigInt(gasPrice);
    const gasCostEth = parseFloat(ethers.formatEther(gasCostWei));
    const costUSD = gasCostEth * nativeTokenPriceUSD;

    return {
      gasCostEth,
      costUSD: costUSD.toFixed(2),
    };
  } catch (error) {
    console.error("[calculateTransactionCostUSD] Error:", error);
    throw error;
  }
};

/**
 * Get recommended gas prices with labels
 */
export const getRecommendedGasPrices = async (chain) => {
  try {
    const gasPrices = await getGasPrices(chain);

    return {
      slow: {
        ...gasPrices.slow,
        label: "Slow",
        estimatedTime: "~5-10 min",
      },
      standard: {
        ...gasPrices.standard,
        label: "Standard",
        estimatedTime: "~2-3 min",
      },
      fast: {
        ...gasPrices.fast,
        label: "Fast",
        estimatedTime: "~30 sec",
      },
    };
  } catch (error) {
    console.error("[getRecommendedGasPrices] Error:", error);
    throw error;
  }
};

/**
 * Format gas price for display
 */
export const formatGasPrice = (gasPrice, unit = "gwei") => {
  try {
    const formatted = ethers.formatUnits(gasPrice, unit);
    return `${parseFloat(formatted).toFixed(2)} ${unit}`;
  } catch (error) {
    console.error("[formatGasPrice] Error:", error);
    return "0 gwei";
  }
};

/**
 * Parse gas price from gwei
 */
export const parseGasPrice = (gwei) => {
  try {
    return ethers.parseUnits(gwei.toString(), "gwei");
  } catch (error) {
    console.error("[parseGasPrice] Error:", error);
    throw error;
  }
};

/**
 * Get gas limit for transaction type
 */
export const getDefaultGasLimit = (transactionType) => {
  const defaults = {
    nativeTransfer: "21000",
    erc20Transfer: "65000",
    erc721Transfer: "85000",
    erc1155Transfer: "100000",
    contractInteraction: "150000",
  };

  return defaults[transactionType] || "150000";
};
