// Batch export: renders N posters (cycling through every caption before repeating) in headless Chromium and writes poster-001.png, poster-002.png, …
//
//   node batch.js serve                       → open the generator UI at http://localhost:4321
//   node batch.js <count> [BRAND] [seedPrefix] [goal]
//   node batch.js 50 RIZON launch             → out/RIZON/poster-001.png … poster-050.png
//   node batch.js 20 ZELA promo conversion    → only conversion captions
//   node batch.js 20 RIZON contest prize-pool --prize='$25,000' --ends='Jan 15'
//       campaign values: --prize --bonus --giveaway --ends (quote them; $ is special in shells)
//
// Works on a VPS: Chromium runs headless with software WebGL (SwiftShader).
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PORT = 4321;
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".png": "image/png",
  ".webp": "image/webp",
  ".jpg": "image/jpeg",
  ".json": "application/json",
};

function startServer() {
  const server = http.createServer((req, res) => {
    const urlPath = decodeURIComponent(new URL(req.url, "http://x").pathname);
    const file = path.normalize(path.join(ROOT, urlPath === "/" ? "index.html" : urlPath));
    if (!file.startsWith(ROOT + path.sep) || file.includes(`${path.sep}node_modules${path.sep}`) || file.includes(`${path.sep}out${path.sep}`)) {
      res.writeHead(403).end("Forbidden");
      return;
    }
    fs.readFile(file, (err, data) => {
      if (err) {
        res.writeHead(404).end("Not found");
        return;
      }
      res.writeHead(200, { "Content-Type": MIME[path.extname(file)] || "application/octet-stream", "Cache-Control": "no-cache" });
      res.end(data);
    });
  });
  return new Promise((resolve) => server.listen(PORT, "127.0.0.1", () => resolve(server)));
}

async function launchBrowser() {
  const args = ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"];
  try {
    return await chromium.launch({ headless: true, args });
  } catch (err) {
    // Playwright's own Chromium isn't installed → fall back to an installed Google Chrome.
    console.warn("Playwright Chromium not found, trying installed Chrome…");
    return await chromium.launch({ headless: true, channel: "chrome", args });
  }
}

async function main() {
  const argv = process.argv.slice(2);
  const [first = "10", brandArg = "RIZON", prefix = "poster", goal = ""] = argv.filter((a) => !a.startsWith("--"));
  const campaign = {};
  for (const a of argv.filter((x) => x.startsWith("--"))) {
    const m = a.match(/^--(prize|bonus|giveaway|ends)=(.*)$/s);
    if (!m) throw new Error(`Unknown option ${a}. Use --prize= --bonus= --giveaway= --ends=`);
    campaign[m[1]] = m[2];
  }

  if (first === "serve") {
    await startServer();
    console.log(`Poster generator: http://localhost:${PORT}/  (Ctrl+C to stop)`);
    return;
  }

  const count = Math.max(1, Number.parseInt(first, 10) || 10);
  const brand = brandArg.toUpperCase();
  if (!["RIZON", "ZELA"].includes(brand)) throw new Error(`Unknown brand "${brandArg}". Use RIZON or ZELA.`);
  if (goal && !["awareness", "conversion", "trust", "convenience", "prize-pool", "referral", "giveaway", "launch"].includes(goal)) throw new Error(`Unknown goal "${goal}".`);

  const outDir = path.join(ROOT, "out", brand);
  fs.mkdirSync(outDir, { recursive: true });

  const server = await startServer();
  const browser = await launchBrowser();
  const page = await browser.newPage({ viewport: { width: 1400, height: 1100 }, deviceScaleFactor: 1 });
  page.on("pageerror", (e) => console.error("page error:", e.message));
  page.on("console", (m) => m.type() === "error" && console.error("console:", m.text()));

  await page.goto(`http://localhost:${PORT}/index.html?brand=${brand}&batch=1`, { waitUntil: "load", timeout: 90_000 });
  await page.waitForFunction(() => window.posterReady, null, { timeout: 90_000 });
  await page.evaluate(() => window.posterReady);

  const offset = [...prefix].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 7) % 40;
  const manifest = [];
  const started = Date.now();
  for (let i = 1; i <= count; i++) {
    const n = String(i).padStart(3, "0");
    const seed = `${prefix}-${n}`;
    // Running caption index (the generator maps it so every caption appears before any repeats).
    const caption = offset + (i - 1);
    const meta = await page.evaluate(([s, g, c, cv]) => window.renderPoster(s, { goal: g, caption: c, campaign: cv }), [seed, goal, caption, campaign]);
    const dataUrl = await page.evaluate(() => window.posterDataURL());
    const file = path.join(outDir, `poster-${n}.png`);
    fs.writeFileSync(file, Buffer.from(dataUrl.split(",")[1], "base64"));
    manifest.push({ file: path.basename(file), ...meta });
    console.log(`${n}/${String(count).padStart(3, "0")}  ${meta.layout.padEnd(13)} ${meta.background.padEnd(14)} ${meta.phone.padEnd(10)} ${meta.headline}`);
  }
  fs.writeFileSync(path.join(outDir, "manifest.json"), JSON.stringify(manifest, null, 2));
  console.log(`\nDone: ${count} posters in ${((Date.now() - started) / 1000).toFixed(1)}s → ${outDir}`);

  await browser.close();
  server.close();
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
