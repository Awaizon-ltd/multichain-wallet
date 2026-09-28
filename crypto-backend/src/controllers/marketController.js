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
