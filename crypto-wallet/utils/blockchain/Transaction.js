// utils/transactions.js
import { ethers } from "ethers";
import {
  createProviderForChain,
  createWalletForChain,
  validateChain,
} from "./Providers";
import { getAlchemyInstance } from "./Alchemy";

// Only Ethereum and Polygon support "internal" category
const INTERNAL_SUPPORTED_CHAINS = new Set([1, 137]);

const getCategoriesForChain = (chainId: number) => {
  const categories = ["external", "erc20", "erc721", "erc1155"];
  if (INTERNAL_SUPPORTED_CHAINS.has(chainId)) {
    categories.push("internal");
  }
  return categories;
};

/**
 * Send native token (ETH, MATIC, etc.)
 */
export const sendNativeToken = async (privateKey, toAddress, amount, chain, options = {}) => {
  try {
    validateChain(chain, "sendNativeToken");
    const wallet = createWalletForChain(chain, privateKey);
    const tx = await wallet.sendTransaction({
      to: toAddress,
      value: ethers.parseEther(amount),
      gasLimit: options.gasLimit,
      gasPrice: options.gasPrice,
      maxFeePerGas: options.maxFeePerGas,
      maxPriorityFeePerGas: options.maxPriorityFeePerGas,
    });
    console.log("[sendNativeToken] Transaction sent:", tx.hash);
    return tx.hash;
  } catch (error) {
    console.error("[sendNativeToken] Error:", error);
    throw error;
  }
};

/**
 * Get transaction details
 */
export const getTransactionDetails = async (txHash, chain) => {
  try {
    validateChain(chain, "getTransactionDetails");
    const provider = createProviderForChain(chain);
    const transaction = await provider.getTransaction(txHash);
    if (!transaction) throw new Error("Transaction not found");
    return {
      hash: transaction.hash,
      from: transaction.from,
      to: transaction.to,
      value: ethers.formatEther(transaction.value),
      gasPrice: transaction.gasPrice?.toString(),
      gasLimit: transaction.gasLimit?.toString(),
      nonce: transaction.nonce,
      blockNumber: transaction.blockNumber?.toString(),
      status: transaction.blockNumber ? "confirmed" : "pending",
      data: transaction.data,
    };
  } catch (error) {
    console.error("[getTransactionDetails] Error:", error);
    throw error;
  }
};

/**
 * Get transaction receipt
 */
export const getTransactionReceipt = async (txHash, chain) => {
  try {
    validateChain(chain, "getTransactionReceipt");
    const provider = createProviderForChain(chain);
    const receipt = await provider.getTransactionReceipt(txHash);
    if (!receipt) return null;
    return {
      transactionHash: receipt.hash,
      blockNumber: receipt.blockNumber.toString(),
      gasUsed: receipt.gasUsed.toString(),
      status: receipt.status === 1 ? "success" : "failed",
      from: receipt.from,
      to: receipt.to,
      contractAddress: receipt.contractAddress,
      logs: receipt.logs,
    };
  } catch (error) {
    console.error("[getTransactionReceipt] Error:", error);
    throw error;
  }
};

/**
 * Wait for transaction confirmation
 */
export const waitForTransactionReceipt = async (txHash, chain, confirmations = 1) => {
  try {
    validateChain(chain, "waitForTransactionReceipt");
    const provider = createProviderForChain(chain);
    const receipt = await provider.waitForTransaction(txHash, confirmations);
    return {
      status: receipt.status === 1 ? "success" : "failed",
      blockNumber: receipt.blockNumber.toString(),
      gasUsed: receipt.gasUsed.toString(),
      transactionHash: receipt.hash,
    };
  } catch (error) {
    console.error("[waitForTransactionReceipt] Error:", error);
    throw error;
  }
};

/**
 * Get transaction history (chain-aware)
 */
export const getTransactionHistory = async (address, chain, options = {}) => {
  try {
    validateChain(chain, "getTransactionHistory");
    const limit = options.limit || 20;
    const alchemy = getAlchemyInstance(chain.id);
    const categories = getCategoriesForChain(chain.id);

    const sentHistory = await alchemy.core.getAssetTransfers({
      fromAddress: address,
      category: categories,
      maxCount: limit,
      order: "desc",
      ...options,
    });

    const receivedHistory = await alchemy.core.getAssetTransfers({
      toAddress: address,
      category: categories,
      maxCount: limit,
      order: "desc",
      ...options,
    });

    const allTxs = [...sentHistory.transfers, ...receivedHistory.transfers]
      .sort((a, b) => (b.blockNum || 0) - (a.blockNum || 0));

    const uniqueTxs = Array.from(new Map(allTxs.map(tx => [tx.hash, tx])).values());

    return uniqueTxs.slice(0, limit).map(tx => ({
      hash: tx.hash,
      from: tx.from,
      to: tx.to,
      value: tx.value?.toString() || "0",
      asset: tx.asset || chain.symbol,
      category: tx.category,
      blockNumber: tx.blockNum?.toString(),
      timestamp: tx.metadata?.blockTimestamp,
      tokenAddress: tx.rawContract?.address,
      direction: tx.from?.toLowerCase() === address.toLowerCase() ? "sent" : "received",
    }));
  } catch (error) {
    console.error("[getTransactionHistory] Error:", error);
    return [];
  }
};

/**
 * Get full transaction history (chain-aware)
 */
export const getFullTransactionHistory = async (address, chain, options = {}) => {
  try {
    validateChain(chain, "getFullTransactionHistory");
    const limit = options.limit || 50;
    const alchemy = getAlchemyInstance(chain.id);
    const categories = getCategoriesForChain(chain.id);

    const [sentHistory, receivedHistory] = await Promise.all([
      alchemy.core.getAssetTransfers({
        fromAddress: address,
        category: categories,
        maxCount: limit,
        order: "desc",
      }),
      alchemy.core.getAssetTransfers({
        toAddress: address,
        category: categories,
        maxCount: limit,
        order: "desc",
      }),
    ]);

    const formatTransfer = (tx, direction) => ({
      hash: tx.hash,
      from: tx.from,
      to: tx.to,
      value: tx.value?.toString() || "0",
      asset: tx.asset || chain.symbol,
      category: tx.category,
      blockNumber: tx.blockNum?.toString(),
      timestamp: tx.metadata?.blockTimestamp,
      tokenAddress: tx.rawContract?.address,
      direction,
    });

    const sent = sentHistory.transfers.map(tx => formatTransfer(tx, "sent"));
    const received = receivedHistory.transfers.map(tx => formatTransfer(tx, "received"));

    const all = [...sent, ...received].sort((a, b) => parseInt(b.blockNumber || "0") - parseInt(a.blockNumber || "0"));

    return { sent, received, all, total: all.length };
  } catch (error) {
    console.error("[getFullTransactionHistory] Error:", error);
    throw error;
  }
};

/**
 * Get pending transactions (chain-aware)
 */
export const getPendingTransactions = async (address, chain) => {
  try {
    validateChain(chain, "getPendingTransactions");
    const alchemy = getAlchemyInstance(chain.id);
    const categories = getCategoriesForChain(chain.id);

    const pendingTxs = await alchemy.core.getAssetTransfers({
      fromAddress: address,
      category: categories,
    });

    return pendingTxs.transfers.filter(tx => !tx.blockNum);
  } catch (error) {
    console.error("[getPendingTransactions] Error:", error);
    return [];
  }
};

/**
 * Cancel or speed up transaction
 */
export const replaceTransaction = async (
  privateKey,
  originalTxHash,
  chain,
  speedUp = true,
) => {
  try {
    validateChain(chain, "replaceTransaction");

    const provider = createProviderForChain(chain);
    const wallet = createWalletForChain(chain, privateKey);

    // Get original transaction
    const originalTx = await provider.getTransaction(originalTxHash);

    if (!originalTx) {
      throw new Error("Original transaction not found");
    }

    if (originalTx.blockNumber) {
      throw new Error("Transaction already confirmed");
    }

    // Calculate new gas price
    const feeData = await provider.getFeeData();
    const newGasPrice = speedUp
      ? (originalTx.gasPrice * 12n) / 10n // 20% higher
      : originalTx.gasPrice;

    // Send replacement transaction with same nonce
    const tx = await wallet.sendTransaction({
      to: speedUp ? originalTx.to : wallet.address, // Cancel sends to self
      value: speedUp ? originalTx.value : 0n,
      nonce: originalTx.nonce,
      gasPrice: newGasPrice,
      gasLimit: originalTx.gasLimit,
    });

    console.log(
      `[replaceTransaction] ${speedUp ? "Speed up" : "Cancel"} transaction sent:`,
      tx.hash,
    );
    return tx.hash;
  } catch (error) {
    console.error("[replaceTransaction] Error:", error);
    throw error;
  }
};

/**
 * Get transaction count (nonce)
 */
export const getTransactionCount = async (address, chain, pending = false) => {
  try {
    validateChain(chain, "getTransactionCount");

    const provider = createProviderForChain(chain);
    const count = await provider.getTransactionCount(
      address,
      pending ? "pending" : "latest",
    );

    return count;
  } catch (error) {
    console.error("[getTransactionCount] Error:", error);
    throw error;
  }
};

/**
 * Build transaction object
 */
export const buildTransaction = async (
  from,
  to,
  value,
  chain,
  options = {},
) => {
  try {
    validateChain(chain, "buildTransaction");

    const provider = createProviderForChain(chain);
    const [nonce, feeData] = await Promise.all([
      provider.getTransactionCount(from, "pending"),
      provider.getFeeData(),
    ]);

    return {
      from,
      to,
      value: ethers.parseEther(value),
      nonce,
      gasLimit: options.gasLimit || "21000",
      gasPrice: options.gasPrice || feeData.gasPrice,
      maxFeePerGas: options.maxFeePerGas || feeData.maxFeePerGas,
      maxPriorityFeePerGas:
        options.maxPriorityFeePerGas || feeData.maxPriorityFeePerGas,
      chainId: chain.id,
      data: options.data || "0x",
    };
  } catch (error) {
    console.error("[buildTransaction] Error:", error);
    throw error;
  }
};

/**
 * Sign transaction
 */
export const signTransaction = async (tx, privateKey, chain) => {
  try {
    validateChain(chain, "signTransaction");

    const wallet = createWalletForChain(chain, privateKey);
    const signedTx = await wallet.signTransaction(tx);

    return signedTx;
  } catch (error) {
    console.error("[signTransaction] Error:", error);
    throw error;
  }
};

/**
 * Send raw transaction
 */
export const sendRawTransaction = async (signedTx, chain) => {
  try {
    validateChain(chain, "sendRawTransaction");

    const provider = createProviderForChain(chain);
    const tx = await provider.broadcastTransaction(signedTx);

    console.log("[sendRawTransaction] Transaction sent:", tx.hash);
    return tx.hash;
  } catch (error) {
    console.error("[sendRawTransaction] Error:", error);
    throw error;
  }
};

/**
 * Decode transaction data
 */
export const decodeTransactionData = (data, abi) => {
  try {
    const iface = new ethers.Interface(abi);
    const decoded = iface.parseTransaction({ data });

    return {
      name: decoded.name,
      args: decoded.args,
      signature: decoded.signature,
    };
  } catch (error) {
    console.error("[decodeTransactionData] Error:", error);
    return null;
  }
};

/**
 * Get transaction status
 */
export const getTransactionStatus = async (txHash, chain) => {
  try {
    validateChain(chain, "getTransactionStatus");

    const provider = createProviderForChain(chain);
    const receipt = await provider.getTransactionReceipt(txHash);

    if (!receipt) {
      return {
        status: "pending",
        confirmed: false,
      };
    }

    return {
      status: receipt.status === 1 ? "success" : "failed",
      confirmed: true,
      blockNumber: receipt.blockNumber,
      confirmations: (await provider.getBlockNumber()) - receipt.blockNumber,
    };
  } catch (error) {
    console.error("[getTransactionStatus] Error:", error);
    throw error;
  }
};
