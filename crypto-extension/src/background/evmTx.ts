// Building, previewing, signing and broadcasting EVM transactions. Shared by
// dApp `eth_sendTransaction` and the wallet's own Send screen.

import { formatUnits, getAddress, isAddress, type TransactionRequest } from "ethers";
import { requireEvmChain } from "../shared/chains";
import { decodeCall, type DecodedCall } from "../shared/decode";
import { invalidParams } from "../shared/errors";
import { evmSigner } from "./keyring";
import { evmProvider, tokenMeta } from "./rpc";
import { withMnemonic } from "./wallet";

export interface TxInput {
  from: string;
  to?: string | null;
  value?: string | bigint;
  data?: string;
  gas?: string | bigint;
}

export interface PreparedTx {
  chainId: number;
  from: string;
  to: string | null;
  value: string;
  data: string;
  gasLimit: string;
  type: 0 | 2;
  maxFeePerGas?: string;
  maxPriorityFeePerGas?: string;
  gasPrice?: string;
}

export interface TxPreview {
  tx: PreparedTx;
  decoded: DecodedCall;
  token?: { symbol: string; decimals: number; amountFormatted?: string };
  nativeSymbol: string;
  valueFormatted: string;
  maxFee: string;
  maxFeeFormatted: string;
  willFail?: string;
  insufficientFunds: boolean;
  warnings: string[];
}

const big = (v: unknown, field: string): bigint => {
  if (v === undefined || v === null || v === "") return 0n;
  try {
    return BigInt(v as any);
  } catch {
    throw invalidParams(`Invalid ${field}`);
  }
};

/** Validates and normalises a dApp/UI transaction request. */
export function normaliseTxInput(raw: any): TxInput {
  if (!raw || typeof raw !== "object") throw invalidParams("Transaction must be an object");
  if (typeof raw.from !== "string" || !isAddress(raw.from)) throw invalidParams("Missing or invalid `from`");
  if (raw.to !== undefined && raw.to !== null && (typeof raw.to !== "string" || !isAddress(raw.to))) {
    throw invalidParams("Invalid `to` address");
  }
  const data = raw.data ?? raw.input ?? "0x";
  if (typeof data !== "string" || !/^0x([0-9a-fA-F]{2})*$/.test(data)) throw invalidParams("Invalid `data`");
  return {
    from: getAddress(raw.from),
    to: raw.to ? getAddress(raw.to) : null,
    value: big(raw.value, "value"),
    data,
    gas: raw.gas ?? raw.gasLimit,
  };
}

export async function prepareTx(chainId: number, input: TxInput): Promise<TxPreview> {
  const chain = requireEvmChain(chainId);
  const provider = evmProvider(chainId);
  const value = big(input.value, "value");
  const data = input.data ?? "0x";
  const warnings: string[] = [];
  const decoded = decodeCall(input.to, value, data);
  warnings.push(...decoded.warnings);

  const call = { from: input.from, to: input.to ?? undefined, value, data };
  let gasLimit: bigint;
  let willFail: string | undefined;
  try {
    const est = await provider.estimateGas(call);
    gasLimit = (est * 120n) / 100n;
  } catch (e: any) {
    willFail = e?.shortMessage || e?.info?.error?.message || e?.message || "Simulation failed";
    gasLimit = input.gas !== undefined ? big(input.gas, "gas") : 300_000n;
    warnings.unshift("This transaction is likely to fail. You would still pay the network fee.");
  }
  if (input.gas !== undefined && !willFail) {
    const requested = big(input.gas, "gas");
    if (requested > gasLimit) gasLimit = requested;
  }

  const fee = await provider.getFeeData();
  let tx: PreparedTx;
  let maxFee: bigint;
  if (fee.maxFeePerGas != null && fee.maxPriorityFeePerGas != null) {
    tx = {
      chainId,
      from: input.from,
      to: input.to ?? null,
      value: value.toString(),
      data,
      gasLimit: gasLimit.toString(),
      type: 2,
      maxFeePerGas: fee.maxFeePerGas.toString(),
      maxPriorityFeePerGas: fee.maxPriorityFeePerGas.toString(),
    };
    maxFee = gasLimit * fee.maxFeePerGas;
  } else {
    const gasPrice = fee.gasPrice ?? 0n;
    tx = {
      chainId,
      from: input.from,
      to: input.to ?? null,
      value: value.toString(),
      data,
      gasLimit: gasLimit.toString(),
      type: 0,
      gasPrice: gasPrice.toString(),
    };
    maxFee = gasLimit * gasPrice;
  }

  const balance = await provider.getBalance(input.from);
  const insufficientFunds = balance < value + maxFee;
  if (insufficientFunds) warnings.unshift(`Not enough ${chain.symbol} to cover the amount plus the network fee.`);

  let token: TxPreview["token"];
  if (decoded.kind !== "nativeTransfer" && decoded.kind !== "contractCall" && decoded.kind !== "contractDeploy") {
    const meta = await tokenMeta(chainId, decoded.kind === "permit2Approve" ? decoded.token! : decoded.target!);
    if (meta) {
      token = {
        symbol: meta.symbol,
        decimals: meta.decimals,
        amountFormatted:
          decoded.amount !== undefined && !decoded.unlimited ? formatUnits(decoded.amount, meta.decimals) : undefined,
      };
    }
  }

  return {
    tx,
    decoded,
    token,
    nativeSymbol: chain.symbol,
    valueFormatted: formatUnits(value, 18),
    maxFee: maxFee.toString(),
    maxFeeFormatted: formatUnits(maxFee, 18),
    willFail,
    insufficientFunds,
    warnings,
  };
}

/** Signs and broadcasts a prepared transaction for the account at `accountIndex`. */
export async function sendPrepared(accountIndex: number, tx: PreparedTx): Promise<string> {
  const provider = evmProvider(tx.chainId);
  return withMnemonic(async (m, derivation) => {
    const signer = evmSigner(m, accountIndex, derivation).connect(provider);
    if (signer.address !== getAddress(tx.from)) throw new Error("Signer does not match the sending account");
    const nonce = await provider.getTransactionCount(signer.address, "pending");
    const req: TransactionRequest = {
      chainId: tx.chainId,
      to: tx.to ?? undefined,
      value: BigInt(tx.value),
      data: tx.data,
      gasLimit: BigInt(tx.gasLimit),
      nonce,
      type: tx.type,
    };
    if (tx.type === 2) {
      req.maxFeePerGas = BigInt(tx.maxFeePerGas!);
      req.maxPriorityFeePerGas = BigInt(tx.maxPriorityFeePerGas!);
    } else {
      req.gasPrice = BigInt(tx.gasPrice!);
    }
    const sent = await signer.sendTransaction(req);
    return sent.hash;
  });
}
