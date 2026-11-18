// hooks/usePairMarket.js
// Market data for Advanced Swap: candles for base/quote (any two tokens, any
// two chains — the backend divides the two USD series when needed), each
// leg's own USD candles for the side-by-side view, and on-chain stats.
//
// Backend responses are cached briefly (stale-while-revalidate via
// apiClient), so switching timeframes or pairs back and forth repaints
// instantly; a 30s poll keeps the open chart live while the screen is focused.
import { useCallback, useEffect, useRef, useState } from "react";
import { useIsFocused } from "@react-navigation/native";
import { apiGet } from "../services/apiClient";
import { API_CONFIG } from "../config/api";

const CANDLE_TTL = 30_000;
const STATS_TTL = 60_000;
const POLL_MS = 30_000;

/** A pair side → the backend's token reference ("native", "usd" or an address). */
export const marketRef = (side) => {
  if (!side) return null;
  if (side.usd) return "usd";
  if (side.token?.isNative && side.chain?.type !== "solana") return "native";
  return side.token?.address ?? null;
};

const candlesFor = (baseSide, quoteSide, tf, ttl) =>
  apiGet(API_CONFIG.ENDPOINTS.MARKET_PAIR_CANDLES, {
    ttl,
    params: {
      baseChain: baseSide.chain.id,
      base: marketRef(baseSide),
      quoteChain: quoteSide.usd ? baseSide.chain.id : quoteSide.chain.id,
      quote: marketRef(quoteSide),
      tf,
    },
  }).then((json) => json.data);

const statsFor = (side) =>
  side?.usd
    ? Promise.resolve(null)
    : apiGet(API_CONFIG.ENDPOINTS.MARKET_ONCHAIN_TOKEN, {
        ttl: STATS_TTL,
        params: { chainId: side.chain.id, address: marketRef(side) },
      }).then((json) => json.data);

/**
 * @param {object} base  { chain, token } — what's being priced
 * @param {object} quote { chain, token } | { usd: true } — what it's priced in
 * @param {string} tf    15m | 1h | 4h | 1d
 * @param {object} opts  { compare: boolean } — also load each leg vs USD
 */
export default function usePairMarket(base, quote, tf, { compare = false } = {}) {
  const focused = useIsFocused();
  const [pair, setPair] = useState(null); // { candles, synthetic, quoteIsUsd }
  const [legs, setLegs] = useState({ base: null, quote: null }); // USD candles
  const [stats, setStats] = useState({ base: null, quote: null });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const runRef = useRef(0);

  const baseKey = base ? `${base.chain.id}:${marketRef(base)}` : "";
  const quoteKey = quote ? (quote.usd ? "usd" : `${quote.chain.id}:${marketRef(quote)}`) : "";
  const ready = !!base && !!quote && !!marketRef(base) && !!marketRef(quote);

  const load = useCallback(
    async ({ quiet = false } = {}) => {
      if (!ready) return;
      const run = ++runRef.current;
      if (!quiet) {
        setLoading(true);
        setError(null);
      }
      const usd = { usd: true };
      const [p, sBase, sQuote, lBase, lQuote] = await Promise.allSettled([
        candlesFor(base, quote, tf, CANDLE_TTL),
        statsFor(base),
        statsFor(quote),
        compare && !quote.usd ? candlesFor(base, usd, tf, CANDLE_TTL) : Promise.resolve(null),
        compare && !quote.usd ? candlesFor(quote, usd, tf, CANDLE_TTL) : Promise.resolve(null),
      ]);
      if (run !== runRef.current) return; // a newer pair/timeframe superseded this

      if (p.status === "fulfilled") setPair(p.value);
      else if (!quiet) {
        setPair(null);
        setError(p.reason?.message || "Chart unavailable for this pair");
      }
      setStats({
        base: sBase.status === "fulfilled" ? sBase.value : null,
        quote: sQuote.status === "fulfilled" ? sQuote.value : null,
      });
      setLegs({
        base: lBase.status === "fulfilled" ? lBase.value : null,
        quote: lQuote.status === "fulfilled" ? lQuote.value : null,
      });
      setLoading(false);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [baseKey, quoteKey, tf, compare, ready],
  );

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!focused || !ready) return;
    const id = setInterval(() => load({ quiet: true }), POLL_MS);
    return () => clearInterval(id);
  }, [focused, ready, load]);

  return { pair, legs, stats, loading, error, reload: load };
}
