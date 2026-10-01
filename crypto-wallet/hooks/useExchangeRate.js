/**
 * hooks/useExchangeRate.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Provides live fiat ↔ token exchange rates for the Payment screen's
 * fiat-first amount input.
 *
 * PHASE 0: Uses static fallback rates (no network call required to ship).
 *          The fetch is attempted but silently falls back on failure.
 *
 * PHASE 1: Replace RATE_API_URL with your preferred oracle/aggregator:
 *          - CoinGecko free tier:  https://api.coingecko.com/api/v3/simple/price
 *          - CoinMarketCap API
 *          - Your own backend rate service
 *          - Chainlink on-chain price feeds (via a simple eth_call)
 *
 * Usage:
 *   const { rate, loading, error, refresh } = useExchangeRate("USDC", "NGN");
 *   // rate = 1 USDC → X NGN
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { useState, useEffect, useRef, useCallback } from "react";

// ─────────────────────────────────────────────────────────────────────────────
// Static fallback rates (PHASE 0 — update these periodically or replace with live)
// format: { [tokenSymbol]: { [fiatCode]: rate } }
// rate means: 1 token = X fiat units
// ─────────────────────────────────────────────────────────────────────────────
const FALLBACK_RATES = {
  USDC: { USD: 1.0, NGN: 1580, EUR: 0.92, GBP: 0.79 },
  USDT: { USD: 1.0, NGN: 1580, EUR: 0.92, GBP: 0.79 },
  DAI: { USD: 1.0, NGN: 1580, EUR: 0.92, GBP: 0.79 },
  BUSD: { USD: 1.0, NGN: 1580, EUR: 0.92, GBP: 0.79 },
  PYUSD: { USD: 1.0, NGN: 1580, EUR: 0.92, GBP: 0.79 },
  ETH: { USD: 3400, NGN: 5372000, EUR: 3128, GBP: 2686 },
  BNB: { USD: 580, NGN: 916400, EUR: 533.6, GBP: 458.2 },
  POL: { USD: 0.58, NGN: 916, EUR: 0.53, GBP: 0.46 },
  MATIC: { USD: 0.58, NGN: 916, EUR: 0.53, GBP: 0.46 },
  AVAX: { USD: 35, NGN: 55300, EUR: 32.2, GBP: 27.65 },
};

// ─────────────────────────────────────────────────────────────────────────────
// PHASE 1: Replace with real rate source
// CoinGecko ID map: { symbol → coingecko_id }
// ─────────────────────────────────────────────────────────────────────────────
const COINGECKO_IDS = {
  USDC: "usd-coin",
  USDT: "tether",
  DAI: "dai",
  ETH: "ethereum",
  BNB: "binancecoin",
  POL: "polygon-ecosystem-token",
  MATIC: "polygon-ecosystem-token",
  AVAX: "avalanche-2",
};

const CACHE_TTL_MS = 3 * 60 * 1000; // 3 minutes
const rateCache = {}; // in-memory cache across hook instances

const fetchLiveRate = async (tokenSymbol, fiatCurrency) => {
  const cacheKey = `${tokenSymbol}_${fiatCurrency}`;
  const now = Date.now();

  if (rateCache[cacheKey] && now - rateCache[cacheKey].ts < CACHE_TTL_MS) {
    return rateCache[cacheKey].rate;
  }

  const geckoId = COINGECKO_IDS[tokenSymbol.toUpperCase()];
  if (!geckoId) return null;

  const fiatLower = fiatCurrency.toLowerCase();
  const url = `https://api.coingecko.com/api/v3/simple/price?ids=${geckoId}&vs_currencies=${fiatLower}`;

  const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
  if (!res.ok) throw new Error(`Rate fetch failed: ${res.status}`);

  const data = await res.json();
  const rate = data[geckoId]?.[fiatLower];
  if (!rate) throw new Error("Rate not in response");

  rateCache[cacheKey] = { rate, ts: now };
  return rate;
};

// ─────────────────────────────────────────────────────────────────────────────
// The hook
// ─────────────────────────────────────────────────────────────────────────────
export const useExchangeRate = (tokenSymbol, fiatCurrency = "NGN") => {
  const [rate, setRate] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [source, setSource] = useState("fallback"); // "live" | "fallback" | "cached"
  const mountedRef = useRef(true);

  const loadRate = useCallback(async () => {
    if (!tokenSymbol || !fiatCurrency) return;

    const sym = tokenSymbol.toUpperCase();
    const fiat = fiatCurrency.toUpperCase();

    // Always seed with fallback immediately so UI is responsive
    const fallback = FALLBACK_RATES[sym]?.[fiat] ?? null;
    if (fallback !== null) {
      setRate(fallback);
      setSource("fallback");
    }

    setLoading(true);
    setError(null);

    try {
      const live = await fetchLiveRate(sym, fiat);
      if (mountedRef.current && live !== null) {
        setRate(live);
        setSource("live");
      }
    } catch (err) {
      // Live fetch failed — fallback already set, just mark the error silently
      if (mountedRef.current) {
        setError("Using estimated rate — live price unavailable");
        setSource("fallback");
      }
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [tokenSymbol, fiatCurrency]);

  useEffect(() => {
    mountedRef.current = true;
    loadRate();

    // Refresh every 3 minutes while screen is open
    const interval = setInterval(loadRate, CACHE_TTL_MS);

    return () => {
      mountedRef.current = false;
      clearInterval(interval);
    };
  }, [loadRate]);

  // Convert fiat → token
  const fiatToToken = useCallback(
    (fiatAmount) => {
      if (!rate || !fiatAmount) return null;
      const num = parseFloat(fiatAmount);
      if (isNaN(num) || num <= 0) return null;
      return (num / rate).toFixed(6);
    },
    [rate],
  );

  // Convert token → fiat
  const tokenToFiat = useCallback(
    (tokenAmount) => {
      if (!rate || !tokenAmount) return null;
      const num = parseFloat(tokenAmount);
      if (isNaN(num) || num <= 0) return null;
      return (num * rate).toFixed(2);
    },
    [rate],
  );

  return {
    rate, // 1 token = X fiat
    loading,
    error,
    source, // "live" | "fallback" | "cached"
    refresh: loadRate,
    fiatToToken,
    tokenToFiat,
  };
};
