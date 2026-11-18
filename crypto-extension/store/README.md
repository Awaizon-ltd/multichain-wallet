# Chrome Web Store assets

## Files to upload (from `store/out/`)

| Store field | File | Size |
|---|---|---|
| Store icon | `icon-128.png` | 128×128 |
| Screenshots (up to 5) | `screenshot-1.png` … `screenshot-5.png` | 1280×800 |
| Small promo tile (required) | `promo-small.png` | 440×280 |
| Marquee promo tile (optional) | `promo-marquee.png` | 1400×560 |

The slides, in order:
1. Portfolio — "All your crypto. One desktop wallet."
2. Swap — "Trade across chains in one click."
3. Scam protection — "Stops scams before you sign."
4. dApp connect — "Connect to any dApp. You approve everything."
5. Market — "Track the market. Pay @usernames."

## Regenerate (after UI changes)

```bash
npm run build
npm i --no-save puppeteer-core@24.22.0
node store/capture.mjs     # real extension screens → store/raw/
node store/compose.mjs     # framed store assets   → store/out/
```

`capture.mjs` runs the built extension in Chrome and replaces only network data: balances, a swap quote, and the demo username `@alex`. Prices come live from the Rizon backend, so all slides agree. The two dApp domains are served locally. `dapp.awarizon.com` shows the "Verified" badge, and `rizon-fix.xyz` is a made-up look-alike that triggers the scam warning.

## Listing text, privacy answers and submission steps

See **[LISTING.md](LISTING.md)**, which follows the dashboard field by field, **[PRIVACY_TAB.md](PRIVACY_TAB.md)** for the Privacy practices tab, and **[PRIVACY_POLICY.md](PRIVACY_POLICY.md)**, a draft to review and host before you submit.
