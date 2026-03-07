/**
 * =====================================================
 * TRUST WALLET–GRADE VAULT ENCRYPTION
 * Native crypto + vault key architecture (JS)
 * =====================================================
 * 
 * import { Buffer } from "buffer";
 */
import { Buffer } from "buffer";

import {
  randomBytes,
  pbkdf2Sync,
  createCipheriv,
  createDecipheriv,
} from "react-native-quick-crypto";
import * as SecureStore from "expo-secure-store";
import { APP_CONFIG } from "../constants/Config";

/**
 * =====================================================
 * CONFIG
 * =====================================================
 */
const CURRENT_VERSION = 3;
const VAULT_KEY_SIZE = 32; // 256-bit
const IV_LENGTH = 12; // AES-GCM recommended
const PBKDF_ITERATIONS = APP_CONFIG.ENCRYPTION_ITERATIONS;

/**
 * =====================================================
 * IN-MEMORY SESSION CACHE (FAST PATH)
 * =====================================================
 */
let sessionVaultKey = null;
let sessionWallet = null;

export const clearVaultSession = () => {
  sessionVaultKey = null;
  sessionWallet = null;
};

/**
 * =====================================================
 * LOW-LEVEL NATIVE HELPERS
 * =====================================================
 */
const deriveMasterKey = (password, salt, progressCallback) => {
  if (progressCallback) {
    progressCallback({ stage: "deriving_key", progress: 0.3 });
  }

  const key = pbkdf2Sync(password, salt, PBKDF_ITERATIONS, 32, "sha512");

  if (progressCallback) {
    progressCallback({ stage: "deriving_key", progress: 1.0 });
  }

  return key;
};

const aesGcmEncrypt = (key, plaintext) => {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv("aes-256-gcm", key, iv);

  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);

  const tag = cipher.getAuthTag();

  return {
    iv: iv.toString("hex"),
    tag: tag.toString("hex"),
    data: encrypted.toString("hex"),
  };
};

const aesGcmDecrypt = (key, ivHex, tagHex, dataHex) => {
  const decipher = createDecipheriv(
    "aes-256-gcm",
    key,
    Buffer.from(ivHex, "hex"),
  );

  decipher.setAuthTag(Buffer.from(tagHex, "hex"));

  return Buffer.concat([
    decipher.update(Buffer.from(dataHex, "hex")),
    decipher.final(),
  ]);
};

/**
 * =====================================================
 * VAULT CREATION (RUNS ONCE)
 * =====================================================
 */
export const createVault = async (walletData, password, progressCallback) => {
  if (progressCallback) {
    progressCallback({ stage: "generating", progress: 0.1 });
  }

  const salt = randomBytes(16);

  if (progressCallback) {
    progressCallback({ stage: "deriving_key", progress: 0.2 });
  }

  const masterKey = deriveMasterKey(password, salt, progressCallback);

  if (progressCallback) {
    progressCallback({ stage: "encrypting", progress: 0.5 });
  }

  const vaultKey = randomBytes(VAULT_KEY_SIZE);

  const encryptedVaultKey = aesGcmEncrypt(masterKey, vaultKey);
  const encryptedWallet = aesGcmEncrypt(
    vaultKey,
    Buffer.from(JSON.stringify(walletData)),
  );

  if (progressCallback) {
    progressCallback({ stage: "saving", progress: 0.9 });
  }

  await SecureStore.setItemAsync(
    "vault_key",
    JSON.stringify({
      v: CURRENT_VERSION,
      salt: salt.toString("hex"),
      iv: encryptedVaultKey.iv,
      tag: encryptedVaultKey.tag,
      data: encryptedVaultKey.data,
    }),
  );

  if (progressCallback) {
    progressCallback({ stage: "complete", progress: 1.0 });
  }

  return {
    v: CURRENT_VERSION,
    salt: salt.toString("hex"), // ✅ Include salt in payload for WalletContext
    wallet: encryptedWallet,
  };
};

/**
 * =====================================================
 * ENCRYPTION WRAPPER (FOR WALLETCONTEXT COMPATIBILITY)
 * =====================================================
 */
export const encryptWallet = async (walletData, password, progressCallback) => {
  return await createVault(walletData, password, progressCallback);
};

/**
 * =====================================================
 * FAST UNLOCK (PBKDF ONLY ONCE)
 * =====================================================
 */
export const unlockVault = async (password, progressCallback) => {
  if (sessionVaultKey) {
    if (progressCallback) {
      progressCallback({ stage: "cached", progress: 1.0 });
    }
    return sessionVaultKey;
  }

  const vaultBlob = await SecureStore.getItemAsync("vault_key");
  if (!vaultBlob) throw new Error("Vault not found");

  const payload = JSON.parse(vaultBlob);

  // ---------- V3 ----------
  if (payload.v === 3) {
    if (progressCallback) {
      progressCallback({ stage: "deriving_key", progress: 0.3 });
    }

    const masterKey = deriveMasterKey(
      password,
      Buffer.from(payload.salt, "hex"),
      progressCallback,
    );

    if (progressCallback) {
      progressCallback({ stage: "decrypting", progress: 0.7 });
    }

    sessionVaultKey = aesGcmDecrypt(
      masterKey,
      payload.iv,
      payload.tag,
      payload.data,
    );

    if (progressCallback) {
      progressCallback({ stage: "complete", progress: 1.0 });
    }

    return sessionVaultKey;
  }

  throw new Error("Legacy vault unlock must go through migration");
};

/**
 * =====================================================
 * DECRYPT WALLET (INSTANT AFTER UNLOCK)
 * =====================================================
 */
export const decryptWallet = async (
  encryptedWalletPayload,
  password,
  salt = null,
  progressCallback = null,
) => {
  // ✅ FIX: Return in consistent format
  if (sessionWallet) {
    if (progressCallback) {
      progressCallback({ stage: "cached", progress: 1.0 });
    }
    return { wallet: sessionWallet }; // ✅ Wrapped in object
  }

  if (progressCallback) {
    progressCallback({ stage: "authenticating", progress: 0.1 });
  }

  const vaultKey = await unlockVault(password, progressCallback);

  // ---------- V3 ----------
  if (encryptedWalletPayload && encryptedWalletPayload.v === 3) {
    if (progressCallback) {
      progressCallback({ stage: "decrypting", progress: 0.7 });
    }

    const decrypted = aesGcmDecrypt(
      vaultKey,
      encryptedWalletPayload.wallet.iv,
      encryptedWalletPayload.wallet.tag,
      encryptedWalletPayload.wallet.data,
    );

    sessionWallet = JSON.parse(decrypted.toString("utf8"));

    if (progressCallback) {
      progressCallback({ stage: "complete", progress: 1.0 });
    }

    return { wallet: sessionWallet };
  }

  // ---------- V2 / V1 ----------
  return migrateLegacyWallet(
    encryptedWalletPayload,
    password,
    progressCallback,
  );
};

/**
 * =====================================================
 * LEGACY MIGRATION (V1 + V2 → V3)
 * =====================================================
 */
const migrateLegacyWallet = async (payload, password, progressCallback) => {
  if (progressCallback) {
    progressCallback({ stage: "migrating", progress: 0.2 });
  }

  const CryptoJS = require("crypto-js");

  let plaintext;

  // ---------- V2 ----------
  if (payload && payload.v === 2) {
    const key = CryptoJS.PBKDF2(password, payload.salt, {
      keySize: 256 / 32,
      iterations: APP_CONFIG.ENCRYPTION_ITERATIONS,
      hasher: CryptoJS.algo.SHA512,
    });

    const decrypted = CryptoJS.AES.decrypt(
      { ciphertext: CryptoJS.enc.Hex.parse(payload.data) },
      key,
      {
        iv: CryptoJS.enc.Hex.parse(payload.iv),
        mode: CryptoJS.mode.CBC,
        padding: CryptoJS.pad.Pkcs7,
      },
    );

    plaintext = decrypted.toString(CryptoJS.enc.Utf8);
    if (!plaintext) throw new Error("Invalid password");
  }

  // ---------- V1 ----------
  else {
    const key = CryptoJS.PBKDF2(password, payload.salt, {
      keySize: 256 / 32,
      iterations: APP_CONFIG.ENCRYPTION_ITERATIONS,
    });

    const decrypted = CryptoJS.AES.decrypt(payload, key);
    plaintext = decrypted.toString(CryptoJS.enc.Utf8);
    if (!plaintext) throw new Error("Invalid password");
  }

  if (progressCallback) {
    progressCallback({ stage: "upgrading", progress: 0.6 });
  }

  // ---------- UPGRADE ----------
  const upgradedPayload = await createVault(
    JSON.parse(plaintext),
    password,
    progressCallback,
  );

  sessionWallet = JSON.parse(plaintext);

  return {
    wallet: sessionWallet,
    migrated: true,
    upgradedPayload,
  };
};

/**
 * =====================================================
 * PASSWORD VALIDATION
 * =====================================================
 */
export const validatePassword = (password) => {
  const minLength = APP_CONFIG.MIN_PASSWORD_LENGTH;

  return {
    isValid:
      password.length >= minLength &&
      /[A-Z]/.test(password) &&
      /[a-z]/.test(password) &&
      /\d/.test(password),
  };
};
