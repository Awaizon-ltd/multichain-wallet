# crypto-backend

The API the wallet app talks to. It never holds a private key or signs a
transaction — every write it returns (a swap quote, a bridge quote) is an
*unsigned* transaction the app signs on-device. What it's actually for:

- Aggregating 0x + LI.FI so the app doesn't need either provider's secret key
  baked into the mobile bundle.
- Serving per-chain token catalogs and prices (cached, so the app isn't
  hitting CoinGecko directly on every screen).
- The promotional-banner CMS (Postgres, image bytes included).
- Swap history and a small Postgres-backed leaderboard.

Everything here runs on one database — Postgres. There's no MongoDB in this
stack; banners used to be Mongo-backed and were moved onto Postgres (see
migration `003_banners.sql`).

See [../ARCHITECTURE.md](../ARCHITECTURE.md) for how the swap/bridge
aggregation and the banner system actually work.

## Setup

```bash
npm install
cp .env.example .env   # fill in the real values — see below
npm run migrate:up     # Postgres: wallet schema, swap tracking, banners
npm run dev            # nodemon; use `npm start` for a plain node process
```

## Environment variables

| Variable | Used for |
|---|---|
| `PORT` | HTTP port (default `3000`) |
| `DATABASE_URL` | Postgres — wallets/transactions/swap-tracking/banners tables (including banner image bytes) |
| `ZERO_EX_API_KEY` | 0x Swap API (same-chain swap quotes) |
| `ZERO_EX_FEE_RECIPIENT` | Address that receives the swap fee 0x collects on our behalf |
| `LIFI_API_KEY` | LI.FI (cross-chain bridge quotes, and same-chain price aggregation) |
| `LIFI_INTEGRATOR` | Integrator string LI.FI attributes requests to |
| `LIFI_FEE_ENABLED` | `1` to include our fee in LI.FI quotes, unset to omit it |

A `compression` middleware is applied globally in `server.js`, and the swap
endpoints (`/price`, `/price/best`, `/quote`) are rate-limited — they hit
paid 0x/LI.FI calls, so an unlimited client loop would run up API cost, not
just load.

## Adding a chain

Three places, kept in sync by hand with `crypto-wallet/constants/Chain.js`:

1. **`src/config/config.js`** — add the chain id to `chains` and `tokenLists`
   (feeds the generic `/api/tokens/*` browsing endpoints via
   `utils/tokenParser.js`, which reads `src/tokens/<name>.json`).
2. **`src/controllers/swapControllers.js`** — add a `NATIVE_TOKENS[chainId]`
   entry (and `WRAPPED_NATIVE_TOKENS[chainId]` *only* once you have a
   verified contract address — don't guess one) and a
   `TOKEN_LISTS[chainId]` pointing at a new `src/tokenLists/<chain>.js` file.
3. If the chain is new enough that CoinGecko doesn't index it as a
   "platform" yet, contract-address price lookups will just fail closed and
   fall back to the symbol-based lookup in `coingecko.js` — no code change
   needed, just don't expect contract-address lookups to work until
   CoinGecko catches up.

## Structure

```
src/
├── controllers/    — per-feature request handling (swap, bridge, banners, tokens, market)
├── services/       — lifiService, marketService, swapTrackingService, walletService
├── routes/         — one Express router per feature, mounted in server.js
├── config/         — pool.js (Postgres), config.js (chain/token-list config)
├── migrations/     — run via scripts/migrate.js — see below
├── tokenLists/      — curated ERC-20 lists per chain (swapControllers' getTokenList)
└── tokens/         — broader per-chain catalogs for /api/tokens (tokenParser.js)
```

## Migrations

```bash
npm run migrate:up     # every pending migration, in order
npm run migrate:down   # roll back every migration, reverse order
node src/scripts/migrate.js up 2      # a single migration by id, if you need it
```

The registry lives in `src/scripts/migrate.js` — add new migrations there,
never reorder or remove existing entries. `migrate:up` used to be hardcoded
to stop at migration id `2`, silently never creating the `banners` table
(migration `3`) — fixed to run everything pending by default.

## The banner admin tool

`admin/banners.html` is a plain local file — open it directly in a browser
on the same machine or LAN as this server (not hosted anywhere). It talks to
`/api/banners`'s existing CRUD endpoints; nothing was added to the API for
it. See [../ARCHITECTURE.md](../ARCHITECTURE.md#promotional-banners) for why
it's a local file rather than a hosted page.
