// Native SOL and SPL token transfers initiated from the wallet's Send screen.

import {
  ComputeBudgetProgram,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  TransactionMessage,
  VersionedTransaction,
  type TransactionInstruction,
} from "@solana/web3.js";
import {
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction,
  createTransferCheckedInstruction,
  getAssociatedTokenAddressSync,
  getMint,
} from "@solana/spl-token";
import { solanaConnection } from "./rpc";
import { solanaSigner } from "./keyring";
import { withMnemonic } from "./wallet";

export interface SolanaSendInput {
  from: string;
  to: string;
  /** Integer amount in base units (lamports / token base units). */
  amount: string;
  /** SPL mint; omit for native SOL. */
  mint?: string;
}

export interface SolanaSendPreview {
  feeLamports: number;
  rentLamports: number;
  createsRecipientAccount: boolean;
  warnings: string[];
}

const ATA_RENT_FALLBACK = 2_039_280;

function parseKey(v: string, what: string) {
  try {
    return new PublicKey(v);
  } catch {
    throw new Error(`Invalid ${what} address`);
  }
}

async function build(input: SolanaSendInput) {
  const conn = solanaConnection();
  const from = parseKey(input.from, "sender");
  const to = parseKey(input.to, "recipient");
  const amount = BigInt(input.amount);
  if (amount <= 0n) throw new Error("Amount must be greater than zero");

  const ixs: TransactionInstruction[] = [ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 50_000 })];
  const warnings: string[] = [];
  let createsRecipientAccount = false;
  let rentLamports = 0;

  if (!input.mint) {
    ixs.push(SystemProgram.transfer({ fromPubkey: from, toPubkey: to, lamports: amount }));
    if (!PublicKey.isOnCurve(to.toBytes())) warnings.push("The recipient is a program-owned address, not a regular wallet.");
  } else {
    const mint = parseKey(input.mint, "token");
    const mintInfo = await conn.getAccountInfo(mint);
    if (!mintInfo) throw new Error("Token mint not found");
    const programId = mintInfo.owner.equals(TOKEN_2022_PROGRAM_ID) ? TOKEN_2022_PROGRAM_ID : TOKEN_PROGRAM_ID;
    const decimals = (await getMint(conn, mint, "confirmed", programId)).decimals;
    const srcAta = getAssociatedTokenAddressSync(mint, from, false, programId);
    // allowOwnerOffCurve: recipients can be PDAs (e.g. smart wallets).
    const dstAta = getAssociatedTokenAddressSync(mint, to, true, programId);
    if (!(await conn.getAccountInfo(dstAta))) {
      createsRecipientAccount = true;
      rentLamports = await conn.getMinimumBalanceForRentExemption(165).catch(() => ATA_RENT_FALLBACK);
      ixs.push(createAssociatedTokenAccountIdempotentInstruction(from, dstAta, to, mint, programId));
    }
    ixs.push(createTransferCheckedInstruction(srcAta, mint, dstAta, from, amount, decimals, [], programId));
  }

  const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash("confirmed");
  const message = new TransactionMessage({ payerKey: from, recentBlockhash: blockhash, instructions: ixs }).compileToV0Message();
  return { conn, from, message, lastValidBlockHeight, warnings, createsRecipientAccount, rentLamports };
}

export async function previewSolanaSend(input: SolanaSendInput): Promise<SolanaSendPreview> {
  const b = await build(input);
  const fee = (await b.conn.getFeeForMessage(b.message, "confirmed")).value ?? 5_000;
  const balance = await b.conn.getBalance(b.from);
  const needed = fee + b.rentLamports + (input.mint ? 0 : Number(input.amount));
  if (balance < needed) {
    b.warnings.unshift(`Not enough SOL: this needs about ${(needed / LAMPORTS_PER_SOL).toFixed(6)} SOL including fees.`);
  }
  return { feeLamports: fee, rentLamports: b.rentLamports, createsRecipientAccount: b.createsRecipientAccount, warnings: b.warnings };
}

export async function sendSolana(accountIndex: number, input: SolanaSendInput): Promise<string> {
  const b = await build(input);
  return withMnemonic(async (m) => {
    const kp = solanaSigner(m, accountIndex);
    if (!kp.publicKey.equals(b.from)) throw new Error("Signer does not match the sending account");
    const tx = new VersionedTransaction(b.message);
    tx.sign([kp]);
    return b.conn.sendRawTransaction(tx.serialize(), { maxRetries: 3, preflightCommitment: "confirmed" });
  });
}
