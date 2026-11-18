// Captures real extension screens for the Chrome Web Store listing.
//
//   npm run build && npm i --no-save puppeteer-core@24.22.0
//   node store/capture.mjs        → store/raw/*.png  (360×600 UI at 2×)
//   node store/compose.mjs        → store/out/*.png  (1280×800 slides + promo tiles)
//
// Only network responses are replaced (balances, prices, a swap quote, a demo
// @username) so the screens show a realistic portfolio instead of an empty
// test wallet. Every pixel of UI is the actual extension.

import puppeteer from "puppeteer-core";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1")), "..");
const RAW = path.join(ROOT, "store", "raw");
fs.mkdirSync(RAW, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const MNEMONIC = "test test test test test test test test test test test junk";
const PASSWORD = "store screenshots 1";
const MULTICALL = JSON.parse(fs.readFileSync(path.join(ROOT, "store", "multicall.json"), "utf8"));

/* ------------------------------ demo data ------------------------------ */

const USDC_LOGO = "https://assets.coingecko.com/coins/images/6319/large/usdc.png";
const DEMO = {
  multicall: MULTICALL,
  balances: { 8453: "0x" + (1842300000000000000n).toString(16), 1: "0x" + (651200000000000000n).toString(16), 4663: "0x" + (120500000000000000n).toString(16) },
  solLamports: 24_370_000_000,
  tokenLists: {
    8453: [
      { address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", symbol: "USDC", name: "USD Coin", decimals: 6, logoURI: USDC_LOGO },
      { address: "0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf", symbol: "cbBTC", name: "Coinbase Wrapped BTC", decimals: 8, logoURI: "https://assets.coingecko.com/coins/images/40143/large/cbbtc.webp" },
    ],
    1: [{ address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", symbol: "USDC", name: "USD Coin", decimals: 6, logoURI: USDC_LOGO }],
    4663: [],
  },
  solTokens: [
    { name: "Solana", symbol: "SOL", address: "So11111111111111111111111111111111111111112", decimals: 9, isNative: true, logoURI: "https://cryptologos.cc/logos/solana-sol-logo.png" },
    { name: "USD Coin", symbol: "USDC", address: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", decimals: 6, logoURI: USDC_LOGO },
  ],
  baseSwapTokens: [
    { name: "Ether", symbol: "ETH", address: "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE", decimals: 18, isNative: true, logoURI: "https://cryptologos.cc/logos/ethereum-eth-logo.png?v=024" },
    { name: "USD Coin", symbol: "USDC", address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", decimals: 6, logoURI: USDC_LOGO },
  ],
  natives: { ethereum: { usd: 3412.55, usd_24h_change: 2.14 }, solana: { usd: 182.4, usd_24h_change: 4.31 }, "usd-coin": { usd: 1, usd_24h_change: 0.01 } },
  tokenPrices: {
    "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913": { usd: 1, usd_24h_change: 0.01 },
    "0xcbb7c0000ab88b473b1f5afd9ef808440eed33bf": { usd: 97210, usd_24h_change: 1.18 },
    "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48": { usd: 1, usd_24h_change: 0.01 },
    epjfwdd5aufqssqem2qn1xzybapc8g4wegkzwytdt1v: { usd: 1, usd_24h_change: 0.01 },
  },
};

// Use live prices so the portfolio slide agrees with the (live) market slides.
async function livePrice(id, fallback) {
  try {
    const r = await fetch(`https://api.awarizon.com/api/market/coins/${id}`);
    const m = (await r.json()).data.market;
    return { usd: m.price, usd_24h_change: m.change24h };
  } catch {
    return fallback;
  }
}
DEMO.natives.ethereum = await livePrice("ethereum", DEMO.natives.ethereum);
DEMO.natives.solana = await livePrice("solana", DEMO.natives.solana);
DEMO.tokenPrices["0xcbb7c0000ab88b473b1f5afd9ef808440eed33bf"] = await livePrice("bitcoin", DEMO.tokenPrices["0xcbb7c0000ab88b473b1f5afd9ef808440eed33bf"]);
DEMO.ethUsdc = Math.round(DEMO.natives.ethereum.usd * 0.999);
console.log("prices:", DEMO.natives.ethereum.usd, DEMO.natives.solana.usd, DEMO.tokenPrices["0xcbb7c0000ab88b473b1f5afd9ef808440eed33bf"].usd);

/** Runs in extension pages before any app code: answers data requests with DEMO. */
function installMocks(D) {
  const real = window.fetch.bind(window);
  const json = (o) => new Response(JSON.stringify(o), { status: 200, headers: { "content-type": "application/json" } });
  window.fetch = async (input, init) => {
    const url = typeof input === "string" ? input : input.url;
    const qs = new URL(url).searchParams;
    if (init?.method === "POST" && /alchemy|robinhood|arc\.io/.test(url)) {
      const body = JSON.parse(init.body);
      const chain = /base-mainnet/.test(url) ? 8453 : /eth-mainnet/.test(url) ? 1 : /robinhood/.test(url) ? 4663 : /solana/.test(url) ? "sol" : 0;
      const r = (result) => json({ jsonrpc: "2.0", id: body.id, result });
      if (body.method === "eth_getBalance") return r(D.balances[chain] ?? "0x0");
      if (body.method === "eth_call") return r(chain === 8453 ? D.multicall.base : chain === 1 ? D.multicall.eth : "0x");
      if (body.method === "getBalance") return r({ context: { slot: 1 }, value: D.solLamports });
      if (body.method === "getTokenAccountsByOwner") {
        const isLegacy = body.params[1]?.programId?.startsWith("Tokenkeg");
        return r({
          context: { slot: 1 },
          value: isLegacy ? [{ account: { data: { parsed: { info: { mint: D.solTokens[1].address, tokenAmount: { amount: "615400000", decimals: 6 } } } } } }] : [],
        });
      }
    }
    if (url.includes("/tokens/chain/")) return json({ success: true, data: D.tokenLists[url.split("/tokens/chain/")[1].split(/[/?]/)[0]] ?? [] });
    if (url.includes("/swap/tokens")) return json({ success: true, data: { tokens: qs.get("chainId") === "SOLANA" ? D.solTokens : D.baseSwapTokens } });
    if (url.includes("/swap/price") || url.includes("/swap/quote")) {
      const sell = BigInt(qs.get("sellAmount"));
      const buy = (sell * BigInt(D.ethUsdc)) / 10n ** 12n; // ETH(18) → USDC(6) at the live ETH price
      return json({ success: true, data: { buyAmount: buy.toString(), minBuyAmount: ((buy * 99n) / 100n).toString(), estimatedPriceImpact: "0.04", route: { fills: [{ source: "0x" }] } } });
    }
    if (url.includes("/market/token-prices")) {
      const out = {};
      for (const a of (qs.get("addresses") || "").split(",")) if (D.tokenPrices[a.toLowerCase()]) out[a] = D.tokenPrices[a.toLowerCase()];
      return json({ success: true, data: out });
    }
    if (url.includes("api.coingecko.com/api/v3/simple/price")) {
      const out = {};
      for (const id of (qs.get("ids") || "").split(",")) if (D.natives[id]) out[id] = D.natives[id];
      return json(out);
    }
    if (url.includes("/identity/by-address")) return json({ success: true, data: { username: "alex", evm_address: "", solana_address: "" } });
    return real(input, init);
  };
}

const ACTIVITY = (evm, sol) => {
  const now = Date.now();
  const h = () => "0x" + [...crypto.getRandomValues(new Uint8Array(32))].map((b) => b.toString(16).padStart(2, "0")).join("");
  return [
    { id: "1", network: 8453, hash: h(), kind: "swap", from: evm, summary: "Swapped 500 USDC → ETH", status: "confirmed", timestamp: now - 25 * 60e3 },
    { id: "2", network: "SOLANA", hash: "5".repeat(64), kind: "send", from: sol, to: "maya", summary: "Sent 2.5 SOL to @maya", status: "confirmed", timestamp: now - 3 * 3600e3 },
    { id: "3", network: 8453, hash: h(), kind: "bridge", from: evm, summary: "Bridged 0.2 ETH → Arbitrum", status: "confirmed", timestamp: now - 26 * 3600e3 },
    { id: "4", network: 1, hash: h(), kind: "dapp", from: evm, summary: "Contract interaction", origin: "https://dapp.awarizon.com", status: "confirmed", timestamp: now - 50 * 3600e3 },
  ];
};

/* ------------------------------- capture ------------------------------- */

const DAPP_HTML = `<!doctype html><html><head><meta charset="utf-8"><title>dApp</title></head><body style="font-family:sans-serif;background:#f4f4f4"><h1>Demo dApp</h1></body></html>`;

const browser = await puppeteer.launch({
  executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
  headless: true,
  pipe: true,
  enableExtensions: [path.join(ROOT, "dist")],
  userDataDir: fs.mkdtempSync(path.join(os.tmpdir(), "rizon-store-")),
  args: ["--no-first-run", "--no-default-browser-check", "--window-size=1400,1000", "--force-dark-mode"],
  protocolTimeout: 90000,
});

try {
  const sw = await browser.waitForTarget((t) => t.type() === "service_worker" && t.url().endsWith("background.js"));
  const extId = new URL(sw.url()).host;
  const EXT = `chrome-extension://${extId}/index.html`;
  await sleep(1500);
  for (const p of await browser.pages()) if (p.url().includes("#/onboarding")) await p.close();

  const click = async (page, text) => {
    await page.bringToFront();
    await (await page.waitForSelector(`::-p-text(${text})`, { timeout: 20000 })).click();
  };
  const shot = async (page, name) => {
    await page.screenshot({ path: path.join(RAW, `${name}.png`) });
    console.log("captured", name);
  };
  const waitImages = (page) =>
    page.waitForFunction(() => [...document.images].every((i) => i.complete), { timeout: 15000 }).catch(() => {});

  // Onboarding (import) — also captured, it makes a good first-run slide.
  const ob = await browser.newPage();
  await ob.setViewport({ width: 360, height: 600, deviceScaleFactor: 2 });
  await ob.goto(`${EXT}?tab#/onboarding`);
  await ob.bringToFront();
  await ob.waitForSelector("::-p-text(Welcome to Rizon)");
  await click(ob, "I already have a recovery phrase");
  await ob.type("textarea", MNEMONIC);
  await click(ob, "Continue");
  await ob.waitForSelector("#pw");
  await ob.type("#pw", PASSWORD);
  await ob.type("#pw2", PASSWORD);
  await ob.click("input[type=checkbox]");
  await click(ob, "Import wallet");
  await ob.waitForSelector("::-p-text(You're all set)", { timeout: 30000 });
  await ob.close();

  // Dark theme + demo activity.
  const worker = await sw.worker();
  const acct = await worker.evaluate(async () => (await chrome.storage.local.get("accounts")).accounts[0]);
  await worker.evaluate(async (activity) => {
    const settings = (await chrome.storage.local.get("settings")).settings ?? {};
    await chrome.storage.local.set({ settings: { ...settings, theme: "dark" }, activity });
  }, ACTIVITY(acct.evm, acct.solana));

  // Popup screens.
  const popup = await browser.newPage();
  await popup.evaluateOnNewDocument(installMocks, DEMO);
  await popup.setViewport({ width: 360, height: 600, deviceScaleFactor: 2 });
  await popup.goto(EXT);
  await popup.bringToFront();
  await popup.waitForSelector("::-p-text(Assets)");
  await popup.waitForFunction(() => document.querySelectorAll(".card.flush .list-item").length >= 5, { timeout: 30000 });
  await waitImages(popup);
  await sleep(800);
  await shot(popup, "home");

  await click(popup, "Swap");
  await popup.waitForSelector("[aria-label='Amount to sell']");
  await popup.type("[aria-label='Amount to sell']", "0.5");
  await popup.waitForSelector("::-p-text(Minimum received)", { timeout: 20000 });
  await popup.evaluate(() => document.activeElement?.blur());
  await waitImages(popup);
  await sleep(400);
  await shot(popup, "swap");

  await popup.reload();
  await popup.waitForSelector("::-p-text(Assets)");
  await click(popup, "Receive");
  await popup.waitForSelector(".qr img");
  await sleep(400);
  await shot(popup, "receive");

  await popup.reload();
  await popup.waitForSelector("::-p-text(Assets)");
  await click(popup, "Market");
  await popup.waitForSelector(".chip");
  await waitImages(popup);
  await sleep(1500);
  await shot(popup, "market");
  await popup.click(".card.flush .list-item:nth-child(2)");
  await popup.waitForSelector(".chart svg path", { timeout: 20000 });
  await click(popup, "1M");
  await sleep(300);
  await popup.waitForSelector(".chart svg path", { timeout: 20000 });
  await sleep(800);
  const box = await (await popup.$(".chart svg")).boundingBox();
  await popup.mouse.move(box.x + box.width * 0.72, box.y + box.height * 0.5);
  await sleep(300);
  await shot(popup, "coin");

  await popup.reload();
  await popup.waitForSelector("::-p-text(Assets)");
  await click(popup, "Activity");
  await popup.waitForSelector(".pill");
  await sleep(400);
  await shot(popup, "activity");

  // Approval windows from a dApp page (served locally under each origin).
  const dapp = await browser.newPage();
  await dapp.setRequestInterception(true);
  dapp.on("request", (r) =>
    /^https:\/\/(dapp\.awarizon\.com|rizon-fix\.xyz)\/$/.test(r.url())
      ? r.respond({ status: 200, contentType: "text/html", body: DAPP_HTML })
      : r.continue(),
  );
  const seen = new Set();
  const approval = async () => {
    for (let i = 0; i < 100; i++) {
      const t = browser.targets().find((x) => x.type() === "page" && x.url().includes("#/approval") && !seen.has(x));
      if (t) {
        seen.add(t);
        const p = await t.page();
        await p.setViewport({ width: 360, height: 600, deviceScaleFactor: 2 });
        await p.bringToFront();
        await sleep(700);
        return p;
      }
      await sleep(200);
    }
    throw new Error("no approval window");
  };
  const approveBtn = async (p) => (await p.waitForSelector(".footer .btn.primary:not([disabled])")).click();

  await dapp.goto("https://dapp.awarizon.com/");
  await dapp.bringToFront();
  dapp.evaluate(() => window.ethereum.request({ method: "eth_requestAccounts" })).catch(() => {});
  let ap = await approval();
  await waitImages(ap);
  await shot(ap, "connect");
  await approveBtn(ap);
  await sleep(800);

  await dapp.goto("https://rizon-fix.xyz/");
  await dapp.bringToFront();
  dapp.evaluate(() => window.ethereum.request({ method: "eth_requestAccounts" })).catch(() => {});
  ap = await approval();
  await shot(ap, "scam-connect");
  await (await ap.waitForSelector("::-p-text(I understand this site may be a scam)")).click();
  await approveBtn(ap);
  await sleep(800);
  const permit = {
    types: {
      EIP712Domain: [{ name: "name", type: "string" }, { name: "chainId", type: "uint256" }, { name: "verifyingContract", type: "address" }],
      Permit: [
        { name: "owner", type: "address" },
        { name: "spender", type: "address" },
        { name: "value", type: "uint256" },
        { name: "nonce", type: "uint256" },
        { name: "deadline", type: "uint256" },
      ],
    },
    primaryType: "Permit",
    domain: { name: "USD Coin", chainId: 8453, verifyingContract: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" },
    message: { owner: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266", spender: "0x9f1c0bD1fA3a5B7e8c7d6f5E4D3c2B1A09876543", value: (2n ** 256n - 1n).toString(), nonce: 0, deadline: 9999999999 },
  };
  dapp
    .evaluate((td) => window.ethereum.request({ method: "eth_signTypedData_v4", params: ["0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266", JSON.stringify(td)] }), permit)
    .catch(() => {});
  ap = await approval();
  await shot(ap, "scam-warning");
  await (await ap.waitForSelector(".footer .btn.secondary")).click();
} finally {
  await browser.close();
}
