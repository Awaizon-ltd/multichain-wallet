// Password vault for the recovery phrase.
//
//   key  = PBKDF2-HMAC-SHA256(password, 16-byte random salt, 600 000 iterations) → 256-bit
//   blob = AES-256-GCM(key, 12-byte random IV, JSON(secret))
//
// Everything uses the browser's native WebCrypto. The plaintext secret is never
// persisted; while the wallet is unlocked only the derived key is kept, and
// only in chrome.storage.session (memory-only, cleared when the browser closes,
// and not readable from content scripts).

export const PBKDF2_ITERATIONS = 600_000;

export interface VaultSecret {
  mnemonic: string;
}

export interface VaultRecord {
  v: 1;
  kdf: { name: "PBKDF2"; hash: "SHA-256"; iterations: number; salt: string };
  iv: string;
  ct: string;
}

export class WrongPasswordError extends Error {
  constructor() {
    super("Incorrect password");
  }
}

const enc = new TextEncoder();
const dec = new TextDecoder();

export const toB64 = (b: Uint8Array) => {
  let s = "";
  for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
  return btoa(s);
};
export const fromB64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function deriveKey(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const base = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations }, base, 256);
  return new Uint8Array(bits);
}

const aesKey = (raw: Uint8Array) => crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);

async function seal(raw: Uint8Array, salt: Uint8Array, iterations: number, secret: VaultSecret): Promise<VaultRecord> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await aesKey(raw), enc.encode(JSON.stringify(secret)));
  return {
    v: 1,
    kdf: { name: "PBKDF2", hash: "SHA-256", iterations, salt: toB64(salt) },
    iv: toB64(iv),
    ct: toB64(new Uint8Array(ct)),
  };
}

/** Encrypts a new secret under `password`. Returns the record to persist and the session key. */
export async function createVault(password: string, secret: VaultSecret) {
  if (password.length < 8) throw new Error("Password must be at least 8 characters");
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await deriveKey(password, salt, PBKDF2_ITERATIONS);
  return { record: await seal(key, salt, PBKDF2_ITERATIONS, secret), key };
}

/** Re-encrypts with the same key (e.g. after adding data to the secret). */
export async function resealVault(record: VaultRecord, key: Uint8Array, secret: VaultSecret) {
  return seal(key, fromB64(record.kdf.salt), record.kdf.iterations, secret);
}

export async function openVaultWithKey(record: VaultRecord, key: Uint8Array): Promise<VaultSecret> {
  try {
    const pt = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: fromB64(record.iv) },
      await aesKey(key),
      fromB64(record.ct),
    );
    return JSON.parse(dec.decode(pt)) as VaultSecret;
  } catch {
    throw new WrongPasswordError();
  }
}

/** Derives the key from `password` and decrypts. Throws WrongPasswordError on a bad password. */
export async function openVault(password: string, record: VaultRecord) {
  if (record.v !== 1 || record.kdf.name !== "PBKDF2") throw new Error("Unsupported vault format");
  const key = await deriveKey(password, fromB64(record.kdf.salt), record.kdf.iterations);
  const secret = await openVaultWithKey(record, key);
  return { secret, key };
}
