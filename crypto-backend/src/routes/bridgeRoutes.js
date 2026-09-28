// routes/bridgeRoutes.js
// LI.FI-powered cross-chain bridge (any chain → any chain LI.FI supports).
const express = require("express");
const router = express.Router();
const controller = require("../controllers/bridgeController");
const { rateLimiter } = require("../middleware/rateLimiter");

// ── Supported chains ───────────────────────────────────────────────────────
// GET /api/bridge/chains
router.get("/chains", controller.getChains);

// ── Live routes ────────────────────────────────────────────────────────────
// GET /api/bridge/connections?fromChain=1&toChain=4663
router.get("/connections", controller.getConnections);

// ── Quote (bridge + cross-chain swap in one call) ─────────────────────────
// GET /api/bridge/quote?fromChain=1&toChain=4663&fromToken=0x...&toToken=0x...&fromAmount=...&fromAddress=0x...
router.get("/quote", rateLimiter, controller.getQuote);

// ── Status ─────────────────────────────────────────────────────────────────
// GET /api/bridge/status?txHash=0x...&fromChain=1&toChain=4663
router.get("/status", rateLimiter, controller.getStatus);

module.exports = router;
