import { createRequire } from "node:module";
import { mnemonicToSeedSync } from "@scure/bip39";
import { Keypair } from "@solana/web3.js";
import bs58 from "bs58";
import { b58decode, b58encode } from "../src/shared/base58";
import { createVault, openVault, openVaultWithKey, PBKDF2_ITERATIONS, WrongPasswordError, fromB64, toB64 } from "../src/background/vault";
import {
  deriveAddresses,
  deriveEd25519,
  evmAddressBoth,
  evmPath,
  evmSigner,
  isValidMnemonic,
  newMnemonic,
  normalizeMnemonic,
  solanaPath,
} from "../src/background/keyring";
import { detectEvmDerivation } from "../src/background/evmDerivation";

const HARDHAT = "test test test test test test test test test test test junk";

describe("vault", () => {
  it("round-trips the secret and uses 600k PBKDF2 iterations", async () => {
    const { record, key } = await createVault("correct horse", { mnemonic: HARDHAT });
    expect(record.kdf.iterations).toBe(PBKDF2_ITERATIONS);
    expect(JSON.stringify(record)).not.toContain("junk");
    expect((await openVault("correct horse", record)).secret.mnemonic).toBe(HARDHAT);
    expect((await openVaultWithKey(record, key)).mnemonic).toBe(HARDHAT);
  });

  it("rejects a wrong password and a tampered ciphertext", async () => {
    const { record } = await createVault("correct horse", { mnemonic: HARDHAT });
    await expect(openVault("wrong horse!", record)).rejects.toBeInstanceOf(WrongPasswordError);
    const ct = fromB64(record.ct);
    ct[0] ^= 1;
    await expect(openVault("correct horse", { ...record, ct: toB64(ct) })).rejects.toBeInstanceOf(WrongPasswordError);
  });

  it("refuses short passwords", async () => {
    await expect(createVault("short", { mnemonic: HARDHAT })).rejects.toThrow(/8 characters/);
  });

  it("uses a fresh salt and IV every time", async () => {
    const a = await createVault("correct horse", { mnemonic: HARDHAT });
    const b = await createVault("correct horse", { mnemonic: HARDHAT });
    expect(a.record.kdf.salt).not.toBe(b.record.kdf.salt);
    expect(a.record.iv).not.toBe(b.record.iv);
  });
});

describe("keyring — same addresses as the mobile app", () => {
  it("derives the standard EVM addresses at m/44'/60'/0'/0/i (MetaMask)", () => {
    const [a0, a1] = deriveAddresses(HARDHAT, [0, 1], "bip44");
    expect(a0.evm).toBe("0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266");
    expect(a1.evm).toBe("0x70997970C51812dc3A010C7d01b50e0d17dc79C8");
    expect(evmSigner(HARDHAT, 1, "bip44").address).toBe(a1.evm);
  });

  // Pinned: these are the addresses existing Rizon mobile users have. Never change them.
  const LEGACY_HARDHAT = [
    "0x1090495C9bC80106a8E42D89E10fd58adbDA409b",
    "0x1A24e5C53B1438f15B25c819fEe1F894e6D131f2",
    "0xB1C4590F893EE598c661e1c396Db9c3097b983de",
  ];

  it("derives the legacy Rizon mobile addresses (path as BIP-39 passphrase)", () => {
    const derived = deriveAddresses(HARDHAT, [0, 1, 2], "rizon-v1");
    expect(derived.map((d) => d.evm)).toEqual(LEGACY_HARDHAT);
    expect(evmSigner(HARDHAT, 2, "rizon-v1").address).toBe(LEGACY_HARDHAT[2]);
    // Solana is the same under both derivations.
    expect(derived.map((d) => d.solana)).toEqual(deriveAddresses(HARDHAT, [0, 1, 2], "bip44").map((d) => d.solana));
  });

  it("matches the mobile app's own ethers code for both derivations", () => {
    const require = createRequire(import.meta.url);
    const { ethers } = require("../../crypto-wallet/node_modules/ethers");
    for (const i of [0, 1, 5]) {
      const path = evmPath(i);
      // The exact call older Rizon versions made:
      const oldMobile = ethers.HDNodeWallet.fromPhrase(HARDHAT, path).address;
      const standard = ethers.HDNodeWallet.fromPhrase(HARDHAT, "", path).address;
      expect(deriveAddresses(HARDHAT, [i], "rizon-v1")[0].evm).toBe(oldMobile);
      expect(deriveAddresses(HARDHAT, [i], "bip44")[0].evm).toBe(standard);
    }
  });

  it("refuses an unknown derivation", () => {
    expect(() => deriveAddresses(HARDHAT, [0], "nope" as any)).toThrow(/Unknown EVM derivation/);
  });

  it("uses a Drive backup's address hint without touching the network", async () => {
    const both = evmAddressBoth(HARDHAT);
    expect(both).toEqual({ legacy: LEGACY_HARDHAT[0], standard: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266" });
    const legacy = await detectEvmDerivation(HARDHAT, LEGACY_HARDHAT[0].toLowerCase());
    expect(legacy).toMatchObject({ derivation: "rizon-v1", ambiguous: false });
    const std = await detectEvmDerivation(HARDHAT, "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266");
    expect(std).toMatchObject({ derivation: "bip44", ambiguous: false });
  });

  it("passes the official SLIP-0010 ed25519 test vector", () => {
    const seed = Uint8Array.from(Buffer.from("000102030405060708090a0b0c0d0e0f", "hex"));
    expect(Buffer.from(deriveEd25519(seed, "m/0'")).toString("hex")).toBe(
      "68e0fe46dfb67e368c75379acec591dad19df3cde26e63b93a8e704f1dade7a3",
    );
  });

  it("matches ed25519-hd-key (the mobile app's dependency) for Solana m/44'/501'/i'/0'", () => {
    const require = createRequire(import.meta.url);
    const { derivePath } = require("../../crypto-wallet/node_modules/ed25519-hd-key");
    const seedHex = Buffer.from(mnemonicToSeedSync(HARDHAT)).toString("hex");
    const derived = deriveAddresses(HARDHAT, [0, 1, 7], "bip44");
    for (const d of derived) {
      const ref = Keypair.fromSeed(derivePath(solanaPath(d.index), seedHex).key).publicKey.toBase58();
      expect(d.solana).toBe(ref);
    }
  });

  it("normalises pasted phrases and validates checksums", () => {
    expect(normalizeMnemonic("  Test  TEST\ttest test test test test test test test test junk ")).toBe(HARDHAT);
    expect(isValidMnemonic(HARDHAT)).toBe(true);
    expect(isValidMnemonic(HARDHAT.replace("junk", "test"))).toBe(false);
    const fresh = newMnemonic();
    expect(fresh.split(" ")).toHaveLength(12);
    expect(isValidMnemonic(fresh)).toBe(true);
  });
});

describe("base58", () => {
  it("matches bs58 for random and edge-case inputs", () => {
    const cases = [new Uint8Array([]), new Uint8Array([0]), new Uint8Array([0, 0, 1]), new Uint8Array(32), new Uint8Array(32).fill(255)];
    for (let i = 0; i < 200; i++) cases.push(crypto.getRandomValues(new Uint8Array(1 + (i % 64))));
    for (const c of cases) {
      const ref = bs58.encode(c);
      expect(b58encode(c)).toBe(ref);
      expect(Array.from(b58decode(ref))).toEqual(Array.from(c));
    }
    expect(Array.from(b58decode("1"))).toEqual([0]);
  });
});
