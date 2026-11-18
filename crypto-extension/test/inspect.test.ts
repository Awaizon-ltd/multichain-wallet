import { AbiCoder, Interface, toUtf8Bytes, hexlify } from "ethers";
import { checkOrigin } from "../src/shared/domainSecurity";
import { decodeCall, displayMessage, inspectTypedData, MAX_UINT256, parseSiwe, pruneTypes } from "../src/shared/decode";

describe("domain security", () => {
  it("trusts verified domains and their subdomains", () => {
    expect(checkOrigin("https://app.uniswap.org").isLegitimate).toBe(true);
    expect(checkOrigin("https://api.awarizon.com").isLegitimate).toBe(true);
    expect(checkOrigin("https://jup.ag").isLegitimate).toBe(true);
  });
  it("flags typosquats in any label, punycode, and phishing patterns", () => {
    expect(checkOrigin("https://uniswaap.org").isHighRisk).toBe(true);
    expect(checkOrigin("https://app.uniswaps.org").isHighRisk).toBe(true);
    expect(checkOrigin("https://xn--uniswp-7ve.org").isHighRisk).toBe(true);
    expect(checkOrigin("https://claim-tokens.io").isHighRisk).toBe(true);
    expect(checkOrigin("https://0pensea.io").isHighRisk).toBe(true);
  });
  it("doesn't flag ordinary sites or localhost", () => {
    for (const o of ["https://example.com", "https://zora.co", "http://localhost:3000", "https://cure.org"]) {
      expect(checkOrigin(o).isHighRisk, o).toBe(false);
    }
  });
  it("warns about plain HTTP", () => {
    expect(checkOrigin("http://example.com").warnings.join()).toMatch(/HTTPS/);
  });
});

describe("transaction decoding", () => {
  const erc20 = new Interface([
    "function transfer(address,uint256)",
    "function approve(address,uint256)",
    "function setApprovalForAll(address,bool)",
  ]);
  const token = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
  const spender = "0x000000000000000000000000000000000000dEaD";

  it("recognises native sends, transfers and unlimited approvals", () => {
    expect(decodeCall(spender, 10n, "0x").kind).toBe("nativeTransfer");
    const t = decodeCall(token, 0n, erc20.encodeFunctionData("transfer", [spender, 5n]));
    expect(t).toMatchObject({ kind: "erc20Transfer", amount: "5" });
    const a = decodeCall(token, 0n, erc20.encodeFunctionData("approve", [spender, MAX_UINT256]));
    expect(a.unlimited).toBe(true);
    expect(a.warnings[0]).toMatch(/UNLIMITED/);
    const finite = decodeCall(token, 0n, erc20.encodeFunctionData("approve", [spender, 100n]));
    expect(finite.unlimited).toBe(false);
    const all = decodeCall(token, 0n, erc20.encodeFunctionData("setApprovalForAll", [spender, true]));
    expect(all.warnings[0]).toMatch(/ALL your NFTs/);
  });

  it("treats malformed calldata as a generic call instead of throwing", () => {
    expect(decodeCall(token, 0n, "0xa9059cbb1234").kind).toBe("contractCall");
  });
});

describe("message inspection", () => {
  it("shows utf-8 text and keeps binary as hex", () => {
    expect(displayMessage(hexlify(toUtf8Bytes("Hello Rizon")))).toEqual({ text: "Hello Rizon", isHex: false });
    expect(displayMessage("0x00ff10").isHex).toBe(true);
  });

  it("detects SIWE domain mismatch", () => {
    const msg = "app.uniswap.org wants you to sign in with your Ethereum account:\n0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266\n\nURI: https://app.uniswap.org\nChain ID: 1";
    expect(parseSiwe(msg, "https://app.uniswap.org")?.domainMismatch).toBe(false);
    expect(parseSiwe(msg, "https://evil.example")?.domainMismatch).toBe(true);
  });

  it("flags unlimited Permit signatures", () => {
    const info = inspectTypedData({
      primaryType: "Permit",
      domain: { name: "USD Coin", chainId: 8453, verifyingContract: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" },
      message: { owner: "0x1", spender: "0x2", value: MAX_UINT256.toString(), nonce: 0, deadline: 1 },
      types: {},
    });
    expect(info).toMatchObject({ kind: "permit", unlimited: true, chainId: 8453 });
  });

  it("prunes unrelated root types so ethers can sign", () => {
    const types = {
      Mail: [{ name: "from", type: "Person" }, { name: "to", type: "Person[]" }],
      Person: [{ name: "name", type: "string" }],
      Unused: [{ name: "x", type: "uint256" }],
    };
    expect(Object.keys(pruneTypes(types, "Mail")).sort()).toEqual(["Mail", "Person"]);
  });
});

// Keep the import used for tree-shaking linters.
void AbiCoder;
