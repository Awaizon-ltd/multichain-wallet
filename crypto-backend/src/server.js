const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ─── Routes ────────────────────────────────────────────────────────────────
const tokenRoutes = require("./routes/tokenRoutes");
const walletRoutes = require("./routes/walletRoutes");
const swapRoutes = require("./routes/swapRoutes");
const swapTrackingRoutes = require("./routes/swapTrackingRoutes"); // ← NEW

app.use("/api/tokens", tokenRoutes);
app.use("/api/wallets", walletRoutes);
app.use("/api/swap", swapRoutes);
app.use("/api/swap", swapTrackingRoutes); // ← NEW  (shares /api/swap prefix)

// ─── Health check ──────────────────────────────────────────────────────────
app.get("/", (req, res) => {
  res.json({
    message: "Crypto Wallet Token Backend API",
    version: "1.0.0",
    status: "running",
  });
});

// ─── Error handler ─────────────────────────────────────────────────────────
const errorHandler = require("./middleware/errorHandler");
app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📍 http://localhost:${PORT}`);
  console.log(
    `🔑 0x API key: ${process.env.ZERO_EX_API_KEY ? "✅ set" : "❌ missing – add ZERO_EX_API_KEY to .env"}`,
  );
});
