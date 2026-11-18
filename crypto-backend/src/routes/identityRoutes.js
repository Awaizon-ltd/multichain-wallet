// routes/identityRoutes.js
// Username identities proven by wallet signature — see services/identityService.js.
//
//   GET  /api/identity/check?username=&evm_address=   live availability
//   GET  /api/identity/by-address?address=            EVM or Solana → identity
//   GET  /api/identity/:username                      username → identity
//   POST /api/identity/challenge   { username, evm_address, solana_address }
//   POST /api/identity/bind        { nonce, evm_signature, solana_signature }
const express = require("express");
const router = express.Router();
const identity = require("../services/identityService");
const { rateLimiter } = require("../middleware/rateLimiter");

const send = (res, err, next) => {
  if (err.status && err.code) {
    return res.status(err.status).json({ success: false, code: err.code, message: err.message });
  }
  next(err);
};

const toPublic = (row) => ({
  username: row.username,
  evm_address: row.evm_address,
  solana_address: row.solana_address,
  verified_at: row.verified_at,
});

router.get("/check", async (req, res, next) => {
  try {
    const result = await identity.checkUsername(req.query.username, {
      evmAddress: req.query.evm_address,
    });
    res.json({ success: true, data: result });
  } catch (err) {
    send(res, err, next);
  }
});

router.get("/by-address", async (req, res, next) => {
  try {
    const row = await identity.getByAddress(req.query.address);
    if (!row) {
      return res.status(404).json({ success: false, code: "NOT_FOUND", message: "This wallet isn't linked to a username." });
    }
    res.json({ success: true, data: toPublic(row) });
  } catch (err) {
    send(res, err, next);
  }
});

router.post("/challenge", rateLimiter, async (req, res, next) => {
  try {
    const { username, evm_address, solana_address } = req.body || {};
    const challenge = await identity.createChallenge({
      username,
      evmAddress: evm_address,
      solanaAddress: solana_address,
    });
    res.status(201).json({ success: true, data: challenge });
  } catch (err) {
    send(res, err, next);
  }
});

// The signatures are passed straight into verification and go no further:
// not stored, not logged, not echoed back.
router.post("/bind", rateLimiter, async (req, res, next) => {
  try {
    const { nonce, evm_signature, solana_signature } = req.body || {};
    if (typeof nonce !== "string" || typeof evm_signature !== "string" || typeof solana_signature !== "string") {
      return res.status(400).json({ success: false, code: "MISSING_FIELDS", message: "nonce, evm_signature and solana_signature are required." });
    }
    const row = await identity.bindIdentity({
      nonce,
      evmSignature: evm_signature,
      solanaSignature: solana_signature,
    });
    res.status(201).json({ success: true, data: toPublic(row) });
  } catch (err) {
    send(res, err, next);
  }
});

router.get("/:username", async (req, res, next) => {
  try {
    const row = await identity.getByUsername(req.params.username);
    if (!row) {
      return res.status(404).json({ success: false, code: "NOT_FOUND", message: "No wallet is linked to that username." });
    }
    res.json({ success: true, data: toPublic(row) });
  } catch (err) {
    send(res, err, next);
  }
});

module.exports = router;
module.exports.toPublic = toPublic;
