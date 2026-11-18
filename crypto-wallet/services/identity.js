// services/identity.js
// Client for wallet identities (backend: routes/identityRoutes.js).
//
// Linking a username means proving ownership: the backend issues a one-time
// challenge, this signs it with the account's EVM key AND its Solana key, and
// the backend verifies both before linking. The signatures exist only as
// local variables inside proveAndLink() — they're never stored, cached,
// logged, or kept in React state.
import { ed25519 } from "@noble/curves/ed25519.js";
import { base58 } from "@scure/base";
import { API_CONFIG } from "../config/api";

const BASE = API_CONFIG.BASE_URL;

const request = async (path, { method = "GET", body } = {}) => {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw Object.assign(new Error(json.message || `Request failed (${res.status})`), {
      status: res.status,
      code: json.code,
    });
  }
  return json.data;
};

/** Identity linked to this address (EVM or Solana), or null. */
export const getIdentityByAddress = async (address) => {
  try {
    return await request(`/identity/by-address?address=${encodeURIComponent(address)}`);
  } catch (err) {
    if (err.status === 404) return null;
    throw err;
  }
};

/** Live check for the username field → { username, available, reason } */
export const checkUsername = (username, evmAddress) =>
  request(
    `/identity/check?username=${encodeURIComponent(username)}&evm_address=${encodeURIComponent(evmAddress || "")}`,
  );

/** One-time message to sign → { nonce, message, username, expiresAt } */
export const requestChallenge = ({ username, evmAddress, solanaAddress }) =>
  request("/identity/challenge", {
    method: "POST",
    body: { username, evm_address: evmAddress, solana_address: solanaAddress },
  });

/**
 * Sign the challenge with both keys and link. Returns the identity.
 * @param {object} p
 * @param {object} p.challenge     from requestChallenge()
 * @param {object} p.evmSigner     ethers Signer (createSignerForTransaction)
 * @param {object} p.solanaKeypair web3.js Keypair (createSolanaSignerForTransaction)
 * @param {function} p.onStep      progress: "evm" | "solana" | "verify"
 */
export const proveAndLink = async ({ challenge, evmSigner, solanaKeypair, onStep }) => {
  onStep?.("evm");
  // EIP-191 personal_sign
  const evmSignature = await evmSigner.signMessage(challenge.message);

  onStep?.("solana");
  // ed25519 over the same UTF-8 bytes (the first 32 bytes of a Solana
  // secret key are its ed25519 seed)
  const solanaSignature = base58.encode(
    ed25519.sign(new TextEncoder().encode(challenge.message), solanaKeypair.secretKey.slice(0, 32)),
  );

  onStep?.("verify");
  return request("/identity/bind", {
    method: "POST",
    body: {
      nonce: challenge.nonce,
      evm_signature: evmSignature,
      solana_signature: solanaSignature,
    },
  });
};
