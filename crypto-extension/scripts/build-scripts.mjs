// Bundles the non-UI extension entry points with esbuild:
//   background.js     — MV3 service worker (ES module)
//   contentscript.js  — isolated-world relay between the page and the background
//   inpage.js         — main-world EIP-1193 / EIP-6963 / Wallet Standard provider
// and copies manifest.json into dist/.
import { build, context } from "esbuild";
import { copyFileSync, mkdirSync, readFileSync } from "node:fs";

const watch = process.argv.includes("--watch");
const common = {
  bundle: true,
  minify: !watch,
  sourcemap: false,
  target: "es2022",
  platform: "browser",
  legalComments: "none",
  define: {
    "process.env.NODE_ENV": JSON.stringify(watch ? "development" : "production"),
    global: "globalThis",
    // Wallet icon for EIP-6963 / Wallet Standard (must be a data: URI).
    __RIZON_ICON__: JSON.stringify("data:image/png;base64," + readFileSync("public/icons/icon48.png").toString("base64")),
  },
  logLevel: "info",
};

const entries = [
  { entryPoints: ["src/background/index.ts"], outfile: "dist/background.js", format: "esm" },
  { entryPoints: ["src/content/contentscript.ts"], outfile: "dist/contentscript.js", format: "iife" },
  { entryPoints: ["src/content/inpage.ts"], outfile: "dist/inpage.js", format: "iife" },
];

mkdirSync("dist", { recursive: true });
copyFileSync("manifest.json", "dist/manifest.json");

if (watch) {
  for (const e of entries) (await context({ ...common, ...e })).watch();
} else {
  await Promise.all(entries.map((e) => build({ ...common, ...e })));
}
