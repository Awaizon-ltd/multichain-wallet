# Rizon Wallet — browser extension

The desktop companion to the Rizon mobile app: a non-custodial Chromium (Manifest V3) extension for the same EVM chains and Solana. Import the same recovery phrase as the phone app and you get the same accounts. The derivation paths are identical, and tests check them against the mobile app's own library.

## Status

| Phase | What | Status |
|---|---|---|
| 1 | Vault, keys, background service worker, dApp provider (EVM + Solana), approvals | Done |
| 2 | Onboarding, unlock, portfolio, send, receive, activity, settings | Done |
| 3 | Swap and bridge through the Rizon backend (0x, LI.FI, Jupiter) | Done |
| 4 | NFTs, market, Google Drive cloud backup, @username identity | Done (Google sign-in needs the one-time setup below) |

## Load it in Chrome / Edge / Brave

```bash
npm install
npm run build          # typecheck + build into dist/
```
Open `chrome://extensions`, turn on **Developer mode**, click **Load unpacked**, and pick `dist/`.

## Google Drive backup — one-time setup

The backup is wire-compatible with the phone app. It uses the same Firebase project (`rizon-wallet`), the same `backupKeys/{uid}` key and the same Drive `appDataFolder` file. So a phone backup restores on desktop, and the reverse. Google only lets the extension sign in after one setup step:

1. Load the extension. Open **Settings → Cloud backup** and press **Back up**. The error message shows the redirect URI, `https://<extension-id>.chromiumapp.org/`.
2. In Google Cloud Console (project `1072621486591`) → **Credentials** → the **Web client** (`…u9id33f0…`), add that URI under **Authorized redirect URIs**.
3. The extension ID changes between unpacked installs on different machines. After you publish to the Chrome Web Store, register the store ID's URI (or pin the ID with a `"key"` in `manifest.json`).

## How it's built

```
src/
  background/   service worker — the ONLY place keys exist
    vault.ts        PBKDF2-SHA256 (600k) → AES-256-GCM, native WebCrypto
    keyring.ts      EVM m/44'/60'/0'/0/i, Solana m/44'/501'/i'/0' (same as mobile)
    wallet.ts       create/import/unlock/lock/auto-lock/accounts
    evm.ts          EIP-1193 request handling, per-site permissions and chain
    solana.ts       Wallet Standard requests (connect, sign message/tx, sign & send)
    approvals.ts    queue + approval window
    evmTx.ts, solanaSend.ts, swap.ts
    identity.ts     @username linking (challenge signed with EVM + Solana keys)
    cloudBackup.ts  Google OAuth → Firebase REST → Firestore key + Drive appDataFolder
  content/
    contentscript.ts  isolated relay (page ↔ background)
    inpage.ts         EIP-1193 + EIP-6963 + Solana Wallet Standard (8 KB, runs on every page)
  popup/        React UI: popup, approval window, onboarding tab
  shared/       chains (mirrors mobile Chain.js), decoders, domain checks, base58
```

### Security model
- The recovery phrase is encrypted with your password. While the wallet is unlocked, only the derived key is held, and only in `chrome.storage.session` (memory-only and not readable by content scripts). The phrase is decrypted just for each signature.
- Auto-lock after a configurable idle time (15 minutes by default) and on browser restart.
- Sites see nothing until you connect, and then only the accounts you chose. The background identifies each site by the browser-reported origin, never by what the page claims.
- Every connect, signature, transaction and token-add opens an approval window owned by the extension. Closing it rejects the request. A site can queue at most 3 requests.
- The approval screens decode what you're signing and warn about unlimited approvals, `setApprovalForAll`, Permit and Permit2 signatures, Sign-In With Ethereum domain mismatches, transactions that would fail, and look-alike scam domains (a port of the mobile `DomainSecurityChecker`, with punycode detection added). High-risk sites need an extra confirmation.
- `eth_sign` is disabled. Solana message signing refuses bytes that are really a transaction.
- Swaps approve only the exact amount being swapped. (The mobile app approves unlimited; consider changing that there too.)
- Rizon never overwrites `window.ethereum` if another wallet set it first. dApps find Rizon through EIP-6963 and Wallet Standard instead.

## Tests

```bash
npm test                                   # 42 unit/integration tests
npm i --no-save puppeteer-core@24.22.0
node test/e2e/run.mjs dist node_modules    # 29 checks in real Chrome
```
The end-to-end test loads the built extension into Chrome. It imports a wallet through the UI, then runs a local test dApp through EIP-6963 discovery, connect, `personal_sign`, an unlimited-Permit warning, a transaction preview (rejected, never sent), chain switching, Solana Wallet Standard connect and sign, and lock.

## Notes on NFTs
Alchemy's spam filter needs a paid Alchemy plan. The extension instead hides NFTs that Alchemy flags `isSpam`, plus names with link or "claim reward" bait. They stay viewable under "Show hidden", but they can't be sent from Rizon. Arc and Robinhood Chain NFTs aren't indexed by Alchemy yet; the mobile app has the same gap.

## Backend dependency

The portfolio prices tokens through `GET /api/market/token-prices`, which is new in `crypto-backend`. Until that endpoint is deployed, the extension falls back to CoinGecko's public API, which is slower and only prices a few tokens.

## Publishing checklist
- Deploy the backend change above.
- Restrict the Alchemy key in `src/shared/chains.ts` (it's the same key the mobile app ships) to known origins in the Alchemy dashboard.
- Chrome Web Store: privacy policy, screenshots, and a justification for the "read and change data on websites" permission. Wallet content scripts need it to inject the provider.
- External security review before handling real funds at scale.
