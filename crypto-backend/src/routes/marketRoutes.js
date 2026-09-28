// routes/marketRoutes.js — cached CoinGecko market data for the app
const express = require("express");
const router = express.Router();
const market = require("../controllers/marketController");

router.get("/trending", market.getTrending);
router.get("/resolve", market.resolve);
router.get("/coins/:id", market.getCoin);
router.get("/coins/:id/chart", market.getChart);

module.exports = router;
