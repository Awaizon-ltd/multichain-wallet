# crypto-wallet

The mobile app — Expo/React Native. Non-custodial: the seed phrase and every
private key are generated and encrypted on-device (`utils/Encryption.js`,
`utils/Wallet.js`); the backend never receives either.

See [../ARCHITECTURE.md](../ARCHITECTURE.md) for how the cache layer,
multichain support, swap/bridge aggregation, theming, and token management
actually work — this file is setup and structure only.

## Setup

```bash
npm install
npx expo start
```

Before running on a device or simulator, edit **`config/api.js`** —
`API_CONFIG.BASE_URL` must be your computer's LAN IP (e.g.
`http://192.168.1.42:3000/api`), not `localhost`. The app runs on a phone or
a simulator, which is a different network host than the machine running the
backend, even on the same laptop.

The crypto-backend (see [../crypto-backend/README.md](../crypto-backend/README.md))
needs to be running before most screens will load anything.

## Structure

```
crypto-wallet/
├── screens/         — one folder per area: auth/, wallet/, swap/, settings/, loading/
├── components/       — shared UI; components/wallet, components/swap, components/common
├── contexts/         — WalletContext, ChainContext, ThemeContext, LoadingContext, AlertContext
├── hooks/            — usePortfolioAssets, useSwap, useBridge, useWalletConnect, etc.
├── services/         — apiClient (backend calls), coingecko, blockchain (legacy, see below)
├── utils/
│   ├── blockchain/   — Balances.js, Providers.js, NFTs.js, Transaction.js, Gas.js — the
│   │                   canonical, cached RPC layer everything should read through
│   ├── cache/        — DataCache, CacheStore, SqlitePersistence, Multicall, RequestQueue
│   ├── errors/       — humanizeError
│   └── security/     — DomainSecurityChecker (dApp browser domain allowlisting)
├── constants/        — Chain.js (SUPPORTED_CHAINS), Theme.js, Config.js, PaymentToken.js
└── navigation/        — AppNavigator.js (React Navigation stack + tab structure)
```

## Adding a chain

1. Add an entry to `constants/Chain.js`'s `SUPPORTED_CHAINS` — `id`, `name`,
   `symbol`, `nativeTokenName`, `rpcUrl`, `explorer`, `icon`, `testnet`.
2. Add the matching native/wrapped-native token definitions and a
   `tokenLists/<chain>.js` file on the backend (see
   [../crypto-backend/README.md](../crypto-backend/README.md)).
3. If Alchemy doesn't yet support the chain's enhanced APIs (NFTs, asset
   transfers — true for any very new chain), add its id to
   `CHAINS_WITHOUT_NFT_API_SUPPORT` in `utils/blockchain/NFTs.js` and
   `MANUAL_FETCH_CHAINS` in `utils/blockchain/Transaction.js` so those
   features fall back to manual RPC/explorer-API calls instead of erroring.
4. If the chain has Multicall3 deployed at the canonical address (true for
   almost every EVM chain), add its id to `MULTICALL3_CHAINS` in
   `utils/cache/Multicall.js` so token balances batch instead of firing one
   RPC call per token.

## Known-incomplete pieces

- `constants/nonEvmChain.js` describes Solana as a chain, but nothing in the
  signing or balance layer supports a non-EVM keypair — it's declarative only
  right now.
- Wrapped-native token addresses for Arc and Robinhood Chain aren't filled in
  anywhere (frontend or backend) — left blank rather than guessed, since
  both chains are too new to have a verified address to point at yet.
