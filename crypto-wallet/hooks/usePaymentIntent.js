/**
 * hooks/usePaymentIntent.js
 *
 * Manages all state and logic for the Payment screen.
 *
 * Accepts an optional `initialIntent` prop so that Phase 1+ (QR / deep link /
 * dApp) can pre-populate the screen without changing any internal logic.
 *
 * The hook exposes a single `intent` object and mutation helpers.
 * The PaymentScreen is a "dumb" consumer — it only calls these helpers
 * and renders what the hook tells it to.
 *
 * ┌─────────────────────────────────────────────────────────┐
 * │  Phase 0:  initialIntent = createManualIntent()         │
 * │  Phase 1+: initialIntent = createIntentFromQR(...)      │
 * │            initialIntent = createIntentFromDeepLink(..) │
 * │            initialIntent = serverPushedIntent           │
 * └─────────────────────────────────────────────────────────┘
 */

import { useState, useEffect, useCallback, useRef } from "react";
import {
  createManualIntent,
  isIntentReady,
  isIntentExpired,
  FIAT_CURRENCIES,
  DEFAULT_FIAT_CURRENCY,
  INTENT_STATUS,
} from "../components/payment/PaymentIntent";
import {
  getPaymentTokensForChain,
  getDefaultPaymentToken,
  isSupportedPaymentChain,
} from "../constants/PaymentToken";
import { Contract, JsonRpcProvider, formatUnits } from "ethers";
import {
  estimateNativeTransferGas,
  estimateTokenTransferGas,
} from "../utils/blockchain/Gas";
import { validateAddress } from "../utils/Validators";
import { parseUnits } from "ethers";
import { API_CONFIG } from "../config/api";

const API_BASE_URL = API_CONFIG.BASE_URL;

// ─────────────────────────────────────────────────────────────────────────────
// Fiat → token conversion
//
// Phase 0: uses a lightweight price feed fetch (CoinGecko free tier).
// Phase 1+: replace with an in-app oracle or merchant-provided rate.
// ─────────────────────────────────────────────────────────────────────────────
const COINGECKO_IDS = {
  usdt: "tether",
  usdc: "usd-coin",
  "usdc.e": "usd-coin",
  dai: "dai",
  busd: "binance-usd",
  pyusd: "paypal-usd",
  frax: "frax",
  tusd: "true-usd",
  cngn: "cngn", // may not exist yet — graceful fallback
  eurc: "euro-coin",
  gusd: "gemini-dollar",
};

// Simple in-memory rate cache (valid for 60 seconds)
const rateCache = {};

const fetchFiatToTokenRate = async (tokenSymbol, fiatCurrency) => {
  const key = `${tokenSymbol}_${fiatCurrency}`;
  const now = Date.now();

  if (rateCache[key] && now - rateCache[key].ts < 60_000) {
    return rateCache[key].rate;
  }

  const geckoId = COINGECKO_IDS[tokenSymbol.toLowerCase()];
  if (!geckoId) {
    // Unknown token — assume 1:1 with USD, then convert USD→fiat
    // Phase 1+: integrate proper oracle
    return null;
  }

  try {
    const currency = fiatCurrency.toLowerCase();
    const res = await fetch(
      `https://api.coingecko.com/api/v3/simple/price?ids=${geckoId}&vs_currencies=${currency}`,
    );
    const json = await res.json();
    const rate = json?.[geckoId]?.[currency];

    if (rate) {
      rateCache[key] = { rate, ts: now };
      return rate;
    }
    return null;
  } catch {
    return null;
  }
};

/**
 * Converts a fiat amount to token amount.
 * Returns the token amount as a string, or null if rate unavailable.
 *
 * @param {string} fiatAmount   - user-entered string, e.g. "5000"
 * @param {string} fiatCurrency - e.g. "NGN"
 * @param {object} token        - selected token object
 * @returns {Promise<string|null>}
 */
const fiatToToken = async (fiatAmount, fiatCurrency, token) => {
  const fiat = parseFloat(fiatAmount);
  if (!fiat || !token) return null;

  // Phase 0: For stablecoins pegged to USD, handle NGN specially
  // Most stablecoins are USD-pegged, so rate = price of 1 USDT in NGN
  const rate = await fetchFiatToTokenRate(token.symbol, fiatCurrency);

  if (!rate) {
    // Graceful degradation: can't convert, return null
    return null;
  }

  // tokenAmount = fiatAmount / rate
  // e.g. ₦5000 / ₦1550 per USDT = 3.2258 USDT
  const tokenAmount = (fiat / rate).toFixed(
    token.decimals > 6 ? 6 : token.decimals,
  );
  return tokenAmount;
};

// ─────────────────────────────────────────────────────────────────────────────
// Identity resolution (same endpoint as BindWalletScreen + SendScreen)
// ─────────────────────────────────────────────────────────────────────────────
const resolveIdentity = async (emailOrUsername) => {
  const res = await fetch(
    `${API_BASE_URL}/wallets/resolve?email_or_username=${encodeURIComponent(emailOrUsername.trim())}`,
  );
  const json = await res.json();
  if (!res.ok) throw { status: res.status, ...json };
  return json.data?.wallet_address ?? null;
};

// ─────────────────────────────────────────────────────────────────────────────
// The hook
// ─────────────────────────────────────────────────────────────────────────────
export function usePaymentIntent({
  initialIntent = null, // Phase 1+: pass a pre-built PaymentIntent here
  address, // from useWallet()
  activeChain, // from useChain()
  provider, // from useWallet() — used for balanceOf calls
}) {
  // ── Core intent ───────────────────────────────────────────────────────────
  const [intent, setIntent] = useState(initialIntent ?? createManualIntent());

  // ── Available payment tokens (filtered stablecoins only) ──────────────────
  const [paymentTokens, setPaymentTokens] = useState([]);
  const [loadingTokens, setLoadingTokens] = useState(true);

  // ── Fiat conversion state ─────────────────────────────────────────────────
  const [rateLoading, setRateLoading] = useState(false);
  const [rateError, setRateError] = useState(null);
  const [exchangeRate, setExchangeRate] = useState(null); // display: "1 USDT = ₦1,550"

  // ── Identity resolution (recipient username/email) ────────────────────────
  const [recipientInput, setRecipientInput] = useState(
    initialIntent?.recipient ?? "",
  );
  const [recipientMode, setRecipientMode] = useState("address"); // "address"|"username"|"email"
  const [resolvedRecipient, setResolvedRecipient] = useState(
    initialIntent?.recipient ?? null,
  );
  const [resolving, setResolving] = useState(false);
  const [resolveError, setResolveError] = useState(null);

  // ── Gas state ─────────────────────────────────────────────────────────────
  const [gasEstimate, setGasEstimate] = useState(null);
  const [estimatingGas, setEstimatingGas] = useState(false);
  const [gasError, setGasError] = useState(null);
  const [feeExpanded, setFeeExpanded] = useState(false);

  // ── Validation errors ─────────────────────────────────────────────────────
  const [fieldErrors, setFieldErrors] = useState({});

  // ── Screen step ───────────────────────────────────────────────────────────
  // "form" → "confirming" → (TransactionModal opens) → "success" | "error"
  const [step, setStep] = useState("form");

  // ── Expiry countdown (Phase 1+) ───────────────────────────────────────────
  const [expired, setExpired] = useState(false);
  const expiryTimer = useRef(null);

  // ─────────────────────────────────────────────────────────────────────────
  // On mount: start expiry countdown if intent has expiresAt (Phase 1+)
  // ─────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (intent.expiresAt) {
      expiryTimer.current = setInterval(() => {
        if (isIntentExpired(intent)) {
          setExpired(true);
          clearInterval(expiryTimer.current);
        }
      }, 1000);
    }
    return () => clearInterval(expiryTimer.current);
  }, []);

  // ─────────────────────────────────────────────────────────────────────────
  // Reload payment tokens whenever the active chain or provider changes.
  // Also resets the selected asset so the user picks one valid for the new chain.
  // ─────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    // Reset asset + gas whenever chain switches (unless intent locks the asset)
    if (!intent.assetLocked) {
      updateIntent({ asset: null, tokenAmount: "" });
      setGasEstimate(null);
      setExchangeRate(null);
    }
    loadPaymentTokens();
  }, [activeChain.id, provider]);

  // Re-initialise if a new initialIntent is injected (Phase 1+)
  useEffect(() => {
    if (initialIntent) {
      setIntent(initialIntent);
      setRecipientInput(initialIntent.recipient ?? "");
      setResolvedRecipient(initialIntent.recipient ?? null);
    }
  }, [initialIntent]);

  // ─────────────────────────────────────────────────────────────────────────
  // Debounced fiat → token conversion whenever fiatAmount or asset changes
  // ─────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!intent.fiatAmount || !intent.asset) {
      updateIntent({ tokenAmount: "" });
      setExchangeRate(null);
      return;
    }

    const timer = setTimeout(() => doConvert(), 400);
    return () => clearTimeout(timer);
  }, [intent.fiatAmount, intent.fiatCurrency, intent.asset?.id]);

  // ─────────────────────────────────────────────────────────────────────────
  // Debounced identity resolution
  // ─────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (recipientMode === "address") return;
    if (!recipientInput.trim()) {
      setResolvedRecipient(null);
      setResolveError(null);
      return;
    }

    const timer = setTimeout(
      () => doResolveIdentity(recipientInput.trim()),
      600,
    );
    return () => clearTimeout(timer);
  }, [recipientInput, recipientMode]);

  // ─────────────────────────────────────────────────────────────────────────
  // Debounced gas estimation when effective recipient + tokenAmount are ready
  // ─────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    const dest = effectiveRecipient;
    const amt = intent.tokenAmount;
    if (dest && amt && parseFloat(amt) > 0 && intent.asset && address) {
      const timer = setTimeout(() => doEstimateGas(), 500);
      return () => clearTimeout(timer);
    } else {
      setGasEstimate(null);
    }
  }, [intent.tokenAmount, intent.asset?.id, resolvedRecipient, recipientInput]);

  // ─────────────────────────────────────────────────────────────────────────
  // Computed: effective recipient address
  // ─────────────────────────────────────────────────────────────────────────
  const effectiveRecipient =
    recipientMode === "address" ? recipientInput.trim() : resolvedRecipient;

  // ─────────────────────────────────────────────────────────────────────────
  // Intent mutation helper — partial updates
  // ─────────────────────────────────────────────────────────────────────────
  const updateIntent = useCallback((patch) => {
    setIntent((prev) => ({ ...prev, ...patch }));
  }, []);

  // ─────────────────────────────────────────────────────────────────────────
  // Load payment tokens from constant + fetch balances for known addresses
  //
  // No DB. No Alchemy scan. No user import required.
  // We know exactly which tokens exist on each chain — just fetch balanceOf
  // for each one using a single multicall-style batch of eth_call requests.
  // ─────────────────────────────────────────────────────────────────────────
  const loadPaymentTokens = async () => {
    try {
      setLoadingTokens(true);

      const chainId = parseInt(activeChain.id);
      const defined = getPaymentTokensForChain(chainId);

      // Chain not yet supported in the registry
      if (!defined.length) {
        setPaymentTokens([]);
        setLoadingTokens(false);
        return;
      }

      // Minimal ERC-20 ABI — just balanceOf
      const ERC20_BALANCE_ABI = [
        "function balanceOf(address owner) view returns (uint256)",
      ];

      // Fetch balanceOf for every known token in parallel
      // Falls back to "0" gracefully if any single call fails
      const withBalances = await Promise.all(
        defined.map(async (token) => {
          let balance = "0";
          try {
            if (provider && address) {
              const contract = new Contract(
                token.address,
                ERC20_BALANCE_ABI,
                provider,
              );
              const raw = await contract.balanceOf(address);
              balance = formatUnits(raw, token.decimals);
            }
          } catch (e) {
            // Token might not exist on this chain variant — keep 0
            console.warn(
              `[usePaymentIntent] balanceOf failed for ${token.symbol}:`,
              e.message,
            );
          }

          return {
            // Shape matches what the rest of the screen expects
            id: token.address,
            symbol: token.symbol,
            name: token.name,
            address: token.address,
            decimals: token.decimals,
            isNative: false,
            logo: token.logo,
            chainId,
            balance,
          };
        }),
      );

      // Sort: tokens with a non-zero balance float to the top
      withBalances.sort(
        (a, b) => (parseFloat(b.balance) || 0) - (parseFloat(a.balance) || 0),
      );

      setPaymentTokens(withBalances);

      // Auto-select default if nothing chosen yet
      if (!intent.asset && !intent.assetLocked) {
        const preferred = getDefaultPaymentToken(chainId);
        if (preferred) {
          const found = withBalances.find(
            (t) => t.address.toLowerCase() === preferred.address.toLowerCase(),
          );
          if (found) updateIntent({ asset: found });
        }
      }
    } catch (err) {
      console.error("[usePaymentIntent] Error loading payment tokens:", err);
    } finally {
      setLoadingTokens(false);
    }
  };

  // ─────────────────────────────────────────────────────────────────────────
  // Fiat → token conversion
  // ─────────────────────────────────────────────────────────────────────────
  const doConvert = async () => {
    try {
      setRateLoading(true);
      setRateError(null);

      const tokenAmount = await fiatToToken(
        intent.fiatAmount,
        intent.fiatCurrency,
        intent.asset,
      );

      if (tokenAmount !== null) {
        updateIntent({ tokenAmount });

        // Build display rate string: "1 USDT = ₦1,550"
        const fiatSymbol = FIAT_CURRENCIES[intent.fiatCurrency]?.symbol ?? "";
        const fiatVal = parseFloat(intent.fiatAmount);
        const tokVal = parseFloat(tokenAmount);
        if (tokVal > 0) {
          const ratePerToken = fiatVal / tokVal;
          setExchangeRate(
            `1 ${intent.asset.symbol} ≈ ${fiatSymbol}${ratePerToken.toLocaleString(undefined, { maximumFractionDigits: 2 })}`,
          );
        }
      } else {
        updateIntent({ tokenAmount: "" });
        setRateError("Exchange rate unavailable. Enter token amount directly.");
        setExchangeRate(null);
      }
    } catch {
      setRateError("Failed to fetch rate.");
    } finally {
      setRateLoading(false);
    }
  };

  // ─────────────────────────────────────────────────────────────────────────
  // Identity resolution
  // ─────────────────────────────────────────────────────────────────────────
  const doResolveIdentity = async (query) => {
    try {
      setResolving(true);
      setResolveError(null);
      const addr = await resolveIdentity(query);
      setResolvedRecipient(addr);
    } catch (err) {
      setResolvedRecipient(null);
      setResolveError(
        err.status === 404
          ? `No wallet found for "${query}"`
          : "Could not resolve identity.",
      );
    } finally {
      setResolving(false);
    }
  };

  // ─────────────────────────────────────────────────────────────────────────
  // Gas estimation
  // ─────────────────────────────────────────────────────────────────────────
  const doEstimateGas = async () => {
    const dest = effectiveRecipient;
    const amt = intent.tokenAmount;
    if (!validateAddress(dest).isValid || !amt || parseFloat(amt) <= 0) return;

    try {
      setEstimatingGas(true);
      setGasError(null);

      const estimate = await estimateTokenTransferGas(
        address,
        intent.asset.address,
        dest,
        amt,
        intent.asset.decimals,
        activeChain,
      );
      setGasEstimate(estimate);
    } catch {
      setGasError("Unable to estimate network fee.");
    } finally {
      setEstimatingGas(false);
    }
  };

  // ─────────────────────────────────────────────────────────────────────────
  // Validation
  // ─────────────────────────────────────────────────────────────────────────
  const validate = () => {
    const errs = {};

    // Recipient
    if (!recipientInput.trim()) {
      errs.recipient = "Payment recipient is required.";
    } else if (
      recipientMode === "address" &&
      !validateAddress(recipientInput).isValid
    ) {
      errs.recipient = "Invalid wallet address.";
    } else if (recipientMode !== "address" && resolving) {
      errs.recipient = "Still resolving identity…";
    } else if (recipientMode !== "address" && !resolvedRecipient) {
      errs.recipient = resolveError ?? "Could not resolve this identity.";
    }

    // Asset
    if (!intent.asset) errs.asset = "Please select a payment token.";

    // Amount
    if (!intent.fiatAmount || parseFloat(intent.fiatAmount) <= 0) {
      errs.amount = "Enter a payment amount.";
    } else if (!intent.tokenAmount || parseFloat(intent.tokenAmount) <= 0) {
      errs.amount = rateError ?? "Token amount could not be determined.";
    } else {
      const tokenBal = parseFloat(intent.asset?.balance ?? "0");
      const tokenAmt = parseFloat(intent.tokenAmount);
      if (tokenAmt > tokenBal) {
        errs.amount = `Insufficient ${intent.asset.symbol} balance.`;
      }
    }

    if (gasError) errs.gas = gasError;

    setFieldErrors(errs);
    return Object.keys(errs).length === 0;
  };

  // ─────────────────────────────────────────────────────────────────────────
  // Proceed to confirmation sheet
  // ─────────────────────────────────────────────────────────────────────────
  const proceedToConfirmation = () => {
    if (!validate()) return false;
    // Stamp the effective recipient into the intent before confirming
    updateIntent({
      recipient: effectiveRecipient,
      status: INTENT_STATUS.CONFIRMING,
    });
    setStep("confirming");
    return true;
  };

  const backToForm = () => {
    setStep("form");
    updateIntent({ status: INTENT_STATUS.DRAFT });
  };

  const onPaymentSuccess = (receipt) => {
    updateIntent({ status: INTENT_STATUS.COMPLETE });
    setStep("success");
  };

  const onPaymentError = (err) => {
    updateIntent({ status: INTENT_STATUS.DRAFT });
    setStep("form");
  };

  // ─────────────────────────────────────────────────────────────────────────
  // Build the TransactionModal config from the current intent
  // ─────────────────────────────────────────────────────────────────────────
  const buildTxConfig = () => {
    const { asset, tokenAmount, recipient } = intent;
    if (!asset || !tokenAmount || !recipient) return null;

    const ERC20_ABI = [
      "function transfer(address to, uint256 amount) returns (bool)",
    ];

    return {
      isNative: false,
      contractAddress: asset.address,
      contractABI: ERC20_ABI,
      functionName: "transfer",
      args: [recipient, parseUnits(tokenAmount, asset.decimals)],
      value: "0",
    };
  };

  // ─────────────────────────────────────────────────────────────────────────
  // Fiat amount helpers
  // ─────────────────────────────────────────────────────────────────────────
  const setFiatAmount = (raw) => {
    // Sanitise: digits and a single decimal point only
    const cleaned = raw.replace(/[^0-9.]/g, "");
    const parts = cleaned.split(".");
    const value =
      parts.length > 2 ? parts[0] + "." + parts.slice(1).join("") : cleaned;
    updateIntent({ fiatAmount: value });
    if (fieldErrors.amount) setFieldErrors((p) => ({ ...p, amount: null }));
  };

  const setFiatCurrency = (code) => updateIntent({ fiatCurrency: code });

  const setAsset = (token) => {
    updateIntent({ asset: token, tokenAmount: "" });
    setGasEstimate(null);
    setExchangeRate(null);
  };

  const switchRecipientMode = (mode) => {
    setRecipientMode(mode);
    setRecipientInput("");
    setResolvedRecipient(null);
    setResolveError(null);
    setGasEstimate(null);
    setFieldErrors((p) => ({ ...p, recipient: null }));
  };

  return {
    // ── Intent (read-only for screen) ────────────────────────────────────
    intent,

    // ── Chain ─────────────────────────────────────────────────────────────
    chainId: parseInt(activeChain.id),
    chainSupported: isSupportedPaymentChain(activeChain.id),

    // ── Token list ────────────────────────────────────────────────────────
    paymentTokens,
    loadingTokens,
    loadPaymentTokens, // exposed for retry button on error state

    // ── Recipient ─────────────────────────────────────────────────────────
    recipientInput,
    setRecipientInput: (v) => {
      setRecipientInput(v);
      setFieldErrors((p) => ({ ...p, recipient: null }));
    },
    recipientMode,
    switchRecipientMode,
    resolvedRecipient,
    resolving,
    resolveError,
    effectiveRecipient,

    // ── Fiat input ────────────────────────────────────────────────────────
    setFiatAmount,
    setFiatCurrency,
    exchangeRate,
    rateLoading,
    rateError,

    // ── Asset ─────────────────────────────────────────────────────────────
    setAsset,

    // ── Gas ───────────────────────────────────────────────────────────────
    gasEstimate,
    estimatingGas,
    gasError,
    feeExpanded,
    setFeeExpanded,

    // ── Validation ────────────────────────────────────────────────────────
    fieldErrors,

    // ── Screen flow ───────────────────────────────────────────────────────
    step,
    proceedToConfirmation,
    backToForm,
    onPaymentSuccess,
    onPaymentError,
    buildTxConfig,

    // ── Expiry (Phase 1+) ─────────────────────────────────────────────────
    expired,
  };
}
