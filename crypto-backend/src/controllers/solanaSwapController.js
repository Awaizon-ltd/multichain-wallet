// controllers/solanaSwapController.js
// ─────────────────────────────────────────────────────────────────────────────
// Same-chain Solana swaps via Jupiter. Not mounted on its own routes: the
// existing /api/swap/{tokens,price,price/best,quote} handlers in
// swapControllers.js dispatch here when `chainId` is Solana, so the app calls
// the exact same endpoints for every chain.
//
// Response shapes mirror the 0x ones (buyAmount, sellAmount, minBuyAmount,
// estimatedPriceImpact, needsApproval) with `chainType: "solana"` added, and
// the quote's `transaction` is a base64 versioned transaction instead of
// { to, data, value }. SPL tokens never need an approval step.
// ─────────────────────────────────────────────────────────────────────────────

const jupiterService = require("../services/jupiterService");
const {
  SOLANA_APP_CHAIN_ID,
  WSOL_MINT,
  isValidSolanaAddress,
  toJupiterMint,
} = require("../utils/solana");

const SOLANA_TOKENS = require("../tokens/solana.json");

const NATIVE_SOL = {
  name: "Solana",
  symbol: "SOL",
  address: WSOL_MINT,
  decimals: 9,
  chainId: SOLANA_APP_CHAIN_ID,
  isNative: true,
  logoURI:
    "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/solana/info/logo.png",
};

// SOL first, then the curated SPL list. solana.json's own wSOL entry is
// dropped (native SOL already covers it), and every entry is re-tagged with
// the app's chain id so token.chainId === chain.id comparisons hold.
const TOKEN_LIST = [
  NATIVE_SOL,
  ...SOLANA_TOKENS.filter((t) => t.address !== WSOL_MINT).map((t) => ({
    ...t,
    chainId: SOLANA_APP_CHAIN_ID,
  })),
];

const toSlippageBps = (percentage) =>
  Math.max(1, Math.round(parseFloat(percentage) * 10000));

// Shared validation for price + quote. Returns an error string or null.
const validateSwapParams = ({ sellToken, buyToken, sellAmount }) => {
  if (!sellToken || !buyToken || !sellAmount)
    return "sellToken, buyToken, and sellAmount are required";
  if (!/^\d+$/.test(String(sellAmount)) || BigInt(sellAmount) <= 0n)
    return "sellAmount must be a positive integer (base units)";
  const sell = toJupiterMint(sellToken);
  const buy = toJupiterMint(buyToken);
  if (!isValidSolanaAddress(sell) || !isValidSolanaAddress(buy))
    return "sellToken and buyToken must be Solana mint addresses";
  if (sell === buy) return "sellToken and buyToken must differ";
  return null;
};

const fetchJupiterQuote = ({ sellToken, buyToken, sellAmount, slippagePercentage }) =>
  jupiterService.getQuote({
    inputMint: toJupiterMint(sellToken),
    outputMint: toJupiterMint(buyToken),
    amount: String(sellAmount),
    slippageBps: toSlippageBps(slippagePercentage ?? 0.01),
  });

const sendJupiterError = (err, res, next) => {
  if (err.response) {
    return res.status(err.response.status).json({
      success: false,
      error: jupiterService.extractError(err.response.data),
      details: err.response.data,
    });
  }
  next(err);
};

/* =========================================================
   GET /api/swap/tokens?chainId=SOLANA&search=
========================================================= */
const getTokens = (req, res) => {
  let tokens = TOKEN_LIST;
  const { search } = req.query;
  if (search) {
    const q = search.trim();
    const lower = q.toLowerCase();
    tokens = tokens.filter(
      (t) =>
        t.symbol.toLowerCase().includes(lower) ||
        t.name.toLowerCase().includes(lower) ||
        t.address === q, // mints are case-sensitive
    );
  }
  res.json({ success: true, data: { tokens, chainId: SOLANA_APP_CHAIN_ID } });
};

/* =========================================================
   GET /api/swap/price?chainId=SOLANA&sellToken=&buyToken=&sellAmount=
   Indicative price — no wallet needed.
========================================================= */
const getPrice = async (req, res, next) => {
  try {
    const invalid = validateSwapParams(req.query);
    if (invalid) return res.status(400).json({ success: false, error: invalid });

    const quote = await fetchJupiterQuote(req.query);
    const normalized = jupiterService.normalizeQuote(quote);

    res.json({
      success: true,
      data: {
        ...normalized,
        chainId: SOLANA_APP_CHAIN_ID,
        price:
          Number(quote.inAmount) > 0
            ? (Number(quote.outAmount) / Number(quote.inAmount)).toString()
            : null,
      },
    });
  } catch (err) {
    sendJupiterError(err, res, next);
  }
};

/* =========================================================
   GET /api/swap/quote?chainId=SOLANA&...&takerAddress=<base58>
   Firm quote + the unsigned swap transaction for the taker to sign.
========================================================= */
const getQuote = async (req, res, next) => {
  try {
    const invalid = validateSwapParams(req.query);
    if (invalid) return res.status(400).json({ success: false, error: invalid });

    const taker = req.query.taker || req.query.takerAddress;
    if (!isValidSolanaAddress(taker)) {
      return res.status(400).json({
        success: false,
        error: "A valid Solana takerAddress is required for a swap quote",
      });
    }

    const quote = await fetchJupiterQuote(req.query);
    const swap = await jupiterService.buildSwapTransaction({
      quoteResponse: quote,
      userPublicKey: taker,
    });

    // Jupiter simulated the transaction and it failed (most often: not
    // enough SOL to cover fees + token-account rent). Signing it would only
    // burn a fee on-chain, so fail here with the reason instead.
    if (swap.simulationError) {
      const sim = swap.simulationError;
      const raw = (typeof sim === "string" ? sim : sim.error) || "";
      const noFunds = /prior credit|insufficient (lamports|funds)/i.test(raw);
      return res.status(422).json({
        success: false,
        error: noFunds
          ? "Not enough SOL to cover this swap plus network fees."
          : raw ||
            "This swap would fail on-chain. Check your SOL balance covers network fees.",
        details: sim,
      });
    }

    res.json({
      success: true,
      data: {
        ...jupiterService.normalizeQuote(quote),
        chainId: SOLANA_APP_CHAIN_ID,
        needsApproval: false,
        allowanceTarget: null,
        transaction: {
          chainType: "solana",
          encoding: "base64",
          serialized: swap.swapTransaction,
          lastValidBlockHeight: swap.lastValidBlockHeight,
          prioritizationFeeLamports: swap.prioritizationFeeLamports ?? null,
          computeUnitLimit: swap.computeUnitLimit ?? null,
        },
      },
    });
  } catch (err) {
    sendJupiterError(err, res, next);
  }
};

/* =========================================================
   GET /api/swap/price/best?chainId=SOLANA
   Jupiter already aggregates every Solana DEX (and is what LI.FI itself
   routes same-chain Solana swaps through), so there is nothing to race —
   return Jupiter's price in the same envelope getBestPrice uses for EVM.
========================================================= */
const getBestPrice = async (req, res, next) => {
  try {
    const invalid = validateSwapParams(req.query);
    if (invalid) return res.status(400).json({ success: false, error: invalid });

    const quote = await fetchJupiterQuote(req.query);
    const normalized = jupiterService.normalizeQuote(quote);

    res.json({
      success: true,
      data: { ...normalized, chainId: SOLANA_APP_CHAIN_ID },
      comparedSources: [{ source: "jupiter", buyAmount: normalized.buyAmount }],
    });
  } catch (err) {
    sendJupiterError(err, res, next);
  }
};

module.exports = { getTokens, getPrice, getQuote, getBestPrice, TOKEN_LIST };
