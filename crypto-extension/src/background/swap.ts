// Executes swap / bridge quotes from the Rizon backend (0x and LI.FI on EVM,
// Jupiter on Solana) — the same quotes the mobile app uses.
//
// One deliberate difference from mobile: token approvals are for the exact
// amount being swapped, never unlimited, so a compromised router can't later
// drain the rest of that token.

import { Contract, Interface, ZeroAddress, getAddress, isAddress } from "ethers";
import { VersionedTransaction } from "@solana/web3.js";
import { API_BASE_URL } from "../shared/chains";
import type { Account } from "../shared/messages";
import { recordActivity } from "./activity";
import { prepareTx, sendPrepared } from "./evmTx";
import { solanaSigner } from "./keyring";
import { evmProvider, solanaConnection } from "./rpc";
import { fromB64 } from "./vault";
import { withMnemonic } from "./wallet";

const erc20 = new Interface([
  "function approve(address spender, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
]);

export interface EvmSwapRequest {
  chainId: number;
  sellToken: { address: string; isNative: boolean; symbol: string };
  buyToken: { address: string; symbol: string };
  sellAmount: string;
  quote: {
    transaction: { to: string; data: string; value?: string; gas?: string; gasLimit?: string };
    allowanceTarget?: string | null;
    buyAmount?: string;
    estimatedPriceImpact?: number | null;
    fees?: any;
  };
  crossChain: boolean;
  summary: string;
}

export async function executeEvmSwap(account: Account, req: EvmSwapRequest, onProgress?: (s: string) => void) {
  const { chainId, quote, sellToken } = req;
  const tx = quote.transaction;
  if (!tx || typeof tx.to !== "string" || !isAddress(tx.to) || typeof tx.data !== "string" || !/^0x[0-9a-fA-F]*$/.test(tx.data)) {
    throw new Error("The swap quote is malformed. Get a new quote and try again.");
  }
  const sellAmount = BigInt(req.sellAmount);
  const value = BigInt(tx.value ?? 0);
  // Sanity-check that the quote spends what the user agreed to.
  if (!req.crossChain) {
    if (sellToken.isNative && value !== sellAmount) throw new Error("Quote value doesn't match the amount you're selling.");
    if (!sellToken.isNative && value !== 0n) throw new Error("Quote unexpectedly sends native funds.");
  } else if (sellToken.isNative && value < sellAmount) {
    throw new Error("Quote value is lower than the amount you're bridging.");
  }

  const provider = evmProvider(chainId);
  let approvalHash: string | undefined;
  const spender = quote.allowanceTarget;
  if (!sellToken.isNative && spender && spender !== ZeroAddress && isAddress(spender)) {
    const token = new Contract(sellToken.address, erc20, provider);
    const allowance: bigint = await token.allowance(account.evm, spender);
    if (allowance < sellAmount) {
      // Some tokens (e.g. USDT) refuse to change a non-zero allowance directly.
      if (allowance > 0n) {
        onProgress?.("Resetting allowance…");
        const reset = await prepareTx(chainId, { from: account.evm, to: getAddress(sellToken.address), value: 0n, data: erc20.encodeFunctionData("approve", [spender, 0n]) });
        if (reset.willFail) throw new Error(`Allowance reset would fail: ${reset.willFail}`);
        await provider.waitForTransaction(await sendPrepared(account.index, reset.tx), 1, 180_000);
      }
      onProgress?.(`Approving ${sellToken.symbol}…`);
      const approve = await prepareTx(chainId, {
        from: account.evm,
        to: getAddress(sellToken.address),
        value: 0n,
        data: erc20.encodeFunctionData("approve", [spender, sellAmount]),
      });
      if (approve.willFail) throw new Error(`Approval would fail: ${approve.willFail}`);
      approvalHash = await sendPrepared(account.index, approve.tx);
      const r = await provider.waitForTransaction(approvalHash, 1, 180_000);
      if (!r || r.status !== 1) throw new Error("The approval transaction failed.");
    }
  }

  onProgress?.(req.crossChain ? "Sending bridge transaction…" : "Sending swap…");
  const prepared = await prepareTx(chainId, {
    from: account.evm,
    to: getAddress(tx.to),
    value,
    data: tx.data,
    gas: tx.gas ?? tx.gasLimit,
  });
  if (prepared.willFail) throw new Error(`This swap would fail right now (${prepared.willFail}). Get a new quote.`);
  if (prepared.insufficientFunds) throw new Error("Not enough funds to cover the amount plus the network fee.");
  const hash = await sendPrepared(account.index, prepared.tx);

  await recordActivity({ network: chainId, hash, kind: req.crossChain ? "bridge" : "swap", from: account.evm, to: tx.to, summary: req.summary });

  // Swap tracking (leaderboard / history), same as mobile. Non-fatal.
  if (!req.crossChain) {
    fetch(`${API_BASE_URL}/swap/record`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        wallet_address: account.evm,
        chain_id: chainId,
        sell_token_symbol: sellToken.symbol,
        sell_token_address: sellToken.address,
        buy_token_symbol: req.buyToken.symbol,
        buy_token_address: req.buyToken.address,
        sell_amount_raw: req.sellAmount,
        buy_amount_raw: quote.buyAmount ?? "0",
        tx_hash: hash,
        price_impact: quote.estimatedPriceImpact ?? null,
        fee_amount_raw: quote.fees?.zeroExFee?.amount ?? null,
      }),
    }).catch(() => {});
  }
  return { hash, approvalHash };
}

/** Jupiter / LI.FI-from-Solana: sign a backend-built transaction exactly as delivered. */
export async function executeSolanaSwap(account: Account, serialized: string, summary: string, kind: "swap" | "bridge") {
  let tx: VersionedTransaction;
  try {
    tx = VersionedTransaction.deserialize(fromB64(serialized));
  } catch {
    throw new Error("The swap transaction couldn't be read. Get a new quote.");
  }
  // Same guard as the mobile app: never sign a transaction someone else pays for.
  if (tx.message.staticAccountKeys[0]?.toBase58() !== account.solana) {
    throw new Error("Refusing to sign: this transaction's fee payer isn't your account.");
  }
  const signature = await withMnemonic(async (m) => {
    tx.sign([solanaSigner(m, account.index)]);
    return solanaConnection().sendRawTransaction(tx.serialize(), { maxRetries: 3, preflightCommitment: "confirmed" });
  });
  await recordActivity({ network: "SOLANA", hash: signature, kind, from: account.solana, summary });
  return { hash: signature };
}
