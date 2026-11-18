import { verifyMessage } from "ethers";
import * as wallet from "../src/background/wallet";
import { K, local } from "../src/background/storage";
import { resetChrome } from "./setup";

const HARDHAT = "test test test test test test test test test test test junk";
const PASSWORD = "correct horse battery";
const LEGACY = ["0x1090495C9bC80106a8E42D89E10fd58adbDA409b", "0x1A24e5C53B1438f15B25c819fEe1F894e6D131f2"];
const STANDARD = ["0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266", "0x70997970C51812dc3A010C7d01b50e0d17dc79C8"];

describe("EVM derivation per wallet", () => {
  beforeEach(() => resetChrome());

  it("imports a legacy Rizon mobile phrase at the mobile app's addresses", async () => {
    await wallet.importWallet(PASSWORD, HARDHAT, "rizon-v1");
    expect(await wallet.getEvmDerivation()).toBe("rizon-v1");
    expect((await wallet.getAccounts())[0].evm).toBe(LEGACY[0]);
    const added = await wallet.addAccount();
    expect(added.evm).toBe(LEGACY[1]);
  });

  it("signs with the key of the address the user sees", async () => {
    await wallet.importWallet(PASSWORD, HARDHAT, "rizon-v1");
    const [acc] = await wallet.getAccounts();
    const sig = await wallet.withEvmSigner(acc, (s) => s.signMessage("hello"));
    expect(verifyMessage("hello", sig)).toBe(LEGACY[0]);
  });

  it("refuses to sign if the stored address doesn't match the derived key", async () => {
    await wallet.importWallet(PASSWORD, HARDHAT, "rizon-v1");
    const [acc] = await wallet.getAccounts();
    await local.set(K.evmDerivation, "bip44"); // simulate a mismatched record
    await expect(wallet.withEvmSigner(acc, (s) => s.signMessage("x"))).rejects.toThrow(/does not match/);
  });

  it("imports a standard phrase at MetaMask's addresses", async () => {
    await wallet.importWallet(PASSWORD, HARDHAT, "bip44");
    expect((await wallet.getAccounts())[0].evm).toBe(STANDARD[0]);
    expect((await wallet.addAccount()).evm).toBe(STANDARD[1]);
  });

  it("creates new wallets with the standard derivation", async () => {
    await wallet.createWallet(PASSWORD, HARDHAT);
    expect(await wallet.getEvmDerivation()).toBe("bip44");
    expect((await wallet.getAccounts())[0].evm).toBe(STANDARD[0]);
  });

  it("treats installs from before the field existed as standard", async () => {
    await wallet.createWallet(PASSWORD, HARDHAT);
    await local.remove(K.evmDerivation);
    expect(await wallet.getEvmDerivation()).toBe("bip44");
    const [acc] = await wallet.getAccounts();
    await expect(wallet.withEvmSigner(acc, (s) => s.address)).resolves.toBe(STANDARD[0]);
  });

  it("requires an explicit derivation on import", async () => {
    await expect(wallet.importWallet(PASSWORD, HARDHAT, undefined as any)).rejects.toThrow(/derivation/);
  });
});
