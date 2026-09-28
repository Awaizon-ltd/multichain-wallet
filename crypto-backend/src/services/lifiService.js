// services/lifiService.js
// ─────────────────────────────────────────────────────────────────────────────
// Thin wrapper around the LI.FI REST API (https://li.quest/v1).
// LI.FI aggregates bridges + DEXs so it can quote both:
//   • same-chain swaps        (fromChain === toChain)
//   • cross-chain bridges/swaps (fromChain !== toChain, any token on either side)
// This is the ONLY place that talks to LI.FI — controllers call these functions.
// ─────────────────────────────────────────────────────────────────────────────

const axios = require("axios");

const LIFI_BASE_URL = "https://li.quest/v1";

const getHeaders = () => {
  const headers = { accept: "application/json" };
  if (process.env.LIFI_API_KEY) headers["x-lifi-api-key"] = process.env.LIFI_API_KEY;
  return headers;
};

const client = axios.create({
  baseURL: LIFI_BASE_URL,
  timeout: 15000,
  headers: getHeaders(),
});

const FEE_ENABLED = process.env.LIFI_FEE_ENABLED === "1";
const INTEGRATOR = process.env.LIFI_INTEGRATOR || "zela-pay";
// LI.FI fee is expressed as a fraction of the amount (e.g. 0.003 = 0.3%)
const LIFI_FEE_FRACTION = "0.003";

/* =========================================================
   1. SUPPORTED CHAINS
   GET /chains — used to validate the app's chain list against
   what LI.FI can actually route (Arc + Robinhood Chain are both
   live on LI.FI as of their respective mainnet launches).
========================================================= */
const getChains = async () => {
  const { data } = await client.get("/chains");
  return data.chains || [];
};

/* =========================================================
   2. QUOTE
   GET /quote — covers same-chain swaps AND cross-chain bridges/swaps
   in a single call. The response's `transactionRequest` is what the
   app signs; `estimate.approvalAddress` is the ERC20 allowance target.
========================================================= */
const getQuote = async ({
  fromChain,
  toChain,
  fromToken,
  toToken,
  fromAmount,
  fromAddress,
  toAddress,
  slippage = 0.005,
  order = "RECOMMENDED", // RECOMMENDED | FASTEST | CHEAPEST | SAFEST
}) => {
  const params = {
    fromChain,
    toChain,
    fromToken,
    toToken,
    fromAmount,
    fromAddress,
    toAddress: toAddress || fromAddress,
    slippage,
    order,
    integrator: INTEGRATOR,
  };

  if (FEE_ENABLED) params.fee = LIFI_FEE_FRACTION;

  const { data } = await client.get("/quote", { params });
  return data;
};

/* =========================================================
   3. STATUS
   GET /status — poll a submitted cross-chain tx through to
   completion on the destination chain.
========================================================= */
const getStatus = async ({ txHash, bridge, fromChain, toChain }) => {
  const params = { txHash };
  if (bridge) params.bridge = bridge;
  if (fromChain) params.fromChain = fromChain;
  if (toChain) params.toChain = toChain;

  const { data } = await client.get("/status", { params });
  return data;
};

/* =========================================================
   4. CONNECTIONS
   GET /connections — which (fromChain,toChain,token) routes actually
   exist. Used to filter the app's "bridge to" chain picker so the user
   never gets stuck picking a route that doesn't exist yet.
========================================================= */
const getConnections = async ({ fromChain, toChain, fromToken, toToken }) => {
  const params = {};
  if (fromChain) params.fromChain = fromChain;
  if (toChain) params.toChain = toChain;
  if (fromToken) params.fromToken = fromToken;
  if (toToken) params.toToken = toToken;

  const { data } = await client.get("/connections", { params });
  return data.connections || [];
};

/* =========================================================
   HELPER — normalize a LI.FI quote into the same shape the app
   already understands from 0x (`swapControllers.getQuote`):
   { transaction, needsApproval, allowanceTarget, buyAmount, sellAmount }
   This lets the frontend sign/execute LI.FI and 0x quotes identically.
========================================================= */
const normalizeQuote = (lifiQuote) => {
  const tx = lifiQuote.transactionRequest || {};
  const approvalAddress = lifiQuote.estimate?.approvalAddress || null;

  return {
    source: "lifi",
    tool: lifiQuote.tool,
    toolDetails: lifiQuote.toolDetails,
    fromChainId: lifiQuote.action?.fromChainId,
    toChainId: lifiQuote.action?.toChainId,
    sellToken: lifiQuote.action?.fromToken?.address,
    buyToken: lifiQuote.action?.toToken?.address,
    sellAmount: lifiQuote.estimate?.fromAmount,
    buyAmount: lifiQuote.estimate?.toAmount,
    buyAmountMin: lifiQuote.estimate?.toAmountMin,
    estimatedDurationSeconds: lifiQuote.estimate?.executionDuration ?? null,
    gasCostUsd: lifiQuote.estimate?.gasCosts?.[0]?.amountUSD ?? null,
    feeCostUsd: lifiQuote.estimate?.feeCosts?.[0]?.amountUSD ?? null,
    needsApproval: !!approvalAddress,
    allowanceTarget: approvalAddress,
    transaction: {
      to: tx.to,
      data: tx.data,
      value: tx.value || "0x0",
      gasLimit: tx.gasLimit,
      gasPrice: tx.gasPrice,
      chainId: tx.chainId,
    },
    // Needed later to poll GET /status
    statusParams: {
      bridge: lifiQuote.tool,
      fromChain: lifiQuote.action?.fromChainId,
      toChain: lifiQuote.action?.toChainId,
    },
  };
};

module.exports = {
  getChains,
  getQuote,
  getStatus,
  getConnections,
  normalizeQuote,
};
