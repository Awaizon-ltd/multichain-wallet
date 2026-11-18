// routes/marketRoutes.js — cached CoinGecko market data for the app
const express = require("express");
const router = express.Router();
const market = require("../controllers/marketController");

router.get("/trending", market.getTrending);
router.get("/resolve", market.resolve);
router.get("/token-prices", market.getTokenPrices);
router.get("/native-prices", market.getNativePrices);
router.get("/coins/:id", market.getCoin);
router.get("/coins/:id/chart", market.getChart);

// Advanced Swap — any pair (incl. cross-chain), plus on-chain token stats
router.get("/pair/candles", market.getPairCandles);
router.get("/onchain/token", market.getTokenStats);

module.exports = router;
