// constants/Config.js

export const APP_CONFIG = {
  APP_NAME: "Awarizon Wallet",
  VERSION: "1.0.0",

  // Security
  MIN_PASSWORD_LENGTH: 8,
  ENCRYPTION_ITERATIONS: 10000,
  SALT_LENGTH: 32,

  // Wallet
  DERIVATION_PATH: "m/44'/60'/0'/0/0",
  MNEMONIC_STRENGTH: 128, // 12 words

  // ✅ Backend URLs
  BACKEND_URL: __DEV__
    ? "http://192.168.0.219:5000" // ⚠️ UPDATE THIS to your computer's IP
    : "https://backend.awarizon.com/api",

  // ✅ Cache configuration
  CACHE_EXPIRY_MS: 5 * 60 * 1000, // 5 minutes

  CACHE_EXPIRY: {
    DAOS: 5 * 60 * 1000, // 5 minutes
    DAO_DETAIL: 10 * 60 * 1000, // 10 minutes
  },

  // Storage keys
  STORAGE_KEYS: {
    LOCAL_WALLET: "wallet_local_encrypted",
    USER_PREFERENCES: "@user_preferences",
    SELECTED_CHAIN: "@selected_chain",
    WALLET_ADDRESSES: "@wallet_addresses",
  },

  // Database
  DB_NAME: "crypto_wallet.db",
  DB_VERSION: 7, // ✅ Updated to match latest migration
};

export const TRANSACTION_STATUS = {
  PENDING: "pending",
  SUCCESS: "success",
  FAILED: "failed",
};

export const WALLET_ACTIONS = {
  CREATE: "create",
  IMPORT: "import",
  RESTORE: "restore",
};
