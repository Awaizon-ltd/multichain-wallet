/**
 * constants/PaymentTokens.js
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * EDITABLE PAYMENT TOKEN REGISTRY
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * This is the single place to add, remove, or update payment tokens.
 * No DB query, no Alchemy scan — users don't need to import anything.
 *
 * TO ADD A NEW CHAIN:   add a new key under PAYMENT_TOKENS (key = chainId)
 * TO ADD A NEW TOKEN:   append an entry to the chain's array
 * TO DISABLE A TOKEN:   set enabled: false (it will be hidden but preserved)
 * TO ADD A NEW CHAIN:   match the chainId from your SUPPORTED_CHAINS constant
 *
 * Token logo URIs use Trust Wallet's open asset repo — always available,
 * no API key required. Swap for your own CDN if preferred.
 */

const TRUST =
  "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains";

// ─────────────────────────────────────────────────────────────────────────────
// Token definitions
// Each entry shape:
// {
//   symbol:   string       — display symbol
//   name:     string       — full name
//   address:  string       — checksummed ERC-20 contract address
//   decimals: number       — token decimals (almost always 6 for stables, 18 for DAI)
//   logo:     string|null  — image URI
//   enabled:  boolean      — set false to hide without deleting
// }
// ─────────────────────────────────────────────────────────────────────────────
export const PAYMENT_TOKENS = {
  // ── Ethereum Mainnet (1) ───────────────────────────────────────────────────
  1: [
    {
      symbol: "USDT",
      name: "Tether USD",
      address: "0xdAC17F958D2ee523a2206206994597C13D831ec7",
      decimals: 6,
      logo: `${TRUST}/ethereum/assets/0xdAC17F958D2ee523a2206206994597C13D831ec7/logo.png`,
      enabled: true,
    },
    {
      symbol: "USDC",
      name: "USD Coin",
      address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
      decimals: 6,
      logo: `${TRUST}/ethereum/assets/0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48/logo.png`,
      enabled: true,
    },
    {
      symbol: "DAI",
      name: "Dai Stablecoin",
      address: "0x6B175474E89094C44Da98b954EedeAC495271d0F",
      decimals: 18,
      logo: `${TRUST}/ethereum/assets/0x6B175474E89094C44Da98b954EedeAC495271d0F/logo.png`,
      enabled: true,
    },
  ],

  // ── Base (8453) ───────────────────────────────────────────────────────────
  8453: [
    {
      symbol: "USDC",
      name: "USD Coin",
      address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
      decimals: 6,
      logo: `${TRUST}/ethereum/assets/0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48/logo.png`,
      enabled: true,
    },
    {
      symbol: "USDT",
      name: "Tether USD",
      address: "0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2",
      decimals: 6,
      logo: `${TRUST}/ethereum/assets/0xdAC17F958D2ee523a2206206994597C13D831ec7/logo.png`,
      enabled: true,
    },
    {
      symbol: "DAI",
      name: "Dai Stablecoin",
      address: "0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb",
      decimals: 18,
      logo: `${TRUST}/ethereum/assets/0x6B175474E89094C44Da98b954EedeAC495271d0F/logo.png`,
      enabled: true,
    },
  ],

  // ── Arc (5042) / Robinhood Chain (4663) ────────────────────────────────────
  // No verified ERC-20 stablecoin contract addresses on either chain yet —
  // add entries here once confirmed (Arc's native asset is already USDC,
  // so the native/gas token itself covers USDC payments there).

  // ── Avalanche (43114) — uncomment AVALANCHE in Chain.js first ─────────────
  // 43114: [
  //   { symbol: "USDT", address: "0x9702230A8Ea53601f5cD2dc00fDBc13d4dF4A8c7", decimals: 6, ... },
  //   { symbol: "USDC", address: "0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E", decimals: 6, ... },
  //   { symbol: "DAI",  address: "0xd586E7F844cEa2F87f50152665BCbc2C279D8d70", decimals: 18, ... },
  // ],
};

// ─────────────────────────────────────────────────────────────────────────────
// Set of chain IDs that have payment token support.
// Derived from PAYMENT_TOKENS keys — single source of truth.
// Testnets (84532, 11155111) are intentionally excluded.
// ─────────────────────────────────────────────────────────────────────────────
export const PAYMENT_SUPPORTED_CHAIN_IDS = new Set(
  Object.keys(PAYMENT_TOKENS).map(Number),
);

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * getPaymentTokensForChain(chainId)
 * Returns enabled tokens for the given chain, or [] if chain not supported.
 *
 * @param {number|string} chainId
 * @returns {Array}
 */
export const getPaymentTokensForChain = (chainId) => {
  const tokens = PAYMENT_TOKENS[parseInt(chainId)];
  if (!tokens) return [];
  return tokens.filter((t) => t.enabled !== false);
};

/**
 * isSupportedPaymentChain(chainId)
 * Returns true if the active chain has any enabled payment tokens.
 *
 * @param {number|string} chainId
 * @returns {boolean}
 */
export const isSupportedPaymentChain = (chainId) => {
  return getPaymentTokensForChain(chainId).length > 0;
};

/**
 * getDefaultPaymentToken(chainId)
 * Returns the preferred default token for a chain.
 * Preference order: USDC → USDT → first available.
 *
 * @param {number|string} chainId
 * @returns {object|null}
 */
export const getDefaultPaymentToken = (chainId) => {
  const tokens = getPaymentTokensForChain(chainId);
  if (!tokens.length) return null;
  return (
    tokens.find((t) => t.symbol === "USDC") ??
    tokens.find((t) => t.symbol === "USDT") ??
    tokens[0]
  );
};
