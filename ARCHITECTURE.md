# Architecture

This is the deeper reference for how the wallet's major systems work and,
more importantly, *why* they're built the way they are — the tradeoffs, the
things that turned out to be bugs along the way, and what's still incomplete.
[README.md](README.md) is the entry point; this is what to read before
changing any of the systems below.

## Contents

- [Chains](#chains)
- [Data layer: the cache everything routes through](#data-layer)
- [Swap and Bridge](#swap-and-bridge)
- [Token management](#token-management)
- [Theming](#theming)
- [Promotional banners](#promotional-banners)
- [Backend structure](#backend-structure)

---

## Chains

`crypto-wallet/constants/Chain.js` is the single source of truth for every
chain the wallet supports — `SUPPORTED_CHAINS` is a plain object (deliberately
free of imports beyond the bare `react-native` package, to avoid circular
dependencies with the contexts/services that import it in turn). Each entry
carries `id`, `name`, `symbol`, `nativeTokenName`, `rpcUrl`, `explorer`,
`icon`, and `testnet`.

**Supported today**: Ethereum, Arc, Robinhood Chain, Polygon, BNB Chain,
Arbitrum, Avalanche, Base, plus the Base and Ethereum Sepolia testnets.

`nativeTokenName` exists separately from `name` because a native asset row
shows the *token's* name (e.g. "Ethereum", "USDC") with the *chain's* logo —
so a Robinhood Chain balance reads "Ethereum" with the Robinhood logo next to
it, not "Robinhood Chain" as if that were the asset itself.

**Arc and Robinhood Chain** are both very new (Arc's mainnet opened September
2026; Robinhood Chain's in July 2026) — their RPC URLs, explorers, and chain
IDs were verified against their own docs and LI.FI/0x's own announcements of
day-one support, not guessed. What wasn't verified — a wrapped-native
contract address for either chain — was left out rather than guessed, since a
wrong address here means funds sent to the wrong contract.

`DEFAULT_CHAIN` is the one the wallet opens to and treats as primary
(currently Arc). `ChainContext.js` resolves it, tracks which chains the user
has enabled for their portfolio (`enabledChainIds`, defaulting to every
mainnet chain), and exposes `toggleNetwork()` for `NetworkManager.js`'s
per-chain switches. Changing the primary chain is a one-line change to
`DEFAULT_CHAIN` — everything downstream (the "Primary" badge in
`ChainSwitcher.js`, the initial active chain) reads that constant rather than
hardcoding a chain id.

---

## Data layer

**The single biggest thing to understand about this codebase**: almost every
read (RPC balance calls, backend REST calls, CoinGecko prices) and several
writes route through one cache, not because it was convenient but because
the alternative was measured — this app used to make an uncached Alchemy
request *per chain, per token, per screen mount*, and that's what actually
made it slow and what actually cost money in RPC credits.

### The cache itself

`utils/cache/DataCache.js` is a stale-while-revalidate cache: `withCache(key,
ttl, fetcher, opts)` returns cached data instantly if it's fresh, returns
*stale* data instantly while quietly refetching in the background if it's
expired, and only actually awaits the network on a true cold miss. Every TTL
is a deliberate choice, not a default — see the `TTL` export for the exact
numbers and why (native balances at 30s because they change right after a
send; token catalogs at 10 minutes because they almost never change).

Underneath it: `utils/cache/CacheStore.js` is two levels — an in-memory `Map`
for synchronous, zero-latency reads (L1), and `utils/cache/SqlitePersistence.js`
(L2), which is SQLite rather than AsyncStorage. That distinction matters: the
original AsyncStorage version stored the *entire* cache as one JSON blob
under one key, so every single write re-serialized and rewrote everything
ever cached. SQLite makes a write touch only the rows that changed, and it's
the same database (WAL mode) the app already opens for wallets/tokens/contacts
— no second storage engine. `RequestQueue.js` deduplicates concurrent
requests for the same key, so a portfolio load that would've fired the same
request eight times across eight chains fires it once.

### What actually got faster

- **`utils/blockchain/Balances.js`** is the canonical, cached RPC layer
  (`getNativeBalance`, `getTokenBalance`, `getAllTokenBalances`). Two other
  modules used to duplicate this with zero caching and a *different*
  hardcoded Alchemy key: `utils/Wallet.js`'s `getAllBalances` (called on
  every Home mount) and `services/blockchain.js` (feeding the send/import/
  confirm screens). Both now delegate to `Balances.js` instead of calling
  `provider.getBalance()`/a raw contract call directly.
- **`hooks/usePortfolioAssets.js`** used to fetch each enabled token's balance
  with its own `eth_call` — one RPC request per token, per chain, every
  portfolio load. It now calls `utils/cache/Multicall.js`'s
  `batchGetTokenBalances`, which batches every token on a chain into a single
  Multicall3 `aggregate3` call (falling back to individual calls only on a
  chain without Multicall3 deployed, or if the batch call itself fails).
- **`utils/blockchain/NftsCache.js`** used to be its own in-memory-only cache
  with a 5-minute TTL that reset on every app restart — meaning a full
  Alchemy NFT sweep across every supported chain on every cold launch. It's
  now a thin shim over the real cache (same `withCache` signature, so
  `NFTs.js`'s call sites never had to change), which means it now persists
  across restarts too.
- **The Home screen skeleton** used to show on every mount and on every
  balance refresh, even when there was already something on screen, because
  `usePortfolioAssets` set `loading = true` unconditionally at the top of
  every fetch. It now persists the fully-assembled portfolio (native +
  token assets, totals) to the cache after every load and paints that
  instantly on the next mount — even across an app restart — while a fresh
  fetch runs quietly behind it. `loading` only flips to `true` when there is
  truly nothing to show yet.

### The backend side

`services/apiClient.js` is the equivalent for REST calls to the backend:
`apiGet` is cached the same stale-while-revalidate way (pass `ttl: 0` to
opt out for anything single-use and time-sensitive, like a swap quote or a
bridge-status poll); `apiMutate` dedupes POST/PUT/DELETE calls and can
declare which cached GET paths to invalidate on success. Every thrown error
is already run through `humanizeError` before it reaches a screen.

### Errors

`utils/errors/humanizeError.js` is the one place that turns whatever an RPC
provider, fetch, or the backend throws into `{ title, message, type }` —
network/timeout, insufficient funds, a rejected signature, rate-limiting, "no
route found", and so on. `apiClient.js` and the bridge/swap execution paths
route through it instead of showing `err.message` raw. It's additive — an
error that's already in that shape (thrown by, say, `useBridge.js`) passes
through unchanged.

---

## Swap and Bridge

**Same-chain swap** (`hooks/useSwap.js`, `screens/swap/SwapNewSCreen.js`) is
still 0x's Allowance Holder API for pricing and execution
(`crypto-backend/src/controllers/swapControllers.js`). What's new is
`getBestPrice` on the backend: it calls 0x *and* LI.FI for the same pair
concurrently (`Promise.allSettled`, so one failing doesn't fail the other)
and returns whichever quotes more `buyAmount`, tagged with which source won.
Execution still goes through 0x's own quote — LI.FI is currently
aggregation-for-pricing only, not a second execution path, to avoid two
different transaction-signing shapes on one swap.

**Cross-chain bridging** (`hooks/useBridge.js`,
`screens/swap/BridgeScreen.js`) is LI.FI end to end, replacing what used to
be a hardcoded Ethereum⇄Mantle OP-stack bridge (`@mantleio/sdk`, a specific
`L1StandardBridge` contract). One LI.FI `/quote` call covers both an actual
bridge (same asset, different chain) and a cross-chain swap (different asset
*and* chain) — `crypto-backend/src/services/lifiService.js` normalizes the
response into the same `{ transaction, needsApproval, allowanceTarget,
buyAmount }` shape the 0x flow already used, so the frontend signs both the
same way. The chain and token pickers are fully dynamic — adding a chain to
`SUPPORTED_CHAINS` is all it takes for it to show up as a bridge source or
destination.

**Wiring note**: `screens/swap/SwapBridgeScreen.js` is what actually renders
both the Swap and Bridge tabs — `AppNavigator.js` needs to route to
`SwapBridgeScreen`, not straight to `SwapNewSCreen`, or the Bridge tab is
unreachable. Check this hasn't drifted if bridging seems to have disappeared
from the app; it did once during this project.

---

## Token management

Every chain's token catalog comes from the backend's `/api/swap/tokens`
(native + wrapped-native + a curated ERC-20 list per chain, in
`swapControllers.js`) — the same endpoint Swap, Send, and Manage Tokens all
read, cached the same way.

Whether a given token shows up in the *portfolio* is a separate, per-wallet
concern: `tokens` table in the on-device SQLite database, with an
`is_visible` column. `utils/TokenDatabase.js`'s `enableToken`/`disableToken`
write to it (insert-if-missing on enable, since a token from the catalog may
never have been saved locally before); `usePortfolioAssets.js` reads exactly
this table via `getTokensByChain`. Flipping a switch in Manage Tokens
(`screens/wallet/TokensScreen.js`) is instant everywhere else because it's
the same row, not a separate cache to invalidate. A token the user actually
holds a balance of gets auto-enabled the first time it's seen, so a real
holding never silently disappears just because no one toggled it on.

`components/common/ChainBadge.js` is the small chain-logo badge overlaid on
an ERC-20 token's icon (bottom-left) — used consistently across the Home
asset list, Manage Tokens, Import Token, and the Swap/Send token pickers, so
which chain a token belongs to is visible at a glance. It's skipped for
native/gas tokens, since the whole row's icon already *is* the chain logo
there.

---

## Theming

`constants/Theme.js` defines two fixed palettes (`lightTheme`/`darkTheme`) —
white and charcoal (not pure black), both sharing one yellow-green brand
accent for `primary`/buttons/highlights. `contexts/ThemeContext.js` also
supports a full per-user override on top of that default (`AccentColorScreen.js`,
under Settings → Theme Color): pick any accent and any background tint, and
`deriveAccentColors`/`deriveBgColors` derive the full set of dependent shades
(pressed states, muted fills, tinted borders) from that one hex mathematically
rather than needing a designer to hand-pick every variant. Setting no
override falls back to the fixed brand palette — the customization is opt-in
on top of a real default, not a replacement for one.

---

## Promotional banners

A small CMS for the Home screen's dismissible promo strip
(`components/BannerCarousel.js`): title, description, a square image
(displayed at 64×64), optional badge/CTA, one of five display-order slots,
and an active flag. It's Postgres-backed (`banners` table, migration
`003_banners.sql`) — the image lives in the same row as `bytea`
(`image_data`/`image_content_type`, served back out through
`GET /api/banners/image/:id`), which started life as a MongoDB collection
before being moved onto Postgres so the whole API depends on one database.
`server.js` used to still `require("./config/mongodb")` and call
`connectMongoDB()` at startup even after that move — a file that no longer
existed and a dependency (`mongoose`) that was never in `package.json` —
which meant the server failed to boot at all; that dead require has been
removed. Also worth knowing: the banner route mount
(`app.use("/api/banners", ...)`) was missing from `server.js` for a while
before this cleanup, so the fully-built CRUD controller was unreachable —
check it's still there if banners ever seem to stop working again.

Dismissing a banner is a per-device, local decision
(`AsyncStorage`, keyed by banner id) — it doesn't delete the banner, so it
can still show up for other users or reappear if the user reinstalls.

**Managing content**: `crypto-backend/admin/banners.html` is a plain local
HTML file, not a hosted page — open it directly in a browser on the same
machine (or LAN) as the backend. That's deliberate: a hosted/sandboxed page
can't make arbitrary network requests to a private backend, and this tool's
entire job is talking to one. It calls the same CRUD endpoints the app itself
doesn't use (image upload, deletion, reordering); nothing new was added to
the backend for it.

---

## Backend structure

```
crypto-backend/src/
├── controllers/     — request handling per feature (swap, bridge, banners, tokens, market)
├── services/        — the actual external-API/logic layer controllers call into
│                      (lifiService, marketService, swapTrackingService, walletService)
├── routes/          — Express routers, one per feature, mounted in server.js
├── config/          — Postgres pool, static chain/token-list config
├── migrations/      — Postgres schema migrations, run via scripts/migrate.js
├── tokenLists/       — curated ERC-20 lists per chain, used by swapControllers' getTokenList
└── tokens/          — the broader per-chain token catalogs tokenParser.js serves via /api/tokens
```

Two Postgres migration paths exist and are **not** interchangeable:
`scripts/migrate.js` (`npm run migrate:up`/`migrate:down`) runs the real,
numbered migration registry (wallet schema → swap tracking → banners) and is
the one to use. `npm run migrate:up` used to hardcode a target id of `2`,
silently skipping the banners migration (id `3`) — fixed to run every
pending migration by default.

`config/config.js`'s `chains`/`tokenLists` (used by `utils/tokenParser.js` for
the generic `/api/tokens` browsing endpoints) is kept in sync with
`crypto-wallet/constants/Chain.js`'s `SUPPORTED_CHAINS` by hand — if a chain
is added or removed on one side, check the other.
