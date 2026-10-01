// utils/transactions.js
import { ethers } from "ethers";
import {
  createProviderForChain,
  createWalletForChain,
  validateChain,
} from "./Providers";
import { getAlchemyInstance } from "./Alchemy";

// Chains that don't support Alchemy's getAssetTransfers endpoint
const MANUAL_FETCH_CHAINS = new Set([5042, 4663]); // Arc, Robinhood Chain — too new for Alchemy's enhanced APIs

// Only Ethereum and Polygon support "internal" category
const INTERNAL_SUPPORTED_CHAINS = new Set([1, 137]);

const getCategoriesForChain = (chainId) => {
  const categories = ["external", "erc20", "erc721", "erc1155"];
  if (INTERNAL_SUPPORTED_CHAINS.has(chainId)) {
    categories.push("internal");
  }
  return categories;
};

// ─────────────────────────────────────────────────────────────
// MANTLE MANUAL FETCH HELPERS
// ─────────────────────────────────────────────────────────────

/**
 * ERC-20 Transfer topic
 */
const ERC20_TRANSFER_TOPIC = ethers.id("Transfer(address,address,uint256)");

/**
 * Free-tier RPC providers (e.g. Alchemy free plan on Mantle) cap eth_getLogs
 * to a small block range per request. This helper splits a large range into
 * chunks and fires them sequentially (to avoid rate-limit bursts), collecting
 * all results.
 *
 * @param {object}   provider   - ethers provider
 * @param {object}   filter     - base filter (topics, address, etc.) WITHOUT fromBlock/toBlock
 * @param {number}   fromBlock  - start of range (inclusive)
 * @param {number}   toBlock    - end of range (inclusive)
 * @param {number}   chunkSize  - max blocks per request (default 10 for free tier)
 * @returns {Promise<Array>}    - flat array of all logs
 */
const getLogsChunked = async (
  provider,
  filter,
  fromBlock,
  toBlock,
  chunkSize = 10,
) => {
  const allLogs = [];

  for (let start = fromBlock; start <= toBlock; start += chunkSize) {
    const end = Math.min(start + chunkSize - 1, toBlock);
    try {
      const logs = await provider.getLogs({
        ...filter,
        fromBlock: start,
        toBlock: end,
      });
      allLogs.push(...logs);
    } catch (err) {
      // Log the failing chunk but keep going — partial results beat a hard crash
      console.warn(
        `[getLogsChunked] Chunk ${start}-${end} failed:`,
        err.message,
      );
    }
  }

  return allLogs;
};

/**
 * Fetch native + ERC-20 transfers for an address on chains that don't
 * support Alchemy's getAssetTransfers (e.g. Mantle).
 *
 * Uses the chain's public rpcUrl directly (not Alchemy) so there is no
 * block-range cap on eth_getLogs — one request covers the full window.
 *
 * Strategy:
 *  1. Single eth_getLogs call for ERC-20 Transfer events (sent + received).
 *  2. Block-by-block tx scan for native transfers over a tighter window.
 */
const getTransfersManual = async (address, chain, options = {}) => {
  // Use the chain's own public RPC directly — bypasses Alchemy's free-tier
  // block range cap (10 blocks). Mantle public RPC has no such restriction.
  // Prefer publicRpcUrl (no block-range cap) over rpcUrl (may be Alchemy free-tier).
  // Fall back to rpcUrl if publicRpcUrl is not defined.
  const rpcEndpoint = chain.publicRpcUrl || chain.rpcUrl;
  if (!rpcEndpoint) {
    throw new Error(
      `[getTransfersManual] No rpcUrl or publicRpcUrl found for chain ${chain.id}`,
    );
  }
  const provider = new ethers.JsonRpcProvider(rpcEndpoint);

  const limit = options.limit || 50;
  // ~24h on Mantle (~2s/block = ~43,200 blocks/day). Increase for deeper history.
  const blockRange = options.blockRange || 50000;
  // Public RPC has no cap so chunk = full range (1 request). Can be overridden
  // to re-enable chunking if ever switching back to a capped provider.
  const logChunkSize = options.logChunkSize || blockRange;

  const latestBlock = await provider.getBlockNumber();
  const fromBlock = Math.max(0, latestBlock - blockRange);

  const addrLower = address.toLowerCase();
  const addrPadded = ethers.zeroPadValue(address, 32).toLowerCase();

  // ── ERC-20 transfers (chunked getLogs) ────────────────────
  const [sentLogs, receivedLogs] = await Promise.all([
    getLogsChunked(
      provider,
      { topics: [ERC20_TRANSFER_TOPIC, addrPadded, null] },
      fromBlock,
      latestBlock,
      logChunkSize,
    ),
    getLogsChunked(
      provider,
      { topics: [ERC20_TRANSFER_TOPIC, null, addrPadded] },
      fromBlock,
      latestBlock,
      logChunkSize,
    ),
  ]);

  const erc20Transfers = [...sentLogs, ...receivedLogs].map((log) => ({
    hash: log.transactionHash,
    from: "0x" + log.topics[1].slice(26),
    to: "0x" + log.topics[2].slice(26),
    value: ethers.formatUnits(log.data, 18), // assume 18 decimals; fine for history display
    asset: chain.symbol,
    category: "erc20",
    blockNumber: log.blockNumber?.toString(),
    timestamp: null,
    tokenAddress: log.address,
    direction:
      log.topics[1].slice(26).toLowerCase() === addrLower.slice(2)
        ? "sent"
        : "received",
  }));

  // ── Native transfers: block-by-block tx scan ──────────────
  // Cap tightly — each block fetch is a separate RPC call.
  const nativeTransfers = [];
  const nativeBlockRange = Math.min(blockRange, 20);
  const nativeFromBlock = Math.max(0, latestBlock - nativeBlockRange);

  try {
    const blockFetches = [];
    for (let b = nativeFromBlock; b <= latestBlock; b++) {
      blockFetches.push(provider.getBlock(b, true)); // true = include txs
    }
    const blocks = await Promise.all(blockFetches);

    for (const block of blocks) {
      if (!block?.transactions) continue;
      for (const tx of block.transactions) {
        const isNative =
          (tx.from?.toLowerCase() === addrLower ||
            tx.to?.toLowerCase() === addrLower) &&
          tx.value > 0n;

        if (isNative) {
          nativeTransfers.push({
            hash: tx.hash,
            from: tx.from,
            to: tx.to,
            value: ethers.formatEther(tx.value),
            asset: chain.symbol,
            category: "external",
            blockNumber: block.number?.toString(),
            timestamp: block.timestamp
              ? new Date(block.timestamp * 1000).toISOString()
              : null,
            tokenAddress: null,
            direction:
              tx.from?.toLowerCase() === addrLower ? "sent" : "received",
          });
        }
      }
    }
  } catch (err) {
    // Non-fatal: native scan failed, ERC-20 results still returned
    console.warn("[getTransfersManual] Native tx scan failed:", err.message);
  }

  // ── Merge, deduplicate, sort ──────────────────────────────
  const all = [...erc20Transfers, ...nativeTransfers];
  const unique = Array.from(new Map(all.map((tx) => [tx.hash, tx])).values());
  unique.sort(
    (a, b) => parseInt(b.blockNumber || "0") - parseInt(a.blockNumber || "0"),
  );

  return unique.slice(0, limit);
};

// ─────────────────────────────────────────────────────────────
// EXPORTED FUNCTIONS
// ─────────────────────────────────────────────────────────────

/**
 * Send native token (ETH, POL, etc.)
 */
export const sendNativeToken = async (
  privateKey,
  toAddress,
  amount,
  chain,
  options = {},
) => {
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
export const waitForTransactionReceipt = async (
  txHash,
  chain,
  confirmations = 1,
) => {
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
 * Get transaction history (chain-aware).
 * Falls back to manual RPC fetch for chains unsupported by Alchemy (e.g. Mantle).
 */
export const getTransactionHistory = async (address, chain, options = {}) => {
  try {
    validateChain(chain, "getTransactionHistory");
    const limit = options.limit || 20;

    // ── Mantle (and any other manual-fetch chain) ─────────
    if (MANUAL_FETCH_CHAINS.has(chain.id)) {
      const transfers = await getTransfersManual(address, chain, {
        ...options,
        limit,
      });
      return transfers;
    }

    // ── All other chains: use Alchemy ─────────────────────
    const alchemy = getAlchemyInstance(chain.id);
    const categories = getCategoriesForChain(chain.id);

    const [sentHistory, receivedHistory] = await Promise.all([
      alchemy.core.getAssetTransfers({
        fromAddress: address,
        category: categories,
        maxCount: limit,
        order: "desc",
        ...options,
      }),
      alchemy.core.getAssetTransfers({
        toAddress: address,
        category: categories,
        maxCount: limit,
        order: "desc",
        ...options,
      }),
    ]);

    const allTxs = [
      ...sentHistory.transfers,
      ...receivedHistory.transfers,
    ].sort((a, b) => (b.blockNum || 0) - (a.blockNum || 0));

    const uniqueTxs = Array.from(
      new Map(allTxs.map((tx) => [tx.hash, tx])).values(),
    );

    return uniqueTxs.slice(0, limit).map((tx) => ({
      hash: tx.hash,
      from: tx.from,
      to: tx.to,
      value: tx.value?.toString() || "0",
      asset: tx.asset || chain.symbol,
      category: tx.category,
      blockNumber: tx.blockNum?.toString(),
      timestamp: tx.metadata?.blockTimestamp,
      tokenAddress: tx.rawContract?.address,
      direction:
        tx.from?.toLowerCase() === address.toLowerCase() ? "sent" : "received",
    }));
  } catch (error) {
    console.error("[getTransactionHistory] Error:", error);
    return [];
  }
};

/**
 * Get full transaction history (chain-aware).
 * Falls back to manual RPC fetch for chains unsupported by Alchemy (e.g. Mantle).
 */
export const getFullTransactionHistory = async (
  address,
  chain,
  options = {},
) => {
  try {
    validateChain(chain, "getFullTransactionHistory");
    const limit = options.limit || 50;

    // ── Mantle (and any other manual-fetch chain) ─────────
    if (MANUAL_FETCH_CHAINS.has(chain.id)) {
      const all = await getTransfersManual(address, chain, {
        ...options,
        limit,
      });
      const sent = all.filter((tx) => tx.direction === "sent");
      const received = all.filter((tx) => tx.direction === "received");
      return { sent, received, all, total: all.length };
    }

    // ── All other chains: use Alchemy ─────────────────────
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

    const sent = sentHistory.transfers.map((tx) => formatTransfer(tx, "sent"));
    const received = receivedHistory.transfers.map((tx) =>
      formatTransfer(tx, "received"),
    );
    const all = [...sent, ...received].sort(
      (a, b) => parseInt(b.blockNumber || "0") - parseInt(a.blockNumber || "0"),
    );

    return { sent, received, all, total: all.length };
  } catch (error) {
    console.error("[getFullTransactionHistory] Error:", error);
    throw error;
  }
};

/**
 * Get pending transactions (chain-aware).
 * Mantle: returns empty array — pending mempool scanning via RPC is unreliable
 * without a dedicated endpoint. Alchemy is used for supported chains.
 */
export const getPendingTransactions = async (address, chain) => {
  try {
    validateChain(chain, "getPendingTransactions");

    // Mantle doesn't support Alchemy's asset transfer endpoint for pending txs
    if (MANUAL_FETCH_CHAINS.has(chain.id)) {
      console.warn(
        "[getPendingTransactions] Pending tx scanning not supported on Mantle via RPC. Returning empty.",
      );
      return [];
    }

    const alchemy = getAlchemyInstance(chain.id);
    const categories = getCategoriesForChain(chain.id);

    const pendingTxs = await alchemy.core.getAssetTransfers({
      fromAddress: address,
      category: categories,
    });

    return pendingTxs.transfers.filter((tx) => !tx.blockNum);
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

    const originalTx = await provider.getTransaction(originalTxHash);
    if (!originalTx) throw new Error("Original transaction not found");
    if (originalTx.blockNumber)
      throw new Error("Transaction already confirmed");

    const newGasPrice = speedUp
      ? (originalTx.gasPrice * 12n) / 10n // 20% higher
      : originalTx.gasPrice;

    const tx = await wallet.sendTransaction({
      to: speedUp ? originalTx.to : wallet.address,
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
    return await provider.getTransactionCount(
      address,
      pending ? "pending" : "latest",
    );
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
    return await wallet.signTransaction(tx);
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

    if (!receipt) return { status: "pending", confirmed: false };

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
