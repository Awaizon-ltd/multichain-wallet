// Main-world provider injected into every page.
//   EVM:    EIP-1193 provider, discoverable via EIP-6963 (and window.ethereum
//           only if no other wallet has claimed it — Rizon never overwrites).
//   Solana: a Wallet Standard wallet (discovered by @solana/wallet-adapter,
//           Jupiter, Raydium, … without any site-side integration).
//
// Keep this file dependency-light: it runs on every page.

import { CONTENT_TARGET, INPAGE_TARGET, type Namespace, type PageEvent, type PageResponse } from "../shared/messages";
import { b58decode } from "../shared/base58";

declare const __RIZON_ICON__: string;
const ICON = __RIZON_ICON__ as `data:image/${string}`;
const NAME = "Rizon";
const RDNS = "com.awarizon.rizon";

/* ------------------------------ transport ------------------------------ */

class RpcError extends Error {
  code: number;
  data?: unknown;
  constructor(code: number, message: string, data?: unknown) {
    super(message);
    this.code = code;
    this.data = data;
  }
}

let nextId = 1;
const waiting = new Map<number, { resolve: (v: any) => void; reject: (e: any) => void }>();
const eventHandlers: Record<Namespace, (event: string, data: unknown) => void> = { evm: () => {}, solana: () => {} };

function call(ns: Namespace, method: string, params?: unknown): Promise<any> {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    waiting.set(id, { resolve, reject });
    window.postMessage({ target: CONTENT_TARGET, kind: "request", id, ns, method, params }, location.origin === "null" ? "*" : location.origin);
  });
}

window.addEventListener("message", (ev: MessageEvent) => {
  if (ev.source !== window) return;
  const d = ev.data as PageResponse | PageEvent;
  if (!d || d.target !== INPAGE_TARGET) return;
  if (d.kind === "response") {
    const w = waiting.get(d.id);
    if (!w) return;
    waiting.delete(d.id);
    if (d.error) w.reject(new RpcError(d.error.code, d.error.message, d.error.data));
    else w.resolve(d.result);
  } else if (d.kind === "event") {
    eventHandlers[d.ns]?.(d.event, d.data);
  }
});

/* --------------------------------- EVM --------------------------------- */

type Listener = (...args: any[]) => void;

class RizonEthereumProvider {
  readonly isRizon = true;
  readonly isMetaMask = false;
  chainId: string | null = null;
  selectedAddress: string | null = null;
  #listeners = new Map<string, Set<Listener>>();
  #connected = false;

  constructor() {
    eventHandlers.evm = (event, data) => this.#onEvent(event, data);
    // Initial state — never prompts.
    call("evm", "eth_chainId").then((c) => {
      this.chainId = c;
      if (!this.#connected) {
        this.#connected = true;
        this.#emit("connect", { chainId: c });
      }
    }, () => {});
    call("evm", "eth_accounts").then((a: string[]) => (this.selectedAddress = a[0] ?? null), () => {});
  }

  get networkVersion() {
    return this.chainId ? String(parseInt(this.chainId, 16)) : null;
  }

  isConnected() {
    return this.#connected;
  }

  async request(args: { method: string; params?: unknown }): Promise<unknown> {
    if (!args || typeof args !== "object" || typeof args.method !== "string" || !args.method) {
      throw new RpcError(-32600, "Expected a request object with a `method` string.");
    }
    const result = await call("evm", args.method, args.params);
    if (args.method === "eth_requestAccounts" || args.method === "eth_accounts") {
      this.selectedAddress = (result as string[])[0] ?? null;
    } else if (args.method === "eth_chainId") {
      this.chainId = result as string;
    }
    return result;
  }

  on(event: string, l: Listener) {
    if (!this.#listeners.has(event)) this.#listeners.set(event, new Set());
    this.#listeners.get(event)!.add(l);
    return this;
  }
  once(event: string, l: Listener) {
    const w = (...a: any[]) => {
      this.removeListener(event, w);
      l(...a);
    };
    return this.on(event, w);
  }
  removeListener(event: string, l: Listener) {
    this.#listeners.get(event)?.delete(l);
    return this;
  }
  off(event: string, l: Listener) {
    return this.removeListener(event, l);
  }
  removeAllListeners(event?: string) {
    if (event) this.#listeners.delete(event);
    else this.#listeners.clear();
    return this;
  }
  listenerCount(event: string) {
    return this.#listeners.get(event)?.size ?? 0;
  }

  /* legacy APIs still used by older dApps */
  enable() {
    return this.request({ method: "eth_requestAccounts" });
  }
  send(methodOrPayload: any, paramsOrCallback?: any): any {
    if (typeof methodOrPayload === "string") return this.request({ method: methodOrPayload, params: paramsOrCallback });
    if (typeof paramsOrCallback === "function") return this.sendAsync(methodOrPayload, paramsOrCallback);
    throw new RpcError(4200, "Synchronous send() is not supported. Use request().");
  }
  sendAsync(payload: any, cb: (err: any, res?: any) => void) {
    this.request({ method: payload.method, params: payload.params }).then(
      (result) => cb(null, { id: payload.id, jsonrpc: "2.0", result }),
      (error) => cb(error, { id: payload.id, jsonrpc: "2.0", error: { code: error.code, message: error.message } }),
    );
  }

  #emit(event: string, ...args: unknown[]) {
    for (const l of [...(this.#listeners.get(event) ?? [])]) {
      try {
        l(...args);
      } catch (e) {
        console.error(e);
      }
    }
  }

  #onEvent(event: string, data: unknown) {
    if (event === "accountsChanged") {
      const accounts = (data as string[]) ?? [];
      if ((accounts[0] ?? null) === this.selectedAddress && accounts.length > 0) return;
      this.selectedAddress = accounts[0] ?? null;
      this.#emit("accountsChanged", accounts);
    } else if (event === "chainChanged") {
      if (data === this.chainId) return;
      this.chainId = data as string;
      this.#emit("chainChanged", data);
      this.#emit("networkChanged", this.networkVersion);
    } else if (event === "connect") {
      this.#connected = true;
      this.#emit("connect", data);
    } else if (event === "disconnect") {
      this.#emit("disconnect", data);
    }
  }
}

const ethereum = new RizonEthereumProvider();

const info = Object.freeze({ uuid: crypto.randomUUID(), name: NAME, icon: ICON, rdns: RDNS });
const announce = () =>
  window.dispatchEvent(new CustomEvent("eip6963:announceProvider", { detail: Object.freeze({ info, provider: ethereum }) }));
window.addEventListener("eip6963:requestProvider", announce);
announce();

if (!(window as any).ethereum) {
  try {
    Object.defineProperty(window, "ethereum", { value: ethereum, configurable: true, writable: true });
    window.dispatchEvent(new Event("ethereum#initialized"));
  } catch {
    /* another wallet locked the property */
  }
}

/* ------------------------------- Solana -------------------------------- */

const toB64 = (b: Uint8Array) => {
  let s = "";
  for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
  return btoa(s);
};
const fromB64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

const SOLANA_CHAINS = ["solana:mainnet"] as const;
const SOLANA_FEATURES = ["solana:signAndSendTransaction", "solana:signTransaction", "solana:signMessage"] as const;

class RizonSolanaAccount {
  readonly address: string;
  readonly publicKey: Uint8Array;
  readonly chains = SOLANA_CHAINS;
  readonly features = SOLANA_FEATURES;
  readonly label = NAME;
  readonly icon = ICON;
  constructor(address: string) {
    this.address = address;
    this.publicKey = b58decode(address);
    Object.freeze(this);
  }
}

class RizonSolanaWallet {
  readonly version = "1.0.0" as const;
  readonly name = NAME;
  readonly icon = ICON;
  readonly chains = SOLANA_CHAINS;
  #accounts: RizonSolanaAccount[] = [];
  #listeners = new Set<(p: { accounts: readonly RizonSolanaAccount[] }) => void>();

  constructor() {
    eventHandlers.solana = (event, data) => {
      if (event !== "accountChanged") return;
      const next = typeof data === "string" ? [new RizonSolanaAccount(data)] : [];
      if (next[0]?.address === this.#accounts[0]?.address && next.length === this.#accounts.length) return;
      this.#accounts = next;
      this.#listeners.forEach((l) => l({ accounts: this.accounts }));
    };
  }

  get accounts() {
    return this.#accounts.slice();
  }

  get features() {
    return {
      "standard:connect": { version: "1.0.0", connect: this.#connect },
      "standard:disconnect": { version: "1.0.0", disconnect: this.#disconnect },
      "standard:events": { version: "1.0.0", on: this.#on },
      "solana:signAndSendTransaction": {
        version: "1.0.0",
        supportedTransactionVersions: ["legacy", 0],
        signAndSendTransaction: this.#signAndSend,
      },
      "solana:signTransaction": {
        version: "1.0.0",
        supportedTransactionVersions: ["legacy", 0],
        signTransaction: this.#signTransaction,
      },
      "solana:signMessage": { version: "1.0.0", signMessage: this.#signMessage },
    };
  }

  #setAccount(address: string | null) {
    const changed = (this.#accounts[0]?.address ?? null) !== address;
    this.#accounts = address ? [new RizonSolanaAccount(address)] : [];
    if (changed) this.#listeners.forEach((l) => l({ accounts: this.accounts }));
  }

  #connect = async (input?: { silent?: boolean }) => {
    const { publicKey } = await call("solana", "connect", { onlyIfTrusted: !!input?.silent });
    this.#setAccount(publicKey);
    return { accounts: this.accounts };
  };

  #disconnect = async () => {
    await call("solana", "disconnect");
    this.#setAccount(null);
  };

  #on = (event: string, listener: (p: any) => void) => {
    if (event !== "change") return () => {};
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  };

  #signTransaction = async (...inputs: { account: RizonSolanaAccount; transaction: Uint8Array }[]) => {
    if (!inputs.length) return [];
    const account = inputs[0].account.address;
    if (inputs.some((i) => i.account.address !== account)) throw new RpcError(-32602, "All transactions must use one account");
    const { signedTransactions } = await call("solana", "signTransaction", {
      account,
      transactions: inputs.map((i) => toB64(i.transaction)),
    });
    return (signedTransactions as string[]).map((t) => ({ signedTransaction: fromB64(t) }));
  };

  #signAndSend = async (...inputs: { account: RizonSolanaAccount; transaction: Uint8Array; options?: any }[]) => {
    const out: { signature: Uint8Array }[] = [];
    for (const i of inputs) {
      const { signature } = await call("solana", "signAndSendTransaction", {
        account: i.account.address,
        transaction: toB64(i.transaction),
        options: i.options,
      });
      out.push({ signature: b58decode(signature) });
    }
    return out;
  };

  #signMessage = async (...inputs: { account: RizonSolanaAccount; message: Uint8Array }[]) => {
    const out: { signedMessage: Uint8Array; signature: Uint8Array }[] = [];
    for (const i of inputs) {
      const { signature } = await call("solana", "signMessage", { account: i.account.address, message: toB64(i.message) });
      out.push({ signedMessage: i.message, signature: fromB64(signature) });
    }
    return out;
  };
}

const solanaWallet = new RizonSolanaWallet();

// Wallet Standard registration (same protocol as @wallet-standard/wallet's registerWallet).
class RegisterWalletEvent extends Event {
  readonly detail: (api: { register(w: unknown): unknown }) => void;
  constructor(cb: (api: { register(w: unknown): unknown }) => void) {
    super("wallet-standard:register-wallet", { bubbles: false, cancelable: false, composed: false });
    this.detail = cb;
  }
}
const register = (api: { register(w: unknown): unknown }) => api.register(solanaWallet);
try {
  window.dispatchEvent(new RegisterWalletEvent(register));
} catch (e) {
  console.error("Rizon: wallet-standard register failed", e);
}
window.addEventListener("wallet-standard:app-ready", (e: any) => register(e.detail));

Object.defineProperty(window, "rizon", { value: Object.freeze({ ethereum, solana: solanaWallet }), configurable: false });
