const pool = require("../config/pool");

// All supported chains share the EVM 0x address format
const EVM_ADDRESS_PATTERN = /^0x[a-fA-F0-9]{40}$/;

/**
 * Validate an EVM wallet address.
 * All supported chains (ETH, POL, BNB, AVAX, ARB, OP, Base, MNT, ZETA, HYPE)
 * use identical 0x + 40 hex char format — one validation covers all.
 */
function isValidWalletAddress(address) {
  return EVM_ADDRESS_PATTERN.test(address);
}

/**
 * Map a PostgreSQL constraint error to a typed app error.
 */
function mapPgError(err) {
  if (err.code === "23505") {
    const detail = err.detail || "";
    if (detail.includes("email"))
      return {
        status: 409,
        code: "EMAIL_ALREADY_BOUND",
        message: "This email is already bound to a wallet.",
      };
    if (detail.includes("wallet_address"))
      return {
        status: 409,
        code: "WALLET_ALREADY_BOUND",
        message: "This wallet address is already bound to another account.",
      };
    if (detail.includes("username"))
      return {
        status: 409,
        code: "USERNAME_TAKEN",
        message: "This username is already taken.",
      };
  }
  if (err.code === "23514") {
    return {
      status: 422,
      code: "DB_CONSTRAINT_FAILED",
      message: `Input failed a database constraint: ${err.constraint || ""}`,
    };
  }
  return null;
}

/**
 * Bind a username + email to an EVM wallet address.
 * chain defaults to 'EVM' — the binding is valid across all EVM-compatible chains.
 *
 * @param {{ username: string, email: string, wallet_address: string }} payload
 * @returns {Promise<object>} created user row
 */
async function bindWallet({ username, email, wallet_address }) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const { rows } = await client.query(
      `INSERT INTO users (username, email, wallet_address, chain)
       VALUES ($1, $2, $3, 'EVM')
       RETURNING id, username, email, wallet_address, chain, created_at`,
      [
        username.toLowerCase().trim(),
        email.toLowerCase().trim(),
        wallet_address.trim(),
      ],
    );

    await client.query("COMMIT");
    return rows[0];
  } catch (err) {
    await client.query("ROLLBACK");
    const mapped = mapPgError(err);
    if (mapped) {
      const error = new Error(mapped.message);
      error.status = mapped.status;
      error.code = mapped.code;
      throw error;
    }
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Resolve a wallet address from an email OR a username.
 * Detects type: strings with '@' → email lookup, else → username lookup.
 *
 * @param {string} emailOrUsername
 * @returns {Promise<object | null>}
 */
async function resolveWallet(emailOrUsername) {
  const value = emailOrUsername.toLowerCase().trim();
  const column = value.includes("@") ? "email" : "username";

  const { rows } = await pool.query(
    `SELECT id, username, email, wallet_address, chain, created_at
     FROM users
     WHERE ${column} = $1`,
    [value],
  );

  return rows[0] || null;
}

/**
 * Resolve a user record by wallet address.
 * Used on screen load to check if this wallet is already bound.
 *
 * @param {string} walletAddress
 * @returns {Promise<object | null>}
 */
async function resolveByWalletAddress(walletAddress) {
  const { rows } = await pool.query(
    `SELECT id, username, email, wallet_address, chain, created_at
     FROM users
     WHERE wallet_address = $1`,
    [walletAddress.trim()],
  );
  return rows[0] || null;
}

module.exports = {
  bindWallet,
  resolveWallet,
  resolveByWalletAddress,
  isValidWalletAddress,
};
