// hooks/useSwap.js
import { useState, useCallback, useRef, useEffect } from "react";
import { useWallet } from "../contexts/WalletContext";
import { useChain } from "../contexts/ChainContext";
import { parseUnits, formatUnits } from "ethers";

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || "http://localhost:3000";
const DEBOUNCE_MS = 600;

const DEFAULT_SLIPPAGE = 0.01; // 1%

export function useSwap() {
  const { address, provider } = useWallet();
  const { activeChain } = useChain();

  // Token state
  const [sellToken, setSellToken] = useState(null);
  const [buyToken, setBuyToken] = useState(null);
  const [sellAmount, setSellAmount] = useState("");
  const [buyAmountEstimate, setBuyAmountEstimate] = useState("");

  // Quote state
  const [quote, setQuote] = useState(null);
  const [priceInfo, setPriceInfo] = useState(null);
  const [slippage, setSlippage] = useState(DEFAULT_SLIPPAGE);

  // Token list
  const [tokenList, setTokenList] = useState([]);
  const [loadingTokens, setLoadingTokens] = useState(false);

  // Status
  const [isFetchingPrice, setIsFetchingPrice] = useState(false);
  const [isFetchingQuote, setIsFetchingQuote] = useState(false);
  const [error, setError] = useState(null);

  // Debounce ref
  const debounceTimer = useRef(null);
  const abortController = useRef(null);

  // Load tokens when chain changes
  useEffect(() => {
    if (activeChain?.id) {
      loadTokens();
      // Reset state on chain switch
      setQuote(null);
      setPriceInfo(null);
      setBuyAmountEstimate("");
      setSellToken(null);
      setBuyToken(null);
      setSellAmount("");
    }
  }, [activeChain?.id]);

  // Auto-fetch price when inputs change
  useEffect(() => {
    if (sellToken && buyToken && sellAmount && parseFloat(sellAmount) > 0) {
      debouncedFetchPrice();
    } else {
      setBuyAmountEstimate("");
      setPriceInfo(null);
      setQuote(null);
    }

    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, [sellToken, buyToken, sellAmount, slippage]);

  const loadTokens = async () => {
    try {
      setLoadingTokens(true);
      const res = await fetch(
        `${API_BASE_URL}/api/swap/tokens?chainId=${activeChain.id}`,
      );
      const json = await res.json();
      if (json.success) {
        setTokenList(json.data.tokens);
        // Set defaults: first token as sell, second as buy
        if (json.data.tokens.length >= 2) {
          setSellToken(json.data.tokens[0]);
          setBuyToken(json.data.tokens[1]);
        }
      }
    } catch (err) {
      console.error("[useSwap] Failed to load tokens:", err);
    } finally {
      setLoadingTokens(false);
    }
  };

  const debouncedFetchPrice = useCallback(() => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => {
      fetchPrice();
    }, DEBOUNCE_MS);
  }, [sellToken, buyToken, sellAmount, slippage]);

  const fetchPrice = useCallback(async () => {
    if (!sellToken || !buyToken || !sellAmount || parseFloat(sellAmount) <= 0) {
      return;
    }

    // Cancel previous request
    if (abortController.current) {
      abortController.current.abort();
    }
    abortController.current = new AbortController();

    try {
      setIsFetchingPrice(true);
      setError(null);

      const sellAmountWei = parseUnits(
        sellAmount.toString(),
        sellToken.decimals,
      ).toString();

      const params = new URLSearchParams({
        chainId: activeChain.id,
        sellToken: sellToken.address,
        buyToken: buyToken.address,
        sellAmount: sellAmountWei,
        slippagePercentage: slippage,
        ...(address && { takerAddress: address }),
      });

      const res = await fetch(`${API_BASE_URL}/api/swap/price?${params}`, {
        signal: abortController.current.signal,
      });

      const json = await res.json();

      if (!json.success) {
        throw new Error(json.error || "Failed to fetch price");
      }

      const data = json.data;
      setPriceInfo(data);

      // Format buy amount for display
      const formattedBuyAmount = formatUnits(data.buyAmount, buyToken.decimals);
      setBuyAmountEstimate(
        parseFloat(formattedBuyAmount).toFixed(
          buyToken.decimals > 6 ? 6 : buyToken.decimals,
        ),
      );
    } catch (err) {
      if (err.name === "AbortError") return;
      console.error("[useSwap] Price fetch error:", err);
      setError(err.message);
      setBuyAmountEstimate("");
    } finally {
      setIsFetchingPrice(false);
    }
  }, [sellToken, buyToken, sellAmount, slippage, activeChain?.id, address]);

  const fetchQuote = useCallback(async () => {
    if (!sellToken || !buyToken || !sellAmount || parseFloat(sellAmount) <= 0) {
      throw new Error("Invalid swap parameters");
    }

    try {
      setIsFetchingQuote(true);
      setError(null);

      const sellAmountWei = parseUnits(
        sellAmount.toString(),
        sellToken.decimals,
      ).toString();

      const params = new URLSearchParams({
        chainId: activeChain.id,
        sellToken: sellToken.address,
        buyToken: buyToken.address,
        sellAmount: sellAmountWei,
        slippagePercentage: slippage,
        ...(address && { takerAddress: address }),
      });

      const res = await fetch(`${API_BASE_URL}/api/swap/quote?${params}`);
      const json = await res.json();

      if (!json.success) {
        throw new Error(json.error || "Failed to fetch quote");
      }

      setQuote(json.data);
      return json.data;
    } catch (err) {
      console.error("[useSwap] Quote fetch error:", err);
      setError(err.message);
      throw err;
    } finally {
      setIsFetchingQuote(false);
    }
  }, [sellToken, buyToken, sellAmount, slippage, activeChain?.id, address]);

  const flipTokens = useCallback(() => {
    const prevSell = sellToken;
    const prevBuy = buyToken;
    setSellToken(prevBuy);
    setBuyToken(prevSell);
    setSellAmount(buyAmountEstimate || "");
    setBuyAmountEstimate("");
    setQuote(null);
  }, [sellToken, buyToken, buyAmountEstimate]);

  const setMaxAmount = useCallback(
    (balance) => {
      if (!balance || !sellToken) return;
      // Leave a small buffer for gas if native token
      if (sellToken.isNative) {
        const val = Math.max(0, parseFloat(balance) - 0.002);
        setSellAmount(val > 0 ? val.toFixed(6) : "0");
      } else {
        setSellAmount(balance);
      }
    },
    [sellToken],
  );

  const searchTokens = useCallback(
    async (query) => {
      if (!query) return tokenList;
      const q = query.toLowerCase();
      return tokenList.filter(
        (t) =>
          t.symbol.toLowerCase().includes(q) ||
          t.name.toLowerCase().includes(q) ||
          t.address.toLowerCase() === q,
      );
    },
    [tokenList],
  );

  const getExchangeRate = useCallback(() => {
    if (!priceInfo || !sellAmount || parseFloat(sellAmount) === 0) return null;
    const rate = parseFloat(priceInfo.price);
    return {
      rate,
      formatted: `1 ${sellToken?.symbol} = ${rate.toFixed(4)} ${buyToken?.symbol}`,
      inverse: `1 ${buyToken?.symbol} = ${(1 / rate).toFixed(4)} ${sellToken?.symbol}`,
    };
  }, [priceInfo, sellAmount, sellToken, buyToken]);

  const getPriceImpact = useCallback(() => {
    if (!priceInfo?.estimatedPriceImpact) return null;
    const impact = parseFloat(priceInfo.estimatedPriceImpact);
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

  const isReadyToSwap =
    !!sellToken &&
    !!buyToken &&
    !!sellAmount &&
    parseFloat(sellAmount) > 0 &&
    !!priceInfo &&
    !isFetchingPrice &&
    !error;

  return {
    // Token state
    sellToken,
    buyToken,
    sellAmount,
    buyAmountEstimate,
    setSellToken,
    setBuyToken,
    setSellAmount,
    flipTokens,
    setMaxAmount,

    // Quote & price
    quote,
    priceInfo,
    fetchQuote,
    fetchPrice,
    getExchangeRate,
    getPriceImpact,

    // Slippage
    slippage,
    setSlippage,

    // Token list
    tokenList,
    loadingTokens,
    searchTokens,
    loadTokens,

    // Status
    isFetchingPrice,
    isFetchingQuote,
    isReadyToSwap,
    error,
    setError,
  };
}
