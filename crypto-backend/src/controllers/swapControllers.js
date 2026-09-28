// controllers/swapControllers.js
const axios = require("axios");

// ─── Fee Configuration ────────────────────────────────────────────────────────
const FEE_RECIPIENT =
  process.env.ZERO_EX_FEE_RECIPIENT || "0xed60b71CEEEF9D25Ebda1C7465ad19Fc41D3A90c";
const SWAP_FEE_BPS = 30;

const ZERO_EX_BASE_URL = "https://api.0x.org";
const ZERO_EX_PRICE_PATH = "/swap/allowance-holder/price";
const ZERO_EX_QUOTE_PATH = "/swap/allowance-holder/quote";

const NATIVE_TOKEN_ADDRESS = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";

// ─── Native token definitions ─────────────────────────────────────────────────
const NATIVE_TOKENS = {
  1: {
    name: "Ether",
    symbol: "ETH",
    address: NATIVE_TOKEN_ADDRESS,
    decimals: 18,
    chainId: 1,
    isNative: true,
    logoURI:
      "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/info/logo.png",
  },
  137: {
    name: "POL",
    symbol: "POL",
    address: NATIVE_TOKEN_ADDRESS,
    decimals: 18,
    chainId: 137,
    isNative: true,
    logoURI:
      "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/polygon/info/logo.png",
  },
  56: {
    name: "BNB",
    symbol: "BNB",
    address: NATIVE_TOKEN_ADDRESS,
    decimals: 18,
    chainId: 56,
    isNative: true,
    logoURI:
      "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/binance/info/logo.png",
  },
  42161: {
    name: "Ether",
    symbol: "ETH",
    address: NATIVE_TOKEN_ADDRESS,
    decimals: 18,
    chainId: 42161,
    isNative: true,
    logoURI:
      "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/info/logo.png",
  },
  8453: {
    name: "Ether",
    symbol: "ETH",
    address: NATIVE_TOKEN_ADDRESS,
    decimals: 18,
    chainId: 8453,
    isNative: true,
    logoURI:
      "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/info/logo.png",
  },
  43114: {
    name: "Avalanche",
    symbol: "AVAX",
    address: NATIVE_TOKEN_ADDRESS,
    decimals: 18,
    chainId: 43114,
    isNative: true,
    logoURI:
      "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/avalanchec/info/logo.png",
  },
  // Arc (Circle's stablecoin L1) — USDC is the native gas asset. Arc exposes
  // it with 18 decimals in its native representation (like ETH on Ethereum);
  // the ERC-20 view of the same USDC uses 6 decimals — see WRAPPED_NATIVE_TOKENS.
  5042: {
    name: "USDC",
    symbol: "USDC",
    address: NATIVE_TOKEN_ADDRESS,
    decimals: 18,
    chainId: 5042,
    isNative: true,
    logoURI:
      "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48/logo.png",
  },
  // Robinhood Chain (Arbitrum Orbit L2) — ETH is the native gas token.
  4663: {
    name: "Ether",
    symbol: "ETH",
    address: NATIVE_TOKEN_ADDRESS,
    decimals: 18,
    chainId: 4663,
    isNative: true,
    logoURI:
      "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/info/logo.png",
  },
};

// ─── Wrapped native token definitions ────────────────────────────────────────
const WRAPPED_NATIVE_TOKENS = {
  1: {
    name: "Wrapped Ether",
    symbol: "WETH",
    address: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
    decimals: 18,
    chainId: 1,
    isWrappedNative: true,
    logoURI:
      "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2/logo.png",
  },
  137: {
    name: "Wrapped POL",
    symbol: "WPOL",
    address: "0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270",
    decimals: 18,
    chainId: 137,
    isWrappedNative: true,
    logoURI:
      "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/polygon/assets/0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270/logo.png",
  },
  56: {
    name: "Wrapped BNB",
    symbol: "WBNB",
    address: "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c",
    decimals: 18,
    chainId: 56,
    isWrappedNative: true,
    logoURI:
      "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/smartchain/assets/0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c/logo.png",
  },
  42161: {
    name: "Wrapped Ether",
    symbol: "WETH",
    address: "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1",
    decimals: 18,
    chainId: 42161,
    isWrappedNative: true,
    logoURI:
      "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2/logo.png",
  },
  8453: {
    name: "Wrapped Ether",
    symbol: "WETH",
    address: "0x4200000000000000000000000000000000000006",
    decimals: 18,
    chainId: 8453,
    isWrappedNative: true,
    logoURI:
      "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2/logo.png",
  },
  43114: {
    name: "Wrapped AVAX",
    symbol: "WAVAX",
    address: "0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7",
    decimals: 18,
    chainId: 43114,
    isWrappedNative: true,
    logoURI:
      "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/avalanchec/assets/0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7/logo.png",
  },
  // NOTE: no verified WETH/WMNT-style wrapped-native contract address for
  // Arc or Robinhood Chain yet — omitted rather than guessing an address
  // (wrong address here would mean funds sent to the wrong contract).
  // Add once confirmed from the chain's official docs/explorer.
};


// ─── Token Lists ──────────────────────────────────────────────────────────────
const TOKEN_LISTS = {
  1: require("../tokenLists/mainnet"),
  137: require("../tokenLists/polygon"),
  56: require("../tokenLists/bnb"),
  42161: require("../tokenLists/arbitrum"),
  8453: require("../tokenLists/base"),
  43114: require("../tokenLists/avalanche"),
  5042: require("../tokenLists/arc"),
  4663: require("../tokenLists/robinhood"),
};

const MANAGED_WRAPPED_ADDRESSES = new Set(
  Object.values(WRAPPED_NATIVE_TOKENS).map((t) => t.address.toLowerCase()),
);

// ─── Helpers ──────────────────────────────────────────────────────────────────
const getTokenList = (chainId) => {
  const erc20s = (TOKEN_LISTS[chainId] ?? TOKEN_LISTS[1]).filter(
    (t) => !MANAGED_WRAPPED_ADDRESSES.has(t.address.toLowerCase()),
  );
  const native = NATIVE_TOKENS[chainId];
  const wrapped = WRAPPED_NATIVE_TOKENS[chainId];
  return [
    ...(native ? [native] : []),
    ...(wrapped ? [wrapped] : []),
    ...erc20s,
  ];
};

const getApiHeaders = () => ({
  "0x-api-key": process.env.ZERO_EX_API_KEY || "",
  "0x-version": "v2",
});

const normalizeTokenAddress = (addr) => {
  if (!addr || addr.toLowerCase() === NATIVE_TOKEN_ADDRESS.toLowerCase()) {
    return NATIVE_TOKEN_ADDRESS;
  }
  return addr;
};

const toBps = (percentage) => Math.round(parseFloat(percentage) * 10000);

const extract0xError = (data) => {
  if (!data) return "Unknown error from 0x API";
  // data may be a raw string if transformResponse was used
  if (typeof data === "string") {
    try {
      const parsed = JSON.parse(data);
      return extract0xError(parsed);
    } catch {
      return data;
    }
  }
  if (data.reason) return data.reason;
  if (data.message) return data.message;
  if (Array.isArray(data.validationErrors) && data.validationErrors.length) {
    return data.validationErrors
      .map((e) => e.reason ?? e.description)
      .join("; ");
  }
  return "Failed to process swap request";
};

// ─── Controllers ──────────────────────────────────────────────────────────────

const getTokens = async (req, res, next) => {
  try {
    const chainId = parseInt(req.query.chainId ?? 1);
    const { search } = req.query;

    if (process.env.NODE_ENV !== "production")
      console.log(
        `[getTokens] chainId=${chainId} search=${search ?? "(none)"}`,
      );

    let tokens = getTokenList(chainId);
    if (process.env.NODE_ENV !== "production")
      console.log(`[getTokens] total tokens before search: ${tokens.length}`);

    if (search) {
      const q = search.toLowerCase().trim();
      tokens = tokens.filter(
        (t) =>
          t.symbol.toLowerCase().includes(q) ||
          t.name.toLowerCase().includes(q) ||
          t.address.toLowerCase() === q,
      );
    }

    if (process.env.NODE_ENV !== "production")
      console.log(`[getTokens] returning ${tokens.length} tokens`);
    res.json({ success: true, data: { tokens, chainId } });
  } catch (err) {
    if (process.env.NODE_ENV !== "production")
      console.error("[getTokens] ERROR:", err.message);
    next(err);
  }
};

const getPrice = async (req, res, next) => {
  try {
    const {
      sellToken,
      buyToken,
      sellAmount,
      takerAddress,
      taker,
      slippagePercentage = 0.01,
    } = req.query;

    const chainId = parseInt(req.query.chainId ?? 1);

    // ── LOG 1: Incoming request ───────────────────────────────────────────────
    if (process.env.NODE_ENV !== "production")
      console.log("\n[getPrice] ━━━ INCOMING REQUEST ━━━");
    if (process.env.NODE_ENV !== "production")
      console.log("[getPrice] chainId          :", chainId);
    if (process.env.NODE_ENV !== "production")
      console.log("[getPrice] sellToken (raw)  :", sellToken);
    if (process.env.NODE_ENV !== "production")
      console.log("[getPrice] buyToken  (raw)  :", buyToken);
    if (process.env.NODE_ENV !== "production")
      console.log("[getPrice] sellAmount       :", sellAmount);
    if (process.env.NODE_ENV !== "production")
      console.log("[getPrice] slippagePercent  :", slippagePercentage);
    if (process.env.NODE_ENV !== "production")
      console.log(
        "[getPrice] taker            :",
        taker || takerAddress || "(none)",
      );

    if (!sellToken || !buyToken || !sellAmount) {
      if (process.env.NODE_ENV !== "production")
        console.warn("[getPrice] REJECTED — missing required params");
      return res.status(400).json({
        success: false,
        error: "sellToken, buyToken, and sellAmount are required",
      });
    }

    if (!/^\d+$/.test(sellAmount) || BigInt(sellAmount) <= 0n) {
      if (process.env.NODE_ENV !== "production")
        console.warn(
          "[getPrice] REJECTED — sellAmount not valid wei:",
          sellAmount,
        );
      return res.status(400).json({
        success: false,
        error: "sellAmount must be a positive integer (wei)",
      });
    }

    const normalizedSell = normalizeTokenAddress(sellToken);
    const normalizedBuy = normalizeTokenAddress(buyToken);
    const slippageBps = toBps(slippagePercentage);

    const params = {
      chainId,
      sellToken: normalizedSell,
      buyToken: normalizedBuy,
      sellAmount,
      slippageBps,
      swapFeeRecipient: FEE_RECIPIENT,
      swapFeeBps: SWAP_FEE_BPS,
      // swapFeeToken must be a real token address — NOT the string "buyToken".
      // 0x charges the fee in the buyToken, so we pass the actual buyToken address.
      swapFeeToken: normalizedBuy,
    };

    const takerAddr = taker || takerAddress;
    if (takerAddr) params.taker = takerAddr;

    // ── LOG 2: What we send to 0x ─────────────────────────────────────────────
    const fullUrl = `${ZERO_EX_BASE_URL}${ZERO_EX_PRICE_PATH}`;
    if (process.env.NODE_ENV !== "production")
      console.log("\n[getPrice] ━━━ CALLING 0x API ━━━");
    if (process.env.NODE_ENV !== "production")
      console.log("[getPrice] URL             :", fullUrl);
    if (process.env.NODE_ENV !== "production")
      console.log("[getPrice] normalizedSell  :", normalizedSell);
    if (process.env.NODE_ENV !== "production")
      console.log("[getPrice] normalizedBuy   :", normalizedBuy);
    if (process.env.NODE_ENV !== "production")
      console.log("[getPrice] slippageBps     :", slippageBps);
    if (process.env.NODE_ENV !== "production")
      console.log(
        "[getPrice] full params     :",
        JSON.stringify(params, null, 2),
      );
    if (process.env.NODE_ENV !== "production")
      console.log(
        "[getPrice] headers         :",
        JSON.stringify(getApiHeaders()),
      );

    const response = await axios.get(fullUrl, {
      params,
      headers: getApiHeaders(),
      timeout: 10000,
      transformResponse: [(raw) => raw],
    });

    // ── LOG 3: Raw 0x response ────────────────────────────────────────────────
    if (process.env.NODE_ENV !== "production")
      console.log("\n[getPrice] ━━━ 0x RESPONSE ━━━");
    if (process.env.NODE_ENV !== "production")
      console.log("[getPrice] HTTP status     :", response.status);
    if (process.env.NODE_ENV !== "production")
      console.log("[getPrice] raw body        :", response.data);

    let responseData;
    try {
      responseData = JSON.parse(response.data);
    } catch (parseErr) {
      if (process.env.NODE_ENV !== "production")
        console.error("[getPrice] JSON.parse failed:", parseErr.message);
      if (process.env.NODE_ENV !== "production")
        console.error("[getPrice] raw data was     :", response.data);
      throw parseErr;
    }

    // ── LOG 4: Key fields we use ──────────────────────────────────────────────
    if (process.env.NODE_ENV !== "production")
      console.log("\n[getPrice] ━━━ PARSED FIELDS ━━━");
    if (process.env.NODE_ENV !== "production")
      console.log(
        "[getPrice] buyAmount       :",
        responseData.buyAmount,
        "type:",
        typeof responseData.buyAmount,
      );
    if (process.env.NODE_ENV !== "production")
      console.log(
        "[getPrice] sellAmount      :",
        responseData.sellAmount,
        "type:",
        typeof responseData.sellAmount,
      );
    if (process.env.NODE_ENV !== "production")
      console.log("[getPrice] price           :", responseData.price);
    if (process.env.NODE_ENV !== "production")
      console.log(
        "[getPrice] estimatedImpact :",
        responseData.estimatedPriceImpact,
      );
    if (process.env.NODE_ENV !== "production")
      console.log(
        "[getPrice] issues          :",
        JSON.stringify(responseData.issues ?? null),
      );

    res.json({ success: true, data: responseData });
  } catch (err) {
    // ── LOG 5: Error details ──────────────────────────────────────────────────
    if (process.env.NODE_ENV !== "production")
      console.error("\n[getPrice] ━━━ ERROR ━━━");
    if (process.env.NODE_ENV !== "production")
      console.error("[getPrice] err.message     :", err.message);
    if (err.response) {
      if (process.env.NODE_ENV !== "production")
        console.error("[getPrice] HTTP status     :", err.response.status);
      if (process.env.NODE_ENV !== "production")
        console.error("[getPrice] 0x error body   :", err.response.data);
      if (process.env.NODE_ENV !== "production")
        console.error(
          "[getPrice] 0x error parsed :",
          extract0xError(err.response.data),
        );
      return res.status(err.response.status).json({
        success: false,
        error: extract0xError(err.response.data),
        details: err.response.data,
      });
    }
    if (process.env.NODE_ENV !== "production")
      console.error("[getPrice] no response object — network/timeout error");
    next(err);
  }
};

const getQuote = async (req, res, next) => {
  try {
    const {
      sellToken,
      buyToken,
      sellAmount,
      takerAddress,
      taker,
      slippagePercentage = 0.01,
      skipValidation = false,
    } = req.query;

    const chainId = parseInt(req.query.chainId ?? 1);

    // ── LOG 1: Incoming request ───────────────────────────────────────────────
    if (process.env.NODE_ENV !== "production")
      console.log("\n[getQuote] ━━━ INCOMING REQUEST ━━━");
    if (process.env.NODE_ENV !== "production")
      console.log("[getQuote] chainId          :", chainId);
    if (process.env.NODE_ENV !== "production")
      console.log("[getQuote] sellToken (raw)  :", sellToken);
    if (process.env.NODE_ENV !== "production")
      console.log("[getQuote] buyToken  (raw)  :", buyToken);
    if (process.env.NODE_ENV !== "production")
      console.log("[getQuote] sellAmount       :", sellAmount);
    if (process.env.NODE_ENV !== "production")
      console.log("[getQuote] slippagePercent  :", slippagePercentage);
    if (process.env.NODE_ENV !== "production")
      console.log(
        "[getQuote] taker            :",
        taker || takerAddress || "(none)",
      );

    if (!sellToken || !buyToken || !sellAmount) {
      if (process.env.NODE_ENV !== "production")
        console.warn("[getQuote] REJECTED — missing required params");
      return res.status(400).json({
        success: false,
        error: "sellToken, buyToken, and sellAmount are required",
      });
    }

    if (!/^\d+$/.test(sellAmount) || BigInt(sellAmount) <= 0n) {
      if (process.env.NODE_ENV !== "production")
        console.warn(
          "[getQuote] REJECTED — sellAmount not valid wei:",
          sellAmount,
        );
      return res.status(400).json({
        success: false,
        error: "sellAmount must be a positive integer (wei)",
      });
    }

    const normalizedSell = normalizeTokenAddress(sellToken);
    const normalizedBuy = normalizeTokenAddress(buyToken);
    const slippageBps = toBps(slippagePercentage);

    const params = {
      chainId,
      sellToken: normalizedSell,
      buyToken: normalizedBuy,
      sellAmount,
      slippageBps,
      swapFeeRecipient: FEE_RECIPIENT,
      swapFeeBps: SWAP_FEE_BPS,
      swapFeeToken: normalizedBuy,
    };

    const takerAddr = taker || takerAddress;
    if (takerAddr) params.taker = takerAddr;
    if (skipValidation === "true") params.skipValidation = true;

    // ── LOG 2: What we send to 0x ─────────────────────────────────────────────
    const fullUrl = `${ZERO_EX_BASE_URL}${ZERO_EX_QUOTE_PATH}`;
    if (process.env.NODE_ENV !== "production")
      console.log("\n[getQuote] ━━━ CALLING 0x API ━━━");
    if (process.env.NODE_ENV !== "production")
      console.log("[getQuote] URL             :", fullUrl);
    if (process.env.NODE_ENV !== "production")
      console.log("[getQuote] normalizedSell  :", normalizedSell);
    if (process.env.NODE_ENV !== "production")
      console.log("[getQuote] normalizedBuy   :", normalizedBuy);
    if (process.env.NODE_ENV !== "production")
      console.log("[getQuote] slippageBps     :", slippageBps);
    if (process.env.NODE_ENV !== "production")
      console.log(
        "[getQuote] full params     :",
        JSON.stringify(params, null, 2),
      );

    const response = await axios.get(fullUrl, {
      params,
      headers: getApiHeaders(),
      timeout: 15000,
      transformResponse: [(raw) => raw],
    });

    // ── LOG 3: Raw 0x response ────────────────────────────────────────────────
    if (process.env.NODE_ENV !== "production")
      console.log("\n[getQuote] ━━━ 0x RESPONSE ━━━");
    if (process.env.NODE_ENV !== "production")
      console.log("[getQuote] HTTP status     :", response.status);
    if (process.env.NODE_ENV !== "production")
      console.log("[getQuote] raw body        :", response.data);

    let quote;
    try {
      quote = JSON.parse(response.data);
    } catch (parseErr) {
      if (process.env.NODE_ENV !== "production")
        console.error("[getQuote] JSON.parse failed:", parseErr.message);
      throw parseErr;
    }

    // ── LOG 4: Key fields ─────────────────────────────────────────────────────
    if (process.env.NODE_ENV !== "production")
      console.log("\n[getQuote] ━━━ PARSED FIELDS ━━━");
    if (process.env.NODE_ENV !== "production")
      console.log(
        "[getQuote] buyAmount       :",
        quote.buyAmount,
        "type:",
        typeof quote.buyAmount,
      );
    if (process.env.NODE_ENV !== "production")
      console.log(
        "[getQuote] sellAmount      :",
        quote.sellAmount,
        "type:",
        typeof quote.sellAmount,
      );
    if (process.env.NODE_ENV !== "production")
      console.log(
        "[getQuote] issues          :",
        JSON.stringify(quote.issues ?? null),
      );
    if (process.env.NODE_ENV !== "production")
      console.log("[getQuote] needsApproval   :", !!quote.issues?.allowance);

    const needsApproval = !!quote.issues?.allowance;
    const allowanceTarget = quote.issues?.allowance?.spender ?? null;

    res.json({
      success: true,
      data: {
        ...quote,
        chainId,
        needsApproval,
        allowanceTarget,
        priceImpactPercentage: quote.estimatedPriceImpact ?? null,
      },
    });
  } catch (err) {
    // ── LOG 5: Error details ──────────────────────────────────────────────────
    if (process.env.NODE_ENV !== "production")
      console.error("\n[getQuote] ━━━ ERROR ━━━");
    if (process.env.NODE_ENV !== "production")
      console.error("[getQuote] err.message     :", err.message);
    if (err.response) {
      if (process.env.NODE_ENV !== "production")
        console.error("[getQuote] HTTP status     :", err.response.status);
      if (process.env.NODE_ENV !== "production")
        console.error("[getQuote] 0x error body   :", err.response.data);
      if (process.env.NODE_ENV !== "production")
        console.error(
          "[getQuote] 0x error parsed :",
          extract0xError(err.response.data),
        );
      return res.status(err.response.status).json({
        success: false,
        error: extract0xError(err.response.data),
        details: err.response.data,
      });
    }
    if (process.env.NODE_ENV !== "production")
      console.error("[getQuote] no response object — network/timeout error");
    next(err);
  }
};

// ─── Aggregated pricing (0x + LI.FI) ───────────────────────────────────────────
// Same-chain swaps can be filled by 0x's RFQ/DEX aggregation OR by LI.FI's own
// DEX aggregation — they don't always agree on the best route. getBestPrice
// calls both concurrently and returns whichever quotes more buyAmount, so the
// user always gets the better fill without the app having to guess up front.
const lifiService = require("../services/lifiService");

const fetch0xPrice = async ({
  chainId,
  sellToken,
  buyToken,
  sellAmount,
  taker,
  slippagePercentage,
}) => {
  const normalizedSell = normalizeTokenAddress(sellToken);
  const normalizedBuy = normalizeTokenAddress(buyToken);

  const params = {
    chainId,
    sellToken: normalizedSell,
    buyToken: normalizedBuy,
    sellAmount,
    slippageBps: toBps(slippagePercentage),
    swapFeeRecipient: FEE_RECIPIENT,
    swapFeeBps: SWAP_FEE_BPS,
    swapFeeToken: normalizedBuy,
  };
  if (taker) params.taker = taker;

  const response = await axios.get(`${ZERO_EX_BASE_URL}${ZERO_EX_PRICE_PATH}`, {
    params,
    headers: getApiHeaders(),
    timeout: 10000,
    transformResponse: [(raw) => raw],
  });

  const data = JSON.parse(response.data);
  return {
    source: "0x",
    buyAmount: data.buyAmount,
    sellAmount: data.sellAmount,
    price: data.price,
    priceImpactPercentage: data.estimatedPriceImpact ?? null,
    raw: data,
  };
};

const fetchLifiPrice = async ({
  chainId,
  sellToken,
  buyToken,
  sellAmount,
  taker,
  slippagePercentage,
}) => {
  const lifiQuote = await lifiService.getQuote({
    fromChain: chainId,
    toChain: chainId,
    fromToken: normalizeTokenAddress(sellToken),
    toToken: normalizeTokenAddress(buyToken),
    fromAmount: sellAmount,
    fromAddress: taker || "0x0000000000000000000000000000000000000001",
    slippage: parseFloat(slippagePercentage),
  });

  return {
    source: "lifi",
    buyAmount: lifiQuote.estimate?.toAmount,
    sellAmount: lifiQuote.estimate?.fromAmount,
    price:
      lifiQuote.estimate?.toAmount && lifiQuote.estimate?.fromAmount
        ? (
            Number(lifiQuote.estimate.toAmount) /
            Number(lifiQuote.estimate.fromAmount)
          ).toString()
        : null,
    priceImpactPercentage: null,
    raw: lifiQuote,
  };
};

/**
 * GET /api/swap/price/best
 * Same params as getPrice. Races 0x and LI.FI, returns whichever quotes
 * more buyAmount. Either leg can fail independently (e.g. LI.FI has no
 * same-chain route for an exotic pair) without failing the whole request.
 */
const getBestPrice = async (req, res, next) => {
  try {
    const {
      sellToken,
      buyToken,
      sellAmount,
      takerAddress,
      taker,
      slippagePercentage = 0.01,
    } = req.query;
    const chainId = parseInt(req.query.chainId ?? 1);

    if (!sellToken || !buyToken || !sellAmount) {
      return res.status(400).json({
        success: false,
        error: "sellToken, buyToken, and sellAmount are required",
      });
    }

    const takerAddr = taker || takerAddress;
    const args = { chainId, sellToken, buyToken, sellAmount, taker: takerAddr, slippagePercentage };

    const [zeroXResult, lifiResult] = await Promise.allSettled([
      fetch0xPrice(args),
      fetchLifiPrice(args),
    ]);

    const candidates = [];
    if (zeroXResult.status === "fulfilled") candidates.push(zeroXResult.value);
    if (lifiResult.status === "fulfilled" && lifiResult.value.buyAmount)
      candidates.push(lifiResult.value);

    if (candidates.length === 0) {
      const firstError =
        zeroXResult.reason?.response?.data ?? lifiResult.reason?.message;
      return res.status(502).json({
        success: false,
        error: "No route found from either 0x or LI.FI",
        details: firstError,
      });
    }

    const best = candidates.reduce((a, b) =>
      BigInt(b.buyAmount || 0) > BigInt(a.buyAmount || 0) ? b : a,
    );

    res.json({
      success: true,
      data: {
        ...best.raw,
        buyAmount: best.buyAmount,
        sellAmount: best.sellAmount,
        price: best.price,
        estimatedPriceImpact: best.priceImpactPercentage,
        source: best.source,
        chainId,
      },
      comparedSources: candidates.map((c) => ({
        source: c.source,
        buyAmount: c.buyAmount,
      })),
    });
  } catch (err) {
    next(err);
  }
};

module.exports = { getTokens, getPrice, getQuote, getBestPrice };
