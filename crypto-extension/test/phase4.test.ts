import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { seal, unseal } from "../src/background/cloudBackup";
import { linkUsername } from "../src/background/identity";
import * as wallet from "../src/background/wallet";
import { resetChrome } from "./setup";

const HARDHAT = "test test test test test test test test test test test junk";
const UID = "fbUid123";
const aad = Buffer.from(`rizon-backup:v1:${UID}`);

describe("cloud backup is wire-compatible with the mobile app", () => {
  it("decrypts a backup sealed the way crypto-wallet/services/cloudBackup.js does", async () => {
    const key = randomBytes(32);
    const iv = randomBytes(12);
    const c = createCipheriv("aes-256-gcm", key, iv);
    c.setAAD(aad);
    const ct = Buffer.concat([c.update(Buffer.from(HARDHAT, "utf8")), c.final()]);
    const mobile = { iv: iv.toString("base64"), tag: c.getAuthTag().toString("base64"), ct: ct.toString("base64") };
    expect(await unseal(new Uint8Array(key), mobile, UID)).toBe(HARDHAT);
  });

  it("produces backups the mobile app can decrypt", async () => {
    const key = randomBytes(32);
    const sealed = await seal(new Uint8Array(key), HARDHAT, UID);
    const d = createDecipheriv("aes-256-gcm", key, Buffer.from(sealed.iv, "base64"));
    d.setAAD(aad);
    d.setAuthTag(Buffer.from(sealed.tag, "base64"));
    const pt = Buffer.concat([d.update(Buffer.from(sealed.ct, "base64")), d.final()]).toString("utf8");
    expect(pt).toBe(HARDHAT);
  });

  it("refuses a backup bound to a different account", async () => {
    const key = new Uint8Array(randomBytes(32));
    const sealed = await seal(key, HARDHAT, UID);
    await expect(unseal(key, sealed, "someoneElse")).rejects.toBeTruthy();
  });
});

describe("@username linking", () => {
  beforeEach(async () => {
    await resetChrome();
    await wallet.importWallet("correct horse battery", HARDHAT, "bip44");
  });
  afterEach(() => vi.unstubAllGlobals());

  function mockBackend(messageFor: (b: any) => string) {
    const calls: any[] = [];
    vi.stubGlobal("fetch", async (url: string, init: any) => {
      const body = JSON.parse(init.body);
      calls.push({ url, body });
      const data = url.endsWith("/identity/challenge")
        ? { nonce: "n1", message: messageFor(body), username: body.username }
        : { username: "alice", evm_address: "0xf39f", solana_address: "x" };
      return new Response(JSON.stringify({ success: true, data }), { status: 201 });
    });
    return calls;
  }

  it("signs the backend's challenge with both keys and binds", async () => {
    const [acc] = await wallet.getAccounts();
    const calls = mockBackend(
      (b) => `Rizon wants you to link this wallet to @${b.username}\n\nEVM address: ${b.evm_address}\nSolana address: ${b.solana_address}\n\nNonce: n1`,
    );
    await linkUsername(acc, "@Alice");
    expect(calls[0].body).toEqual({ username: "alice", evm_address: acc.evm, solana_address: acc.solana });
    expect(calls[1].body.nonce).toBe("n1");
    expect(calls[1].body.evm_signature).toMatch(/^0x[0-9a-f]{130}$/);
    expect(calls[1].body.solana_signature.length).toBeGreaterThan(80);
  });

  it("refuses to sign a challenge for another username or address", async () => {
    const [acc] = await wallet.getAccounts();
    mockBackend(() => `Rizon wants you to link this wallet to @mallory\n\nEVM address: ${acc.evm}\nSolana address: ${acc.solana}`);
    await expect(linkUsername(acc, "alice")).rejects.toThrow(/Unexpected challenge/);
    mockBackend((b) => `Rizon wants you to link this wallet to @${b.username}\n\nEVM address: 0x000000000000000000000000000000000000dEaD\nSolana address: ${acc.solana}`);
    await expect(linkUsername(acc, "alice")).rejects.toThrow(/Unexpected challenge/);
  });

  it("validates the username locally", async () => {
    const [acc] = await wallet.getAccounts();
    await expect(linkUsername(acc, "no")).rejects.toThrow(/3–20/);
  });
});
