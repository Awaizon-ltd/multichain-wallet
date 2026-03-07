const express = require("express");
const router = express.Router();
const tokenController = require("../controllers/tokenControllers");

// Get all tokens
router.get("/", tokenController.getAllTokens);

// Get available chains
router.get("/chains", tokenController.getChains);

// Search tokens
router.get("/search", tokenController.searchTokens);

// Get tokens by chain ID
router.get("/chain/:chainId", tokenController.getTokensByChain);

// Get tokens by chain name
router.get("/chain/name/:chainName", tokenController.getTokensByChainName);

// Find token by address on specific chain
router.get(
  "/chain/:chainId/address/:address",
  tokenController.getTokenByAddress,
);

// Find token by symbol on specific chain
router.get("/chain/:chainId/symbol/:symbol", tokenController.getTokenBySymbol);

// Reload token lists (for updates)
router.post("/reload", tokenController.reloadTokens);

module.exports = router;
