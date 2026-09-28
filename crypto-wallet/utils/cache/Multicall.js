/**
 * Multicall.js — batch ERC-20 balanceOf via Multicall3
 *
 * Why this matters for Alchemy:
 *   Individual eth_call (balanceOf)  → 26 CU each
 *   Multicall3 aggregate3 (N calls)  → 26 CU total for ALL N
 *
 * So 10 tokens on one chain costs 260 CU individually vs 26 CU batched.
 * For a wallet with 3 chains × 10 tokens = ~780 CU saved per portfolio load.
 *
 * Multicall3 is deployed at the same address on all major EVM chains.
 * Chains NOT in MULTICALL3_CHAINS fall back to individual parallel eth_calls.
 *
 * Ref: https://github.com/mds1/multicall
 */

import { ethers } from "ethers";
import { createProviderForChain } from "../blockchain/Providers";

// ─── Constants ────────────────────────────────────────────────────────────────

const MULTICALL3_ADDRESS = "0xcA11bde05977b3631167028862bE2a173976CA11";

// Chains confirmed to have Multicall3 deployed
const MULTICALL3_CHAINS = new Set([
  1,        // Ethereum
  5,        // Goerli
  10,       // Optimism
  56,       // BNB Chain
  100,      // Gnosis
  137,      // Polygon
  250,      // Fantom
  420,      // Optimism Goerli
  8453,     // Base
  42161,    // Arbitrum One
  42220,    // Celo
  43114,    // Avalanche
  44787,    // Celo Alfajores
  59144,    // Linea
  80001,    // Polygon Mumbai
  84532,    // Base Sepolia
  11155111, // Sepolia
  5042,     // Arc
  4663,     // Robinhood Chain
  534352,   // Scroll
  81457,    // Blast
  324,      // zkSync Era
]);

const MULTICALL3_ABI = [
  "function aggregate3(tuple(address target, bool allowFailure, bytes callData)[] calls) view returns (tuple(bool success, bytes returnData)[])",
];

const BALANCE_OF_SELECTOR = "0x70a08231"; // keccak256("balanceOf(address)")[0:4]

const ERC20_BALANCE_ABI = ["function balanceOf(address) view returns (uint256)"];

// ─── Encoding helpers ─────────────────────────────────────────────────────────

const encodeBalanceOf = (walletAddress) =>
  BALANCE_OF_SELECTOR +
  walletAddress.toLowerCase().replace("0x", "").padStart(64, "0");

const decodeUint256 = (returnData) => {
  try {
    if (!returnData || returnData === "0x" || returnData.length < 66) return 0n;
    return BigInt(returnData); // ABI-encoded uint256 is a 32-byte BE integer
  } catch {
    return 0n;
  }
};

// ─── Batch balance fetchers ───────────────────────────────────────────────────

/**
 * Fetch ERC-20 balances for N token addresses in a SINGLE eth_call.
 * Returns Map<lowercasedTokenAddress → BigInt balance>.
 *
 * Falls back to individual eth_calls if:
 *   • chain doesn't support Multicall3
 *   • Multicall3 call itself fails (e.g. node limit)
 */
export const batchGetTokenBalances = async (
  walletAddress,
  tokenAddresses,
  chain,
) => {
  if (!tokenAddresses.length) return new Map();

  if (!MULTICALL3_CHAINS.has(chain.id)) {
    return _fallbackTokenBalances(walletAddress, tokenAddresses, chain);
  }

  try {
    const provider = createProviderForChain(chain);
    const multicall = new ethers.Contract(
      MULTICALL3_ADDRESS,
      MULTICALL3_ABI,
      provider,
    );

    const calls = tokenAddresses.map((addr) => ({
      target: addr,
      allowFailure: true, // don't revert the whole batch for one bad token
      callData: encodeBalanceOf(walletAddress),
    }));

    const results = await multicall.aggregate3(calls);

    return results.reduce((map, result, i) => {
      map.set(
        tokenAddresses[i].toLowerCase(),
        result.success ? decodeUint256(result.returnData) : 0n,
      );
      return map;
    }, new Map());
  } catch {
    // Multicall failed — degrade to parallel individual calls
    return _fallbackTokenBalances(walletAddress, tokenAddresses, chain);
  }
};

const _fallbackTokenBalances = async (walletAddress, tokenAddresses, chain) => {
  const provider = createProviderForChain(chain);
  const map = new Map();

  await Promise.allSettled(
    tokenAddresses.map(async (addr) => {
      try {
        const contract = new ethers.Contract(addr, ERC20_BALANCE_ABI, provider);
        const balance = await contract.balanceOf(walletAddress);
        map.set(addr.toLowerCase(), balance);
      } catch { /* skip bad tokens silently */ }
    }),
  );

  return map;
};

/**
 * Fetch native coin balances (eth_getBalance) for multiple chains in parallel.
 * Returns Map<chainId → BigInt balance>.
 *
 * Note: eth_getBalance cannot be batched via Multicall3, but they are already
 * parallelised and cached by the DataCache layer above this.
 */
export const batchGetNativeBalances = async (address, chains) => {
  const results = await Promise.allSettled(
    chains.map(async (chain) => {
      const provider = createProviderForChain(chain);
      const balance = await provider.getBalance(address);
      return { chainId: chain.id, balance };
    }),
  );

  return results.reduce((map, result, i) => {
    const chainId = chains[i].id;
    map.set(
      chainId,
      result.status === "fulfilled" ? result.value.balance : 0n,
    );
    return map;
  }, new Map());
};

/** True if this chain has Multicall3 deployed */
export const supportsMulticall3 = (chainId) => MULTICALL3_CHAINS.has(chainId);
