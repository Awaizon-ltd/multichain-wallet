// controllers/bridgeController.js
// ─────────────────────────────────────────────────────────────────────────────
// Cross-chain bridge, powered by LI.FI (replaces the old Mantle-only
// @mantleio/sdk OP-stack bridge). LI.FI aggregates many underlying bridges,
// so this works between ANY two chains it supports — including EVM chains
// added to this wallet (Ethereum, Arc, Robinhood Chain, Polygon, BNB Chain,
// Arbitrum, Avalanche, Base) and, when the client can sign for it, Solana.
//
// The app still signs and broadcasts locally — this controller only ever
// returns an unsigned transaction request for the client to sign.
// ─────────────────────────────────────────────────────────────────────────────

const { ethers } = require("ethers");
const lifiService = require("../services/lifiService");

const isValidAddress = (addr) =>
  typeof addr === "string" && (ethers.utils.isAddress(addr) || addr.length >= 32);

const isValidAmount = (amount) => {
  if (typeof amount !== "string" && typeof amount !== "number") return false;
  return /^\d+$/.test(String(amount)) && BigInt(amount) > 0n;
};

/* =========================================================
   GET /api/bridge/chains
   Chains LI.FI can actually route to/from right now — the app
   uses this to filter its "bridge to" picker.
========================================================= */
const getChains = async (_req, res, next) => {
  try {
    const chains = await lifiService.getChains();
    res.json({ success: true, chains });
  } catch (err) {
    next(err);
  }
};

/* =========================================================
   GET /api/bridge/quote
   Query: { fromChain, toChain, fromToken, toToken, fromAmount,
            fromAddress, toAddress?, slippage? }
   One endpoint covers both:
     • same-chain swap  (fromChain === toChain, different token)
     • cross-chain bridge (fromChain !== toChain, same or different token)
========================================================= */
const getQuote = async (req, res, next) => {
  try {
    const {
      fromChain,
      toChain,
      fromToken,
      toToken,
      fromAmount,
      fromAddress,
      toAddress,
      slippage,
    } = req.query;

    if (!fromChain || !toChain)
      return res
        .status(400)
        .json({ success: false, error: "fromChain and toChain are required" });

    if (!fromToken || !toToken)
      return res
        .status(400)
        .json({ success: false, error: "fromToken and toToken are required" });

    if (!isValidAmount(fromAmount))
      return res.status(400).json({
        success: false,
        error: "fromAmount must be a positive integer (base units)",
      });

    if (!fromAddress || !isValidAddress(fromAddress))
      return res
        .status(400)
        .json({ success: false, error: "Valid fromAddress is required" });

    const lifiQuote = await lifiService.getQuote({
      fromChain,
      toChain,
      fromToken,
      toToken,
      fromAmount,
      fromAddress,
      toAddress,
      slippage: slippage ? parseFloat(slippage) : undefined,
    });

    const normalized = lifiService.normalizeQuote(lifiQuote);

    res.json({ success: true, data: normalized, raw: lifiQuote });
  } catch (err) {
    if (err.response) {
      return res.status(err.response.status).json({
        success: false,
        error:
          err.response.data?.message ||
          err.response.data?.error ||
          "LI.FI could not find a route for this pair",
        details: err.response.data,
      });
    }
    next(err);
  }
};

/* =========================================================
   GET /api/bridge/connections
   Which (fromChain,toChain) pairs actually have a live route —
   used to grey out impossible picks in the chain picker.
========================================================= */
const getConnections = async (req, res, next) => {
  try {
    const { fromChain, toChain, fromToken, toToken } = req.query;
    const connections = await lifiService.getConnections({
      fromChain,
      toChain,
      fromToken,
      toToken,
    });
    res.json({ success: true, connections });
  } catch (err) {
    next(err);
  }
};

/* =========================================================
   GET /api/bridge/status
   Query: { txHash, bridge?, fromChain?, toChain? }
   Poll a submitted bridge tx through to delivery on the destination chain.
========================================================= */
const getStatus = async (req, res, next) => {
  try {
    const { txHash, bridge, fromChain, toChain } = req.query;

    if (!txHash)
      return res
        .status(400)
        .json({ success: false, error: "txHash is required" });

    const status = await lifiService.getStatus({
      txHash,
      bridge,
      fromChain,
      toChain,
    });

    res.json({ success: true, ...status });
  } catch (err) {
    if (err.response) {
      return res.status(err.response.status).json({
        success: false,
        error: err.response.data?.message || "Failed to fetch bridge status",
      });
    }
    next(err);
  }
};

module.exports = {
  getChains,
  getQuote,
  getConnections,
  getStatus,
};
