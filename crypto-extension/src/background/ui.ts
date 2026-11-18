// Requests from the extension's own pages (popup, approval window, onboarding tab).

import { getAddress, isAddress } from "ethers";
import { getEvmChain } from "../shared/chains";
import { listActivity, recordActivity, refreshActivity } from "./activity";
import { hasApprovals, listApprovals, rejectApproval, resolveApproval } from "./approvals";
import { emit, notifyUi } from "./events";
import { executeEvmSwap, executeSolanaSwap, type EvmSwapRequest } from "./swap";
import { linkUsername } from "./identity";
import * as cloud from "./cloudBackup";

/** A phrase restored from Drive during onboarding waits here (memory only) until a password is chosen. */
let pendingRestore: string | null = null;
import { exposedAccounts } from "./evm";
import { prepareTx, sendPrepared, type PreparedTx } from "./evmTx";
import { isValidMnemonic, newMnemonic } from "./keyring";
import { listSites, removeSite } from "./sites";
import { previewSolanaSend, sendSolana, type SolanaSendInput } from "./solanaSend";
import { K, local } from "./storage";
import * as wallet from "./wallet";
import { detectEvmDerivation } from "./evmDerivation";
import type { EvmDerivation } from "./keyring";

async function selected() {
  const a = await wallet.getSelectedAccount();
  if (!a) throw new Error("No account");
  return a;
}

/** Re-announces accounts to every connected site (after lock/unlock/account switch). */
export async function broadcastAccounts() {
  for (const site of await listSites()) {
    if (site.evmAccounts.length) emit(site.origin, "evm", "accountsChanged", await exposedAccounts(site.origin));
  }
}

type Handler = (p: any) => Promise<unknown> | unknown;

const handlers: Record<string, Handler> = {
  ping: () => "pong",

  async getState() {
    const [status, accounts, selectedIndex, settings] = await Promise.all([
      wallet.getStatus(),
      wallet.getAccounts(),
      wallet.getSelectedIndex(),
      wallet.getSettings(),
    ]);
    return { status, accounts, selectedIndex, settings, pendingApprovals: hasApprovals() ? listApprovals().length : 0 };
  },

  async generateMnemonic() {
    if ((await wallet.getStatus()) !== "uninitialized") throw new Error("A wallet already exists");
    return newMnemonic(128);
  },
  validateMnemonic: (p) => isValidMnemonic(String(p?.phrase ?? "")),
  createWallet: (p) => wallet.createWallet(String(p.password), String(p.mnemonic)),
  /** Which EVM derivation an imported phrase uses (older Rizon mobile vs standard). Public addresses only. */
  async detectEvmDerivation(p) {
    if ((await wallet.getStatus()) !== "uninitialized") throw new Error("A wallet already exists");
    const phrase = String(p?.mnemonic ?? "");
    if (!isValidMnemonic(phrase)) throw new Error("That recovery phrase isn't valid. Check the words and their order.");
    return detectEvmDerivation(phrase);
  },
  importWallet: (p) => wallet.importWallet(String(p.password), String(p.mnemonic), p.evmDerivation as EvmDerivation),
  async unlock(p) {
    await wallet.unlock(String(p.password));
    await broadcastAccounts();
  },
  async lock() {
    await wallet.lock();
    await broadcastAccounts();
  },
  addAccount: (p) => wallet.addAccount(p?.name),
  renameAccount: (p) => wallet.renameAccount(Number(p.index), String(p.name)),
  async selectAccount(p) {
    await wallet.selectAccount(Number(p.index));
    await broadcastAccounts();
  },
  revealMnemonic: (p) => wallet.revealMnemonic(String(p.password)),
  changePassword: (p) => wallet.changePassword(String(p.oldPassword), String(p.newPassword)),
  async resetWallet(p) {
    if (p?.confirm !== "RESET") throw new Error("Type RESET to confirm");
    for (const a of listApprovals()) rejectApproval(a.id);
    await wallet.resetWallet();
  },
  updateSettings: (p) => wallet.updateSettings(p ?? {}),

  listSites: () => listSites(),
  async disconnectSite(p) {
    const origin = String(p.origin);
    await removeSite(origin);
    emit(origin, "evm", "accountsChanged", []);
    emit(origin, "solana", "accountChanged", null);
  },

  listApprovals: () => listApprovals(),
  resolveApproval: (p) => resolveApproval(String(p.id), p.result ?? {}),
  rejectApproval: (p) => rejectApproval(String(p.id)),

  getCustomTokens: () => local.get(K.customTokens, {}),

  /* ------------------------------ EVM send ------------------------------ */
  async prepareEvmTx(p) {
    const chainId = Number(p.chainId);
    if (!getEvmChain(chainId)) throw new Error("Unsupported network");
    const account = await selected();
    if (typeof p.to !== "string" || !isAddress(p.to)) throw new Error("Enter a valid recipient address");
    return prepareTx(chainId, { from: account.evm, to: getAddress(p.to), value: String(p.value ?? "0"), data: p.data ?? "0x" });
  },
  async sendEvmTx(p) {
    const tx = p.tx as PreparedTx;
    const account = await selected();
    if (getAddress(tx.from) !== getAddress(account.evm)) throw new Error("Transaction is not from the selected account");
    const hash = await sendPrepared(account.index, tx);
    await recordActivity({
      network: tx.chainId,
      hash,
      kind: "send",
      from: account.evm,
      to: p.recipient ?? tx.to ?? undefined,
      summary: String(p.summary ?? "Sent"),
    });
    return hash;
  },

  /* ----------------------------- Solana send ---------------------------- */
  async previewSolanaSend(p) {
    const account = await selected();
    return previewSolanaSend({ from: account.solana, to: p.to, amount: String(p.amount), mint: p.mint } as SolanaSendInput);
  },
  async sendSolana(p) {
    const account = await selected();
    const signature = await sendSolana(account.index, { from: account.solana, to: p.to, amount: String(p.amount), mint: p.mint });
    await recordActivity({ network: "SOLANA", hash: signature, kind: "send", from: account.solana, to: p.to, summary: String(p.summary ?? "Sent") });
    return signature;
  },

  /* ----------------------------- swap / bridge ----------------------------- */
  async swapEvm(p) {
    const account = await selected();
    const progress = (s: string) => notifyUi(`swap:${s}`);
    return executeEvmSwap(account, p as EvmSwapRequest, progress);
  },
  async swapSolana(p) {
    const account = await selected();
    return executeSolanaSwap(account, String(p.serialized), String(p.summary ?? "Swap"), p.crossChain ? "bridge" : "swap");
  },

  /* ------------------------------- identity ------------------------------- */
  async linkUsername(p) {
    return linkUsername(await selected(), String(p.username ?? ""));
  },

  /* ----------------------------- cloud backup ----------------------------- */
  cloudStatus: async () => ({ status: await cloud.backupStatus(), redirectUri: cloud.redirectUri() }),
  async cloudBackup() {
    const account = await selected();
    if (!(await wallet.isUnlocked())) throw new Error("Unlock Rizon first");
    const session = await cloud.signIn();
    return wallet.withMnemonic((m) => cloud.backup(session, m, account.evm));
  },
  async cloudDelete() {
    return cloud.deleteBackup(await cloud.signIn());
  },
  async cloudRestoreStart() {
    if ((await wallet.getStatus()) !== "uninitialized") throw new Error("A wallet already exists");
    const session = await cloud.signIn();
    const found = await cloud.restore(session);
    if (!found) return { found: false, email: session.email };
    pendingRestore = found.mnemonic;
    const derivation = await detectEvmDerivation(found.mnemonic, found.addressHint);
    return { found: true, email: session.email, addressHint: found.addressHint, createdAt: found.createdAt, derivation };
  },
  async cloudRestoreFinish(p) {
    if (!pendingRestore) throw new Error("The restored backup expired. Sign in with Google again.");
    const m = pendingRestore;
    pendingRestore = null;
    await wallet.importWallet(String(p.password), m, p.evmDerivation as EvmDerivation);
    await local.set(K.backupStatus, { addressHint: (await wallet.getAccounts())[0]?.evm, backedUpAt: new Date().toISOString() });
  },

  listActivity: () => listActivity(),
  refreshActivity: () => refreshActivity(),
};

/** Methods that don't count as user activity for auto-lock purposes. */
const PASSIVE = new Set(["ping", "getState", "listApprovals"]);

export async function handleUi(method: string, params: unknown) {
  const h = handlers[method];
  if (!h) throw new Error(`Unknown method ${method}`);
  if (!PASSIVE.has(method) && (await wallet.isUnlocked())) await wallet.touch();
  return h(params);
}
