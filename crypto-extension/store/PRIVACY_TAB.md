# Chrome Web Store — Privacy practices tab (Rizon Wallet)

Copy each block into the matching field, in the order the dashboard shows them. Every field allows 1,000 characters at most; the count for each block is shown. Answers match `manifest.json` (`storage`, `alarms`, `identity` and content scripts on `http://*/*`, `https://*/*`) and `PRIVACY_POLICY.md`.

---

## Single purpose

**Single purpose description** (239 / 1,000)
```
Rizon Wallet is a self-custody cryptocurrency wallet. It lets users hold, send, receive and swap crypto assets on Ethereum-compatible networks and Solana, and connect their wallet to decentralized applications with their explicit approval.
```

---

## Permission justification

**storage justification** (418 / 1,000)
```
Stores the user's wallet on their own device: the password-encrypted recovery phrase, public account addresses, settings, the list of websites the user has connected, and transaction history. While the wallet is unlocked, the encryption key is held in session storage (memory only, cleared when the browser closes) so the user doesn't have to re-enter their password for every action. Nothing in storage is sent to us.
```

**alarms justification** (210 / 1,000)
```
Runs a check once a minute to automatically lock the wallet after the user-configured period of inactivity (15 minutes by default), so an unattended computer can't be used to approve transactions or move funds.
```

**identity justification** (397 / 1,000)
```
Used only when the user chooses to back up or restore their wallet with Google Drive. It signs the user in to Google with access to the extension's own hidden app-data folder (drive.appdata scope), where a backup of the recovery phrase, encrypted on the device, is stored. Rizon can't see or access any other files in the user's Drive. Users who don't turn on backup never trigger this permission.
```

**Host permission justification** (620 / 1,000)
```
The content scripts run on http and https pages because a cryptocurrency wallet must be available to every decentralized application (dApp) the user visits. They inject the standard wallet interfaces (EIP-1193 and EIP-6963 for Ethereum networks, the Wallet Standard for Solana) so websites can ask to connect. The scripts don't read, collect or change page content, and don't send any page data anywhere. A website receives nothing until the user approves a connection in Rizon's own approval window, and every signature or transaction also requires the user's approval. The extension declares no other host permissions.
```

---

## Data usage

**What user data do you plan to collect from users now or in the future?**

| Checkbox | Tick? | Why |
|---|---|---|
| Personally identifiable information | ✅ **Yes** | Optional only. The Google account email, if the user turns on Drive backup, and the @username they choose to claim. |
| Health information | ❌ No | Not handled. |
| Financial and payment information | ✅ **Yes** | Public wallet addresses, balances and transaction details are sent to blockchain nodes and Rizon's API to show balances, price assets and build swaps; completed swaps are recorded for swap history. |
| Authentication information | ✅ **Yes** | Optional only. The recovery phrase, encrypted on the device, is stored in the user's own Google Drive app-data folder if they turn on backup. The password never leaves the device. |
| Personal communications | ❌ No | Not handled. |
| Location | ❌ No | No location data is collected. Service providers receive the IP address as part of any internet request, but Rizon doesn't collect it or use it to locate users. |
| Web history | ❌ No | The origins of sites the user connects are stored only on the device and never transmitted. |
| User activity | ❌ No | No click, scroll, keystroke or network monitoring. |
| Website content | ❌ No | Content scripts don't read page content. |

**Certifications** (all three must be ticked; all three are true for this codebase):
- ✅ I do not sell or transfer user data to third parties, outside of the approved use cases
- ✅ I do not use or transfer user data for purposes that are unrelated to my item's single purpose
- ✅ I do not use or transfer user data to determine creditworthiness or for lending purposes

> Sending a wallet address to a blockchain node or swap provider to deliver the feature counts as an approved use case. The privacy policy names every such service.

---

## Privacy policy

**Privacy policy URL** (up to 2,048 characters)
```
https://rizon.awarizon.com/privacy
```

Before you submit:
1. Fill the `[BRACKETED]` placeholders in `store/PRIVACY_POLICY.md`: legal entity name, address, contact email, retention period and date. Have it reviewed.
2. Deploy the Rizon website (`rizon/website`) to rizon.awarizon.com. The policy page is built in at `/privacy`, so the URL above goes live with the site.
3. Paste that exact URL above. It must load without a login, and its content must match the data-usage answers in this file.

---

## Remote code (asked on the same tab in some dashboard versions)

Select **"No, I am not using remote code."** (186 / 1,000)
```
All JavaScript is bundled in the extension package. The extension only fetches data (JSON: balances, prices, token lists, swap quotes) from network APIs; it never downloads or runs code.
```

---

## Quick checklist
- [ ] Single purpose pasted
- [ ] 4 justifications pasted (storage, alarms, identity, host)
- [ ] Data usage: ticked PII, Financial and Authentication only
- [ ] All 3 certifications ticked
- [ ] Privacy policy published and URL pasted
- [ ] Remote code: "No"
