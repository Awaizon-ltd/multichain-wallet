// End-to-end tests of the background request handlers with a real wallet,
// real signing and a scripted "user" answering the approval window.

import { verifyMessage, verifyTypedData, Wallet, getAddress } from "ethers";
import { ed25519 } from "@noble/curves/ed25519.js";
import { Keypair, PublicKey, SystemProgram, TransactionMessage } from "@solana/web3.js";
import { resetChrome } from "./setup";
import { listApprovals, rejectApproval, resolveApproval, setApprovalOpener } from "../src/background/approvals";
import { setEventSink, type ProviderEvent } from "../src/background/events";
import { handleEvm } from "../src/background/evm";
import { handleSolana, looksLikeTransactionMessage } from "../src/background/solana";
import { handleUi } from "../src/background/ui";
import * as wallet from "../src/background/wallet";
import { toB64, fromB64 } from "../src/background/vault";

const HARDHAT = "test test test test test test test test test test test junk";
const PASSWORD = "correct horse battery";
const DAPP = "https://app.uniswap.org";
const OTHER = "https://other.example";

type Responder = (a: ReturnType<typeof listApprovals>[number]) => unknown | "reject";
let responder: Responder = () => "reject";
const events: ProviderEvent[] = [];

beforeEach(async () => {
  await resetChrome();
  events.length = 0;
  setEventSink((e) => events.push(e));
  setApprovalOpener(async () => {
    // The "user" answers on the next tick, like a real window would.
    setTimeout(() => {
      for (const a of listApprovals()) {
        const r = responder(a);
        if (r === "reject") rejectApproval(a.id);
        else resolveApproval(a.id, r);
      }
    }, 0);
  });
  await wallet.importWallet(PASSWORD, HARDHAT, "bip44");
});

const approveConnect: Responder = (a) => {
  if (a.kind === "connect") return { accounts: ["0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"] };
  if (a.kind === "solanaConnect") return { account: null }; // overridden per test
  return {};
};

async function connect(origin = DAPP) {
  responder = approveConnect;
  return (await handleEvm(origin, "eth_requestAccounts", [])) as string[];
}

describe("EVM provider", () => {
  it("exposes nothing until the user connects, then only the chosen account", async () => {
    expect(await handleEvm(DAPP, "eth_accounts", [])).toEqual([]);
    expect(await handleEvm(DAPP, "eth_chainId", [])).toBe("0x2105"); // Base by default
    expect(await connect()).toEqual(["0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"]);
    expect(await handleEvm(DAPP, "eth_accounts", [])).toEqual(["0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"]);
    expect(await handleEvm(OTHER, "eth_accounts", [])).toEqual([]);
    expect(events.some((e) => e.origin === DAPP && e.event === "accountsChanged")).toBe(true);
  });

  it("rejects with 4001 when the user declines, and ignores accounts the wallet doesn't own", async () => {
    responder = () => "reject";
    await expect(handleEvm(DAPP, "eth_requestAccounts", [])).rejects.toMatchObject({ code: 4001 });
    responder = (a) => (a.kind === "connect" ? { accounts: [Wallet.createRandom().address] } : {});
    await expect(handleEvm(DAPP, "eth_requestAccounts", [])).rejects.toMatchObject({ code: 4100 });
  });

  it("personal_sign: refuses unconnected sites, signs for connected ones", async () => {
    const addr = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";
    await expect(handleEvm(OTHER, "personal_sign", ["0x68656c6c6f", addr])).rejects.toMatchObject({ code: 4100 });
    await connect();
    responder = () => ({});
    const sig = (await handleEvm(DAPP, "personal_sign", ["0x68656c6c6f", addr])) as string;
    expect(verifyMessage("hello", sig)).toBe(addr);
    // Reversed parameter order (seen in the wild) still works.
    const sig2 = (await handleEvm(DAPP, "personal_sign", [addr, "0x68656c6c6f"])) as string;
    expect(verifyMessage("hello", sig2)).toBe(addr);
  });

  it("signTypedData_v4: signs valid data, refuses a chainId mismatch", async () => {
    const addr = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";
    await connect();
    responder = () => ({});
    const td = {
      types: {
        EIP712Domain: [{ name: "name", type: "string" }, { name: "chainId", type: "uint256" }],
        Mail: [{ name: "contents", type: "string" }],
      },
      primaryType: "Mail",
      domain: { name: "Test", chainId: 8453 },
      message: { contents: "hi" },
    };
    const sig = (await handleEvm(DAPP, "eth_signTypedData_v4", [addr, JSON.stringify(td)])) as string;
    expect(verifyTypedData(td.domain, { Mail: td.types.Mail }, td.message, sig)).toBe(addr);
    const wrongChain = { ...td, domain: { name: "Test", chainId: 1 } };
    await expect(handleEvm(DAPP, "eth_signTypedData_v4", [addr, JSON.stringify(wrongChain)])).rejects.toMatchObject({ code: -32602 });
  });

  it("switches between supported chains, refuses unknown ones", async () => {
    await connect();
    await handleEvm(DAPP, "wallet_switchEthereumChain", [{ chainId: "0x1" }]);
    expect(await handleEvm(DAPP, "eth_chainId", [])).toBe("0x1");
    expect(events.some((e) => e.event === "chainChanged" && e.data === "0x1")).toBe(true);
    await expect(handleEvm(DAPP, "wallet_switchEthereumChain", [{ chainId: "0x539" }])).rejects.toMatchObject({ code: 4902 });
    await expect(handleEvm(DAPP, "wallet_switchEthereumChain", [{ chainId: 1 }])).rejects.toMatchObject({ code: -32602 });
  });

  it("refuses eth_sign and unknown methods", async () => {
    await connect();
    await expect(handleEvm(DAPP, "eth_sign", [])).rejects.toMatchObject({ code: 4200 });
    await expect(handleEvm(DAPP, "debug_traceTransaction", [])).rejects.toMatchObject({ code: 4200 });
    await expect(handleEvm(DAPP, "eth_sendRawTransaction", ["0x00"])).rejects.toMatchObject({ code: 4200 });
  });

  it("validates eth_sendTransaction input before touching the network", async () => {
    await connect();
    await expect(handleEvm(DAPP, "eth_sendTransaction", [{ from: "0x123" }])).rejects.toMatchObject({ code: -32602 });
    const stranger = Wallet.createRandom().address;
    await expect(handleEvm(DAPP, "eth_sendTransaction", [{ from: stranger, to: stranger }])).rejects.toMatchObject({ code: 4100 });
    await expect(
      handleEvm(DAPP, "eth_sendTransaction", [{ from: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266", to: stranger, chainId: "0x1" }]),
    ).rejects.toMatchObject({ code: -32602 }); // site is on Base
  });

  it("hides accounts while locked and re-exposes them after unlock", async () => {
    await connect();
    await handleUi("lock", {});
    expect(await handleEvm(DAPP, "eth_accounts", [])).toEqual([]);
    expect(events.at(-1)).toMatchObject({ origin: DAPP, event: "accountsChanged", data: [] });
    await handleUi("unlock", { password: PASSWORD });
    expect(await handleEvm(DAPP, "eth_accounts", [])).toHaveLength(1);
  });

  it("limits how many requests one site can queue", async () => {
    await connect();
    responder = () => ({});
    setApprovalOpener(async () => {}); // nobody answers
    const addr = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";
    const pending = [1, 2, 3].map(() => handleEvm(DAPP, "personal_sign", ["0x01", addr]).catch((e) => e));
    await expect(handleEvm(DAPP, "personal_sign", ["0x01", addr])).rejects.toMatchObject({ code: -32002 });
    listApprovals().forEach((a) => rejectApproval(a.id));
    for (const p of await Promise.all(pending)) expect(p).toMatchObject({ code: 4001 });
  });

  it("disconnecting a site from the UI revokes access", async () => {
    await connect();
    await handleUi("disconnectSite", { origin: DAPP });
    expect(await handleEvm(DAPP, "eth_accounts", [])).toEqual([]);
  });
});

describe("Solana provider", () => {
  async function solConnect(origin = DAPP) {
    const [{ solana }] = await wallet.getAccounts();
    responder = (a) => (a.kind === "solanaConnect" ? { account: solana } : {});
    return (await handleSolana(origin, "connect", {})) as { publicKey: string };
  }

  it("connects, refuses silent connect for untrusted sites, signs messages", async () => {
    await expect(handleSolana(OTHER, "connect", { onlyIfTrusted: true })).rejects.toMatchObject({ code: 4001 });
    const { publicKey } = await solConnect();
    expect((await handleSolana(DAPP, "connect", { onlyIfTrusted: true }) as any).publicKey).toBe(publicKey);

    const msg = new TextEncoder().encode("Sign in to Example");
    const { signature } = (await handleSolana(DAPP, "signMessage", { account: publicKey, message: toB64(msg) })) as any;
    expect(ed25519.verify(fromB64(signature), msg, new PublicKey(publicKey).toBytes())).toBe(true);
  });

  it("refuses to sign a transaction disguised as a message, and other accounts", async () => {
    const { publicKey } = await solConnect();
    const payer = new PublicKey(publicKey);
    const msg = new TransactionMessage({
      payerKey: payer,
      recentBlockhash: "11111111111111111111111111111111",
      instructions: [SystemProgram.transfer({ fromPubkey: payer, toPubkey: Keypair.generate().publicKey, lamports: 1 })],
    }).compileToV0Message();
    const bytes = msg.serialize();
    expect(looksLikeTransactionMessage(bytes)).toBe(true);
    expect(looksLikeTransactionMessage(new TextEncoder().encode("Sign in to Example — nonce 1234"))).toBe(false);
    await expect(handleSolana(DAPP, "signMessage", { account: publicKey, message: toB64(bytes) })).rejects.toMatchObject({ code: -32602 });
    await expect(
      handleSolana(DAPP, "signMessage", { account: Keypair.generate().publicKey.toBase58(), message: toB64(new Uint8Array([1])) }),
    ).rejects.toMatchObject({ code: 4100 });
  });
});

describe("wallet lifecycle", () => {
  it("auto-locks after the configured idle time", async () => {
    expect(await wallet.checkAutoLock(Date.now() + 14 * 60_000)).toBe(false);
    expect(await wallet.checkAutoLock(Date.now() + 16 * 60_000)).toBe(true);
    expect(await wallet.getStatus()).toBe("locked");
  });

  it("adds accounts on the next index with matching addresses", async () => {
    const a = await wallet.addAccount();
    expect(a).toMatchObject({ index: 1, evm: getAddress("0x70997970C51812dc3A010C7d01b50e0d17dc79C8") });
  });

  it("requires the password to reveal the phrase and to change it", async () => {
    await expect(wallet.revealMnemonic("nope nope nope")).rejects.toThrow(/Incorrect/);
    expect(await wallet.revealMnemonic(PASSWORD)).toBe(HARDHAT);
    await wallet.changePassword(PASSWORD, "a brand new password");
    await wallet.lock();
    await expect(wallet.unlock(PASSWORD)).rejects.toThrow(/Incorrect/);
    await wallet.unlock("a brand new password");
    expect(await wallet.getStatus()).toBe("unlocked");
  });

  it("never stores the phrase in plaintext", async () => {
    const dump = JSON.stringify({
      local: (chrome.storage.local as any)._dump(),
      session: (chrome.storage.session as any)._dump(),
    });
    expect(dump).not.toContain("junk");
  });

  it("refuses to overwrite an existing wallet", async () => {
    await expect(wallet.importWallet(PASSWORD, HARDHAT, "bip44")).rejects.toThrow(/already exists/);
  });
});
