import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { formatUnits } from "ethers";
import { getTokensByChain } from "../utils/TokenDatabase";
import { batchGetTokenBalances } from "../utils/cache/Multicall";
import { withCache, Key, TTL } from "../utils/cache/DataCache";
import cacheStore from "../utils/cache/CacheStore";
import coinGeckoService, { getAllNativePrices } from "../services/coingecko";
import { SUPPORTED_CHAINS } from "../constants/Chain";
import { NON_EVM_CHAINS } from "../constants/nonEvmChain";
import { getSplTokenBalances } from "../utils/SolanaService";
import { getSplPrefs, isSplVisible } from "../utils/splVisibility";
import { apiGet } from "../services/apiClient";
import { API_CONFIG } from "../config/api";

const SOLANA = NON_EVM_CHAINS.SOLANA;

/**
 * SPL holdings for a Solana wallet, as portfolio token assets. Only mints in
 * the backend's curated Solana catalog (tokens/solana.json) are shown:
 * anyone can airdrop arbitrary tokens to a Solana address, so an unlisted
 * mint is treated as spam rather than surfaced with an unverified name.
 */
const loadSplAssets = async (solanaAddress) => {
  const [held, catalog, prefs] = await Promise.all([
    withCache(
      Key.knownTokenBalances(solanaAddress, SOLANA.id),
      TTL.TOKEN_BALANCE,
      () => getSplTokenBalances(solanaAddress),
    ),
    apiGet(API_CONFIG.ENDPOINTS.SWAP_TOKENS, {
      params: { chainId: SOLANA.id },
      ttl: TTL.API_TOKEN_CATALOG,
    }).then((json) => json.data?.tokens ?? []),
    getSplPrefs(solanaAddress), // Manage Tokens show/hide choices
  ]);

  const byMint = new Map(
    catalog.filter((t) => !t.isNative).map((t) => [t.address, t]),
  );

  // A wallet can hold several accounts for one mint — sum them
  const totals = new Map();
  for (const h of held) {
    if (!byMint.has(h.mint) || !isSplVisible(prefs, h.mint, true)) continue;
    const prev = totals.get(h.mint);
    totals.set(h.mint, {
      amount: (prev ? BigInt(prev.amount) : 0n) + BigInt(h.amount),
      decimals: h.decimals,
    });
  }

  // Switched on in Manage Tokens but not held: show at zero
  for (const mint of prefs.enabled) {
    const meta = byMint.get(mint);
    if (meta && !totals.has(mint) && !prefs.hidden.has(mint)) {
      totals.set(mint, { amount: 0n, decimals: meta.decimals });
    }
  }

  return Promise.all(
    Array.from(totals, async ([mint, { amount, decimals }]) => {
      const meta = byMint.get(mint);
      const balance = formatUnits(amount, decimals);
      // By mint, never by symbol: SPL symbols are trivially spoofed
      const tokenPrice = await withTimeout(
        coinGeckoService.getTokenPrice(mint, SOLANA.id),
        TOKEN_TIMEOUT,
        null,
      );
      return {
        _id: `${SOLANA.id}_${mint}`,
        _isNative: false,
        chainId: SOLANA.id,
        chainName: SOLANA.name,
        chainIcon: SOLANA.icon,
        symbol: meta.symbol,
        name: meta.name,
        logo: meta.logoURI ?? null,
        address: mint,
        balance,
        decimals,
        price: tokenPrice?.usd ?? null,
        priceChange24h: tokenPrice?.usd_24h_change ?? null,
        // null = held but no price: shown as "—", never as $0.00
        usdValue: tokenPrice?.usd ? parseFloat(balance) * tokenPrice.usd : parseFloat(balance) > 0 ? null : 0,
        isNative: false,
        networkType: "solana",
      };
    }),
  );
};

/**
 * usePortfolioAssets
 *
 * Single source of truth for the HomeScreen assets tab and portfolio total.
 * Merges:
 *   • Native balances for all *enabled* EVM chains (from WalletContext balance cache)
 *   • ERC-20 tokens saved in DB for every enabled EVM chain
 *   • SOL + held SPL tokens (catalog-listed only), when Solana is enabled
 *
 * Props:
 *   walletAddress   — EVM address string
 *   enabledChainIds — Set<number> from ChainContext (null = loading → show all)
 *   balances        — EVM balances map from useWallet()
 *   solanaAddress   — Solana address string (null if not derived yet)
 *   solanaBalance   — SOL balance from useWallet() ({ formatted, ... } | null)
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
  solanaAddress,
  solanaBalance,
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
    // String sort: ids mix numbers (EVM) and strings ("SOLANA")
    return Array.from(enabledChainIds, String).sort().join(",");
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
        // null when the price didn't load: the row shows "Price unavailable"
        // instead of a misleading $0.00
        const price = priceData?.usd ?? null;
        const priceChange24h = priceData?.usd_24h_change ?? null;
        const usdValue = price == null ? (balanceValue > 0 ? null : 0) : balanceValue * price;

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

      // ── 2b. SOL ─────────────────────────────────────────────────────────────
      const solanaVisible =
        !!solanaAddress &&
        (!enabledChainIds || enabledChainIds.has(SOLANA.id));

      const builtSolanaNativeAssets = [];
      if (solanaVisible) {
        const balanceValue = parseFloat(solanaBalance?.formatted ?? "0") || 0;
        const priceData = nativePrices[SOLANA.symbol];
        const price = priceData?.usd ?? null;
        builtSolanaNativeAssets.push({
          chainId: SOLANA.id,
          chain: SOLANA,
          symbol: SOLANA.symbol,
          name: SOLANA.nativeTokenName,
          chainName: SOLANA.name,
          logo: SOLANA.icon,
          balance: balanceValue.toString(),
          usdValue: price == null ? (balanceValue > 0 ? null : 0) : balanceValue * price,
          price,
          priceChange24h: priceData?.usd_24h_change ?? null,
          isZeroBalance: balanceValue === 0,
          isTestnet: false,
          _id: `native-${SOLANA.id}`,
          _isNative: true,
          networkType: "solana",
        });
      }

      // Show native balances right away; tokens fill in below.
      const firstNative = [...builtEVMNativeAssets, ...builtSolanaNativeAssets];
      setNativeAssets(firstNative);
      setTotalValue(firstNative.reduce((s, a) => s + (a.usdValue ?? 0), 0));
      setLoading(false);
      hasDataRef.current = true;

      // ── 3. ERC-20 tokens for enabled EVM chains (+ SPL, in parallel) ────────
      const splPromise = solanaVisible
        ? withTimeout(loadSplAssets(solanaAddress), TOKEN_TIMEOUT, [])
        : Promise.resolve([]);

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

                  const held = parseFloat(balFormatted) > 0;
                  const usdValue = tokenPrice?.usd && held ? parseFloat(balFormatted) * tokenPrice.usd : held ? null : 0;

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

      const splTokenAssets = await splPromise;

      // ── 4. Merge + sort ──────────────────────────────────────────────────────
      const allNativeAssets = [
        ...builtEVMNativeAssets,
        ...builtSolanaNativeAssets,
      ].sort((a, b) => {
        if (a.isZeroBalance && !b.isZeroBalance) return 1;
        if (!a.isZeroBalance && b.isZeroBalance) return -1;
        return (b.usdValue ?? 0) - (a.usdValue ?? 0);
      });

      const allTokenAssets = [
        ...evmTokenResults.flat().filter(Boolean),
        ...splTokenAssets,
      ].sort((a, b) => {
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
  [walletAddress, enabledKey, balances, isProduction, solanaAddress, solanaBalance],
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
  }, [balances, solanaBalance]);

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
