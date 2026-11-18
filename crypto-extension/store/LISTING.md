# Chrome Web Store submission — Rizon Wallet

Everything the Developer Dashboard asks for, in the order it asks. Text in code blocks is ready to paste. Replace `[BRACKETED]` placeholders with your own details before you submit.

**Upload package:** `rizon-wallet-0.1.0.zip`. Create it with `npm run build && npm run zip`; `manifest.json` sits at the zip root. Don't upload `dist.zip`: it nests everything in a `dist/` folder and the store rejects it.

---

## 0. Before you start (one-time)

| Item | What to do |
|---|---|
| Developer account | Register at https://chrome.google.com/webstore/devconsole. One-time US$5 fee. Use a company Google account, not a personal one. |
| Publisher name | `Awarizon` (shown on the listing). |
| Contact email | Account → Contact email. Must be verified. Use a support inbox, e.g. `[support@awarizon.com]`. |
| Trader status (EU DSA) | Account → Trader declaration. As a company offering a product, declare **Trader**. Your business address, email and phone are then shown publicly on the listing. |
| Verified site (recommended) | Verify `awarizon.com` in Google Search Console with the same Google account. You can then set it as the **Official URL**, which shows a verified-publisher badge. |
| Privacy policy | Built into the Rizon website at `https://rizon.awarizon.com/privacy`. Fill in its placeholders and have it reviewed before you deploy. |
| Version | Consider setting `"version": "1.0.0"` in `manifest.json` for the public launch. Each later upload must have a higher version. |

---

## 1. Package tab
Upload `rizon-wallet-0.1.0.zip`. The dashboard reads these from the manifest (to change them, edit `manifest.json` and re-upload):

- **Name:** `Rizon Wallet`
- **Summary (132 characters max):** `Self-custody crypto wallet for Ethereum, Base, Arc, Robinhood Chain & Solana. Swap, bridge and connect to dApps safely.` (119 characters)
- **Icon:** `icons/icon128.png`

---

## 2. Store listing tab

### Description (16,000 characters max)
```
Rizon brings your crypto wallet to the desktop. It's the same wallet as the Rizon mobile app — import your recovery phrase and you'll see the same accounts, on your phone and in your browser.

ONE WALLET, EVERY NETWORK
• Ethereum, Base, Arc, Robinhood Chain, Polygon, BNB Chain, Arbitrum, Avalanche and Solana
• One EVM address for every EVM network, plus your Solana address — from a single recovery phrase
• Live portfolio value with balances and prices across all your networks

SWAP AND BRIDGE
• Swap tokens on any supported network at the best available price
• Bridge between networks — including EVM to Solana — in a single transaction
• See the minimum you'll receive, price impact and route before you confirm
• Token approvals are for the exact amount you're swapping, never unlimited

CONNECT TO WEB3 APPS
• Works with Ethereum and Solana apps that support browser wallets
• Websites only see the account you choose to share
• Every connection, signature and transaction waits for your approval
• Rizon doesn't take over other wallets you have installed

SCAM PROTECTION BUILT IN
• Look-alike and impersonation domains are flagged before you connect
• Unlimited token approvals and "Permit" signatures — a common way wallets get drained — are explained in plain English
• Transactions are simulated first, so you're warned if one would fail
• The dangerous eth_sign method is disabled
• Scam NFT airdrops are hidden automatically

SEND THE EASY WAY
• Send to @usernames instead of long addresses
• Claim your own @username, linked to both your EVM and Solana addresses
• QR codes for receiving

MORE
• Market: trending tokens, gainers and losers, with price charts
• NFTs: view and send your collectibles
• Encrypted Google Drive backup, compatible with the Rizon mobile app
• Multiple accounts, auto-lock, dark and light themes

SELF-CUSTODY
Your recovery phrase is encrypted with your password and stored only on your device. Your keys never leave your computer, and nobody — including Awarizon — can move your funds or recover your wallet for you. Keep your recovery phrase safe and never share it.
```

### Category
**Productivity → Tools**. Most wallets are listed here. An alternative is *Make Chrome Yours → Privacy & Security*.

### Language
English

### Graphic assets (all in `store/out/`)
| Field | File | Size |
|---|---|---|
| Store icon | `icon-128.png` | 128×128 |
| Screenshot 1 | `screenshot-1.png` (Portfolio) | 1280×800 |
| Screenshot 2 | `screenshot-2.png` (Swap) | 1280×800 |
| Screenshot 3 | `screenshot-3.png` (Scam protection) | 1280×800 |
| Screenshot 4 | `screenshot-4.png` (Connect to dApps) | 1280×800 |
| Screenshot 5 | `screenshot-5.png` (Market) | 1280×800 |
| Small promo tile | `promo-small.png` | 440×280 |
| Marquee promo tile | `promo-marquee.png` | 1400×560 |
| Promo video | Optional: a YouTube link | — |

### Additional fields
| Field | Value |
|---|---|
| Official URL | `https://rizon.awarizon.com`. Verify `awarizon.com` as a Domain property in Google Search Console, which covers the `rizon.` subdomain, then pick it from the Official URL list. |
| Homepage URL | `https://rizon.awarizon.com` |
| Support URL | `https://rizon.awarizon.com/#faq`, or a `mailto:` support address |
| Mature content | No |

---

## 3. Privacy practices tab

### Single purpose
```
Rizon Wallet is a self-custody cryptocurrency wallet. It lets users hold, send, receive and swap crypto assets on Ethereum-compatible networks and Solana, and connect their wallet to decentralized applications with their explicit approval.
```

### Permission justifications

**storage**
```
Stores the user's wallet on their own device: the password-encrypted recovery phrase, public account addresses, settings, the list of websites the user has connected, and transaction history. While the wallet is unlocked, the encryption key is held in session storage (memory only) so the user doesn't have to re-enter their password for every action.
```

**alarms**
```
Runs a check once a minute to automatically lock the wallet after the user-configured period of inactivity, so an unattended computer can't be used to move funds.
```

**identity**
```
Used only when the user chooses to back up or restore their wallet with Google Drive. It signs the user in to Google with access to the extension's own hidden app-data folder (drive.appdata), where an encrypted backup of the recovery phrase is stored. Rizon can't see any other files in the user's Drive.
```

**Host permissions / content scripts (http://*/*, https://*/*)**
```
A cryptocurrency wallet must be available to every decentralized application the user visits. The content scripts inject the standard wallet interfaces (EIP-1193 / EIP-6963 for Ethereum networks and the Wallet Standard for Solana) so websites can ask to connect. The scripts don't read, collect or modify page content. A website receives no data until the user approves a connection in Rizon's own approval window, and every signature or transaction also requires the user's approval.
```

### Remote code
Select **"No, I am not using remote code."**
```
All JavaScript is bundled in the extension package. The extension only fetches data (JSON: balances, prices, token lists, swap quotes) from network APIs; it never downloads or executes code.
```

### Data usage
Under "What user data do you plan to collect from users now or in the future?", tick:

| Data type | Tick? | Why |
|---|---|---|
| Personally identifiable information | ✅ | The Google account email (only if the user turns on Drive backup) and the optional @username the user claims. |
| Health information | ❌ | |
| Financial and payment information | ✅ | Public wallet addresses, balances and transaction details are sent to blockchain nodes and Rizon's API to show balances, price assets, build swaps and record swap history. |
| Authentication information | ✅ | The recovery phrase, encrypted on the device, is stored in the user's own Google Drive app-data folder only if the user turns on backup. The password never leaves the device. |
| Personal communications | ❌ | |
| Location | ❌ | |
| Web history | ❌ | Origins of connected sites are stored only on the device and never transmitted. |
| User activity | ❌ | |
| Website content | ❌ | |

Then tick all three certifications. They're true for this codebase:
- ✅ I do not sell or transfer user data to third parties, outside of the approved use cases
- ✅ I do not use or transfer user data for purposes that are unrelated to my item's single purpose
- ✅ I do not use or transfer user data to determine creditworthiness or for lending purposes

> The first certification allows transfers needed to provide the feature, such as sending a wallet address to a blockchain node to read its balance. Make sure the privacy policy names these services (the draft does).

### Privacy policy URL
`https://rizon.awarizon.com/privacy`. This is the website's built-in policy page.

---

## 4. Distribution tab

| Setting | Recommendation |
|---|---|
| Payments | Free |
| Visibility | First release as **Unlisted** (installable by link) or **Private → trusted testers**. Switch to **Public** after real-world testing. |
| Regions | All regions. Exclude any where you can't offer crypto services, based on your legal advice. |

---

## 5. Notes for review

Wallet extensions get extra scrutiny. These help them pass:

- **Broad host access** triggers in-depth review, which can take several days to a few weeks. The justification above explains it. Don't add `host_permissions` you don't need; the extension currently has none.
- **Remote code:** none. Keep it that way: no `eval`, and no scripts loaded from a CDN.
- **The listing must match the extension.** Screenshots are real UI. Describe only features that work in the submitted build. Google Drive backup works once its OAuth client is configured (step 6).
- **No misleading claims.** Avoid "unhackable", "100% safe" or "guaranteed" wording. The copy above avoids them.
- If the dashboard has a test-instructions field, paste:
```
No account is needed to review. Open the extension, choose "Create a new wallet", set any password, and back up the 12-word phrase shown. To test dApp connection, visit any Ethereum dApp (e.g. a testnet faucet) and click Connect; Rizon opens an approval window. Testnets (Base Sepolia, Ethereum Sepolia) can be enabled in Settings → Networks → Show testnets.
```

---

## 6. After the first upload

1. **Copy the extension ID** from the dashboard. Store installs get a fixed ID that differs from your unpacked ID.
2. **Google Drive backup:** in Google Cloud Console (project `1072621486591`) → Credentials → the Web client (`1072621486591-u9id33f0…`), add `https://<STORE-EXTENSION-ID>.chromiumapp.org/` as an authorized redirect URI. Also set the OAuth consent screen's app name, logo and privacy-policy URL. Verify the `drive.appdata` scope with Google if it asks.
3. **Restrict the Alchemy key** (`src/shared/chains.ts`) to the domains and origins you use, in the Alchemy dashboard.
4. **Deploy the backend** `GET /api/market/token-prices` endpoint, so the portfolio prices every token quickly.
5. **Updates:** bump `version` in `manifest.json`, then run `npm run build && npm run zip` and upload the new zip.
