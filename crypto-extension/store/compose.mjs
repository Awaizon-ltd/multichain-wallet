// Frames the captured screens (store/raw) into Chrome Web Store assets (store/out):
//   screenshot-1..5.png  1280×800  (Web Store screenshots, max 5)
//   promo-small.png      440×280   (small promo tile — required)
//   promo-marquee.png    1400×560  (marquee promo tile — optional)
//   icon-128.png         128×128   (store icon)
import puppeteer from "puppeteer-core";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1")), "..");
const RAW = path.join(ROOT, "store", "raw");
const OUT = path.join(ROOT, "store", "out");
fs.mkdirSync(OUT, { recursive: true });
const img = (name) => `data:image/png;base64,${fs.readFileSync(path.join(RAW, `${name}.png`)).toString("base64")}`;
const ICON = `data:image/png;base64,${fs.readFileSync(path.join(ROOT, "public", "icons", "icon128.png")).toString("base64")}`;

const SLIDES = [
  { file: "screenshot-1", shot: "home", kicker: "Rizon Wallet", title: 'All your crypto.<br/><em>One desktop wallet.</em>', body: "Ethereum, Base, Arc, Robinhood Chain, Solana and more — with the same accounts as the Rizon mobile app." },
  { file: "screenshot-2", shot: "swap", kicker: "Swap & bridge", title: "Trade across chains<br/><em>in one click.</em>", body: "Best-price routes on every network, cross-chain bridging built in, and approvals for the exact amount only." },
  { file: "screenshot-3", shot: "scam-warning", back: "scam-connect", kicker: "Built-in protection", title: "Stops scams<br/><em>before you sign.</em>", body: "Look-alike domains, unlimited approvals and wallet-draining signatures are flagged in plain English." },
  { file: "screenshot-4", shot: "connect", kicker: "Works with dApps", title: "Connect to any dApp.<br/><em>You approve everything.</em>", body: "Sites only see the account you choose. Every signature and transaction waits for your OK." },
  { file: "screenshot-5", shot: "coin", back: "market", kicker: "Market & @usernames", title: "Track the market.<br/><em>Pay @usernames.</em>", body: "Live prices and charts for trending tokens — and send to friends by name instead of long addresses." },
];

const BASE_CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@500;600;700;800&display=swap');
  * { margin: 0; box-sizing: border-box; }
  body { font-family: Inter, system-ui, sans-serif; color: #f5f5f5; overflow: hidden;
    background: radial-gradient(900px 600px at 82% 40%, rgba(214,250,27,0.16), transparent 60%),
                radial-gradient(700px 500px at 0% 100%, rgba(214,250,27,0.06), transparent 60%), #0e0e0e; }
  em { font-style: normal; color: #d6fa1b; }
  .phone { border-radius: 26px; overflow: hidden; border: 1px solid #2e2e2e; background: #121212;
    box-shadow: 0 40px 80px rgba(0,0,0,0.55), 0 0 0 8px rgba(255,255,255,0.03); }
  .phone img { display: block; width: 100%; }
  .brand { display: flex; align-items: center; gap: 12px; font-weight: 700; font-size: 20px; }
  .brand img { width: 40px; height: 40px; border-radius: 11px; }
`;

const slideHtml = (s) => `<!doctype html><html><head><style>${BASE_CSS}
  body { width: 1280px; height: 800px; }
  .text { position: absolute; left: 96px; top: 50%; transform: translateY(-50%); width: 500px; }
  .kicker { display: inline-block; font-size: 15px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase;
    color: #0a0a0a; background: #d6fa1b; padding: 7px 14px; border-radius: 999px; margin-bottom: 28px; }
  h1 { font-size: 56px; line-height: 1.06; font-weight: 800; letter-spacing: -0.03em; }
  p { margin-top: 26px; font-size: 21px; line-height: 1.5; color: #b9b9b9; max-width: 470px; }
  .brand { position: absolute; left: 96px; bottom: 56px; color: #d0d0d0; }
  .front { position: absolute; right: 120px; top: 64px; width: 402px; }
  .back { position: absolute; right: 372px; top: 128px; width: 280px; opacity: .5; transform: rotate(-4deg); filter: saturate(.8); }
</style></head><body>
  <div class="text"><span class="kicker">${s.kicker}</span><h1>${s.title}</h1><p>${s.body}</p></div>
  <div class="brand"><img src="${ICON}"/>Rizon Wallet</div>
  ${s.back ? `<div class="phone back"><img src="${img(s.back)}"/></div>` : ""}
  <div class="phone front"><img src="${img(s.shot)}"/></div>
</body></html>`;

const smallTile = () => `<!doctype html><html><head><style>${BASE_CSS}
  body { width: 440px; height: 280px; display: flex; flex-direction: column; justify-content: center; padding: 0 36px; }
  .brand { font-size: 34px; gap: 16px; } .brand img { width: 64px; height: 64px; border-radius: 16px; }
  p { margin-top: 18px; font-size: 19px; font-weight: 600; color: #cfcfcf; line-height: 1.35; }
</style></head><body><div class="brand"><img src="${ICON}"/>Rizon Wallet</div><p>Self-custody for <em>Ethereum, Base, Solana</em> &amp; more.</p></body></html>`;

const marquee = () => `<!doctype html><html><head><style>${BASE_CSS}
  body { width: 1400px; height: 560px; }
  .text { position: absolute; left: 90px; top: 50%; transform: translateY(-50%); width: 620px; }
  h1 { font-size: 56px; line-height: 1.08; font-weight: 800; letter-spacing: -0.03em; margin-top: 26px; }
  p { margin-top: 18px; font-size: 21px; color: #b9b9b9; }
  .a { position: absolute; right: 360px; top: 60px; width: 290px; transform: rotate(-4deg); }
  .b { position: absolute; right: 90px; top: 34px; width: 300px; }
</style></head><body>
  <div class="text"><div class="brand"><img src="${ICON}"/>Rizon Wallet</div>
    <h1>Your crypto,<br/><em>on desktop.</em></h1><p>Swap, bridge and connect to dApps — with scam protection built in.</p></div>
  <div class="phone a"><img src="${img("swap")}"/></div>
  <div class="phone b"><img src="${img("home")}"/></div>
</body></html>`;

const browser = await puppeteer.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true });
try {
  const page = await browser.newPage();
  const render = async (html, w, h, file) => {
    await page.setViewport({ width: w, height: h, deviceScaleFactor: 1 });
    await page.setContent(html, { waitUntil: "load", timeout: 120000 });
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: path.join(OUT, `${file}.png`), clip: { x: 0, y: 0, width: w, height: h } });
    console.log("wrote", file);
  };
  for (const s of SLIDES) await render(slideHtml(s), 1280, 800, s.file);
  await render(smallTile(), 440, 280, "promo-small");
  await render(marquee(), 1400, 560, "promo-marquee");
  fs.copyFileSync(path.join(ROOT, "public", "icons", "icon128.png"), path.join(OUT, "icon-128.png"));
} finally {
  await browser.close();
}
