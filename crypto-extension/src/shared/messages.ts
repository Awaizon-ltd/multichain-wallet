import type { SerializedError } from "./errors";
import type { NetworkId } from "./chains";

/* ------------------------------------------------------------------ */
/* Page <-> content script (window.postMessage)                        */
/* ------------------------------------------------------------------ */

export const INPAGE_TARGET = "rizon:inpage";
export const CONTENT_TARGET = "rizon:content";
export const PROVIDER_PORT = "rizon:provider";

export type Namespace = "evm" | "solana";

export interface PageRequest {
  target: typeof CONTENT_TARGET;
  kind: "request";
  id: number;
  ns: Namespace;
  method: string;
  params?: unknown;
}

export interface PageResponse {
  target: typeof INPAGE_TARGET;
  kind: "response";
  id: number;
  result?: unknown;
  error?: SerializedError;
}

export interface PageEvent {
  target: typeof INPAGE_TARGET;
  kind: "event";
  ns: Namespace;
  event: string;
  data: unknown;
}

/* ------------------------------------------------------------------ */
/* Popup / approval window <-> background (chrome.runtime.sendMessage) */
/* ------------------------------------------------------------------ */

export interface UiRequest {
  channel: "rizon:ui";
  method: string;
  params?: unknown;
}

export type UiResponse = { ok: true; result: unknown } | { ok: false; error: SerializedError };

/* ------------------------------------------------------------------ */
/* Shared state shapes                                                 */
/* ------------------------------------------------------------------ */

export interface Account {
  index: number;
  name: string;
  evm: string;
  solana: string;
}

export type WalletStatus = "uninitialized" | "locked" | "unlocked";

export interface Settings {
  autoLockMinutes: number;
  enabledNetworks: NetworkId[];
  showTestnets: boolean;
  hideSmallBalances: boolean;
  theme: "system" | "light" | "dark";
}

export interface SitePermission {
  origin: string;
  evmAccounts: string[];
  solanaAccount?: string;
  chainId: number;
  connectedAt: number;
}

export interface ActivityItem {
  id: string;
  network: NetworkId;
  hash: string;
  kind: "send" | "dapp" | "swap" | "bridge";
  from: string;
  to?: string;
  summary: string;
  origin?: string;
  status: "pending" | "confirmed" | "failed";
  timestamp: number;
}

export type ApprovalKind =
  | "unlock"
  | "connect"
  | "switchChain"
  | "personalSign"
  | "signTypedData"
  | "sendTransaction"
  | "watchAsset"
  | "solanaConnect"
  | "solanaSignMessage"
  | "solanaSignTransaction";

export interface Approval {
  id: string;
  kind: ApprovalKind;
  origin: string;
  createdAt: number;
  /** Kind-specific, display-ready details computed by the background. */
  details: Record<string, any>;
}
