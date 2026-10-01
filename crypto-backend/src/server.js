// server.js
"use strict";

const dotenv = require("dotenv");
dotenv.config();

const express = require("express");
const cors = require("cors");
const compression = require("compression");

const app = express();
const PORT = process.env.PORT || 3000;

// ─── Middleware ───────────────────────────────────────────────────────────────
app.use(compression());
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ─── Routes ───────────────────────────────────────────────────────────────────
app.use("/api/tokens", require("./routes/tokenRoutes"));
app.use("/api/wallets", require("./routes/walletRoutes"));
app.use("/api/swap", require("./routes/swapRoutes"));
app.use("/api/swap", require("./routes/swapTrackingRoutes"));
app.use("/api/bridge", require("./routes/bridgeRoutes"));
app.use("/api/banners", require("./routes/bannerRoutes"));
app.use("/api/market", require("./routes/marketRoutes"));

// ─── Health check ─────────────────────────────────────────────────────────────
app.get("/", (_req, res) => {
  res.json({
    message: "Crypto Wallet Token Backend API",
    version: "1.2.0",
    status: "running",
  });
});

// ─── Error handler ────────────────────────────────────────────────────────────
app.use(require("./middleware/errorHandler"));

// ─── Process-level safety net ─────────────────────────────────────────────────
process.on("unhandledRejection", (reason) => {
  console.error("❌ Unhandled promise rejection:", reason);
});

// ─── Start ────────────────────────────────────────────────────────────────────
const server = app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Server running on port ${PORT}`);

  // Warm the trending cache now and keep it warm, so no app request ever
  // waits on CoinGecko for it.
  require("./services/marketService").startMarketRefresh();
});

const gracefulShutdown = (signal) => {
  console.log(`\n${signal} received — shutting down…`);
  server.close(() => {
    console.log("✅ HTTP server closed");
    process.exit(0);
  });
};

process.once("SIGINT", () => gracefulShutdown("SIGINT"));
process.once("SIGTERM", () => gracefulShutdown("SIGTERM"));
