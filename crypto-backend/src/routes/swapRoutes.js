const express = require("express");
const router = express.Router();
const {
  getPrice,
  getQuote,
  getTokens,
  getBestPrice,
} = require("../controllers/swapControllers");
const { rateLimiter } = require("../middleware/rateLimiter");

// GET /api/swap/tokens?chainId=1&search=ETH
router.get("/tokens", getTokens);

// GET /api/swap/price?chainId=1&sellToken=ETH&buyToken=USDC&sellAmount=1000000000000000000
router.get("/price", rateLimiter, getPrice);

// GET /api/swap/price/best — aggregates 0x + LI.FI, returns whichever quotes more
router.get("/price/best", rateLimiter, getBestPrice);

// GET /api/swap/quote?chainId=1&sellToken=ETH&buyToken=USDC&sellAmount=1000000000000000000&takerAddress=0x...
router.get("/quote", rateLimiter, getQuote);

module.exports = router;
