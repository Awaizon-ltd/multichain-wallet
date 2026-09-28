// utils/balances.js
import { ethers } from "ethers";
import { createProviderForChain, validateChain } from "./Providers";
import { withCache, Key, TTL } from "../cache/DataCache";
import { batchGetTokenBalances } from "../cache/Multicall";

// ─── Constants ────────────────────────────────────────────────────────────────

// ERC-20 Transfer(address indexed from, address indexed to, uint256 value)
const TRANSFER_TOPIC =
  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

// Minimal ABI — defined once, reused everywhere
const ERC20_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function symbol()   view returns (string)",
  "function name()     view returns (string)",
  "function decimals() view returns (uint8)",
];

// How many blocks back to scan for incoming Transfer logs when discovering tokens.
// ~7 days on Ethereum (12 s/block). Adjust per chain if needed.
const LOG_SCAN_BLOCKS = 50_000;

// Hard cap on how many token contracts to resolve per discovery call.
// Prevents runaway RPC usage on addresses with hundreds of dust tokens.
const MAX_TOKENS_TO_RESOLVE = 20;

// Known tokens for chains that don't emit standard ERC-20 Transfer logs
// or where we want guaranteed coverage regardless of history.
// Add Arc (5042) / Robinhood Chain (4663) entries here once verified.
const KNOWN_TOKENS = {};

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Fetch ERC-20 metadata + balance for a list of contract addresses.
 *
 * Uses Multicall3 to batch ALL balanceOf calls into a SINGLE eth_call,
 * then fetches metadata only for tokens with a non-zero balance.
 *
 * Old: N eth_calls (one balanceOf per token)
 * New: 1 eth_call (all balanceOf via Multicall3) + M metadata calls (M ≤ N)
 */
const resolveTokenBalances = async (
  provider,
  walletAddress,
  contractAddresses,
  chain,
) => {
  if (!contractAddresses.length) return [];

  // Single Multicall3 eth_call → Map<addr → BigInt balance>
  const balanceMap = await batchGetTokenBalances(walletAddress, contractAddresses, chain);

  // Only fetch metadata for non-zero balances
  const nonZero = contractAddresses.filter((addr) => {
    const bal = balanceMap.get(addr.toLowerCase());
    return bal !== undefined && bal > 0n;
  });

  if (!nonZero.length) return [];

  const results = await Promise.all(
    nonZero.map(async (addr) => {
      try {
        const contract = new ethers.Contract(addr, ERC20_ABI, provider);
        const balance = balanceMap.get(addr.toLowerCase());

        const [symbol, name, decimals] = await Promise.all([
          contract.symbol().catch(() => "???"),
          contract.name().catch(() => "Unknown Token"),
          contract.decimals().catch(() => 18n),
        ]);

        const dec = Number(decimals);
        return {
          address: addr,
          balance: balance.toString(),
          formatted: ethers.formatUnits(balance, dec),
          name,
          symbol,
          decimals: dec,
          logo: null,
        };
      } catch {
        return null;
      }
    }),
  );

  return results.filter(Boolean);
};

/**
 * Discover ERC-20 tokens by scanning Transfer logs where `to` = walletAddress.
 * This is the standard no-API approach used by MetaMask, Rainbow, etc.
 *
 * eth_getLogs is a single RPC call. We deduplicate contract addresses, cap at
 * MAX_TOKENS_TO_RESOLVE, then resolve balances + metadata in parallel.
 */
const discoverTokensViaLogs = async (provider, walletAddress, chain) => {
  let toBlock;
  try {
    toBlock = await provider.getBlockNumber();
  } catch {
    return [];
  }

  const fromBlock = Math.max(0, toBlock - LOG_SCAN_BLOCKS);
  const paddedAddress = ethers.zeroPadValue(walletAddress, 32);

  let logs;
  try {
    logs = await provider.getLogs({
      fromBlock,
      toBlock,
      topics: [TRANSFER_TOPIC, null, paddedAddress], // Transfer(_,TO,_)
    });
  } catch {
    // Node may not support eth_getLogs with a wide range — fall back to known tokens
    __DEV__ &&
      console.warn(
        `[discoverTokensViaLogs] getLogs failed for ${chain.name}, using known tokens only`,
      );
    return [];
  }

  // Deduplicate contract addresses, ignore the native sentinel
  const NATIVE_SENTINEL = "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";
  const uniqueContracts = [
    ...new Set(
      logs
        .map((l) => l.address.toLowerCase())
        .filter((a) => a !== NATIVE_SENTINEL),
    ),
  ].slice(0, MAX_TOKENS_TO_RESOLVE);

  return resolveTokenBalances(provider, walletAddress, uniqueContracts, chain);
};

/**
 * Merge log-discovered tokens with any KNOWN_TOKENS for the chain,
 * deduplicating by lowercase address.
 */
const getTokensWithKnownFallback = async (provider, walletAddress, chain) => {
  const knownAddresses = (KNOWN_TOKENS[chain.id] ?? []).map((t) => t.address);

  // Run log discovery and known-token resolution in parallel
  const [discovered, knownResolved] = await Promise.all([
    discoverTokensViaLogs(provider, walletAddress, chain),
    resolveTokenBalances(provider, walletAddress, knownAddresses, chain),
  ]);

  // Merge: discovered takes precedence, known fills in gaps
  const seen = new Set(discovered.map((t) => t.address.toLowerCase()));
  const merged = [...discovered];

  for (const token of knownResolved) {
    if (!seen.has(token.address.toLowerCase())) {
      merged.push(token);
    }
  }

  return merged;
};

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Native token balance for one chain.
 * Cached 30s — force-invalidated after sends via invalidateBalance().
 */
export const getNativeBalance = async (address, chain) => {
  validateChain(chain, "getNativeBalance");
  return withCache(
    Key.nativeBalance(address, chain.id),
    TTL.NATIVE_BALANCE,
    async () => {
      const balance = await createProviderForChain(chain).getBalance(address);
      return {
        wei: balance.toString(),
        formatted: ethers.formatEther(balance),
        symbol: chain.symbol,
        decimals: 18,
      };
    },
  );
};

/**
 * Native balances across multiple chains in parallel.
 * Returns an object keyed by chainId. Failed chains return { formatted: "0", error }.
 */
export const getNativeBalancesMultiChain = async (address, chains) => {
  const results = await Promise.all(
    chains.map(async (chain) => {
      try {
        const balance = await getNativeBalance(address, chain);
        return { chainId: chain.id, chainName: chain.name, ...balance };
      } catch (error) {
        return {
          chainId: chain.id,
          chainName: chain.name,
          wei: "0",
          formatted: "0",
          symbol: chain.symbol,
          decimals: 18,
          error: error.message,
        };
      }
    }),
  );

  return results.reduce((acc, b) => {
    acc[b.chainId] = b;
    return acc;
  }, {});
};

/**
 * ERC-20 balance for a single known token address.
 * Cached 30s. For bulk discovery, use getAllTokenBalances (Multicall3 path).
 */
export const getTokenBalance = async (tokenAddress, walletAddress, chain) => {
  validateChain(chain, "getTokenBalance");
  return withCache(
    Key.tokenBalance(tokenAddress, walletAddress, chain.id),
    TTL.TOKEN_BALANCE,
    async () => {
      const provider = createProviderForChain(chain);
      const contract = new ethers.Contract(tokenAddress, ERC20_ABI, provider);

      const [balance, decimals, symbol] = await Promise.all([
        contract.balanceOf(walletAddress),
        contract.decimals(),
        contract.symbol(),
      ]);

      const dec = Number(decimals);
      return {
        wei: balance.toString(),
        formatted: ethers.formatUnits(balance, dec),
        symbol,
        decimals: dec,
        address: tokenAddress,
      };
    },
  );
};

/**
 * Discover and return all ERC-20 tokens held by `address` on `chain`.
 * Cached 5min with stale-while-revalidate so the UI is never blocked.
 *
 * Strategy:
 *   1. eth_getLogs scan for incoming Transfer events (standard, no API key)
 *   2. KNOWN_TOKENS fallback for chains with limited log history or known assets
 *   3. Merge + batch Multicall3 balanceOf → single eth_call for all balances
 *   4. Return only tokens with a non-zero balance
 */
export const getAllTokenBalances = async (address, chain, { onRefresh } = {}) => {
  validateChain(chain, "getAllTokenBalances");
  return withCache(
    Key.tokenBalances(address, chain.id),
    TTL.TOKEN_LIST,
    () => {
      const provider = createProviderForChain(chain);
      return getTokensWithKnownFallback(provider, address, chain);
    },
    { persist: true, onRefresh },
  );
};

/**
 * Token balances across multiple chains in parallel.
 * Returns an object keyed by chainId.
 */
export const getAllTokenBalancesMultiChain = async (address, chains) => {
  const results = await Promise.all(
    chains.map(async (chain) => {
      try {
        const tokens = await getAllTokenBalances(address, chain);
        return { chainId: chain.id, tokens };
      } catch {
        return { chainId: chain.id, tokens: [] };
      }
    }),
  );

  return results.reduce((acc, r) => {
    acc[r.chainId] = r.tokens;
    return acc;
  }, {});
};

/**
 * Returns true if the address holds any native token or ERC-20 balance.
 * Both checks run in parallel.
 */
export const hasBalance = async (address, chain) => {
  validateChain(chain, "hasBalance");

  const [native, tokens] = await Promise.all([
    getNativeBalance(address, chain).catch(() => ({ formatted: "0" })),
    getAllTokenBalances(address, chain).catch(() => []),
  ]);

  return parseFloat(native.formatted) > 0 || tokens.length > 0;
};
