// Solana dApp requests (Wallet Standard features, see content/inpage.ts).
// Payload bytes travel as base64 strings.

import { PublicKey, VersionedMessage, VersionedTransaction } from "@solana/web3.js";
import { ed25519 } from "@noble/curves/ed25519.js";
import { checkOrigin } from "../shared/domainSecurity";
import { invalidParams, rejected, unauthorized, unsupported } from "../shared/errors";
import { requestApproval } from "./approvals";
import { emit } from "./events";
import { solanaSigner } from "./keyring";
import { solanaConnection } from "./rpc";
import { getSite, removeSite, upsertSite } from "./sites";
import { accountBySolanaAddress, getAccounts, isUnlocked, withMnemonic } from "./wallet";
import { fromB64, toB64 } from "./vault";
import { recordActivity } from "./activity";

const KNOWN_PROGRAMS: Record<string, string> = {
  "11111111111111111111111111111111": "System Program",
  TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA: "SPL Token",
  TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb: "Token-2022",
  ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL: "Associated Token Account",
  ComputeBudget111111111111111111111111111111: "Compute Budget",
  MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr: "Memo",
  JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4: "Jupiter Aggregator",
};

interface TxSummary {
  feePayer: string;
  weArePayer: boolean;
  programs: { id: string; name?: string }[];
  solChange?: number; // lamports, negative = leaves the account
  simulationError?: string;
  warnings: string[];
}

async function summarise(tx: VersionedTransaction, owner: PublicKey): Promise<TxSummary> {
  const keys = tx.message.staticAccountKeys;
  const feePayer = keys[0].toBase58();
  const programs = [
    ...new Set(tx.message.compiledInstructions.map((ix) => keys[ix.programIdIndex]?.toBase58() ?? "lookup-table program")),
  ].map((id) => ({ id, name: KNOWN_PROGRAMS[id] }));
  const warnings: string[] = [];
  if (programs.some((p) => !p.name)) warnings.push("This transaction calls programs Rizon doesn't recognise.");

  let solChange: number | undefined;
  let simulationError: string | undefined;
  try {
    const conn = solanaConnection();
    const [before, sim] = await Promise.all([
      conn.getBalance(owner),
      conn.simulateTransaction(tx, {
        sigVerify: false,
        replaceRecentBlockhash: true,
        accounts: { encoding: "base64", addresses: [owner.toBase58()] },
      }),
    ]);
    if (sim.value.err) simulationError = JSON.stringify(sim.value.err);
    const after = sim.value.accounts?.[0]?.lamports;
    if (typeof after === "number") solChange = after - before;
  } catch (e: any) {
    simulationError = e?.message ?? "Simulation unavailable";
  }
  if (simulationError) warnings.unshift("Simulation failed — this transaction will probably fail.");
  return { feePayer, weArePayer: feePayer === owner.toBase58(), programs, solChange, simulationError, warnings };
}

function decodeTx(b64: unknown): VersionedTransaction {
  if (typeof b64 !== "string") throw invalidParams("Transaction must be base64");
  try {
    return VersionedTransaction.deserialize(fromB64(b64));
  } catch {
    throw invalidParams("Could not decode the transaction");
  }
}

async function requireAccount(origin: string, address: unknown) {
  const site = await getSite(origin);
  if (!site?.solanaAccount || site.solanaAccount !== address) throw unauthorized();
  const account = await accountBySolanaAddress(site.solanaAccount);
  if (!account) throw unauthorized();
  return account;
}

/**
 * True only if `bytes` is exactly a serialized transaction message (it parses
 * and re-serializes byte-for-byte, with at least one signer). Ordinary text
 * can't satisfy the round trip, so sign-in messages are never refused.
 */
export function looksLikeTransactionMessage(bytes: Uint8Array): boolean {
  try {
    const msg = VersionedMessage.deserialize(bytes);
    if (msg.header.numRequiredSignatures < 1 || msg.staticAccountKeys.length < 1) return false;
    const again = msg.serialize();
    return again.length === bytes.length && again.every((b, i) => b === bytes[i]);
  } catch {
    return false;
  }
}

function signerIndex(tx: VersionedTransaction, owner: PublicKey): number {
  const n = tx.message.header.numRequiredSignatures;
  const i = tx.message.staticAccountKeys.slice(0, n).findIndex((k) => k.equals(owner));
  if (i < 0) throw invalidParams("This transaction doesn't need your signature.");
  return i;
}

export async function handleSolana(origin: string, method: string, params: any): Promise<unknown> {
  switch (method) {
    case "connect": {
      const site = await getSite(origin);
      if (site?.solanaAccount && (await isUnlocked())) return { publicKey: site.solanaAccount };
      if (params?.onlyIfTrusted) {
        if (!site?.solanaAccount) throw rejected("Not trusted yet");
        throw rejected("Rizon is locked");
      }
      if (site?.solanaAccount) {
        await requestApproval("unlock", origin, {});
        return { publicKey: site.solanaAccount };
      }
      const { account } = await requestApproval<{ account: string }>("solanaConnect", origin, {
        namespace: "solana",
        security: checkOrigin(origin),
      });
      const owned = await getAccounts();
      if (!owned.some((a) => a.solana === account)) throw unauthorized("No account selected.");
      await upsertSite(origin, { solanaAccount: account, connectedAt: Date.now() });
      emit(origin, "solana", "accountChanged", account);
      return { publicKey: account };
    }

    case "disconnect": {
      const site = await getSite(origin);
      if (site) {
        if (site.evmAccounts.length > 0) await upsertSite(origin, { solanaAccount: undefined });
        else await removeSite(origin);
      }
      emit(origin, "solana", "accountChanged", null);
      return null;
    }

    case "signMessage": {
      const account = await requireAccount(origin, params?.account);
      if (typeof params?.message !== "string") throw invalidParams("Message must be base64");
      const bytes = fromB64(params.message);
      if (looksLikeTransactionMessage(bytes)) {
        throw invalidParams("Refusing to sign a transaction disguised as a message.");
      }
      let text: string | undefined;
      try {
        text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
      } catch {
        text = undefined;
      }
      await requestApproval("solanaSignMessage", origin, {
        address: account.solana,
        accountName: account.name,
        text,
        hex: text === undefined ? Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("") : undefined,
        security: checkOrigin(origin),
      });
      const signature = await withMnemonic((m) => ed25519.sign(bytes, solanaSigner(m, account.index).secretKey.slice(0, 32)));
      return { signature: toB64(signature) };
    }

    case "signTransaction":
    case "signAndSendTransaction": {
      const account = await requireAccount(origin, params?.account);
      const owner = new PublicKey(account.solana);
      const raws: unknown[] = method === "signTransaction" ? params?.transactions : [params?.transaction];
      if (!Array.isArray(raws) || raws.length === 0 || raws.length > 10) throw invalidParams("Expected 1–10 transactions");
      const txs = raws.map(decodeTx);
      txs.forEach((t) => signerIndex(t, owner));
      const summaries = await Promise.all(txs.map((t) => summarise(t, owner)));
      await requestApproval("solanaSignTransaction", origin, {
        address: account.solana,
        accountName: account.name,
        send: method === "signAndSendTransaction",
        summaries,
        security: checkOrigin(origin),
      });
      const signed = await withMnemonic((m) => {
        const kp = solanaSigner(m, account.index);
        for (const t of txs) t.sign([kp]);
        return txs;
      });
      if (method === "signTransaction") return { signedTransactions: signed.map((t) => toB64(t.serialize())) };
      const opts = params?.options ?? {};
      const signature = await solanaConnection().sendRawTransaction(signed[0].serialize(), {
        skipPreflight: !!opts.skipPreflight,
        maxRetries: typeof opts.maxRetries === "number" ? opts.maxRetries : 3,
        preflightCommitment: opts.preflightCommitment ?? "confirmed",
      });
      await recordActivity({ network: "SOLANA", hash: signature, kind: "dapp", from: account.solana, summary: "dApp transaction", origin });
      return { signature };
    }
  }
  throw unsupported(`solana:${method}`);
}
