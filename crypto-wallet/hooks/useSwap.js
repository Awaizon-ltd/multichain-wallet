// hooks/useSwap.js
import { useState, useCallback, useRef, useEffect } from "react";
import { useWallet } from "../contexts/WalletContext";
import { useChain } from "../contexts/ChainContext";
import { parseUnits, formatUnits } from "ethers";
import { API_CONFIG } from "../config/api";

const API_BASE_URL = API_CONFIG.BASE_URL;
const DEFAULT_SLIPPAGE = 0.01;
const NATIVE_TOKEN_ADDRESS = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const safeParseUnits = (amount, decimals) => {
  if (__DEV__)
    console.log(
      `[safeParseUnits] input: ${JSON.stringify(amount)}  decimals: ${JSON.stringify(decimals)}  type: ${typeof decimals}`,
    );

  if (!amount || String(amount).trim() === "") {
    throw new Error("Amount is empty");
  }

  let cleaned = String(amount).trim();
  const commaCount = (cleaned.match(/,/g) || []).length;
  const hasDot = cleaned.includes(".");
  if (commaCount === 1 && !hasDot) cleaned = cleaned.replace(",", ".");
  else cleaned = cleaned.replace(/,/g, "");

  const num = Number(cleaned);
  if (__DEV__)
    console.log(
      `[safeParseUnits] cleaned: ${JSON.stringify(cleaned)}  num: ${num}  isNaN: ${isNaN(num)}`,
    );

  if (isNaN(num) || !isFinite(num)) throw new Error("Invalid amount");

  // ethers v6 requires decimals as a NUMBER — parseInt guards against string decimals
  const dec = parseInt(decimals, 10);
  if (__DEV__)
    console.log(
      `[safeParseUnits] dec (after parseInt): ${dec}  isNaN: ${isNaN(dec)}`,
    );

  if (isNaN(dec) || dec < 0) throw new Error("Invalid token decimals");

  const fixed = num.toFixed(dec);
  const [whole, frac] = fixed.split(".");
  const clamped = frac ? `${whole}.${frac.slice(0, dec)}` : whole;

  if (__DEV__)
    console.log(
      `[safeParseUnits] clamped: ${JSON.stringify(clamped)}  → calling parseUnits`,
    );
  const result = parseUnits(clamped, dec);
  if (__DEV__) console.log(`[safeParseUnits] result: ${result.toString()}`);
  return result;
};

const resolveTokenAddress = (token) => {
  if (!token) return null;
  return token.isNative ? NATIVE_TOKEN_ADDRESS : token.address;
};

// ─── Hook ─────────────────────────────────────────────────────────────────────
export function useSwap() {
  const { address } = useWallet();
  const { activeChain } = useChain();

  const [sellToken, setSellToken] = useState(null);
  const [buyToken, setBuyToken] = useState(null);
  const [sellAmount, setSellAmount] = useState("");
  const [buyAmountEstimate, setBuyAmountEstimate] = useState("");
  const [quote, setQuote] = useState(null);
  const [priceInfo, setPriceInfo] = useState(null);
  const [slippage, setSlippage] = useState(DEFAULT_SLIPPAGE);
  const [tokenList, setTokenList] = useState([]);
  const [loadingTokens, setLoadingTokens] = useState(false);
  const [isFetchingPrice, setIsFetchingPrice] = useState(false);
  const [isFetchingQuote, setIsFetchingQuote] = useState(false);
  const [error, setError] = useState(null);

  const priceAbortRef = useRef(null);
  const quoteAbortRef = useRef(null);

  useEffect(() => {
    if (activeChain?.id) {
      if (__DEV__)
        console.log(
          `[useSwap] chain changed → ${activeChain.id}, reloading tokens`,
        );
      loadTokens();
      setQuote(null);
      setPriceInfo(null);
      setBuyAmountEstimate("");
      setSellToken(null);
      setBuyToken(null);
      setSellAmount("");
      setError(null);
    }
  }, [activeChain?.id]);

  // ── Token loading ────────────────────────────────────────────────────────────
  const loadTokens = useCallback(async () => {
    try {
      setLoadingTokens(true);
      const url = `${API_BASE_URL}/swap/tokens?chainId=${activeChain.id}`;
      if (__DEV__) console.log(`[useSwap loadTokens] GET ${url}`);

      const res = await fetch(url);
      const json = await res.json();

      if (__DEV__)
        console.log(
          `[useSwap loadTokens] success=${json.success}  count=${json.data?.tokens?.length}`,
        );
      if (json.data?.tokens?.length > 0) {
        if (__DEV__)
          console.log(
            `[useSwap loadTokens] token[0]:`,
            JSON.stringify(json.data.tokens[0]),
          );
        if (__DEV__)
          console.log(
            `[useSwap loadTokens] token[1]:`,
            JSON.stringify(json.data.tokens[1]),
          );
      }

      if (json.success) {
        setTokenList(json.data.tokens);
        if (json.data.tokens.length >= 2) {
          setSellToken(json.data.tokens[0]);
          setBuyToken(json.data.tokens[1]);
        }
      }
    } catch (err) {
      if (__DEV__) console.error("[useSwap loadTokens] ERROR:", err.message);
    } finally {
      setLoadingTokens(false);
    }
  }, [activeChain?.id]);

  // ── Price fetch ──────────────────────────────────────────────────────────────
  const fetchPrice = useCallback(async () => {
    if (__DEV__) console.log("\n[useSwap fetchPrice] ━━━ START ━━━");
    if (__DEV__)
      console.log(
        "[useSwap fetchPrice] sellToken  :",
        sellToken
          ? `${sellToken.symbol} (decimals=${sellToken.decimals} type=${typeof sellToken.decimals} addr=${sellToken.address})`
          : "null",
      );
    if (__DEV__)
      console.log(
        "[useSwap fetchPrice] buyToken   :",
        buyToken
          ? `${buyToken.symbol}  (decimals=${buyToken.decimals}  type=${typeof buyToken.decimals}  addr=${buyToken.address})`
          : "null",
      );
    if (__DEV__)
      console.log(
        "[useSwap fetchPrice] sellAmount :",
        sellAmount,
        " parsed:",
        parseFloat(sellAmount),
      );
    if (__DEV__) console.log("[useSwap fetchPrice] slippage   :", slippage);
    if (__DEV__)
      console.log("[useSwap fetchPrice] chainId    :", activeChain?.id);
    if (__DEV__)
      console.log("[useSwap fetchPrice] address    :", address || "(none)");

    if (!sellToken || !buyToken || !sellAmount || parseFloat(sellAmount) <= 0) {
      if (__DEV__)
        console.log("[useSwap fetchPrice] SKIPPED — missing/zero inputs");
      setBuyAmountEstimate("");
      setPriceInfo(null);
      return;
    }

    if (priceAbortRef.current) priceAbortRef.current.abort();
    priceAbortRef.current = new AbortController();

    try {
      setIsFetchingPrice(true);
      setError(null);

      // ── Step 1: convert to wei ──────────────────────────────────────────────
      if (__DEV__)
        console.log("\n[useSwap fetchPrice] Step 1 — safeParseUnits");
      const sellAmountWei = safeParseUnits(
        sellAmount,
        sellToken.decimals,
      ).toString();
      if (__DEV__)
        console.log("[useSwap fetchPrice] sellAmountWei:", sellAmountWei);

      // ── Step 2: build URL ───────────────────────────────────────────────────
      const sellAddr = resolveTokenAddress(sellToken);
      const buyAddr = resolveTokenAddress(buyToken);
      if (__DEV__)
        console.log("\n[useSwap fetchPrice] Step 2 — resolveTokenAddress");
      if (__DEV__) console.log("[useSwap fetchPrice] sellAddr:", sellAddr);
      if (__DEV__) console.log("[useSwap fetchPrice] buyAddr :", buyAddr);

      const params = new URLSearchParams({
        chainId: activeChain.id,
        sellToken: sellAddr,
        buyToken: buyAddr,
        sellAmount: sellAmountWei,
        slippagePercentage: slippage,
        ...(address && { takerAddress: address }),
      });

      const url = `${API_BASE_URL}/swap/price?${params}`;
      if (__DEV__) console.log("\n[useSwap fetchPrice] Step 3 — fetch");
      if (__DEV__) console.log("[useSwap fetchPrice] URL:", url);

      // ── Step 3: fetch ───────────────────────────────────────────────────────
      const res = await fetch(url, { signal: priceAbortRef.current.signal });

      if (__DEV__)
        console.log(
          "[useSwap fetchPrice] HTTP status:",
          res.status,
          res.statusText,
        );

      const json = await res.json();

      if (__DEV__)
        console.log("\n[useSwap fetchPrice] Step 4 — parse response");
      if (__DEV__)
        console.log("[useSwap fetchPrice] json.success     :", json.success);
      if (__DEV__)
        console.log(
          "[useSwap fetchPrice] json.error       :",
          json.error ?? "(none)",
        );
      if (__DEV__)
        console.log(
          "[useSwap fetchPrice] json.data keys   :",
          json.data ? Object.keys(json.data).join(", ") : "null",
        );
      if (__DEV__)
        console.log(
          "[useSwap fetchPrice] json.data.buyAmount :",
          json.data?.buyAmount,
          " type:",
          typeof json.data?.buyAmount,
        );
      if (__DEV__)
        console.log(
          "[useSwap fetchPrice] json.data.price     :",
          json.data?.price,
        );
      if (__DEV__)
        console.log(
          "[useSwap fetchPrice] json.data.issues    :",
          JSON.stringify(json.data?.issues ?? null),
        );

      if (!json.success) {
        throw new Error(json.error || "Failed to fetch price");
      }

      const data = json.data;
      setPriceInfo(data);

      // ── Step 4: format buy amount ───────────────────────────────────────────
      if (__DEV__) console.log("\n[useSwap fetchPrice] Step 5 — formatUnits");
      const buyDec = parseInt(buyToken.decimals, 10);
      const buyAmountStr = String(data.buyAmount);
      if (__DEV__) console.log("[useSwap fetchPrice] buyDec       :", buyDec);
      if (__DEV__)
        console.log(
          "[useSwap fetchPrice] buyAmountStr :",
          buyAmountStr,
          " type:",
          typeof buyAmountStr,
        );

      const formattedBuyAmount = formatUnits(buyAmountStr, buyDec);
      const estimate = parseFloat(formattedBuyAmount).toFixed(
        Math.min(buyDec, 6),
      );
      if (__DEV__)
        console.log(
          "[useSwap fetchPrice] formattedBuyAmount:",
          formattedBuyAmount,
        );
      if (__DEV__)
        console.log("[useSwap fetchPrice] estimate          :", estimate);

      setBuyAmountEstimate(estimate);
      if (__DEV__) console.log("\n[useSwap fetchPrice] ✅ SUCCESS");
    } catch (err) {
      if (err.name === "AbortError") {
        if (__DEV__)
          console.log(
            "[useSwap fetchPrice] aborted (new request superseded this one)",
          );
        return;
      }
      if (__DEV__) console.error("\n[useSwap fetchPrice] ❌ ERROR");
      if (__DEV__) console.error("[useSwap fetchPrice] name   :", err.name);
      if (__DEV__) console.error("[useSwap fetchPrice] message:", err.message);
      if (__DEV__) console.error("[useSwap fetchPrice] stack  :", err.stack);
      setError(err.message);
      setBuyAmountEstimate("");
      setPriceInfo(null);
    } finally {
      setIsFetchingPrice(false);
    }
  }, [sellToken, buyToken, sellAmount, slippage, activeChain?.id, address]);

  // ── Quote fetch ──────────────────────────────────────────────────────────────
  const fetchQuote = useCallback(async () => {
    if (__DEV__) console.log("\n[useSwap fetchQuote] ━━━ START ━━━");
    if (__DEV__)
      console.log(
        "[useSwap fetchQuote] sellToken  :",
        sellToken?.symbol,
        "decimals:",
        sellToken?.decimals,
      );
    if (__DEV__)
      console.log(
        "[useSwap fetchQuote] buyToken   :",
        buyToken?.symbol,
        "decimals:",
        buyToken?.decimals,
      );
    if (__DEV__) console.log("[useSwap fetchQuote] sellAmount :", sellAmount);

    if (!sellToken || !buyToken || !sellAmount || parseFloat(sellAmount) <= 0) {
      throw new Error("Invalid swap parameters");
    }

    if (quoteAbortRef.current) quoteAbortRef.current.abort();
    quoteAbortRef.current = new AbortController();

    try {
      setIsFetchingQuote(true);
      setError(null);

      const sellAmountWei = safeParseUnits(
        sellAmount,
        sellToken.decimals,
      ).toString();
      if (__DEV__)
        console.log("[useSwap fetchQuote] sellAmountWei:", sellAmountWei);

      const sellAddr = resolveTokenAddress(sellToken);
      const buyAddr = resolveTokenAddress(buyToken);

      const params = new URLSearchParams({
        chainId: activeChain.id,
        sellToken: sellAddr,
        buyToken: buyAddr,
        sellAmount: sellAmountWei,
        slippagePercentage: slippage,
        ...(address && { takerAddress: address }),
      });

      const url = `${API_BASE_URL}/swap/quote?${params}`;
      if (__DEV__) console.log("[useSwap fetchQuote] URL:", url);

      const res = await fetch(url, { signal: quoteAbortRef.current.signal });
      if (__DEV__) console.log("[useSwap fetchQuote] HTTP status:", res.status);

      const json = await res.json();
      if (__DEV__)
        console.log(
          "[useSwap fetchQuote] success:",
          json.success,
          " error:",
          json.error ?? "(none)",
        );
      if (__DEV__)
        console.log(
          "[useSwap fetchQuote] needsApproval:",
          json.data?.needsApproval,
        );
      if (__DEV__)
        console.log(
          "[useSwap fetchQuote] allowanceTarget:",
          json.data?.allowanceTarget,
        );
      if (__DEV__)
        console.log(
          "[useSwap fetchQuote] buyAmount:",
          json.data?.buyAmount,
          "type:",
          typeof json.data?.buyAmount,
        );

      if (!json.success) {
        throw new Error(json.error || "Failed to fetch quote");
      }

      setQuote(json.data);
      if (__DEV__) console.log("[useSwap fetchQuote] ✅ SUCCESS");
      return json.data;
    } catch (err) {
      if (err.name === "AbortError") return;
      if (__DEV__) console.error("[useSwap fetchQuote] ❌ ERROR:", err.message);
      setError(err.message);
      throw err;
    } finally {
      setIsFetchingQuote(false);
    }
  }, [sellToken, buyToken, sellAmount, slippage, activeChain?.id, address]);

  // ── Flip tokens ──────────────────────────────────────────────────────────────
  const flipTokens = useCallback(() => {
    if (__DEV__)
      console.log(
        "[useSwap flipTokens]",
        sellToken?.symbol,
        "↔",
        buyToken?.symbol,
      );
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
        const val = Math.max(0, parseFloat(balance) - 0.002);
        setSellAmount(val > 0 ? val.toFixed(6) : "0");
      } else {
        setSellAmount(balance);
      }
    },
    [sellToken],
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
    setSellAmount,
    flipTokens,
    setMaxAmount,
    quote,
    priceInfo,
    fetchQuote,
    fetchPrice,
    getExchangeRate,
    getPriceImpact,
    getSellUsdPrice,
    getBuyUsdPrice,
    slippage,
    setSlippage,
    tokenList,
    loadingTokens,
    searchTokens,
    loadTokens,
    isFetchingPrice,
    isFetchingQuote,
    isReadyToSwap,
    error,
    setError,
  };
}
