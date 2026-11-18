// hooks/useSwap.js
// ─────────────────────────────────────────────────────────────────────────────
// One swap, any two chains. The user picks what they pay and what they get —
// each on its own chain — and this decides how it's filled:
//
//   same chain, EVM     → /swap/price + /swap/quote   (0x, backend)
//   same chain, Solana  → /swap/price + /swap/quote   (Jupiter, backend)
//   different chains    → /bridge/quote               (LI.FI: bridge + swap in one tx)
//
// Cross-chain quotes are normalized to the same fields the swap screen and
// SwapConfirmModal already read (buyAmount, minBuyAmount, transaction,
// needsApproval, allowanceTarget), tagged `crossChain: true`, so there's one
// confirm/sign path and the user never has to know a bridge is involved.
// ─────────────────────────────────────────────────────────────────────────────
import { useState, useCallback, useRef, useEffect } from "react";
import { useWallet } from "../contexts/WalletContext";
import { useChain, isSolanaChain } from "../contexts/ChainContext";
import { parseUnits, formatUnits } from "ethers";
import { API_CONFIG } from "../config/api";
import { apiGet } from "../services/apiClient";
import { TTL } from "../utils/cache/DataCache";

const DEFAULT_SLIPPAGE = 0.01;
const NATIVE_TOKEN_ADDRESS = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const safeParseUnits = (amount, decimals) => {
  if (!amount || String(amount).trim() === "") {
    throw new Error("Amount is empty");
  }

  let cleaned = String(amount).trim();
  const commaCount = (cleaned.match(/,/g) || []).length;
  const hasDot = cleaned.includes(".");
  if (commaCount === 1 && !hasDot) cleaned = cleaned.replace(",", ".");
  else cleaned = cleaned.replace(/,/g, "");

  const num = Number(cleaned);
  if (isNaN(num) || !isFinite(num)) throw new Error("Invalid amount");

  // ethers v6 requires decimals as a NUMBER — parseInt guards against string decimals
  const dec = parseInt(decimals, 10);
  if (isNaN(dec) || dec < 0) throw new Error("Invalid token decimals");

  const fixed = num.toFixed(dec);
  const [whole, frac] = fixed.split(".");
  const clamped = frac ? `${whole}.${frac.slice(0, dec)}` : whole;
  return parseUnits(clamped, dec);
};

// EVM native → 0x's 0xEeee… placeholder (LI.FI accepts it too). Solana tokens
// (native SOL included, as the wSOL mint) are passed by mint address.
const resolveTokenAddress = (token, isSolana = false) => {
  if (!token) return null;
  if (isSolana) return token.address;
  return token.isNative ? NATIVE_TOKEN_ADDRESS : token.address;
};

// Native balance held back by "Max" for network fees. SOL needs more than a
// bare fee: a first swap into a token also pays ~0.002 SOL account rent.
const NATIVE_FEE_RESERVE = { evm: 0.002, solana: 0.01 };

const sameToken = (a, b) =>
  !!a &&
  !!b &&
  (a.isNative && b.isNative
    ? true
    : !a.isNative &&
      !b.isNative &&
      a.address?.toLowerCase() === b.address?.toLowerCase());

const loadCatalog = async (chainId) => {
  const json = await apiGet(API_CONFIG.ENDPOINTS.SWAP_TOKENS, {
    params: { chainId },
    ttl: TTL.API_TOKEN_CATALOG,
  });
  return json.data?.tokens ?? [];
};

// ─── Hook ─────────────────────────────────────────────────────────────────────
// `sellChainOverride`: the chain the user pays on (the swap screen keeps its
// own, since Solana can't be the global active chain). Defaults to
// ChainContext's active EVM chain. `buyChainOverride`: the chain they receive
// on; defaults to the sell chain (a same-chain swap).
export function useSwap(sellChainOverride, buyChainOverride) {
  const { address: evmAddress, solanaAddress } = useWallet();
  const { activeChain: contextChain } = useChain();
  const activeChain = sellChainOverride ?? contextChain;
  const buyChain = buyChainOverride ?? activeChain;
  const isSolana = isSolanaChain(activeChain);
  const buyIsSolana = isSolanaChain(buyChain);
  const isCrossChain = !!buyChain && buyChain.id !== activeChain?.id;
  const address = isSolana ? solanaAddress : evmAddress; // pays from
  const recipient = buyIsSolana ? solanaAddress : evmAddress; // receives at

  const [sellToken, setSellToken] = useState(null);
  const [buyToken, setBuyToken] = useState(null);
  const [sellAmount, setSellAmount] = useState("");
  const [buyAmountEstimate, setBuyAmountEstimate] = useState("");
  const [quote, setQuote] = useState(null);
  const [priceInfo, setPriceInfo] = useState(null);
  const [slippage, setSlippage] = useState(DEFAULT_SLIPPAGE);
  const [tokenList, setTokenList] = useState([]); // sell chain
  const [crossBuyList, setCrossBuyList] = useState([]); // buy chain, when different
  const [loadingTokens, setLoadingTokens] = useState(false);
  const [loadingBuyTokens, setLoadingBuyTokens] = useState(false);
  const [isFetchingPrice, setIsFetchingPrice] = useState(false);
  const [isFetchingQuote, setIsFetchingQuote] = useState(false);
  const [error, setError] = useState(null);

  const buyTokenList = isCrossChain ? crossBuyList : tokenList;

  const priceAbortRef = useRef(null);
  const quoteAbortRef = useRef(null);

  // Buy-token preselection from outside the screen (e.g. "Swap" on a token's
  // detail page). Applied once the list for the token's chain has loaded.
  const pendingBuyRef = useRef(null);
  const pendingSellRef = useRef(null); // same, for the sell side (cross-chain flip)
  const loadedRef = useRef({ chainId: null, tokens: [] }); // buy-side list
  const isCrossRef = useRef(isCrossChain);
  isCrossRef.current = isCrossChain;

  const applyBuyToken = useCallback((token, tokens) => {
    const target = tokens.find((t) => sameToken(t, token)) ?? token;
    setBuyToken(target);
    setSellAmount("");
    setBuyAmountEstimate("");
    setPriceInfo(null);
  }, []);

  const resetQuoteState = () => {
    setQuote(null);
    setPriceInfo(null);
    setBuyAmountEstimate("");
    setError(null);
  };

  // ── Sell chain changed: its catalog, a fresh sell token ─────────────────────
  useEffect(() => {
    if (!activeChain?.id) return;
    resetQuoteState();
    setSellToken(null);
    setSellAmount("");
    if (!isCrossRef.current) setBuyToken(null);
    loadTokens();
  }, [activeChain?.id]);

  // ── Buy chain changed (cross-chain): its catalog, a fresh buy token ─────────
  useEffect(() => {
    if (!isCrossChain || !buyChain?.id) return;
    let cancelled = false;
    resetQuoteState();
    setLoadingBuyTokens(true);
    loadCatalog(buyChain.id)
      .then((tokens) => {
        if (cancelled) return;
        setCrossBuyList(tokens);
        loadedRef.current = { chainId: buyChain.id, tokens };
        const pending = pendingBuyRef.current;
        if (pending && pending.chainId === buyChain.id) {
          pendingBuyRef.current = null;
          applyBuyToken(pending, tokens);
        } else {
          setBuyToken((prev) =>
            prev && prev.chainId === buyChain.id ? prev : tokens[0] ?? null,
          );
        }
      })
      .catch((err) => !cancelled && setError(err.message || "Couldn't load tokens"))
      .finally(() => !cancelled && setLoadingBuyTokens(false));
    return () => {
      cancelled = true;
    };
  }, [buyChain?.id, isCrossChain]);

  // Back to same-chain: the buy token must come from the sell chain's list
  useEffect(() => {
    if (isCrossChain) return;
    setBuyToken((prev) =>
      prev && tokenList.some((t) => sameToken(t, prev))
        ? prev
        : tokenList.find((t) => !sameToken(t, sellToken)) ?? null,
    );
  }, [isCrossChain]);

  // ── Token loading (sell chain) ───────────────────────────────────────────────
  // Cached 10min via apiClient — a chain's token catalog barely changes.
  const loadTokens = useCallback(async () => {
    try {
      setLoadingTokens(true);
      const tokens = await loadCatalog(activeChain.id);
      setTokenList(tokens);
      const pendingSell = pendingSellRef.current;
      if (pendingSell && pendingSell.chainId === activeChain.id) {
        pendingSellRef.current = null;
        setSellToken(tokens.find((t) => sameToken(t, pendingSell)) ?? pendingSell);
      } else if (tokens.length) {
        setSellToken(tokens[0]);
      }

      if (!isCrossRef.current) {
        loadedRef.current = { chainId: activeChain.id, tokens };
        const pending = pendingBuyRef.current;
        if (pending && pending.chainId === activeChain.id) {
          pendingBuyRef.current = null;
          applyBuyToken(pending, tokens);
        } else if (tokens.length >= 2) {
          setBuyToken(tokens[1]);
        }
      }
    } catch (err) {
      setError(err.message || "Couldn't load tokens for this chain");
    } finally {
      setLoadingTokens(false);
    }
  }, [activeChain?.id, applyBuyToken]);

  /**
   * Preselect the token to buy. token: { chainId, address, symbol, name,
   * decimals, logoURI, isNative }. The caller sets the buy chain to
   * token.chainId; this applies the token once that chain's list is loaded.
   */
  const queueBuyToken = useCallback(
    (token) => {
      const loaded = loadedRef.current;
      if (loaded.chainId === token.chainId && loaded.tokens.length) {
        pendingBuyRef.current = null;
        applyBuyToken(token, loaded.tokens);
      } else {
        pendingBuyRef.current = token;
      }
    },
    [applyBuyToken],
  );

  /** Same as queueBuyToken, for the sell side. */
  const queueSellToken = useCallback((token) => {
    pendingSellRef.current = token;
  }, []);

  // ── Request params ───────────────────────────────────────────────────────────
  const buildRequest = useCallback(() => {
    const sellAmountWei = safeParseUnits(sellAmount, sellToken.decimals).toString();
    const sellAddr = resolveTokenAddress(sellToken, isSolana);
    const buyAddr = resolveTokenAddress(buyToken, buyIsSolana);

    if (isCrossChain) {
      if (!address || !recipient) {
        throw new Error(
          `Your ${!address ? activeChain.name : buyChain.name} address isn't ready yet. Unlock your wallet and try again.`,
        );
      }
      return {
        path: API_CONFIG.ENDPOINTS.BRIDGE_QUOTE,
        params: {
          fromChain: activeChain.id,
          toChain: buyChain.id,
          fromToken: sellAddr,
          toToken: buyAddr,
          fromAmount: sellAmountWei,
          fromAddress: address,
          toAddress: recipient,
          slippage,
        },
      };
    }
    return {
      params: {
        chainId: activeChain.id,
        sellToken: sellAddr,
        buyToken: buyAddr,
        sellAmount: sellAmountWei,
        slippagePercentage: slippage,
        ...(address && { takerAddress: address }),
      },
    };
  }, [sellToken, buyToken, sellAmount, slippage, activeChain, buyChain, isCrossChain, isSolana, buyIsSolana, address, recipient]);

  // LI.FI's normalized quote → the swap-quote shape the UI reads
  const fromCrossChain = (d) => ({
    ...d,
    crossChain: true,
    chainId: activeChain.id,
    toChainId: buyChain.id,
    minBuyAmount: d.buyAmountMin,
    estimatedPriceImpact: null,
  });

  // ── Price fetch ──────────────────────────────────────────────────────────────
  // Cross-chain has no separate "indicative price" endpoint — LI.FI's quote
  // is it (and is re-fetched fresh when the user taps Swap).
  const fetchPrice = useCallback(async () => {
    if (!sellToken || !buyToken || !sellAmount || parseFloat(sellAmount) <= 0) {
      setBuyAmountEstimate("");
      setPriceInfo(null);
      return;
    }

    if (priceAbortRef.current) priceAbortRef.current.abort();
    priceAbortRef.current = new AbortController();

    try {
      setIsFetchingPrice(true);
      setError(null);

      const req = buildRequest();
      // Never cached — price depends on live market + the exact amount typed.
      const json = await apiGet(req.path ?? API_CONFIG.ENDPOINTS.SWAP_PRICE, {
        ttl: 0,
        signal: priceAbortRef.current.signal,
        params: req.params,
      });

      const data = isCrossChain ? fromCrossChain(json.data) : json.data;
      setPriceInfo(data);

      const buyDec = parseInt(buyToken.decimals, 10);
      const formatted = formatUnits(String(data.buyAmount), buyDec);
      setBuyAmountEstimate(parseFloat(formatted).toFixed(Math.min(buyDec, 6)));
    } catch (err) {
      // "cancelled" means a newer request superseded this one, not a failure.
      if (err.type === "cancelled") return;
      setError(err.message);
      setBuyAmountEstimate("");
      setPriceInfo(null);
    } finally {
      setIsFetchingPrice(false);
    }
  }, [buildRequest, sellToken, buyToken, sellAmount, isCrossChain]);

  // ── Quote fetch ──────────────────────────────────────────────────────────────
  const fetchQuote = useCallback(async () => {
    if (!sellToken || !buyToken || !sellAmount || parseFloat(sellAmount) <= 0) {
      throw new Error("Invalid swap parameters");
    }

    if (quoteAbortRef.current) quoteAbortRef.current.abort();
    quoteAbortRef.current = new AbortController();

    try {
      setIsFetchingQuote(true);
      setError(null);

      const req = buildRequest();
      // Never cached — a quote is single-use and must reflect the current market.
      const json = await apiGet(req.path ?? API_CONFIG.ENDPOINTS.SWAP_QUOTE, {
        ttl: 0,
        signal: quoteAbortRef.current.signal,
        params: req.params,
      });

      const data = isCrossChain ? fromCrossChain(json.data) : json.data;
      setQuote(data);
      return data;
    } catch (err) {
      if (err.type === "cancelled") return;
      setError(err.message);
      throw err;
    } finally {
      setIsFetchingQuote(false);
    }
  }, [buildRequest, sellToken, buyToken, sellAmount, isCrossChain]);

  // ── Flip tokens ──────────────────────────────────────────────────────────────
  // Cross-chain flips swap the chains too — the caller owns the chain state,
  // so it's told via the returned flag (see SwapNewSCreen's handleFlip).
  const flipTokens = useCallback(() => {
    setSellToken(buyToken);
    setBuyToken(sellToken);
    setSellAmount(buyAmountEstimate || "");
    setBuyAmountEstimate("");
    setQuote(null);
    setPriceInfo(null);
  }, [sellToken, buyToken, buyAmountEstimate]);

  // ── Max amount ───────────────────────────────────────────────────────────────
  const setMaxAmount = useCallback(
    (balance) => {
      if (!balance || !sellToken) return;
      if (sellToken.isNative) {
        const reserve = NATIVE_FEE_RESERVE[isSolana ? "solana" : "evm"];
        const val = Math.max(0, parseFloat(balance) - reserve);
        setSellAmount(val > 0 ? val.toFixed(6) : "0");
      } else {
        setSellAmount(balance);
      }
    },
    [sellToken, isSolana],
  );

  // ── Token search ─────────────────────────────────────────────────────────────
  const searchTokens = useCallback(
    (query) => {
      if (!query) return tokenList;
      const q = query.toLowerCase().trim();
      return tokenList.filter(
        (t) =>
          t.symbol.toLowerCase().includes(q) ||
          t.name.toLowerCase().includes(q) ||
          t.address.toLowerCase() === q,
      );
    },
    [tokenList],
  );

  // ── Derived values ───────────────────────────────────────────────────────────
  const getExchangeRate = useCallback(() => {
    const sell = parseFloat(sellAmount);
    const buy = parseFloat(buyAmountEstimate);
    if (!sell || !buy || isNaN(sell) || isNaN(buy)) return null;
    const rate = buy / sell;
    const inverse = sell / buy;
    return {
      rate,
      formatted: `1 ${sellToken?.symbol} = ${rate.toFixed(4)} ${buyToken?.symbol}`,
      inverse: `1 ${buyToken?.symbol} = ${inverse.toFixed(4)} ${sellToken?.symbol}`,
    };
  }, [sellAmount, buyAmountEstimate, sellToken, buyToken]);

  const getPriceImpact = useCallback(() => {
    const raw = priceInfo?.estimatedPriceImpact ?? priceInfo?.priceImpact;
    if (raw == null) return null;
    const impact = parseFloat(raw);
    if (isNaN(impact)) return null;
    return {
      value: impact,
      formatted: `${impact.toFixed(2)}%`,
      severity:
        impact < 1
          ? "low"
          : impact < 3
            ? "medium"
            : impact < 5
              ? "high"
              : "severe",
    };
  }, [priceInfo]);

  /** Cross-chain route details: { eta (s), via, feesUsd } — null otherwise. */
  const getRouteInfo = useCallback(() => {
    if (!priceInfo?.crossChain) return null;
    const fees =
      (parseFloat(priceInfo.gasCostUsd) || 0) + (parseFloat(priceInfo.feeCostUsd) || 0);
    return {
      eta: priceInfo.estimatedDurationSeconds ?? null,
      via: priceInfo.toolDetails?.name || priceInfo.tool || "LI.FI",
      feesUsd: fees > 0 ? fees : null,
    };
  }, [priceInfo]);

  const getSellUsdPrice = useCallback(
    () => sellToken?.usdPrice ?? priceInfo?.sellTokenUsdPrice ?? null,
    [sellToken, priceInfo],
  );

  const getBuyUsdPrice = useCallback(
    () => buyToken?.usdPrice ?? priceInfo?.buyTokenUsdPrice ?? null,
    [buyToken, priceInfo],
  );

  const isReadyToSwap =
    !!sellToken &&
    !!buyToken &&
    !!sellAmount &&
    parseFloat(sellAmount) > 0 &&
    !!priceInfo &&
    !isFetchingPrice &&
    !error;

  return {
    sellToken,
    buyToken,
    sellAmount,
    buyAmountEstimate,
    setSellToken,
    setBuyToken,
    queueBuyToken,
    queueSellToken,
    setSellAmount,
    flipTokens,
    setMaxAmount,
    quote,
    priceInfo,
    fetchQuote,
    fetchPrice,
    getExchangeRate,
    getPriceImpact,
    getRouteInfo,
    getSellUsdPrice,
    getBuyUsdPrice,
    slippage,
    setSlippage,
    tokenList,
    buyTokenList,
    loadingTokens,
    loadingBuyTokens,
    searchTokens,
    loadTokens,
    isFetchingPrice,
    isFetchingQuote,
    isReadyToSwap,
    error,
    setError,
    // chain context for callers
    sellChain: activeChain,
    buyChain,
    isCrossChain,
  };
}
