// controllers/marketController.js
// Thin HTTP layer over services/marketService.js — all caching lives there.
"use strict";

const market = require("../services/marketService");

const COIN_ID = /^[a-z0-9][a-z0-9-]{0,99}$/;

// Let the app (and any CDN in front of us) reuse responses briefly too
const setCache = (res, seconds) =>
  res.set("Cache-Control", `public, max-age=${seconds}`);

const upstreamError = (err, next) => {
  const status = err.response?.status;
  if (status === 404) {
    const e = new Error("Token not found");
    e.statusCode = 404;
    return next(e);
  }
  if (status === 429) {
    const e = new Error("Market data is busy right now. Please try again shortly.");
    e.statusCode = 503;
    return next(e);
  }
  next(err);
};

exports.getTrending = async (_req, res, next) => {
  try {
    const data = await market.getTrending();
    setCache(res, 60);
    res.json({ success: true, data });
  } catch (err) {
    upstreamError(err, next);
  }
};

exports.getCoin = async (req, res, next) => {
  const { id } = req.params;
  if (!COIN_ID.test(id)) {
    return res.status(400).json({ success: false, message: "Invalid coin id" });
  }
  try {
    const data = await market.getCoin(id);
    setCache(res, 60);
    res.json({ success: true, data });
  } catch (err) {
    upstreamError(err, next);
  }
};

exports.getChart = async (req, res, next) => {
  const { id } = req.params;
  const days = parseInt(req.query.days ?? 7);
  if (!COIN_ID.test(id)) {
    return res.status(400).json({ success: false, message: "Invalid coin id" });
  }
  if (!market.CHART_DAYS.includes(days)) {
    return res.status(400).json({
      success: false,
      message: `days must be one of ${market.CHART_DAYS.join(", ")}`,
    });
  }
  try {
    const data = await market.getChart(id, days);
    setCache(res, 60);
    res.json({ success: true, data });
  } catch (err) {
    upstreamError(err, next);
  }
};

exports.resolve = async (req, res, next) => {
  const { chainId, address, symbol } = req.query;
  if (!chainId && !symbol) {
    return res
      .status(400)
      .json({ success: false, message: "chainId or symbol is required" });
  }
  try {
    const id = await market.resolveCoinId({ chainId, address, symbol });
    setCache(res, 3600);
    res.json({ success: true, data: { id } });
  } catch (err) {
    upstreamError(err, next);
  }
};

// GET /api/market/token-prices?chainId=8453&addresses=0xa,0xb  (max 100)
// Used by the browser extension's portfolio: one CoinGecko call per batch.
const PRICE_ADDRESS = /^(0x[a-fA-F0-9]{40}|[1-9A-HJ-NP-Za-km-z]{32,44})$/;
exports.getTokenPrices = async (req, res, next) => {
  const { chainId } = req.query;
  const addresses = String(req.query.addresses || "")
    .split(",")
    .map((a) => a.trim())
    .filter(Boolean);
  if (!chainId) {
    return res.status(400).json({ success: false, message: "chainId is required" });
  }
  if (addresses.length === 0 || addresses.length > 100 || !addresses.every((a) => PRICE_ADDRESS.test(a))) {
    return res
      .status(400)
      .json({ success: false, message: "addresses must be 1-100 token addresses" });
  }
  try {
    const data = await market.getTokenPrices({ chainId, addresses });
    setCache(res, 60);
    res.json({ success: true, data });
  } catch (err) {
    upstreamError(err, next);
  }
};

// GET /api/market/native-prices → { ethereum: { usd, usd_24h_change }, solana: {…}, … }
// Prices for every supported chain's native coin, for wallet portfolios.
exports.getNativePrices = async (req, res, next) => {
  try {
    const data = await market.getNativePrices();
    setCache(res, 60);
    res.json({ success: true, data });
  } catch (err) {
    upstreamError(err, next);
  }
};

// ── Advanced Swap: pair candles + on-chain token stats ───────────────────────
const pairChart = require("../services/pairChartService");

// 0x-address, base58 mint, "native", or (as a quote) "usd"
const TOKEN_ADDRESS = /^(native|usd|0x[a-fA-F0-9]{40}|[1-9A-HJ-NP-Za-km-z]{32,44})$/i;

const badParam = (res, message) =>
  res.status(400).json({ success: false, message });

// GET /api/market/pair/candles?baseChain=SOLANA&base=<mint>&quoteChain=8453&quote=<addr>&tf=1h
exports.getPairCandles = async (req, res, next) => {
  const { baseChain, base, quoteChain, quote, tf = "1h" } = req.query;
  if (!baseChain) return badParam(res, "baseChain is required");
  if (!TOKEN_ADDRESS.test(base || "") || !TOKEN_ADDRESS.test(quote || ""))
    return badParam(res, "base and quote must be token addresses, 'native', or (quote) 'usd'");
  try {
    const data = await pairChart.getPairCandles({ baseChain, base, quoteChain, quote, tf });
    setCache(res, 30);
    res.json({ success: true, data });
  } catch (err) {
    if (err.statusCode) return res.status(err.statusCode).json({ success: false, message: err.message });
    upstreamError(err, next);
  }
};

// GET /api/market/onchain/token?chainId=SOLANA&address=<mint>
exports.getTokenStats = async (req, res, next) => {
  const { chainId, address } = req.query;
  if (!chainId) return badParam(res, "chainId is required");
  if (!TOKEN_ADDRESS.test(address || ""))
    return badParam(res, "address must be a token address (or 'native')");
  try {
    const data = await pairChart.getTokenStats({ chainId, address });
    setCache(res, 60);
    res.json({ success: true, data });
  } catch (err) {
    if (err.statusCode) return res.status(err.statusCode).json({ success: false, message: err.message });
    upstreamError(err, next);
  }
};
