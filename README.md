# Awarizon Wallet

A non-custodial, multichain crypto wallet: a React Native (Expo) mobile app backed
by a small Node/Express API. The backend never holds keys or signs anything — it
exists to aggregate data (token lists, prices, swap/bridge quotes) that would
otherwise mean shipping API secrets inside the mobile app.

```
awarizon-wallet/
├── crypto-wallet/     — the mobile app (Expo / React Native)
└── crypto-backend/    — the API it talks to (Express, Postgres, MongoDB)
```

Each package has its own README with setup details:
[crypto-wallet/README.md](crypto-wallet/README.md) ·
[crypto-backend/README.md](crypto-backend/README.md).

For how the pieces fit together — the data/cache layer, multichain support,
swap and bridge aggregation, theming, and the banner CMS — see
[ARCHITECTURE.md](ARCHITECTURE.md).

## What it does

- **Wallet**: HD wallet (BIP-39/32) created and encrypted entirely on-device;
  the backend never sees a private key or seed phrase.
- **Multichain**: Ethereum, Arc, Robinhood Chain, Polygon, BNB Chain, Arbitrum,
  Avalanche, Base (plus their testnets) — see [ARCHITECTURE.md](ARCHITECTURE.md#chains).
  Users pick a primary chain and can enable/disable any of the others.
- **Swap**: same-chain swaps via 0x, with the backend also checking LI.FI and
  serving whichever quotes better.
- **Bridge**: cross-chain transfers/swaps via LI.FI, reachable from the Swap
  tab's second tab.
- **Portfolio**: balances and prices across every enabled chain, with a
  per-token enable/disable list (Manage Tokens) and an intelligent,
  SQLite-persisted cache in front of every RPC/API call so reopening the app
  doesn't re-fetch everything from scratch.
- **dApp browser**: an in-app WebView with EIP-1193 injection so web dApps can
  connect to and request signatures from the wallet.
- **Promotional banners**: a small CMS (Postgres-backed, image included) for
  Home-screen promo content, managed from a local admin page rather than a
  public dashboard — see
  [crypto-backend/admin/banners.html](crypto-backend/admin/banners.html).

## Quick start

**Backend** (needed first — the app expects it running):
```bash
cd crypto-backend
npm install
cp .env.example .env   # fill in DATABASE_URL, ZERO_EX_API_KEY, LIFI_API_KEY
npm run migrate:up     # creates the Postgres tables (wallet schema, swap tracking, banners)
npm run dev
```

**Mobile app**:
```bash
cd crypto-wallet
npm install
# edit config/api.js — BASE_URL must point at your machine's LAN IP,
# not localhost, since the app runs on a phone/simulator, not your laptop
npx expo start
```

See each package's README for the full environment variable list and what
each one is for.

## Known gaps

These are called out here rather than left for someone to discover the hard
way — see [ARCHITECTURE.md](ARCHITECTURE.md) for the reasoning behind each:

- **Wrapped-native token addresses for Arc and Robinhood Chain are not filled
  in.** Both chains are new enough that no verified WETH-equivalent contract
  exists in the token lists yet — guessing an address here risks sending
  funds to the wrong contract, so it was left blank rather than guessed.
- **Solana is defined in constants but not wired up.** `constants/nonEvmChain.js`
  describes Solana as a chain but nothing in the signing/balance layer
  supports a non-EVM keypair yet; it's inert until that's built.
- **A handful of legacy frontend files still exist alongside their
  replacements** (an old on-chain-router swap screen, a duplicate chain
  registry, an unreachable ZetaChain bridge screen). None of them run.
  The backend-side dead code (the staking/pool-sync feature, 15 orphaned
  per-chain token catalogs, two stray Expo config files) has been removed —
  see [crypto-backend/README.md](crypto-backend/README.md).
