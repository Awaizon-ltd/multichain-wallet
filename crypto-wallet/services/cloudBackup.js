// services/cloudBackup.js
// ─────────────────────────────────────────────────────────────────────────────
// Google Drive backup of the recovery phrase — passwordless, two-store design.
//
//   Firestore  backupKeys/{uid}            → a random 256-bit key (owner-only rules)
//   Drive      appDataFolder/rizon-wallet-backup.json
//                                          → AES-256-GCM(key, mnemonic)
//
// Why it's both fast and secure: the key is 32 random bytes, not derived from
// a password, so there is no slow KDF to run (encrypt/decrypt take well under
// a millisecond) and nothing to brute-force — the security is the full 256
// bits of the key. Neither store alone is enough: Drive holds only
// ciphertext, Firestore holds only a key. The GCM tag is bound (AAD) to the
// Firebase uid, so a backup file can't be swapped in from another account.
//
// The honest limit: whoever controls the user's Google account can reach
// both stores. That is what makes restore automatic on Google sign-in, and
// it's why Settings → Cloud Backup lets the user delete the backup.
//
// Secrets never pass through navigation params (React Navigation state is
// persisted to AsyncStorage) — screens hand off through takeGoogleSession().
// ─────────────────────────────────────────────────────────────────────────────

import { Buffer } from "buffer";
import {
  randomBytes,
  createCipheriv,
  createDecipheriv,
} from "react-native-quick-crypto";
import { doc, getDoc, runTransaction, serverTimestamp } from "firebase/firestore";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { db } from "./firebase";
import {
  findAppDataFile,
  readAppDataFile,
  writeAppDataFile,
  deleteAppDataFile,
} from "./drive";
import { isValidMnemonic } from "../utils/Wallet";

const BACKUP_FILE = "rizon-wallet-backup.json";
const KEY_COLLECTION = "backupKeys";
const FORMAT_VERSION = 1;
const STATUS_KEY = "@cloud_backup_status";

const aadFor = (uid) => Buffer.from(`rizon-backup:v${FORMAT_VERSION}:${uid}`);

/* =========================================================
   Key (Firestore)
========================================================= */

/**
 * The user's backup key, creating it on first use. A transaction makes two
 * devices backing up at once agree on one key instead of each writing its own
 * (which would make the other's backup undecryptable).
 * @returns {Promise<Buffer>} 32-byte key
 */
const getOrCreateKey = async (uid) => {
  const ref = doc(db, KEY_COLLECTION, uid);
  const encoded = await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (snap.exists()) return snap.data().key;
    const fresh = randomBytes(32).toString("base64");
    tx.set(ref, { key: fresh, v: FORMAT_VERSION, createdAt: serverTimestamp() });
    return fresh;
  });
  return Buffer.from(encoded, "base64");
};

/** The existing key, or null if this account never made a backup. */
const getKey = async (uid) => {
  const snap = await getDoc(doc(db, KEY_COLLECTION, uid));
  return snap.exists() ? Buffer.from(snap.data().key, "base64") : null;
};

/* =========================================================
   Crypto (AES-256-GCM, native via react-native-quick-crypto)
========================================================= */

const encrypt = (key, plaintext, aad) => {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(aad);
  const ct = Buffer.concat([cipher.update(Buffer.from(plaintext, "utf8")), cipher.final()]);
  return {
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
    ct: ct.toString("base64"),
  };
};

const decrypt = (key, { iv, tag, ct }, aad) => {
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64"));
  decipher.setAAD(aad);
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(ct, "base64")),
    decipher.final(), // throws if the tag doesn't verify (tampered / wrong key / wrong account)
  ]).toString("utf8");
};

/* =========================================================
   Public API
========================================================= */

/**
 * Encrypt and upload the recovery phrase, replacing any previous backup.
 * @param {object} p { uid, accessToken, mnemonic, address, email }
 */
export const backupMnemonic = async ({ uid, accessToken, mnemonic, address, email }) => {
  if (!uid || !accessToken) throw new Error("Sign in with Google first");
  if (!isValidMnemonic(mnemonic)) throw new Error("Invalid recovery phrase");

  const key = await getOrCreateKey(uid);
  const sealed = encrypt(key, mnemonic.trim(), aadFor(uid));
  key.fill(0);

  const existing = await findAppDataFile(accessToken, BACKUP_FILE);
  const file = await writeAppDataFile(accessToken, {
    name: BACKUP_FILE,
    fileId: existing?.id ?? null,
    content: JSON.stringify({
      app: "rizon",
      v: FORMAT_VERSION,
      alg: "AES-256-GCM",
      ...sealed,
      // Public, non-secret: lets the restore screen say which wallet this is
      addressHint: address ?? null,
      createdAt: new Date().toISOString(),
    }),
  });

  const status = {
    uid,
    email: email ?? null,
    fileId: file.id,
    addressHint: address ?? null,
    backedUpAt: new Date().toISOString(),
  };
  await AsyncStorage.setItem(STATUS_KEY, JSON.stringify(status)).catch(() => {});
  return status;
};

/**
 * Look for a Rizon backup in this Google account's Drive and decrypt it.
 * @returns {Promise<{ mnemonic, addressHint, createdAt } | null>} null = no backup
 */
export const restoreMnemonic = async ({ uid, accessToken }) => {
  const file = await findAppDataFile(accessToken, BACKUP_FILE);
  if (!file) return null;

  const payload = JSON.parse(await readAppDataFile(accessToken, file.id));
  if (payload?.app !== "rizon" || payload.v !== FORMAT_VERSION) {
    throw new Error("This backup was made by an unsupported version of Rizon.");
  }

  const key = await getKey(uid);
  if (!key) {
    throw new Error(
      "Found a backup, but its key is missing from your Rizon account. Import your recovery phrase manually instead.",
    );
  }

  let mnemonic;
  try {
    mnemonic = decrypt(key, payload, aadFor(uid));
  } catch {
    throw new Error("This backup couldn't be decrypted — it may be damaged.");
  } finally {
    key.fill(0);
  }
  if (!isValidMnemonic(mnemonic)) throw new Error("Backup contents are invalid.");

  return {
    mnemonic,
    addressHint: payload.addressHint ?? null,
    createdAt: payload.createdAt ?? null,
  };
};

/** Does this account have a backup? (No decryption, no key read.) */
export const hasCloudBackup = async (accessToken) =>
  !!(await findAppDataFile(accessToken, BACKUP_FILE));

/** Remove the Drive backup file. The Firestore key alone reveals nothing. */
export const deleteCloudBackup = async (accessToken) => {
  const file = await findAppDataFile(accessToken, BACKUP_FILE);
  if (file) await deleteAppDataFile(accessToken, file.id);
  await AsyncStorage.removeItem(STATUS_KEY).catch(() => {});
};

/** Last successful backup on this device (for the Settings screen). */
export const getBackupStatus = async () => {
  try {
    const raw = await AsyncStorage.getItem(STATUS_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

/* =========================================================
   In-memory hand-off between onboarding screens
   (Welcome → Setup). Never persisted, read once.
========================================================= */

let pendingSession = null;

/** { uid, email, accessToken, driveGranted, restored?: { mnemonic, addressHint } } */
export const setGoogleSession = (session) => {
  pendingSession = session;
};

export const takeGoogleSession = () => {
  const s = pendingSession;
  pendingSession = null;
  return s;
};
