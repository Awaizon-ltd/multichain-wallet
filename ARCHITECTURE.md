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
- [Advanced Swap](#advanced-swap)
- [Token management](#token-management)
- [Cloud backup (Google Drive)](#cloud-backup)
- [Wallet identity (@username)](#wallet-identity)
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
Arbitrum, Avalanche, Base, plus the Base and Ethereum Sepolia testnets — and
Solana, which lives separately in `constants/nonEvmChain.js` (see below).

**Default networks** are `DEFAULT_NETWORK_IDS` in `Chain.js`: Solana, Base,
Robinhood Chain, Ethereum, in that order. They're what a new wallet starts
with enabled in its portfolio, what every network picker features first, and
the order `ChainContext`'s `networks` list is sorted in.

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

`DEFAULT_CHAIN` is the EVM chain the wallet opens to and treats as primary
(currently Base — the first EVM chain in `DEFAULT_NETWORK_IDS`). `ChainContext.js` resolves it, tracks which chains the user
has enabled for their portfolio (`enabledChainIds`, defaulting to every
mainnet chain), and exposes `toggleNetwork()` for `NetworkManager.js`'s
per-chain switches. Changing the primary chain is a one-line change to
`DEFAULT_CHAIN` — everything downstream (the "Primary" badge in
`ChainSwitcher.js`, the initial active chain) reads that constant rather than
hardcoding a chain id.

### Solana

Solana is not in `SUPPORTED_CHAINS`, on purpose: `activeChain` drives the
dApp browser and ethers signing, so it must always be EVM —
`ChainContext.switchChain` throws for Solana. Instead its id is the string
`"SOLANA"`, and `ChainContext` exposes two lists: `chains` (EVM only, safe
for anything that builds an ethers provider) and `networks` (EVM + Solana,
for the portfolio, network toggles, Receive, and the swap/bridge pickers).
Screens that can act on Solana keep their own local chain choice instead of
switching the global one — `SwapNewSCreen` (`solanaSelected`, plus a
separate receive chain), `AdvancedSwapScreen` (the pair's chains), and
`ReceiveScreen` (the picked asset's chain) — and `ChainSwitcher` takes
`chains`/`selectedChain`/`onSelect` props for that (it's also the picker
behind `ChainSelectorButton` on Swap, Advanced Swap and Discover).

Each account derives a Solana address from the same mnemonic
(`m/44'/501'/{index}'/0'`, Phantom-compatible); only the public address is
stored. `createSolanaSignerForTransaction(pin)` returns a one-time web3.js
`Keypair`, the Solana twin of `createSignerForTransaction`.

Solana talks to the backend through the same endpoints as EVM, with
`chainId=SOLANA`. Swap and bridge transactions come back already built as
base64 versioned transactions (`transaction.chainType === "solana"`);
`SolanaService.signAndSendSerializedTransaction` signs them as-is — never
modifying blockhash, fees or instructions — and refuses any whose fee payer
isn't the user's own address. Confirmation is by polling, not websockets
(flaky in React Native).

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
error that's already in that shape passes through unchanged.

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

**Solana same-chain swaps** go through Jupiter instead of 0x
(`crypto-backend/src/services/jupiterService.js`,
`controllers/solanaSwapController.js`). There's no separate route: the
existing `/api/swap/{tokens,price,price/best,quote}` handlers dispatch to it
when `chainId` is Solana, and its responses reuse 0x's field names
(`buyAmount`, `minBuyAmount`, `estimatedPriceImpact` as a percentage) so
`useSwap` and the swap screen didn't need a second code path. Two things
differ: there is never an approval step, and `/quote` returns Jupiter's
built transaction. Jupiter simulates it while building; if that fails (most
often: not enough SOL for fees + token-account rent) `/quote` returns a 422
with the reason rather than a transaction that would only burn a fee.
`/price/best` doesn't race LI.FI on Solana — LI.FI routes same-chain Solana
swaps through Jupiter anyway. Native SOL is addressed as the wSOL mint
(`So111…112`); Jupiter wraps and unwraps automatically.

**Cross-chain is the same screen.** There is no Bridge tab: each side of a
swap has its own chain (the token pickers have chain chips), and
`hooks/useSwap.js` routes by whether the two chains match — same chain →
`/swap/*` (0x or Jupiter), different → LI.FI's `/bridge/quote`. One LI.FI
quote covers both a bridge (same asset) and a cross-chain swap (different
asset and chain); `crypto-backend/src/services/lifiService.js` normalizes it
to `{ transaction, needsApproval, allowanceTarget, buyAmount }`, and
`useSwap` adds `crossChain: true` and 0x's field names (`minBuyAmount`), so
`components/swap/SwapConfirmModal.js` signs every kind of fill on one path.
Its success step polls `/bridge/status` for cross-chain fills ("On its way" →
"Arrived"), which is why the modal stays open on success rather than closing
itself. Buying a token from its detail page or Markets keeps the user's
current pay chain and buys on the token's own chain — cross-chain if they
differ — instead of switching their network. (This replaced a hardcoded
Ethereum⇄Mantle OP-stack bridge, then a separate LI.FI Bridge tab.)

Solana works in both directions through the same LI.FI flow.
`bridgeController.js` maps the app's ids to LI.FI's (`"SOLANA"` →
`1151111081099710`, and native SOL → `11111111111111111111111111111111`,
LI.FI's address for it — *not* the wSOL mint) and requires an explicit
`toAddress` in the destination VM's format whenever a route crosses between
Solana and EVM, since the sender's address can't receive on the other side.
For Solana-origin routes LI.FI still reports its EVM contract as
`approvalAddress`; `lifiService.normalizeQuote` drops it, because acting on
it would mean "approving" an SPL token to an EVM address.

**Signing chain**: the EVM signer (`createSignerForTransaction`) is bound to
ChainContext's *active* chain. Any screen that pays from an EVM chain must
`switchChain` to it before confirming — the Swap screen does when you pick
the pay chain, Advanced Swap does when you tap Buy/Sell.

---

## Advanced Swap

The second tab (`screens/swap/AdvancedSwapScreen.js`): a pair chart, a
Buy/Sell panel, and market stats. It is not a separate trading engine — the
order panel drives the same `useSwap` and `SwapConfirmModal` as the Swap
tab, so cross-chain pairs trade cross-chain automatically.

**Candles for any pair** come from `crypto-backend/src/services/
pairChartService.js` (`GET /api/market/pair/candles`), on CoinGecko's
on-chain DEX API (GeckoTerminal data). Each token's USD candles are read
from its most-traded pool, and a non-USD pair is the bucket-by-bucket ratio
of the two USD series — so BONK/SOL, or a cross-chain SOL/ETH, works without
any direct pool for that pair existing. Open/close are exact; the synthetic
wicks use the quote's close for the bucket, a close approximation. Pools are
ranked by **24h volume, not liquidity** — reported liquidity is easy to fake
(one "XTX/SOL" pool claimed $1.6B on $1.6M of daily volume, with almost no
candles). `quote=usd` charts against dollars without needing a USDC address
per chain; the screen opens on the active chain's native coin vs USD.

**Stats** (`GET /api/market/onchain/token`): price, market cap, FDV, volume,
top-pool liquidity, holders and top-10 concentration, 24h trades, and risk
flags (mint/freeze authority, honeypot, GeckoTerminal score). Native coins
are looked up through their wrapped token, whose market cap and holders
describe the *wrapper* — so for natives the coin-level numbers come from
CoinGecko's coin data instead and holder/risk fields are dropped.

All of it goes through `marketService`'s shared CoinGecko queue and
stale-on-error cache (exported for this), so it can't push the backend past
its rate budget. A cold pair costs ~4 upstream calls; after that it's cached
(candles 1–15 min by timeframe, token data 2 min, holders 30 min). The
Markets sheet reuses the trending lists — which now include Solana tokens
(`solana` was added to `PLATFORM_TO_CHAIN`).

**The chart** is TradingView Lightweight Charts
(`components/market/TVCandleChart.js`) running in a WebView: candles, volume,
MA7/MA25, pinch-zoom and scroll, crosshair with an OHLC legend. The page it
loads (`tvChartHtml.js`) pulls the library from a CDN build pinned to an
exact version, and takes data over `postMessage` — our own candles, so every
pair the backend can build (relative, cross-chain) charts the same way. A
`seriesKey` (pair + timeframe) tells it when to jump to the latest bars vs.
keep the user's scroll/zoom across the 30s refresh. The licence requires
TradingView attribution; the library's own logo provides it, and its link
opens in the system browser. If the library can't load (offline, CDN
blocked, 10s timeout) it falls back to the SVG `CandleChart.js`.

---

## Token management

Every chain's token catalog comes from the backend's `/api/swap/tokens`
(native + wrapped-native + a curated ERC-20 list per chain, in
`swapControllers.js`) — the same endpoint Swap, Send, and Manage Tokens all
read, cached the same way. Solana's catalog is native SOL plus
`crypto-backend/src/tokens/solana.json` (SPL tokens).

SPL holdings reach the portfolio differently from ERC-20s: they're read
straight from the chain (`getSplTokenBalances`, Token and Token-2022), not
from the on-device `tokens` table, and only mints in that Solana catalog are
shown. Anyone can airdrop any token to a Solana address, so an unlisted mint
is treated as spam rather than shown under a name nobody verified. Prices
are looked up by mint, never by symbol, for the same reason.

Manage Tokens and Receive list **every enabled network** at once through
`hooks/useMultiChainTokens.js`: catalogs load in parallel and each chain
renders the moment its own data lands, so a slow chain never blocks the
rest. Both lists are virtualized (SectionList / FlatList with fixed row
heights; Receive also pages 30 rows at a time), and Receive fetches no
balances at all — receiving doesn't need them.

Whether a given token shows up in the *portfolio* is a separate, per-wallet
concern: `tokens` table in the on-device SQLite database, with an
`is_visible` column. (Solana can't use that table — it lowercases addresses
and stores chain ids as integers — so SPL show/hide choices live in
`utils/splVisibility.js`: held tokens show by default, `hidden` turns one
off, `enabled` shows one at zero balance.) `utils/TokenDatabase.js`'s `enableToken`/`disableToken`
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

## Cloud backup

Optional, passwordless backup of the recovery phrase
(`crypto-wallet/services/cloudBackup.js`), offered at Google sign-up
(WelcomeScreen) and in Settings → Wallet → Cloud Backup.

- **Two stores.** A random 256-bit key in Firestore `backupKeys/{uid}`
  (owner-only, create-once rules in `crypto-wallet/firestore.rules`) and the
  AES-256-GCM ciphertext in Drive's hidden `appDataFolder` (scope
  `drive.appdata` — Rizon can't see the rest of the user's Drive, and the
  file isn't visible in their Drive UI). Neither alone reveals anything.
- **Fast because it isn't a password.** The key is 32 random bytes, so
  there's no KDF to run and nothing to brute-force; encrypt/decrypt are
  sub-millisecond (native AES-GCM via react-native-quick-crypto). The GCM
  tag is bound (AAD) to the Firebase uid, so a backup can't be swapped in
  from another account.
- **The limit, stated plainly in the UI:** whoever controls the Google
  account can reach both stores. That's the price of automatic restore.
- **Restore** happens on Google sign-in: if Drive access was granted and a
  backup exists, it's decrypted and handed to WalletSetupScreen to import
  (the user sets a new PIN). If a backup exists but can't be used, sign-up
  stops instead of silently creating a second wallet.
- The phrase never goes through navigation params (React Navigation state
  is persisted to AsyncStorage) — screens hand off via `takeGoogleSession()`,
  read-once and in memory.

Setup that lives outside the repo: deploy `firestore.rules`, enable Google
sign-in in Firebase Auth, add the Drive API to the Google Cloud project, and
create the iOS OAuth client (`GoogleService.js` still has a placeholder).

---

## Wallet identity

A `@username` people can send to, per wallet account
(`screens/settings/BindingWalletScreen.js`, `services/identity.js`;
backend `services/identityService.js`, `routes/identityRoutes.js`).

- **Proof, not trust.** The backend issues a one-time challenge (username +
  both addresses + nonce + 5-minute expiry, single-use); the app signs that
  exact text with the account's EVM key (EIP-191) *and* its Solana key
  (ed25519), and the backend verifies both before writing the `identities`
  row (migration `005`). No email, no password.
- **Signatures are never saved.** They exist only as locals in the app's
  `proveAndLink()` and in the request handler; the table has no column for
  them, and nothing logs or echoes them.
- **Per account.** The row is username ↔ (EVM address, Solana address) for
  ONE account. Switching accounts shows that account's own status; linking
  it is a separate row with its own username. Re-signing with an
  already-linked account renames it.
- **Lookups** (`/api/identity/*`, and the legacy `/api/wallets/resolve*` the
  Send / payment-request screens use, same response shape) read only
  `identities`. The old `users` table — username + email bound to an EVM
  address with no proof of ownership — is left in place but no longer
  consulted, and `POST /api/wallets/bind` returns 410.
- Challenges are held in memory, so they assume one backend instance; with
  several, move them to Redis/Postgres (they hold no secrets).

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

Solana has a different id at each layer — `"SOLANA"` in the app, LI.FI's
`1151111081099710`, and `501000101` in `tokens/solana.json` — and
`utils/solana.js`'s `isSolanaChainId` accepts all three. Swap tracking stores
Solana swaps under `501000101` (it fits the `INTEGER` `chain_id` column);
migration `004` widens the address/hash columns for base58 addresses and
88-char signatures.

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
