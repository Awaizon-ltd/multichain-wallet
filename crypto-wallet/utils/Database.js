// utils/Database.js
import * as SQLite from "expo-sqlite";
import { APP_CONFIG } from "../constants/Config";

let db = null;

// Database version for migrations
const CURRENT_DB_VERSION = 11; // Updated: Changed tokens.user_id to TEXT for wallet addresses

export const initDatabase = async () => {
  try {
    db = await SQLite.openDatabaseAsync(APP_CONFIG.DB_NAME);

    // Check current database version
    const versionResult = await db.getFirstAsync("PRAGMA user_version");
    const currentVersion = versionResult.user_version || 0;

    console.log("[Database] 🔧 Current version:", currentVersion);

    // Initial schema creation
    await db.execAsync(`
      PRAGMA journal_mode = WAL;
      
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        uid TEXT UNIQUE NOT NULL,
        email TEXT NOT NULL,
        username TEXT,
        display_name TEXT,
        bio TEXT,
        profile_image_url TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      
      CREATE TABLE IF NOT EXISTS wallets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        address TEXT NOT NULL,
        encrypted_data TEXT NOT NULL,
        salt TEXT NOT NULL,
        is_primary INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
      );
      
      CREATE TABLE IF NOT EXISTS transactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        wallet_id INTEGER NOT NULL,
        chain_id INTEGER NOT NULL,
        tx_hash TEXT NOT NULL,
        from_address TEXT NOT NULL,
        to_address TEXT NOT NULL,
        amount TEXT NOT NULL,
        gas_used TEXT,
        gas_price TEXT,
        status TEXT NOT NULL,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (wallet_id) REFERENCES wallets (id) ON DELETE CASCADE
      );
      
      CREATE TABLE IF NOT EXISTS contacts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        address TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
      );
      
      CREATE TABLE IF NOT EXISTS tokens (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        chain_id INTEGER NOT NULL,
        address TEXT NOT NULL,
        name TEXT NOT NULL,
        symbol TEXT NOT NULL,
        decimals INTEGER NOT NULL,
        logo TEXT,
        is_visible INTEGER DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, chain_id, address)
      );
    `);

    // Run migrations
    await runMigrations(currentVersion);

    // Create indexes
    await createIndexes();

    console.log("[Database] ✅ Database initialized");
    return db;
  } catch (error) {
    console.error("[Database] ❌ Initialization error:", error);
    throw error;
  }
};

const runMigrations = async (currentVersion) => {
  try {
    // Migration to version 11: Change tokens.user_id to TEXT for wallet addresses
    if (currentVersion < 11) {
      console.log(
        "[Database] 🔄 Running migration 11: Convert tokens.user_id to wallet addresses",
      );

      try {
        // Check if we need to migrate
        const tableInfo = await db.getAllAsync("PRAGMA table_info(tokens)");
        const userIdColumn = tableInfo.find((col) => col.name === "user_id");

        if (userIdColumn && userIdColumn.type === "INTEGER") {
          console.log(
            "[Database] 🔄 Migrating tokens table to use wallet addresses",
          );

          // Create new table with TEXT user_id
          await db.execAsync(`
            CREATE TABLE tokens_new (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              user_id TEXT NOT NULL,
              chain_id INTEGER NOT NULL,
              address TEXT NOT NULL,
              name TEXT NOT NULL,
              symbol TEXT NOT NULL,
              decimals INTEGER NOT NULL,
              logo TEXT,
              is_visible INTEGER DEFAULT 1,
              created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
              UNIQUE(user_id, chain_id, address)
            );
          `);

          // Note: Old data with INTEGER user_ids will be lost
          // If you need to preserve it, you'd need to map old user IDs to wallet addresses
          console.log(
            "[Database] ⚠️ Old token data will be cleared (user_id type changed)",
          );

          // Drop old table and rename new one
          await db.execAsync(`
            DROP TABLE tokens;
            ALTER TABLE tokens_new RENAME TO tokens;
          `);

          console.log(
            "[Database] ✅ Tokens table migrated to use wallet addresses",
          );
        } else {
          console.log(
            "[Database] ℹ️ Tokens table already uses TEXT for user_id",
          );
        }
      } catch (error) {
        console.error("[Database] ❌ Error in migration 11:", error);
        throw error;
      }

      await db.execAsync("PRAGMA user_version = 11");
      console.log("[Database] ✅ Migration 11 complete");
    }

    console.log("[Database] ✅ All migrations complete");
  } catch (error) {
    console.error("[Database] ❌ Migration error:", error);
    throw error;
  }
};

const createIndexes = async () => {
  try {
    await db.execAsync(`
      CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
      CREATE INDEX IF NOT EXISTS idx_users_uid ON users(uid);
      CREATE INDEX IF NOT EXISTS idx_wallets_user_id ON wallets(user_id);
      CREATE INDEX IF NOT EXISTS idx_wallets_address ON wallets(address);
      CREATE INDEX IF NOT EXISTS idx_transactions_wallet_id ON transactions(wallet_id);
      CREATE INDEX IF NOT EXISTS idx_transactions_tx_hash ON transactions(tx_hash);
      CREATE INDEX IF NOT EXISTS idx_contacts_user_id ON contacts(user_id);
      CREATE INDEX IF NOT EXISTS idx_tokens_user_chain ON tokens(user_id, chain_id);
      CREATE INDEX IF NOT EXISTS idx_tokens_address ON tokens(address);
    `);
    console.log("[Database] ✅ Indexes created");
  } catch (error) {
    console.error("[Database] ❌ Error creating indexes:", error);
  }
};

export const getDatabase = () => {
  if (!db) {
    throw new Error("Database not initialized. Call initDatabase() first.");
  }
  return db;
};

// ============ USER OPERATIONS ============

export const saveUser = async (uid, email, profileData = {}) => {
  const db = getDatabase();

  console.log("[Database] 💾 Saving/updating user:", uid);

  // First, check if user exists
  const existingUser = await db.getFirstAsync(
    "SELECT * FROM users WHERE uid = ?",
    [uid],
  );

  if (existingUser) {
    console.log("[Database] ✅ User exists, updating:", existingUser.id);

    // Update existing user
    await db.runAsync(
      `UPDATE users 
       SET email = ?, 
           username = ?, 
           display_name = ?, 
           bio = ?, 
           profile_image_url = ?,
           updated_at = CURRENT_TIMESTAMP
       WHERE uid = ?`,
      [
        email,
        profileData.username || existingUser.username,
        profileData.displayName || existingUser.display_name,
        profileData.bio || existingUser.bio,
        profileData.profileImageUrl || existingUser.profile_image_url,
        uid,
      ],
    );

    console.log("[Database] ✅ User updated");
    return existingUser.id;
  } else {
    console.log("[Database] ➕ Creating new user");

    // Insert new user
    const result = await db.runAsync(
      `INSERT INTO users 
       (uid, email, username, display_name, bio, profile_image_url, created_at, updated_at) 
       VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      [
        uid,
        email,
        profileData.username || null,
        profileData.displayName || null,
        profileData.bio || null,
        profileData.profileImageUrl || null,
      ],
    );

    console.log(
      "[Database] ✅ New user created with ID:",
      result.lastInsertRowId,
    );
    return result.lastInsertRowId;
  }
};

export const getUserByUid = async (uid) => {
  const db = getDatabase();
  return await db.getFirstAsync("SELECT * FROM users WHERE uid = ?", [uid]);
};

export const getUserByUsername = async (username) => {
  const db = getDatabase();
  return await db.getFirstAsync("SELECT * FROM users WHERE username = ?", [
    username,
  ]);
};

export const updateUserProfile = async (uid, profileData) => {
  const db = getDatabase();
  const fields = [];
  const values = [];

  if (profileData.username !== undefined) {
    fields.push("username = ?");
    values.push(profileData.username);
  }
  if (profileData.displayName !== undefined) {
    fields.push("display_name = ?");
    values.push(profileData.displayName);
  }
  if (profileData.bio !== undefined) {
    fields.push("bio = ?");
    values.push(profileData.bio);
  }
  if (profileData.profileImageUrl !== undefined) {
    fields.push("profile_image_url = ?");
    values.push(profileData.profileImageUrl);
  }

  if (fields.length === 0) return;

  fields.push("updated_at = CURRENT_TIMESTAMP");
  values.push(uid);

  await db.runAsync(
    `UPDATE users SET ${fields.join(", ")} WHERE uid = ?`,
    values,
  );
};

export const checkLocalUsernameExists = async (username) => {
  const db = getDatabase();
  const result = await db.getFirstAsync(
    "SELECT COUNT(*) as count FROM users WHERE username = ?",
    [username],
  );
  return result.count > 0;
};

// ============ WALLET OPERATIONS ============

export const saveWallet = async (
  userId,
  name,
  address,
  encryptedData,
  salt,
  isPrimary = false,
) => {
  const db = getDatabase();

  if (isPrimary) {
    await db.runAsync("UPDATE wallets SET is_primary = 0 WHERE user_id = ?", [
      userId,
    ]);
  }

  const result = await db.runAsync(
    "INSERT INTO wallets (user_id, name, address, encrypted_data, salt, is_primary) VALUES (?, ?, ?, ?, ?, ?)",
    [userId, name, address, encryptedData, salt, isPrimary ? 1 : 0],
  );
  return result.lastInsertRowId;
};

export const getWalletsByUserId = async (userId) => {
  const db = getDatabase();
  return await db.getAllAsync(
    "SELECT * FROM wallets WHERE user_id = ? ORDER BY is_primary DESC, created_at DESC",
    [userId],
  );
};

export const getPrimaryWallet = async (userId) => {
  const db = getDatabase();
  return await db.getFirstAsync(
    "SELECT * FROM wallets WHERE user_id = ? AND is_primary = 1",
    [userId],
  );
};

export const updateWalletName = async (walletId, name) => {
  const db = getDatabase();
  await db.runAsync("UPDATE wallets SET name = ? WHERE id = ?", [
    name,
    walletId,
  ]);
};

export const deleteWallet = async (walletId) => {
  const db = getDatabase();
  await db.runAsync("DELETE FROM wallets WHERE id = ?", [walletId]);
};

// ============ TRANSACTION OPERATIONS ============

export const saveTransaction = async (walletId, chainId, txData) => {
  const db = getDatabase();
  const result = await db.runAsync(
    "INSERT INTO transactions (wallet_id, chain_id, tx_hash, from_address, to_address, amount, gas_used, gas_price, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    [
      walletId,
      chainId,
      txData.hash,
      txData.from,
      txData.to,
      txData.amount,
      txData.gasUsed || null,
      txData.gasPrice || null,
      txData.status,
    ],
  );
  return result.lastInsertRowId;
};

export const getTransactionsByWallet = async (walletId, limit = 50) => {
  const db = getDatabase();
  return await db.getAllAsync(
    "SELECT * FROM transactions WHERE wallet_id = ? ORDER BY timestamp DESC LIMIT ?",
    [walletId, limit],
  );
};

export const updateTransactionStatus = async (
  txHash,
  status,
  gasUsed,
  gasPrice,
) => {
  const db = getDatabase();
  await db.runAsync(
    "UPDATE transactions SET status = ?, gas_used = ?, gas_price = ? WHERE tx_hash = ?",
    [status, gasUsed, gasPrice, txHash],
  );
};

// ============ CONTACT OPERATIONS ============

export const saveContact = async (userId, name, address) => {
  const db = getDatabase();
  const result = await db.runAsync(
    "INSERT INTO contacts (user_id, name, address) VALUES (?, ?, ?)",
    [userId, name, address],
  );
  return result.lastInsertRowId;
};

export const getContactsByUserId = async (userId) => {
  const db = getDatabase();
  return await db.getAllAsync(
    "SELECT * FROM contacts WHERE user_id = ? ORDER BY name",
    [userId],
  );
};

export const deleteContact = async (contactId) => {
  const db = getDatabase();
  await db.runAsync("DELETE FROM contacts WHERE id = ?", [contactId]);
};

// ============ TOKEN OPERATIONS ============

/**
 * Save a token for a wallet address
 * @param {string} userAddress - Wallet address (0x...)
 * @param {number|string} chainId - Chain ID
 * @param {object} tokenData - Token data (address, name, symbol, decimals, logo)
 */
export const saveToken = async (userAddress, chainId, tokenData) => {
  const db = getDatabase();

  // Normalize inputs
  const normalizedAddress = userAddress.toLowerCase();
  const normalizedChainId = parseInt(chainId);
  const normalizedTokenAddress = tokenData.address.toLowerCase();

  console.log("[Database] 💾 ========== SAVE TOKEN ==========");
  console.log("[Database] 💾 Input:", {
    userAddress: normalizedAddress,
    chainId: normalizedChainId,
    tokenAddress: normalizedTokenAddress,
    symbol: tokenData.symbol,
  });

  try {
    const result = await db.runAsync(
      "INSERT OR REPLACE INTO tokens (user_id, chain_id, address, name, symbol, decimals, logo) VALUES (?, ?, ?, ?, ?, ?, ?)",
      [
        normalizedAddress,
        normalizedChainId,
        normalizedTokenAddress,
        tokenData.name,
        tokenData.symbol,
        parseInt(tokenData.decimals),
        tokenData.logo || null,
      ],
    );

    console.log("[Database] ✅ Token saved with ID:", result.lastInsertRowId);
    return result.lastInsertRowId;
  } catch (error) {
    console.error("[Database] ❌ Error saving token:", error);
    throw error;
  }
};

/**
 * Get tokens for a wallet address on a specific chain
 * @param {string} userAddress - Wallet address (0x...)
 * @param {number|string} chainId - Chain ID
 */
export const getTokensByChain = async (userAddress, chainId) => {
  const db = getDatabase();
  const normalizedAddress = userAddress.toLowerCase();
  const normalizedChainId = parseInt(chainId);

  return await db.getAllAsync(
    "SELECT * FROM tokens WHERE LOWER(user_id) = ? AND chain_id = ? AND is_visible = 1 ORDER BY symbol",
    [normalizedAddress, normalizedChainId],
  );
};

/**
 * Get all tokens for a wallet address
 * @param {string} userAddress - Wallet address (0x...)
 */
export const getAllTokens = async (userAddress) => {
  const db = getDatabase();
  const normalizedAddress = userAddress.toLowerCase();

  return await db.getAllAsync(
    "SELECT * FROM tokens WHERE LOWER(user_id) = ? AND is_visible = 1 ORDER BY chain_id, symbol",
    [normalizedAddress],
  );
};

export const deleteToken = async (tokenId) => {
  const db = getDatabase();
  await db.runAsync("DELETE FROM tokens WHERE id = ?", [tokenId]);
};

export const hideToken = async (tokenId) => {
  const db = getDatabase();
  await db.runAsync("UPDATE tokens SET is_visible = 0 WHERE id = ?", [tokenId]);
};

export const showToken = async (tokenId) => {
  const db = getDatabase();
  await db.runAsync("UPDATE tokens SET is_visible = 1 WHERE id = ?", [tokenId]);
};

// ============ UTILITY OPERATIONS ============

export const clearAllData = async () => {
  const db = getDatabase();
  await db.execAsync(`
    DELETE FROM tokens;
    DELETE FROM contacts;
    DELETE FROM transactions;
    DELETE FROM wallets;
    DELETE FROM users;
  `);
  console.log("[Database] ✅ All data cleared");
};

export const getDatabaseStats = async () => {
  const db = getDatabase();

  const stats = {
    users: await db.getFirstAsync("SELECT COUNT(*) as count FROM users"),
    wallets: await db.getFirstAsync("SELECT COUNT(*) as count FROM wallets"),
    tokens: await db.getFirstAsync("SELECT COUNT(*) as count FROM tokens"),
    transactions: await db.getFirstAsync(
      "SELECT COUNT(*) as count FROM transactions",
    ),
    contacts: await db.getFirstAsync("SELECT COUNT(*) as count FROM contacts"),
  };

  return {
    users: stats.users.count,
    wallets: stats.wallets.count,
    tokens: stats.tokens.count,
    transactions: stats.transactions.count,
    contacts: stats.contacts.count,
  };
};

export default {
  initDatabase,
  getDatabase,
  // User operations
  saveUser,
  getUserByUid,
  getUserByUsername,
  updateUserProfile,
  checkLocalUsernameExists,
  // Wallet operations
  saveWallet,
  getWalletsByUserId,
  getPrimaryWallet,
  updateWalletName,
  deleteWallet,
  // Transaction operations
  saveTransaction,
  getTransactionsByWallet,
  updateTransactionStatus,
  // Contact operations
  saveContact,
  getContactsByUserId,
  deleteContact,
  // Token operations
  saveToken,
  getTokensByChain,
  getAllTokens,
  deleteToken,
  hideToken,
  showToken,
  // Utility operations
  clearAllData,
  getDatabaseStats,
};
