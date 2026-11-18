// EIP-1193 request handling for one origin. Every method either:
//   - answers from local state (chain id, connected accounts),
//   - asks the user through the approval window (connect, sign, send, watch), or
//   - is forwarded read-only to the origin's current chain RPC (allow-listed).
// Anything else is refused with 4200.

import { getAddress, getBytes, isAddress, isHexString } from "ethers";
import { DEFAULT_EVM_CHAIN_ID, getEvmChain, toHexChainId } from "../shared/chains";
import { displayMessage, inspectTypedData, parseSiwe, pruneTypes } from "../shared/decode";
import { checkOrigin } from "../shared/domainSecurity";
import { invalidParams, ProviderError, unauthorized, unrecognizedChain, unsupported } from "../shared/errors";
import { requestApproval } from "./approvals";
import { emit } from "./events";
import { normaliseTxInput, prepareTx, sendPrepared } from "./evmTx";
import { evmProvider, tokenMeta } from "./rpc";
import { getSite, isEvmPermitted, upsertSite, removeSite } from "./sites";
import { recordActivity } from "./activity";
import { K, local } from "./storage";
import {
  accountByEvmAddress,
  getAccounts,
  getSelectedAccount,
  isUnlocked,
  withEvmSigner,
} from "./wallet";

/** Read-only JSON-RPC methods forwarded to the chain as-is. */
const PASSTHROUGH = new Set([
  "eth_blockNumber",
  "eth_call",
  "eth_estimateGas",
  "eth_feeHistory",
  "eth_gasPrice",
  "eth_maxPriorityFeePerGas",
  "eth_getBalance",
  "eth_getBlockByHash",
  "eth_getBlockByNumber",
  "eth_getBlockTransactionCountByHash",
  "eth_getBlockTransactionCountByNumber",
  "eth_getCode",
  "eth_getLogs",
  "eth_getProof",
  "eth_getStorageAt",
  "eth_getTransactionByHash",
  "eth_getTransactionByBlockHashAndIndex",
  "eth_getTransactionByBlockNumberAndIndex",
  "eth_getTransactionCount",
  "eth_getTransactionReceipt",
  "eth_getUncleCountByBlockHash",
  "eth_getUncleCountByBlockNumber",
  "eth_syncing",
  "eth_createAccessList",
  "net_listening",
]);

const asArray = (p: unknown): any[] => (Array.isArray(p) ? p : p === undefined ? [] : [p]);

async function siteChainId(origin: string) {
  return (await getSite(origin))?.chainId ?? DEFAULT_EVM_CHAIN_ID;
}

/** Accounts visible to `origin`: none while locked or not connected. Selected account first if permitted. */
export async function exposedAccounts(origin: string): Promise<string[]> {
  const site = await getSite(origin);
  if (!site || site.evmAccounts.length === 0 || !(await isUnlocked())) return [];
  const selected = await getSelectedAccount();
  const list = [...site.evmAccounts];
  if (selected) {
    const i = list.findIndex((a) => a.toLowerCase() === selected.evm.toLowerCase());
    if (i > 0) list.unshift(...list.splice(i, 1));
  }
  return list;
}

function parseChainId(v: unknown): number {
  if (typeof v !== "string" || !/^0x[0-9a-fA-F]+$/.test(v)) throw invalidParams("chainId must be a 0x-prefixed hex string");
  const n = Number.parseInt(v, 16);
  if (!Number.isSafeInteger(n) || n <= 0) throw invalidParams("Invalid chainId");
  return n;
}

async function requireSigner(origin: string, address: unknown) {
  if (typeof address !== "string" || !isAddress(address)) throw invalidParams("Invalid account address");
  const site = await getSite(origin);
  if (!isEvmPermitted(site, address)) throw unauthorized();
  const account = await accountByEvmAddress(address);
  if (!account) throw unauthorized();
  return { site: site!, account };
}

async function connect(origin: string): Promise<string[]> {
  const site = await getSite(origin);
  if (site && site.evmAccounts.length > 0) {
    if (!(await isUnlocked())) await requestApproval("unlock", origin, {});
    return exposedAccounts(origin);
  }
  const { accounts } = await requestApproval<{ accounts: string[] }>("connect", origin, {
    namespace: "evm",
    security: checkOrigin(origin),
  });
  // Only accept accounts that really belong to this wallet.
  const owned = await getAccounts();
  const chosen = accounts
    .filter((a) => owned.some((o) => o.evm.toLowerCase() === String(a).toLowerCase()))
    .map((a) => getAddress(a));
  if (chosen.length === 0) throw unauthorized("No account selected.");
  const next = await upsertSite(origin, { evmAccounts: chosen, connectedAt: Date.now() });
  emit(origin, "evm", "connect", { chainId: toHexChainId(next.chainId) });
  emit(origin, "evm", "accountsChanged", await exposedAccounts(origin));
  return exposedAccounts(origin);
}

function permissionsFor(origin: string, accounts: string[]) {
  if (accounts.length === 0) return [];
  return [
    {
      invoker: origin,
      parentCapability: "eth_accounts",
      caveats: [{ type: "restrictReturnedAccounts", value: accounts }],
      date: Date.now(),
    },
  ];
}

async function switchChain(origin: string, chainId: number) {
  if (!getEvmChain(chainId)) throw unrecognizedChain(toHexChainId(chainId));
  const current = await siteChainId(origin);
  if (current === chainId) return null;
  // Switching between networks Rizon already knows is low-risk (every signature
  // and transaction prompt shows the network), so it happens without a prompt.
  await upsertSite(origin, { chainId });
  emit(origin, "evm", "chainChanged", toHexChainId(chainId));
  return null;
}

export async function handleEvm(origin: string, method: string, rawParams: unknown): Promise<unknown> {
  const params = asArray(rawParams);

  switch (method) {
    case "eth_chainId":
      return toHexChainId(await siteChainId(origin));
    case "net_version":
      return String(await siteChainId(origin));
    case "web3_clientVersion":
      return "Rizon/0.1.0";
    case "eth_accounts":
      return exposedAccounts(origin);
    case "eth_coinbase":
      return (await exposedAccounts(origin))[0] ?? null;
    case "eth_requestAccounts":
      return connect(origin);

    case "wallet_requestPermissions": {
      const req = params[0];
      if (!req || typeof req !== "object" || !("eth_accounts" in req)) {
        throw invalidParams("Only the eth_accounts permission is supported");
      }
      return permissionsFor(origin, await connect(origin));
    }
    case "wallet_getPermissions":
      return permissionsFor(origin, await exposedAccounts(origin));
    case "wallet_revokePermissions": {
      const site = await getSite(origin);
      if (site) {
        if (site.solanaAccount) await upsertSite(origin, { evmAccounts: [] });
        else await removeSite(origin);
      }
      emit(origin, "evm", "accountsChanged", []);
      return null;
    }

    case "wallet_switchEthereumChain":
      return switchChain(origin, parseChainId(params[0]?.chainId));
    case "wallet_addEthereumChain": {
      const id = parseChainId(params[0]?.chainId);
      if (!getEvmChain(id)) {
        throw new ProviderError(4200, "Rizon doesn't support adding custom networks yet.");
      }
      return switchChain(origin, id);
    }

    case "personal_sign": {
      // Spec order is [message, address]; some dApps send [address, message].
      let [message, address] = params;
      if (isAddress(message) && !isAddress(address)) [message, address] = [address, message];
      if (typeof message !== "string") throw invalidParams("Message must be a string");
      const { account } = await requireSigner(origin, address);
      const shown = displayMessage(message);
      const siwe = shown.isHex ? undefined : parseSiwe(shown.text, origin);
      const warnings: string[] = [];
      if (siwe?.domainMismatch) {
        warnings.push(`This sign-in request claims to be for "${siwe.domain}" but comes from a different site. It may be a phishing attempt.`);
      }
      if (siwe && siwe.address.toLowerCase() !== account.evm.toLowerCase()) {
        warnings.push("The sign-in message names a different account.");
      }
      await requestApproval("personalSign", origin, {
        address: account.evm,
        accountName: account.name,
        message: shown.text,
        isHex: shown.isHex,
        siwe,
        warnings,
        security: checkOrigin(origin),
      });
      return withEvmSigner(account, (s) => s.signMessage(isHexString(message) ? getBytes(message) : message));
    }

    case "eth_signTypedData_v4":
    case "eth_signTypedData_v3": {
      const [address, raw] = params;
      const { site, account } = await requireSigner(origin, address);
      let td: any;
      try {
        td = typeof raw === "string" ? JSON.parse(raw) : raw;
      } catch {
        throw invalidParams("Typed data must be valid JSON");
      }
      if (!td?.types || !td?.primaryType || !td?.domain || !td?.message) throw invalidParams("Malformed typed data");
      const info = inspectTypedData(td);
      if (info.chainId !== undefined && info.chainId !== site.chainId) {
        throw invalidParams(
          `Typed data chainId (${info.chainId}) doesn't match the active network (${site.chainId}).`,
        );
      }
      const { EIP712Domain: _omit, ...types } = td.types;
      const pruned = pruneTypes(types, td.primaryType);
      if (!pruned[td.primaryType]) throw invalidParams(`Unknown primaryType "${td.primaryType}"`);
      await requestApproval("signTypedData", origin, {
        address: account.evm,
        accountName: account.name,
        chainId: site.chainId,
        typedData: td,
        info,
        security: checkOrigin(origin),
      });
      return withEvmSigner(account, (s) => s.signTypedData(td.domain, pruned, td.message));
    }

    case "eth_sendTransaction": {
      const input = normaliseTxInput(params[0]);
      const { site, account } = await requireSigner(origin, input.from);
      if (params[0]?.chainId !== undefined && parseChainId(params[0].chainId) !== site.chainId) {
        throw invalidParams("Transaction chainId doesn't match the active network.");
      }
      const preview = await prepareTx(site.chainId, input);
      await requestApproval("sendTransaction", origin, {
        accountName: account.name,
        chainId: site.chainId,
        preview,
        security: checkOrigin(origin),
      });
      const hash = await sendPrepared(account.index, preview.tx);
      await recordActivity({
        network: site.chainId,
        hash,
        kind: "dapp",
        from: account.evm,
        to: preview.tx.to ?? undefined,
        summary: preview.decoded.kind === "contractCall" ? `Contract interaction` : preview.decoded.kind,
        origin,
      });
      return hash;
    }

    case "wallet_watchAsset": {
      const p = Array.isArray(rawParams) ? rawParams[0] : rawParams;
      if (p?.type !== "ERC20") throw invalidParams("Only ERC20 assets are supported");
      const address = p?.options?.address;
      if (typeof address !== "string" || !isAddress(address)) throw invalidParams("Invalid token address");
      const chainId = await siteChainId(origin);
      const meta = await tokenMeta(chainId, address);
      if (!meta) throw invalidParams("That address is not an ERC-20 token on this network");
      const token = {
        address: getAddress(address),
        symbol: meta.symbol, // on-chain values win over what the site claims
        decimals: meta.decimals,
        logoURI: typeof p.options.image === "string" ? p.options.image : undefined,
      };
      await requestApproval("watchAsset", origin, {
        chainId,
        token,
        claimedSymbol: p.options.symbol,
        security: checkOrigin(origin),
      });
      const custom = await local.get<Record<string, any[]>>(K.customTokens, {});
      const list = custom[chainId] ?? [];
      if (!list.some((t) => t.address.toLowerCase() === token.address.toLowerCase())) list.push(token);
      custom[chainId] = list;
      await local.set(K.customTokens, custom);
      return true;
    }

    case "eth_sign":
      throw new ProviderError(4200, "eth_sign is disabled in Rizon because it can be used to steal funds.");
    case "eth_signTypedData":
      throw unsupported(method);
  }

  if (PASSTHROUGH.has(method)) {
    return evmProvider(await siteChainId(origin)).send(method, params);
  }
  throw unsupported(method);
}
