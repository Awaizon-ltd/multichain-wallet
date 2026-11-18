import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  VersionedTransaction,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountIdempotentInstruction,
  createTransferCheckedInstruction,
  getMint,
} from "@solana/spl-token";
import { mnemonicToSeedSync } from "@scure/bip39";
import { base58, base64 } from "@scure/base";
import { hmac } from "@noble/hashes/hmac.js";
import { sha512 } from "@noble/hashes/sha2.js";
import { NON_EVM_CHAINS } from "../constants/nonEvmChain"; // adjust path to match your project
import { isValidMnemonic } from "./Wallet";

/* -------------------------------------------------------------------------- */
/*  Connection                                                                */
/* -------------------------------------------------------------------------- */

export const SOLANA_CHAIN = NON_EVM_CHAINS.SOLANA;
const RPC_URL = SOLANA_CHAIN.rpcUrl;

let _connection = null;

/**
 * Get a shared Solana connection (singleton)
 * @returns {Connection}
 */
export const getSolanaConnection = () => {
  if (!_connection) {
    _connection = new Connection(RPC_URL, { commitment: "confirmed" });
  }
  return _connection;
};

/* -------------------------------------------------------------------------- */
/*  Key derivation (SLIP-0010 ed25519)                                        */
/* -------------------------------------------------------------------------- */

const HARDENED = 0x80000000;

const deriveEd25519Seed = (seed, path) => {
  let I = hmac(sha512, new TextEncoder().encode("ed25519 seed"), seed);
  let key = I.slice(0, 32);
  let chain = I.slice(32);

  for (const segment of path.split("/").slice(1)) {
    const index = (parseInt(segment.replace("'", ""), 10) + HARDENED) >>> 0;
    const data = new Uint8Array(37); // 0x00 || key(32) || index(4)
    data.set(key, 1);
    new DataView(data.buffer).setUint32(33, index, false);
    I = hmac(sha512, chain, data);
    key = I.slice(0, 32);
    chain = I.slice(32);
  }
  return key;
};

/**
 * Get a Solana Keypair from a mnemonic.
 * Uses m/44'/501'/{index}'/0' (Phantom / Solflare compatible).
 * @param {string} mnemonic - Mnemonic phrase
 * @param {number} accountIndex - Account derivation index
 * @returns {Keypair}
 */
export const getSolanaKeypairFromMnemonic = (mnemonic, accountIndex = 0) => {
  if (!isValidMnemonic(mnemonic)) {
    throw new Error("Invalid mnemonic phrase");
  }
  const seed = mnemonicToSeedSync(mnemonic);
  const secret = deriveEd25519Seed(seed, `m/44'/501'/${accountIndex}'/0'`);
  return Keypair.fromSeed(secret);
};

/**
 * Derive Solana addresses for several account indices, computing the BIP-39
 * seed only once (PBKDF2 is slow in JS, so don't call
 * getSolanaKeypairFromMnemonic in a loop). Returns public addresses only.
 * @param {string} mnemonic - Mnemonic phrase
 * @param {number[]} indices - Account derivation indices
 * @returns {string[]} base58 addresses, in the same order as `indices`
 */
export const getSolanaAddressesForIndices = (mnemonic, indices) => {
  if (!isValidMnemonic(mnemonic)) {
    throw new Error("Invalid mnemonic phrase");
  }
  const seed = mnemonicToSeedSync(mnemonic);
  return indices.map((accountIndex) =>
    Keypair.fromSeed(
      deriveEd25519Seed(seed, `m/44'/501'/${accountIndex}'/0'`),
    ).publicKey.toBase58(),
  );
};

/**
 * Create Solana account from mnemonic
 * @param {string} mnemonic - Mnemonic phrase
 * @param {number} accountIndex - Account derivation index
 * @returns {object} Account object with address and private key
 */
export const createSolanaAccountFromMnemonic = (mnemonic, accountIndex = 0) => {
  const kp = getSolanaKeypairFromMnemonic(mnemonic, accountIndex);
  return {
    address: kp.publicKey.toBase58(),
    publicKey: kp.publicKey.toBase58(),
    // base58 of the 64-byte secret key: the format Phantom/Solflare import/export
    privateKey: base58.encode(kp.secretKey),
    index: accountIndex,
  };
};

/**
 * Derive multiple Solana accounts from a single mnemonic
 * @param {string} mnemonic - Mnemonic phrase
 * @param {number} count - Number of accounts to derive
 * @param {number} startIndex - Starting index
 * @returns {Array} Array of account objects
 */
export const deriveMultipleSolanaAccounts = (
  mnemonic,
  count = 5,
  startIndex = 0,
) => {
  const accounts = [];
  for (let i = 0; i < count; i++) {
    const index = startIndex + i;
    accounts.push({
      ...createSolanaAccountFromMnemonic(mnemonic, index),
      name: `Account ${index + 1}`,
    });
  }
  return accounts;
};

/**
 * Get a Keypair from an exported private key.
 * Accepts base58 (64-byte), a JSON byte array "[12,34,...]", or 32-byte hex.
 * @param {string} privateKey
 * @returns {Keypair}
 */
export const getSolanaKeypairFromPrivateKey = (privateKey) => {
  const input = privateKey.trim();

  if (input.startsWith("[")) {
    return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(input)));
  }

  const hex = input.replace(/^0x/, "");
  if (/^[0-9a-fA-F]{64}$/.test(hex)) {
    const bytes = Uint8Array.from(
      hex.match(/.{2}/g).map((b) => parseInt(b, 16)),
    );
    return Keypair.fromSeed(bytes);
  }

  const decoded = base58.decode(input);
  if (decoded.length === 64) return Keypair.fromSecretKey(decoded);
  if (decoded.length === 32) return Keypair.fromSeed(decoded);
  throw new Error("Invalid Solana private key");
};

/**
 * Create Solana account from private key
 * @param {string} privateKey
 * @returns {object} Account object
 */
export const createSolanaAccountFromPrivateKey = (privateKey) => {
  const kp = getSolanaKeypairFromPrivateKey(privateKey);
  return {
    address: kp.publicKey.toBase58(),
    publicKey: kp.publicKey.toBase58(),
    privateKey: base58.encode(kp.secretKey),
  };
};

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Validate Solana address
 * @param {string} address
 * @returns {boolean}
 */
export const isValidSolanaAddress = (address) => {
  try {
    if (!address || address.length < 32 || address.length > 44) return false;
    return new PublicKey(address).toBytes().length === 32;
  } catch {
    return false;
  }
};

/**
 * Convert a decimal string to base units without floating point errors.
 * @param {string} amount - e.g. "0.05"
 * @param {number} decimals - 9 for SOL, mint decimals for tokens
 * @returns {bigint}
 */
export const toBaseUnits = (amount, decimals) => {
  const str = String(amount).trim();
  if (!/^\d*\.?\d+$|^\d+\.?$/.test(str)) throw new Error("Invalid amount");
  const [whole = "0", frac = ""] = str.split(".");
  if (frac.length > decimals) {
    throw new Error(`Too many decimal places (max ${decimals})`);
  }
  return (
    BigInt(whole || "0") * 10n ** BigInt(decimals) +
    BigInt(frac.padEnd(decimals, "0") || "0")
  );
};

/** Base units → decimal string, without floating point errors. */
const formatBaseUnits = (raw, decimals) => {
  const v = BigInt(raw);
  if (decimals === 0) return v.toString();
  const base = 10n ** BigInt(decimals);
  const frac = (v % base)
    .toString()
    .padStart(decimals, "0")
    .replace(/0+$/, "");
  return frac ? `${v / base}.${frac}` : (v / base).toString();
};

const lamportsToSol = (lamports) => formatBaseUnits(lamports, 9);

/* -------------------------------------------------------------------------- */
/*  Balances (30s cache, in-flight dedupe, like the EVM Balances module)      */
/* -------------------------------------------------------------------------- */

const CACHE_TTL = 30_000;
const balanceCache = new Map(); // address -> { ts, data }
const inflight = new Map();

/**
 * Get native SOL balance
 * @param {string} address
 * @param {object} options - { force: boolean }
 * @returns {Promise<object>} { lamports, formatted, symbol, chainName }
 */
export const getSolBalance = async (address, { force = false } = {}) => {
  const cached = balanceCache.get(address);
  if (!force && cached && Date.now() - cached.ts < CACHE_TTL) {
    return cached.data;
  }
  if (inflight.has(address)) return inflight.get(address);

  const promise = (async () => {
    try {
      const lamports = await getSolanaConnection().getBalance(
        new PublicKey(address),
      );
      const data = {
        lamports: lamports.toString(),
        wei: lamports.toString(), // alias so UI code shared with EVM keeps working
        formatted: lamportsToSol(lamports),
        symbol: SOLANA_CHAIN.symbol,
        chainId: SOLANA_CHAIN.key,
        chainName: SOLANA_CHAIN.name,
      };
      balanceCache.set(address, { ts: Date.now(), data });
      return data;
    } catch (error) {
      console.error("Error fetching SOL balance:", error);
      if (cached) return cached.data; // stale-while-error
      throw error;
    } finally {
      inflight.delete(address);
    }
  })();

  inflight.set(address, promise);
  return promise;
};

/**
 * Get all SPL token balances (Token and Token-2022 programs)
 * @param {string} address
 * @param {object} options - { includeZero: boolean }
 * @returns {Promise<Array>} [{ mint, amount, decimals, formatted, programId, tokenAccount }]
 */
export const getSplTokenBalances = async (
  address,
  { includeZero = false } = {},
) => {
  const connection = getSolanaConnection();
  const owner = new PublicKey(address);

  const [legacy, token2022] = await Promise.all([
    connection.getParsedTokenAccountsByOwner(owner, {
      programId: TOKEN_PROGRAM_ID,
    }),
    connection.getParsedTokenAccountsByOwner(owner, {
      programId: TOKEN_2022_PROGRAM_ID,
    }),
  ]);

  const toEntry =
    (programId) =>
    ({ pubkey, account }) => {
      const info = account.data.parsed.info;
      return {
        mint: info.mint,
        amount: info.tokenAmount.amount,
        decimals: info.tokenAmount.decimals,
        formatted: info.tokenAmount.uiAmountString,
        programId: programId.toBase58(),
        tokenAccount: pubkey.toBase58(),
      };
    };

  const all = [
    ...legacy.value.map(toEntry(TOKEN_PROGRAM_ID)),
    ...token2022.value.map(toEntry(TOKEN_2022_PROGRAM_ID)),
  ];

  return includeZero ? all : all.filter((t) => t.amount !== "0");
};

/**
 * Get one SPL token's balance (summed across the owner's token accounts for
 * that mint, Token or Token-2022). 30s cache, like getSolBalance.
 * @param {string} address - Wallet address
 * @param {string} mint - Token mint address
 * @param {object} options - { force: boolean }
 * @returns {Promise<object>} { amount, decimals, formatted }
 */
export const getSplTokenBalance = async (
  address,
  mint,
  { force = false } = {},
) => {
  const key = `${address}:${mint}`;
  const cached = balanceCache.get(key);
  if (!force && cached && Date.now() - cached.ts < CACHE_TTL) {
    return cached.data;
  }

  const { value } = await getSolanaConnection().getParsedTokenAccountsByOwner(
    new PublicKey(address),
    { mint: new PublicKey(mint) },
  );

  let amount = 0n;
  let decimals = 0;
  for (const { account } of value) {
    const { tokenAmount } = account.data.parsed.info;
    amount += BigInt(tokenAmount.amount);
    decimals = tokenAmount.decimals;
  }

  const data = {
    amount: amount.toString(),
    decimals,
    formatted: formatBaseUnits(amount, decimals),
  };
  balanceCache.set(key, { ts: Date.now(), data });
  return data;
};

/**
 * Get balances for multiple Solana addresses
 * @param {Array<string>} addresses
 * @returns {Promise<object>} Balances keyed by address
 */
export const getMultiAccountSolBalances = async (addresses) => {
  const results = await Promise.all(
    addresses.map(async (address) => {
      try {
        return { address, balance: await getSolBalance(address) };
      } catch (error) {
        console.error(`Error fetching SOL balance for ${address}:`, error);
        return { address, balance: null };
      }
    }),
  );
  return Object.fromEntries(results.map((r) => [r.address, r.balance]));
};

/* -------------------------------------------------------------------------- */
/*  Fees                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Estimate fee for a transaction (in lamports)
 * @param {Transaction} tx - Built transaction (needs feePayer + recentBlockhash)
 * @returns {Promise<number>}
 */
export const estimateSolanaFee = async (tx) => {
  try {
    const connection = getSolanaConnection();
    if (!tx.recentBlockhash) {
      tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
    }
    const res = await connection.getFeeForMessage(tx.compileMessage());
    return res.value ?? 5000;
  } catch (error) {
    console.error("Error estimating Solana fee:", error);
    return 5000; // base fee for a single-signature tx
  }
};

/* -------------------------------------------------------------------------- */
/*  Sending                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Sign, send and confirm by polling (no websockets, which are flaky in RN).
 * @returns {Promise<string>} signature
 */
const signSendConfirm = async (tx, signers, { timeoutMs = 60_000 } = {}) => {
  const connection = getSolanaConnection();
  const { blockhash, lastValidBlockHeight } =
    await connection.getLatestBlockhash("confirmed");

  tx.recentBlockhash = blockhash;
  tx.feePayer = signers[0].publicKey;
  tx.sign(...signers);

  const signature = await connection.sendRawTransaction(tx.serialize(), {
    skipPreflight: false,
    maxRetries: 3,
  });

  return confirmSignature(signature, { lastValidBlockHeight, timeoutMs });
};

/**
 * Poll until a signature is confirmed (no websockets, which are flaky in RN).
 * Expiry is detected from `lastValidBlockHeight` when known, otherwise by
 * asking the RPC whether `blockhash` is still valid.
 * @returns {Promise<string>} signature (also when still pending at timeout,
 *   so the UI can keep tracking it)
 */
const confirmSignature = async (
  signature,
  { lastValidBlockHeight, blockhash, timeoutMs = 60_000 } = {},
) => {
  const connection = getSolanaConnection();
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const { value } = await connection.getSignatureStatuses([signature]);
    const status = value[0];
    if (status) {
      if (status.err) {
        throw new Error(`Transaction failed: ${JSON.stringify(status.err)}`);
      }
      if (
        status.confirmationStatus === "confirmed" ||
        status.confirmationStatus === "finalized"
      ) {
        return signature;
      }
    } else {
      // Not landed yet: has it expired?
      let expired = false;
      if (lastValidBlockHeight) {
        const height = await connection.getBlockHeight("confirmed");
        expired = height > lastValidBlockHeight;
      } else if (blockhash) {
        const { value: valid } = await connection.isBlockhashValid(blockhash, {
          commitment: "confirmed",
        });
        expired = !valid;
      }
      if (expired) {
        throw new Error("Transaction expired before confirmation. Try again.");
      }
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
  return signature;
};

/**
 * Sign and send a transaction built elsewhere (a Jupiter swap or a LI.FI
 * bridge route from the backend), then confirm it.
 *
 * The transaction is signed exactly as received — its blockhash, fees and
 * instructions are not modified — but it is refused unless this wallet is
 * its fee payer, so a quote built for someone else can never be signed.
 *
 * @param {Keypair} keypair - Signer (from createSolanaSignerForTransaction)
 * @param {string} serialized - base64 VersionedTransaction
 * @param {object} options - { lastValidBlockHeight }
 * @returns {Promise<string>} Transaction signature
 */
export const signAndSendSerializedTransaction = async (
  keypair,
  serialized,
  { lastValidBlockHeight } = {},
) => {
  const tx = VersionedTransaction.deserialize(base64.decode(serialized));

  const feePayer = tx.message.staticAccountKeys[0];
  if (!feePayer?.equals(keypair.publicKey)) {
    throw new Error("This transaction was not built for your wallet.");
  }

  tx.sign([keypair]);

  // Preflight on: a swap that would fail (slippage, balance) is rejected
  // here for free instead of landing on-chain and costing a fee.
  const signature = await getSolanaConnection().sendRawTransaction(
    tx.serialize(),
    { skipPreflight: false, preflightCommitment: "confirmed", maxRetries: 3 },
  );

  try {
    return await confirmSignature(signature, {
      lastValidBlockHeight,
      blockhash: tx.message.recentBlockhash,
    });
  } finally {
    // Balances changed (or may have): drop every cached entry for this wallet
    const owner = keypair.publicKey.toBase58();
    for (const key of balanceCache.keys()) {
      if (key === owner || key.startsWith(`${owner}:`)) balanceCache.delete(key);
    }
  }
};

/**
 * Send SOL
 * @param {Keypair} keypair - Sender keypair
 * @param {string} to - Recipient address
 * @param {string} amount - Amount in SOL
 * @returns {Promise<string>} Transaction signature
 */
export const sendSol = async (keypair, to, amount) => {
  try {
    if (!isValidSolanaAddress(to)) throw new Error("Invalid recipient address");

    const connection = getSolanaConnection();
    const toPubkey = new PublicKey(to);
    const lamports = toBaseUnits(amount, 9);
    if (lamports <= 0n) throw new Error("Amount must be greater than zero");

    // A brand-new account must receive at least the rent-exempt minimum
    const recipientBalance = await connection.getBalance(toPubkey);
    if (recipientBalance === 0) {
      const minRent = await connection.getMinimumBalanceForRentExemption(0);
      if (lamports < BigInt(minRent)) {
        throw new Error(
          `Recipient account is empty. Send at least ${lamportsToSol(minRent)} SOL.`,
        );
      }
    }

    const tx = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: keypair.publicKey,
        toPubkey,
        lamports,
      }),
    );

    const signature = await signSendConfirm(tx, [keypair]);
    balanceCache.delete(keypair.publicKey.toBase58());
    balanceCache.delete(to);
    return signature;
  } catch (error) {
    console.error("Error sending SOL:", error);
    throw error;
  }
};

/**
 * Send an SPL token (creates recipient's token account if needed)
 * @param {Keypair} keypair - Sender keypair
 * @param {string} to - Recipient wallet address
 * @param {string} mint - Token mint address
 * @param {string} amount - Human-readable amount
 * @returns {Promise<string>} Transaction signature
 */
export const sendSplToken = async (keypair, to, mint, amount) => {
  try {
    if (!isValidSolanaAddress(to)) throw new Error("Invalid recipient address");

    const connection = getSolanaConnection();
    const mintPubkey = new PublicKey(mint);
    const toPubkey = new PublicKey(to);

    // Detect Token vs Token-2022 from the mint's owner
    const mintInfo = await connection.getAccountInfo(mintPubkey);
    if (!mintInfo) throw new Error("Token mint not found");
    const programId = mintInfo.owner.equals(TOKEN_2022_PROGRAM_ID)
      ? TOKEN_2022_PROGRAM_ID
      : TOKEN_PROGRAM_ID;

    const { decimals } = await getMint(
      connection,
      mintPubkey,
      "confirmed",
      programId,
    );
    const rawAmount = toBaseUnits(amount, decimals);
    if (rawAmount <= 0n) throw new Error("Amount must be greater than zero");

    const fromAta = getAssociatedTokenAddressSync(
      mintPubkey,
      keypair.publicKey,
      false,
      programId,
    );
    const toAta = getAssociatedTokenAddressSync(
      mintPubkey,
      toPubkey,
      true, // allow off-curve owners (PDAs)
      programId,
    );

    const tx = new Transaction().add(
      // Idempotent: no-op if the recipient's token account already exists.
      // Sender pays the ~0.002 SOL rent for creating it.
      createAssociatedTokenAccountIdempotentInstruction(
        keypair.publicKey,
        toAta,
        toPubkey,
        mintPubkey,
        programId,
      ),
      createTransferCheckedInstruction(
        fromAta,
        mintPubkey,
        toAta,
        keypair.publicKey,
        rawAmount,
        decimals,
        [],
        programId,
      ),
    );

    const signature = await signSendConfirm(tx, [keypair]);
    balanceCache.delete(keypair.publicKey.toBase58());
    balanceCache.delete(`${keypair.publicKey.toBase58()}:${mint}`);
    return signature;
  } catch (error) {
    console.error("Error sending SPL token:", error);
    throw error;
  }
};

/* -------------------------------------------------------------------------- */
/*  History                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Get recent transaction signatures for an address
 * @param {string} address
 * @param {object} options - { limit, before }
 * @returns {Promise<Array>} [{ signature, slot, timestamp, status }]
 */
export const getSolanaTransactionHistory = async (
  address,
  { limit = 25, before } = {},
) => {
  try {
    const sigs = await getSolanaConnection().getSignaturesForAddress(
      new PublicKey(address),
      { limit, before },
    );
    return sigs.map((s) => ({
      signature: s.signature,
      slot: s.slot,
      timestamp: s.blockTime ? s.blockTime * 1000 : null,
      status: s.err ? "failed" : "success",
      memo: s.memo || null,
    }));
  } catch (error) {
    console.error("Error fetching Solana history:", error);
    throw error;
  }
};

/**
 * Get a parsed transaction by signature
 * @param {string} signature
 * @returns {Promise<object|null>}
 */
export const getSolanaTransaction = async (signature) => {
  try {
    return await getSolanaConnection().getParsedTransaction(signature, {
      maxSupportedTransactionVersion: 0,
      commitment: "confirmed",
    });
  } catch (error) {
    console.error("Error fetching Solana transaction:", error);
    throw error;
  }
};

/**
 * Explorer link for a transaction
 * @param {string} signature
 * @returns {string}
 */
export const getSolanaExplorerUrl = (signature) =>
  `${SOLANA_CHAIN.explorer}/tx/${signature}`;

export { LAMPORTS_PER_SOL };
