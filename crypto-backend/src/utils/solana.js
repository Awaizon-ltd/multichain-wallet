// utils/solana.js
// ─────────────────────────────────────────────────────────────────────────────
// Solana identifiers used across the swap/bridge controllers.
//
// Solana has no EVM chain id, and every party uses a different one:
//   • the app            → "SOLANA"            (crypto-wallet/constants/nonEvmChain.js `key`)
//   • LI.FI              → 1151111081099710    (GET li.quest/v1/chains?chainTypes=SVM)
//   • tokens/solana.json → 501000101           (also what swap tracking stores —
//                                               it fits the INTEGER chain_id column)
// isSolanaChainId() accepts all of them; the app always sends "SOLANA".
// ─────────────────────────────────────────────────────────────────────────────

const SOLANA_APP_CHAIN_ID = "SOLANA";
const LIFI_SOLANA_CHAIN_ID = 1151111081099710;
const SOLANA_TOKEN_LIST_CHAIN_ID = 501000101;

// Wrapped SOL mint. The app uses it as native SOL's address: Jupiter wraps
// and unwraps automatically (wrapAndUnwrapSol), so the user only ever sees SOL.
const WSOL_MINT = "So11111111111111111111111111111111111111112";
// LI.FI's address for native SOL (the System Program id), NOT the wSOL mint.
const LIFI_NATIVE_SOL = "11111111111111111111111111111111";

const SOLANA_ALIASES = new Set([
  "solana",
  "sol",
  String(LIFI_SOLANA_CHAIN_ID),
  String(SOLANA_TOKEN_LIST_CHAIN_ID),
]);

const isSolanaChainId = (chainId) =>
  chainId != null && SOLANA_ALIASES.has(String(chainId).trim().toLowerCase());

// Base58, 32–44 chars (no 0, O, I, l). Shape check only — good enough to
// reject EVM addresses and typos before they reach Jupiter/LI.FI.
const SOLANA_ADDRESS_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const isValidSolanaAddress = (addr) =>
  typeof addr === "string" && SOLANA_ADDRESS_RE.test(addr);

// A transaction signature is 64 bytes → 86–88 base58 chars.
const SOLANA_SIGNATURE_RE = /^[1-9A-HJ-NP-Za-km-z]{86,88}$/;
const isValidSolanaSignature = (sig) =>
  typeof sig === "string" && SOLANA_SIGNATURE_RE.test(sig);

const EVM_NATIVE_ADDRESSES = new Set([
  "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
  "0x0000000000000000000000000000000000000000",
]);

// Native SOL can arrive as the wSOL mint, LI.FI's system-program address,
// "SOL", or (from shared EVM code paths) the 0xEeee… native placeholder.
const isNativeSol = (token) => {
  if (!token) return true;
  const t = String(token).trim();
  return (
    t === WSOL_MINT ||
    t === LIFI_NATIVE_SOL ||
    t.toUpperCase() === "SOL" ||
    EVM_NATIVE_ADDRESSES.has(t.toLowerCase())
  );
};

/** Token address in the form Jupiter expects (a mint; native SOL = wSOL). */
const toJupiterMint = (token) => (isNativeSol(token) ? WSOL_MINT : token);

/** Token address in the form LI.FI expects on Solana. */
const toLifiSolanaToken = (token) =>
  isNativeSol(token) ? LIFI_NATIVE_SOL : token;

/** Map an app chain id to LI.FI's (Solana → 1151111081099710, EVM unchanged). */
const toLifiChainId = (chainId) =>
  isSolanaChainId(chainId) ? LIFI_SOLANA_CHAIN_ID : chainId;

module.exports = {
  SOLANA_APP_CHAIN_ID,
  LIFI_SOLANA_CHAIN_ID,
  SOLANA_TOKEN_LIST_CHAIN_ID,
  WSOL_MINT,
  LIFI_NATIVE_SOL,
  isSolanaChainId,
  isValidSolanaAddress,
  isValidSolanaSignature,
  isNativeSol,
  toJupiterMint,
  toLifiSolanaToken,
  toLifiChainId,
};
