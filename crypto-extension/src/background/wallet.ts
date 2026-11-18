// Wallet lifecycle: create / import / unlock / lock / accounts / settings.
// The recovery phrase is only ever decrypted transiently inside withMnemonic().

import { DEFAULT_NETWORK_IDS } from "../shared/chains";
import type { Account, Settings, WalletStatus } from "../shared/messages";
import type { Wallet as EvmWallet } from "ethers";
import {
  deriveAddresses,
  evmSigner,
  isEvmDerivation,
  isValidMnemonic,
  normalizeMnemonic,
  EVM_DERIVATION,
  type EvmDerivation,
} from "./keyring";
import { K, local, session } from "./storage";
import {
  createVault,
  fromB64,
  openVault,
  openVaultWithKey,
  toB64,
  type VaultRecord,
} from "./vault";
import { locked } from "../shared/errors";

export const DEFAULT_SETTINGS: Settings = {
  autoLockMinutes: 15,
  enabledNetworks: DEFAULT_NETWORK_IDS,
  showTestnets: false,
  hideSmallBalances: true,
  theme: "system",
};

export const MAX_ACCOUNTS = 50;

type Listener = (change: "locked" | "unlocked" | "accounts" | "selected") => void;
const listeners = new Set<Listener>();
export const onWalletChange = (l: Listener) => listeners.add(l);
const fire = (c: Parameters<Listener>[0]) => listeners.forEach((l) => l(c));

/* ------------------------------ status ------------------------------ */

export async function getStatus(): Promise<WalletStatus> {
  const vault = await local.get<VaultRecord | null>(K.vault, null);
  if (!vault) return "uninitialized";
  const key = await session.get<string | null>(K.vaultKey, null);
  return key ? "unlocked" : "locked";
}

export async function isUnlocked() {
  return (await getStatus()) === "unlocked";
}

export const getAccounts = () => local.get<Account[]>(K.accounts, []);
export const getSelectedIndex = () => local.get<number>(K.selectedIndex, 0);

export async function getSelectedAccount(): Promise<Account | undefined> {
  const [accounts, idx] = await Promise.all([getAccounts(), getSelectedIndex()]);
  return accounts.find((a) => a.index === idx) ?? accounts[0];
}

export async function getSettings(): Promise<Settings> {
  return { ...DEFAULT_SETTINGS, ...(await local.get<Partial<Settings>>(K.settings, {})) };
}

export async function updateSettings(patch: Partial<Settings>): Promise<Settings> {
  const next = { ...(await getSettings()), ...patch };
  if (!Number.isFinite(next.autoLockMinutes) || next.autoLockMinutes < 1 || next.autoLockMinutes > 24 * 60) {
    throw new Error("Auto-lock must be between 1 minute and 24 hours");
  }
  await local.set(K.settings, next);
  return next;
}

/* --------------------------- create / import -------------------------- */

/**
 * EVM derivation of this wallet. Installs from before the field existed were
 * always created with the standard derivation, so a missing value means STANDARD.
 */
export async function getEvmDerivation(): Promise<EvmDerivation> {
  const v = await local.get<string | null>(K.evmDerivation, null);
  return isEvmDerivation(v) ? v : EVM_DERIVATION.STANDARD;
}

async function initialise(password: string, phrase: string, derivation: EvmDerivation) {
  if ((await getStatus()) !== "uninitialized") throw new Error("A wallet already exists. Reset it first.");
  if (!isEvmDerivation(derivation)) throw new Error("Missing EVM derivation");
  const mnemonic = normalizeMnemonic(phrase);
  if (!isValidMnemonic(mnemonic)) throw new Error("That recovery phrase isn't valid. Check the words and their order.");
  const { record, key } = await createVault(password, { mnemonic });
  const [first] = deriveAddresses(mnemonic, [0], derivation);
  const accounts: Account[] = [{ index: 0, name: "Account 1", evm: first.evm, solana: first.solana }];
  await local.set(K.vault, record);
  await local.set(K.evmDerivation, derivation);
  await local.set(K.accounts, accounts);
  await local.set(K.selectedIndex, 0);
  await session.set(K.vaultKey, toB64(key));
  await touch();
  fire("unlocked");
}

/** New wallets always use the standard derivation (same addresses as MetaMask). */
export const createWallet = (password: string, phrase: string) => initialise(password, phrase, EVM_DERIVATION.STANDARD);
/** Imports pass the derivation detected for the phrase (or chosen by the user). */
export const importWallet = initialise;

/* ---------------------------- lock / unlock --------------------------- */

export async function unlock(password: string) {
  const vault = await local.get<VaultRecord | null>(K.vault, null);
  if (!vault) throw new Error("No wallet");
  const { key } = await openVault(password, vault); // throws WrongPasswordError
  await session.set(K.vaultKey, toB64(key));
  await touch();
  fire("unlocked");
}

export async function lock() {
  await session.remove([K.vaultKey, K.lastActive]);
  fire("locked");
}

export async function touch() {
  await session.set(K.lastActive, Date.now());
}

/** Called from a 1-minute alarm. Returns true if it locked the wallet. */
export async function checkAutoLock(now = Date.now()): Promise<boolean> {
  if (!(await isUnlocked())) return false;
  const [last, settings] = await Promise.all([session.get<number>(K.lastActive, 0), getSettings()]);
  if (now - last < settings.autoLockMinutes * 60_000) return false;
  await lock();
  return true;
}

/**
 * Runs `fn` with the decrypted recovery phrase. The phrase lives only for the
 * duration of the call; nothing derived from it is cached.
 */
export async function withMnemonic<T>(fn: (mnemonic: string, evmDerivation: EvmDerivation) => Promise<T> | T): Promise<T> {
  const [vault, keyB64, derivation] = await Promise.all([
    local.get<VaultRecord | null>(K.vault, null),
    session.get<string | null>(K.vaultKey, null),
    getEvmDerivation(),
  ]);
  if (!vault || !keyB64) throw locked();
  const secret = await openVaultWithKey(vault, fromB64(keyB64));
  return fn(secret.mnemonic, derivation);
}

/**
 * Runs `fn` with a one-shot EVM signer for `account`, after checking the derived
 * key really belongs to the address the user sees. Never signs with any other key.
 */
export function withEvmSigner<T>(
  account: Pick<Account, "index" | "evm">,
  fn: (signer: EvmWallet) => Promise<T> | T,
): Promise<T> {
  return withMnemonic((m, d) => {
    const signer = evmSigner(m, account.index, d);
    if (signer.address.toLowerCase() !== account.evm.toLowerCase()) throw new Error("Signer does not match the account");
    return fn(signer);
  });
}

/* ------------------------------ accounts ------------------------------ */

export async function addAccount(name?: string): Promise<Account> {
  const accounts = await getAccounts();
  if (accounts.length >= MAX_ACCOUNTS) throw new Error(`At most ${MAX_ACCOUNTS} accounts`);
  const index = accounts.reduce((m, a) => Math.max(m, a.index), -1) + 1;
  const [d] = await withMnemonic((m, derivation) => deriveAddresses(m, [index], derivation));
  const account: Account = { index, name: name?.trim() || `Account ${index + 1}`, evm: d.evm, solana: d.solana };
  await local.set(K.accounts, [...accounts, account]);
  fire("accounts");
  return account;
}

export async function renameAccount(index: number, name: string) {
  const clean = name.trim().slice(0, 32);
  if (!clean) throw new Error("Name can't be empty");
  const accounts = await getAccounts();
  if (!accounts.some((a) => a.index === index)) throw new Error("Unknown account");
  await local.set(
    K.accounts,
    accounts.map((a) => (a.index === index ? { ...a, name: clean } : a)),
  );
  fire("accounts");
}

export async function selectAccount(index: number) {
  const accounts = await getAccounts();
  if (!accounts.some((a) => a.index === index)) throw new Error("Unknown account");
  await local.set(K.selectedIndex, index);
  fire("selected");
}

export async function accountByEvmAddress(address: string): Promise<Account | undefined> {
  const a = address.toLowerCase();
  return (await getAccounts()).find((x) => x.evm.toLowerCase() === a);
}

export async function accountBySolanaAddress(address: string): Promise<Account | undefined> {
  return (await getAccounts()).find((x) => x.solana === address);
}

/* ------------------------------- secrets ------------------------------ */

/** Re-prompts for the password, even when unlocked. */
export async function revealMnemonic(password: string): Promise<string> {
  const vault = await local.get<VaultRecord | null>(K.vault, null);
  if (!vault) throw new Error("No wallet");
  const { secret } = await openVault(password, vault);
  return secret.mnemonic;
}

export async function verifyPassword(password: string): Promise<void> {
  await revealMnemonic(password);
}

export async function changePassword(oldPassword: string, newPassword: string) {
  const vault = await local.get<VaultRecord | null>(K.vault, null);
  if (!vault) throw new Error("No wallet");
  const { secret } = await openVault(oldPassword, vault);
  const { record, key } = await createVault(newPassword, secret);
  await local.set(K.vault, record);
  await session.set(K.vaultKey, toB64(key));
}

/** Wipes everything. The recovery phrase is the only way back. */
export async function resetWallet() {
  await local.clear();
  await session.clear();
  fire("locked");
}
