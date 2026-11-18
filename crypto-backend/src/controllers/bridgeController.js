// controllers/bridgeController.js
// ─────────────────────────────────────────────────────────────────────────────
// Cross-chain bridge, powered by LI.FI (replaces the old Mantle-only
// @mantleio/sdk OP-stack bridge). LI.FI aggregates many underlying bridges,
// so this works between ANY two chains it supports — including EVM chains
// added to this wallet (Ethereum, Arc, Robinhood Chain, Polygon, BNB Chain,
// Arbitrum, Avalanche, Base) and Solana, in either direction. Solana is
// addressed as "SOLANA" by the app and mapped to LI.FI's id here.
//
// The app still signs and broadcasts locally — this controller only ever
// returns an unsigned transaction request for the client to sign.
// ─────────────────────────────────────────────────────────────────────────────

const { ethers } = require("ethers");
const lifiService = require("../services/lifiService");
const {
  isSolanaChainId,
  isValidSolanaAddress,
  toLifiChainId,
  toLifiSolanaToken,
} = require("../utils/solana");

// Address must match the VM of the chain it's used on — an EVM address on
// the Solana side (or vice versa) is a route LI.FI would accept but funds
// could never arrive at.
const isValidAddressForChain = (addr, chainId) =>
  isSolanaChainId(chainId)
    ? isValidSolanaAddress(addr)
    : typeof addr === "string" && ethers.utils.isAddress(addr);

// The app sends native SOL as the wSOL mint; LI.FI wants its own native id.
const toLifiToken = (token, chainId) =>
  isSolanaChainId(chainId) ? toLifiSolanaToken(token) : token;

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

    if (!isValidAddressForChain(fromAddress, fromChain))
      return res.status(400).json({
        success: false,
        error: `Valid fromAddress is required for ${isSolanaChainId(fromChain) ? "Solana" : "an EVM chain"}`,
      });

    // Crossing between Solana and EVM, the sender's address can't receive
    // on the other side — the destination address has to be explicit.
    const crossesVm = isSolanaChainId(fromChain) !== isSolanaChainId(toChain);
    if ((toAddress || crossesVm) && !isValidAddressForChain(toAddress, toChain))
      return res.status(400).json({
        success: false,
        error: `Valid toAddress is required for ${isSolanaChainId(toChain) ? "Solana" : "an EVM chain"}`,
      });

    const lifiQuote = await lifiService.getQuote({
      fromChain: toLifiChainId(fromChain),
      toChain: toLifiChainId(toChain),
      fromToken: toLifiToken(fromToken, fromChain),
      toToken: toLifiToken(toToken, toChain),
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
      fromChain: fromChain && toLifiChainId(fromChain),
      toChain: toChain && toLifiChainId(toChain),
      fromToken: fromToken && toLifiToken(fromToken, fromChain),
      toToken: toToken && toLifiToken(toToken, toChain),
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
      txHash, // an EVM tx hash or a Solana signature
      bridge,
      fromChain: fromChain && toLifiChainId(fromChain),
      toChain: toChain && toLifiChainId(toChain),
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
