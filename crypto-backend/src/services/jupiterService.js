// services/jupiterService.js
// ─────────────────────────────────────────────────────────────────────────────
// Thin wrapper around Jupiter's Swap API (https://dev.jup.ag/docs/swap-api).
// Jupiter is the DEX aggregator for same-chain Solana swaps — the Solana
// equivalent of what 0x does for EVM chains in swapControllers.js.
//
//   1. GET  /swap/v1/quote → best route + amounts for an exact-in swap
//   2. POST /swap/v1/swap  → that route as an unsigned, base64 versioned
//                            transaction for the user's wallet to sign
//
// The app signs and broadcasts locally; nothing here ever holds a key.
// This is the ONLY place that talks to Jupiter.
// ─────────────────────────────────────────────────────────────────────────────

const axios = require("axios");

// api.jup.ag is the keyed host (free key from https://portal.jup.ag);
// lite-api.jup.ag is the keyless, lower-rate-limit host. Same API on both.
const JUPITER_API_KEY = process.env.JUPITER_API_KEY || "";
const JUPITER_BASE_URL =
  process.env.JUPITER_BASE_URL ||
  (JUPITER_API_KEY ? "https://api.jup.ag" : "https://lite-api.jup.ag");

const client = axios.create({
  baseURL: JUPITER_BASE_URL,
  timeout: 15000,
  headers: {
    accept: "application/json",
    ...(JUPITER_API_KEY ? { "x-api-key": JUPITER_API_KEY } : {}),
  },
});

// One retry on 429. Every wallet shares this backend's IP, so a burst of
// users can briefly trip Jupiter's rate limit — set JUPITER_API_KEY in
// production for a real quota instead of relying on this.
client.interceptors.response.use(undefined, async (error) => {
  const config = error.config;
  if (error.response?.status !== 429 || !config || config._retried) throw error;
  config._retried = true;
  const retryAfter = parseInt(error.response.headers?.["retry-after"], 10);
  const delayMs = Number.isFinite(retryAfter) ? Math.min(retryAfter, 3) * 1000 : 1000;
  await new Promise((r) => setTimeout(r, delayMs));
  return client.request(config);
});

// Priority fee cap for the swap tx. Jupiter picks a fee from recent network
// conditions; this only bounds the worst case (0.001 SOL).
const MAX_PRIORITY_FEE_LAMPORTS = parseInt(
  process.env.JUPITER_MAX_PRIORITY_FEE_LAMPORTS || "1000000",
  10,
);

/* =========================================================
   1. QUOTE
========================================================= */
const getQuote = async ({ inputMint, outputMint, amount, slippageBps = 50 }) => {
  const { data } = await client.get("/swap/v1/quote", {
    params: {
      inputMint,
      outputMint,
      amount,
      slippageBps,
      swapMode: "ExactIn",
      // Route only through liquid intermediate tokens — fewer failed swaps
      // from thin pools, at a negligible cost to price.
      restrictIntermediateTokens: true,
    },
  });
  return data;
};

/* =========================================================
   2. SWAP TRANSACTION
   Returns { swapTransaction (base64 VersionedTransaction),
             lastValidBlockHeight, prioritizationFeeLamports,
             computeUnitLimit, simulationError, ... }
========================================================= */
const buildSwapTransaction = async ({ quoteResponse, userPublicKey }) => {
  const { data } = await client.post("/swap/v1/swap", {
    quoteResponse,
    userPublicKey,
    wrapAndUnwrapSol: true,
    // Simulates to size the compute budget — also surfaces failures (e.g.
    // not enough SOL for rent/fees) as `simulationError` before signing.
    dynamicComputeUnitLimit: true,
    prioritizationFeeLamports: {
      priorityLevelWithMaxLamports: {
        maxLamports: MAX_PRIORITY_FEE_LAMPORTS,
        priorityLevel: "high",
      },
    },
  });
  return data;
};

/* =========================================================
   HELPER — normalize a Jupiter quote into the same field names the app
   already reads from 0x (`buyAmount`, `sellAmount`, `minBuyAmount`,
   `estimatedPriceImpact` as a percentage), plus Solana-specific extras.
========================================================= */
const normalizeQuote = (quote) => {
  // Jupiter's priceImpactPct is a fraction ("0.0012" = 0.12%); 0x reports
  // a percentage, which is what the swap screen formats.
  const impactFraction = parseFloat(quote.priceImpactPct);
  return {
    chainType: "solana",
    source: "jupiter",
    sellToken: quote.inputMint,
    buyToken: quote.outputMint,
    sellAmount: quote.inAmount,
    buyAmount: quote.outAmount,
    minBuyAmount: quote.otherAmountThreshold,
    slippageBps: quote.slippageBps,
    estimatedPriceImpact: Number.isFinite(impactFraction)
      ? (impactFraction * 100).toString()
      : null,
    route: (quote.routePlan || []).map((step) => ({
      label: step.swapInfo?.label,
      inputMint: step.swapInfo?.inputMint,
      outputMint: step.swapInfo?.outputMint,
      percent: step.percent,
    })),
  };
};

/** Best-effort message out of a Jupiter error response. */
const extractError = (data) => {
  if (!data) return "Jupiter could not process this swap";
  if (typeof data === "string") return data;
  return data.error || data.message || "Jupiter could not process this swap";
};

module.exports = {
  getQuote,
  buildSwapTransaction,
  normalizeQuote,
  extractError,
};
