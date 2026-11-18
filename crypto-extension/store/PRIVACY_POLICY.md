# Rizon Wallet — Privacy Policy

*DRAFT. Have this reviewed by your legal adviser before publishing. Replace the `[BRACKETED]` placeholders.*

**Last updated:** [DATE]

Rizon Wallet ("Rizon", "we") is a self-custody cryptocurrency wallet published by [Awarizon legal entity name], [registered address] ("Awarizon"). This policy covers the Rizon browser extension and explains what data it handles, why, and who it's shared with.

## 1. The short version
- Your recovery phrase and private keys are encrypted with your password and stored **only on your device**. We never receive them, and we can't recover your wallet.
- To show balances and build transactions, Rizon sends your **public wallet addresses** to blockchain service providers and to our API. Wallet addresses and blockchain transactions are public by nature.
- Google Drive backup and @usernames are **optional**. They only share data if you turn them on.
- We don't sell your data, show ads, or track the websites you visit.

## 2. Data stored only on your device
These stay in your browser's extension storage and are never sent to us:
- Your recovery phrase, encrypted with your password (PBKDF2-SHA256 + AES-256-GCM). Your password is never stored or transmitted.
- Public account addresses and account names.
- Settings (networks, auto-lock time, theme).
- The websites you've connected Rizon to.
- The history of transactions made with Rizon.
- Cached balances, prices and token lists.

Removing the wallet in Settings, or uninstalling the extension, deletes this data from your device.

## 3. Data sent off your device, and why

| Data | Sent to | Purpose |
|---|---|---|
| Public wallet addresses; signed transactions you approve | Blockchain node providers (Alchemy, and the public RPC endpoints of Arc and Robinhood Chain) | Read balances, NFTs and transaction status; broadcast transactions you approve. |
| Public wallet addresses, token addresses, swap or bridge amounts | Awarizon API (`api.awarizon.com`), which gets quotes from 0x, LI.FI and Jupiter | Token lists, prices, swap and bridge quotes. |
| Wallet address, tokens and amounts of completed same-network swaps, transaction hash | Awarizon API | Swap history and statistics, as in the Rizon mobile app. |
| Token identifiers | CoinGecko (directly or via the Awarizon API) | Market prices and charts. |
| Your chosen @username, your EVM and Solana addresses, and ownership signatures (only if you claim a username) | Awarizon API | Link your username to your addresses so others can send to you by name. Usernames and their linked addresses are public. |
| Google account identifier and email; your recovery phrase encrypted on your device (only if you turn on Google Drive backup) | Google (Google Sign-In, Firebase Authentication, Cloud Firestore, Google Drive) | Store an encrypted backup. The encrypted phrase goes to a hidden app-data folder in **your own** Drive, and a random decryption key is stored in your Rizon (Firebase) account. Rizon can't access any other Drive files. |

When you connect Rizon to a website, that website receives your public address and the transactions you choose to sign. The website's own privacy policy applies to that.

Like any internet service, providers may receive your IP address when Rizon contacts them. Awarizon doesn't use it to identify or track you.

## 4. What we don't do
- We don't collect your browsing history or the contents of the websites you visit.
- We don't sell, rent or trade personal data.
- We don't use your data for advertising, profiling or credit decisions.
- We don't run remote code in the extension.

## 5. Retention
- **On your device:** kept until you remove the wallet or uninstall the extension.
- **Usernames:** kept while linked. Contact us to remove one.
- **Swap history:** [RETENTION PERIOD, e.g. kept while the service operates].
- **Google Drive backup:** kept in your Drive until you delete it (Settings → Cloud backup → Delete) or remove it from your Google account.

## 6. Security
Your keys are encrypted on your device and decrypted only to sign a request you approve. The wallet auto-locks after inactivity. No system is perfectly secure. Protect your device, use a strong password, keep your recovery phrase offline, and enable 2-step verification on your Google account if you use Drive backup.

## 7. Your choices and rights
You can use Rizon without a username or a Drive backup. Depending on where you live, you may have rights to access, correct or delete personal data we hold, which is limited to usernames and swap history. Contact us at [privacy@awarizon.com]. Data recorded on public blockchains can't be changed or deleted by anyone.

## 8. Children
Rizon isn't intended for anyone under 18 [or the age of majority where you live].

## 9. Changes
We'll update this page and the "Last updated" date if this policy changes. Significant changes will be announced in the extension or on our website.

## 10. Contact
[Awarizon legal entity name]
[Address]
[privacy@awarizon.com]
https://rizon.awarizon.com
