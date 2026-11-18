// End-to-end: real Chrome + the built extension + a local test dApp.
// Usage (from crypto-extension/, after `npm run build`):
//   npm i --no-save puppeteer-core@24.22.0
//   node test/e2e/run.mjs dist node_modules
// Uses the Hardhat test mnemonic. Never sends a transaction: the one tx prompt is rejected.
import puppeteer from "puppeteer-core";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { createRequire } from "node:module";

const [, , DIST, EXT_NM] = process.argv;
const require = createRequire(path.join(EXT_NM, "x.js"));
const { verifyMessage } = require("ethers");
const HERE = path.dirname(new URL(import.meta.url).pathname).replace(/^\/([A-Z]:)/, "$1");
const SHOTS = path.join(HERE, "shots");
fs.mkdirSync(SHOTS, { recursive: true });

const MNEMONIC = "test test test test test test test test test test test junk";
const PASSWORD = "correct horse battery";
const EVM0 = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";

const results = [];
const check = (name, cond, extra = "") => {
  results.push({ name, ok: !!cond, extra });
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? "  — " + extra : ""}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// local dApp server
const html = fs.readFileSync(path.join(HERE, "dapp.html"));
const server = http.createServer((_q, s) => (s.writeHead(200, { "content-type": "text/html" }), s.end(html)));
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const DAPP = `http://127.0.0.1:${server.address().port}/`;

const browser = await puppeteer.launch({
  executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
  headless: true,
  pipe: true,
  enableExtensions: [path.resolve(DIST)],
  userDataDir: fs.mkdtempSync(path.join(os.tmpdir(), "rizon-e2e-")),
  args: ["--no-first-run", "--no-default-browser-check", "--window-size=1280,900"],
  protocolTimeout: 60000,
});

try {
  const sw = await browser.waitForTarget((t) => t.type() === "service_worker" && t.url().endsWith("background.js"), { timeout: 20000 });
  const extId = new URL(sw.url()).host;
  const hook = async (t) => {
    if (t.type() !== "service_worker") return;
    const wk = await t.worker();
    wk?.on("console", (m) => console.log("[sw]", m.type(), m.text()));
  };
  await hook(sw);
  browser.on("targetcreated", hook);
  check("extension service worker started", !!extId, extId);
  const EXT = `chrome-extension://${extId}/index.html`;

  // Close the onboarding tab the extension opens itself on install.
  await sleep(1500);
  for (const p of await browser.pages()) if (p.url().includes("#/onboarding")) await p.close();

  const click = async (page, text) => {
    await page.bringToFront();
    const el = await page.waitForSelector(`::-p-text(${text})`, { timeout: 15000 });
    await el.click();
  };
  const approve = async (page) => {
    await page.bringToFront();
    const b = await page.waitForSelector(".footer .btn.primary:not([disabled])", { timeout: 15000 });
    await b.click();
  };
  const reject = async (page) => {
    await page.bringToFront();
    await (await page.waitForSelector(".footer .btn.secondary", { timeout: 15000 })).click();
  };
  const shot = (page, name) => page.screenshot({ path: path.join(SHOTS, `${name}.png`) });

  /* ---------------- onboarding (import) ---------------- */
  const ob = await browser.newPage();
  await ob.setViewport({ width: 900, height: 760 });
  await ob.goto(`${EXT}#/onboarding`);
  await ob.bringToFront();
  await ob.waitForSelector("::-p-text(Welcome to Rizon)");
  await shot(ob, "01-welcome");
  await click(ob, "I already have a recovery phrase");
  await ob.type("textarea", MNEMONIC);
  await click(ob, "Continue");
  await ob.waitForSelector("#pw");
  await ob.bringToFront();
  await ob.type("#pw", PASSWORD);
  await ob.type("#pw2", PASSWORD);
  await ob.click("input[type=checkbox]");
  await shot(ob, "02-password");
  await click(ob, "Import wallet");
  await ob.waitForSelector("::-p-text(You're all set)", { timeout: 30000 });
  await shot(ob, "03-done");
  check("onboarding import completes", true);

  /* ---------------- popup home ---------------- */
  const popup = await browser.newPage();
  await popup.setViewport({ width: 360, height: 600 });
  await popup.goto(EXT);
  await popup.bringToFront();
  await popup.waitForSelector("::-p-text(Assets)", { timeout: 20000 });
  await sleep(9000); // let balances + prices load from real RPCs
  await shot(popup, "04-home");
  const hero = await popup.$eval(".hero .balance", (e) => e.textContent).catch(() => null);
  check("home shows a portfolio total", !!hero && hero.startsWith("$"), hero ?? "none");
  const rows = await popup.$$eval(".card.flush .list-item", (els) => els.length);
  check("home lists assets", rows > 0, `${rows} rows`);

  await click(popup, "Receive");
  await popup.waitForSelector(".qr img");
  await shot(popup, "05-receive");
  const shownAddr = await popup.$eval(".mono", (e) => e.textContent);
  check("receive shows account 0 EVM address", shownAddr === EVM0, shownAddr);
  await click(popup, "Solana");
  await sleep(300);
  const solAddr = await popup.$eval(".mono", (e) => e.textContent);
  check("receive shows a Solana address", /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(solAddr), solAddr);

  /* ---------------- dApp: discovery ---------------- */
  const dapp = await browser.newPage();
  await dapp.goto(DAPP);
  await dapp.bringToFront();
  await sleep(500);
  const info = await dapp.evaluate(() => window.__eip6963.map((d) => ({ ...d.info, icon: d.info.icon.slice(0, 22) })));
  check("EIP-6963 announces Rizon", info.some((i) => i.name === "Rizon" && i.rdns === "com.awarizon.rizon" && i.icon.startsWith("data:image/png")), JSON.stringify(info));
  check("window.ethereum.isRizon", await dapp.evaluate(() => window.ethereum?.isRizon === true));
  const wallets = await dapp.evaluate(() => window.__wallets.map((w) => ({ name: w.name, chains: w.chains, features: Object.keys(w.features) })));
  check(
    "Wallet Standard registers Rizon (Solana)",
    wallets.some((w) => w.name === "Rizon" && w.chains.includes("solana:mainnet") && w.features.includes("solana:signAndSendTransaction")),
    JSON.stringify(wallets),
  );
  check("eth_accounts empty before connect", (await dapp.evaluate(() => window.ethereum.request({ method: "eth_accounts" }))).length === 0);
  check("eth_chainId defaults to Base", (await dapp.evaluate(() => window.ethereum.request({ method: "eth_chainId" }))) === "0x2105");

  const seenApprovals = new Set();
  const waitApproval = async () => {
    let t;
    for (let i = 0; i < 75 && !t; i++) {
      t = browser.targets().find((x) => x.type() === "page" && x.url().includes("#/approval") && !seenApprovals.has(x));
      if (!t) await sleep(200);
    }
    if (!t) {
      console.log("targets:", browser.targets().map((x) => x.type() + " " + x.url()));
      console.log("dapp results:", JSON.stringify(await dapp.evaluate(() => window.__results)));
      const swt = browser.targets().find((x) => x.type() === "service_worker");
      const wk = await swt.worker();
      console.log("trace:", await wk.evaluate(async () => JSON.stringify((await chrome.storage.session.get("trace")).trace)));
      console.log("sw windows:", await wk.evaluate(async () => JSON.stringify((await chrome.windows.getAll({ populate: true })).map((w) => ({ id: w.id, type: w.type, state: w.state, tabs: w.tabs?.map((t) => t.url || t.pendingUrl) })))));
      throw new Error("approval window never appeared");
    }
    seenApprovals.add(t);
    const p = await t.page();
    await p.setViewport({ width: 380, height: 640 });
    await p.bringToFront();
    return p;
  };
  const result = async (name) => {
    for (let i = 0; i < 100; i++) {
      const r = await dapp.evaluate((n) => window.__results?.[n], name);
      if (r && !r.pending) return r;
      await sleep(200);
    }
    return { ok: false, message: "timeout" };
  };

  /* ---------------- dApp: EVM connect ---------------- */
  await dapp.evaluate(() => {
    window.ethereum.on("accountsChanged", (a) => window.__events.push(["accountsChanged", a]));
    window.ethereum.on("chainChanged", (c) => window.__events.push(["chainChanged", c]));
    window.__run("connect", () => window.ethereum.request({ method: "eth_requestAccounts" }));
  });
  let ap = await waitApproval();
  await sleep(400);
  await shot(ap, "06-approve-connect");
  await approve(ap);
  const conn = await result("connect");
  check("eth_requestAccounts returns account 0", conn.ok && conn.value?.[0] === EVM0, JSON.stringify(conn));

  /* ---------------- dApp: personal_sign ---------------- */
  await dapp.evaluate((a) => window.__run("sign", () => window.ethereum.request({ method: "personal_sign", params: ["0x48656c6c6f2052697a6f6e", a] })), EVM0);
  ap = await waitApproval();
  await ap.waitForSelector("::-p-text(Hello Rizon)");
  await shot(ap, "07-approve-sign");
  await approve(ap);
  const sig = await result("sign");
  check("personal_sign signature verifies", sig.ok && verifyMessage("Hello Rizon", sig.value) === EVM0);

  /* ---------------- dApp: unlimited Permit is flagged, user rejects ---------------- */
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
    message: { owner: EVM0, spender: "0x000000000000000000000000000000000000dEaD", value: (2n ** 256n - 1n).toString(), nonce: 0, deadline: 9999999999 },
  };
  await dapp.evaluate((a, td) => window.__run("permit", () => window.ethereum.request({ method: "eth_signTypedData_v4", params: [a, JSON.stringify(td)] })), EVM0, permit);
  ap = await waitApproval();
  await ap.waitForSelector("::-p-text(UNLIMITED)");
  await shot(ap, "08-approve-permit-warning");
  await reject(ap);
  const pr = await result("permit");
  check("unlimited Permit shows warning; reject returns 4001", !pr.ok && pr.code === 4001, JSON.stringify(pr));

  /* ---------------- dApp: transaction preview (rejected, never sent) ---------------- */
  await dapp.evaluate(
    (a) =>
      window.__run("tx", () =>
        window.ethereum.request({
          method: "eth_sendTransaction",
          params: [{ from: a, to: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", data: "0x095ea7b3000000000000000000000000000000000000000000000000000000000000deadffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff" }],
        }),
      ),
    EVM0,
  );
  ap = await waitApproval();
  await ap.waitForSelector("::-p-text(Approve spending)", { timeout: 30000 });
  await sleep(300);
  await shot(ap, "09-approve-tx-unlimited-approve");
  const txText = await ap.evaluate(() => document.body.innerText);
  check("tx preview decodes an unlimited USDC approval", /Unlimited USDC/.test(txText) && /UNLIMITED access/.test(txText));
  await reject(ap);
  const txr = await result("tx");
  check("rejected transaction returns 4001 (nothing sent)", !txr.ok && txr.code === 4001);

  /* ---------------- dApp: chain switching ---------------- */
  await dapp.evaluate(() => window.ethereum.request({ method: "wallet_switchEthereumChain", params: [{ chainId: "0x1" }] }));
  await sleep(500);
  check("switch to Ethereum emits chainChanged", (await dapp.evaluate(() => window.__events)).some((e) => e[0] === "chainChanged" && e[1] === "0x1"));
  const bad = await dapp.evaluate(() => window.ethereum.request({ method: "wallet_switchEthereumChain", params: [{ chainId: "0x539" }] }).catch((e) => e.code));
  check("unknown chain rejected with 4902", bad === 4902);
  const ethSign = await dapp.evaluate((a) => window.ethereum.request({ method: "eth_sign", params: [a, "0x00"] }).catch((e) => e.code), EVM0);
  check("eth_sign is disabled (4200)", ethSign === 4200);

  /* ---------------- dApp: Solana via Wallet Standard ---------------- */
  await dapp.evaluate(() => {
    const w = window.__wallets.find((x) => x.name === "Rizon");
    window.__run("solConnect", async () => (await w.features["standard:connect"].connect()).accounts.map((a) => a.address));
  });
  ap = await waitApproval();
  await ap.waitForSelector("::-p-text(Solana account)");
  await shot(ap, "10-approve-solana-connect");
  await approve(ap);
  const sc = await result("solConnect");
  check("Solana connect returns the wallet's Solana address", sc.ok && sc.value?.[0] === solAddr, JSON.stringify(sc));

  await dapp.evaluate(() => {
    const w = window.__wallets.find((x) => x.name === "Rizon");
    window.__run("solSign", async () => {
      const [out] = await w.features["solana:signMessage"].signMessage({ account: w.accounts[0], message: new TextEncoder().encode("Sign in to Test dApp") });
      return { sig: Array.from(out.signature), pk: Array.from(w.accounts[0].publicKey) };
    });
  });
  ap = await waitApproval();
  await ap.waitForSelector("::-p-text(Sign in to Test dApp)");
  await approve(ap);
  const ss = await result("solSign");
  const { ed25519 } = await import("file://" + path.join(EXT_NM, "@noble/curves/ed25519.js").replace(/\\/g, "/"));
  check(
    "Solana signMessage verifies (ed25519)",
    ss.ok && ed25519.verify(Uint8Array.from(ss.value.sig), new TextEncoder().encode("Sign in to Test dApp"), Uint8Array.from(ss.value.pk)),
  );

  /* ---------------- phase 4: market, NFTs, username, backup ---------------- */
  await popup.bringToFront();
  await popup.reload();
  await popup.waitForSelector("::-p-text(Assets)");
  await click(popup, "Market");
  await popup.waitForSelector(".chip", { timeout: 20000 });
  await sleep(800);
  await shot(popup, "12-market");
  const coins = await popup.$$eval(".card.flush .list-item", (els) => els.length);
  check("market lists tokens", coins > 0, `${coins} rows`);
  await popup.click(".card.flush .list-item");
  await popup.waitForSelector(".chart svg path", { timeout: 20000 });
  const box = await (await popup.$(".chart svg")).boundingBox();
  await popup.mouse.move(box.x + box.width * 0.6, box.y + box.height / 2);
  await sleep(300);
  await shot(popup, "13-coin-chart-hover");
  check("coin chart renders with hover readout", /\$/.test(await popup.$eval(".chart-readout", (e) => e.textContent)));

  await popup.reload();
  await popup.waitForSelector("::-p-text(Assets)");
  await click(popup, "NFTs");
  await popup.waitForFunction(() => !document.querySelector(".nft-grid .skeleton"), { timeout: 60000 });
  await sleep(500);
  await shot(popup, "14-nfts");
  const nftText = await popup.evaluate(() => document.body.innerText);
  check("NFT tab loads (grid, empty state or hidden-spam toggle)", /hidden|No NFTs|#|Collection/.test(nftText) || (await popup.$(".nft-card")) !== null);

  await click(popup, "Settings");
  await click(popup, "Username");
  await popup.waitForSelector("#un, ::-p-text(Linked to)", { timeout: 20000 });
  await popup.type("#un", "rizon_e2e_" + Math.floor(Math.random() * 1e6)).catch(() => {});
  await sleep(1500);
  await shot(popup, "15-username");
  check("username screen checks availability", /available|Not available|taken|reserved|Linked to/i.test(await popup.evaluate(() => document.body.innerText)));
  await popup.click("[aria-label=Back]");
  await click(popup, "Cloud backup");
  await popup.waitForSelector("::-p-text(Back up to Google Drive)");
  await shot(popup, "16-backup");
  check("cloud backup screen renders", true);

  await popup.reload();
  await popup.waitForSelector("::-p-text(Assets)");
  await click(popup, "Send");
  await popup.waitForSelector(".card.flush .list-item");
  await popup.click(".card.flush .list-item");
  await popup.waitForSelector("#to");
  await popup.type("#to", "@nobody_" + Date.now().toString(36).slice(-6));
  await popup.type("#amt", "0.0000001");
  await popup.click("button[type=submit]");
  await popup.waitForSelector("::-p-text(No Rizon wallet is linked)", { timeout: 20000 });
  check("Send resolves @username and rejects unknown names", true);

  /* ---------------- lock hides accounts ---------------- */
  await popup.bringToFront();
  await popup.reload();
  await popup.waitForSelector("[aria-label=Lock]");
  await popup.click("[aria-label=Lock]");
  await popup.waitForSelector("::-p-text(Welcome back)");
  await shot(popup, "11-locked");
  await sleep(500);
  check("locking hides accounts from the dApp", (await dapp.evaluate(() => window.ethereum.request({ method: "eth_accounts" }))).length === 0);
  check("dApp got accountsChanged([]) on lock", (await dapp.evaluate(() => window.__events)).some((e) => e[0] === "accountsChanged" && e[1].length === 0));
} catch (e) {
  console.error("E2E ERROR:", e);
  check("e2e run completed without exceptions", false, e.message);
} finally {
  await browser.close();
  server.close();
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - failed}/${results.length} checks passed`);
  process.exit(failed ? 1 : 0);
}
