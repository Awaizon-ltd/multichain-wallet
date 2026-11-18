// HD key derivation — matches the Rizon mobile app, so the same recovery phrase
// yields the same addresses on phone and desktop.
//
// EVM has two derivations (see crypto-wallet/utils/Wallet.js):
//   STANDARD "bip44"    m/44'/60'/0'/0/{index}, no passphrase — MetaMask & co.
//   LEGACY   "rizon-v1" the mobile app's original derivation: BIP-39 passphrase
//                       = "m/44'/60'/0'/0/{index}", key at m/44'/60'/0'/0/0.
//                       (ethers v6 fromPhrase(mnemonic, path) treated the path
//                       as the passphrase.) Wallets from older Rizon installs use it.
// Solana: m/44'/501'/{index}'/0' (SLIP-0010 ed25519, Phantom-compatible;
//         crypto-wallet/utils/SolanaService.js) — same for both.

import { HDKey } from "@scure/bip32";
import { generateMnemonic, mnemonicToSeedSync, validateMnemonic } from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english.js";
import { hmac } from "@noble/hashes/hmac.js";
import { sha512 } from "@noble/hashes/sha2.js";
import { Wallet, hexlify } from "ethers";
import { Keypair } from "@solana/web3.js";

export const evmPath = (index: number) => `m/44'/60'/0'/0/${index}`;

export const EVM_DERIVATION = { STANDARD: "bip44", LEGACY: "rizon-v1" } as const;
export type EvmDerivation = (typeof EVM_DERIVATION)[keyof typeof EVM_DERIVATION];
export const isEvmDerivation = (v: unknown): v is EvmDerivation =>
  v === EVM_DERIVATION.STANDARD || v === EVM_DERIVATION.LEGACY;

/** EVM private key for one account. `stdRoot` lets callers reuse the standard root across indices. */
function evmPrivateKey(mnemonic: string, index: number, derivation: EvmDerivation, stdRoot?: HDKey): Uint8Array {
  if (derivation === EVM_DERIVATION.STANDARD) {
    const root = stdRoot ?? HDKey.fromMasterSeed(mnemonicToSeedSync(mnemonic));
    return root.derive(evmPath(index)).privateKey!;
  }
  if (derivation === EVM_DERIVATION.LEGACY) {
    const seed = mnemonicToSeedSync(mnemonic, evmPath(index)); // the path is the passphrase
    return HDKey.fromMasterSeed(seed).derive(evmPath(0)).privateKey!;
  }
  throw new Error(`Unknown EVM derivation: ${derivation}`);
}
export const solanaPath = (index: number) => `m/44'/501'/${index}'/0'`;

export function newMnemonic(strength: 128 | 256 = 128): string {
  return generateMnemonic(wordlist, strength);
}

/** Lower-cases and collapses whitespace so pasted phrases validate. */
export function normalizeMnemonic(phrase: string): string {
  return phrase.trim().toLowerCase().split(/\s+/).join(" ");
}

export function isValidMnemonic(phrase: string): boolean {
  return validateMnemonic(normalizeMnemonic(phrase), wordlist);
}

const HARDENED = 0x80000000;

/** SLIP-0010 ed25519 derivation (hardened-only), byte-for-byte the mobile app's deriveEd25519Seed. */
export function deriveEd25519(seed: Uint8Array, path: string): Uint8Array {
  let I = hmac(sha512, new TextEncoder().encode("ed25519 seed"), seed);
  let key = I.slice(0, 32);
  let chain = I.slice(32);
  for (const segment of path.split("/").slice(1)) {
    if (!segment.endsWith("'")) throw new Error("ed25519 derivation supports hardened segments only");
    const index = (parseInt(segment.slice(0, -1), 10) + HARDENED) >>> 0;
    const data = new Uint8Array(37);
    data.set(key, 1);
    new DataView(data.buffer).setUint32(33, index, false);
    I = hmac(sha512, chain, data);
    key = I.slice(0, 32);
    chain = I.slice(32);
  }
  return key;
}

export interface DerivedAddresses {
  index: number;
  evm: string;
  solana: string;
}

/** Derives public addresses for several indices, running the (slow) BIP-39 seed step once. */
export function deriveAddresses(mnemonic: string, indices: number[], derivation: EvmDerivation): DerivedAddresses[] {
  const m = normalizeMnemonic(mnemonic);
  const seed = mnemonicToSeedSync(m);
  const root = HDKey.fromMasterSeed(seed);
  return indices.map((index) => {
    const pk = evmPrivateKey(m, index, derivation, root);
    return {
      index,
      evm: new Wallet(hexlify(pk)).address,
      solana: Keypair.fromSeed(deriveEd25519(seed, solanaPath(index))).publicKey.toBase58(),
    };
  });
}

/** One-shot signers for a single operation. Callers must not retain them. */
export function evmSigner(mnemonic: string, index: number, derivation: EvmDerivation): Wallet {
  return new Wallet(hexlify(evmPrivateKey(normalizeMnemonic(mnemonic), index, derivation)));
}

/** Account-1 EVM address under each derivation (for import detection). */
export function evmAddressBoth(mnemonic: string): { legacy: string; standard: string } {
  const m = normalizeMnemonic(mnemonic);
  return {
    legacy: new Wallet(hexlify(evmPrivateKey(m, 0, EVM_DERIVATION.LEGACY))).address,
    standard: new Wallet(hexlify(evmPrivateKey(m, 0, EVM_DERIVATION.STANDARD))).address,
  };
}

export function solanaSigner(mnemonic: string, index: number): Keypair {
  const seed = mnemonicToSeedSync(normalizeMnemonic(mnemonic));
  return Keypair.fromSeed(deriveEd25519(seed, solanaPath(index)));
}
