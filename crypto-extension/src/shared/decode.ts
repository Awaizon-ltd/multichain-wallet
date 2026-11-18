// Turns raw transaction calldata and EIP-712 payloads into display-ready,
// security-relevant summaries for the approval screen.

import { AbiCoder, getAddress, isHexString, toUtf8String } from "ethers";

export const MAX_UINT256 = (1n << 256n) - 1n;
/** Treat anything at or above 2^128 as "unlimited" (same threshold as the smart account). */
export const UNLIMITED = 1n << 128n;

export type CallKind =
  | "nativeTransfer"
  | "erc20Transfer"
  | "erc20TransferFrom"
  | "approve"
  | "increaseAllowance"
  | "setApprovalForAll"
  | "permit2Approve"
  | "contractCall"
  | "contractDeploy";

export interface DecodedCall {
  kind: CallKind;
  selector?: string;
  /** Token contract for token actions, otherwise the call target. */
  target?: string;
  spender?: string;
  recipient?: string;
  amount?: string; // raw integer string
  unlimited?: boolean;
  approved?: boolean;
  token?: string; // Permit2's underlying token
  warnings: string[];
}

const coder = AbiCoder.defaultAbiCoder();
const SEL = {
  transfer: "0xa9059cbb",
  transferFrom: "0x23b872dd",
  approve: "0x095ea7b3",
  increaseAllowance: "0x39509351",
  setApprovalForAll: "0xa22cb465",
  permit2Approve: "0x87517c45",
} as const;

function args(types: string[], data: string) {
  return coder.decode(types, "0x" + data.slice(10));
}

export function decodeCall(to: string | undefined | null, value: bigint, data: string | undefined): DecodedCall {
  const d = (data ?? "0x").toLowerCase();
  if (!to) return { kind: "contractDeploy", warnings: ["This transaction deploys a new contract."] };
  if (d === "0x" || d === "") return { kind: "nativeTransfer", target: getAddress(to), recipient: getAddress(to), amount: value.toString(), warnings: [] };
  const selector = d.slice(0, 10);
  const target = getAddress(to);
  try {
    switch (selector) {
      case SEL.transfer: {
        const [recipient, amount] = args(["address", "uint256"], d);
        return { kind: "erc20Transfer", selector, target, recipient, amount: amount.toString(), warnings: [] };
      }
      case SEL.transferFrom: {
        const [from, recipient, amount] = args(["address", "address", "uint256"], d);
        return {
          kind: "erc20TransferFrom",
          selector,
          target,
          recipient,
          amount: amount.toString(),
          warnings: [`Moves tokens from ${from} using an existing approval.`],
        };
      }
      case SEL.approve: {
        const [spender, amount] = args(["address", "uint256"], d);
        const unlimited = amount >= UNLIMITED;
        return {
          kind: "approve",
          selector,
          target,
          spender,
          amount: amount.toString(),
          unlimited,
          warnings: unlimited
            ? ["This grants UNLIMITED access to this token. The spender can take your entire balance at any time."]
            : amount > 0n
              ? ["This lets the spender move this token on your behalf, up to the amount shown."]
              : [],
        };
      }
      case SEL.increaseAllowance: {
        const [spender, amount] = args(["address", "uint256"], d);
        const unlimited = amount >= UNLIMITED;
        return {
          kind: "increaseAllowance",
          selector,
          target,
          spender,
          amount: amount.toString(),
          unlimited,
          warnings: [unlimited ? "This grants UNLIMITED access to this token." : "This increases what the spender may move on your behalf."],
        };
      }
      case SEL.setApprovalForAll: {
        const [operator, approved] = args(["address", "bool"], d);
        return {
          kind: "setApprovalForAll",
          selector,
          target,
          spender: operator,
          approved,
          warnings: approved
            ? ["This gives the operator control of ALL your NFTs in this collection. Only approve marketplaces you trust."]
            : [],
        };
      }
      case SEL.permit2Approve: {
        const [token, spender, amount] = args(["address", "address", "uint160", "uint48"], d);
        const unlimited = amount >= UNLIMITED;
        return {
          kind: "permit2Approve",
          selector,
          target,
          token,
          spender,
          amount: amount.toString(),
          unlimited,
          warnings: [unlimited ? "Permit2: grants UNLIMITED access to this token." : "Permit2: lets the spender move this token on your behalf."],
        };
      }
    }
  } catch {
    /* malformed args — fall through to a generic call */
  }
  return { kind: "contractCall", selector, target, amount: value.toString(), warnings: [] };
}

/* ------------------------------ messages ------------------------------ */

/** personal_sign payloads arrive hex-encoded; show text when it is text. */
export function displayMessage(raw: string): { text: string; isHex: boolean } {
  if (isHexString(raw)) {
    try {
      const text = toUtf8String(raw);
      // eslint-disable-next-line no-control-regex
      if (!/[\u0000-\u0008\u000e-\u001f\u007f]/.test(text)) return { text, isHex: false };
    } catch {
      /* not utf-8 */
    }
    return { text: raw, isHex: true };
  }
  return { text: raw, isHex: false };
}

export interface SiweInfo {
  domain: string;
  address: string;
  chainId?: number;
  domainMismatch: boolean;
}

/** Detects a Sign-In With Ethereum (EIP-4361) message and checks its domain against the requesting origin. */
export function parseSiwe(text: string, origin: string): SiweInfo | undefined {
  const m = /^(?:[a-z][a-z0-9+.-]*:\/\/)?([^\s]+) wants you to sign in with your Ethereum account:\n(0x[a-fA-F0-9]{40})/.exec(text);
  if (!m) return undefined;
  const chain = /\nChain ID: (\d+)/.exec(text);
  let host = origin;
  try {
    host = new URL(origin).host;
  } catch {
    /* keep */
  }
  return { domain: m[1], address: m[2], chainId: chain ? Number(chain[1]) : undefined, domainMismatch: m[1] !== host };
}

/* ----------------------------- typed data ----------------------------- */

export interface TypedDataInfo {
  primaryType: string;
  domainName?: string;
  verifyingContract?: string;
  chainId?: number;
  kind?: "permit" | "permit2" | "order";
  spender?: string;
  amount?: string;
  unlimited?: boolean;
  deadline?: string;
  warnings: string[];
}

const PERMIT2 = "0x000000000022d473030f116ddee9f6b43ac78ba3";

export function inspectTypedData(td: any): TypedDataInfo {
  const primaryType = String(td?.primaryType ?? "");
  const domain = td?.domain ?? {};
  const msg = td?.message ?? {};
  const info: TypedDataInfo = {
    primaryType,
    domainName: domain.name,
    verifyingContract: domain.verifyingContract,
    chainId: domain.chainId !== undefined ? Number(domain.chainId) : undefined,
    warnings: [],
  };
  const isPermit2 = String(domain.verifyingContract ?? "").toLowerCase() === PERMIT2;
  const num = (v: unknown) => {
    try {
      return BigInt(v as any);
    } catch {
      return undefined;
    }
  };

  if (primaryType === "Permit" && msg.spender) {
    const amount = num(msg.value);
    info.kind = "permit";
    info.spender = msg.spender;
    info.amount = amount?.toString();
    info.unlimited = amount !== undefined && amount >= UNLIMITED;
    info.deadline = msg.deadline?.toString();
    info.warnings.push(
      info.unlimited
        ? "This signature grants UNLIMITED spending of your tokens — no transaction needed. Scammers use this to drain wallets."
        : "This signature lets the spender move your tokens without a further transaction.",
    );
  } else if (isPermit2 && /^Permit(Single|Batch|TransferFrom|BatchTransferFrom|WitnessTransferFrom)$/.test(primaryType)) {
    info.kind = "permit2";
    info.spender = msg.spender;
    const details = msg.details ?? msg.permitted;
    const amount = num(Array.isArray(details) ? details[0]?.amount : details?.amount);
    info.amount = amount?.toString();
    info.unlimited = amount !== undefined && amount >= UNLIMITED;
    info.warnings.push(
      info.unlimited
        ? "Permit2 signature granting UNLIMITED token access. Only sign this on a site you trust."
        : "Permit2 signature: lets the spender move your tokens without a further transaction.",
    );
  } else if (/order/i.test(primaryType)) {
    info.kind = "order";
    info.warnings.push("This signs a marketplace/exchange order. Check what you are selling and for how much.");
  }
  return info;
}

/** Keeps only types reachable from primaryType (ethers rejects unused/ambiguous root types). */
export function pruneTypes(types: Record<string, { name: string; type: string }[]>, primaryType: string) {
  const out: typeof types = {};
  const visit = (t: string) => {
    const base = t.replace(/\[\d*\]$/g, "").replace(/\[\d*\]/g, "");
    if (out[base] || !types[base]) return;
    out[base] = types[base];
    for (const f of types[base]) visit(f.type);
  };
  visit(primaryType);
  return out;
}
