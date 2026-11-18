# Poster generator

Seeded 3D marketing posters (1024 × 1024 PNG) for **Rizon** and **Zela Pay**. Three.js renders the scene; the copy is drawn on a 2D canvas on top so text stays sharp.

## Files
- `index.html`: the UI (seed, brand, goal, Generate, Download PNG) and the canvas.
- `generator.js`: brands, the 128-caption bank, seeded RNG, 15 backgrounds, 3D elements, phone mockup, 8 layouts, the copy layer and capture. Change `const BRAND` at the top to switch the default brand.
- `batch.js`: a static server plus a Playwright batch export.
- `assets/`: the Rizon mark, chain logos, Rizon app screenshots and the Google Play badge.

## Run (local)
```
cd rizon/poster-generator
npm install
npx playwright install chromium
node batch.js serve
```
Open http://localhost:4321.

## Batch export
```
node batch.js 50 RIZON launch
node batch.js 30 ZELA promo
node batch.js 20 RIZON ads conversion
```
The arguments are `<count> <BRAND> <seedPrefix> [goal]`. Output goes to `out/<BRAND>/poster-001.png …` plus `manifest.json`, which records each poster's seed, layout, background and caption. A batch uses every caption once before any repeats. The same arguments always produce the same images.

## VPS (Ubuntu)
```
npm install
npx playwright install --with-deps chromium
node batch.js 100 RIZON launch
```
Chromium runs headless with software WebGL (SwiftShader), so no GPU is needed. If Playwright's Chromium isn't installed, `batch.js` falls back to an installed Google Chrome.

## Goals and campaigns
Brand goals: `awareness`, `conversion`, `trust`, `convenience`. Campaign goals: `prize-pool`, `referral`, `giveaway`, `launch`. Pick one in the UI's Goal menu, or pass it as the last batch argument:
```
node batch.js 20 RIZON contest prize-pool
node batch.js 20 RIZON invite referral
```
Campaign captions fill in `{prize}`, `{bonus}`, `{giveaway}` and `{ends}`. Set them per run:
- **UI:** the Campaign fields (Prize pool, Referral bonus, Giveaway, Ends). Empty fields use the brand default.
- **Batch:** `--prize= --bonus= --giveaway= --ends=`. Quote the values, because `$` is special in shells:
  ```
  node batch.js 20 RIZON contest prize-pool --prize='$25,000' --ends='Jan 15'
  node batch.js 20 RIZON invite referral --bonus='$10 in USDC'
  ```
The brand defaults live in each brand's `campaign` object in `generator.js`. They are placeholders, so always set real values before publishing.

## Adding content
- **Captions:** add `cap(goal, "Headline with *accent words*", "Support line", "CTA", hero, phone)` to a brand's `captions`. `hero` is one of `coin shield wallet card bolt check chain nodes trophy gift`. `phone` is `null` or one of `app-wallet app-trade app-swap app-market app-receive app-dapp` (real Rizon screenshots; `app-market`, `app-receive` and `app-dapp` pick from several), or a drawn screen: `balance success checkout qr send`. Coins only show the chains a caption names (Robinhood, Solana, Base, Arc, Ethereum/EVM); captions that name none get neutral $ and Rizon coins. A CTA of `"PLAY"` renders the Google Play badge.
- **Brand:** each brand object holds its name, five-colour palette, logo text, tagline, domain, materials, bloom and colour grade.
