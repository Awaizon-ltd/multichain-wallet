// routes/walletRoutes.js
// Legacy username lookups, kept for the app's Send / payment-request screens
// (they read `data.wallet_address`). They now resolve through signature-
// verified identities (routes/identityRoutes.js) — never through the old
// unverified `users` table — and only by username: email binding is gone.
const express = require("express");
const router = express.Router();
const identity = require("../services/identityService");

// Same shape the app already reads, plus the Solana address
const legacyShape = (row) => ({
  username: row.username,
  wallet_address: row.evm_address,
  evm_address: row.evm_address,
  solana_address: row.solana_address,
  verified_at: row.verified_at,
});

const notFound = (res, message) =>
  res.status(404).json({ success: false, code: "NOT_FOUND", message });

// POST /api/wallets/bind — retired: binding now requires a signature
router.post("/bind", (_req, res) =>
  res.status(410).json({
    success: false,
    code: "ENDPOINT_RETIRED",
    message: "Linking now requires proving wallet ownership. Use /api/identity/challenge and /api/identity/bind.",
  }),
);

// GET /api/wallets/resolve?email_or_username=   (username only now)
router.get("/resolve", async (req, res, next) => {
  const value = String(req.query.email_or_username ?? "").trim();
  if (!value) {
    return res.status(400).json({ success: false, code: "MISSING_PARAM", message: "A username is required." });
  }
  if (value.includes("@") && !value.startsWith("@")) {
    return notFound(res, "Email lookup is no longer supported — use the recipient's username.");
  }
  try {
    const row = await identity.getByUsername(value);
    if (!row) return notFound(res, "No wallet is linked to that username.");
    res.json({ success: true, data: legacyShape(row) });
  } catch (err) {
    next(err);
  }
});

// GET /api/wallets/resolve-by-address?wallet_address=   (EVM or Solana)
router.get("/resolve-by-address", async (req, res, next) => {
  try {
    const row = await identity.getByAddress(req.query.wallet_address);
    if (!row) return notFound(res, "This wallet isn't linked to a username.");
    res.json({ success: true, data: legacyShape(row) });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
