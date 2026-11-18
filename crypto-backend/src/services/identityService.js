// services/identityService.js
// ─────────────────────────────────────────────────────────────────────────────
// Username identities, proven by signature.
//
// A wallet account (its EVM address + its Solana address) gets a username
// only after the server has verified that BOTH keys signed a one-time
// challenge:
//
//   1. createChallenge({ username, evmAddress, solanaAddress })
//        → { nonce, message }  — the exact text to sign, bound to the
//          username, both addresses, a random nonce and a 5-minute expiry
//   2. the app signs `message` with each key (EIP-191 / ed25519)
//   3. bindIdentity({ nonce, evmSignature, solanaSignature })
//        → verifies both against the challenge's addresses, then writes the
//          identity row
//
// Signatures are verified in memory and dropped. They are never stored,
// logged, or put into an error — the identities table doesn't even have a
// column for them. A challenge is single-use: it's deleted the moment a bind
// is attempted, success or not, so a signature can't be replayed.
//
// Each account is its own identity. Switching to another account in the app
// means signing (and binding) again, as a separate row with its own username.
// Re-signing with an already-bound account changes that account's username.
// ─────────────────────────────────────────────────────────────────────────────

const crypto = require("crypto");
const { ethers } = require("ethers");
const pool = require("../config/pool");
const { isValidSolanaAddress } = require("../utils/solana");

const CHALLENGE_TTL_MS = 5 * 60 * 1000;
const MAX_PENDING_CHALLENGES = 10_000; // memory bound under abuse

const USERNAME_RE = /^[a-z0-9_]{3,20}$/;
const EVM_RE = /^0x[a-fA-F0-9]{40}$/;
const RESERVED = new Set([
  "admin", "administrator", "rizon", "awarizon", "support", "help", "official",
  "team", "security", "wallet", "system", "root", "staff", "mod", "moderator",
]);

const appError = (status, code, message) =>
  Object.assign(new Error(message), { status, code });

/** "@Alice " → "alice" */
const normalizeUsername = (raw) =>
  String(raw ?? "").trim().replace(/^@/, "").toLowerCase();

const usernameProblem = (username) => {
  if (!USERNAME_RE.test(username))
    return "Usernames are 3–20 characters: letters, numbers and underscores.";
  if (RESERVED.has(username)) return "That username is reserved.";
  return null;
};

/* =========================================================
   Base58 (Solana addresses + signatures) — decode only
========================================================= */
const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const B58_MAP = Object.fromEntries([...B58].map((c, i) => [c, BigInt(i)]));

const base58Decode = (str) => {
  let n = 0n;
  for (const ch of str) {
    const v = B58_MAP[ch];
    if (v === undefined) throw new Error("invalid base58");
    n = n * 58n + v;
  }
  const bytes = [];
  while (n > 0n) {
    bytes.unshift(Number(n & 0xffn));
    n >>= 8n;
  }
  for (const ch of str) {
    if (ch !== "1") break;
    bytes.unshift(0); // leading zero bytes
  }
  return Buffer.from(bytes);
};

/* =========================================================
   Signature checks
========================================================= */

// EIP-191 personal_sign — what ethers' signer.signMessage() produces
const verifyEvm = (message, signature, evmAddress) => {
  try {
    const recovered = ethers.utils.verifyMessage(message, signature);
    return recovered.toLowerCase() === evmAddress.toLowerCase();
  } catch {
    return false;
  }
};

// Raw 32-byte ed25519 key → Node KeyObject (SPKI DER = fixed prefix + key)
const ED25519_SPKI_PREFIX = Buffer.from("302a300506032b6570032100", "hex");

const verifySolana = (message, signatureB58, solanaAddress) => {
  try {
    const pub = base58Decode(solanaAddress);
    const sig = base58Decode(signatureB58);
    if (pub.length !== 32 || sig.length !== 64) return false;
    const key = crypto.createPublicKey({
      key: Buffer.concat([ED25519_SPKI_PREFIX, pub]),
      format: "der",
      type: "spki",
    });
    return crypto.verify(null, Buffer.from(message, "utf8"), key, sig);
  } catch {
    return false;
  }
};

/* =========================================================
   Challenges (in memory, single-use, 5 min)
   NOTE: one backend instance. Behind a load balancer with several
   instances, move this Map to Redis/Postgres (it holds no secrets —
   just the message to be signed).
========================================================= */
const challenges = new Map(); // nonce → { username, evm, solana, message, expiresAt }

const sweep = () => {
  const now = Date.now();
  for (const [nonce, c] of challenges) if (c.expiresAt < now) challenges.delete(nonce);
};
setInterval(sweep, 60_000).unref?.();

const buildMessage = ({ username, evm, solana, nonce, issuedAt, expiresAt }) =>
  [
    `Rizon wants you to link this wallet to @${username}`,
    "",
    `EVM address: ${evm}`,
    `Solana address: ${solana}`,
    "",
    "Signing proves you own both addresses. It's free, sends no transaction, and the signature is never stored.",
    "",
    `Nonce: ${nonce}`,
    `Issued at: ${new Date(issuedAt).toISOString()}`,
    `Expires at: ${new Date(expiresAt).toISOString()}`,
  ].join("\n");

/* =========================================================
   Reads
========================================================= */

const PUBLIC_COLUMNS = "username, evm_address, solana_address, verified_at";

const getByUsername = async (raw) => {
  const username = normalizeUsername(raw);
  if (!USERNAME_RE.test(username)) return null;
  const { rows } = await pool.query(
    `SELECT ${PUBLIC_COLUMNS} FROM identities WHERE username = $1`,
    [username],
  );
  return rows[0] || null;
};

/** EVM (any case) or Solana address → identity */
const getByAddress = async (address) => {
  const a = String(address ?? "").trim();
  if (EVM_RE.test(a)) {
    const { rows } = await pool.query(
      `SELECT ${PUBLIC_COLUMNS} FROM identities WHERE evm_address = $1`,
      [a.toLowerCase()],
    );
    return rows[0] || null;
  }
  if (isValidSolanaAddress(a)) {
    const { rows } = await pool.query(
      `SELECT ${PUBLIC_COLUMNS} FROM identities WHERE solana_address = $1`,
      [a],
    );
    return rows[0] || null;
  }
  return null;
};

/** For the username field's live check */
const checkUsername = async (raw, { evmAddress } = {}) => {
  const username = normalizeUsername(raw);
  const problem = usernameProblem(username);
  if (problem) return { username, available: false, reason: problem };
  const owner = await getByUsername(username);
  // "Available" to its own account (keeping the same name is fine)
  const mine = owner && evmAddress && owner.evm_address === evmAddress.toLowerCase();
  return {
    username,
    available: !owner || !!mine,
    reason: owner && !mine ? "That username is taken." : null,
  };
};

/* =========================================================
   Writes
========================================================= */

const createChallenge = async ({ username: rawUsername, evmAddress, solanaAddress }) => {
  const username = normalizeUsername(rawUsername);
  const problem = usernameProblem(username);
  if (problem) throw appError(422, "INVALID_USERNAME", problem);
  if (!EVM_RE.test(evmAddress || ""))
    throw appError(422, "INVALID_EVM_ADDRESS", "A valid EVM address is required.");
  if (!isValidSolanaAddress(solanaAddress))
    throw appError(422, "INVALID_SOLANA_ADDRESS", "A valid Solana address is required.");

  const evm = ethers.utils.getAddress(evmAddress); // checksummed, for display
  const { available, reason } = await checkUsername(username, { evmAddress: evm });
  if (!available) throw appError(409, "USERNAME_TAKEN", reason);

  // Each address may belong to only one identity — and only paired with
  // its own partner (the same account's other address).
  const [byEvm, bySol] = await Promise.all([getByAddress(evm), getByAddress(solanaAddress)]);
  if ((byEvm && byEvm.solana_address !== solanaAddress) || (bySol && bySol.evm_address !== evm.toLowerCase())) {
    throw appError(409, "ADDRESS_ALREADY_BOUND", "One of these addresses is already linked to a different account.");
  }

  sweep();
  if (challenges.size >= MAX_PENDING_CHALLENGES)
    throw appError(503, "BUSY", "Too many pending verifications. Try again in a minute.");

  const nonce = crypto.randomBytes(16).toString("hex");
  const issuedAt = Date.now();
  const expiresAt = issuedAt + CHALLENGE_TTL_MS;
  const message = buildMessage({ username, evm, solana: solanaAddress, nonce, issuedAt, expiresAt });
  challenges.set(nonce, { username, evm, solana: solanaAddress, message, expiresAt });

  return { nonce, message, username, expiresAt: new Date(expiresAt).toISOString() };
};

/**
 * Verify both signatures over the challenge and bind. Returns the identity.
 * The signatures are only ever held in this function's arguments.
 */
const bindIdentity = async ({ nonce, evmSignature, solanaSignature }) => {
  const challenge = challenges.get(nonce);
  challenges.delete(nonce); // single use, whatever happens next
  if (!challenge || challenge.expiresAt < Date.now()) {
    throw appError(410, "CHALLENGE_EXPIRED", "This verification expired. Please try again.");
  }

  const { username, evm, solana, message } = challenge;
  if (!verifyEvm(message, evmSignature, evm)) {
    throw appError(401, "BAD_EVM_SIGNATURE", "The EVM signature doesn't match this wallet.");
  }
  if (!verifySolana(message, solanaSignature, solana)) {
    throw appError(401, "BAD_SOLANA_SIGNATURE", "The Solana signature doesn't match this wallet.");
  }

  try {
    // Same account again (both addresses match) → rename; otherwise new row
    const { rows } = await pool.query(
      `INSERT INTO identities (username, evm_address, solana_address)
       VALUES ($1, $2, $3)
       ON CONFLICT ON CONSTRAINT uq_identities_evm DO UPDATE
         SET username = EXCLUDED.username, verified_at = NOW(), updated_at = NOW()
         WHERE identities.solana_address = EXCLUDED.solana_address
       RETURNING ${PUBLIC_COLUMNS}`,
      [username, evm.toLowerCase(), solana],
    );
    if (!rows[0]) {
      throw appError(409, "ADDRESS_ALREADY_BOUND", "This EVM address is linked to a different account.");
    }
    return rows[0];
  } catch (err) {
    if (err.code === "23505") {
      const detail = `${err.constraint || ""} ${err.detail || ""}`;
      if (detail.includes("username"))
        throw appError(409, "USERNAME_TAKEN", "That username was just taken. Pick another.");
      throw appError(409, "ADDRESS_ALREADY_BOUND", "One of these addresses is already linked to a different account.");
    }
    throw err;
  }
};

module.exports = {
  createChallenge,
  bindIdentity,
  getByUsername,
  getByAddress,
  checkUsername,
  normalizeUsername,
  // exported for tests
  verifyEvm,
  verifySolana,
  base58Decode,
};
