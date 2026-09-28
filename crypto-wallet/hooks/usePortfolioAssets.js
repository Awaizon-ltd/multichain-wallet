import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { formatUnits } from "ethers";
import { getTokensByChain } from "../utils/TokenDatabase";
import { batchGetTokenBalances } from "../utils/cache/Multicall";
import { withCache, Key, TTL } from "../utils/cache/DataCache";
import cacheStore from "../utils/cache/CacheStore";
import coinGeckoService, { getAllNativePrices } from "../services/coingecko";
import { SUPPORTED_CHAINS } from "../constants/Chain";

/**
 * usePortfolioAssets
 *
 * Single source of truth for the HomeScreen assets tab and portfolio total.
 * Merges:
 *   • Native balances for all *enabled* EVM chains (from WalletContext balance cache)
 *   • ERC-20 tokens saved in DB for every enabled EVM chain
 *
 * Props:
 *   walletAddress   — EVM address string
 *   enabledChainIds — Set<number> from ChainContext (null = loading → show all)
 *   balances        — EVM balances map from useWallet()
 *   isProduction    — boolean from ChainContext
 *
 * Returns:
 *   nativeAssets    — array of native-coin assets (one per enabled chain)
 *   tokenAssets     — flat array of ERC-20 tokens across all enabled chains
 *   totalValue      — combined USD value
 *   totalChange24h  — weighted 24h % change
 *   loading         — true on first load
 *   refresh()       — trigger full reload
 */
// Resolve to `fallback` if the promise rejects or takes longer than `ms`,
// so one slow RPC / CoinGecko call can never keep the skeleton up forever.
const withTimeout = (promise, ms, fallback) =>
  new Promise((resolve) => {
    const timer = setTimeout(() => resolve(fallback), ms);
    Promise.resolve(promise).then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      () => {
        clearTimeout(timer);
        resolve(fallback);
      },
    );
  });

const PRICE_TIMEOUT = 8000;
const TOKEN_TIMEOUT = 8000;

const usePortfolioAssets = ({
  walletAddress,
  enabledChainIds,
  balances,
  isProduction,
}) => {
  const [nativeAssets, setNativeAssets] = useState([]);
  const [tokenAssets, setTokenAssets] = useState([]);
  const [totalValue, setTotalValue] = useState(0);
  const [totalChange24h, setTotalChange24h] = useState(0);
  const [loading, setLoading] = useState(true);

  const fetchingRef = useRef(false);
  const pendingRef = useRef(false);
  const fetchAssetsRef = useRef(null);
  // Once we've shown *something* (from cache or a completed fetch), later
  // refreshes (e.g. balances arriving async from WalletContext) happen
  // quietly in the background instead of flashing the skeleton again.
  const hasDataRef = useRef(false);

  // Stable key for enabledChainIds so deps array doesn't churn on Set identity
  const enabledKey = useMemo(() => {
    if (!enabledChainIds) return "all";
    return Array.from(enabledChainIds)
      .sort((a, b) => a - b)
      .join(",");
  }, [enabledChainIds]);

  const fetchAssets = useCallback(async () => {
    if (!walletAddress || !balances) {
      setLoading(false);
      return;
    }
    if (fetchingRef.current) {
      pendingRef.current = true;
      return;
    }

    try {
      fetchingRef.current = true;
      pendingRef.current = false;
      if (!hasDataRef.current) setLoading(true);

      const allChains = Object.values(SUPPORTED_CHAINS);

      // EVM chains visible in portfolio
      const visibleChains = allChains
        .filter((c) => (isProduction ? !c.testnet : true))
        .filter((c) => (!enabledChainIds ? true : enabledChainIds.has(c.id)));

      // ── 1. All price data in parallel ────────────────────────────────────────
      const nativePrices = await withTimeout(
        getAllNativePrices(),
        PRICE_TIMEOUT,
        {},
      );

      // ── 2. EVM native assets ─────────────────────────────────────────────────
      const builtEVMNativeAssets = visibleChains.map((chain) => {
        const bal = balances[chain.id];
        const balanceValue = bal ? parseFloat(bal.formatted ?? "0") : 0;
        const priceData = nativePrices[chain.symbol];
        const price = priceData?.usd ?? 0;
        const priceChange24h = priceData?.usd_24h_change ?? null;
        const usdValue = balanceValue * price;

        return {
          chainId: chain.id,
          chain,
          symbol: chain.symbol,
          // Native asset row shows the token's own name (e.g. "Ether"), not
          // the chain's name (e.g. "Robinhood Chain") — the chain logo is
          // still what distinguishes it visually.
          name: chain.nativeTokenName || chain.name,
          chainName: chain.name,
          logo: chain.icon,
          balance: balanceValue.toString(),
          usdValue,
          price,
          priceChange24h,
          isZeroBalance: balanceValue === 0,
          isTestnet: !!chain.testnet,
          _id: `native-${chain.id}`,
          _isNative: true,
          networkType: "evm",
        };
      });

      // Show native balances right away; tokens fill in below.
      setNativeAssets(builtEVMNativeAssets);
      setTotalValue(builtEVMNativeAssets.reduce((s, a) => s + a.usdValue, 0));
      setLoading(false);
      hasDataRef.current = true;

      // ── 3. ERC-20 tokens for enabled EVM chains ──────────────────────────────
      const evmTokenResults = await Promise.all(
        visibleChains.map(async (chain) => {
          try {
            const chainId = parseInt(chain.id);
            const dbTokens = await getTokensByChain(
              walletAddress.toLowerCase(),
              chainId,
            );

            if (!dbTokens || dbTokens.length === 0) return [];

            const seen = new Set();
            const unique = dbTokens.filter((t) => {
              const k = t.address.toLowerCase();
              if (seen.has(k)) return false;
              seen.add(k);
              return true;
            });

            // One Multicall aggregate3 call for every enabled token on this
            // chain, instead of one eth_call per token — this is the single
            // biggest lever on Alchemy usage: a wallet with 10 enabled tokens
            // on one chain used to cost 10 RPC requests every portfolio load;
            // now it's 1. Cached 30s so repeat loads within that window are free.
            const addresses = unique.map((t) => t.address);
            const balanceByAddress = await withTimeout(
              withCache(
                Key.knownTokenBalances(walletAddress, chainId),
                TTL.TOKEN_BALANCE,
                async () => {
                  const map = await batchGetTokenBalances(
                    walletAddress,
                    addresses,
                    chain,
                  );
                  const obj = {};
                  for (const [addr, wei] of map) obj[addr] = wei.toString();
                  return obj;
                },
              ),
              TOKEN_TIMEOUT,
              {},
            );

            return Promise.all(
              unique.map(async (dbToken) => {
                try {
                  const tokenPrice = await withTimeout(
                    (async () => {
                      const byAddr = await coinGeckoService.getTokenPrice(
                        dbToken.address,
                        chainId,
                      );
                      return (
                        byAddr ??
                        (await coinGeckoService.getTokenPrice(
                          dbToken.symbol,
                          chainId,
                        ))
                      );
                    })(),
                    TOKEN_TIMEOUT,
                    null,
                  );

                  const rawBalance =
                    balanceByAddress[dbToken.address.toLowerCase()] ?? "0";
                  const balFormatted = formatUnits(
                    rawBalance,
                    dbToken.decimals,
                  );

                  const usdValue =
                    tokenPrice?.usd && parseFloat(balFormatted) > 0
                      ? parseFloat(balFormatted) * tokenPrice.usd
                      : 0;

                  return {
                    _id: `${chainId}_${dbToken.address.toLowerCase()}`,
                    _isNative: false,
                    chainId,
                    chainName: chain.name,
                    chainIcon: chain.icon,
                    symbol: dbToken.symbol,
                    name: dbToken.name,
                    logo: dbToken.logo ?? null,
                    address: dbToken.address,
                    balance: balFormatted,
                    decimals: dbToken.decimals,
                    price: tokenPrice?.usd ?? null,
                    priceChange24h: tokenPrice?.usd_24h_change ?? null,
                    usdValue,
                    isNative: false,
                    networkType: "evm",
                  };
                } catch {
                  return null;
                }
              }),
            );
          } catch {
            return [];
          }
        }),
      );

      // ── 4. Merge + sort ──────────────────────────────────────────────────────
      const allNativeAssets = [...builtEVMNativeAssets].sort((a, b) => {
        if (a.isZeroBalance && !b.isZeroBalance) return 1;
        if (!a.isZeroBalance && b.isZeroBalance) return -1;
        return b.usdValue - a.usdValue;
      });

      const allTokenAssets = [...evmTokenResults.flat().filter(Boolean)].sort((a, b) => {
        const aHas = parseFloat(a.balance) > 0;
        const bHas = parseFloat(b.balance) > 0;
        if (aHas && !bHas) return -1;
        if (!aHas && bHas) return 1;
        return (b.usdValue ?? 0) - (a.usdValue ?? 0);
      });

      setNativeAssets(allNativeAssets);
      setTokenAssets(allTokenAssets);

      // ── 5. Portfolio totals ──────────────────────────────────────────────────
      const allAssets = [...allNativeAssets, ...allTokenAssets];
      const total = allAssets.reduce((sum, a) => sum + (a.usdValue ?? 0), 0);

      const pricedAssets = allAssets.filter(
        (a) => (a.usdValue ?? 0) > 0 && a.priceChange24h != null,
      );
      let weightedChange = 0;
      if (pricedAssets.length > 0) {
        const totalPricedValue = pricedAssets.reduce(
          (sum, a) => sum + (a.usdValue ?? 0),
          0,
        );
        if (totalPricedValue > 0) {
          weightedChange =
            pricedAssets.reduce(
              (sum, a) => sum + (a.usdValue ?? 0) * a.priceChange24h,
              0,
            ) / totalPricedValue;
        }
      }

      setTotalValue(total);
      setTotalChange24h(weightedChange);

      // Persist the assembled snapshot (SQLite-backed) so the next mount —
      // even after a full app restart — can paint instantly from this
      // instead of showing a skeleton while the network round-trips.
      cacheStore.set(
        Key.portfolioSnapshot(walletAddress, enabledKey),
        { nativeAssets: allNativeAssets, tokenAssets: allTokenAssets, totalValue: total, totalChange24h: weightedChange },
        { persist: true },
      );
    } catch (err) {
      console.error("[usePortfolioAssets] error:", err);
    } finally {
      fetchingRef.current = false;
      setLoading(false);
      if (pendingRef.current) {
        pendingRef.current = false;
        fetchAssetsRef.current?.();
      }
    }
  },
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [walletAddress, enabledKey, balances, isProduction],
  );

  fetchAssetsRef.current = fetchAssets;

  useEffect(() => {
    let cancelled = false;

    (async () => {
      // Paint last-known balances instantly (even across a cold app restart)
      // instead of a skeleton, then refresh in the background. Only a wallet
      // that has genuinely never loaded before falls through to the skeleton.
      await cacheStore.hydrate(); // no-op after the first call anywhere in the app
      if (cancelled || !walletAddress) return;

      const snapshot = cacheStore.get(Key.portfolioSnapshot(walletAddress, enabledKey));
      hasDataRef.current = !!snapshot?.value; // re-armed per wallet/chain-set
      if (snapshot?.value) {
        setNativeAssets(snapshot.value.nativeAssets);
        setTokenAssets(snapshot.value.tokenAssets);
        setTotalValue(snapshot.value.totalValue);
        setTotalChange24h(snapshot.value.totalChange24h);
        setLoading(false);
      } else {
        setLoading(true);
        setTokenAssets([]);
      }

      if (!cancelled) fetchAssetsRef.current?.();
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [walletAddress, enabledKey]);

  useEffect(() => {
    fetchAssets();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [balances]);

  // Pull-to-refresh: HomeScreen already shows its own RefreshControl spinner
  // for this, so we don't also flip the skeleton back on over existing data.
  const refresh = useCallback(() => {
    fetchAssets();
  }, [fetchAssets]);

  return {
    nativeAssets,
    tokenAssets,
    totalValue,
    totalChange24h,
    loading,
    refresh,
  };
};

export default usePortfolioAssets;
