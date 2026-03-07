const express = require("express");
const router = express.Router();

const {
  bindWallet,
  resolveWallet,
  resolveByWalletAddress,
  isValidWalletAddress,
} = require("../services/walletService");
const {
  validateBind,
  validateResolve,
} = require("../middleware/validateWallet");

// ────────────────────────────────────────────────────────
// POST /api/wallets/bind
// Body: { username, email, wallet_address }
// ────────────────────────────────────────────────────────
router.post("/bind", validateBind, async (req, res, next) => {
  const { username, email, wallet_address } = req.validatedBody;

  if (!isValidWalletAddress(wallet_address)) {
    return res.status(422).json({
      success: false,
      code: "INVALID_WALLET_FORMAT",
      message:
        "Wallet address must be a valid EVM address (0x + 40 hex characters).",
    });
  }

  try {
    const user = await bindWallet({ username, email, wallet_address });
    return res.status(201).json({
      success: true,
      message: "Wallet bound successfully.",
      data: user,
    });
  } catch (err) {
    if (err.status && err.code) {
      return res.status(err.status).json({
        success: false,
        code: err.code,
        message: err.message,
      });
    }
    next(err);
  }
});

// ────────────────────────────────────────────────────────
// GET /api/wallets/resolve?email_or_username=
// Resolve wallet by username or email
// ────────────────────────────────────────────────────────
router.get("/resolve", validateResolve, async (req, res, next) => {
  const { email_or_username } = req.validatedQuery;
  try {
    const user = await resolveWallet(email_or_username);
    if (!user) {
      return res.status(404).json({
        success: false,
        code: "NOT_FOUND",
        message: "No wallet found for the given email or username.",
      });
    }
    return res.status(200).json({ success: true, data: user });
  } catch (err) {
    next(err);
  }
});

// ────────────────────────────────────────────────────────
// GET /api/wallets/resolve-by-address?wallet_address=
// Resolve user identity from a wallet address.
// Used by the app on screen load to check if THIS wallet is already bound.
// ────────────────────────────────────────────────────────
router.get("/resolve-by-address", async (req, res, next) => {
  const { wallet_address } = req.query;

  if (!wallet_address || typeof wallet_address !== "string") {
    return res.status(400).json({
      success: false,
      code: "MISSING_PARAM",
      message: "`wallet_address` query param is required.",
    });
  }

  if (!isValidWalletAddress(wallet_address.trim())) {
    return res.status(422).json({
      success: false,
      code: "INVALID_WALLET_FORMAT",
      message: "Must be a valid EVM address (0x + 40 hex characters).",
    });
  }

  try {
    const user = await resolveByWalletAddress(wallet_address);
    if (!user) {
      return res.status(404).json({
        success: false,
        code: "NOT_FOUND",
        message: "This wallet address is not bound to any identity.",
      });
    }
    return res.status(200).json({ success: true, data: user });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
