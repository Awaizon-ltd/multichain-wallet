// Google Drive backup — wire-compatible with crypto-wallet/services/cloudBackup.js,
// so a backup made on the phone restores on desktop and vice versa.
//
//   Firestore  backupKeys/{uid}  → random 256-bit key (owner-only rules)
//   Drive      appDataFolder/rizon-wallet-backup.json → AES-256-GCM(key, mnemonic),
//              AAD = "rizon-backup:v1:{uid}" (a file can't be swapped in from another account)
//
// Uses REST rather than the Firebase SDK: Google OAuth via chrome.identity,
// Firebase Auth `accounts:signInWithIdp`, Firestore and Drive v3 REST.
// Honest limit (same as mobile): whoever controls the Google account can reach
// both stores — that's what makes restore one-click.

import { BACKUP_FILE, DRIVE_SCOPE, FIREBASE, GOOGLE_WEB_CLIENT_ID } from "../shared/config";
import { isValidMnemonic, normalizeMnemonic } from "./keyring";
import { fromB64, toB64 } from "./vault";
import { K, local } from "./storage";

const FORMAT_VERSION = 1;
const DRIVE = "https://www.googleapis.com/drive/v3/files";
const UPLOAD = "https://www.googleapis.com/upload/drive/v3/files";
const FIRESTORE = `https://firestore.googleapis.com/v1/projects/${FIREBASE.projectId}/databases/(default)/documents`;

export interface GoogleSession {
  accessToken: string;
  idToken: string; // Firebase ID token
  uid: string;
  email?: string;
}

export interface BackupStatus {
  email?: string;
  addressHint?: string | null;
  backedUpAt: string;
}

/* ------------------------------ sign-in ------------------------------ */

export const redirectUri = () => chrome.identity.getRedirectURL();

async function googleAccessToken(interactive: boolean): Promise<string> {
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", GOOGLE_WEB_CLIENT_ID);
  url.searchParams.set("response_type", "token");
  url.searchParams.set("redirect_uri", redirectUri());
  url.searchParams.set("scope", ["openid", "email", "profile", DRIVE_SCOPE].join(" "));
  url.searchParams.set("prompt", "select_account");
  let result: string | undefined;
  try {
    result = await chrome.identity.launchWebAuthFlow({ url: url.toString(), interactive });
  } catch (e: any) {
    const msg = String(e?.message ?? e);
    if (/did not approve|cancel|closed/i.test(msg)) throw new Error("Google sign-in was cancelled.");
    throw new Error(
      `Google sign-in failed (${msg}). If this says redirect_uri_mismatch, add ${redirectUri()} to the OAuth client's authorized redirect URIs.`,
    );
  }
  const params = new URLSearchParams(new URL(result!).hash.slice(1));
  const token = params.get("access_token");
  if (!token) throw new Error(params.get("error_description") || params.get("error") || "Google didn't return a token.");
  if (!(params.get("scope") ?? "").includes(DRIVE_SCOPE)) {
    throw new Error("Rizon needs access to its own hidden Drive folder to back up. Allow it on the Google screen.");
  }
  return token;
}

/** Exchanges the Google token for a Firebase session (same Firebase user as on the phone). */
async function firebaseSignIn(accessToken: string): Promise<{ idToken: string; uid: string; email?: string }> {
  const r = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithIdp?key=${FIREBASE.apiKey}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      postBody: `access_token=${encodeURIComponent(accessToken)}&providerId=google.com`,
      requestUri: "http://localhost",
      returnSecureToken: true,
      returnIdpCredential: false,
    }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(`Rizon account sign-in failed: ${j?.error?.message ?? r.status}`);
  return { idToken: j.idToken, uid: j.localId, email: j.email };
}

export async function signIn(): Promise<GoogleSession> {
  const accessToken = await googleAccessToken(true);
  const fb = await firebaseSignIn(accessToken);
  return { accessToken, ...fb };
}

/* ------------------------------ Firestore key ------------------------------ */

const keyDoc = (uid: string) => `${FIRESTORE}/backupKeys/${encodeURIComponent(uid)}`;

async function getKey(s: GoogleSession): Promise<Uint8Array | null> {
  const r = await fetch(keyDoc(s.uid), { headers: { authorization: `Bearer ${s.idToken}` } });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`Couldn't read your backup key (${r.status}).`);
  const j = await r.json();
  const k = j?.fields?.key?.stringValue;
  return k ? fromB64(k) : null;
}

/** Existing key, or a new one — created with "must not exist" so two devices agree on one key. */
async function getOrCreateKey(s: GoogleSession): Promise<Uint8Array> {
  const existing = await getKey(s);
  if (existing) return existing;
  const fresh = crypto.getRandomValues(new Uint8Array(32));
  const r = await fetch(`${FIRESTORE}:commit`, {
    method: "POST",
    headers: { authorization: `Bearer ${s.idToken}`, "content-type": "application/json" },
    body: JSON.stringify({
      writes: [
        {
          update: {
            name: `projects/${FIREBASE.projectId}/databases/(default)/documents/backupKeys/${s.uid}`,
            fields: { key: { stringValue: toB64(fresh) }, v: { integerValue: String(FORMAT_VERSION) } },
          },
          updateTransforms: [{ fieldPath: "createdAt", setToServerValue: "REQUEST_TIME" }],
          currentDocument: { exists: false },
        },
      ],
    }),
  });
  if (r.ok) return fresh;
  // Lost a race with another device: use the key it wrote.
  const winner = await getKey(s);
  if (winner) return winner;
  throw new Error(`Couldn't create your backup key (${r.status}).`);
}

/* ------------------------------ Drive ------------------------------ */

async function findFile(token: string): Promise<{ id: string; modifiedTime?: string } | null> {
  const q = new URLSearchParams({
    spaces: "appDataFolder",
    q: `name = '${BACKUP_FILE}' and trashed = false`,
    fields: "files(id,name,modifiedTime)",
    pageSize: "10",
  });
  const r = await fetch(`${DRIVE}?${q}`, { headers: { authorization: `Bearer ${token}` } });
  if (!r.ok) throw new Error(`Google Drive error (${r.status}).`);
  const j = await r.json();
  return j.files?.[0] ?? null;
}

async function writeFile(token: string, content: string, fileId?: string) {
  if (fileId) {
    const r = await fetch(`${UPLOAD}/${fileId}?uploadType=media&fields=id`, {
      method: "PATCH",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: content,
    });
    if (!r.ok) throw new Error(`Couldn't update the Drive backup (${r.status}).`);
    return;
  }
  const boundary = "rizon" + crypto.randomUUID();
  const body =
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n` +
    `${JSON.stringify({ name: BACKUP_FILE, mimeType: "application/json", parents: ["appDataFolder"] })}\r\n` +
    `--${boundary}\r\nContent-Type: application/json\r\n\r\n${content}\r\n--${boundary}--`;
  const r = await fetch(`${UPLOAD}?uploadType=multipart&fields=id`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": `multipart/related; boundary=${boundary}` },
    body,
  });
  if (!r.ok) throw new Error(`Couldn't upload the Drive backup (${r.status}).`);
}

/* ------------------------------ crypto ------------------------------ */
// Mobile stores iv / tag / ct separately; WebCrypto's AES-GCM output is ct‖tag(16).

const aad = (uid: string) => new TextEncoder().encode(`rizon-backup:v${FORMAT_VERSION}:${uid}`);
const aesKey = (raw: Uint8Array) => crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);

export async function seal(key: Uint8Array, plaintext: string, uid: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const out = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: aad(uid) }, await aesKey(key), new TextEncoder().encode(plaintext)),
  );
  return { iv: toB64(iv), tag: toB64(out.slice(-16)), ct: toB64(out.slice(0, -16)) };
}

export async function unseal(key: Uint8Array, p: { iv: string; tag: string; ct: string }, uid: string): Promise<string> {
  const ct = fromB64(p.ct);
  const tag = fromB64(p.tag);
  const joined = new Uint8Array(ct.length + tag.length);
  joined.set(ct);
  joined.set(tag, ct.length);
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: fromB64(p.iv), additionalData: aad(uid) }, await aesKey(key), joined);
  return new TextDecoder().decode(pt);
}

/* ------------------------------ public ------------------------------ */

export async function backup(s: GoogleSession, mnemonic: string, addressHint: string): Promise<BackupStatus> {
  if (!isValidMnemonic(mnemonic)) throw new Error("Invalid recovery phrase");
  const key = await getOrCreateKey(s);
  const sealed = await seal(key, normalizeMnemonic(mnemonic), s.uid);
  key.fill(0);
  const existing = await findFile(s.accessToken);
  await writeFile(
    s.accessToken,
    JSON.stringify({ app: "rizon", v: FORMAT_VERSION, alg: "AES-256-GCM", ...sealed, addressHint, createdAt: new Date().toISOString() }),
    existing?.id,
  );
  const status: BackupStatus = { email: s.email, addressHint, backedUpAt: new Date().toISOString() };
  await local.set(K.backupStatus, status);
  return status;
}

export async function restore(s: GoogleSession): Promise<{ mnemonic: string; addressHint: string | null; createdAt: string | null } | null> {
  const file = await findFile(s.accessToken);
  if (!file) return null;
  const r = await fetch(`${DRIVE}/${file.id}?alt=media`, { headers: { authorization: `Bearer ${s.accessToken}` } });
  if (!r.ok) throw new Error(`Couldn't download the backup (${r.status}).`);
  const payload = await r.json();
  if (payload?.app !== "rizon" || payload.v !== FORMAT_VERSION) throw new Error("This backup was made by an unsupported version of Rizon.");
  const key = await getKey(s);
  if (!key) throw new Error("Found a backup, but its key is missing from your Rizon account. Import your recovery phrase manually instead.");
  let mnemonic: string;
  try {
    mnemonic = await unseal(key, payload, s.uid);
  } catch {
    throw new Error("This backup couldn't be decrypted — it may be damaged.");
  } finally {
    key.fill(0);
  }
  if (!isValidMnemonic(mnemonic)) throw new Error("Backup contents are invalid.");
  return { mnemonic, addressHint: payload.addressHint ?? null, createdAt: payload.createdAt ?? null };
}

export async function deleteBackup(s: GoogleSession) {
  const file = await findFile(s.accessToken);
  if (file) {
    const r = await fetch(`${DRIVE}/${file.id}`, { method: "DELETE", headers: { authorization: `Bearer ${s.accessToken}` } });
    if (!r.ok && r.status !== 404) throw new Error(`Couldn't delete the backup (${r.status}).`);
  }
  await local.remove(K.backupStatus);
}

export const backupStatus = () => local.get<BackupStatus | null>(K.backupStatus, null);
