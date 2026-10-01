/**
 * PaymentIntent.js
 *
 * Defines the shape of a PaymentIntent — the normalised data structure
 * that drives the Payment screen regardless of where it came from:
 *
 *   Phase 0  →  User fills fields manually (this build)
 *   Phase 1  →  QR code decoded into a PaymentIntent
 *   Phase 2  →  Deep link / URL scheme decoded into a PaymentIntent
 *   Phase 3  →  dApp / merchant pushes a signed PaymentIntent
 *
 * The PaymentScreen never needs to know *which* phase it is in.
 * It only knows about PaymentIntents.
 *
 * ALL FIELDS ARE OPTIONAL. Null = user must fill. Non-null = pre-filled.
 * `locked` = true means the field cannot be edited by the user.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Intent sources — used for analytics and UI hints
// ─────────────────────────────────────────────────────────────────────────────
export const INTENT_SOURCE = {
  MANUAL: "manual", // Phase 0: user-entered
  QR: "qr", // Phase 1: scanned QR
  DEEP_LINK: "deep_link", // Phase 2: app URL scheme
  DAPP: "dapp", // Phase 3: connected dApp
  PUSH: "push", // Phase 3+: server-pushed request
};

// ─────────────────────────────────────────────────────────────────────────────
// Intent status — lifecycle of a PaymentIntent
// ─────────────────────────────────────────────────────────────────────────────
export const INTENT_STATUS = {
  DRAFT: "draft", // being assembled
  READY: "ready", // all required fields populated
  CONFIRMING: "confirming", // user reviewing
  SIGNED: "signed", // user approved, broadcasting
  COMPLETE: "complete", // on-chain confirmed
  EXPIRED: "expired", // expiresAt exceeded
  CANCELLED: "cancelled", // user dismissed
};

// ─────────────────────────────────────────────────────────────────────────────
// Fiat currencies supported for fiat-first input
// ─────────────────────────────────────────────────────────────────────────────
export const FIAT_CURRENCIES = {
  NGN: { symbol: "₦", code: "NGN", name: "Nigerian Naira", decimals: 2 },
  USD: { symbol: "$", code: "USD", name: "US Dollar", decimals: 2 },
  GBP: { symbol: "£", code: "GBP", name: "British Pound", decimals: 2 },
  EUR: { symbol: "€", code: "EUR", name: "Euro", decimals: 2 },
};

export const DEFAULT_FIAT_CURRENCY = "NGN";

// ─────────────────────────────────────────────────────────────────────────────
// Payment-friendly token whitelist
// Only stablecoins and payment-grade assets are shown on the Payment screen.
// Governance, LP, exotic, and speculative tokens are excluded.
//
// Each entry maps a lowercased symbol to metadata.
// Future: derive this from a verified on-chain registry.
// ─────────────────────────────────────────────────────────────────────────────
export const PAYMENT_TOKEN_ALLOWLIST = new Set([
  "usdt",
  "usdc",
  "usdc.e", // bridged USDC on some chains
  "dai",
  "busd",
  "pyusd",
  "tusd",
  "frax",
  "cngn", // Nigerian cNGN stablecoin
  "eurc",
  "gusd",
]);

/**
 * Returns true if a token is approved for use on the Payment screen.
 * Native tokens (ETH, BNB, POL etc.) are excluded — payments should
 * be in stable value. Future: allow native if user explicitly opts in.
 *
 * @param {{ symbol: string, isNative: boolean, source?: string }} token
 */
export const isPaymentToken = (token) => {
  if (token.isNative) return false;
  return PAYMENT_TOKEN_ALLOWLIST.has(token.symbol.toLowerCase());
};

// ─────────────────────────────────────────────────────────────────────────────
// Factory — create a blank PaymentIntent (Phase 0: manual mode)
// ─────────────────────────────────────────────────────────────────────────────
/**
 * createManualIntent()
 * Creates a PaymentIntent with no pre-filled data.
 * The user fills every field.
 */
export const createManualIntent = () => ({
  // ── Identity ────────────────────────────────────────────────────────────
  intentId: null, // Phase 1+: unique ID from QR / deep link / server
  source: INTENT_SOURCE.MANUAL,
  status: INTENT_STATUS.DRAFT,
  createdAt: Date.now(),
  expiresAt: null, // Phase 1+: expiry timestamp (ms). null = no expiry.

  // ── Merchant / Requestor metadata (Phase 1+) ──────────────────────────
  merchant: null,
  // Phase 1+: {
  //   name: string,
  //   logo: string | null,
  //   verified: boolean,
  //   website: string | null,
  //   reference: string | null,   // invoice number / order ID
  // }

  // ── Recipient ────────────────────────────────────────────────────────────
  recipient: null, // wallet address — user fills
  recipientLocked: false, // Phase 1+: true locks the field

  // Optional display alias for the recipient (Phase 1+)
  recipientLabel: null, // e.g. "Merchant Wallet", "@shop_name"

  // ── Asset ────────────────────────────────────────────────────────────────
  asset: null, // token object from availableTokens — user selects
  assetLocked: false, // Phase 1+: true locks the field

  // ── Amount ───────────────────────────────────────────────────────────────
  fiatAmount: "", // user-entered string
  fiatCurrency: DEFAULT_FIAT_CURRENCY, // "NGN" | "USD" | ...
  fiatAmountLocked: false, // Phase 1+: true locks the field

  tokenAmount: "", // derived from fiatAmount ÷ rate — display only

  // ── Reference (Phase 1+) ─────────────────────────────────────────────────
  reference: null, // order ID, invoice number, memo
  memo: null, // human-readable payment note

  // ── Resolved on-chain config (populated just before signing) ─────────────
  resolvedChain: null, // chain object matching asset.chainId
});

/**
 * createIntentFromQR(qrData)
 * Phase 1 stub — parse a QR payload into a PaymentIntent.
 *
 * @param {object} qrData  - decoded QR JSON
 * @returns {object}        - PaymentIntent
 */
export const createIntentFromQR = (qrData) => {
  // TODO Phase 1: implement EIP-681 / EIP-2304 / custom QR format parsing
  // For now, return a manual intent as fallback
  return {
    ...createManualIntent(),
    source: INTENT_SOURCE.QR,
    // recipient:       qrData.address       ?? null,
    // recipientLocked: !!qrData.address,
    // fiatAmount:      qrData.amount        ?? "",
    // fiatAmountLocked:!!qrData.amount,
    // reference:       qrData.reference     ?? null,
    // merchant:        qrData.merchant      ?? null,
  };
};

/**
 * createIntentFromDeepLink(url)
 * Phase 2 stub — parse a deep link URL into a PaymentIntent.
 *
 * @param {string} url  - e.g. "mywallet://pay?to=0x...&amount=500&currency=NGN"
 * @returns {object}     - PaymentIntent
 */
export const createIntentFromDeepLink = (url) => {
  // TODO Phase 2: implement URL parsing
  return {
    ...createManualIntent(),
    source: INTENT_SOURCE.DEEP_LINK,
  };
};

/**
 * isIntentExpired(intent)
 * Returns true if the intent has an expiry that has passed.
 */
export const isIntentExpired = (intent) => {
  if (!intent.expiresAt) return false;
  return Date.now() > intent.expiresAt;
};

/**
 * isIntentReady(intent)
 * Returns true when all required fields are populated and valid.
 */
export const isIntentReady = (intent) => {
  return (
    !!intent.recipient &&
    !!intent.asset &&
    !!intent.fiatAmount &&
    parseFloat(intent.fiatAmount) > 0 &&
    !!intent.tokenAmount &&
    parseFloat(intent.tokenAmount) > 0
  );
};
