// hooks/useMultiChainTokens.js
// Token catalogs (native + listed tokens) for several chains at once, with
// optional balances — shared by Manage Tokens and Receive.
//
// Every chain loads in parallel and is published the moment *it* finishes,
// so the first chain's tokens are on screen while slower chains (or RPCs) are
// still working; one failing chain never blanks the others. Catalogs come
// from the same cached /swap/tokens endpoint Swap uses (10 min TTL), and
// balances cost one RPC round-trip per chain (Multicall for EVM; Token +
// Token-2022 account reads for Solana), not one per token.
import { useCallback, useEffect, useRef, useState } from "react";
import { formatUnits } from "ethers";
import { useWallet } from "../contexts/WalletContext";
import { isSolanaChain } from "../contexts/ChainContext";
import { apiGet } from "../services/apiClient";
import { API_CONFIG } from "../config/api";
import { TTL } from "../utils/cache/DataCache";
import { getNativeBalance } from "../utils/blockchain/Balances";
import { batchGetTokenBalances } from "../utils/cache/Multicall";
import { getSolBalance, getSplTokenBalances } from "../utils/SolanaService";

/** Lookup key for a token on its chain: EVM lowercase, Solana mints as-is. */
export const tokenKey = (chain, token) =>
  token.isNative
    ? "native"
    : isSolanaChain(chain)
      ? token.address
      : token.address.toLowerCase();

const loadBalances = async (chain, tokens, evmAddress, solanaAddress) => {
  const out = {};
  if (isSolanaChain(chain)) {
    if (!solanaAddress) return out;
    const [sol, spl] = await Promise.all([
      getSolBalance(solanaAddress).catch(() => null),
      getSplTokenBalances(solanaAddress).catch(() => []),
    ]);
    if (sol) out.native = sol.formatted;
    for (const h of spl) {
      // several accounts per mint are possible — sum them
      const prev = parseFloat(out[h.mint] || "0");
      out[h.mint] = String(prev + parseFloat(h.formatted || "0"));
    }
    return out;
  }

  if (!evmAddress) return out;
  const erc20 = tokens.filter((t) => !t.isNative);
  const [native, map] = await Promise.all([
    getNativeBalance(evmAddress, chain).catch(() => null),
    erc20.length
      ? batchGetTokenBalances(evmAddress, erc20.map((t) => t.address), chain).catch(
          () => new Map(),
        )
      : Promise.resolve(new Map()),
  ]);
  if (native) out.native = native.formatted;
  for (const t of erc20) {
    const wei = map.get(t.address.toLowerCase());
    if (wei != null) out[t.address.toLowerCase()] = formatUnits(wei, t.decimals);
  }
  return out;
};

/**
 * @param {object} p
 * @param {Array} p.networks   chain objects to load
 * @param {boolean} p.withBalances  also fetch the user's balances
 * @returns {{ byChain: Record<id, { tokens, balances, loading, error }>, reload }}
 */
export default function useMultiChainTokens({ networks, withBalances = false }) {
  const { address: evmAddress, solanaAddress } = useWallet();
  const [byChain, setByChain] = useState({});
  const runRef = useRef(0);
  const idsKey = networks.map((c) => String(c.id)).join(",");

  const load = useCallback(
    async ({ force = false } = {}) => {
      const run = ++runRef.current;
      const patch = (id, value) =>
        run === runRef.current &&
        setByChain((prev) => ({ ...prev, [id]: { ...prev[id], ...value } }));

      setByChain((prev) => {
        const next = {};
        for (const c of networks) next[c.id] = { tokens: [], balances: {}, ...prev[c.id], loading: true, error: null };
        return next;
      });

      await Promise.all(
        networks.map(async (chain) => {
          try {
            const json = await apiGet(API_CONFIG.ENDPOINTS.SWAP_TOKENS, {
              params: { chainId: chain.id },
              ttl: force ? 0 : TTL.API_TOKEN_CATALOG,
            });
            const tokens = json.data?.tokens ?? [];
            // Tokens first — the list can render before balances arrive
            patch(chain.id, { tokens, loading: withBalances });
            if (withBalances) {
              const balances = await loadBalances(chain, tokens, evmAddress, solanaAddress);
              patch(chain.id, { balances, loading: false });
            }
          } catch (err) {
            patch(chain.id, { loading: false, error: err?.message || "Couldn't load tokens" });
          }
        }),
      );
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [idsKey, withBalances, evmAddress, solanaAddress],
  );

  useEffect(() => {
    load();
  }, [load]);

  return { byChain, reload: load };
}
